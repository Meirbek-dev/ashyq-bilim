# Assessment & Grading System Modernization — Requirements

## Overview

Total rewrite of the assessments, exams, coding challenges, and grading subsystem. The goal is zero-debt production code with clean separation of concerns, world-class teacher/student UX, and complete removal of all legacy code paths.

---

## Requirement 1: Legacy Code Removal & Database Migration

### Description
All legacy assignment types, deprecated code paths, and dual-submission routes must be identified, flagged, and completely removed. No wrapping or porting — clean deletion with a database migration that removes orphaned data.

### Acceptance Criteria
- [ ] Legacy `QuizBlock` submission route (`POST /blocks/quiz/{activity_id}`) is deleted from `routers/courses/activities/blocks.py`
- [ ] Legacy quiz block service (`services/blocks/block_types/quizBlock/`) is deleted entirely
- [ ] Frontend legacy quiz service (`services/blocks/Quiz/quiz.ts`) is deleted
- [ ] Legacy answer schemas (`QuizAnswers`, `AssignmentTaskAnswer`, `AssignmentAnswers` in `db/grading/schemas.py`) are removed after confirming zero production usage
- [ ] Legacy field aliases in `quiz_grader.py` (`selected_option_id`, `selected_options`, `selected_options_id`, `answer_id`, `selected_option`) are removed — only `selected_option_ids` remains
- [ ] Legacy `Block`-based settings fallback in `settings_loader.py` (`_get_block`, `_load_quiz_settings` reading from `Block.content`) is removed
- [ ] Legacy `time_limit` (minutes) → `time_limit_seconds` conversion path is removed
- [ ] Frontend legacy query key fallbacks (`assessmentUuid || 'legacy'`) in `queryKeys.ts` are removed
- [ ] Legacy `routeMode: 'legacy'` console logs and redirect paths in activity pages are removed
- [ ] Frontend `ExamQuestionNavigation.tsx`, `questionOrder.ts`, `questionEditorReducer.ts` files marked `// LEGACY` are deleted (Phase 2 replacements must exist first)
- [ ] `exam_answers: dict[int, dict]` legacy grading path in `submit.py` `_parse_answers` is removed — only canonical `answers_by_item_uuid` path remains
- [ ] Database migration drops any remaining legacy columns/tables: `exam_attempt`, `quiz_attempt`, `code_submission`, `assignmenttask`, `assignmenttasksubmission` (verify they were already dropped; if not, drop now)
- [ ] Migration removes `legacy_*` keys from `submission.metadata_json` for all existing rows
- [ ] `migrate_legacy_assessments` CLI command is deleted
- [ ] All `__init__.py` re-exports of deleted schemas are cleaned up

---

## Requirement 2: Unified Inline Quiz Component (Canonical Pipeline)

### Description
Replace the legacy `QuizBlock` TipTap editor extension with a new clean inline-quiz component that submits through the canonical assessment pipeline (`POST /assessments/{uuid}/submit`). The inline quiz is embedded inside lesson rich-text content but uses the same grading infrastructure as standalone quizzes.

### Acceptance Criteria
- [ ] New TipTap node extension `InlineQuiz` replaces the old `QuizBlock` extension
- [ ] `InlineQuiz` stores a reference to an `assessment_uuid` (not raw question data in the block)
- [ ] Teacher authoring: inserting an inline quiz opens the standard assessment item editor (CHOICE/MATCHING items) scoped to that block's assessment
- [ ] Student attempt: inline quiz renders inside the lesson content and submits via `POST /assessments/{uuid}/submit`
- [ ] Auto-grading result is displayed inline immediately after submission (for fully auto-gradeable quizzes)
- [ ] Attempt limits, late policies, and anti-cheat settings from `AssessmentPolicy` are respected
- [ ] The inline quiz assessment is created with `kind=QUIZ` and linked to the parent activity via a new `inline_parent_activity_id` field on the `Assessment` table
- [ ] Gradebook correctly aggregates inline quiz scores alongside standalone assessments
- [ ] Existing `QuizBlock` data is migrated: each legacy block's `questions` array is converted to canonical `AssessmentItem` rows linked to a new `Assessment` record

---

## Requirement 3: Grading Pipeline — Clean Separation of Concerns

### Description
Rewrite the grading pipeline with strict layered architecture: Router → Service → Grader → Persistence. Each layer has a single responsibility. The current `services/assessments/core.py` (~3000 lines) must be decomposed.

### Acceptance Criteria
- [ ] `services/assessments/core.py` is decomposed into focused modules: `assessment_crud.py`, `assessment_lifecycle.py`, `attempt_service.py`, `review_service.py`, `policy_service.py`
- [ ] Each module is under 500 lines
- [ ] Grading pipeline (`submit.py`) is refactored into explicit pipeline stages as separate functions with typed inputs/outputs: `validate → enforce_policy → grade → apply_penalties → persist → emit_events`
- [ ] Each pipeline stage is independently testable with no database dependency (pure functions where possible)
- [ ] `GraderRegistry` remains the dispatch mechanism but each grader receives a typed `GradingContext` dataclass (not `**kwargs`)
- [ ] Late penalty calculation is extracted into a standalone `LatePolicy.apply(submitted_at, due_at) → PenaltyResult` method on the policy model
- [ ] XP awarding is moved to an event subscriber (like plagiarism) rather than inline in the submit pipeline
- [ ] Grade release logic (IMMEDIATE vs BATCH) is encapsulated in a `GradeReleaseStrategy` that the teacher service delegates to
- [ ] All grading side-effects (XP, plagiarism, notifications) are handled via the event bus — not inline in the grading transaction

---

## Requirement 4: Teacher Grading UX — World-Class Review Workspace

### Description
The teacher grading workspace must provide a seamless, keyboard-driven review experience with real-time collaboration safety, bulk operations, and per-item rubric scoring.

### Acceptance Criteria
- [ ] `GradeForm` component is rewritten: no more `saveLegacy` path — all grading goes through the item-level `GradingDraftSave` endpoint
- [ ] Per-item rubric scoring UI: teachers see each `AssessmentItem` with its `max_score`, can assign per-criterion scores via `RubricCriterion`, and the final score auto-calculates
- [ ] Inline annotation support: teachers can highlight text in open-text answers and attach comments (uses `ItemFeedbackEntry` with `annotation_type=HIGHLIGHT`)
- [ ] Keyboard shortcuts: `j/k` navigation (already exists), `g` to focus grade input, `p` to publish, `r` to return, `Escape` to deselect
- [ ] Optimistic UI: grade saves show immediate feedback; conflicts (412) show a clear merge dialog
- [ ] Bulk actions: select multiple submissions → batch grade with same score, batch publish, batch return
- [ ] Real-time conflict detection: if another teacher grades the same submission, show a toast notification (via SSE endpoint already wired)
- [ ] Grade form shows the student's attempt history (previous submissions with scores) in a collapsible panel
- [ ] CSV export includes per-item scores (not just final_score)
- [ ] Filter by "needs rubric review" (items where `needs_manual_review=true` and no teacher score yet)

---

## Requirement 5: Student Assessment UX — Seamless Attempt Flow

### Description
Students must have a clear, anxiety-reducing assessment experience with real-time feedback, progress persistence, and transparent policy enforcement.

### Acceptance Criteria
- [ ] Unified attempt entry: `AttemptEntryPanel` shows clear state (can start / continue draft / view result / start revision) with a single primary action button
- [ ] Auto-save drafts every 30 seconds via `PATCH /assessments/{uuid}/draft` with optimistic concurrency (If-Match header)
- [ ] Timer UI: countdown timer for timed assessments with visual warning at 5min and 1min remaining; auto-submit on expiry
- [ ] Anti-cheat overlay: when anti-cheat is enabled, show a clear "proctored mode" indicator; violations are counted and displayed to the student in real-time
- [ ] Post-submission feedback: for auto-graded items, show correct/incorrect immediately (respecting `review_visibility` policy: NONE / SCORE_ONLY / FULL)
- [ ] Grade release awareness: when `grade_release_mode=BATCH`, student sees "Grade pending release" instead of the score until the teacher publishes
- [ ] Attempt history: students can view all their past attempts with scores, feedback, and timestamps
- [ ] Code challenge UX: Monaco editor with language selection, "Run" button for visible tests, clear pass/fail indicators per test case, submission confirmation dialog
- [ ] Inline quiz UX: renders seamlessly in lesson content, shows score badge after completion, allows retry if policy permits
- [ ] Accessibility: all assessment surfaces meet WCAG 2.1 AA — focus management, screen reader announcements for timer, keyboard-operable answer selection

---

## Requirement 6: Assessment Authoring — Teacher Studio

### Description
Teachers must be able to create, configure, and publish assessments through an intuitive studio interface with real-time validation and preview.

### Acceptance Criteria
- [ ] `AssessmentStudioWorkspace` renders the 3-column layout: Outline (left) → Author (center) → Inspector (right) for all assessment kinds
- [ ] Item authoring: drag-and-drop reordering, inline editing of item body, real-time max_score validation
- [ ] Policy inspector: unified panel showing due date, attempt limit, time limit, late policy, anti-cheat toggles, grade release mode — all editable inline
- [ ] Readiness check: before publishing, the `GET /assessments/{uuid}/readiness` endpoint validates (items exist, correct answers defined for auto-gradeable items, policy configured) and surfaces issues in the UI
- [ ] Lifecycle state machine: DRAFT → SCHEDULED → PUBLISHED → ARCHIVED with clear visual indicators and confirmation dialogs for irreversible transitions
- [ ] Scheduling: teachers can set `scheduled_at` and the background scheduler auto-publishes (already implemented in `assignment_scheduler.py`)
- [ ] Student policy overrides: teachers can grant per-student exceptions (extra attempts, deadline extensions, waive late penalty) from within the studio
- [ ] Preview mode: teachers can preview the student attempt experience without creating a real submission
- [ ] Code challenge authoring: test case editor with visible/hidden toggle, reference solution runner, language allowlist configuration
- [ ] Exam authoring: question bank with shuffle settings, question limit (random subset), per-question point allocation

---

## Requirement 7: Gradebook — Course-Level Grade Management

### Description
The course gradebook must provide a comprehensive matrix view of all students × all activities with actionable insights and bulk operations.

### Acceptance Criteria
- [ ] Gradebook matrix: rows = students, columns = activities, cells show score + state badge (color-coded)
- [ ] Teacher action queue: prominently surfaces submissions needing grading (`teacher_action_required=true`) with one-click navigation to the review workspace
- [ ] Weighted grade average: `CourseProgress.weighted_grade_average` uses `Assessment.weight` for each activity — displayed per-student
- [ ] Overdue tracking: cells for overdue-and-not-submitted activities are visually flagged
- [ ] Bulk operations: select multiple cells → batch publish grades, batch extend deadlines
- [ ] Export: full gradebook CSV export with all scores, weighted averages, and completion status
- [ ] Progress summary: header shows aggregate stats (needs grading count, overdue count, class average, pass rate)
- [ ] Certificate eligibility: visual indicator when a student meets all required activities and grade thresholds (`certificate_eligible` flag)
- [ ] Filtering: filter by student group, by activity type, by completion state
- [ ] Performance: gradebook loads in <2s for classes up to 200 students × 50 activities (SQL-level optimization, no N+1 queries)

---

## Requirement 8: Security & Anti-Cheat Hardening

### Description
All security measures must be server-authoritative. Client-side anti-cheat is defense-in-depth only — the server enforces all constraints.

### Acceptance Criteria
- [ ] Time limit enforcement: `started_at` is server-stamped (already done); submit rejects if `elapsed > time_limit + grace_period` (already done) — verify no client bypass exists
- [ ] Attempt limit enforcement: server counts all non-DRAFT submissions including RETURNED (already done) — verify the override path (`StudentPolicyOverride.max_attempts_override`) is correctly applied
- [ ] Violation tracking: `violation_count` is passed at submit time and validated server-side; score is zeroed if `violation_count >= max_violations` (already done)
- [ ] Late submission enforcement: when `allow_late=false`, server rejects submissions after `due_at` (already done); when `allow_late=true`, penalty is calculated and snapshotted
- [ ] Plagiarism detection: replace the stub `PlagiarismCheckSubscriber` with a real integration (Moss, Copyscape, or custom similarity engine) — at minimum, define the interface contract and make it pluggable
- [ ] Code execution sandboxing: Judge0 runs with `enable_network=false` (already done); verify `max_output_file_kb`, `memory_limit`, and `cpu_time_limit` are enforced
- [ ] Idempotency: code runs use idempotency keys (already done) — extend to all submission operations to prevent double-submit on network retry
- [ ] RBAC: all endpoints check `assessment:read`, `assessment:grade`, `assessment:submit` permissions scoped to the activity's creator (already done) — add `assessment:override` permission for policy overrides
- [ ] Rate limiting: add rate limits to `POST /assessments/{uuid}/submit` (max 1 per 5 seconds per user per activity) and `POST /assessments/{uuid}/items/{item_uuid}/runs` (max 10 per minute)
- [ ] Audit trail: `GradingEntry` is append-only (already done) — add `AuditEvent` logging for policy overrides, lifecycle transitions, and bulk operations

---

## Requirement 9: Event-Driven Architecture & Observability

### Description
All post-submission side-effects must be decoupled via the event bus. The system must be observable with structured logging and metrics.

### Acceptance Criteria
- [ ] Event bus is formalized: `SubmissionSubmittedEvent`, `GradePublishedEvent`, `SubmissionReturnedEvent`, `AssessmentPublishedEvent`, `PolicyOverrideCreatedEvent`
- [ ] All side-effects subscribe to events: XP awarding, plagiarism check, notification dispatch, analytics tracking
- [ ] Event handlers are idempotent (safe to replay)
- [ ] Structured logging: every grading operation logs `assessment_uuid`, `submission_uuid`, `user_id`, `action`, `duration_ms` in a parseable format
- [ ] Metrics: track `grading.submission.count`, `grading.auto_score.histogram`, `grading.latency.p99`, `code_execution.duration.histogram`, `code_execution.degraded.count`
- [ ] SSE endpoint (`routers/grading/sse.py`) delivers real-time updates to the teacher review workspace when submissions arrive or grades are published
- [ ] Dead letter handling: if an event handler fails, the event is logged and retried (at-least-once delivery) without blocking the main transaction

---

## Requirement 10: Data Integrity & Performance

### Description
The system must maintain referential integrity, prevent data corruption under concurrency, and perform well at scale.

### Acceptance Criteria
- [ ] Optimistic concurrency: all teacher grade writes use `version` field with `If-Match` header (already done) — extend to student draft saves
- [ ] Atomic transactions: submission persist + ActivityProgress + CourseProgress + GradingEntry all commit in one transaction (already done) — verify no partial-commit scenarios exist
- [ ] Backfill safety: `backfill_activity_progress` handles `IntegrityError` gracefully (already done) — add idempotency so repeated calls are no-ops
- [ ] Index coverage: all query patterns in `teacher.py` (status filter, late filter, search, sort) are covered by composite indexes (verify with `EXPLAIN ANALYZE`)
- [ ] Pagination: all list endpoints use SQL LIMIT/OFFSET (already done) — add cursor-based pagination option for the gradebook (large datasets)
- [ ] Connection pooling: verify SQLAlchemy pool settings are appropriate for concurrent grading load
- [ ] Content versioning: `content_version` and `policy_version` on submissions ensure grading uses the same items/policy the student saw at submit time (already done) — verify snapshots are populated correctly
- [ ] Cascade deletes: verify all FK relationships have appropriate `ondelete` behavior (CASCADE for child records, SET NULL for optional references)

---

## Legacy Deletion Registry

The following items are **strictly deprecated** and must be **completely removed** (no wrapping, no porting):

| Item | Location | Replacement |
|------|----------|-------------|
| `QuizBlock` TipTap extension | `web/src/components/Objects/Editor/Extensions/Quiz/` | New `InlineQuiz` extension (Req 2) |
| `submitQuizBlock` service | `web/src/services/blocks/Quiz/quiz.ts` | Canonical `POST /assessments/{uuid}/submit` |
| `POST /blocks/quiz/{activity_id}` route | `api/src/routers/courses/activities/blocks.py` | Canonical unified route |
| `quizBlock` backend service | `api/src/services/blocks/block_types/quizBlock/` | Canonical grading pipeline |
| `QuizAnswers` schema | `api/src/db/grading/schemas.py` | Canonical `AssessmentDraftPatch.answers` |
| `AssignmentTaskAnswer` schema | `api/src/db/grading/schemas.py` | Canonical `ItemAnswer` discriminated union |
| `AssignmentAnswers` schema | `api/src/db/grading/schemas.py` | Canonical `AssessmentDraftPatch.answers` |
| Legacy answer field aliases | `api/src/services/grading/quiz_grader.py` lines 171-178 | Single `selected_option_ids` field |
| `Block`-based settings fallback | `api/src/services/grading/settings_loader.py` | Canonical `Assessment` + `AssessmentPolicy` |
| `exam_answers: dict[int, dict]` path | `api/src/services/grading/submit.py` | Canonical `answers_by_item_uuid` |
| `migrate_legacy_assessments` CLI | `api/src/cli.py` | One-time migration already executed |
| `ExamQuestionNavigation.tsx` (LEGACY) | `web/src/features/assessments/registry/exam/` | New exam navigation in KindModule |
| `questionOrder.ts` (LEGACY) | `web/src/features/assessments/registry/exam/` | New exam navigation in KindModule |
| `questionEditorReducer.ts` (LEGACY) | `web/src/features/assessments/registry/exam/` | New exam studio in KindModule |
| `saveLegacy` function | `web/src/features/grading/review/components/GradeForm.tsx` | Item-level `GradingDraftSave` path |
| Legacy `routeMode: 'legacy'` redirects | `web/src/app/**/activity/**/page.tsx` | Direct canonical routing |

---

## Migration Strategy

1. **Phase 0 — Data Migration**: Write and execute a reversible Alembic migration that converts all remaining legacy `Block`-based quiz data into canonical `Assessment` + `AssessmentItem` rows. Verify with integration tests.
2. **Phase 1 — Dual-Write**: New code writes to canonical tables only. Legacy read paths remain temporarily for rollback safety.
3. **Phase 2 — Legacy Deletion**: Once Phase 1 is stable (all traffic on canonical paths), execute the deletion of all items in the Legacy Deletion Registry above.
4. **Phase 3 — Verification**: Run full integration test suite, verify gradebook accuracy, confirm no orphaned data.

---

## Non-Functional Requirements

- **Performance**: Submission grading completes in <500ms (auto-grade) or <2s (with Judge0 code execution)
- **Availability**: Code execution degradation (Judge0 down) must not block non-code submissions
- **Consistency**: All grade writes are ACID within a single PostgreSQL transaction
- **Observability**: Every grading decision is traceable via `GradingEntry` audit trail + structured logs
- **Accessibility**: WCAG 2.1 AA compliance on all student-facing assessment surfaces
- **Internationalization**: All user-facing strings use i18n keys (no hardcoded English in components)
