# Assessment & Grading System Modernization — Task List

This plan executes the design in dependency order. Each task is self-contained, names the files it touches, and lists the property-based tests (PBTs) that must pass. Parent tasks auto-complete when all required children finish.

---

## 1. Phase 0 — Database Migration & Schema Changes

- [ ] 1.1 Add new columns and tables in a single Alembic revision
  - Touches: `apps/api/alembic/versions/XXXXXXXX_assessment_modernization_phase0.py` (new)
  - Adds: `assessment.inline_parent_activity_id`, `assessment.is_inline`, `submission.draft_version`, `audit_event` table with its indexes, `idx_submission_search`, `idx_assessment_inline_parent`
  - PBT: for any migration up/down cycle on a populated DB, row counts and UUIDs remain stable
  - Depends on: —

- [ ] 1.2 Back-fill legacy `BLOCK_QUIZ` rows into canonical Assessment/AssessmentItem/AssessmentPolicy
  - Touches: same Alembic revision (as a data migration step)
  - Maps `Block.content.questions` entries to `AssessmentItem(kind=CHOICE|MATCHING)`, creates a `QUIZ` Assessment with `is_inline=true` and `inline_parent_activity_id=block.activity_id`, writes `block.content.inline_assessment_uuid` for frontend pickup
  - PBT: every legacy block with `>0` questions yields an Assessment with the same number of items and identical correct-answer sets
  - Depends on: 1.1

- [ ] 1.3 Strip `legacy_*` keys from `submission.metadata_json` and drop orphaned legacy tables
  - Touches: same Alembic revision
  - `DROP TABLE IF EXISTS exam_attempt, quiz_attempt, code_submission, assignmenttask, assignmenttasksubmission`
  - Removes `legacy_code_submission_id`, `legacy_plagiarism_score`, `legacy_assignment_type`, `legacy_task_submission_uuid` from every submission row
  - PBT: after migration no submission row contains any key prefixed `legacy_`
  - Depends on: 1.1

- [ ] 1.4 Add SQLModel definitions for new fields and `AuditEvent`
  - Touches: `apps/api/src/db/assessments.py`, `apps/api/src/db/grading/submissions.py`, `apps/api/src/db/audit.py` (new), `apps/api/src/db/__init__.py`
  - PBT: `AuditEvent` instances round-trip through Pydantic serialization without loss
  - Depends on: 1.1

---

## 2. Phase 1 — Grading Pipeline Decomposition

- [ ] 2.1 Introduce `GradingContext` dataclass and typed `PenaltyResult`/`EffectivePolicy`
  - Touches: `apps/api/src/services/grading/pipeline/__init__.py` (new), `apps/api/src/services/grading/pipeline/context.py` (new)
  - PBT: building a `GradingContext` with arbitrary valid inputs preserves all fields under round-trip
  - Depends on: —

- [ ] 2.2 Move `LatePolicy.apply` onto the discriminated-union classes
  - Touches: `apps/api/src/db/grading/progress.py`
  - PBT: for every `LatePolicy` variant and any `(submitted_at, due_at)` pair, the returned percentage is in [0, 100]
  - PBT: `LatePolicyPenalty.apply` is monotone non-decreasing in `submitted_at - due_at` up to `max_days`
  - Depends on: 2.1

- [ ] 2.3 Extract `validate.py` pipeline stage
  - Touches: `apps/api/src/services/grading/pipeline/validate.py` (new)
  - Moves `_parse_answers` / `_extract_canonical_answers` here; deletes the legacy `exam_answers` branch
  - PBT: any payload with valid canonical answers parses identically across 1000 random permutations
  - Depends on: 2.1

- [ ] 2.4 Extract `enforce.py` pipeline stage
  - Touches: `apps/api/src/services/grading/pipeline/enforce.py` (new)
  - Moves `_enforce_attempt_limit`, `_enforce_time_limit`, `_check_violations`, and the new `resolve_effective_policy`
  - PBT: `enforce_attempt_limit` raises iff `attempt_count >= effective.max_attempts`, never off-by-one
  - PBT: `enforce_time_limit` never raises when `elapsed <= time_limit + grace`
  - Depends on: 2.1, 2.2

- [ ] 2.5 Extract `grade.py` pipeline stage and migrate graders to `GradingContext`
  - Touches: `apps/api/src/services/grading/pipeline/grade.py` (new), `apps/api/src/services/grading/registry.py`, `apps/api/src/services/grading/quiz_grader.py`, `apps/api/src/services/grading/exam_grader.py`, `apps/api/src/services/grading/code_grader.py`
  - Removes `**kwargs` from `BaseGrader.grade` signature; every grader takes `GradingContext`
  - Removes legacy answer-field aliases in `quiz_grader.py` (`selected_option_id`, `selected_options`, `selected_options_id`, `answer_id`, `selected_option`); only `selected_option_ids` remains
  - PBT: `QuizGrader` score is invariant under answer-entry reordering
  - PBT: `CodeChallengeGrader` with `ALL_OR_NOTHING` returns 0 or 100 only
  - Depends on: 2.1, 2.3

- [ ] 2.6 Extract `penalize.py` pipeline stage
  - Touches: `apps/api/src/services/grading/pipeline/penalize.py` (new)
  - Combines attempt-penalty and late-penalty into a single `PenaltyResult`
  - PBT: `apply_penalties` with `waive_late_penalty=True` always returns `late_penalty_pct == 0`
  - PBT: `final_score` is always in `[0, auto_score]`
  - Depends on: 2.2, 2.5

- [ ] 2.7 Extract `persist.py` and `emit.py` stages
  - Touches: `apps/api/src/services/grading/pipeline/persist.py` (new), `apps/api/src/services/grading/pipeline/emit.py` (new)
  - `persist` handles Submission + GradingEntry + ActivityProgress in one transaction; `emit` publishes events after commit
  - PBT: after `persist`, the committed submission's `final_score` equals `PenaltyResult.final_score` and a `GradingEntry` exists iff not `needs_manual_review`
  - Depends on: 2.6

- [ ] 2.8 Rewrite `submit_assessment` orchestrator on top of new pipeline
  - Touches: `apps/api/src/services/grading/submit.py`
  - Inline XP award is **removed** — handled by `XPAwardSubscriber` now
  - PBT: orchestrator composition is associative — running stages individually yields the same submission as the orchestrator
  - Depends on: 2.3, 2.4, 2.5, 2.6, 2.7

---

## 3. Phase 1 — Event Bus & Subscribers

- [ ] 3.1 Formalize event bus and event types
  - Touches: `apps/api/src/services/events/__init__.py` (new), `apps/api/src/services/events/bus.py` (new), `apps/api/src/services/events/types.py` (new)
  - Defines `SubmissionSubmittedEvent`, `GradePublishedEvent`, `SubmissionReturnedEvent`, `AssessmentPublishedEvent`, `PolicyOverrideCreatedEvent`
  - Bus dispatches with 3-attempt retry + dead-letter logging
  - PBT: for any handler that succeeds on attempt N (N ≤ 3), bus dispatch completes without raising
  - PBT: a handler that always raises is invoked exactly 3 times
  - Depends on: —

- [ ] 3.2 Implement core subscribers
  - Touches: `apps/api/src/services/events/subscribers/xp_award.py`, `.../plagiarism.py`, `.../notify.py`, `.../analytics.py`, `.../sse.py`
  - `XPAwardSubscriber` replaces inline `_award_xp_safe` calls
  - `PlagiarismSubscriber` uses the new `PlagiarismProvider` interface
  - All subscribers are idempotent (keyed on submission_uuid)
  - PBT: replaying the same event twice through any subscriber produces identical DB state as a single dispatch
  - Depends on: 3.1

- [ ] 3.3 Define pluggable `PlagiarismProvider` interface
  - Touches: `apps/api/src/services/integrations/plagiarism/__init__.py`, `.../provider.py`, `.../noop.py`
  - Replaces old `plagiarism.py` stub
  - Config switch selects provider; default is `NoopPlagiarismProvider`
  - PBT: provider interface contract — any implementation returning a `PlagiarismScore` with `0 <= score <= 1` is accepted
  - Depends on: 3.1

- [ ] 3.4 Wire pipeline `emit.py` to real bus
  - Touches: `apps/api/src/services/grading/pipeline/emit.py`, `apps/api/src/services/grading/submit.py`, `apps/api/src/services/grading/teacher.py`
  - Teacher grade publish now emits `GradePublishedEvent`; bulk publish loops through the bus
  - Depends on: 3.1, 3.2

---

## 4. Phase 1 — Service Layer Decomposition

- [ ] 4.1 Split `services/assessments/core.py` into focused modules
  - Touches: `apps/api/src/services/assessments/core.py` (deleted), `.../assessment_crud.py` (new), `.../assessment_lifecycle.py` (new), `.../attempt_service.py` (new), `.../review_service.py` (new), `.../policy_service.py` (new), `apps/api/src/routers/assessments/unified.py` (import rewiring)
  - Each new module ≤ 500 lines
  - PBT: every public function exported from old `core.py` is re-exported by the new modules with identical signatures
  - Depends on: 2.8

- [ ] 4.2 Add `record_audit_event` helper and call sites
  - Touches: `apps/api/src/services/audit.py` (new), `assessment_lifecycle.py`, `policy_service.py`, `review_service.py`
  - Records: `POLICY_OVERRIDE_CREATED`, `POLICY_OVERRIDE_UPDATED`, `POLICY_OVERRIDE_DELETED`, `LIFECYCLE_TRANSITION`, `BULK_PUBLISH`, `BULK_RETURN`, `DEADLINE_EXTEND`
  - PBT: any audit-recording operation writes exactly one `AuditEvent` row on success and zero on failure
  - Depends on: 1.4, 4.1

- [ ] 4.3 Remove legacy `Block`-based settings fallback from `settings_loader.py`
  - Touches: `apps/api/src/services/grading/settings_loader.py`
  - Deletes `_get_block`, `_load_quiz_settings`, `_load_exam_settings`, `_load_generic_settings`, the `time_limit`→`time_limit_seconds` conversion
  - Canonical `Assessment` + `AssessmentPolicy` is the only source
  - PBT: for every activity with a canonical assessment, `load_activity_settings` returns identical output before and after this change
  - Depends on: 1.2, 4.1

- [ ] 4.4 Add `assessment:override` permission and enforce it
  - Touches: `apps/api/src/security/rbac.py` (permission registration), `apps/api/src/services/assessments/policy_service.py`
  - PBT: any caller without `assessment:override` receives 403 on create/update/delete of `StudentPolicyOverride`
  - Depends on: 4.1

---

## 5. Phase 1 — Router & API Surface

- [ ] 5.1 Add `POST /assessments/inline-quiz` route
  - Touches: `apps/api/src/routers/assessments/unified.py`, `apps/api/src/services/assessments/assessment_crud.py`, `apps/api/src/db/assessments.py` (new `InlineQuizCreate` schema)
  - Creates a `QUIZ` assessment with `is_inline=true` scoped to `activity_id`
  - PBT: calling `POST /assessments/inline-quiz` twice with identical payload returns the same `assessment_uuid` when an idempotency key is supplied
  - Depends on: 1.4, 4.1

- [ ] 5.2 Add `GET /assessments/{uuid}/audit` route
  - Touches: `apps/api/src/routers/assessments/unified.py`, `apps/api/src/services/audit.py`
  - PBT: endpoint returns events for the requested target_uuid only
  - Depends on: 4.2

- [ ] 5.3 Add `GET /courses/{course_uuid}/gradebook/cursor` route
  - Touches: `apps/api/src/routers/grading/gradebook.py` (or existing gradebook router), `apps/api/src/services/grading/gradebook.py`
  - PBT: walking the cursor to exhaustion returns the same set of cells as the existing matrix endpoint, up to permutation of equal keys
  - Depends on: 4.1

- [ ] 5.4 Delete `POST /blocks/quiz/{activity_id}` and its service module
  - Touches: `apps/api/src/routers/courses/activities/blocks.py` (remove route), `apps/api/src/services/blocks/block_types/quizBlock/` (deleted entirely), `apps/api/src/db/courses/quiz.py` (remove submission schemas if unused elsewhere)
  - Depends on: 2.8, 1.2 (data is migrated)

- [ ] 5.5 Add rate limiting to submit/runs/draft endpoints
  - Touches: `apps/api/src/infra/rate_limit.py` (new), `apps/api/src/routers/assessments/unified.py`, `apps/api/src/infra/lifespan.py` (wire Redis limiter)
  - Limits as per design: 1/5s submit, 10/min runs, 10/30s draft per user+resource
  - PBT: exceeding the configured limit returns 429; a valid request at the boundary succeeds
  - Depends on: 5.1

- [ ] 5.6 Expose `/internal/metrics` Prometheus endpoint
  - Touches: `apps/api/src/infra/metrics.py` (new), `apps/api/src/routers/internal.py` (new), `apps/api/src/infra/lifespan.py`
  - PBT: every named counter/histogram in the spec is registered at startup
  - Depends on: 3.1

---

## 6. Phase 1 — Delete Legacy Backend Code

- [ ] 6.1 Delete legacy Pydantic schemas
  - Touches: `apps/api/src/db/grading/schemas.py`, `apps/api/src/db/grading/__init__.py`
  - Removes `QuizAnswers`, `QuizAnswer`, `AssignmentTaskAnswer`, `AssignmentAnswers`; cleans `__init__` re-exports
  - Depends on: 5.4

- [ ] 6.2 Delete `migrate_legacy_assessments` CLI command
  - Touches: `apps/api/src/cli.py`, any supporting modules under `apps/api/src/services/` that exist solely for this command
  - Depends on: 1.3

- [ ] 6.3 Delete `exam_answers: dict[int, dict]` path and `grade_exam_questions` helpers still used only by it
  - Touches: `apps/api/src/services/grading/exam_grader.py`, `apps/api/src/services/grading/pipeline/validate.py` (ensure no reference remains)
  - Depends on: 2.3, 2.5

---

## 7. Phase 2 — Frontend: Inline Quiz Replacement

- [ ] 7.1 Scaffold new `InlineQuiz` TipTap node
  - Touches: `apps/web/src/components/Objects/Editor/Extensions/InlineQuiz/InlineQuiz.ts`, `.../InlineQuizComponent.tsx`, `.../InlineQuizAuthor.tsx`, `.../InlineQuizAttempt.tsx`, `.../types.ts`
  - Stores `{ assessment_uuid: string | null }` only
  - On first insert, calls `POST /assessments/inline-quiz` and persists the returned uuid
  - PBT: serializing and deserializing the node preserves attrs exactly
  - Depends on: 5.1

- [ ] 7.2 Register `InlineQuiz` in the editor kernel, unregister `QuizBlock`
  - Touches: `apps/web/src/components/Objects/Editor/core/editor-kernel.ts`, `apps/web/src/components/Objects/Editor/Toolbar/insert-items.tsx`
  - Depends on: 7.1

- [ ] 7.3 Implement student inline-quiz attempt flow
  - Touches: `apps/web/src/components/Objects/Editor/Extensions/InlineQuiz/InlineQuizAttempt.tsx`
  - Reuses `useAssessment`, `useAssessmentSubmission`, canonical item renderers
  - Shows score badge on completion; supports retry when policy allows
  - PBT: the component's view-model selector is pure — identical inputs give identical outputs
  - Depends on: 7.1

- [ ] 7.4 Delete legacy `QuizBlock` extension and frontend service
  - Touches: delete `apps/web/src/components/Objects/Editor/Extensions/Quiz/` entirely, delete `apps/web/src/services/blocks/Quiz/quiz.ts`, update tests that referenced `insertQuizBlock` to use `insertInlineQuiz`
  - Depends on: 7.1, 7.2, 7.3, 5.4

---

## 8. Phase 2 — Frontend: Teacher Studio & Review

- [ ] 8.1 Finalize unified `AssessmentStudioWorkspace` 3-column shell
  - Touches: `apps/web/src/features/assessments/studio/AssessmentStudioWorkspace.tsx`, `.../OutlineRail.tsx` (new), `.../PolicyInspector.tsx` (extended), `.../ReadinessPanel.tsx` (new), `.../PreviewModeButton.tsx` (new)
  - Renders kind-module slots; policy inspector is uniform across kinds
  - PBT: for every assessment kind, the rendered column count is exactly 3
  - Depends on: —

- [ ] 8.2 Rewrite `GradeForm` with rubric + annotations; delete `saveLegacy`
  - Touches: `apps/web/src/features/grading/review/components/GradeForm.tsx`, `.../ItemRubricEditor.tsx` (new), `.../InlineAnnotationEditor.tsx` (new), `.../AttemptHistoryPanel.tsx` (new), `.../ConflictResolver.tsx` (new)
  - All saves go through the item-level `GradingDraftSave` endpoint
  - PBT: final score displayed == sum of per-item rubric scores (within rounding tolerance)
  - PBT: on 412 response the component renders `ConflictResolver` exactly once
  - Depends on: —

- [ ] 8.3 Extend review workspace keyboard shortcuts and bulk actions
  - Touches: `apps/web/src/features/grading/review/GradingReviewWorkspace.tsx`, `.../ReviewBulkActionBar.tsx`
  - Adds `g`, `p`, `r`, `Escape`; existing `j/k` retained
  - PBT: selecting N submissions and invoking "batch publish" issues exactly one batch request of size N
  - Depends on: 8.2

- [ ] 8.4 Wire SSE updates for real-time teacher conflict detection
  - Touches: `apps/web/src/features/grading/review/components/GradeForm.tsx`, `apps/web/src/hooks/useGradingSSE.ts` (new), `apps/api/src/routers/grading/sse.py` (already exists — confirm event shapes)
  - Depends on: 3.2, 8.2

- [ ] 8.5 Add "needs rubric review" filter to submission list
  - Touches: `apps/web/src/features/grading/review/components/SubmissionList.tsx`, `apps/web/src/features/grading/review/types.ts`, `apps/api/src/routers/assessments/unified.py` (new `needs_rubric_review` query param), `apps/api/src/services/assessments/review_service.py`
  - Depends on: 4.1, 8.2

- [ ] 8.6 Expand CSV export to include per-item scores
  - Touches: `apps/api/src/services/grading/teacher.py` (CSV generator), `apps/api/src/routers/` (export endpoint wiring)
  - PBT: exported CSV row count equals total non-DRAFT submission count; header columns include one per item
  - Depends on: 4.1

---

## 9. Phase 2 — Frontend: Student Attempt UX

- [ ] 9.1 Implement `AttemptTimer` component
  - Touches: `apps/web/src/features/assessments/shared/AttemptTimer.tsx` (new)
  - Uses server timestamps (`timer_started_at`, `timer_expires_at`) — never trusts client clock
  - Visual warnings at 5min and 1min; `aria-live="polite"` announcements
  - PBT: for any `(now, expires_at)` pair, the displayed remaining time is non-negative and monotone
  - Depends on: —

- [ ] 9.2 Implement `AntiCheatOverlay` with server-synchronized violation counter
  - Touches: `apps/web/src/features/assessments/shared/AntiCheatOverlay.tsx` (new), `apps/web/src/hooks/useAntiCheatViolations.ts` (new)
  - Reports violations to server on emit; displays counter and threshold
  - Depends on: —

- [ ] 9.3 Implement `AutoSaveIndicator` and auto-save hook
  - Touches: `apps/web/src/features/assessments/shared/AutoSaveIndicator.tsx` (new), `apps/web/src/hooks/useAssessmentAutosave.ts` (new)
  - 30-second interval; sends `If-Match` with `draft_version`; surfaces conflicts
  - PBT: under rapid edits (≥10 answer changes per second), at most one save request is in flight
  - Depends on: 5.5

- [ ] 9.4 Implement `PostSubmissionFeedback` respecting `review_visibility`
  - Touches: `apps/web/src/features/assessments/shared/PostSubmissionFeedback.tsx` (new)
  - NONE → no feedback; SCORE_ONLY → score only; FULL → per-item correct/incorrect + explanations
  - PBT: for every `review_visibility` enum value, rendered content matches the contract
  - Depends on: —

- [ ] 9.5 Integrate new components into kind modules (quiz, exam, assignment, code challenge)
  - Touches: `apps/web/src/features/assessments/registry/*/` — each kind's Attempt component
  - Depends on: 9.1, 9.2, 9.3, 9.4

- [ ] 9.6 Accessibility audit and fixes
  - Touches: every file under `apps/web/src/features/assessments/shared/` and each kind's Attempt; add `axe-core` tests
  - PBT: automated axe scan reports zero critical or serious violations on the three main surfaces
  - Depends on: 9.5

---

## 10. Phase 2 — Frontend: Delete Legacy Code

- [ ] 10.1 Remove `saveLegacy` path from `GradeForm`
  - Touches: `apps/web/src/features/grading/review/components/GradeForm.tsx`
  - Depends on: 8.2

- [ ] 10.2 Delete LEGACY-marked files under `features/assessments/registry/exam/`
  - Touches: delete `ExamQuestionNavigation.tsx`, `questionOrder.ts`, `questionEditorReducer.ts`; move their canonical replacements into the exam KindModule
  - Depends on: 8.1

- [ ] 10.3 Remove `routeMode: 'legacy'` console logs and redirect paths
  - Touches: `apps/web/src/app/**/activity/**/page.tsx` (both the `_shared` and locale-scoped copies)
  - Depends on: 5.4

- [ ] 10.4 Remove legacy query-key fallbacks
  - Touches: `apps/web/src/lib/react-query/queryKeys.ts` — delete `assessmentUuid || 'legacy'` fallbacks; all call sites pass a real assessment uuid
  - Depends on: 8.1, 8.2

---

## 11. Phase 3 — Verification

- [ ] 11.1 Integration tests for end-to-end submission flows
  - Touches: `apps/api/src/tests/integration/test_assessment_submission_flow.py` (new)
  - Covers each assessment type: start → draft save → submit → grade → publish → student view
  - PBT: round-trip lossless — published final_score equals what the teacher entered
  - Depends on: all Phase 1 tasks

- [ ] 11.2 Property-based tests for grading invariants
  - Touches: `apps/api/src/tests/properties/test_grading_invariants.py` (new)
  - Invariants: `0 ≤ final_score ≤ auto_score`, `is_late == (submitted_at > due_at)`, late penalty monotonic, rubric sum consistency
  - Depends on: 2.8

- [ ] 11.3 Load test grading pipeline
  - Touches: `apps/api/src/tests/load/k6_submit.js` (new) — run outside CI
  - Target: 200 concurrent submissions, p99 < 2s
  - Depends on: all Phase 1 tasks

- [ ] 11.4 Playwright E2E for student attempt + teacher review
  - Touches: `apps/web/tests/e2e/assessment-student.spec.ts`, `.../assessment-teacher.spec.ts`
  - Depends on: all Phase 2 tasks

- [ ] 11.5 OpenAPI contract diff in CI
  - Touches: `.github/workflows/openapi-check.yml` (new)
  - Fails the build on breaking changes without explicit `openapi-approved` label
  - Depends on: 5.1, 5.2, 5.3

- [ ] 11.6 Final legacy-code audit
  - Touches: repo-wide grep for `legacy`, `LEGACY`, `deprecated`, `TODO.*consolidate`, `QuizBlock`, `saveLegacy`, `routeMode.*legacy`
  - Acceptance: only explicitly allowed occurrences remain (test fixture files, comments referencing resolved migrations)
  - Depends on: every other task
