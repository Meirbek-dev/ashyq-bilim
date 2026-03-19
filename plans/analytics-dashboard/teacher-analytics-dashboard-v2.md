# Teacher Analytics Dashboard v2

## Document Status

- Scope: extend the shipped teacher analytics MVP into a production-ready analytics product
- Audience: backend, frontend, data, QA, and operations owners working in this repository
- Goal: define the next implementation phase based on what is already in the codebase, not the
  earlier greenfield plan

## Executive Summary

Teacher analytics is no longer theoretical in this repository. The product already ships a dedicated
analytics router, scoped teacher analytics pages, exports, shared analytics types, and a first set
of chart-driven views. The current implementation is useful, but it is still an MVP built on live
queries and whole-scope in-memory aggregation.

v2 should convert that MVP into a teacher operating surface that is fast, explainable, and safe to
run at org scale. The work is not just "add more charts." It is to:

- deepen the product so teachers can act, not just observe
- use the shared chart primitives for multi-series and comparison views rather than one-metric
  widgets only
- harden the analytics data path so freshness, performance, and exports are production-grade
- make filters, drill-downs, and tables behave like operational tools

## Confirmed Current Implementation Baseline

The following is already present in the repository today.

### Backend

- Dedicated analytics router under `GET /api/v1/analytics/...`
- Teacher overview, course list, course detail, assessment list, assessment detail, at-risk
  learners, and CSV export endpoints
- Shared analytics filter parsing and teacher scope resolution
- RBAC support for `analytics:read:assigned`, `analytics:export:assigned`, and `analytics:read:org`
- Live-query analytics services under `apps/api/src/services/analytics/`
- Basic analytics tests for overview, courses, assessments, and exports
- Rollup table models and migrations exist, but the refresh service is still a stub

### Frontend

- Teacher analytics routes under the org dashboard shell
- Navigation gating through `canSeeAnalytics`
- Overview page with KPI cards, alert cards, grading backlog panel, course table, assessment table,
  and at-risk learner preview
  - Course detail page with engagement trend, completion funnel, chapter drop-off funnel, content
    health cards, assessment outliers, and at-risk learners
- Assessment detail page with score distribution, attempt distribution, question difficulty radar,
  common failures, and learner rows
- Shared analytics service client and analytics types
- Shared shadcn-style chart wrapper in `apps/web/components/ui/chart.tsx`

### Current Architectural Reality

The shipped dashboard is still powered by live reads. The core query layer loads all scoped course
data into memory through `load_analytics_context(...)`, then derives metrics in Python. That works
for a first release, but it will not hold up cleanly for org-wide analytics growth, large teacher
scopes, or tighter freshness SLAs.

## Current Gaps To Address In v2

These are the highest-value gaps in the current implementation.

### Product and UX gaps

- The overview underuses its own response model. The API returns `completions`, `submissions`, and
  `grading_completed` trends, but the UI only renders a single active-learners area chart.
- The filter bar only exposes window switching. Compare mode, bucket, course selection, cohort
  selection, teacher switching, and timezone selection are not surfaced as real controls.
- The teacher workflow is still read-only. There are no saved views, follow-up queues, alert state,
  bulk outreach workflows, or "what changed since last week" summaries.
- Tables are static. They need sorting, filtering, pagination, density control, sticky columns, and
  stronger drill-through actions (use tanstack table).
- Assessment detail is useful, but still shallow for instructors trying to diagnose why performance
  is bad.

### Data and correctness gaps

- `freshness_seconds` is effectively placeholder data today.
- Rollup refresh exists only as a stub and does not populate production read models.
- `teacher_user_id` is not yet a trustworthy teacher-level analytics filter for org-wide
  supervisors; the current scope logic keeps org-wide course scope and mainly echoes the selected
  teacher in the response.
- `cohort_ids` are accepted by the API but are not yet applied through the analytics query layer.
- Timezone is validated, but the current bucketing logic still normalizes to UTC rather than
  bucketing in the requested display timezone.
- Most KPI comparison deltas are missing or intentionally `null`; only a small subset actually
  compare current vs previous period.

### Performance and operational gaps

- Whole-scope loading across courses, activities, trail runs, trail steps, submissions, attempts,
  and users is expensive and scales poorly.
- Exports are synchronous string generation instead of streaming or background export jobs.
- There are no clear performance budgets, cache strategy, freshness monitoring, or query
  observability for analytics endpoints.
- The current dashboard lacks clear "data stale" affordances and degraded-mode behavior when
  analytics data is partial.

### Chart system gaps

- `chart.tsx` is only being used for basic single-series area, bar, and radar charts.
- `ChartLegend` and `ChartLegendContent` exist but are not used by the analytics UI.
- Tooltips do not reliably display zero values because the content renderer checks truthiness
  instead of defined numeric values.
- Color usage is still mostly hardcoded per widget rather than driven by a reusable semantic
  analytics palette.
- There is no first-class support for synchronized charts, compare overlays, thresholds, or
  empty-state handling.
- Formatting for dates, percentages, durations, and scores is repeated in widgets instead of being
  standardized at the chart layer.

## v2 Product Goals

### 1. Make the dashboard operational

The default teacher experience should answer:

- who needs intervention now
- which course changed materially this week
- which assessment is blocking progress
- where grading or stale content is dragging learner progress
- whether the last content update helped or not

### 2. Make comparisons first-class

Comparison should be visible across overview, course, and assessment views rather than hidden in raw
numbers. Every important chart and KPI should support current period vs previous period, and where
useful, course vs org benchmark.

### 3. Make analytics explainable

Every alert, score, and ranking needs an explanation path. Teachers should be able to see why a
course is flagged, why a learner is high risk, and why an assessment is considered an outlier.

### 4. Make analytics fast enough for org scope

Org-wide maintainers and teaching leads need near-instant page loads for overview and list views,
with detail pages remaining comfortably interactive at larger data volumes.

### 5. Make freshness and trust visible

Teachers should always know when the data was generated, what it includes, and where caveats still
apply.

## v2 Experience Plan

### A. Overview becomes a teacher command center

Replace the current landing page shape with a dashboard that combines summary, trend, triage, and
action.

#### New overview sections

- "What changed" strip: top positive and negative deltas since the previous window
- Multi-series engagement panel: active learners, completions, submissions, grading completions, and
  optional compare overlay
- Alert queue: grouped by severity and action type instead of a flat card list
- At-risk operations panel: risk distribution, inactivity buckets, and top learners needing contact
- Course movers table: biggest drops and biggest improvements across scoped courses
- Assessment watchlist: hardest assessments, slowest grading, lowest submission rate, and highest
  retry pressure
- Freshness and caveat panel: generated time, source mode, and known metric caveats

#### Product additions

- allow teachers to pin favorite courses
- add shareable filtered URLs
- add export entry points tied to the exact active filter set
- add lightweight recommendation copy that explains the next likely action

### B. Course analytics becomes an improvement workspace

Course detail should move beyond one funnel and one trend.

#### New course detail modules

- Engagement vs completion combined chart
- Chapter and activity drop-off explorer with sorting by worst step
- Before/after content update impact panel using content update timestamps
- Learner segment panels: newly inactive, stalled mid-course, near-completion, grading-blocked
- Grading SLA panel for course assignments
- Content maintenance panel with stale sections and likely intervention targets
- Certificate trend and completion cohort view

#### New questions the course page must answer

- where are learners leaving the course
- did the latest course update improve activity or completion
- is the problem content, difficulty, grading, or inactivity
- which learners are blocked by pending feedback instead of lack of effort

### C. Assessment analytics becomes diagnostic, not descriptive

Assessment detail should help teachers decide whether an assessment is too hard, unclear, too slow
to grade, or simply ignored.

#### New assessment detail modules

- Pass threshold reference line on score charts
- Submission vs pass vs retry stacked trend chart
- Question difficulty + response time scatter or radar combination for quizzes/exams
- Failure taxonomy for code challenges based on failed test clusters
- Grading latency distribution and SLA breach counts for assignments
- Attempt path breakdown: first-pass success, recovered after retry, repeated failure
- Learner segmentation: never started, started not submitted, submitted not passed, graded but still
  failing

#### New assessment list ranking modes

- hardest assessments
- lowest participation assessments
- slowest feedback assessments
- highest retry volume assessments
- biggest week-over-week regression

### D. At-risk learners becomes a real action surface

The current risk table is a good seed, but it needs operational depth.

#### New at-risk capabilities

- saved views for "inactive 7d", "missing required work", "grading-blocked", and "high-risk near
  completion"
- risk reason chips with human-readable explanations
- outreach priority column and suggested contact timing
- bulk export from the filtered table, not only from overview buttons
- direct links from learner rows to course and assessment blockers
- optional instructor notes or intervention status in a later phase if the product wants closed-loop
  follow-up

## Better Use Of `chart.tsx`

v2 should treat `apps/web/components/ui/chart.tsx` as the analytics visualization contract rather
than a thin wrapper around Recharts.

### Current underuse

The shared chart layer already supports themed series config, shared tooltip content, and legends,
but the analytics views currently use it only for simple one-series charts with minimal formatting.
This leaves a lot of capability unused and forces too much presentation logic into individual
widgets.

### Required chart usage patterns for v2

#### Overview

- use a synchronized multi-series area chart for active learners, completions, submissions, and
  grading completed
- add a compare series with dashed stroke when `compare=previous_period`
- render a legend using `ChartLegend` and `ChartLegendContent`
- support threshold and annotation markers for major alert events when useful

#### Course detail

- use composed charts for engagement vs completion so teachers can see whether activity is turning
  into progress
- render chapter drop-off as a ranked horizontal bar chart with clearer labels and delta formatting
- use radial or gauge-style views for content health and grading SLA only if the score formula is
  explicit

#### Assessment detail

- add score histograms with pass threshold reference lines
- use stacked bars for attempt outcomes and submission states
- keep radar charts for question difficulty only when the number of items is small enough to remain
  readable
- use scatter or dot plots when comparing accuracy to time spent per question

#### Risk analytics

- add bar distributions for risk level counts and inactivity buckets
- add a trend chart for medium/high-risk learner counts over time

### `chart.tsx` improvement backlog

#### API and behavior improvements

- add standard formatter hooks for percent, integer, duration, score, and date/time values
- support `syncId` and shared cursor behavior for linked charts on the same page
- add a first-class empty state path for charts with no data
- add a loading or skeleton wrapper so widgets stop reimplementing empty/loading visuals
- expose a consistent reference-line helper pattern for pass thresholds, SLA targets, and benchmark
  lines

#### Correctness fixes

- fix tooltip rendering so numeric zero values are shown instead of hidden
- ensure tooltip row keys are stable even when `dataKey` is repeated or missing
- harden CSS selector generation in `ChartStyle` so chart IDs are safely escaped and quoted
- standardize color fallback resolution when `payload.fill`, `item.color`, and config color differ

#### Design and accessibility improvements

- move analytics series colors to semantic CSS tokens instead of per-widget hardcoded hex values
- add chart title and description wiring for screen readers
- support better label truncation and full-label tooltip handling on dense axes
- ensure legends and tooltips respect reduced-motion
- standardize mobile chart heights and small-screen label behavior

### Recommended chart component additions

- `AnalyticsMultiSeriesTrendChart.tsx`
- `AnalyticsCompareAreaChart.tsx`
- `AnalyticsThresholdHistogram.tsx`
- `AnalyticsStackedOutcomeChart.tsx`
- `AnalyticsRiskDistributionChart.tsx`
- `AnalyticsHealthRadialChart.tsx`

These should all consume the shared chart contract instead of bypassing it.

## Backend Architecture Plan

### 1. Move from live-query MVP to hybrid read models

Use a hybrid strategy rather than jumping directly from the current code to fully precomputed
everything.

#### Keep live queries for

- narrow detail views that operate on a single course or assessment
- newly introduced metrics that still need validation
- short-term gap filling while rollups are still being populated

#### Move overview and list views to rollups first

- teacher overview
- course ranking list
- assessment ranking list
- risk distribution and summary counts
- freshness metadata

### 2. Implement the rollup refresh service for real

The current `refresh_teacher_analytics_rollups(...)` hook needs to become an actual job pipeline.

#### Minimum v2 rollup job requirements

- nightly full recompute for durable daily tables
- intra-day refresh for risk and grading backlog slices
- per-job timing and row-count telemetry
- idempotent refresh by org and snapshot date
- partial-org refresh capability for debugging and backfill

### 3. Reduce whole-scope data loading

Refactor `load_analytics_context(...)` so the analytics service layer does not eagerly fetch every
scoped table for every endpoint.

#### Replace with

- endpoint-specific query builders
- rollup-backed list queries
- on-demand joins for detail pages only
- narrow user lookups only for rows that will actually be rendered or exported

### 4. Make filters real end-to-end

v2 must fully implement these filters through scope resolution and query execution.

- `course_ids`
- `cohort_ids`
- `teacher_user_id`
- `window`
- `compare`
- `bucket`
- `timezone`

#### Specific fixes

- `teacher_user_id` must narrow the managed-course scope when the caller has org-wide analytics
  rights and explicitly chooses a teacher
- `cohort_ids` must affect learner sets, not just echo back in the response
- bucketing must use the requested timezone for display grouping while keeping UTC in storage

### 5. Add API ergonomics for large datasets

- pagination for at-risk learners and learner rows
- explicit sorting and ranking params for course and assessment lists
- optional compact responses for overview previews
- response metadata for totals and truncation
- version-safe schema evolution when new metrics are added

## Frontend Architecture Plan

### 1. Build a stronger analytics shell

The analytics routes should share a common shell that handles:

- filter state and query-string sync
- freshness badge and stale-data status
- loading, empty, and degraded states
- export actions
- breadcrumbs and drill-down context

### 2. Standardize dashboard table behavior

Use tanstack table. All analytics tables should support:

- column sorting
- search or quick filters where appropriate
- row density options for large orgs
- responsive overflow handling
- deep links to relevant course, assessment, or learner detail views

### 3. Improve number and time formatting

The frontend should centralize formatting for:

- percentages
- integer counts
- score values
- durations in hours and days
- timestamps in the selected timezone

### 4. Make drill-downs coherent

From any alert, KPI, course row, or assessment row, the teacher should be able to reach the detail
view that explains the metric without losing the active filter context.

## Production Readiness Plan

### Reliability and observability

- add structured logging around analytics query paths and rollup refreshes
- track endpoint latency and row-scan volume
- surface rollup freshness and job status to operational dashboards
- add alerting for refresh failures and stale rollup windows

### Performance budgets

- overview and list endpoints should be optimized for sub-second to low-second responses under org
  scope
- large CSV exports should not require full in-memory string assembly in the request path
- chart-heavy pages should keep first render stable on both desktop and mobile

### Data quality

- add validation jobs for metric anomalies and missing rollup rows
- log disagreements between rollup and live-query spot checks during rollout
- explicitly document which metrics are rollup-backed vs live-query-backed while the system is
  hybrid

### Rollout safety

- one-shot all the changes, don't care about backward compat, just create an alembic migration

## Proposed File-Level Backlog

### Backend backlog

- `apps/api/src/services/analytics/rollups.py`
  - implement real refresh orchestration
- `apps/api/src/services/analytics/queries.py`
  - split eager whole-scope loading into narrower query helpers
- `apps/api/src/services/analytics/overview.py`
  - add comparison metrics and richer trend aggregation
- `apps/api/src/services/analytics/courses.py`
  - add ranking, sorting, and course improvement metrics
- `apps/api/src/services/analytics/assessments.py`
  - add richer outlier detection and threshold-aware diagnostics
- `apps/api/src/services/analytics/risk.py`
  - support cohort filtering, risk distributions, and trend outputs
- `apps/api/src/services/analytics/exports.py`
  - support streaming or background export generation
- `apps/api/src/services/analytics/filters.py`
  - extend filtering semantics and timezone-aware bucketing
- `apps/api/src/services/analytics/schemas.py`
  - add v2 response shapes for new summary panels, trend breakdowns, and pagination metadata

### Frontend backlog

- `apps/web/components/ui/chart.tsx`
  - harden and expand the shared chart contract
- `apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`
  - upgrade overview to multi-panel command center
- `apps/web/components/Dashboard/Analytics/TeacherFilterBar.tsx`
  - add real filter controls and query sync
- `apps/web/components/Dashboard/Analytics/TeacherKpiCards.tsx`
  - show meaningful comparisons and explanations
- `apps/web/components/Dashboard/Analytics/AtRiskLearnersTable.tsx`
  - add sorting, filtering, and actionable row affordances
- `apps/web/components/Dashboard/Analytics/GradingBacklogPanel.tsx`
  - expand into SLA and blocker detail
- `apps/web/components/Dashboard/Analytics/CourseHealthTable.tsx`
  - add ranking mode, search, and deep links with context preservation
- `apps/web/components/Dashboard/Analytics/ScoreDistributionChart.tsx`
  - support thresholds and compare series
- `apps/web/components/Dashboard/Analytics/QuestionDifficultyRadar.tsx`
  - support richer diagnostics or alternate chart types when item counts are high
- `apps/web/services/analytics/teacher.ts`
  - add new filter params, pagination, and richer endpoint clients
- `apps/web/types/analytics.ts`
  - extend models for v2 charts, distributions, rankings, and metadata

## Delivery Sequence: One shot

- fix `chart.tsx` correctness issues and add formatter, legend, empty-state, and compare support
- surface real filter controls in the frontend
- implement timezone-aware bucketing and actual `teacher_user_id` / `cohort_ids` filtering semantics
- add freshness badges and explicit data-source caveats

- ship multi-series overview charts
- add course movers, assessment watchlist, and richer alert queue
- expand at-risk distribution and intervention views

- deepen course drop-off, content maintenance, and grading SLA modules
- add threshold-aware assessment charts and retry / failure-path analysis
- improve ranking and sorting models for course and assessment lists

- implement real refresh jobs
- move overview and ranking lists onto rollup-backed queries
- add export streaming or async job generation

## Acceptance Criteria For v2

v2 is ready when the following are true.

### Product

- the overview clearly highlights what changed, what needs action, and where to drill next
- course and assessment pages explain why a metric is bad, not just that it is bad
- teachers can meaningfully filter by course, cohort, timeframe, compare mode, and timezone

### Chart system

- the analytics UI uses shared legends, shared tooltips, compare overlays, and semantic series
  colors consistently
- zero values render correctly in tooltips and tables
- charts remain readable on mobile and accessible to keyboard and screen-reader users

### Backend and data

- `teacher_user_id` and `cohort_ids` affect actual query results
- rollup refresh is real and observable
- overview and ranking endpoints do not rely on whole-scope in-memory aggregation alone
- freshness metadata is accurate and visible

### Operations

- analytics endpoint latency and rollup job health are monitored
- exports are safe for large row counts

## Non-Goals For This Phase

- building a generic BI system
- adding every possible learner analytics dimension in one release
- introducing closed-loop CRM-style intervention tooling unless product explicitly wants that scope

## Final Recommendation

Treat v2 as two parallel tracks:

1. product depth and chart quality on the frontend
2. data-path hardening and rollup adoption on the backend

If only one track ships, the dashboard will remain unbalanced. Frontend-only work will look better
but stay fragile under scale. Backend-only work will be faster but still feel underpowered to
teachers. The right v2 is both: better decisions for instructors and a data pipeline that can
support them reliably.
