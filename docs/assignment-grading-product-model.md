# Assessment And Grading Product Model

This model uses one vocabulary for all assessable activity kinds: assignment,
exam, code challenge, and embedded quiz.

## Core Objects

- **Assessment kind**: the activity type that contributes kind-specific content.
  Current kinds are assignment, exam, code challenge, and quiz.
- **AssessmentPolicy**: operational rules for attempts, including due date,
  maximum attempts, late policy, anti-cheat policy, access policy, and scoring
  metadata.
- **Submission**: the user-facing workflow record for student work. Status is
  always one of `DRAFT`, `PENDING`, `GRADED`, `PUBLISHED`, or `RETURNED`.
- **ActivityProgress**: the per-student rollup used by trail progress and the
  gradebook.
- **GradingEntry**: teacher-facing scoring, feedback, publish, and return
  state for a submission.

Legacy execution records can still exist behind a kind. `ExamAttempt` and
`CodeSubmission` are adapters for the exam runtime and Judge0 runtime; both
project into canonical `Submission` before the UI renders workflow state.

## Shared Surfaces

The same three surfaces exist for every kind.

- **Studio**: teacher authoring. The shared shell owns lifecycle, breadcrumbs,
  preview, schedule, publish, draft, archive, and policy chrome. The kind owns
  the center editor and optional outline rail.
- **Attempt**: student work. The shared shell owns header, timer, save state,
  anti-cheat banner, returned-for-revision banner, navigation, focus mode, and
  submit footer. The kind owns the answer/editor body.
- **Review**: teacher grading. The shared review workspace owns queue, status,
  score, release, publish, return, and bulk actions. The kind owns the submitted
  work detail.

## Kind Contributions

Assignment content is a task list. Each task produces an answer fragment, and
the task scores normalize to one final 0-100 percent submission score.

Exam content is a question list. The exam runtime stores question order,
answers, violations, and autosave state in `ExamAttempt`; the projection writes
the canonical `Submission` used by review and gradebook.

Code challenge content is a code editor plus Judge0 execution diagnostics. The
Judge0 `CodeSubmission.status` is internal polling state only; users see the
canonical `Submission.status`.

Quiz content uses the same question and scoring vocabulary as exams, but it can
remain embedded in dynamic content when it is not mounted as a full assessment
surface.

## Policy Vocabulary

All policy display flows through `PolicyView`.

- Schedule: due date, scheduled lifecycle date, publish/archive dates.
- Attempts: maximum attempts and late penalties.
- Anti-cheat: copy/paste blocking, tab switching, developer tools detection,
  right-click blocking, fullscreen enforcement, and violation threshold.
- Scoring: normalized 0-100 percent and source of the displayed score.
- Access: whitelist, prerequisites, and kind-specific access constraints.

Backend anti-cheat settings live in `AssessmentPolicy.anti_cheat_json`.
Frontend adapters read that shape through `policyFromAssessmentPolicy()`.

## Status Vocabulary

Only canonical `SubmissionStatus` appears in user-facing workflow UI.

- `DRAFT`: student is still working.
- `PENDING`: submitted and waiting for grading or processing.
- `GRADED`: graded but not necessarily visible to the student.
- `PUBLISHED`: grade and feedback are visible.
- `RETURNED`: teacher sent the submission back for revision.

Execution statuses such as Judge0 `PROCESSING` or legacy exam
`AUTO_SUBMITTED` may still exist inside kind runtimes, but they are not gradebook
or review workflow statuses.
