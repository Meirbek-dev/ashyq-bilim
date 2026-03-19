# Teacher Analytics Dashboard — Deep Dive Critical Analysis

**Date:** 2026-03-09 **Scope:** Full-stack review of the shipped implementation as it exists today
**Based on:** Direct code reading of all analytics service, router, component, and page files

---

## Executive Summary

The dashboard shipped. Teachers can see KPI cards, a trend chart, a course table, an assessment
table, and an at-risk learner table. It is a real, working product. It is also deeply flawed in ways
that will produce misleading data, cause silent failures at scale, frustrate every power user, and
make the "Stable" badge appear on metrics that are actively getting worse.

The problems fall into six categories: performance disaster, data correctness bugs, uninformative
visualisations, broken table pagination, frontend architecture failures, and UX gaps that hide what
is happening from the teacher.

---

## 1. Backend Performance: The `load_analytics_context` Disaster

### 1.1 What it does

`apps/api/src/services/analytics/queries.py` — `load_analytics_context()`

Every analytics endpoint calls this function. It issues **14 sequential SQL queries** and loads
entirely into Python memory:

- `Course`, `Activity`, `Chapter`, `CourseChapter`, `ChapterActivity`
- `TrailRun`, `TrailStep` (all time, no date bounds until recently patched)
- `Assignment`, `AssignmentUserSubmission`
- `Exam`, `ExamAttempt`
- `QuizAttempt`, `QuizQuestionStat`
- `CodeSubmission`
- `CertificateUser`, `Certifications`
- `User` (every learner who has ever touched the courses)
- `UserGroup`, `UserGroupUser`

For 10 courses and 200 learners this is tolerable. For a platform that has been running for 2 years
with 50 courses and 2,000 learners, a single request can pull hundreds of thousands of trail step
rows into memory and discard 90% of them in a Python `for` loop.

### 1.2 How many times this is called per overview page view

`apps/web/app/orgs/[orgslug]/dash/analytics/page.tsx` calls
`Promise.all([ getTeacherOverview, getTeacherCourseList, getTeacherAssessmentList, getUserGroups ])`.

Each of these three analytics calls hits a separate endpoint. Each endpoint calls
`load_analytics_context`. For the same scope and window, **three full 14-query loads are executed in
parallel against the same tables**. This is not a minor inefficiency — it is a structural
multiplication of the most expensive operation in the system.

`get_teacher_overview` also internally calls `build_course_rows`, which in the naive path calls
`load_analytics_context` a fourth time. The `context=` parameter was added as a patch to avoid this,
but `get_teacher_course_list` and `get_teacher_assessment_list` still construct their own context
independently.

**Result:** A single overview page view can cause 3–4 full database loads for identical data.

### 1.3 The rollup system does not fix this

`apps/api/src/services/analytics/rollups.py` — `supports_rollup_reads()`

```python
def supports_rollup_reads(filters: AnalyticsFilters) -> bool:
    return not filters.cohort_ids and filters.window in {"7d", "28d"} and filters.compare == "previous_period"
```

The 90-day window **always** falls through to the live path. Any cohort filter disables rollups. So
the most expensive queries (90-day, any cohort filter) are guaranteed to never hit the rollup path.
The rollup system currently only helps the most common case (28-day, no cohort filter, default
compare). Every other case uses the full live load.

### 1.4 `load_analytics_context` is called for all courses, then filtered by course detail

`get_teacher_course_detail` and `get_teacher_assessment_detail` call
`load_analytics_context(db_session, scope.course_ids)` — that is **all teacher-scoped courses**, not
just the one being viewed. A teacher viewing a detail page for course #3 loads all trail steps,
submissions, and attempts for all 20 of their courses just to filter them by `course_id == 3` two
lines later.

### 1.5 `TrailStep.update_date` is used as an activity timestamp — it is wrong

`build_activity_events()` uses `step.update_date or step.creation_date` as the event timestamp.
`update_date` is set whenever the row is touched for any reason, including admin corrections and
backfills. `creation_date` is when the row was inserted, which may not match when the learner
completed the activity. The "active learners" trend series and all time-windowed computations are
built on this unreliable timestamp.

---

## 2. Data Correctness Bugs

### 2.1 Assignment timestamps are stored as `Text` — grading latency metrics are unreliable

`migrations/versions/f7a8b9c0d1e2_add_assignment_submission_timestamps.py`:

```python
op.add_column("assignmentusersubmission", sa.Column("submitted_at", sa.Text(), nullable=True))
op.add_column("assignmentusersubmission", sa.Column("graded_at", sa.Text(), nullable=True))
```

There is a migration (`a1b2c3d4e5f6`) that converts these to `TIMESTAMPTZ`, but it has the same
`down_revision` as `f7a8b9c0d1e2` — meaning it is a **branch in the migration chain**, not a linear
upgrade. If both branches were applied, Alembic will refuse to run. If only one was applied,
timestamps are still text. The `hours_between()` helper in `queries.py` parses these strings with
`parse_timestamp()`, which silently returns `None` on unexpected formats.
`grading_latency_hours_p50` and `grading_latency_hours_p90` are then `None` for all unparseable
rows, making the percentile metrics quietly wrong rather than raising an error.

### 2.2 5 of 6 KPI cards show "Stable" because previous values are not computed for them

`apps/api/src/services/analytics/overview.py`:

```python
ungraded_submissions=_metric("...", float(...), None, is_higher_better=False),
```

`ungraded_submissions` is passed `None` as the previous value. In `_metric()`:

```python
delta_value = round(value - previous, 1) if previous is not None else None
delta_pct = round(...) if previous not in (None, 0) else None
```

`delta_value = None` → `direction = "flat"`.

In `TeacherKpiCards.tsx` the "flat" direction renders as a grey `"stable"` badge. The badge is
visually identical whether the metric is genuinely stable or simply has no prior data. **Four other
metrics have the same pattern**: `returning_learners`, `completion_rate`, `at_risk_learners`,
`negative_engagement_courses` (in the live path). A teacher looking at 5 out of 6 green "Stable"
badges has no idea whether the system is healthy or just lacks historical data.

### 2.3 `delta_pct = None` when previous is 0 is displayed as "Stable" — semantically wrong

When a previous period had 0 completions and the current period has 40:

```python
delta_pct = ... if previous not in (None, 0) else None  # delta_pct is None
```

`TeacherKpiCards.tsx`:

```tsx
{metric.delta_pct === null ? t('kpi.stable') : ...}
```

The card says "Stable" for a metric that went from 0 to 40. "Stable" and "no data" are treated
identically. This is wrong for any metric that starts from zero.

### 2.4 Badge direction is inverted for negative-polarity metrics

`TeacherKpiCards.tsx` (from `TeacherKpiCharts.tsx` which wraps the cards):

```tsx
const badgeVariant = (direction: MetricCard['direction'], isHigherBetter: boolean) => {
  if (direction === 'up') return isHigherBetter ? 'success' : 'warning';
  if (direction === 'down') return isHigherBetter ? 'warning' : 'success';
  return 'outline';
};
```

The `MetricCard` schema now includes `is_higher_better: bool` and the frontend reads it. However
`TeacherKpiCards.tsx` (the card component itself, separate from the chart wrapper) still renders:

```tsx
{
  iconForDirection(metric.direction);
}
```

with no polarity awareness. The icon (`ArrowUp`, `ArrowDown`) color is always the same regardless of
whether an increase is good or bad. A teacher sees a green upward arrow on "At-risk learners: +5"
and may read this as positive.

### 2.5 Risk distribution chart on overview is built from 8 preview rows, not all at-risk learners

`apps/api/src/services/analytics/overview.py`:

```python
return TeacherOverviewResponse(
    ...
    at_risk_preview=risk_rows[:8],
)
```

`AnalyticsRiskDistributionChart` in `TeacherOverview.tsx` receives `data.at_risk_preview` — the same
8 rows. It counts `rows.filter(row => row.risk_level === 'high').length` on this 8-row preview to
draw the distribution pie. For a teacher with 200 at-risk learners the chart shows the distribution
of the top 8 rows sorted by risk score, not the true population distribution. The chart will almost
always show predominantly "high" risk because the first 8 rows are the worst 8. The summary card
correctly shows `at_risk_learners: 200` while the chart draws a circle based on 8 samples.

### 2.6 Content health score is perfect when update history is missing

`apps/api/src/services/analytics/courses.py`:

```python
last_update = course_last_content_update(context, course_id)
days_since_update = (now - last_update).days if last_update is not None else None
freshness_score = 100.0 if days_since_update is None else max(0.0, round(100 - (days_since_update * 3.5), 1))
```

A course with no recorded update timestamp gets `freshness_score = 100.0`. This is backwards. A
course that has never been updated should be unknown-freshness at best, not perfect freshness.
Teachers relying on the health score to identify stale content will overlook courses that have no
update history at all.

### 2.7 Course detail loads all courses then filters — `assessment_outliers` is hard-capped at 12

`get_teacher_course_detail` (courses.py) ends with:

```python
return TeacherCourseDetailResponse(
    ...
    at_risk_learners=risk_rows[:20],
    assessment_outliers=assessment_rows[:12],
)
```

Both lists are sliced with no pagination support. A course with 30 assessments and 80 at-risk
learners shows only 12 assessments and 20 learners with no indication that more exist, no "page 2",
and no export from the detail view itself.

### 2.8 `recommended_action` uses a cascade of `if` statements — last matched condition always wins

`apps/api/src/services/analytics/risk.py`:

```python
recommended_action = "Send a personal outreach message..."
if "inactive_7d" in reason_codes:
    recommended_action = "Contact the learner this week..."
if "low_progress" in reason_codes:
    recommended_action = "Schedule a check-in focused on content pacing..."
if "repeated_failures" in reason_codes:
    recommended_action = "Review failed assessments together..."
if "missing_required_assessments" in reason_codes:
    recommended_action = "Set a deadline for missing work..."
if "grading_block" in reason_codes:
    recommended_action = "Prioritise grading this learner's submissions..."
```

All five conditions are `if`, not `if/elif`. Every matched condition overwrites the previous. A
learner who is inactive, has failed assessments, and is blocked by missing grading receives only the
last matched message ("Prioritise grading..."), which may not be the most urgent issue. If the
teacher has already graded everything and the learner is still inactive, the advice is wrong.

### 2.9 `export_grading_backlog_csv` will crash on a deleted course

`apps/api/src/services/analytics/exports.py`:

```python
context.courses_by_id[assignment.course_id].name
```

This is a direct dictionary key access. If a course was deleted after submissions were recorded,
`assignment.course_id` will not be in `courses_by_id` and the function raises `KeyError` mid-stream.
Since the export is a `StreamingResponse`, the browser may have already started receiving the CSV
before the crash. The result is a partial, truncated CSV file with no error message and no HTTP
error code visible to the user.

### 2.10 Cohort filter silently shows all learners when cohort IDs are not in scope

`apps/api/src/services/analytics/queries.py` — now fixed to return `set()` instead of `None` for
unknown cohort IDs. But the upstream `cohort_user_ids` call returns `None` when `cohort_ids` is
empty and returns `set()` (empty set, meaning "no learners match") when IDs are provided but none
match scope. If a teacher selects a cohort from a different org, the function now returns an empty
result rather than all learners — but the **UI gives no feedback** that the cohort filter returned
zero results. The table just appears empty. There is no "0 of 200 learners matched cohort filter"
message.

---

## 3. Why Tables Don't Have Pagination

### 3.1 The real answer: data is pre-sliced before reaching the table

`AnalyticsDataTable.tsx` **does** have pagination implemented:

```tsx
const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });
// ...
getPaginationRowModel: getPaginationRowModel(),
// ...
{pageCount > 1 && (
  <div className="flex items-center justify-end gap-2">
    <Button onClick={() => table.previousPage()} ...>Prev</Button>
    <Button onClick={() => table.nextPage()} ...>Next</Button>
  </div>
)}
```

The pagination controls render **only when `pageCount > 1`**. They never appear on the overview page
because the data is sliced before it is passed to the table:

```tsx
// TeacherOverview.tsx
<CourseHealthTable orgslug={orgslug} rows={courseRows.slice(0, 8)} />
<AssessmentOutliersTable orgslug={orgslug} rows={assessmentRows.slice(0, 8)} />
<AtRiskLearnersTable rows={data.at_risk_preview} ... />  // at_risk_preview = risk_rows[:8]
```

8 rows with a default `pageSize` of 20 → `pageCount = Math.ceil(8/20) = 1` → the
`{pageCount > 1 && ...}` guard hides the entire pagination block. The table always looks like it has
shown everything.

`TeacherOverview.tsx` does add a "view all" link below the tables when the full list is longer than
8:

```tsx
{courseRows.length > 8 && (
  <p className="mt-2 text-sm text-slate-500">
    Showing top 8 of {courseRows.length} courses.{' '}
    <Link href={...}>View all courses</Link>
  </p>
)}
```

This is better than nothing, but the text is below the table, easy to miss, and there is no visual
affordance on the table itself (no "truncated" indicator, no row count badge in the header).

### 3.2 On the dedicated list pages, server lacks pagination for courses and assessments

The backend `AnalyticsFilters` has `page` and `page_size` fields. But `get_teacher_course_list`
ignores them:

```python
def get_teacher_course_list(...) -> TeacherCourseListResponse:
    ...
    generated_at, rows = build_course_rows(scope, filters, db_session)
    return TeacherCourseListResponse(generated_at=generated_at, total=len(rows), items=rows)
    # `items` contains ALL rows — no slicing by filters.offset or filters.page_size
```

The same is true for `get_teacher_assessment_list`. Both endpoints always return all rows.
Client-side pagination in `AnalyticsDataTable` (default 20 per page) will show navigation controls
only if there are more than 20 rows. For most teachers with fewer than 20 courses, pagination never
appears. For teachers with 50 courses, it does appear — but all 50 rows were already loaded into the
browser DOM, sorted in JavaScript, and rendered entirely.

**Only `get_at_risk_learners` actually uses `filters.offset` and `filters.page_size`:**

```python
paged_rows = rows[filters.offset : filters.offset + filters.page_size]
return AtRiskLearnersResponse(total=len(rows), page=filters.page, page_size=filters.page_size, items=paged_rows)
```

However, the frontend service client `getTeacherAtRiskLearners` does not pass `page` as a parameter
and always fetches page 1. The `AtRiskLearnersResponse` includes `total` and `page`, but the
frontend ignores these fields. The at-risk table on the dedicated page shows only the first 25 rows
(backend default page size). Learners 26+ are never fetched and never visible. There is no "load
more" or next-page navigation.

### 3.3 Summary of pagination failure modes per table

| Table                                        | Where used        | Rows passed                           | Why pagination never shows                            |
| -------------------------------------------- | ----------------- | ------------------------------------- | ----------------------------------------------------- |
| `CourseHealthTable` on overview              | Overview page     | `courseRows.slice(0, 8)` → 8 rows     | 8 < pageSize=20, pageCount=1                          |
| `AssessmentOutliersTable` on overview        | Overview page     | `assessmentRows.slice(0, 8)` → 8 rows | 8 < pageSize=20, pageCount=1                          |
| `AtRiskLearnersTable` on overview            | Overview page     | `data.at_risk_preview` → 8 rows       | 8 < pageSize=20, pageCount=1                          |
| `CourseHealthTable` on `/courses`            | Courses list page | All courses, no server pagination     | Shows for >20 courses; all DOM-mounted anyway         |
| `AssessmentOutliersTable` on `/assessments`  | Assessments page  | All assessments, no server pagination | Shows for >20 assessments; all DOM-mounted anyway     |
| `AtRiskLearnersTable` on `/learners/at-risk` | At-risk page      | Backend page 1 only (25 rows)         | Client sees ≤25 rows; page 2 of backend never fetched |

### 3.4 How to fix pagination

**Overview tables:** Keep the `.slice(0, 8)` for the preview intent but make the truncation
explicit. Add a visible indicator inside the table header ("Showing 8 of 47") and style the preview
card differently. The "View all" link is there but should be a proper button above the table, not
small text below it.

**Courses and assessments dedicated pages:** Add server-side `limit`/`offset` handling to
`get_teacher_course_list` and `get_teacher_assessment_list`. Pass `page` and `page_size` through the
frontend service client. Use the `total` field from the response to calculate page count and render
a proper "next/prev" UI that fetches from the server rather than slicing the client-side array.

**At-risk dedicated page:** The backend already paginates correctly. The frontend needs to read
`total`, `page`, `page_size` from the response, render page controls, and refetch with `page=2` etc.
when the user navigates.

---

## 4. Charts and Visualisations: Numbers Without Context

### 4.1 KPI cards have no sparklines

`TeacherKpiCards.tsx` shows a number, a delta badge, and a change text. Nothing else. "Active
learners: 120" conveys no trend shape. Was it 20 three weeks ago and spiked last week? Has it been
declining from 200? The trend series is already in the API response (`data.trends.active_learners`)
and is currently used only for the large multi-series chart. Rendering a 20-pixel sparkline per KPI
card using the trend data would turn 6 static numbers into 6 trend stories at near-zero additional
backend cost.

### 4.2 Hardcoded hex colors break dark mode and design-system tokens

Every chart writes literal hex codes into `ChartConfig`:

```tsx
// AnalyticsMultiSeriesTrendChart.tsx
config={{
  active_learners: { label: ..., color: '#0f766e' },
  completions:     { label: ..., color: '#0284c7' },
  submissions:     { label: ..., color: '#f59e0b' },
  grading_completed: { label: ..., color: '#7c3aed' },
}}
```

`ChartStyle` (from `chart.tsx`) injects CSS custom properties (`--color-{key}`) and is the correct
way to apply colors so they respect `prefers-color-scheme` and design-system tokens. Using
`'var(--chart-1)'` through `'var(--chart-5)'` instead of hex codes requires one line of change per
chart and makes all analytics charts responsive to theme changes. Currently every chart is broken in
dark mode.

### 4.3 `AnalyticsRiskDistributionChart` bypasses `ChartContainer` entirely

```tsx
// Raw hex fills applied directly to Cell elements
const RISK_COLOR_FALLBACKS: Record<string, string> = {
  high: 'hsl(0 72% 51%)',
  medium: 'hsl(38 92% 50%)',
  low: 'hsl(215 16% 47%)',
};
```

This component renders a `PieChart` with `Cell` elements using raw HSL fills, completely bypassing
`ChartContainer` and `ChartConfig`. The tooltip is Recharts' default, not `ChartTooltipContent`. The
font, spacing, and border radius are inconsistent with every other chart on the page. The component
also ignores the `RISK_COLOR_VARS` (CSS custom properties) it defines at the top of the file, using
the `RISK_COLOR_FALLBACKS` values directly instead.

### 4.4 `ChartTooltipContent` is called with no `labelFormatter`, `valueFormatter`, or `nameKey`

Every chart:

```tsx
<ChartTooltip content={<ChartTooltipContent />} />
```

`ChartTooltipContent` falls back to the raw `dataKey` as the series label: `"active_learners"`,
`"value"`, `"count"`. The tooltip on `EngagementAreaChart` shows `"value: 23"`. On
`CompletionFunnelChart` it shows `"count: 150"`. The `ChartConfig` allows a `valueFormatter` per
series that would display `"23 learners"` or `"150 (64% of previous)"` — it is never used.

### 4.5 `AnalyticsThresholdHistogram` has a `thresholdBucketLabel` prop that does nothing

```tsx
/** Label value of the bucket at the passing threshold, used to draw a vertical reference line */
thresholdBucketLabel?: string;
```

The component accepts this prop, documents it, and then renders a `BarChart` with no `ReferenceLine`
element. The threshold is rendered only as a small `<Badge>` in the card header. A teacher looking
at a score distribution of 80 attempts wants to see the distribution split at the pass line, not
hunt for a badge in the title. The prop exists, the use case is documented, and the implementation
was never completed.

### 4.6 `CompletionFunnelChart` hides the X axis entirely

```tsx
<XAxis
  type="number"
  hide
/>
```

A funnel/bar chart without numeric axis labels gives no scale reference. There is no way to tell
whether a bar represents 3 or 300 learners without hovering for a tooltip. For a chart whose purpose
is to show drop-off severity, the count axis is the primary information.

### 4.7 `QuestionDifficultyRadar` silently drops all questions beyond the 8th

```tsx
const radarData = data.slice(0, 8).map(...)
```

No indicator that questions 9+ are hidden. An exam with 20 questions has 12 invisible data points.
The radar also only renders `accuracy_pct` and ignores `avg_time_seconds`, which is included in the
API payload but unused, even though time-per-question is a strong difficulty signal for timed
assessments.

### 4.8 `freshness_seconds` — the display is fixed, but the value is still often 0

`TeacherOverview.tsx` `formatFreshness()` correctly converts seconds to human-readable strings
("live", "5 minutes ago", "2 hours ago").

But `overview.py`:

```python
freshness_seconds=freshness_seconds_from_rollup(
    teacher_rollup.generated_at if teacher_rollup is not None else None
),
```

When no rollup exists (the common case for new or small deployments),
`freshness_seconds_from_rollup(None)` returns `0`. The UI shows "Live" — implying real-time data.
But the data IS live — it was just computed from `load_analytics_context`, which is always current.
"Live" is technically correct here, but it is indistinguishable from the rollup case where data
could be 24 hours old but `freshness_seconds` is 0 due to a stale `generated_at` timestamp. The
meaning of "Live" is different in the two cases but displays identically.

---

## 5. Frontend Architecture Problems

### 5.1 The filter form causes a full server-side page reload

`TeacherFilterBar.tsx`:

```tsx
<form action={basePath} method="get" className="...">
```

Submitting this form causes a full Next.js server navigation. The page re-renders from scratch, all
API calls fire again, scroll position is lost, and all client state (table sort, search text, open
rows) resets. A teacher who sorted the at-risk table by risk score, changed the time window, and
returned to the table finds it back in default sort order.

The `Link` shortcuts for window selection do use client-side routing, but every other filter control
(cohort, course, sort, timezone) submits the form.

### 5.2 Timezone filter is a free-text `<Input>` with no validation or affordance

```tsx
<Input
  name="timezone"
  defaultValue={query.timezone || 'UTC'}
  placeholder={t('filter.tzPlaceholder')}
/>
```

A teacher who types `"Europe/Moscoww"` (typo) gets a backend 422 error. The page catches it in a
generic `try/catch` and shows an `AnalyticsEmptyState` with the raw Pydantic error message. There is
no inline field error, no list of valid timezones, no validation before submission.

`TeacherFilterBar.tsx` defines a `COMMON_TIMEZONES` array but uses it only as a
comment/documentation. It is not wired to any `<select>` or autocomplete — the array exists in the
source file but has no effect on the rendered UI.

### 5.3 All errors collapse to the same empty state component

Every analytics page:

```tsx
} catch (error) {
  return <AnalyticsEmptyState
    title={t('...')}
    description={error instanceof Error ? error.message : t('...')} />;
}
```

A 403 (no permission), 404 (course deleted), 422 (bad timezone), 500 (query timeout), and network
error all produce the same locked-padlock empty state. The raw API error message (`detail` field
from FastAPI) is surfaced directly as the description. For a 500 this will be a Python exception
traceback summary. For a 403 it will be a Pydantic RBAC error. None of these are appropriate for
display to a teacher.

### 5.4 No inline loading states — teacher stares at blank/stale page for multiple seconds

All analytics pages are `async` server components. During a filter change, Next.js suspends the page
while the server runs up to 4 `load_analytics_context` calls (which can take 2–5 seconds under
load). There are `loading.tsx` files in each analytics route directory that return
`<AnalyticsPageSkeleton />`. However, `AnalyticsPageSkeleton` is a static layout skeleton — it does
not reflect what section is loading. There is no way to see a partial page render (filter bar
loaded, charts still loading).

### 5.5 Course detail page fetches the full course list just to resolve a UUID

`apps/web/app/orgs/[orgslug]/dash/analytics/courses/[courseuuid]/page.tsx`:

```tsx
// A dedicated by-uuid endpoint exists
const data = await getTeacherCourseDetailByUuid(org.id, courseuuid, accessToken, query);
```

The frontend now uses `getTeacherCourseDetailByUuid` which hits the dedicated
`GET /orgs/{org_id}/teacher/courses/by-uuid/{course_uuid}` endpoint. That endpoint does a cheap DB
lookup (`select Course where course_uuid = ? and id in scope`) and then calls
`get_teacher_course_detail` with the resolved ID. This is correct and avoids the old double-load
pattern.

However, the old pattern may still exist in tests or be re-introduced — there is no test covering
the by-UUID route.

### 5.6 The assessments page has no filter bar at all

`apps/web/app/orgs/[orgslug]/dash/analytics/assessments/page.tsx` renders `AssessmentOutliersTable`
with no `TeacherFilterBar`. A teacher on the assessments page cannot change the window, cohort, or
course filter without navigating away to the overview page, changing the filter there, and
navigating back. The filter parameters passed in the URL are read and respected by the backend, but
there is no way to change them from this page.

---

## 6. What Is Not Informative

### 6.1 Recommended actions are single sentences with no linkable context

The at-risk table's "Recommended action" column shows one sentence per learner. Clicking on it does
nothing. There is no link to the specific blocked assessment, no link to the learner's profile, no
link to the grading queue filtered to that learner. The sentence may be wrong if the learner has
multiple risk factors (see §2.8).

A teacher reading "Prioritise grading this learner's submissions to unblock their progress" has no
shortcut to find those submissions. They need to navigate to the learner's course page, find the
assignment section, locate the submission. Three to five clicks. This should be one link.

### 6.2 The overview alert card shows raw `alert.type` strings

`TeacherOverview.tsx`:

```tsx
<span ...>{getAnalyticsAlertTypeLabel(t, alert.type)}</span>
```

`getAnalyticsAlertTypeLabel` is called from `labels.ts`. If an alert type is not in the translation
map, it falls through and the raw underscore-cased key is displayed: `"code_challenge_outlier"`,
`"engagement_drop"`. The translation file needs to cover every alert type emitted by the backend,
which currently includes: `"grading_backlog"`, `"engagement_drop"`, `"risk_spike"`. Any new alert
type added on the backend without a corresponding frontend translation silently shows the raw key.

### 6.3 Risk score is shown as a number with no explanation

`AtRiskLearnersTable.tsx`:

```tsx
<Badge variant={riskVariant(row.original.risk_level)}>
  {getAnalyticsRiskLevelLabel(t, row.original.risk_level)} · {row.original.risk_score}
</Badge>
```

"High · 84". A teacher who asks "what would reduce this from 84 to 40?" has no way to answer from
the table. The score components (inactivity, progress, failed assessments, missing work, grading
blocks) add up to a maximum of 130, but the table shows none of them. The risk score is an opaque
number.

### 6.4 The multi-series trend chart uses misaligned data alignment (partially fixed)

`TeacherOverview.tsx` now uses Map-based alignment:

```tsx
const completionsMap = new Map(data.trends.completions.map((p) => [p.bucket_start, p.value]));
const trendData = data.trends.active_learners.map((point) => ({
  completions: completionsMap.get(point.bucket_start) ?? 0,
  ...
}));
```

This is correct — if `completions` has no bucket for a given `active_learners` bucket, the value
is 0. However, the reverse is not handled: if `completions` has a bucket that is not in
`active_learners`, it is silently dropped. Since `active_learners` is used as the anchor series, any
submission or completion event outside the active-learner window is invisibly lost. The chart should
build a union of all bucket timestamps as the anchor, not use one series as the keying series.

### 6.6 At-risk learner table shows `user_id` as secondary identity

```tsx
<div className="text-xs text-slate-500">
  {t('atRisk.userNumber', { userId: row.original.user_id })}
</div>
```

When a learner's `first_name`, `last_name`, and `username` are all empty (common for SSO-provisioned
accounts where only email is synced), `display_name` returns "Неизвестный пользователь". The
secondary line then shows "User #1847", which is a database row ID. A teacher cannot find this
learner in any admin UI using a database ID. The email should be shown as a fallback since it is
available in the `User` model.

---

## 7. Security notes

### 7.1 `sort_by` is a free-form string — should be a `Literal` type

`AnalyticsFilters.sort_by: str | None`. Any string is accepted. `sort_map.get(sort_by, fallback)`
prevents direct injection, but the field should be `CourseSortBy | None` (which is already defined
as a `Literal` in `filters.py`) and validated by Pydantic so the API returns a 422 for invalid sort
keys rather than silently ignoring them. As it stands, a client sending `sort_by=__proto__` or
`sort_by=constructor` gets the fallback sort with no error — confusing in debugging.

### 7.2 Authorization check is inside service, not at router boundary

`get_teacher_course_detail` calls `ensure_course_in_scope(scope, course_id)` as the first line. This
is correct. But it is a convention, not a structural guarantee. If a developer adds a new endpoint
and calls the service without the scope check, or calls an inner function that skips it, a teacher
can request analytics for any course by ID. The router layer (`analytics.py`) has no middleware or
decorator that enforces course-scope membership before the handler runs.

---

## 8. Priority Matrix

| #   | Problem                                                                              | Severity | File                                                        |
| --- | ------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------- |
| 1   | 3–4 `load_analytics_context` calls per overview page view                            | Critical | `overview.py`, `page.tsx`                                   |
| 2   | 5 of 6 KPI badges show "Stable" with no historical data                              | Critical | `overview.py`, `TeacherKpiCards.tsx`                        |
| 3   | Risk distribution chart uses 8-row preview, not full list                            | Critical | `TeacherOverview.tsx`, `AnalyticsRiskDistributionChart.tsx` |
| 4   | Overview tables sliced to 8 rows → pagination controls never appear                  | High     | `TeacherOverview.tsx`                                       |
| 5   | Courses/assessments list endpoints return all rows — no server pagination            | High     | `courses.py`, `assessments.py`                              |
| 6   | At-risk endpoint has server pagination; frontend ignores `total`/`page`              | High     | `risk.py`, at-risk page                                     |
| 7   | `recommended_action` cascade overwrites — last condition always wins                 | High     | `risk.py`                                                   |
| 8   | Export crashes with `KeyError` on deleted course                                     | High     | `exports.py`                                                |
| 9   | Assignment submission timestamps stored as `Text`, not `TIMESTAMPTZ`                 | High     | migration `f7a8b9c0d1e2`                                    |
| 10  | All chart colors are hardcoded hex — dark mode is broken                             | High     | All chart components                                        |
| 11  | `AnalyticsThresholdHistogram` ignores `thresholdBucketLabel` — no `ReferenceLine`    | Medium   | `AnalyticsThresholdHistogram.tsx`                           |
| 12  | `AnalyticsRiskDistributionChart` bypasses `ChartContainer` and `ChartTooltipContent` | Medium   | `AnalyticsRiskDistributionChart.tsx`                        |
| 13  | Filter form uses HTML GET — full page reload on every filter change                  | Medium   | `TeacherFilterBar.tsx`                                      |
| 14  | Timezone filter is a free-text `<Input>` — `COMMON_TIMEZONES` array unused           | Medium   | `TeacherFilterBar.tsx`                                      |
| 15  | All errors collapse to the same generic empty state                                  | Medium   | All analytics page files                                    |
| 16  | Assessments page has no filter bar                                                   | Medium   | `assessments/page.tsx`                                      |
| 17  | Content health score is 100% when no update history exists                           | Medium   | `courses.py`                                                |
| 18  | No sparklines on KPI cards despite trend data being available                        | Medium   | `TeacherKpiCards.tsx`                                       |
| 19  | `delta_pct=None` when previous is 0 displays as "Stable"                             | Medium   | `overview.py`, `TeacherKpiCards.tsx`                        |
| 20  | Risk score displayed with no components breakdown                                    | Low      | `AtRiskLearnersTable.tsx`                                   |
| 21  | User ID shown as fallback identity instead of email                                  | Low      | `AtRiskLearnersTable.tsx`, `risk.py`                        |
| 22  | Tooltip zero values suppressed by truthiness check                                   | Low      | `chart.tsx`                                                 |
| 23  | `ChartTooltipContent` never receives `valueFormatter` or `labelFormatter`            | Low      | All chart components                                        |
| 24  | `QuestionDifficultyRadar` silently drops questions 9+                                | Low      | `QuestionDifficultyRadar.tsx`                               |
| 25  | `sort_by` should be `CourseSortBy \| None`, not `str \| None`                        | Low      | `filters.py`                                                |

---

# MUST FIX ELEGANTLY

1. **Eliminate redundant context loads**: Pass `AnalyticsContext` through the call chain so one page
   request makes one DB round-trip. The `context=` parameter patch in `get_teacher_overview` is a
   start; extend it to all services.
2. **Enable rollup reads for 90-day window**: Add `active_learners_90d` to `DailyTeacherMetrics` or
   build a separate 90-day aggregation.
3. **Add `<Suspense>` boundaries per page section**: Overview KPI cards, trend chart, and tables can
   each be wrapped independently so the page renders progressively rather than showing the skeleton
   until everything is ready.
4. **Add chart interactivity**: `onClick` handlers on trend points should navigate to a filtered
   learner or assessment view for that date bucket.
5. **Add authorization middleware at the router layer**: Move `ensure_course_in_scope` and
   `ensure_assessment_in_scope` to a FastAPI dependency on the relevant routes rather than relying
   on every service function to call it manually.

6. **Fix all "Stable" badges**: Query `LearnerRiskSnapshot` and `DailyTeacherMetrics` for real
   previous values. Use distinct labels — `"No previous data"` is honest; `"Stable"` is not.
7. **Fix risk distribution chart**: Pass `total` counts per risk level from the overview response,
   computed from all at-risk rows before the preview slice. Do not build a distribution from 8
   samples.
8. **Fix `recommended_action`**: Collect all matched reason codes and build a multi-signal action
   list. At minimum, use `if/elif` so the most severe condition wins rather than the last one.
9. **Fix export `KeyError`**: Use `context.courses_by_id.get(assignment.course_id)` and skip or use
   a placeholder name for orphaned submissions.
10. **Migrate `submitted_at`/`graded_at` to `TIMESTAMPTZ`**: Resolve the branched migration chain
    and apply the column type upgrade.
11. **Implement server-side pagination for course and assessment list endpoints**: Apply
    `filters.offset` and `filters.page_size` slicing. Return `total`, `page`, `page_size` in every
    list response. Update the frontend to use these fields and fetch the next page when the user
    navigates.
12. **Wire the timezone `COMMON_TIMEZONES` array to a `<select>`**: Replace the free-text `<Input>`
    with a `<select>` populated from `COMMON_TIMEZONES`. Add a search/filter if the list grows.
13. **Replace the filter `<form method="get">` with `useRouter` and `URLSearchParams`**: Avoid
    full-page reloads on filter changes. Preserve client-side table state on filter update.
14. **Add a `TeacherFilterBar` to the assessments page**: All analytics pages should share the same
    filter controls in the same position.
15. **Add sparklines to KPI cards**: Use the trend series already in the response to render a 20px
    area sparkline per card.
16. **Replace hardcoded hex colors with `hsl(var(--chart-N))`**: One-line change per chart
    component; fixes dark mode for all charts simultaneously.
17. **Implement `ReferenceLine` in `AnalyticsThresholdHistogram`**: The prop is documented and the
    backend sends `pass_threshold`. Render the vertical line.
18. **Add `valueFormatter` to all `ChartConfig` entries**: `"value: 3.0"` → `"3 learners"`.
    `"count: 150"` → `"150 submissions"`.
19. **Make risk score components visible**: Either add a tooltip on the score badge that breaks down
    inactivity/progress/failures/missing/grading contributions, or add collapsible detail rows to
    the at-risk table.
