# Course Management Critical Analysis

## Executive Summary

The current course management system is not failing because it lacks features. It is failing because
too many architectural ideas are active at the same time.

There is a clear newer direction in the codebase: a management-first course index, a course
workspace shell, stage-based access control, readiness scoring, and shared save/dirty hooks. But
that new layer mostly wraps the older course editor instead of replacing it. The result is a system
that looks unified from the outside while remaining fragmented internally.

In practice, the workflow is overcomplicated in four ways:

1. The same concerns are implemented in multiple layers.
2. The user is forced through too many concepts before they can publish a course.
3. Different screens use different editing models without a clear rule.
4. Cache invalidation, permission checks, and editor state are spread across too many places.

This is classic transitional overengineering: the code has abstractions for the future, legacy flows
from the past, and glue code connecting both.

## What The Current Workflow Looks Like

Today the course management experience is roughly:

1. Open a dashboard-style course index with summaries, presets, bulk actions, view modes,
   pagination, and row-level actions.
2. Create a course through a multi-step wizard with template selection, source course selection,
   URL-persisted state, and launch destination choice.
3. Enter a course workspace with stage tabs for overview, details, curriculum, access,
   collaboration, certificate, and review.
4. Edit each stage through a mixture of new workspace UI and older section-specific editor
   components.
5. Publish only after satisfying a readiness model that treats multiple optional concerns as part of
   a single completion gate.

That is a lot of product and technical surface area for what should fundamentally be: create course,
add content, set access, publish.

## Why It Is Overcomplicated

### 1. Authorization And Capability Resolution Are Repeated Across Route Layers

The route tree performs overlapping authorization work:

- `apps/web/app/orgs/[orgslug]/dash/courses/layout.tsx` checks broad course permissions.
- `apps/web/app/orgs/[orgslug]/dash/courses/[courseuuid]/layout.tsx` fetches course workspace
  capabilities.
- Stage pages sometimes call `requireCourseWorkspaceStageAccess(...)` directly.
- `renderCourseWorkspacePage(...)` can also call `requireCourseWorkspaceStageAccess(...)` again when
  capabilities are not passed in.
- Client components still branch on capabilities or client permissions after server checks already
  ran.

This is not just verbose. It creates a system where it is hard to know which layer is authoritative.
A simpler design would resolve capabilities once on the server for the workspace request and pass
that single capability object down.

### 2. The New Workspace Shell Wraps Legacy Editors Instead Of Replacing Them

The workspace shell is new. Most stage implementations are not.

Examples:

- Overview and review are purpose-built workspace screens.
- Details, access, collaboration, certificate, and curriculum still mount older `EditCourse...`
  components under the new shell.
- The shared hook comments already admit that dirty-state handling was previously copy-pasted across
  old editors and then centralized later.

This means the codebase is paying for both systems at once:

- new shell navigation
- new readiness model
- new stage capability model
- old editor components
- old save patterns
- old service coupling

The product appears simpler than the implementation really is.

### 3. The Editing Model Is Inconsistent

This is one of the biggest sources of cognitive load.

The system currently mixes three editing models:

1. Staged forms with save/discard
2. Immediate mutations with optimistic local updates
3. Immediate mutations with server refresh after every action

Examples:

- Details uses local form state plus explicit save/discard.
- Access uses staged visibility changes, but user group linking/unlinking inside the same screen is
  immediate.
- Contributors has a staged toggle for `open_to_contributors`, but contributor add/update/remove
  actions are immediate.
- Curriculum applies changes immediately and even optimistically reorders local state before server
  confirmation.
- Review can publish or privatize immediately.

This means one page can contain conflicting mental models. The user has no simple answer to: "Does
this screen auto-save or not?"

That is a workflow failure, not just an implementation detail.

### 4. The Workspace Provider Has Become A Catch-All State Container

`CourseProvider` currently carries:

- canonical course metadata
- editor-side bundle data
- loading state
- dirty section registry
- readiness derivation
- conflict dialog state
- refresh methods

This looks clean on paper, but it centralizes too many unrelated concerns.

The provider is no longer only "course data". It is now course data, editor orchestration,
navigation protection, mutation recovery, and readiness reporting. That makes every new workspace
feature more likely to attach itself to the provider rather than owning its logic locally.

This is a common overengineering trap: a context starts as a convenient container and slowly becomes
a mini-framework.

### 5. Readiness Is Over-Productized

The readiness system is polished, but too rigid.

A course is treated as "ready" only when all of these are complete:

- details
- media
- curriculum
- collaboration
- access
- certificate

That may be useful as an internal quality checklist, but it is too strong as a universal publishing
gate.

In many real systems:

- a certificate is optional
- multiple contributors are optional
- private access without linked groups may still be valid temporarily
- thumbnail quality should be recommended, not always block publication

The current design turns guidance into process. That is product overengineering.

### 6. The Create Flow Is More Complex Than The Underlying Operation

Creating a course should be one of the simplest actions in the system. Instead, the wizard adds:

- multi-step navigation
- URL-synchronized draft state via query params
- template types
- source course import mode
- launch destination choice
- legacy parameter normalization

The underlying operation still creates one course record and optionally creates starter chapters or
chapter shells from another course.

The setup complexity is disproportionate to the outcome.

This is a good example of premature workflow design. The UI is optimized for flexibility before the
base authoring flow has been made truly simple.

### 7. The Course Index Does Too Many Jobs

The course list page is simultaneously:

- a management dashboard
- a search page
- a readiness monitor
- a filtering surface
- a bulk operations tool
- a table/cards toggle
- a creation entry point

None of these are wrong individually. Together they create a very dense control surface.

The result is that course management begins with a screen that behaves like an admin console instead
of a straightforward workspace launcher.

### 8. Cache Invalidation Logic Is Distributed Across Service Modules

Mutation functions in services own custom revalidation behavior, for example in:

- `services/courses/courses.ts`
- `services/courses/chapters.ts`
- `services/courses/activities.ts`

This is directionally better than random client-side refreshes, but it is still too fragmented.
Every mutation type partially redefines invalidation rules. Some client code still calls
`router.refresh()` or `refreshCourseMeta()` after those server-side revalidations anyway.

That means the system often pays for both explicit invalidation and follow-up refetching.

This is not simplicity. It is overlapping freshness strategies.

### 9. The Layering Is Leaky

One concrete example: `services/courses/chapters.ts` imports `OrderPayload` from a UI component
path:

- `@components/Dashboard/Pages/Course/EditCourseStructure/EditCourseStructure`

That is a strong sign the boundaries are wrong. Service-layer types should not depend on component
files. When lower layers import upward, abstractions are not actually abstractions.

This kind of coupling is what makes later simplification expensive.

### 10. The Backend Summary Flow Is Simpler Than It Looks, But Operationally Heavy

`list_editable_courses_orgslug(...)` computes summary counts and preset filtering by loading all
editable courses with `limit=10_000`, building insights in Python, then slicing in memory.

That is not elegant backend design. It is an expensive fallback hidden behind a polished frontend.

So the system is overengineered in presentation while still underdesigned in the query layer.

## Why This Feels Hard To Work With

### For users

- Too many tabs before a course feels publishable.
- Too many concepts: readiness, visibility, collaboration, certification, review, launch
  destination, templates.
- Not enough clarity about which changes save immediately.

### For developers

- Too many places to change permissions.
- Too many places to update cache invalidation.
- Too many component layers around the same course object.
- Too much migration residue between old editor flows and new workspace abstractions.

## Root Cause

The root problem is not "too many files". The root problem is that the system is trying to solve
three different product shapes at once:

1. A legacy course editor
2. A new guided workspace
3. An admin-style course operations dashboard

Instead of choosing one primary model and demoting the others, the code keeps all three alive.

## How To Make It Simpler

## 1. Reduce The Product Model To Three Core States

Replace the current mental model with:

1. Drafting
2. Access
3. Publish

That means:

- Merge overview into the main course workspace home or remove it.
- Treat review as a publish panel, not a separate stage with its own mini-dashboard.
- Keep certificate and collaboration as secondary settings, not mandatory workflow milestones.

## 2. Make One Server Call The Source Of Truth For Workspace Access

Do capability resolution once per workspace request.

Recommended approach:

- Resolve workspace capabilities in the course route layout.
- Pass capabilities through to all child pages.
- Remove duplicate stage access resolution from page helpers where possible.
- Keep client-side permission checks only for small conditional UI, not as a second authorization
  model.

## 3. Standardize Editing Behavior By Category

Pick one rule per section type.

Suggested rule set:

- Details, access, certificate: staged forms with save/discard.
- Curriculum: immediate operations with strong conflict handling.
- Collaboration: immediate operations only.

Then enforce that rule consistently inside each screen.

For example, the access screen should not mix staged course visibility with immediate user-group
mutations unless those mutations are visually separated into a distinct "linked groups" tool area.

## 4. Narrow The Provider Back Down

`CourseProvider` should own only:

- canonical course snapshot
- editor bundle snapshot
- refresh methods

Move the following out of the provider:

- dirty section registry
- unsaved changes ownership rules
- conflict modal orchestration if possible
- screen-specific state derivations that are only consumed in one area

Readiness can remain a pure helper derived close to the workspace shell or review panel, but it does
not need to shape the entire provider contract.

## 5. Downgrade Readiness From Gate To Guidance

A simpler publish rule would be:

- name present
- description present
- at least one activity exists
- access state is valid

Everything else should be advisory.

Recommended model:

- blocking checks: minimum needed for a valid course
- recommended checks: thumbnail, collaboration, certificate, richer metadata

That preserves quality signals without forcing every organization into the same course lifecycle.

## 6. Collapse Course Creation Into A Short Form

The creation flow should probably be one page or one modal with:

- course name
- short description
- visibility
- optional "start from existing course" selector

Then create the course and take the user directly to curriculum.

Only keep starter templates if usage data proves they matter. Otherwise remove them.

The launch destination option should also go away. It adds one more decision before the user even
sees their course.

## 7. Simplify The Index Page Around Primary Actions

The course index should prioritize:

- find course
- open course
- create course

Everything else should be secondary:

- bulk actions behind a clear management mode
- readiness badges as metadata, not the main purpose of the page
- cards/table choice only if it is genuinely used

This would make the first screen feel like a workspace launcher, not an operations cockpit.

## 8. Centralize Mutation And Revalidation Rules

Create one domain mutation layer for course workspace actions.

For example:

- `saveCourseDetails`
- `saveCourseAccess`
- `reorderCurriculum`
- `addContributor`
- `removeContributor`
- `publishCourse`

Each function should own:

- payload normalization
- concurrency token handling
- cache invalidation
- error normalization

Then components stop assembling that behavior themselves.

## 9. Fix The Architecture Boundary Violations

Move shared types out of component files.

Examples of better homes:

- `lib/course-management.ts`
- `services/courses/types.ts`
- `types/course-management.ts`

The rule should be simple: services can depend on domain types, never on React component modules.

## 10. Replace The Full-Scan Summary Query

The course dashboard summary should be computed in the database, not by fetching up to 10,000
courses and post-processing them in Python.

Even a simpler first pass would be better:

- compute summary counts in dedicated aggregate queries
- page only the visible rows
- avoid building full readiness insight objects for off-screen items when not needed

This is one of the rare places where the simpler architecture is also the more scalable one.

## Suggested Target Workflow

The simplest sustainable workflow is:

1. Create course
2. Add chapters and activities
3. Fill in details
4. Set access
5. Publish

Optional settings such as certificate and collaboration should remain available, but they should not
define the primary workflow.

## Suggested Refactor Order

If this needs to be done incrementally, the highest-value order is:

1. Standardize editing behavior per stage.
2. Remove duplicate capability resolution paths.
3. Simplify publish readiness into blocking vs advisory checks.
4. Collapse the create wizard.
5. Extract domain types out of component modules.
6. Centralize course workspace mutations.
7. Replace the full-scan dashboard summary implementation.

## Bottom Line

The current system is overcomplicated because it tries to be a workflow engine, a content editor,
and an admin console at the same time.

It is overengineered because many concerns are abstracted twice: once in the new workspace
architecture and again in the legacy editor/service patterns still running underneath it.

The way forward is not a bigger rewrite. It is choosing one dominant model and deleting the
competing ones.

The correct dominant model is a simple course workspace built around a small number of clear
authoring steps, with optional advanced settings that do not hijack the entire experience.
