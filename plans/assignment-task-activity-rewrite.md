# Assignment, Task, Activity Rewrite Plan

## Executive Summary

The current assignment system should be treated as two partially-overlapping systems rather than one coherent feature:

1. Legacy assignment/task storage:
   - `Assignment`
   - `AssignmentTask`
   - `AssignmentTaskSubmission`
   - `AssignmentUserSubmission`
2. New generic grading storage:
   - `Submission`
   - `GradingBreakdown`
   - teacher grading routes under `/grading`

The worst problem is not code style. It is that student work, assignment status, teacher grading, analytics, and UI state do not share a single source of truth. Student task answers are saved through legacy task-submission endpoints, while the teacher grading table reads the generic `submission` table. The activity page can then submit an assignment to the generic grading system with an empty answer payload. That makes the two systems diverge by design.

The rewrite should keep `Activity` as the course-content container, keep the generic `Submission` system as the only source of truth for student attempts and teacher grading, and reduce `Assignment`/`AssignmentTask` to authoring and assessment-definition data.

## Current System Map

### Backend Domain

`Activity` is the course-visible item. It owns placement and visibility:

- `chapter_id`
- denormalized `course_id`
- `order`
- `creator_id`
- `published`
- `activity_type`
- `activity_sub_type`
- `content`
- `details`

`Assignment` duplicates much of that context:

- `course_id`
- `chapter_id`
- `activity_id`
- `published`
- `due_date`
- `grading_type`

`AssignmentTask` duplicates context again:

- `assignment_id`
- `course_id`
- `chapter_id`
- `activity_id`
- `assignment_type`
- untyped `contents`

`AssignmentTaskSubmission` duplicates it a fourth time:

- `user_id`
- `activity_id`
- `course_id`
- `chapter_id`
- `assignment_task_id`
- untyped `task_submission`
- per-task `grade`

`AssignmentUserSubmission` is an aggregate status row synthesized from task submissions.

Separately, the generic grading system has a much better abstraction:

- `Submission`
- `assessment_type`
- `activity_id`
- `user_id`
- `answers_json`
- `grading_json`
- `status`
- `attempt_number`
- `submitted_at`
- `graded_at`
- `is_late`

### Frontend Domain

The dashboard assignment editor uses:

- `AssignmentProvider`
- global Zustand `AssignmentsTaskStore`
- legacy assignment services in `services/courses/assignments.ts`
- task-specific editor components that write JSON into `AssignmentTask.contents`

The student assignment UI saves per-task progress through legacy task-submission endpoints.

The dashboard submissions page renders both:

- generic `SubmissionsTable`, backed by `/grading/submissions`
- legacy assignment-level status table, backed by `/assignments/{uuid}/submissions`

The activity page has a separate assignment submit action that calls `submitAssessment(activity.id, 'ASSIGNMENT', {}, 0)`, so the generic grading row can be created without the task answers that were saved through legacy endpoints.

## Critical Problems

### 1. Two Sources Of Truth For Submissions

Legacy task submissions hold actual assignment work. Generic `Submission` rows drive the modern teacher grading UI. These are not reliably synchronized.

Consequences:

- A student can save task work but the generic grading table may not show it.
- A teacher can grade generic submissions that do not contain the task answers.
- Legacy assignment status and generic grading status can disagree.
- Analytics and gamification can count different realities.
- Any bug fix must guess which system is authoritative.

This is the central architectural failure.

### 2. Final Assignment Submit Does Not Submit Assignment Answers

The activity page submits assignments through the generic grading API with an empty payload:

```ts
await submitAssessment(props.activity.id, 'ASSIGNMENT', {}, 0);
```

That means the generic submission pipeline receives no task answers unless another path has separately copied them. The assignment breakdown helper expects assignment answers under `answers_json.tasks`, but the student UI stores answers in `AssignmentTaskSubmission.task_submission`.

### 3. Reads Mutate State

`get_all_assignment_user_submissions()` computes assignment-level statuses by calling `create_or_update_assignment_user_submission()` for each candidate user. A read endpoint should not create or rewrite status rows.

Consequences:

- Viewing a page mutates production data.
- Performance gets worse with class size.
- Debugging status changes becomes hard because reads can cause writes.
- Race conditions become likely when teachers and students view the same assignment.

### 4. Invalid Grading Semantics

Legacy assignment aggregation treats a task as graded only when `grade > 0`. A legitimately graded zero is therefore indistinguishable from ungraded.

The aggregate grade mixes two models:

- weighted percent when task max points exist
- average raw task grades when they do not

This creates inconsistent grading behavior across assignments.

### 5. Activity And Assignment Ownership Are Duplicated

`Assignment`, `AssignmentTask`, and `AssignmentTaskSubmission` store `course_id`, `chapter_id`, and `activity_id`, even though those relationships can be derived from the activity and assignment.

Consequences:

- Moving an activity can leave assignment rows stale.
- Query filters can return different results depending on which duplicated FK is used.
- The schema requires defensive sync logic everywhere.
- Bugs survive because no single relation is obviously canonical.

### 6. Delete And Publish Can Desynchronize Activity And Assignment

Deleting an assignment deletes only the assignment row, not necessarily the activity. Publishing requires separate updates to assignment and activity from the frontend.

Consequences:

- Orphan assignment activities can exist.
- Published state can diverge between `activity.published` and `assignment.published`.
- The frontend owns transactional consistency it cannot guarantee.

### 7. Untyped JSON Defines Core Behavior

Task content, task answers, file references, form schemas, quiz schemas, and settings are stored as broad JSON dictionaries. The real schema lives across React components, not in a shared contract.

Consequences:

- Backend cannot validate task definitions deeply.
- Backward compatibility is accidental.
- Teacher grading cannot safely interpret answers.
- Frontend `any` spreads through the feature.

### 8. Route Contracts Are Leaky

Many endpoints include both assignment UUID and task UUID, but service functions frequently use only the task UUID. This allows path mismatches to go undetected unless each service manually rechecks parent ownership.

The routes also mix authoring, draft saving, file upload, final submission, status aggregation, and grading in one assignment router.

### 9. Permission Names Do Not Match Actions

Student submission uses `assignment:read` in legacy paths. Teacher grading sometimes checks `course:update` to decide instructor-ness, then `assignment:update` to grade. The generic grading service uses `assignment:grade`.

The rewrite should use action-specific permissions:

- `assignment:read`
- `assignment:create`
- `assignment:update`
- `assignment:delete`
- `assignment:submit`
- `assignment:grade`

### 10. Frontend State Is Fragile

The editor nests assignment providers, keeps selected task in a global store, uses many `any` types, and invalidates cache keys manually. The student view imports dashboard task components. These choices make assignment behavior hard to reason about and easy to break.

## Target Architecture

### Ownership Rules

Use these as hard invariants:

1. `Activity` owns course placement, visibility, ordering, and creator ownership.
2. `Assignment` owns assignment-specific metadata only.
3. `AssignmentTask` owns authoring-time task definition only.
4. `Submission` owns student attempt state, answers, grading, status, timestamps, and publication.
5. No read endpoint creates or rewrites submission/status rows.

### Data Model

Keep:

- `activity`
- `assignment`
- `assignment_task`
- `submission`

Retire after migration:

- `assignmenttasksubmission`
- `assignmentusersubmission`

Recommended model:

```text
Activity
  id
  activity_uuid
  chapter_id
  course_id
  order
  creator_id
  published
  activity_type = TYPE_ASSIGNMENT

Assignment
  id
  assignment_uuid
  activity_id unique not null
  title
  description
  due_at timestamptz null
  grading_policy json/schema
  created_at timestamptz
  updated_at timestamptz

AssignmentTask
  id
  assignment_task_uuid
  assignment_id not null
  order
  type
  title
  description
  hint
  reference_file_id null
  max_score numeric
  config_json
  config_version
  created_at timestamptz
  updated_at timestamptz

Submission
  assessment_type = ASSIGNMENT
  activity_id
  user_id
  attempt_number
  status
  answers_json
  grading_json
  auto_score
  final_score
  is_late
  submitted_at
  graded_at
```

`Submission.answers_json` for assignments should be:

```json
{
  "tasks": [
    {
      "task_uuid": "assignmenttask_...",
      "content_type": "file",
      "file_key": "..."
    },
    {
      "task_uuid": "assignmenttask_...",
      "content_type": "form",
      "form_data": {}
    },
    {
      "task_uuid": "assignmenttask_...",
      "content_type": "quiz",
      "answers": {}
    }
  ]
}
```

### Status Model

Use the generic submission state machine:

- `DRAFT`: student has saved work but has not submitted
- `PENDING`: submitted and needs teacher review
- `GRADED`: teacher saved grade, not published
- `PUBLISHED`: grade visible to student
- `RETURNED`: teacher returned work for revision

Use `is_late` as a boolean, not as a separate status.

Do not recreate `SUBMITTED`, `LATE`, or `NOT_SUBMITTED` as assignment-specific statuses. `NOT_SUBMITTED` should be a report/query result derived from enrolled users minus submissions, not a stored row.

## API Design

### Authoring

```text
GET    /assignments/{assignment_uuid}
PATCH  /assignments/{assignment_uuid}
DELETE /assignments/{assignment_uuid}

GET    /assignments/{assignment_uuid}/tasks
POST   /assignments/{assignment_uuid}/tasks
PATCH  /assignments/{assignment_uuid}/tasks/{task_uuid}
DELETE /assignments/{assignment_uuid}/tasks/{task_uuid}
PATCH  /assignments/{assignment_uuid}/tasks/reorder
```

The backend must validate that `task_uuid` belongs to `assignment_uuid`.

Creation should be one transaction:

```text
POST /activities/assignment
```

This creates the activity and assignment together. Remove the standalone assignment creation path unless there is a real admin repair use case.

### Student Work

```text
GET   /assignments/{assignment_uuid}/submissions/me/draft
PATCH /assignments/{assignment_uuid}/submissions/me/draft
POST  /assignments/{assignment_uuid}/submit
GET   /assignments/{assignment_uuid}/submissions/me
```

Internally these should read/write `Submission`.

Draft save should upsert one `Submission(status=DRAFT)` for the user/activity/attempt and update `answers_json.tasks`.

Final submit should:

1. validate enrollment and `assignment:submit`
2. validate task answers against current task definitions
3. compute `is_late`
4. move the draft to `PENDING`
5. synthesize `grading_json.items` from assignment tasks

### Teacher Grading

Keep generic grading endpoints:

```text
GET   /grading/submissions?activity_id=...
GET   /grading/submissions/stats?activity_id=...
GET   /grading/submissions/{submission_uuid}
PATCH /grading/submissions/{submission_uuid}
PATCH /grading/submissions/batch
```

Add assignment-oriented report endpoints only when they are derived from `Submission`, not from stored legacy rows:

```text
GET /assignments/{assignment_uuid}/submission-summary
```

This can return enrolled users with derived status, including students with no submission.

## Frontend Rewrite

### Replace Current Assignment Context

Create a typed feature module:

```text
features/assignments/
  api/
  queries/
  mutations/
  schemas/
  components/
```

Use typed query options and mutations. Avoid `any` in assignment boundaries.

Replace the current provider shape with a single bundle query:

```ts
interface AssignmentBundle {
  assignment: Assignment;
  activity: ActivitySummary;
  course: CourseSummary;
  tasks: AssignmentTask[];
  permissions: AssignmentPermissions;
}
```

The editor should receive this bundle once. Do not nest `AssignmentProvider` inside an already-mounted `AssignmentProvider`.

### Editor

Replace global selected-task Zustand with URL or local component state:

```text
/dash/assignments/{assignment_uuid}?task={task_uuid}&tab=content
```

Benefits:

- refresh-safe
- shareable
- testable
- no stale global task object

Task editors should edit typed task config:

- `FileTaskConfig`
- `FormTaskConfig`
- `QuizTaskConfig`
- `TextTaskConfig`

The backend should validate the same shape.

### Student View

Stop importing dashboard task editor components into the student activity UI.

Build separate student task renderers:

- `StudentFileTask`
- `StudentFormTask`
- `StudentQuizTask`
- `StudentTextTask`

Each writes into one assignment draft via a mutation like:

```ts
updateAssignmentDraft(assignmentUuid, {
  task_uuid,
  answer
});
```

The final submit button should submit the current draft, not an empty payload.

### Teacher View

Use only `SubmissionsTable` backed by generic grading. Remove the legacy assignment-status table once the derived summary endpoint exists.

The grading panel should render assignment task items from `submission.grading_json.items`.

## Migration Plan

### Phase 0: Freeze Behavior With Tests

Before rewriting, add tests that document current behavior and current bugs:

- assignment creation creates exactly one activity and one assignment
- deleting an assignment currently leaves or does not leave an activity, depending on chosen intended behavior
- saving file/form/quiz task work creates legacy task submission
- assignment final submit currently creates generic submission
- generic submission created by assignment submit currently lacks task answers
- zero grade behavior is currently broken in legacy aggregation
- teacher cannot grade another student accidentally through a mismatched task path

These tests are not all expected to pass forever. They make migration risk visible.

### Phase 1: Add New Contracts Without Removing Legacy

Add:

- typed assignment task schemas
- `due_at timestamptz`
- `assignment.activity_id` unique constraint
- `assignment_task.order`
- unique `(assignment_id, order)`
- unique `(assignment_id, assignment_task_uuid)`
- indexes for submission queries
- draft save endpoint backed by `Submission`
- final submit endpoint backed by `Submission`

Keep old endpoints read-only or dual-write during this phase.

### Phase 2: Backfill Existing Data

For every assignment:

1. ensure exactly one assignment activity exists
2. copy string `due_date` into `due_at`
3. sort tasks by `id` and assign stable `order`
4. for each legacy `AssignmentUserSubmission` or task-submission user:
   - create or update one `Submission(assessment_type=ASSIGNMENT)`
   - build `answers_json.tasks` from `AssignmentTaskSubmission.task_submission`
   - build `grading_json.items` from task metadata and task grades
   - map legacy statuses:
     - `PENDING` with no submitted work -> no row or `DRAFT`
     - `SUBMITTED` -> `PENDING`
     - `LATE` -> `PENDING` with `is_late=true`
     - `GRADED` -> `GRADED`
   - set `submitted_at` from the best available task submission creation timestamp
   - set `graded_at` only when actually graded

Do not use `grade > 0` to decide whether an item was graded. Add an explicit graded marker in the migrated grading JSON if needed.

### Phase 3: Switch Reads To New Source

Change frontend and backend reads:

- student assignment page reads draft/submission from `Submission`
- teacher submissions page reads only generic grading
- analytics reads only generic submissions for assignments
- gamification awards assignment XP only from published generic submissions

Legacy tables may still exist but should not be used by product code.

### Phase 4: Switch Writes To New Source

Change all task save and final submit paths to write only `Submission`.

File upload should be a media operation that returns a file key. Saving that file key into the assignment answer should be a separate draft mutation.

### Phase 5: Remove Legacy Paths

Remove or hard-deprecate:

- `AssignmentTaskSubmission`
- `AssignmentUserSubmission`
- legacy task-submission routes
- legacy assignment status table
- read endpoints that mutate status rows
- duplicated assignment creation path

Keep compatibility redirects or clear 410 responses for old API clients if external clients exist.

## Acceptance Criteria

The rewrite is done only when these are true:

1. A student can save file/form/quiz/text task answers, refresh, and see the same draft.
2. Final submit moves the draft to `PENDING` and includes all task answers in `Submission.answers_json`.
3. Teacher grading panel sees the exact submitted answers.
4. A zero score can be saved and is treated as graded.
5. Assignment stats, analytics, grading table, and student status all read from `Submission`.
6. Reads do not create or update submission rows.
7. `activity.published` is the only publication flag for course visibility.
8. Assignment activity creation is transactional.
9. Deleting an assignment activity removes the assignment and tasks.
10. Deleting an assignment through assignment API has one clearly documented behavior: either delete the activity transactionally or refuse and require activity deletion.
11. Parent-child UUID mismatches return 404 or 400.
12. No assignment feature boundary uses `any` in TypeScript service/query/component props.

## Suggested Implementation Order

1. Add backend assignment bundle read model and typed task schemas.
2. Add `Submission`-backed assignment draft save and submit endpoints.
3. Add tests for draft save, final submit, teacher grading, zero grade, and returned-for-revision.
4. Build new student assignment renderers against the draft API.
5. Build new dashboard editor state around URL-selected task and typed mutations.
6. Backfill legacy task submissions into generic submissions.
7. Switch teacher submissions page to generic-only plus derived no-submission summary.
8. Remove legacy status writes from read endpoints.
9. Delete legacy frontend services and components.
10. Drop legacy tables after production data validation.

## Main Rewrite Decision

Do not try to "clean up" the existing assignment submission path incrementally. Keep assignment/task authoring, but move all student work and grading into the generic `Submission` model. Any plan that keeps `AssignmentTaskSubmission`, `AssignmentUserSubmission`, and `Submission` active as peers will preserve the current chaos under cleaner names.
