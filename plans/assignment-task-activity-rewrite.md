# Assignment / Task / Activity / Progress Rewrite Plan

## Goal

Rewrite the assignment/task/activity system around one coherent progress and grading model so teachers can answer, for any course:

- Which students are enrolled?
- Which activities are required?
- Who has not started, started, submitted, needs grading, passed, failed, returned, or completed each activity?
- What is each student's overall course progress?
- Which submissions require teacher action now?

The current implementation has partial improvements, but the product still cannot reliably show this because progress, attempts, grading, and completion are split across several competing models.

## Current State

### What is already better

The older assignment service monolith has already been split:

- `apps/api/src/services/courses/activities/assignments/crud.py`
- `apps/api/src/services/courses/activities/assignments/tasks.py`
- `apps/api/src/services/courses/activities/assignments/submissions.py`
- `apps/api/src/services/courses/activities/assignments/_queries.py`

The assignment model also no longer exposes internal FK IDs in `AssignmentRead`, `due_at` is the only due-date field, assignment timestamps are proper datetime columns, and the legacy dead assignment submission endpoints are gone.

The unified `Submission` table in `apps/api/src/db/grading/submissions.py` is a good foundation. It already has:

- `assessment_type`
- `activity_id`
- `user_id`
- `status`
- `attempt_number`
- `answers_json`
- `grading_json`
- scores
- timestamps
- teacher-facing list/stats schemas

### Core Problem

Despite that, the system still has four separate progress/grading worlds:

1. Unified submissions: `Submission` in `apps/api/src/db/grading/submissions.py`
2. Assignment-specific workflow: `Assignment`, `AssignmentTask`, assignment draft endpoints
3. Legacy quiz workflow: `QuizAttempt` and `/blocks/quiz/{activity_id}`
4. Legacy code challenge workflow: `CodeSubmission` and `/code-challenges/{activity_uuid}/submit`
5. Trail completion workflow: `TrailStep.complete`, used by course progress and certificates

Analytics then tries to stitch those sources together in `apps/api/src/services/analytics/queries.py`, especially `build_activity_events()` and `progress_snapshots()`. That makes progress a derived guess, not a product invariant.

## Critical Findings

### 1. Activity, assessment, and completion are not clearly separated

`Activity` is both content navigation and assessment container. Some activities are passive content, some are assignments, some are exams, some are code challenges. The system lacks one explicit contract that says:

- Is this activity required for course completion?
- Is it gradeable?
- How many attempts are allowed?
- What counts as completion?
- What counts as pass/fail?
- Does it need manual grading?
- What is visible to the student vs teacher?

Right now those answers are scattered in `Activity.content`, `Activity.details`, `Assignment`, `Exam`, `Block.content.settings`, `CodeChallengeSettings`, and trail steps.

### 2. `Submission` is not actually universal yet

The generic grading routes use `Submission`, but the app still records quiz attempts in `QuizAttempt` and code challenge attempts in `CodeSubmission`.

Confirmed locations:

- `apps/api/src/db/grading/submissions.py:204` has the intended unified table.
- `apps/api/src/db/courses/quiz.py:14` still defines `QuizAttempt`.
- `apps/api/src/db/courses/code_challenges.py:224` still defines `CodeSubmission`.
- `apps/api/src/routers/courses/activities/blocks.py:142` still exposes legacy quiz submit.
- `apps/api/src/routers/courses/code_challenges.py:313` still exposes legacy code challenge submit.
- `apps/api/src/services/grading/submit.py:102` has the newer unified submit pipeline.

This guarantees drift. A teacher gradebook based on `Submission` misses legacy attempts unless analytics performs custom joins.

### 3. Course progress is still driven by `TrailStep`, not by assessed activity state

`TrailStep.complete` is treated as course progress and certificate input:

- `apps/api/src/db/trail_steps.py:18`
- `apps/api/src/services/analytics/queries.py:735`
- `apps/api/src/services/courses/certifications.py` counts completed `TrailStep` rows.

This is too weak. A student can be marked complete for a gradeable activity separately from submission state. For assignments that require teacher grading, completion should not be the same as "visited activity" or "submitted draft".

### 4. Teacher view is split between grading and analytics

The focused grading UI (`SubmissionsTable`) is per activity and only uses `Submission`:

- `apps/web/components/Grading/SubmissionsTable.tsx`

The analytics learner rows are also per assessment but built from stitched sources:

- `apps/web/components/Dashboard/Analytics/AssessmentLearnerRowsTable.tsx`
- `apps/api/src/services/analytics/assessments.py`

There is no first-class course gradebook matrix: students x required activities. Teachers must jump between assignment pages, assessment analytics, course analytics, and CSV exports.

### 5. Completion semantics are inconsistent by activity type

Examples:

- Assignment: submit creates `Submission(status=PENDING)`, later teacher can grade/publish.
- Quiz via new grading API: can create `Submission(status=GRADED)`.
- Quiz via legacy block API: creates `QuizAttempt`, not `Submission`.
- Code challenge via legacy API: creates `CodeSubmission`, not `Submission`.
- Trail: creates `TrailStep(complete=True)` when activity is added to trail.

This means "completed" means different things depending on which UI/API path the student used.

### 6. `AssignmentTask.contents` validation is only partial

The task config union exists in `apps/api/src/db/courses/assignments.py`, but `AssignmentTask.contents` is still stored and returned as `dict[str, object]`. Create/update validate raw contents, but the DB/read model does not expose the discriminated union as the actual contract.

This matters because tasks are the assignment equivalent of questions. If they are untyped at the storage/read boundary, teacher grading and analytics have to tolerate malformed task payloads forever.

### 7. Analytics is compensating for missing domain tables

`load_analytics_context()` loads many operational models and builds snapshots in memory. That is useful as a reporting fallback, but it should not be the source of truth for live teacher tracking.

The live operational product needs a normalized, queryable state:

- one row per learner per course activity
- latest submission/attempt state
- completion state
- grade state
- timestamps
- teacher action state

## Target Model

### Domain Terms

Use these terms consistently:

- `Activity`: a course curriculum item. It may be content-only or assessable.
- `Assessment`: the grading/completion policy for a gradeable activity.
- `Task`: a sub-item inside an assignment. It is not a course-level activity.
- `Submission`: one learner attempt for one assessable activity.
- `ActivityProgress`: one learner's current state for one course activity.
- `CourseProgress`: aggregate state across all required activities in one course.
- `Gradebook`: teacher-facing read model built from `ActivityProgress`, `Submission`, activity metadata, and enrollment.

### Source of Truth

Use these rules:

- `Activity` is the source of truth for curriculum order and publication.
- `AssessmentPolicy` is the source of truth for attempt limits, pass threshold, due date, grading mode, and completion rules.
- `Submission` is the source of truth for all gradeable attempts.
- `ActivityProgress` is the source of truth for current per-student activity state.
- `CourseProgress` is either stored as a denormalized projection or computed from `ActivityProgress`, but never from `TrailStep`.
- `TrailStep` becomes legacy/personal trail UX only, not course completion truth.

## Proposed Backend Model

### 1. Add `assessment_policy`

One row per gradeable activity.

Suggested fields:

```text
id
policy_uuid
activity_id
assessment_type              QUIZ | ASSIGNMENT | EXAM | CODE_CHALLENGE
grading_mode                 AUTO | MANUAL | AUTO_THEN_MANUAL
completion_rule              VIEWED | SUBMITTED | GRADED | PASSED | TEACHER_VERIFIED
passing_score
max_attempts
time_limit_seconds
due_at
allow_late
late_policy_json
settings_json
created_at
updated_at
```

This replaces type-specific due dates and scattered attempt settings as the operational contract. Type-specific editors can still store rich authoring content in assignment tasks, exam questions, quiz blocks, and code challenge settings.

### 2. Keep and strengthen `submission`

Keep the existing `Submission` table, but make it truly universal.

Add or confirm:

```text
submission_uuid unique
assessment_policy_id nullable during migration, then not null
activity_id
user_id
assessment_type
status
attempt_number
auto_score
final_score
max_score
passed
is_late
needs_manual_review
answers_json
grading_json
artifact_refs_json
started_at
submitted_at
graded_at
published_at
returned_at
created_at
updated_at
grading_version
```

Important rule: every quiz, exam, assignment, code challenge, file upload task, open answer, and form answer produces a `Submission` attempt if it affects grading or completion.

### 3. Add `activity_progress`

One row per learner per activity once the learner is eligible/enrolled or first interacts.

Suggested fields:

```text
course_id
activity_id
user_id
state                       NOT_STARTED | IN_PROGRESS | SUBMITTED | NEEDS_GRADING | RETURNED | GRADED | PASSED | FAILED | COMPLETED
required
score
passed
best_submission_id
latest_submission_id
attempt_count
started_at
last_activity_at
submitted_at
graded_at
completed_at
due_at
is_late
teacher_action_required
status_reason
created_at
updated_at
```

Unique key:

```text
(activity_id, user_id)
```

This table is what teachers query for progress. It is updated synchronously after every submission lifecycle event and can be repaired by a backfill job.

### 4. Add `course_progress`

Either materialized or computed from `activity_progress`.

Suggested fields if materialized:

```text
course_id
user_id
completed_required_count
total_required_count
progress_pct
grade_average
missing_required_count
needs_grading_count
last_activity_at
completed_at
certificate_eligible
updated_at
```

Unique key:

```text
(course_id, user_id)
```

Certificates should read this table/projection, not `TrailStep.complete`.

### 5. Normalize assignment tasks

Keep `Assignment` and `AssignmentTask`, but treat `Assignment` as authoring metadata for an assessment policy, not a parallel assessment system.

Changes:

- `Assignment.activity_id` remains the link to course activity.
- `Assignment.due_at` should move to `assessment_policy.due_at` or be treated as a legacy mirror during migration.
- `AssignmentTask.contents` should become a typed discriminated union in read/write schemas.
- Add explicit task kinds for open answer and file submission rather than hiding them in generic contents.
- Store submission answers in `Submission.answers_json`, keyed by task UUID.
- Store teacher per-task grading in `Submission.grading_json.items`.

## Lifecycle Contract

All gradeable activity types should use the same state machine.

### Student lifecycle

```text
NOT_STARTED
  -> IN_PROGRESS       when opened/started/draft created
  -> SUBMITTED         when submitted but no grading decision yet
  -> NEEDS_GRADING     when manual review is required
  -> GRADED            when teacher or autograder has a score
  -> PASSED / FAILED   when score is evaluated against passing score
  -> COMPLETED         when completion_rule is satisfied
  -> RETURNED          when teacher sends back for revision
```

Implementation detail: `Submission.status` can remain smaller (`DRAFT`, `PENDING`, `GRADED`, `PUBLISHED`, `RETURNED`), while `ActivityProgress.state` is the teacher-facing current state.

### Completion rules

Use explicit policy:

- Content page/video/document: `VIEWED` or `TEACHER_VERIFIED`
- Quiz: usually `PASSED` or `GRADED`
- Assignment: usually `GRADED` or `PASSED`
- Exam: usually `PASSED`
- Code challenge: usually `PASSED`
- Optional activity: excluded from required progress but still visible

### Teacher action rule

`teacher_action_required = true` when:

- latest submission needs manual grading
- returned submission has been resubmitted
- student is overdue and activity is required, if configured
- plagiarism/violation flag needs review

## API Rewrite

### Student APIs

Create one submission API:

```text
POST /activities/{activity_uuid}/submissions/start
PATCH /activities/{activity_uuid}/submissions/draft
POST /activities/{activity_uuid}/submissions/submit
GET /activities/{activity_uuid}/submissions/me
GET /activities/{activity_uuid}/progress/me
```

The request body can vary by `assessment_type`, but the lifecycle should not.

Deprecate or adapt:

- `/blocks/quiz/{activity_id}`
- `/grading/start/{activity_id}`
- `/grading/submit/{activity_id}`
- `/assignments/{assignment_uuid}/submissions/me/draft`
- `/assignments/{assignment_uuid}/submit`
- `/code-challenges/{activity_uuid}/submit`

Do not remove old routes immediately. Make them adapters that call the unified service and write `Submission` + `ActivityProgress`.

### Teacher APIs

Add course-level tracking endpoints:

```text
GET /teacher/courses/{course_uuid}/gradebook
GET /teacher/courses/{course_uuid}/learners/{user_uuid}/progress
GET /teacher/courses/{course_uuid}/activities/{activity_uuid}/progress
GET /teacher/courses/{course_uuid}/actions
PATCH /teacher/submissions/{submission_uuid}/grade
PATCH /teacher/submissions/batch-grade
POST /teacher/progress/recalculate
```

`/gradebook` should return a matrix-ready response:

```text
course
learners[]
activities[]
cells[] {
  user_uuid
  activity_uuid
  state
  score
  passed
  attempt_count
  is_late
  due_at
  latest_submission_uuid
  teacher_action_required
  updated_at
}
summary {
  total_learners
  avg_progress_pct
  needs_grading_count
  overdue_count
  completed_count
}
```

### Analytics APIs

Analytics should consume `ActivityProgress` and `Submission` instead of stitching together operational tables. Rollups can remain, but they should be projections from the same canonical state.

## Migration Plan

### Phase 0 - Freeze semantics

Before code changes, write a short ADR:

- What is an activity?
- What is an assessment?
- What is a task?
- What is a submission?
- What is completion?
- What statuses can students/teachers see?

This prevents another partial rewrite where each feature invents its own status model.

### Phase 1 - Add canonical tables

Add:

- `assessment_policy`
- `activity_progress`
- optional `course_progress`

Add indexes:

```text
activity_progress(course_id, user_id)
activity_progress(activity_id, state)
activity_progress(course_id, teacher_action_required)
submission(activity_id, user_id, status)
submission(assessment_policy_id, user_id, attempt_number)
```

No existing behavior changes yet.

### Phase 2 - Backfill policies

Create one policy per existing gradeable activity:

- Assignment rows become `assessment_type=ASSIGNMENT`.
- Exams become `assessment_type=EXAM`.
- Quiz block activities become `assessment_type=QUIZ`.
- Code challenge activities become `assessment_type=CODE_CHALLENGE`.

Move or mirror due dates, attempt limits, time limits, passing scores into `assessment_policy`.

### Phase 3 - Backfill submissions

Backfill `Submission` from:

- existing assignment `Submission` rows
- `QuizAttempt`
- `ExamAttempt`
- `CodeSubmission`

For code challenge source code, do not force large source payloads into `answers_json` if that is a storage/security problem. Store references or compact metadata in `artifact_refs_json`.

During this phase, keep legacy rows for compatibility.

### Phase 4 - Backfill activity progress

For every enrolled learner and every published required activity:

- create `ActivityProgress`
- calculate state from best/latest submission
- calculate `attempt_count`
- calculate completion from policy
- calculate teacher action flags
- set last activity timestamps

Use this backfill as the repair job that can be safely rerun.

### Phase 5 - Route writes through one service

Create `services/progress/submissions.py` or similar:

```text
start_activity_submission()
save_activity_draft()
submit_activity()
grade_submission()
return_submission()
publish_grade()
recalculate_activity_progress()
recalculate_course_progress()
```

All assignment, quiz, exam, and code challenge routes must call this service.

### Phase 6 - Convert legacy routes to adapters

Keep old URLs temporarily but make them thin adapters:

- quiz block submit writes `Submission`
- code challenge submit writes/updates `Submission`
- assignment submit keeps its URL but calls unified submit
- grading routes call unified grade service

Add warnings in code comments and tests that no new feature should write to `QuizAttempt` or `CodeSubmission` directly.

### Phase 7 - Build the teacher gradebook UI

Add a course dashboard page centered on the matrix:

- rows: enrolled students
- columns: required activities
- cells: current state, score, late flag, action required
- filters: cohort, status, activity type, overdue, needs grading, not started
- bulk actions: grade selected, export, message selected later
- drilldown: click cell to open latest submission and activity history

This should become the teacher's main operational view. The existing per-activity `SubmissionsTable` remains as a drilldown, not the only place to grade.

### Phase 8 - Move certificates and analytics

Certificates:

- replace `TrailStep.complete` counting with `course_progress.certificate_eligible` or equivalent computed state.

Analytics:

- replace `progress_snapshots()` dependence on `TrailStep.complete`
- read `ActivityProgress`/`CourseProgress`
- keep nightly rollups as performance projections only

### Phase 9 - Retire legacy tables or mark them explicitly archival

After adapters have run in production and backfill is verified:

- stop writing `QuizAttempt`
- stop writing `CodeSubmission` as primary progress source
- keep code execution artifacts in a new code-specific artifact table if needed
- keep `TrailStep` only for personal trail UX, not required course progress

## Frontend Plan

### 1. Create shared status vocabulary

Add frontend types generated from OpenAPI for:

- `ActivityProgressState`
- `ActivityProgressCell`
- `CourseGradebookResponse`
- `Submission`
- `TeacherAction`

Remove local hand-maintained status logic where possible.

### 2. Replace per-assessment-only tracking

Current views:

- `SubmissionsTable` is useful but per activity.
- `AssessmentLearnerRowsTable` is analytics-focused and not an operational gradebook.

New views:

- Course gradebook matrix
- Student progress drawer
- Activity progress drawer
- Teacher action queue

### 3. Keep authoring separate from tracking

Assignment task editors, quiz editors, exam editors, and code challenge editors should author activity content. They should not own progress semantics. Progress semantics live in assessment policy controls:

- required/optional
- due date
- passing score
- attempts
- grading mode
- completion rule

## Testing Plan

### Backend unit tests

Add tests for:

- policy resolution per activity type
- submission state transitions
- returned/resubmitted assignment flow
- late submission calculation
- attempt limit calculation
- pass/fail/completion rule calculation
- progress recalculation idempotency
- course progress aggregation

### Backend migration tests

Add tests for:

- QuizAttempt to Submission backfill
- CodeSubmission to Submission backfill
- assignment Submission preservation
- TrailStep-derived progress backfill only as fallback
- rerunning backfill safely

### API contract tests

Add tests for:

- `GET /teacher/courses/{course_uuid}/gradebook`
- filters and pagination
- teacher cannot see another teacher's course
- co-authors can see the gradebook if authorized
- student cannot access teacher progress endpoints

### Frontend tests

Add tests for:

- matrix status rendering
- filter behavior
- clicking a cell opens the correct submission
- action queue count matches gradebook cells
- returned/resubmitted cells update correctly

## Success Criteria

This rewrite is done when:

- Every gradeable activity write path produces/updates a `Submission`.
- Every learner/activity pair has a canonical `ActivityProgress` row or computable equivalent.
- Course completion no longer depends on `TrailStep.complete`.
- Teachers can open one course gradebook and see all students across all activities.
- Needs-grading, overdue, returned, failed, passed, and completed states are consistent across assignments, quizzes, exams, and code challenges.
- Analytics and certificates read from the same progress model as the teacher UI.
- Legacy quiz/code challenge tables are adapters or archival, not operational truth.

## Recommended Execution Order

1. Write ADR for domain terms and state machine.
2. Add `assessment_policy` and `activity_progress`.
3. Backfill policies.
4. Backfill submissions from legacy attempt tables.
5. Backfill activity progress.
6. Route assignment submit/grade through unified progress service.
7. Route quiz submit through unified progress service.
8. Route code challenge submit through unified progress service.
9. Add course gradebook API.
10. Build teacher course gradebook UI.
11. Move certificate eligibility to course progress.
12. Move analytics snapshots to activity/course progress.
13. Retire or archive legacy attempt/progress tables.

## Non-Goals For This Rewrite

- Redesigning the whole course editor.
- Replacing the rich assignment task editor.
- Replacing Judge0 integration.
- Removing analytics rollups entirely.
- Changing RBAC concepts beyond using them consistently in new endpoints.

The rewrite should make progress and grading coherent first. UI polish and advanced analytics should come after the source of truth is fixed.
