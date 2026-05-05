# Assessments, Assignments, Tasks, Quizzes, Exams, Forms, Coding, and Grading Production Readiness Plan

## Status

- Date: 2026-05-05
- Status: Critical implementation plan
- Scope: assessment authoring, assignment/task creation, exams, quizzes, form items, code challenges, student attempts, submissions, grading, feedback, grade release, gradebook, analytics, migration, tests, and operations
- Goal: make the assessment system reliable, coherent, pleasant to use, and production-ready for teachers and students

## Executive Diagnosis

The repo has the right strategic direction: one canonical `Assessment`, `AssessmentItem`, `Submission`, `AssessmentPolicy`, and grading ledger. The problem is that the product is still in the dangerous middle of the migration. Backend, frontend, data model, and UX do not yet agree on one contract for lifecycle, policy, attempts, grading, release, and kind capabilities.

This is why the system feels buggy and unreliable:

- Some flows are canonical, some still call legacy grading endpoints.
- Some endpoints enforce policy; others only enforce permission.
- Some student endpoints mask hidden grades; canonical assessment endpoints can return raw submission data.
- Some UI shells use backend projections; others still infer state from cached local submission data.
- Assessment kinds are not consistently mapped between activity types, assessment types, frontend kind names, and old quiz/task language.
- Published content can still be edited through normal item update paths, but submissions do not snapshot the authored item version.
- Grading has optimistic locking for single-grade saves, but not a complete review workflow with per-item scoring, auditability, and consistent bulk safety.
- Test coverage exists, but it is nowhere near the level required for high-stakes save, submit, timer, release, and gradebook correctness.

The fix should not be a cosmetic UI pass. The fix is to finish the convergence to a real assessment engine, then build teacher and student surfaces on top of authoritative server state.

## Evidence Reviewed

- [docs/ASSESSMENTS.md](../docs/ASSESSMENTS.md)
- [docs/ASSESSMENT_CAPABILITY_MATRIX.md](../docs/ASSESSMENT_CAPABILITY_MATRIX.md)
- [apps/api/src/db/assessments.py](../apps/api/src/db/assessments.py)
- [apps/api/src/db/grading/submissions.py](../apps/api/src/db/grading/submissions.py)
- [apps/api/src/services/assessments/core.py](../apps/api/src/services/assessments/core.py)
- [apps/api/src/services/assessments/settings.py](../apps/api/src/services/assessments/settings.py)
- [apps/api/src/services/grading/submission.py](../apps/api/src/services/grading/submission.py)
- [apps/api/src/services/grading/submit.py](../apps/api/src/services/grading/submit.py)
- [apps/api/src/services/grading/teacher.py](../apps/api/src/services/grading/teacher.py)
- [apps/api/src/services/grading/registry.py](../apps/api/src/services/grading/registry.py)
- [apps/web/features/assessments/hooks/useAssessment.ts](../apps/web/features/assessments/hooks/useAssessment.ts)
- [apps/web/features/assessments/hooks/useAssessmentSubmission.ts](../apps/web/features/assessments/hooks/useAssessmentSubmission.ts)
- [apps/web/features/assessments/studio/AssessmentStudioWorkspace.tsx](../apps/web/features/assessments/studio/AssessmentStudioWorkspace.tsx)
- [apps/web/features/assessments/studio/NativeItemStudio.tsx](../apps/web/features/assessments/studio/NativeItemStudio.tsx)
- [apps/web/features/assessments/registry/quiz.tsx](../apps/web/features/assessments/registry/quiz.tsx)
- [apps/web/features/assessments/registry/assignment-attempt.tsx](../apps/web/features/assessments/registry/assignment-attempt.tsx)
- [apps/web/features/assessments/registry/code-challenge/CodeChallengeAttemptContent.tsx](../apps/web/features/assessments/registry/code-challenge/CodeChallengeAttemptContent.tsx)
- [apps/web/features/grading/review/GradingReviewWorkspace.tsx](../apps/web/features/grading/review/GradingReviewWorkspace.tsx)
- [apps/web/features/grading/review/components/GradeForm.tsx](../apps/web/features/grading/review/components/GradeForm.tsx)
- [apps/web/features/grading/review/components/SubmissionInspector.tsx](../apps/web/features/grading/review/components/SubmissionInspector.tsx)
- [apps/web/features/grading/gradebook/CourseGradebookCommandCenter.tsx](../apps/web/features/grading/gradebook/CourseGradebookCommandCenter.tsx)
- Existing tests under [apps/api/src/tests](../apps/api/src/tests) and [apps/web/tests](../apps/web/tests)

## Non-Negotiable Principles

1. `Activity` is the course/curriculum node. `Assessment` is the gradeable runtime and authoring node.
2. Assessment kinds are presets over capabilities, not separate products.
3. The backend owns lifecycle, access, effective policy, timer windows, attempt limits, release state, scoring, and visibility.
4. The frontend renders server-provided capabilities and reason codes. It must not guess whether a student can start, save, submit, see a score, or revise.
5. Hidden grades must not be present in student payloads, not merely hidden by UI.
6. Student answers must be durable across refresh, network failure, duplicate tabs, and submit retries.
7. Published assessment content must either be immutable or versioned/snapshotted per submission.
8. Every high-value mutation must be idempotent where retry is expected, optimistic-lock protected where humans edit, audited, and observable.

## P0 Blocking Risks

### 1. Student Access Is Not Lifecycle-Gated

`start_assessment`, `save_assessment_draft`, and `submit_assessment` call `_require_submit_access`, but `_require_submit_access` only checks course access and `assessment:submit`. It does not enforce `DRAFT`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`, `scheduled_at`, due date, time window, or effective override state.

Impact:

- Students may be able to start or submit assessments that are not published.
- Archived or draft assessments depend on UI hiding rather than backend enforcement.
- Scheduled exams are not trustworthy.

Required fix:

- Add one `get_effective_attempt_state(assessment, user, now)` backend service.
- Use it in every start/save/submit/me endpoint.
- Return explicit disabled reason codes such as `NOT_PUBLISHED`, `SCHEDULED_NOT_OPEN`, `ARCHIVED`, `PAST_DUE`, `MAX_ATTEMPTS_REACHED`, `TIME_LIMIT_EXPIRED`, `NOT_ENROLLED`.

### 2. Canonical Student Endpoints Can Leak Hidden Grades

Legacy student grading endpoints use masking logic in `routers/grading/submit.py`. Canonical assessment endpoints in `services/assessments/core.py` return `SubmissionRead.model_validate(submission)` directly for `/assessments/{assessment_uuid}/me` and draft-related reads. That means `final_score`, `auto_score`, and `grading_json` may be present for `GRADED` submissions even when release mode is batch/hidden.

Impact:

- Hidden grades can leak through API payloads.
- UI may accidentally display scores from raw cached submission data.
- Release policy is not enforceable.

Required fix:

- Centralize student submission serialization in one `build_student_submission_read` function.
- Mask `auto_score`, `final_score`, item feedback, correct answers, grading JSON, and release metadata unless visibility is allowed by policy and ledger state.
- Add negative API tests proving hidden grades are absent from canonical payloads.

### 3. Read Requests Create Assessment Rows

`get_assessment_by_activity_uuid` can call `_get_or_project_assessment_for_activity`, which creates and commits an `Assessment` and policy on a read path.

Impact:

- GET has side effects.
- Concurrent reads can race.
- Legacy activities can silently become draft canonical assessments without an explicit migration.
- Support/debugging becomes confusing because records appear from reads.

Required fix:

- Stop creating rows from GET.
- Move projection/backfill into explicit migration/admin command.
- Return a clear `404` or `409 MIGRATION_REQUIRED` for un-migrated assessable activities in canonical routes.

### 4. Quiz Taxonomy Is Inconsistent

Backend `create_assessment(QUIZ)` maps quiz to `TYPE_CUSTOM`, while the studio route treats `TYPE_QUIZ` as assessable. `_ACTIVITY_TO_KIND` does not map `TYPE_QUIZ`, so existing quiz activities without canonical `Assessment` rows can fail canonical studio/review lookup.

Impact:

- Quiz can appear supported but fail depending on how it was created.
- Migration outcomes differ by creation path.
- Teachers can hit dead ends.

Required fix:

- Decide the permanent activity type for canonical quiz.
- Add one migration from legacy quiz/activity shape to canonical quiz.
- Add route-level gates until the migration is complete.
- Update capability matrix and tests for both created-new and migrated quiz.

### 5. Published Content Is Still Mutable Without Submission Snapshots

`_ensure_authorable` only blocks `ARCHIVED`. Item create/update/delete/reorder can happen for `PUBLISHED` and `SCHEDULED` assessments. Existing submissions store answers by item UUID but do not snapshot the item body, rubric, max score, correct answer, or grading policy used at submit time.

Impact:

- Teacher edits after submissions can change review rendering and grading meaning.
- Deleted/reordered items can make old submissions difficult or impossible to review accurately.
- Grade disputes cannot be reconstructed.

Required fix:

- Either block item/policy edits after first submission, or introduce assessment versions.
- On submit, snapshot item definitions, scoring policy, due policy, late policy, and release policy into submission metadata.
- Review old submissions against their snapshot, not current authoring state.

### 6. Code Challenge Bypasses the Shared Attempt Model

`CodeChallengeAttemptContent` starts the canonical assessment, but it still loads code settings through code-challenge-specific hooks and does not use the shared canonical draft/answer hook. It passes `answer={undefined}` and `onAnswerChange={() => undefined}` into the code item attempt.

Impact:

- Code attempts do not behave like other assessment attempts.
- Draft recovery, version conflict handling, submit state, and canonical answer persistence are inconsistent.
- Runner failures can become submission failures without a clear recovery path.

Required fix:

- Make code challenge a canonical `CODE` item attempt with shared start/draft/save/submit mechanics.
- Store latest visible run in submission metadata and final submission answers in canonical answer format.
- Separate "Run code" from "Submit final answer" contractually and visually.

### 7. Policy and Settings Are Duplicated

`AssessmentPolicy` stores canonical policy. `services/assessments/settings.py` still defines per-kind settings shapes derived from `activity.settings`, `activity.details`, assessment items, and policy. Submit code also accepts `AssessmentSettings`.

Impact:

- Due dates, time limits, anti-cheat, attempts, release mode, and grading mode can drift.
- Backend and frontend engineers cannot know which field is authoritative.
- Tests must cover duplicate representations.

Required fix:

- Treat `AssessmentPolicy` plus item bodies as the only write source.
- Keep settings DTOs as read-only compatibility adapters with deprecation dates.
- Remove new writes to `activity.settings` for canonical assessment behavior.

### 8. Frontend Cache and State Invalidations Are Not Canonical Enough

The attempt page loads assessment by activity UUID, but some mutations invalidate only assessment detail by assessment UUID. Grading stats query keys are keyed by activity ID even when the canonical assessment UUID path is used. This creates stale projection and cross-surface cache risks.

Impact:

- Action bars can remain stale after start/save/submit/publish.
- Grade review lists and stats can disagree briefly or persistently.
- Users see disabled/enabled actions that do not match backend truth.

Required fix:

- Normalize query keys around `{assessmentUuid, activityUuid}` for assessment flows.
- Invalidate assessment detail, activity lookup, draft, personal submissions, teacher submissions, stats, gradebook, and analytics from one mutation utility.
- Add tests for start/save/submit/grade/publish invalidation behavior.

### 9. Review Is Still Overall-Grade First

`GradeForm` saves final score and overall feedback, but sends empty `item_feedback`. `SubmissionInspector` can render canonical answers, but the grading UI is not yet a full item/rubric grading workspace.

Impact:

- Open-text, file, form, and mixed assignment grading is clumsy and error-prone.
- Teachers cannot grade item-by-item in the primary form.
- Rubric and per-item feedback are not first-class.

Required fix:

- Convert review into a queue plus item-level grading workspace.
- Support per-item score, rubric criteria, feedback, internal notes, attachments, and "needs manual review" completion.
- Calculate final score from item scores unless teacher intentionally overrides.

### 10. Test Coverage Is Too Thin for Production

API assessment tests currently cover readiness/review/analytics slices only. Web tests cover some analytics and gradebook surfaces, but not the critical end-to-end author -> publish -> attempt -> autosave -> submit -> grade -> publish -> student result flow.

Impact:

- Regression risk is high.
- Hidden-grade, timer, lifecycle, and migration bugs can ship.
- "Works in one path" can hide broken equivalent paths.

Required fix:

- Build a real assessment test matrix before expanding features.
- Include backend state-machine tests, frontend shell tests, and Playwright end-to-end flows.
- Add migration parity fixtures and data reconciliation tests.

## Target Product Experience

### Teacher Experience

Teachers should have one coherent assessment workspace:

- Create assignment, quiz, exam, form-style task, or code challenge from one entry point.
- Pick a kind preset, then configure allowed item types and policy.
- See readiness issues before publish, with direct links to broken items/settings.
- Publish now, schedule, archive, duplicate, or create a new version intentionally.
- Review submissions in one queue with filters for needs grading, late, returned, missing, published, and failed auto-grade.
- Grade item-by-item with rubric support, autosaved teacher drafts, and conflict handling.
- Batch publish safely after reviewing.
- Open gradebook and analytics that reconcile with the same submission ledger.

### Student Experience

Students should have one reliable attempt flow:

- Clear start screen showing availability, due date, time limit, attempts left, late policy, and grade visibility.
- Server-backed draft creation before work starts.
- Autosave to backend plus local emergency recovery.
- Clear save state, conflict resolution, and retry behavior.
- Timer and anti-cheat state driven by server timestamps and policy.
- Submit confirmation with unanswered/invalid item warnings.
- Result screen that explains pending review, hidden grades, published grades, returned revision, late penalty, and feedback.
- Same behavior on desktop and mobile for supported assessment types.

### Backend Experience

Engineering should have one model per concept:

- One assessment lifecycle service.
- One effective policy resolver.
- One student attempt state resolver.
- One canonical submission serializer for student view.
- One teacher submission serializer for review view.
- One grading ledger and grade release service.
- One item registry for body, answer, authoring, attempt rendering, review rendering, and grading.
- One migration playbook for legacy assessments.

## Implementation Roadmap

### Phase 0: Stop the Bleeding

Owner: backend + frontend lead  
Target: before any new assessment feature work

- [ ] Enforce lifecycle and scheduling in backend start/save/submit endpoints.
- [ ] Centralize student submission masking for all canonical endpoints.
- [ ] Add tests proving hidden grades are not exposed.
- [ ] Remove side-effectful assessment creation from GET routes or guard it behind explicit migration mode.
- [ ] Fix quiz activity type mapping and gate unsupported legacy quiz routes.
- [ ] Block item/policy edits on published assessments with existing submissions until versioning lands.
- [ ] Fix frontend invalidation after start/save/submit/grade/publish to refresh activity-based assessment queries.
- [ ] Add telemetry markers for blocked start/save/submit reasons.

Exit criteria:

- Draft, scheduled, archived, max-attempt, due-date, and hidden-grade bugs are backend-blocked.
- Canonical and legacy student endpoints agree on grade visibility.
- No canonical GET creates assessment rows.

### Phase 1: Canonical Contracts

Owner: backend platform + frontend platform

- [ ] Define `AssessmentDetailRead`, `AttemptStateRead`, `StudentSubmissionRead`, `TeacherSubmissionRead`, and `ReviewQueueRead` as versioned contracts.
- [ ] Add disabled action reason codes to attempt projection.
- [ ] Add `effective_policy` to attempt projection after applying overrides.
- [ ] Add `server_now`, `available_at`, `closes_at`, `due_at`, and `time_remaining_seconds` where relevant.
- [ ] Add `content_version` and `policy_version` fields even before full versioning is implemented.
- [ ] Generate frontend types from OpenAPI and remove hand-written duplicate DTOs where possible.
- [ ] Replace frontend release-state inference with backend release-state payload.
- [ ] Normalize query keys so canonical assessment UUID is always part of assessment/grading cache identity.

Exit criteria:

- Frontend shells can render all major actions from server-provided capability data.
- There is no new hand-written duplicate assessment API contract.

### Phase 2: Versioning, Snapshots, and Data Integrity

Owner: backend + data

- [ ] Introduce `assessment_version` table or equivalent immutable version payload.
- [ ] Snapshot item body, max score, correct answers, rubric, effective policy, and grading settings at submit time.
- [ ] Review and grade submissions using the submission snapshot.
- [ ] Store late-policy outcome and reason at submit time.
- [ ] Add item order uniqueness constraint per assessment.
- [ ] Add reconciliation checks for assessment -> activity -> policy -> submissions -> progress -> gradebook.
- [ ] Add explicit migration commands for legacy assignments/quizzes/exams/code challenges.
- [ ] Add dry-run and rollback reports for migrations.

Exit criteria:

- Historical submissions remain reviewable after authoring changes.
- Gradebook values can be reproduced from canonical submissions and progress.

### Phase 3: Grading Engine Completion

Owner: backend grading + frontend grading

- [ ] Make grading result schema item-native: item UUID, score, max score, correctness, feedback, rubric criteria, manual-review flag.
- [ ] Implement item graders for `CHOICE`, `MATCHING`, and `CODE`.
- [ ] Mark `OPEN_TEXT`, `FILE_UPLOAD`, and complex `FORM` fields as manual unless rubric/AI grading is explicitly added later.
- [ ] Calculate final score from item scores by default.
- [ ] Support teacher override with reason.
- [ ] Add grading drafts so a teacher can save item comments before final status change.
- [ ] Add audit rows for save grade, publish grade, return for revision, override score, bulk publish, and deadline extension.
- [ ] Make batch actions idempotent and retry-safe.

Exit criteria:

- Mixed assignments can be graded item-by-item.
- Every grade outcome has a reconstructable ledger and audit trail.

### Phase 4: Teacher Frontend Polish

Owner: frontend + design

- [ ] Redesign studio around a dense, work-focused layout: outline, selected item editor, policy panel, readiness drawer.
- [ ] Make lifecycle controls match backend transitions exactly.
- [ ] Add direct readiness navigation to broken item/policy fields.
- [ ] Add policy editor for attempts, due dates, late policy, time limit, release mode, anti-cheat, and overrides.
- [ ] Build review queue with stable columns, keyboard navigation, filters, bulk actions, and item-level grading.
- [ ] Add rubric editor and rubric grading UI.
- [ ] Add grade release preview: what the student will see before publish.
- [ ] Add gradebook drill-through to the exact canonical review route.
- [ ] Add analytics panels for backlog, score distribution, item difficulty, missing work, late submissions, and code runner failures.

Exit criteria:

- Teachers can complete create -> publish -> review -> release -> gradebook without switching mental models or hitting legacy dead ends.

### Phase 5: Student Frontend Polish

Owner: frontend + design

- [ ] Build one attempt chrome for assignment, quiz, exam, form, and code challenge.
- [ ] Show availability, attempts, due date, timer, save state, and submission status from `AttemptStateRead`.
- [ ] Add unanswered/invalid item summary before submit.
- [ ] Add backend autosave retry queue and local recovery fallback.
- [ ] Add conflict UI for multi-tab drafts.
- [ ] Add timer warnings and server-expiry handling.
- [ ] Add returned-for-revision flow that creates a new draft without overwriting history.
- [ ] Add clear result views for pending, awaiting release, visible, returned, late penalty, and failed auto-grade.
- [ ] Make mobile usable for non-code assessment types; explicitly mark code challenge mobile support if limited.

Exit criteria:

- Students do not lose answers in realistic refresh, offline-ish, duplicate-tab, and retry scenarios.
- Students never see a grade before release.

### Phase 6: Code Challenge Hardening

Owner: backend integrations + frontend code challenge

- [ ] Move code challenge final submissions to canonical `CODE` item answers.
- [ ] Store visible run results separately from final grading results.
- [ ] Add runner job IDs, idempotency keys, queue status, and retry behavior.
- [ ] Handle compile errors, runtime errors, timeouts, runner outages, and hidden-test mismatch as first-class states.
- [ ] Add degraded mode messaging when Judge0 is unavailable.
- [ ] Define whether plagiarism is advisory, blocking, or reviewer-only.
- [ ] Add code challenge load tests and runner health dashboards.

Exit criteria:

- A runner outage cannot corrupt submissions or silently produce wrong grades.

### Phase 7: Forms and Tasks

Owner: product + frontend + backend

- [ ] Decide product taxonomy: "form" as item kind, "task" as assignment preset, or separate named kind.
- [ ] If forms stay item-level, make `FORM` item support typed fields, required validation, file references, numeric scoring, and review rendering.
- [ ] If tasks become a product kind, define allowed items, policy defaults, review behavior, and analytics.
- [ ] Add reusable form field renderer for authoring, attempt, review, and grading.
- [ ] Add validation for required fields before submit.

Exit criteria:

- Teachers can create form/task-style assessments without abusing open-text fields or legacy dynamic activities.

### Phase 8: Testing and QA Matrix

Owner: QA + backend + frontend

Backend tests:

- [ ] Lifecycle blocks: draft, scheduled future, published, archived.
- [ ] Start/save/submit with max attempts, due dates, late allowed/blocked, overrides, timer expiry.
- [ ] Hidden grade masking for canonical and legacy endpoints.
- [ ] Auto-grade immediate release versus batch release.
- [ ] Teacher grade optimistic locking.
- [ ] Bulk publish idempotency and partial failures.
- [ ] Returned-for-revision attempt creation.
- [ ] Assessment version snapshot review after item edit/delete.
- [ ] Quiz migration parity.
- [ ] Code runner failure states.

Frontend unit/integration tests:

- [ ] Studio readiness rendering and lifecycle button availability.
- [ ] Attempt shell capability rendering from server projection.
- [ ] Autosave, conflict, local recovery, submit success, submit failure.
- [ ] Hidden results do not render even if stale data exists.
- [ ] Review item-level grading and stale grade conflict.
- [ ] Gradebook drill-through and cache invalidation.

End-to-end tests:

- [ ] Teacher creates assignment, publishes, student submits, teacher grades, student sees released result.
- [ ] Teacher creates quiz, student auto-graded result hidden until release.
- [ ] Teacher creates exam with timer, student autosaves and submits.
- [ ] Teacher creates code challenge, student runs tests, submits, runner returns result.
- [ ] Returned-for-revision full flow.
- [ ] Multi-tab draft conflict.
- [ ] Network failure during draft save and submit retry.

Exit criteria:

- Assessment CI blocks regressions in lifecycle, visibility, submit durability, grading, and gradebook reconciliation.

### Phase 9: Observability, Support, and Rollout

Owner: platform + support + product

- [ ] Add structured events for `assessment.start.blocked`, `draft.save.failed`, `submit.failed`, `grade.save.conflict`, `grade.publish.failed`, `runner.failed`.
- [ ] Add dashboards for submit success rate, draft-save failures, conflict rate, grading backlog, bulk action failures, and runner latency.
- [ ] Add support diagnostics by assessment UUID and submission UUID.
- [ ] Add migration dashboards for canonical versus legacy route usage.
- [ ] Roll out canonical flows behind feature flags by course/kind.
- [ ] Add rollback playbooks for route flags and migrations.
- [ ] Add support runbooks for hidden-grade complaints, lost-answer reports, timer incidents, runner incidents, and gradebook discrepancies.

Exit criteria:

- Production incidents can be triaged by assessment UUID/submission UUID without reading database tables manually.

## Assessment Kind Capability Targets

| Kind | Authoring | Attempt | Grading | Release | Notes |
| --- | --- | --- | --- | --- | --- |
| Assignment | `CHOICE`, `OPEN_TEXT`, `FILE_UPLOAD`, `FORM`, `MATCHING` | autosave + submit | item-level manual/auto mixed | hidden, batch, publish, return | primary mixed-workflow kind |
| Quiz | `CHOICE`, `MATCHING` initially | quick attempt shell | auto-grade | immediate or batch | must fix activity-type migration |
| Exam | `CHOICE`, `MATCHING` initially, later open text | timed shell | auto/manual mixed | usually batch | needs strict lifecycle/timer enforcement |
| Code Challenge | one or more `CODE` items | code editor + run + submit | runner + optional manual review | immediate or batch | needs runner idempotency/degraded mode |
| Form/Task | likely assignment preset/item set | form renderer | manual or field scoring | normal assignment release | decide taxonomy before building more UI |

## Production Definition of Done

Backend is done when:

- [ ] Every student action is lifecycle/policy gated server-side.
- [ ] Hidden grades are absent from student payloads.
- [ ] Assessment content is immutable after submission or versioned.
- [ ] Every supported kind uses canonical submissions.
- [ ] Gradebook and analytics reconcile with the grading ledger.
- [ ] All high-value mutations are audited and observable.

Frontend is done when:

- [ ] Teacher studio, review, and gradebook use one canonical mental model.
- [ ] Student attempt, save, submit, and result flows use server capability state.
- [ ] No supported kind renders a placeholder or legacy dead end.
- [ ] Save, conflict, timer, returned, hidden-grade, and error states are visible and understandable.
- [ ] Mobile and accessibility baselines pass for supported surfaces.

QA is done when:

- [ ] Critical state-machine paths have automated coverage.
- [ ] Hidden-grade and lifecycle negative tests exist.
- [ ] End-to-end flows cover every supported kind.
- [ ] Migration parity tests exist before legacy paths are removed.

## Immediate Next Actions

1. Fix lifecycle/policy enforcement in canonical start/save/submit.
2. Fix canonical student submission masking.
3. Remove or gate GET-side assessment creation.
4. Resolve quiz activity type mapping and migration.
5. Add published-content immutability until versioning exists.
6. Normalize frontend invalidation for assessment activity/detail/draft/submission queries.
7. Write P0 backend tests for lifecycle, hidden grade, max attempts, due date, and release modes.
8. Open implementation tickets for Phases 1-3 before doing broad UI polish.

