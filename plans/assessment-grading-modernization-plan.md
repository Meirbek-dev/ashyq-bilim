# Assessment, Exam, Code Challenge, and Grading Modernization Plan

## Executive Decision

Rewrite the assessment system around one canonical model, one canonical submission pipeline, one canonical grading ledger, and one canonical teacher/student UX. Do not wrap legacy assignment APIs. Do not port legacy assignment table semantics forward. Remove legacy assignment tables and adapters after a destructive migration verifies that every live gradeable activity is represented by `assessment`, `assessment_item`, `submission`, `grading_entry`, and assessment policies.

This plan treats `Assessment.kind = ASSIGNMENT` as the modern written/work-product assessment kind. It treats all pre-canonical `assignment*` tables, assignment task payloads, and assignment service adapters as legacy and deprecated.

## Current-State Audit

### Canonical Pieces Already Present

- `apps/api/src/db/assessments.py` defines the canonical authoring model: `Assessment`, `AssessmentItem`, typed item bodies, typed item answers, policy patch schemas, attempt projections, and item-level grading schemas.
- `apps/api/src/db/grading/submissions.py` defines one `Submission` table for `QUIZ`, `ASSIGNMENT`, `EXAM`, and `CODE_CHALLENGE`.
- `apps/api/src/db/grading/entries.py` defines an append-only `GradingEntry` ledger.
- `apps/api/src/routers/assessments/unified.py` exposes canonical assessment routes for authoring, lifecycle, drafts, submit, review, item grading, code runs, attempt state, and policy presets.
- `apps/web/src/features/assessments` has a mostly unified shell with per-kind registry modules for assignments, exams, quizzes, and code challenges.

### Integrity Problems

1. There are two grading orchestrators:
   - `apps/api/src/services/grading/submit.py` is still wired into active services and routes.
   - `apps/api/src/services/grading/pipeline/orchestrator.py` claims to replace the old orchestrator but is not the active path.

2. Raw grader output is overwritten:
   - Both `submit.py` and `pipeline/persist.py` assign `result.breakdown` to `submission.grading_json`, then overwrite it with `build_effective_grading_breakdown(...)`.
   - This destroys the immutable grader output required for audit, debugging, and student transparency.

3. Answer validation is not strict enough:
   - `pipeline/validate.py` says only canonical answer format is accepted, but it returns an empty parsed answer set instead of rejecting missing answers.
   - The old orchestrator still accepts compatibility kwargs and legacy-looking extraction paths.

4. XP and pass thresholds are inconsistent:
   - Old submit code checks raw `auto_score >= 50`.
   - Teacher publish checks penalty-adjusted `final_score >= 50`.
   - Progress uses policy `passing_score`, often defaulting to 60.
   - The target rule is XP eligibility based on penalty-adjusted `final_score`.

5. Grade visibility is split:
   - Student visibility can be inferred from `Submission.status == PUBLISHED` in some paths and from published `GradingEntry` rows in others.
   - Modern release semantics should be ledger-driven and policy-aware, not duplicated in route helpers.

6. Legacy assignment artifacts remain:
   - Database migrations still reference `assignment`, `assignmenttask`, `assignment_task`, `assignmentusersubmission`, and `assignmenttasksubmission`.
   - `apps/web/src/services/courses/assignments.ts` is an assignment facade over canonical assessment endpoints.
   - `apps/web/src/schemas/assignmentTaskContents.ts`, assignment task media URL helpers, assignment query keys, and old assignment modals still expose legacy task vocabulary.
   - `apps/api/src/tasks/assignment_scheduler.py` keeps assignment-specific scheduling language.

7. Code challenge runtime is only partially unified:
   - Final submission uses canonical assessment submission, but the editor still contains older code-challenge submission/history shapes and service hooks.
   - Runtime history should come from canonical `submission` and `code_execution_run`, not old `CodeSubmission` abstractions.

## Target Architecture

### Domain Model

Use these as the only production assessment tables:

- `assessment`: one row per gradeable activity.
- `assessment_item`: ordered authored items with typed bodies.
- `assessment_policy`: availability, attempt, release, late, anti-cheat, and grading policy.
- `student_policy_override`: per-student policy exceptions.
- `submission`: one row per student attempt.
- `grading_entry`: append-only grading ledger.
- `code_execution_run`: all visible, custom, and final code executions.
- `activity_progress` and `course_progress`: projections, never grade sources of truth.
- `audit_event`: immutable operational events.

Remove these legacy tables entirely:

- `assignment`
- `assignmenttask`
- `assignment_task`
- `assignmentusersubmission`
- `assignmenttasksubmission`
- `quiz_attempt`
- `exam_attempt`
- `question`
- `code_submission`

The migration must fail loudly if a legacy table still contains live-only data not represented in canonical tables. It must not backfill, wrap, or port old assignment rows. The canonical data must already exist before deletion.

### Grading Records

Persist both raw and effective grading state.

- `submission.raw_grading_json`: immutable output directly from the grader for this attempt.
- `submission.grading_json`: current effective state used by teacher UI and student release views.
- `grading_entry.raw_breakdown`: immutable raw grader output at the time of this grading event.
- `grading_entry.effective_breakdown`: effective/manual-overlay breakdown at the time of this grading event.
- `grading_entry.raw_score`: pre-penalty raw score.
- `grading_entry.final_score`: penalty-adjusted final score.
- `grading_entry.penalty_pct`: late or policy penalty snapshot.

Keep `grading_json` as an alias only if needed during one schema release, but the final model should name the field `effective_grading_json` in API contracts.

### Submission Pipeline

Replace both current orchestrators with one pipeline:

1. Load assessment, activity, course, policy, and student override.
2. Authorize the action.
3. Resolve attempt state from server-side state only.
4. Validate canonical answer payload against `AssessmentItem` definitions.
5. Enforce lifecycle, availability, attempt, due date, late, time, and anti-cheat rules.
6. For code items, execute final hidden tests server-side through `code_execution_run`.
7. Grade with typed item graders only.
8. Apply penalties and compute final score.
9. Persist `submission`, raw/effective breakdowns, `grading_entry`, progress projections, and audit events in one transaction.
10. Emit side effects after commit.

Delete:

- `apps/api/src/services/grading/submit.py`
- `apps/api/src/services/grading/grader.py` compatibility facade
- legacy kwargs in grading functions
- legacy answer extraction paths
- student-facing `/grading/start/v2/{activity_id}` and `/grading/submit/{activity_id}` once web callers are moved to `/assessments/{assessment_uuid}/...`

### Canonical Answer Contract

Only accept:

```json
{
  "answers": [
    {
      "item_uuid": "item_...",
      "answer": {
        "kind": "CHOICE"
      }
    }
  ]
}
```

or the equivalent `answers` object keyed by item UUID if the API explicitly keeps that variant. All answers must validate against the item kind. Unknown item UUIDs, missing required items, mismatched answer kinds, malformed answer bodies, and empty submissions must return structured 422 errors.

Do not accept:

- `submitted_answers`
- `questions`
- `user_answers`
- `test_results` supplied by client for final grading
- `tasks`
- `assignmentTaskSubmission`
- `quiz_answers`
- raw code test results from the client

### Grader Registry

Keep a typed registry, but remove backward-compatible graders.

- `CHOICE`: exact and partial-credit scoring.
- `MATCHING`: pair scoring.
- `OPEN_TEXT`: manual review required.
- `FILE_UPLOAD`: manual review required.
- `FORM`: manual review or rubric-based grading only.
- `CODE`: server-run tests only; visible tests never determine final grade.

Assignments are not a grader. They are a container kind that delegates to item graders and returns `PENDING` when any item requires manual review.

### Grade Release

Use the ledger as the release source of truth.

- Draft teacher grades have `grading_entry.published_at = NULL`.
- Published grades have `grading_entry.published_at IS NOT NULL`.
- Student result visibility reads the latest published ledger entry.
- `Submission.status` is workflow state, not the release authority.
- `RETURNED` should carry a release state of `RETURNED_FOR_REVISION` with explicit revision action and teacher feedback.

### XP and Completion

XP eligibility must use penalty-adjusted `final_score`, not raw `auto_score`.

- Award XP only after a grade is published or an auto-graded immediate-release entry is created.
- Use `final_score >= assessment_policy.passing_score` for pass/fail where policy exists.
- If product wants a global gamification threshold, store it as explicit gamification policy, not hard-coded `50`.
- Make XP side effects idempotent by `submission_uuid`.

## Legacy Assignment Deletion Plan

### Deprecated Inventory

Remove these backend concerns:

- Legacy `assignment` and task table dependencies in migrations after the final deletion migration lands.
- `apps/api/src/tasks/assignment_scheduler.py`; replace with assessment lifecycle scheduler.
- Assignment-specific upload path builders in `apps/api/src/services/courses/activities/uploads/tasks_ref_files.py`.
- Any service or analytics naming that treats `assignment` as a separate table-backed entity.
- Assignment-specific RBAC resources if `assessment:*` permissions fully replace them.

Remove these frontend concerns:

- `apps/web/src/services/courses/assignments.ts`
- `apps/web/src/schemas/assignmentTaskContents.ts`
- `queryKeys.assignments`
- old assignment creation and edit modals that call assignment facades
- media helpers with `/assignments/{assignmentUUID}/tasks/{assignmentTaskUUID}`
- compatibility exports in `apps/web/src/types/grading.ts` for assignment task answers

### Destructive Migration

Create one final migration named for deletion, not modernization.

Migration behavior:

1. Assert every `TYPE_ASSIGNMENT`, `TYPE_EXAM`, `TYPE_CODE_CHALLENGE`, and `TYPE_QUIZ` activity has exactly one canonical `assessment`.
2. Assert every non-draft legacy submission table row either no longer exists or has a matching canonical `submission`.
3. Assert no application foreign key still points to a legacy table.
4. Drop legacy tables with `CASCADE` only after assertions pass.
5. Drop legacy indexes, sequences, permissions, and scheduler columns.
6. Remove `legacy_*` keys from JSON payloads.
7. Prevent downgrade recreation of legacy assignment tables in production migrations.

No wrapping, compatibility views, shadow tables, or read-through adapters.

## Teacher UX Rewrite

### Current Problems

- The review workspace mixes activity-id and assessment-uuid APIs.
- Overall-score grading is still present as a fallback UI even though comments claim it is removed.
- Release state explanations are scattered.
- Batch publish and per-submission publish are separate mental models.
- Raw auto result and teacher-effective result are not clearly separated.

### Target Teacher Workflow

1. Teacher opens an assessment review workspace by `assessment_uuid`.
2. Header shows backlog, release mode, due state, late count, average final score, and policy warnings.
3. Left rail is a fast, searchable review queue with filters: Needs review, Ready to publish, Published, Returned, Late, Flagged.
4. Center panel shows submitted work, raw auto-grading result, item evidence, file/code previews, and attempt history.
5. Right panel is an item-by-item grading surface:
   - per-item score bounded by item max score
   - rubric criteria
   - reusable feedback snippets
   - raw score vs adjusted final score
   - late penalty explanation
   - override score requires reason
6. Actions are Save draft, Publish, Return for revision, Publish batch, Extend deadline, Export.
7. Conflicts show side-by-side server version and local draft.
8. Publishing creates a ledger entry and release event; it does not mutate hidden grade state ad hoc.

## Student UX Rewrite

### Current Problems

- Assignment, exam, and code challenge attempts use similar but separate local persistence patterns.
- Code challenges auto-start drafts and use old history abstractions.
- Result visibility depends on mixed submission and ledger logic.
- Recovery, conflict, timer, and anti-cheat flows are distributed across kind modules.

### Target Student Workflow

1. Student opens one assessment attempt shell.
2. Server attempt projection determines the primary action: Start, Continue, Submit, Wait for release, View result, Start revision.
3. All kinds share:
   - autosave
   - conflict handling
   - recovery
   - online/offline warning
   - timer
   - anti-cheat
   - submit confirmation
   - attempt history
4. Per-kind content renders only item interaction, not lifecycle logic.
5. Code challenge run buttons execute visible/custom tests only; final submit always runs hidden tests server-side.
6. Results page separates:
   - final score
   - late/attempt penalties
   - raw automated result
   - teacher-adjusted result
   - teacher feedback
   - revision instructions when returned

## API Contract Rewrite

Keep only assessment-scoped routes:

- `POST /assessments`
- `GET /assessments/{assessment_uuid}`
- `PATCH /assessments/{assessment_uuid}`
- `POST /assessments/{assessment_uuid}/lifecycle`
- `GET /assessments/{assessment_uuid}/attempt-state`
- `POST /assessments/{assessment_uuid}/start`
- `PATCH /assessments/{assessment_uuid}/draft`
- `POST /assessments/{assessment_uuid}/submit`
- `GET /assessments/{assessment_uuid}/me`
- `GET /assessments/{assessment_uuid}/submissions`
- `GET /assessments/{assessment_uuid}/submissions/{submission_uuid}`
- `PATCH /assessments/{assessment_uuid}/submissions/{submission_uuid}/grade`
- `POST /assessments/{assessment_uuid}/publish-grades`
- `POST /assessments/{assessment_uuid}/items/{item_uuid}/runs`

Delete or block new use of:

- activity-id grading submit routes
- assignment facade routes
- legacy quiz/exam/code submission routes
- client-provided final code result routes

## Analytics and Gradebook Rewrite

Analytics must read canonical tables only.

- Replace assignment-specific analytics row names with assessment rows.
- Build gradebook cells from latest effective grade state and latest published ledger state.
- SLO dashboards should group by assessment kind, not legacy source table.
- Migration status should be removed after deletion. A system that has deleted legacy tables should not display `compatibility_mode`.
- Exports must include both raw and final score columns.

## Testing Strategy

Backend tests:

- canonical payload validation rejects all legacy shapes
- raw and effective grading are both persisted
- code final submit ignores client-provided test results
- late penalty affects final score and XP eligibility
- grade release visibility is ledger-driven
- returned submissions create revision drafts without mutating original history
- destructive migration fails on unmigrated legacy data
- progress uses policy passing score

Frontend tests:

- one attempt shell contract across assignment, exam, and code challenge
- teacher review queue uses assessment UUID only
- conflict recovery for student drafts and teacher grading
- publish preview uses ledger-ready submissions only
- code challenge visible run does not mark final grade
- result view shows raw vs effective grade when both exist

End-to-end tests:

- teacher authors each assessment kind, publishes, student submits, teacher grades, student views result
- batch release mode hides scores until publish
- late submission penalty changes final score and XP eligibility
- code runner degraded state preserves draft and lets student retry

## Rewrite Sequence

1. Freeze new legacy assignment usage.
2. Add raw/effective grading fields and ledger columns.
3. Replace active submit path with one canonical pipeline.
4. Delete compatibility grader facade and legacy answer inputs.
5. Move all frontend calls to assessment-scoped APIs.
6. Replace assignment service adapters with native assessment services.
7. Rewrite teacher review workspace around assessment UUID and raw/effective grading.
8. Rewrite code challenge editor history around canonical submissions and code runs.
9. Rewrite analytics and gradebook to canonical assessment tables.
10. Run destructive legacy deletion migration.
11. Remove generated OpenAPI remnants, tests, query keys, messages, and docs that mention legacy assignment tables or compatibility mode.

## Acceptance Criteria

- No runtime imports reference `services/courses/assignments.ts`.
- No API route writes to or reads from legacy assignment tables.
- No database table named `assignment`, `assignmenttask`, `assignment_task`, `assignmentusersubmission`, or `assignmenttasksubmission` exists.
- No final grading path accepts `tasks`, `submitted_answers`, `user_answers`, client `test_results`, or legacy question payloads.
- Every graded submission stores raw and effective grading JSON.
- Every published grade has a published `grading_entry`.
- Student-visible grade state is reproducible from ledger rows.
- XP awards are based on penalty-adjusted final score and are idempotent.
- Teacher and student flows use one assessment shell and one assessment-scoped API family.
