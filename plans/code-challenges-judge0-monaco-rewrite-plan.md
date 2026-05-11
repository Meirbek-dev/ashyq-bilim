# Code Challenges Judge0 + Monaco Rewrite Plan

Date: 2026-05-11  
Scope: backend runner, canonical assessment integration, teacher authoring, student IDE, grading/review, migration, tests, operations.

## Executive Diagnosis

The current code-challenge feature is close enough to be tempting, but not close enough to be trusted. It has a canonical `CODE` item shape, a Judge0 dependency, a Monaco editor, teacher settings, visible and hidden tests, and a shared assessment shell. The problem is that these pieces do not yet form one reliable product contract.

The highest-risk issue is grading correctness. Visible runs are persisted into draft metadata, while the code grader reads `answer.latest_run`. The current submit path sends only `{ kind: "CODE", language, source }`, so final scoring can miss the actual run result or fall back to manual review/zero unless another path enriches the answer. Hidden tests also are not executed as a first-class final grading step.

The second major issue is runner architecture. `apps/api/src/services/code_challenges/judge0.py` uses raw `httpx` and `wait=true`. Judge0's own docs say `wait=true` does not scale well. The official `judge0-python` SDK already gives the right primitives: `Submission`, `TestCase`, batch creation, base64-safe requests, status polling, and language/config discovery. The rewrite should put those primitives behind a production job model instead of making FastAPI requests block on Judge0 execution.

The third issue is product coherence. The frontend has a legacy-looking `components/features/courses/code-challenges` editor used by a newer assessment registry wrapper. Settings are duplicated between `activity.settings`, policy `settings_json`, and `AssessmentItem.body`. Language lists are hardcoded. Monaco is loaded from jsDelivr. The result is a feature that can work in demos but is fragile under real classrooms, Unicode code, slow runners, retries, hidden tests, and teacher edits.

## Evidence Reviewed

- `apps/api/src/services/code_challenges/judge0.py`: raw `httpx`, `wait=true`, unused idempotency key.
- `apps/api/src/services/assessments/core.py`: `run_code_item` executes visible tests and stores latest run in draft metadata.
- `apps/api/src/db/assessments.py`: canonical `CodeTestCase`, `CodeItemBody`, `CodeRunRequest`, and `CodeRunResponse`.
- `apps/api/src/services/grading/code_grader.py`: canonical grading reads `answer.latest_run`.
- `apps/api/src/services/assessments/settings.py`: code settings duplicate item body data.
- `apps/web/src/components/features/courses/code-challenges/*`: Monaco editor, hardcoded languages, student IDE UI.
- `apps/web/src/features/assessments/registry/code-challenge/*`: teacher studio and assessment attempt wrapper.
- `apps/web/src/services/courses/code-challenges.ts`: compatibility mapping, base64 decode workaround, run and submit client services.
- `judge0/docs/api/submissions/create_a_submission.md`: `wait=true` exists but is explicitly discouraged for scale.
- `judge0-python/README.md` and `judge0-python/src/judge0/*`: official SDK primitives for clients, submissions, test cases, batches, polling, statuses, config, and languages.
- `monaco-editor/docs/integrate-esm.md`: ESM integration and worker configuration requirements.

## Non-Negotiable Principles

1. The backend owns all execution, hidden tests, final scoring, attempt limits, result visibility, and grade release.
2. The frontend never sends test results as truth. It sends source code, language, and optional custom stdin.
3. Judge0 is an infrastructure dependency behind a typed runner service, not a detail spread through routes.
4. Visible runs are practice feedback. Final submission runs visible plus hidden tests server-side and produces the grade.
5. Every run is idempotent, auditable, rate-limited, and safe to retry.
6. Hidden test inputs, expected outputs, and raw hidden stdout are never present in student payloads.
7. Monaco is a local client-only component with explicit worker handling, not a CDN-loaded editor.
8. Code challenge is one canonical assessment kind using the shared draft/save/submit/review workflow.

## Target Architecture

### Backend Runtime

Create a new runner module, for example `apps/api/src/services/code_execution/`, with these responsibilities:

- `Judge0SdkClientFactory`
  - Creates `judge0.Client(endpoint=settings.integrations.judge0.base_url, headers=...)` for self-hosted Judge0.
  - Uses `X-Auth-Token` only if auth is configured.
  - Caches `/languages`, `/statuses`, and `/config_info` with short TTLs.
  - Verifies startup health without failing the whole API when Judge0 is degraded.

- `CodeRunService`
  - Accepts source, language, purpose, assessment item, custom stdin, and idempotency key.
  - Validates allowed language, source size, stdin size, test count, time/memory limits, and custom-input policy.
  - Creates a durable run record before calling Judge0.
  - Uses `judge0.Submission` and `judge0.create_submissions` for batches.
  - Polls with `judge0.get_submissions` or `judge0.wait` in a worker/thread boundary, not directly on the FastAPI event loop.
  - Normalizes Judge0 statuses into the product statuses: `QUEUED`, `RUNNING`, `ACCEPTED`, `WRONG_ANSWER`, `COMPILE_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT`, `INTERNAL_ERROR`, `DEGRADED`.

- `CodeGradingService`
  - Runs final submission against all tests server-side.
  - Scores by weighted test cases.
  - Produces a canonical grading breakdown and stores a final run snapshot on the submission.
  - Never trusts `latest_run` supplied by the client.

### Data Model

Keep `CodeItemBody` as the canonical authored challenge body, but strengthen it:

- `prompt`: problem statement.
- `input_spec` and `output_spec`: structured teacher-authored instructions.
- `constraints`: list of short constraints.
- `languages`: allowed Judge0 language IDs.
- `starter_code`: map of language ID to source.
- `reference_solutions`: teacher-only map of language ID to source, encrypted or protected by permissions if needed.
- `tests`: single ordered list with `id`, `input`, `expected_output`, `is_visible`, `weight`, `description`, and optional `match_mode`.
- `time_limit_seconds`, `memory_limit_mb`, `max_output_kb`.
- `scoring_strategy`: `PARTIAL_CREDIT`, `ALL_OR_NOTHING`, `BEST_SUBMISSION`, `LATEST_SUBMISSION`.

Add durable run storage instead of relying only on draft metadata:

- `CodeRun`
  - `run_uuid`, `assessment_uuid`, `item_uuid`, `submission_uuid`, `user_id`.
  - `purpose`: `CUSTOM`, `VISIBLE`, `FINAL`, `REFERENCE_CHECK`.
  - `status`, `language_id`, `source_sha256`, `stdin_sha256`.
  - `idempotency_key`, unique per user/item/purpose/key.
  - `passed`, `total`, `score`, `started_at`, `finished_at`, `error_code`, `error_message`.

- `CodeRunCase`
  - `run_uuid`, `test_id`, `judge0_token`, `is_visible`.
  - `status_id`, `status_description`, `passed`.
  - `stdout`, `stderr`, `compile_output`, `message`.
  - `time_seconds`, `memory_kb`.
  - For hidden tests, student serializers expose only pass/fail, time, memory, and safe message.

If a new table is too large for the first slice, use one JSONB `code_runs` table first, but keep the service API table-shaped so it can migrate cleanly.

### API Contract

Use canonical assessment routes:

- `GET /api/v1/code-execution/languages`
  - Returns active Judge0 languages from the SDK cache with Monaco language IDs and support flags.

- `POST /api/v1/assessments/{assessment_uuid}/items/{item_uuid}/runs`
  - Purpose: visible tests or custom stdin.
  - Returns `run_uuid`, initial status, and already-completed result when the run finishes within a short server timeout.

- `GET /api/v1/assessments/{assessment_uuid}/items/{item_uuid}/runs/{run_uuid}`
  - Returns current run status and student-safe results.

- `POST /api/v1/assessments/{assessment_uuid}/submit`
  - For code challenges, accepts source/language in the canonical answer.
  - Creates or reuses a final `CodeRun`.
  - Marks submission `PENDING`/`PENDING_JUDGE0` while Judge0 runs.
  - Worker updates `auto_score`, `grading_json`, `metadata_json.final_code_run`, progress rows, XP, and release state.

Important behavior:

- Custom runs use only `stdin`; they are not scored.
- Visible runs expose expected output and actual output for visible tests.
- Final runs include hidden tests but student payload masks hidden expected/actual content.
- Idempotency keys are enforced server-side. Same key returns the same run.
- Runner outage returns `DEGRADED` and `is_retryable=true`; it does not corrupt the draft or consume a final attempt unless final execution actually started.

## Backend Rewrite Plan

### Phase 1: Fix the Contract Before UI Polish

1. Replace raw `httpx` Judge0 adapter with an SDK-backed adapter.
   - Use `judge0.Client` for self-hosted Judge0.
   - Use `judge0.Submission`, `judge0.TestCase`, `judge0.create_submissions`, `judge0.get_submissions`, and status enums.
   - Remove API-level `wait=true`.
   - Keep one thin compatibility function only until callers are migrated.

2. Correct settings access.
   - Current config has `settings.integrations.judge0.base_url`; the adapter looks for `settings.judge0_base_url`.
   - Make one typed settings accessor for base URL, auth token, timeout, polling interval, and max concurrent runs.

3. Introduce server-side idempotency.
   - Store `idempotency_key`.
   - Reject key reuse with different source/language/test purpose.
   - Return the existing run for duplicate retries.

4. Make final grading server-owned.
   - On final submit, run visible and hidden tests.
   - Store final run result on the submission.
   - Feed the grading registry from the stored final run, not from client-provided `latest_run`.

5. Normalize output comparison.
   - Support exact match first.
   - Add optional modes later: trim trailing whitespace, ignore final newline, regex, JSON semantic compare.
   - Store raw output for teacher review, but display normalized diff to students.

### Phase 2: Durable Runner Jobs

1. Add `CodeRun` and `CodeRunCase` persistence.
2. Add a worker path.
   - If the app already has a background task system, use it.
   - Otherwise, start with an internal async queue plus DB polling, then move to Redis/RQ/Celery/Arq.
3. Add queue state and cancellation semantics.
4. Add runner rate limits.
   - Per student per item for visible/custom runs.
   - Per class/course aggregate guardrail.
   - Separate stricter limits for final submit.
5. Add cleanup/retention policy for raw stdout/stderr and old custom runs.

### Phase 3: Canonical Settings Cleanup

1. Make `AssessmentItem.body` the source of truth for code challenge content.
2. Keep policy-only data in `AssessmentPolicy`.
3. Stop duplicating tests/languages/starter code in policy `settings_json`.
4. Keep `activity.settings` as a compatibility projection only while migration completes.
5. Add readiness checks:
   - At least one allowed active language.
   - Starter code exists for each required language or teacher accepts blank starter.
   - At least one visible test and one hidden test for graded challenges.
   - All tests have expected output.
   - Weights are positive.
   - Time/memory limits fit Judge0 config bounds.
   - Reference solution passes all tests before publish.

## Frontend Rewrite Plan

### Monaco Integration

1. Remove CDN loader config from `CodeEditor.tsx`.
2. Use the installed `monaco-editor` package through `@monaco-editor/react` or direct ESM.
3. Configure Monaco workers explicitly for Next.js.
4. Keep the editor client-only with `next/dynamic`.
5. Use backend-provided language metadata:
   - Judge0 language ID.
   - Display name.
   - Monaco language ID.
   - Archived/disabled state.
6. Preserve per-language source buffers.
   - Switching Python to Java and back should not lose Python code.
7. Preserve editor view state per language.
8. Add code-size and stdin-size client hints, but enforce limits on the backend.
9. Add useful editor commands:
   - Run visible tests.
   - Run custom input.
   - Submit.
   - Reset to starter code.
   - Format only when Monaco supports the selected language.

### Student IDE UX

Build one dense, work-focused attempt surface:

- Left panel: problem statement, examples, constraints, visible tests, due/timer/attempt state.
- Center panel: Monaco editor with language selector, save state, and source status.
- Bottom or right panel: tabs for visible results, custom input/output, submission history, and final result.
- Sticky action area: Run, Submit, Save Draft, Reset Starter.

Student result states:

- `Not started`: show availability, due date, attempts, timer, and allowed languages.
- `Draft`: autosave source, show local recovery if needed.
- `Running`: show per-test queued/running/completed states.
- `Compile error`: show compile output once, not repeated per test.
- `Runtime/time limit`: show failing test and safe message.
- `Wrong answer`: show visible diff with whitespace controls.
- `Submitted, grading`: final hidden run in progress.
- `Graded but hidden`: score masked until release.
- `Published`: show visible result and teacher feedback.
- `Returned`: preserve old attempt and start revision cleanly.
- `Runner degraded`: keep draft, retry without consuming attempt.

### Teacher Studio UX

Replace the current form stack with a code-challenge studio:

- Header: title, lifecycle, readiness, save state, preview, publish/schedule.
- Left outline: problem, languages, starter code, tests, scoring, hints, integrity.
- Main editor: selected section.
- Right inspector: readiness issues, publish blockers, reference solution run, Judge0 health.

Authoring sections:

- Problem statement with input/output specs and examples.
- Language policy from live Judge0 languages.
- Starter code tabs using Monaco, not textarea.
- Test matrix:
  - Visible and hidden grouped in one table.
  - Weight, description, input, expected output.
  - Duplicate/reorder/import/export tests.
  - Bulk paste examples.
- Reference solution:
  - Teacher-only Monaco tabs.
  - Run all tests before publish.
  - Show which tests fail and why.
- Scoring:
  - Weighted partial credit.
  - All-or-nothing.
  - Latest vs best final submission, if multiple final attempts are allowed.
- Release preview:
  - What students see before submit.
  - What students see after submit before grade release.
  - What students see after publish.

Teacher review:

- Submission list with language, score, run status, time, memory, submitted time, attempt number.
- Code viewer with Monaco read-only diff against starter/reference.
- Test result matrix with visible and hidden tests for teachers.
- Manual override requires reason and audit entry.
- Export submissions and test results.

## Migration Plan

1. Inventory existing code challenge activities and assessments.
2. For each challenge, create or update exactly one canonical `AssessmentItem` with `body.kind = "CODE"`.
3. Merge `visible_tests` and `hidden_tests` into one `body.tests` list with `is_visible`.
4. Move language, starter code, time limit, memory limit, and points into item body/max score.
5. Keep grading strategy and due/release policy in policy records.
6. Decode legacy base64-looking source only for old client payloads; stop generating new base64 payloads from the frontend.
7. Preserve historical submissions as read-only legacy records if their result shape cannot be reconstructed.
8. Add a migration report:
   - migrated count.
   - challenges missing tests.
   - challenges with no hidden tests.
   - unsupported language IDs.
   - malformed test cases.

## Production Workflow

### Development

- Backend tests run with a mocked `judge0.Client`.
- Integration tests run against local `judge0-server` from `docker-compose.yml`.
- Frontend tests mock run polling with deterministic state transitions.
- E2E tests cover teacher authoring, publish readiness, student run, final submit, hidden test masking, and teacher review.

### Operations

Metrics:

- Judge0 health and config version.
- Queue depth.
- Run latency by language.
- Compile/runtime/time-limit rates.
- Internal/degraded error rate.
- Per-user run rate.
- Final grading completion latency.

Alerts:

- Judge0 unreachable.
- Queue depth above classroom threshold.
- Final grading stuck.
- Hidden test leakage assertion failure.
- Language cache empty.

Runbook:

- How to disable custom runs.
- How to pause final submissions safely.
- How to requeue final grading.
- How to inspect a run by `run_uuid`.
- How to rotate Judge0 auth token.

## Test Plan

Backend:

- SDK adapter unit tests with fake `judge0.Client`.
- Language cache tests.
- Idempotency tests.
- Visible run tests.
- Custom input tests.
- Final hidden grading tests.
- Unicode source/stdin/stdout tests.
- Compile error, runtime error, timeout, internal error tests.
- Hidden output masking tests.
- Rate limit tests.
- Assessment policy and attempt-limit tests.

Frontend:

- Monaco loads without CDN.
- Language switching preserves buffers.
- Run and submit buttons respect query/run states.
- Polling stops after terminal status.
- Visible result diff renders correctly.
- Hidden results are not rendered for students even if unexpected fields are absent.
- Teacher test editor preserves IDs and visibility.
- Reference solution readiness gates publish.

E2E:

- Teacher creates code challenge, adds tests, runs reference solution, publishes.
- Student starts, writes wrong answer, sees visible failure.
- Student fixes, submits, hidden tests grade final result.
- Student cannot see hidden test expected output.
- Teacher reviews code and hidden test matrix.
- Runner degraded path keeps draft and allows retry.

## Rollout Plan

1. Build SDK adapter behind a feature flag.
2. Add durable run API while keeping current UI wired to old service.
3. Migrate student run buttons to the new run API.
4. Migrate final submit to server-owned final Judge0 run.
5. Migrate teacher studio to canonical item body only.
6. Remove hardcoded language lists after live language endpoint is stable.
7. Remove CDN Monaco config.
8. Run data migration.
9. Enable for one internal course.
10. Enable for new code challenges.
11. Backfill old challenges.
12. Delete compatibility paths after telemetry shows no use.

## Implementation Order

1. Backend SDK adapter and config fix.
2. Run persistence and idempotency.
3. Visible/custom run endpoints with polling.
4. Final submit hidden-test grading.
5. Student-safe serializers.
6. Language endpoint and frontend language model.
7. Monaco local loading and editor state model.
8. Student IDE rewrite.
9. Teacher studio rewrite.
10. Teacher review result matrix.
11. Migration command.
12. Load tests and production runbook.

## Definition of Done

- A student can run visible tests without consuming an attempt.
- A student can submit once and the backend runs hidden tests server-side.
- Final score is derived from server-stored final run results.
- Hidden test inputs, expected outputs, and actual outputs are never present in student responses.
- Monaco loads locally, without jsDelivr.
- Allowed languages come from Judge0 discovery, not a hardcoded frontend array.
- Teacher can verify a reference solution before publishing.
- Runner failures are retryable and observable.
- Tests cover compile error, runtime error, timeout, wrong answer, accepted, hidden masking, Unicode, and idempotent retry.
- Old code-challenge settings migrate into canonical `CODE` items.
- The legacy raw `httpx` Judge0 path and frontend base64 workaround are removed.
