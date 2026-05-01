# Assessments redesign plan

> Status: proposal · Owner: TBD · Target: ~3 to 5 sprints, incremental
>
> Scope: data model, grading, submission, file upload, studio/attempt/review
> UI/UX for **assignments, exams, code challenges, and quizzes**.
>
> Goal: one coherent, production-grade, low-ceremony assessment platform that
> a teacher and a student can each understand in 30 seconds.

---

## 1. Why a rewrite?

The current system was assembled in three roughly-independent waves —
assignments first, exams next, code challenges last — and a partial
"unify everything" pass was started but never finished. The result is a
codebase where the right shape has been *named* in several places but not
*adopted*, so the surface area is roughly **2× what it should be** and
small changes ripple unpredictably.

A non-exhaustive list of concrete issues found while auditing the code:

### 1.1 Data model: three lifecycles, two submission tables

| Concept                    | Where                                                                | State                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Assignment lifecycle       | `assignment.status` (`AssignmentStatus` enum)                        | DRAFT/SCHEDULED/PUBLISHED/ARCHIVED                                                                                                     |
| Assignment lifecycle (old) | `assignment.published: bool`                                         | "Keep published col in DB for backward compat; dropped in Phase 7 cleanup" — Phase 7 has not happened                                  |
| Exam lifecycle             | `exam.published: bool` **and** `exam.settings.lifecycle_status: str` | both are written to                                                                                                                    |
| Code-challenge lifecycle   | `activity.details.lifecycle_status: str`                             | string, no enum, no validator                                                                                                          |
| Activity-level publish     | `activity.published: bool`                                           | mirrored from each kind's lifecycle                                                                                                    |
| Submission (canonical)     | `submission` table, 5-state machine                                  | DRAFT/PENDING/GRADED/PUBLISHED/RETURNED                                                                                                |
| Code submission (legacy)   | `code_submission` table                                              | PENDING/PROCESSING/COMPLETED/FAILED/PENDING_JUDGE0 — **different enum, same name**                                                     |
| Exam attempt (legacy)      | `exam_attempt` table                                                 | IN_PROGRESS/SUBMITTED/AUTO_SUBMITTED — **backfilled into `submission` on every teacher list call** via `_project_legacy_exam_attempts` |

The frontend's `useAssessment` hook tries to paper over this:

```ts
function lifecycleFromActivity(activity) {
  const raw = activity.details?.lifecycle_status;
  if (raw === 'DRAFT' || raw === 'SCHEDULED' || raw === 'PUBLISHED' || raw === 'ARCHIVED') return raw;
  return activity.published ? 'PUBLISHED' : 'DRAFT';
}
```

…which means the student-facing "is this published?" answer can disagree
with the teacher-facing "is this published?" answer for the same exam.

### 1.2 Anti-cheat policy lives in three places at once

Same six flags (copy-paste, tab-switch, devtools, right-click,
fullscreen, violation threshold) are modelled in:

1. `ExamSettingsBase` (Pydantic) — `copy_paste_protection`, etc.
2. `AssessmentPolicy.anti_cheat_json` (canonical, JSON column)
3. `AntiCheatPolicy` (TypeScript domain object) — different naming
   (`copyPasteProtection` vs `copy_paste_protection`)
4. Quiz uses `max_violations` instead of `violation_threshold`

Code challenges have no anti-cheat at all today, which is fine for an
LMS but means the policy surface is "exam has it, assignment quiz has
some of it, code has none" — three matrices to remember.

### 1.3 Settings are stored in multiple "compatibility mirrors"

`services/assessments/settings.py` is honest about this:

> "Deprecated compatibility mirror. Canonical settings live on
> `Activity.settings` and are read/written through
> `src.services.assessments.settings`."

But the code still writes both `activity.settings` AND
`exam.settings` AND `activity.details` for code challenges. A teacher
update can land in two different physical fields depending on which
endpoint they hit. The reader has to fall through three levels to find
the live value.

### 1.4 Submission paths are not unified

- **Assignment submit** → `submit_assignment_draft_submission` (own
  pipeline in `services/courses/activities/assignments/submissions.py`)
- **Quiz/exam/code submit** → `submit_assessment` (canonical pipeline
  in `services/grading/submit.py`)
- **Exam-via-frontend** → `apiFetch('exams/{uuid}/attempts/{uuid}/submit')`
  — bypasses the canonical pipeline and writes `ExamAttempt` directly,
  and is later reconciled by `_project_legacy_exam_attempts`
- **Code challenge** → writes `CodeSubmission`; an outer `Submission`
  may or may not exist depending on caller

The "unified" `submit_assessment` exists, but two of the four kinds
don't actually go through it.

### 1.5 Two parallel attempt shells

- `apps/web/features/assessments/shared/AttemptShell.tsx` — used by
  the public activity page (`activity.tsx`) under
  `_shared/withmenu/course/.../activity/[activityid]/`.
- `apps/web/features/assessments/shell/AssessmentLayout.tsx` — has
  focus mode, fullscreen gate, recovery dialog, action bar context.
- The "shell/" version is exported separately from the assessments
  feature index — and the public route doesn't use it.

So focus mode, anti-cheat enforcement, and recovery work in some
places and not others depending on which shell wraps the attempt.

### 1.6 "Quiz" means three different things

| Where                      | Shape                                      |
| -------------------------- | ------------------------------------------ |
| `TYPE_QUIZ` activity       | A quiz block inside an activity            |
| `BLOCK_QUIZ` block         | The actual storage for a quiz activity     |
| `AssignmentQuizTaskConfig` | A quiz embedded inside an assignment task  |
| Exam questions             | "Quiz-like" questions of a different shape |

Multiple-choice is implemented from scratch ≥ 4 times. None of them
share field names — `question_text` vs `questionText`, `option_id` vs
`optionUUID`, `is_correct` vs `assigned_right_answer`.

### 1.7 Per-item answer schema is loosely typed

`AssignmentTaskAnswer` has `file_key | text_content | form_data |
quiz_answers` all optional, discriminated by a `content_type` literal
that the type system cannot enforce. The frontend has to cast at
every consumer:

```ts
answer as { content_type?: 'file'; file_key?: string | null } | null
```

If a future kind adds a fifth shape, all four call sites must be
updated by hand.

### 1.8 File-upload pipeline is assignment-specific

`upload_submission_file` writes to:

```
courses/{course_uuid}/activities/{activity_uuid}/assignments/{assignment_uuid}/tasks/{assignment_task_uuid}/subs
```

…meaning exams and code challenges can't reuse it for "upload a file
as part of your answer" without bolting a parallel path. The current
assignment file upload also has these issues:

- The file is uploaded **before** the draft is saved. The UI even
  warns: "Files are uploaded first, then included in the assessment
  draft when you save." If the user closes the tab mid-flow, the
  upload is orphaned in object storage.
- Filename includes the user's email: `f"{task_uuid}_sub_{user.email}_{ULID()}.{ext}"`
  — this is a privacy and indexing footgun.
- No size/MIME validation on the server beyond a hard-coded extension
  whitelist.
- No virus scan, no quota, no idempotency key.

### 1.9 The studio surface is structurally inconsistent

`AssessmentStudioWorkspace` lays out three columns
(Outline | Author | Inspector). Two of the four kinds skip the
Outline column, and the layout mutates accordingly. The teacher gets
visually different chrome depending on the kind, with no guidance
that this is intentional.

The studio lifecycle controls in the topbar call `updateActivity`
with `details.lifecycle_status` — but assignments have a *real*
lifecycle endpoint (`POST /assignments/{uuid}/publish`) that the
studio doesn't use, so an assignment's `assignment.status` and its
`activity.published` flag can drift.

### 1.10 Validation is per-editor, not per-publish

Each task editor validates its own contents inline. Nothing checks
"can this assessment actually be published?" before you click
*Publish*. `StudioViewModel.validationIssues` exists in the type but
is hard-coded to `[]`. Teachers will routinely publish a
half-configured exam.

### 1.11 Optimistic locking is half-applied

`Submission.version` exists as an OCC counter. Teachers get a 412 if
they try to grade a stale submission. Students saving a draft *don't*
go through the version check at all — two open tabs silently overwrite
each other.

### 1.12 Generated TypeScript types leak Python module paths

```ts
export type SubmissionStatus =
  components['schemas']['src__db__grading__submissions__SubmissionStatus'];
```

If the file moves, every frontend import breaks.

### 1.13 Routes are nominally REST but operationally tangled

`/assignments/...`, `/exams/...`, `/code-challenges/...`,
`/grading/submissions/...`, `/grading/start`, `/grading/submit`,
`/courses/.../activities/...`, plus six lifecycle subroutes per kind.

A teacher who wants to "create an assessment, set its due date,
attach a rubric, publish it" has to make 5+ calls across 3+ routers,
each kind picking a different subset of available verbs.

---

## 2. Design principles for the new system

1. **One model per concept.** A submission is a submission; an
   assessment has one lifecycle; a policy is the policy. No
   "deprecated mirror" allowed to live longer than one PR.
2. **Items are pluggable, surfaces are shared.** A kind contributes
   *content* (item types, custom inspectors). The shell, action bar,
   policy, lifecycle controls, action verbs, and review UI are
   identical across kinds.
3. **Strong types at the boundary, loose types nowhere.** Discriminated
   unions on the wire and in the DB JSON. No `dict[str, object]`
   payloads escaping the validation layer.
4. **Storage = canonical; mirrors = removed, not "kept for compat."**
   When a column moves, the old column is dropped in the same
   release.
5. **The teacher and the student see the same lifecycle words.**
   "Draft → Scheduled → Published → Archived" everywhere, never
   `published: bool`.
6. **No special cases in the hot path.** No `if assessment_type ==
   EXAM: backfill_legacy(...)` on every teacher read.
7. **Production-ready means: idempotent, resumable, observable.**
   Drafts auto-save with a server-resolved timestamp; uploads are
   resumable with an ID issued before bytes are sent; every state
   transition emits a domain event.
8. **Uncomplicated by default.** Default UX is a single column with
   a sticky action bar. Inspectors and outlines are optional and
   collapsible, not load-bearing.

---

## 3. Target architecture

### 3.1 Data model

```
                    ┌────────────────┐
                    │    activity    │   (one per gradeable thing)
                    │  + activity_   │
                    │     type       │
                    └───────┬────────┘
                            │1
                            │
              ┌─────────────▼──────────────┐
              │       assessment            │  ← NEW unified table
              │  id, activity_id, kind,     │
              │  title, description,        │
              │  lifecycle, scheduled_at,   │
              │  published_at, archived_at, │
              │  weight, grading_type,      │
              │  policy_id (FK)             │
              └────┬─────────┬──────────────┘
                   │1        │1
                   │         │
        ┌──────────▼─┐    ┌──▼────────────────┐
        │ assessment │    │  assessment_      │
        │   _item    │    │   _policy         │  ← already exists
        │ id, order, │    │  due_at, max_     │
        │ kind, body │    │  attempts, late,  │
        │ (JSON,     │    │  anti_cheat (one  │
        │ valid'd by │    │  source of truth) │
        │ kind)      │    └───────────────────┘
        └────┬───────┘
             │N
             │
        ┌────▼────────────────┐
        │     submission      │  ← already canonical
        │  + answers_json     │     (just enforce single path)
        │  + grading_json     │
        │  + version          │
        │  + status           │
        └────┬────────────────┘
             │N
             │
        ┌────▼────────────────┐
        │   grading_entry     │  ← already exists; promote to
        │  (audit/event log)  │     true audit-only role; stop
        │                     │     copying onto submission
        └─────────────────────┘
```

**Key changes:**

- New `assessment` table replaces three half-overlapping tables
  (`assignment`, `exam`, code-challenge-config-in-`activity.details`).
  One row per assessable activity, regardless of kind.
- All authoring content (tasks, questions, test cases, hints) becomes
  rows in `assessment_item`, discriminated by `kind`. `body` is a
  JSON column whose schema is enforced by a Pydantic discriminated
  union (one type per item kind).
- Lifecycle is a single column on `assessment`. `activity.published`
  is *derived* (read-only view) from `assessment.lifecycle ==
  PUBLISHED`. The boolean column on activity gets dropped.
- Policy is the existing `assessment_policy` table — already correct.
  The duplicate fields on `Exam.settings` get dropped. Anti-cheat is
  read from one place.
- `code_submission` and `exam_attempt` get migrated into
  `submission` and `grading_entry`, then dropped. No backfill on
  read.

### 3.2 API surface

**Eight verbs per assessment, regardless of kind.** No more
per-kind routers.

| Verb                                           | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| `POST   /assessments`                          | Create (kind in body, returns assessment + activity) |
| `GET    /assessments/{uuid}`                   | Read (teacher view — full)                           |
| `PATCH  /assessments/{uuid}`                   | Update metadata (title, description, due, policy)    |
| `POST   /assessments/{uuid}/lifecycle`         | Transition lifecycle. Body: `{to: 'PUBLISHED'        | 'SCHEDULED' | 'DRAFT' | 'ARCHIVED', scheduled_at?}` |
| `POST   /assessments/{uuid}/items`             | Append an item (task/question/test-case)             |
| `PATCH  /assessments/{uuid}/items/{item_uuid}` | Update one item                                      |
| `POST   /assessments/{uuid}/items:reorder`     | Reorder                                              |
| `DELETE /assessments/{uuid}/items/{item_uuid}` | Remove                                               |

Plus the existing **submission verbs** (already canonical):

| Verb                                            | Purpose                             |
| ----------------------------------------------- | ----------------------------------- |
| `POST   /assessments/{uuid}/start`              | Start an attempt (server timestamp) |
| `PATCH  /assessments/{uuid}/draft`              | Save draft answers                  |
| `POST   /assessments/{uuid}/submit`             | Submit                              |
| `GET    /assessments/{uuid}/me`                 | Read current user's submission(s)   |
| `GET    /assessments/{uuid}/submissions`        | Teacher: list submissions           |
| `PATCH  /grading/submissions/{uuid}` (existing) | Teacher: grade                      |

A separate `/uploads` family handles file submissions (see §3.5).

This collapses **22 + endpoints** in the current API into **15**, all
sharing a single permission/lifecycle/policy code path.

### 3.3 Item types (the only kind-specific surface)

```python
class AssessmentItem(SQLModelStrictBaseModel, table=True):
    id: int | None
    item_uuid: str
    assessment_id: int      # FK
    order: int              # within assessment
    kind: ItemKind          # enum (CHOICE, OPEN_TEXT, FILE_UPLOAD, FORM, CODE, MATCHING)
    title: str
    body_json: dict         # validated by ItemKind discriminator
    max_score: float        # 0..N, normalised to percent at grading
```

`ItemKind` discriminator drives:

- Editor component (Studio author panel)
- Attempt component (Student attempt panel)
- Review component (Teacher review detail panel)
- Auto-grader (or `needs_manual_review = True`)

```ts
// Frontend: a real discriminated union on the wire
type ItemBody =
  | { kind: 'CHOICE';      prompt: string; options: ChoiceOption[]; multiple: boolean }
  | { kind: 'OPEN_TEXT';   prompt: string; min_words?: number; rubric?: string }
  | { kind: 'FILE_UPLOAD'; prompt: string; max_files: number; max_mb: number; mimes: string[] }
  | { kind: 'FORM';        prompt: string; fields: FormField[] }
  | { kind: 'CODE';        prompt: string; languages: number[]; tests: TestCase[]; ... }
  | { kind: 'MATCHING';    pairs: MatchPair[] };

type ItemAnswer =
  | { kind: 'CHOICE';      selected: string[] }
  | { kind: 'OPEN_TEXT';   text: string }
  | { kind: 'FILE_UPLOAD'; files: { upload_id: string; filename: string }[] }
  | { kind: 'FORM';        values: Record<string, string> }
  | { kind: 'CODE';        language: number; source: string; latest_run?: RunResult }
  | { kind: 'MATCHING';    matches: { left: string; right: string }[] };
```

This **kills three things**:

- The four parallel multiple-choice implementations.
- The "what is the shape of `answer`?" cast at every UI consumer.
- The asymmetry where exam questions live in their own table while
  assignment quiz questions live in JSON.

### 3.4 Kinds become "presets," not first-class types

A "Kind" (Assignment / Exam / Code Challenge / Quiz) is still useful
as a teacher-facing label, but in the new system it is a **preset
over the same primitives** — not a separate schema:

| Kind           | Default policy                              | Allowed item kinds                   | Default UX                                                       |
| -------------- | ------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Assignment     | manual grading, no time limit, late allowed | OPEN_TEXT, FILE_UPLOAD, FORM, CHOICE | task list view, autosave, submit button                          |
| Exam           | timed, anti-cheat on, single attempt        | CHOICE, MATCHING, OPEN_TEXT          | one-question-at-a-time, navigation grid, fullscreen + violations |
| Code Challenge | auto-graded, multi-attempt, hints allowed   | CODE                                 | editor + tests panel + run/submit                                |
| Quiz           | auto-graded, short, ungated                 | CHOICE, MATCHING                     | scroll all questions, single submit                              |

When a teacher picks "Create Exam," we pre-fill the policy and
restrict the item picker — but it's still one `assessment` row with
one set of `assessment_item` rows.

### 3.5 File submissions: resumable uploads with explicit lifecycle

```
POST   /uploads                  → returns { upload_id, put_url, expires_at }
PUT    {put_url}                 → bytes (TUS or signed S3 PUT)
POST   /uploads/{upload_id}/finalize
        body: { sha256, content_type }
                                  → returns { upload_id, key, size }
DELETE /uploads/{upload_id}      → cancel before finalize
```

Then in an assessment answer:

```json
{ "kind": "FILE_UPLOAD", "files": [{ "upload_id": "ul_01H..." }] }
```

The submission save validates each `upload_id`:

- belongs to the current user,
- is finalized,
- has a content type matching the item's MIME constraint,
- is referenced exactly once (idempotency).

The current "upload first, save later" flow becomes "upload obtains
an id, save references it, server resolves to a real key." Orphans
are reaped by a periodic job (`upload_id` not referenced by any
`submission.answers_json` after 24h → delete).

Object-storage path becomes generic and not assignment-specific:

```
uploads/{user_uuid}/{yyyy}/{mm}/{upload_id}/{sha256}.{ext}
```

The user's email **is not** in the path.

### 3.6 Grading

Grading already has the right structure (canonical `Submission`,
`GradingEntry` for audit, `GradingBreakdown` per item). What's needed
is **enforcing a single write path**:

- Drop `_project_legacy_exam_attempts`.
- Migrate `code_submission` and `exam_attempt` into `submission` once
  via a one-shot migration; route all *new* submissions through the
  canonical `submit_assessment` pipeline.
- `Submission.final_score` and `Submission.grading_json` remain the
  read-side cache for the latest grade. `GradingEntry` is the
  immutable audit trail. Document this clearly so future authors
  don't re-introduce divergence.
- Apply `version` OCC to **student** draft saves too. A draft save
  with a stale version returns 409 with the latest server state.

### 3.7 Lifecycle: one state machine, one transition endpoint

```
        ┌────────┐ schedule  ┌───────────┐
        │ DRAFT  │──────────▶│ SCHEDULED │
        │        │◀──────────│           │
        └───┬────┘  cancel   └─────┬─────┘
            │                       │
            │ publish               │ scheduled time
            │                       │ reached
            ▼                       ▼
        ┌──────────────┐
        │  PUBLISHED   │
        └──────┬───────┘
               │ archive
               ▼
        ┌───────────┐
        │ ARCHIVED  │   (terminal)
        └───────────┘
```

- One state column on `assessment` (`AssessmentLifecycle`).
- `assessment.published_at`, `assessment.archived_at`,
  `assessment.scheduled_at` are timestamps that explain the *current*
  state.
- The `activity.published` boolean is replaced by a **read-only**
  computed view: `activity.is_published := exists(assessment where
  activity_id = ? and lifecycle = 'PUBLISHED')`. Easier than dragging
  the boolean column for another release.
- The `lifecycle` endpoint runs a **publish-readiness check** before
  allowing DRAFT/SCHEDULED → PUBLISHED. If `assessment_item` has
  invalid bodies, no items at all, or is missing required policy
  fields, the API returns 422 with an `issues: [{code, message,
  item_uuid?}]` array, and the studio surface shows them in the
  banner that today is hard-coded empty.

### 3.8 Frontend architecture

#### 3.8.1 Three product surfaces, one shell each

```
features/assessments/
  domain/                           ← types only, no React
    lifecycle.ts                    (already correct, keep)
    submission-status.ts            (already correct, keep)
    policy.ts                       (already correct, keep)
    items.ts                        ← NEW: discriminated union for items + answers
    view-models.ts                  (keep, populate the empty fields)

  shell/                            ← shared chrome for all three surfaces
    StudioShell.tsx                 (replaces AssessmentStudioWorkspace)
    AttemptShell.tsx                (replaces both current shells)
    ReviewShell.tsx                 (replaces ReviewLayout)
    components/
      LifecycleControls.tsx         (one Publish/Schedule/Archive control)
      PolicySheet.tsx               (one anti-cheat/due/attempt panel)
      AttemptActionBar.tsx          (sticky bottom save/submit/timer)
      AttemptGuard.tsx              (fullscreen+violation guard, single owner)
      AttemptRecoveryDialog.tsx     (single owner, no per-kind copies)
      SubmissionStatusBadge.tsx     (keep)
      ScoreSummary.tsx              (keep)
      KindIcon.tsx                  (one icon registry)

  items/                            ← one folder per ItemKind, all kinds use them
    choice/                         (Author / Attempt / Review / autoGrader)
    open-text/
    file-upload/
    form/
    code/
    matching/
    registry.ts                     ← one map: kind → modules

  presets/                          ← Kind = preset over items+policy
    assignment.ts                   (default item set, default policy)
    exam.ts
    code-challenge.ts
    quiz.ts

  hooks/
    useAssessment.ts                (fix the empty fields)
    useAssessmentSubmission.ts      ← NEW: shared draft+submit+autosave hook
                                      (replaces 4 hand-rolled copies)
```

Routes:

```
/assessments/[uuid]                    ← student attempt (one shell, one route)
/dash/assessments/[uuid]/studio        ← teacher author
/dash/assessments/[uuid]/review        ← teacher review
/dash/assessments/[uuid]/analytics     ← (kept; uses same data layer)
```

The current `/course/{courseuuid}/activity/{activityid}` route stays
as a redirect to `/assessments/{uuid}` if the activity is assessable
— with no special-casing per kind.

#### 3.8.2 Drop the `assignments/` and `assessments/` split

Today there are **two top-level features**: `features/assessments/`
and `features/assignments/`, with imports crossing between them and
overlapping concerns (`task-editors` lives under `assignments/`,
called from `assessments/registry/assignment/...`). Merge into the
single `features/assessments/` layout above. `features/assignments/`
is removed.

#### 3.8.3 One submission/draft hook

```ts
function useAssessmentSubmission(activityUuid: string) {
  // Owns: draft fetch, autosave debounce, dirty state, submit,
  //       version OCC, recovery, optimistic UI, toast on errors.
  // Returns: { answers, setItemAnswer, save, submit, status, saveState, ... }
  // Used by every kind's Attempt component instead of hand-rolling.
}
```

Today this logic is duplicated across `AssignmentAttemptContent`,
`ExamAttemptContent`, `CodeChallengeAttemptContent`, and the embedded
quiz attempt with subtly different behaviour (e.g., exam doesn't
autosave to the server, only to localStorage). Centralizing it makes
"autosave + recovery + OCC + dirty UI" a single thing the platform
does correctly once.

#### 3.8.4 Studio: a default 2-column layout

Three columns is great when you have an Outline; otherwise the third
gap looks broken. New rule:

- **Column 1: editor (always).** `kindModule.Author` plus the shared
  metadata block.
- **Column 2 (sheet/drawer on small screens, collapsible on large):**
  Inspector. Item list, policy, lifecycle preview, validation issues.
  Always rendered, even if the kind has no extra inspector — defaults
  to the policy + items list.

Outline (current 1st column) is folded into the Inspector as a
collapsible "Items" section. Less branching in the layout, fewer
"this kind does/doesn't have an outline" decisions.

#### 3.8.5 Attempt: linear by default, paginated on opt-in

- Default: scroll through items, autosave on blur.
- Exam preset opts in to paginated mode with `ExamQuestionNavigation`
  in the Inspector.
- The action bar (save/submit/timer/violations) is always the same
  component, driven by the same context.

#### 3.8.6 Review: keep the 3-pane shell, fix the data model

Review already has a coherent layout
(`SubmissionList | SubmissionInspector | GradeForm`). What it needs:

- A **per-item review surface** that uses the same item registry as
  the studio + attempt. Today only assignments and exams have
  bespoke review detail; code and quiz fall back to a generic JSON
  dump. After unification, every item kind contributes its own
  `Review` component automatically.
- **Keyboard hints made visible** (the `j`/`k` shortcut is hidden
  behind a tooltip that auto-shows once and never again).
- **A "needs grading" filter that survives a refresh** (currently
  defaults oddly when `initialSubmissionUuid` is set).

### 3.9 Permissions

Replace the hard-coded per-kind permission map with a single
permission name family:

```
assessment:author      (create/edit/delete assessment + items)
assessment:publish     (lifecycle transitions)
assessment:submit      (student submit)
assessment:grade       (teacher grade)
assessment:read        (teacher read submissions)
```

…and resolve resource ownership through the assessment row's
course/activity, not the kind. The current oddity where
"`code_challenge` uses `assignment:submit`" goes away.

---

## 4. UX redesign (concrete decisions)

### 4.1 Teacher flow: create → author → publish

1. **Create (1 click).** From a course chapter, a single "Add
   assessment" button opens a sheet asking *only* for the kind
   (Assignment / Exam / Code Challenge / Quiz) and a title. Submit
   creates the activity + assessment with sensible preset policy.
   No 4-form modal.
2. **Author (one screen).** Studio loads. Left = editor, right =
   inspector with collapsible Items, Policy, Lifecycle. Items
   add/remove inline; reorder is drag handle. Autosave per item with
   a single "Saved 4s ago" indicator at the top. No per-section
   "Save" buttons.
3. **Publish (one button, one preflight).** "Publish" runs the
   readiness check; if anything fails, the inspector banner shows
   exact issues with "Jump to" links. If it passes, an alert dialog
   shows the policy summary and a single confirm button.
4. **Schedule** is the same button with a date input next to it; no
   secondary modal.
5. **Archive** is in the inspector under "Lifecycle," not the topbar
   (rare action, hide it).

### 4.2 Student flow: enter → attempt → submit → see result

1. **Enter.** A single page at `/assessments/{uuid}`. The header
   shows the title, kind label, due date, and (if applicable) timer
   pre-start. A "Start" button if the kind is timed; otherwise items
   render immediately.
2. **Attempt.** Items render in the order set by the teacher. Each
   item has a clear "answered/unanswered" affordance. Autosave is
   silent except for the single "Saved 4s ago" indicator. Errors are
   inline ("This file is too large") rather than toast-only so users
   can fix them.
3. **Submit.** A sticky bottom bar with primary "Submit" and (for
   draftable kinds) "Save". Submit opens a single confirmation
   listing how many items are answered/unanswered and any policy
   warnings (late, no more attempts).
4. **Result.** After submission, the same page shows the result
   panel below the items: score, per-item feedback, return-for-
   revision banner if applicable. No second navigation.
5. **Returned for revision** uses the *same* attempt page; just the
   action bar changes to "Save" + "Resubmit," with the previous
   feedback shown above each affected item.

### 4.3 File upload UX

- "Drop files here or click to upload" zone.
- Each file shows progress, sha256 verifying, and a remove button.
- A file is "attached to your draft" only after finalize succeeds.
- If the user closes the tab mid-upload, returning to the page shows
  *resumable* uploads (TUS) — they continue from where they left
  off.
- The validation errors (size, MIME) appear *before* the upload
  starts whenever possible.

### 4.4 Anti-cheat UX

- One sheet listing: copy-paste, tab-switch, devtools, right-click,
  fullscreen, with a single "Violations remaining: N/M" indicator.
- The shell shows it as a status pill in the top bar during the
  attempt.
- Teachers see a "Violation log" tab in submission review with
  timestamps and types, never auto-zeroing without explanation.

### 4.5 Status language is consistent

Everywhere the UI talks about an assessment's lifecycle, it uses:

| Word      | Meaning                        |
| --------- | ------------------------------ |
| Draft     | Editable, hidden from students |
| Scheduled | Will publish at scheduled time |
| Published | Visible to students            |
| Archived  | Read-only, no new submissions  |

…and for submissions:

| Word           | Meaning                                   |
| -------------- | ----------------------------------------- |
| In progress    | Student is working (server-side: DRAFT)   |
| Awaiting grade | Submitted, not yet graded (PENDING)       |
| Graded         | Teacher graded, not yet released (GRADED) |
| Released       | Visible to student (PUBLISHED)            |
| Returned       | Sent back for revision (RETURNED)         |

No `published: bool`, no `IN_PROGRESS` vs "In progress" inconsistency,
no "submitted" + "auto-submitted" leaking out of the database into the
UI label.

---

## 5. Migration plan (sequenced, reversible)

Each step lands as one or more PRs. **Every step is shippable on its
own** and leaves the system in a working state.

### Phase 0 — Foundations (1 sprint)

- Define `assessment` and `assessment_item` SQLAlchemy models
  alongside the existing tables. Don't write to them yet.
- Define the `ItemBody` / `ItemAnswer` discriminated unions in
  Pydantic + TypeScript. Add the OpenAPI spec entries.
- Add a `lifecycle:transition` endpoint that wraps the existing
  per-kind logic but exposes one verb. Frontend keeps using per-kind
  endpoints.
- Add `assessment:*` permission names alongside existing ones; map
  per-kind names to them in the resolver.
- Frontend: add the `useAssessmentSubmission` hook and route one
  kind (assignment) through it as a proof of concept.
- Add a publish-readiness check service; wire it to assignment's
  publish endpoint as a pilot.
- **Deliverable:** new types and one verb exist; nothing breaks.

### Phase 1 — Backfill into the new tables (1 sprint)

- Write a one-shot migration: read every `assignment`, `exam`,
  `code_challenge` (`activity.details`) row, write equivalent
  `assessment` + `assessment_item` rows. Verify with a count check
  - spot diff in CI.
- Old tables stay; new tables are read-shadow only.
- Add a feature flag `read_assessments_from_unified_table` (default
  off). When on, all read endpoints serve the new tables.
- Run in shadow mode in prod for one sprint, comparing payloads.
- **Deliverable:** dual-write absent, dual-read available, verified.

### Phase 2 — Cut over reads (½ sprint)

- Flip the flag in staging, then prod.
- Add a `dual-write` flag for the next sprint so writes land in
  both old and new tables. Default *off* once tests are green.
- Old reads (`/assignments/{uuid}`, etc.) become thin compatibility
  views over the new model.
- **Deliverable:** new model is canonical for reads.

### Phase 3 — Cut over writes (1 sprint)

- Implement the eight unified verbs against the new model.
- Switch the studio frontend to call them. Per-kind write endpoints
  become deprecation-warning passthroughs.
- Migrate `code_submission` rows into `submission` + `grading_entry`
  via one-shot migration. Drop `_project_legacy_exam_attempts`.
- Remove the `code_submission` and `exam_attempt` tables in a
  follow-up release after one sprint of telemetry confirms zero
  reads.
- **Deliverable:** one path for assessments and submissions; old
  tables empty.

### Phase 4 — UI consolidation (1 sprint)

- Merge `features/assignments/` into `features/assessments/`.
- Replace both attempt shells with the unified `AttemptShell`.
- Replace per-kind submission hooks with `useAssessmentSubmission`.
- Refactor the items registry to be the single source for editor,
  attempt, review, and grader.
- Reroute `/course/.../activity/{activityid}` to
  `/assessments/{uuid}` for assessable activities.
- Add the publish-readiness banner to the studio surface, populating
  `validationIssues`.
- **Deliverable:** one shell per surface; one items folder; one
  hook.

### Phase 5 — File upload pipeline (½ sprint, parallelizable with 4)

- Implement the resumable upload endpoints + finalize/cancel.
- Frontend `FileUploadAttempt` switches to `upload_id` references.
- Old assignment-specific upload route becomes a thin wrapper that
  produces an `upload_id` from a single-shot upload and finalizes
  immediately, until clients migrate.
- Add the orphan reaper job.
- Remove the user's email from object paths.
- **Deliverable:** one upload pipeline; resumable; no PII in keys.

### Phase 6 — Cleanup (½ sprint)

- Drop `assignment.published`, `exam.published`,
  `exam.settings.lifecycle_status`, `code_submission`,
  `exam_attempt` tables.
- Remove every `_project_legacy_*`, `lifecycleFromExamPublished`,
  `submissionStatusFromAttemptStatus` shim.
- Remove the per-kind permission names from the resolver.
- Delete `features/assignments/` directory.
- Frontend OpenAPI generation now produces clean type names — fix
  the leak `components['schemas']['src__db__grading__submissions__SubmissionStatus']`.
- **Deliverable:** no compatibility code left in the repo.

### Phase 7 — Polish (½ sprint)

- Apply the studio 2-column layout.
- Apply the keyboard hint visibility fixes in review.
- Add per-item review components for the kinds that fall back to
  generic JSON today.
- Add violation-log tab in review.
- Run a UX pass on the student attempt page (mobile especially).
- **Deliverable:** the redesigned UX promised in §4.

---

## 6. What we're explicitly **not** doing

These appeared in the audit but should *not* be part of this plan
unless we change scope:

- **A new authoring DSL or block editor.** The existing block system
  for non-assessment activities stays. Items here are simpler
  structured types, not freeform blocks.
- **AI grading or AI item generation.** Out of scope. Hooks remain
  open but no implementation work.
- **Cross-course assessment templates / library.** Out of scope.
- **Custom question types beyond the six listed.** Adding a new
  `ItemKind` is a one-file change after Phase 4, but we ship the
  six core kinds first.
- **Realtime collaborative authoring.** Out of scope. Single-author
  optimistic locking only.

---

## 7. Risk register

| Risk                                                            | Mitigation                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read/write divergence during dual-write window                  | Shadow-read CI check that compares payloads byte-for-byte; alert on any diff > 0                                                                                   |
| Frontend type generation rewrites break consumers               | Land Phase 4 *before* renaming OpenAPI schemas in Phase 6; use codemod for type-name migration                                                                     |
| File upload migration leaves old files unreachable              | Old paths stay readable via a fallback resolver; new uploads only land in new layout; reaper has a 90-day grace window                                             |
| Teachers in the middle of authoring during Phase 3 cut-over     | Cut-over runs at low-traffic window; in-flight studio sessions get a banner "Saved as draft; reload to continue" with a one-shot reconciliation                    |
| Code-challenge submissions in flight during legacy-table drop   | Phase 5 only drops the table after telemetry confirms zero reads for ≥ 7 days                                                                                      |
| Anti-cheat flag rename breaks existing exams                    | Migration copies all six flags from `exam.settings` into `assessment_policy.anti_cheat_json`, verified per-row in CI                                               |
| OCC on student drafts surprises users with 409s                 | UI handles 409 by merging server state and re-applying local changes; only the version mismatch on conflicting fields shows a "your changes were not saved" banner |
| The "merge `features/assignments/`" PR is huge and unreviewable | Split into one PR per moved file; pre-land a shim re-export so paths can change incrementally                                                                      |

---

## 8. Definition of done

The redesign is complete when:

1. **One model.** A grep for `class Assignment(`, `class Exam(`,
   `class CodeSubmission(`, `class ExamAttempt(` returns zero hits.
2. **One submit path.** `submit_assessment` is the only function that
   creates non-DRAFT `submission` rows.
3. **One lifecycle endpoint.** `POST /assessments/{uuid}/lifecycle`
   is the only verb that changes lifecycle. Per-kind publish/archive
   routes return 308 redirect.
4. **One frontend feature folder for assessments.**
   `features/assignments/` is gone.
5. **One attempt shell.** A grep for `AttemptShell` shows one file.
6. **One items registry.** A grep for `registerKind` shows one map
   covering all four kinds; `registerItemKind` shows one map covering
   the six item kinds.
7. **No compatibility shims.** Zero `_project_legacy_*`, zero
   `lifecycleFromExamPublished`, zero `submissionStatusFromAttemptStatus`.
8. **Publish-readiness gate works.** Trying to publish an empty exam
   returns 422 with a non-empty `issues` array, and the studio shows
   the issues with "Jump to" links.
9. **Generated TS types are clean.** No
   `components['schemas']['src__db__grading__submissions__SubmissionStatus']`.
10. **Student can resume an interrupted attempt** (closed tab during
    file upload, OCC conflict on save, recovered local draft) with no
    data loss in the happy path and clear messaging in the conflict
    path.
11. **Documentation reflects reality.** A new `docs/ASSESSMENTS.md`
    explains the model, the lifecycle, and how to add a new
    `ItemKind`. The phrase "deprecated mirror" appears nowhere.

---

## 9. Open questions (need product / design input)

1. **Per-item rubrics.** Is rubric-based grading in scope for this
   redesign, or stay item-level `feedback + score` only?
2. **Group submissions.** Several Kazakhstan-curriculum exams are
   pair/group-graded. Out of scope here; if needed, it changes
   `submission.user_id` to `submission_user[]`.
3. **Re-attempts model.** Today: each re-attempt is a new
   `submission` row, one-at-a-time. Confirm this is the expected
   product behaviour (vs editing a single submission with an
   `attempt_log`).
4. **Anti-cheat: violation auto-zero default.** Currently exam
   default is 3 violations → auto-zero. Keep this default for the
   new unified policy?
5. **Late policy: per-assessment vs per-course.** Course-level
   default with per-assessment override, or always per-assessment?
6. **Quiz blocks inside non-assessment activities.** Out of scope?
   They become standalone quiz assessments? Today they live in
   `BLOCK_QUIZ` and are not migrated by this plan.
7. **Code challenge plagiarism (MOSS).** Already a column on
   `code_submission`. Keep behaviour by moving the column onto
   `submission.metadata_json.plagiarism_score`?

---

## 10. Acceptance test scenarios

Smoke tests we'd run end-to-end after each phase:

- **Teacher creates an assignment with file + form + quiz items, sets
  due-date, publishes.** Student sees it; submits; teacher grades and
  publishes the grade. CSV export contains the row.
- **Teacher creates an exam with anti-cheat enabled, schedules it
  one minute in the future.** Student waits; receives access at the
  scheduled time; takes the exam; auto-grade runs; result shows.
- **Teacher creates a code challenge with three test cases (two
  visible, one hidden).** Student submits buggy code → 1/3 passing →
  fixes → 3/3. Submission count increments, leaderboard updates.
- **Student starts a long assignment, uploads a 50 MB file, closes
  the tab mid-upload.** Returns 30 minutes later: upload resumes
  from where it stopped; on submit, file is attached.
- **Two teachers grade the same submission concurrently.** Second
  save returns 412; UI merges and re-prompts; final grade is the
  later one.
- **Teacher returns an exam attempt for revision.** Student sees the
  per-item feedback, edits the failing answers, resubmits. Teacher
  re-grades; XP is awarded once (not twice).
- **Migration acceptance.** All existing assignment/exam/code rows
  are visible in the unified `/assessments/...` UI with identical
  field values to the legacy `/assignments/...` UI.
