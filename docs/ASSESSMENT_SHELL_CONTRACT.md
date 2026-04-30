# Assessment Shell Contract

This contract defines how assessment kinds plug into the shared Studio, Attempt,
and Review surfaces.

## Registry Module

Each kind registers a `KindModule` in `features/assessments/registry`.

Required slots:

- `Author`: the Studio center panel.
- `Attempt`: the student attempt body.
- `Review`: the review workspace entry point.

Optional slots:

- `Provider`: wraps outline, author, and inspector when the kind needs shared
  authoring state.
- `Outline`: Studio left rail.
- `Inspector`: Studio right rail. If omitted, the shared `PolicyInspector`
  renders the kind's `PolicyView`.
- `ReviewDetail`: kind-aware submitted work detail for the shared review
  workspace.

## View Models

Shells read view models from `useAssessment()`.

- `StudioViewModel` supplies lifecycle, editability, validation issues, and
  `PolicyView`.
- `AttemptViewModel` supplies title, due date, submission status, release state,
  normalized score, policy, and submit/save permissions.
- `ReviewQueueItemViewModel` supplies queue status, release state, normalized
  score, late state, and allowed teacher actions.

Kinds may fetch additional content data inside their slot, but they should not
reimplement shell chrome.

## Attempt Controls

Attempt slots register runtime controls with `useAttemptShellControls()`.

Supported controls:

- `saveState`, `canSave`, `isSaving`, `onSave`
- `canSubmit`, `isSubmitting`, `onSubmit`
- `navigation` with current, total, answered, previous, and next
- `timer` with start time, limit, and expiry callback
- `policy`, `initialViolationCount`, `onViolation`, `onGuardAutoSubmit`
- `recovery` prompt metadata and accept/reject callbacks

The shell mounts `useAttemptGuard()` when any anti-cheat flag is enabled in
`policy.antiCheat`.

## Policy And Score

All policy UI should read from `PolicyView`, not from kind-specific settings
objects. All score UI should read `NormalizedScore`; point totals may be shown as
supporting detail, but the canonical display scale is 0-100 percent.

## Adding A Kind

To add a kind, create one folder under `features/assessments/registry/` with:

- `Studio.tsx`
- `Attempt.tsx`
- `Review.tsx`
- one adapter that maps backend data into the shared view models

The shared shells, gradebook, activity router, and review workspace should not
need changes for a new kind.
