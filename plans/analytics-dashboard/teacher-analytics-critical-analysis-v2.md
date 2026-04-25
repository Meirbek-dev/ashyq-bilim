# Teacher Analytics Dashboard — Critical Analysis v2

**Date:** 2026-03-09 **Scope:** Full-stack critical review of the shipped analytics implementation
**Files analysed:** `src/services/analytics/**`, `src/routers/analytics.py`,
`apps/web/components/Dashboard/Analytics/**`, `apps/web/app/orgs/[orgslug]/dash/analytics/**`,
`apps/web/components/ui/chart.tsx`

---

## 1. Backend: Performance Catastrophe

### 1.1 `load_analytics_context` — 14+ unbounded queries per request

`apps/api/src/services/analytics/queries.py` — `load_analytics_context()`

Every analytics endpoint — overview, courses, assessments, at-risk, exports — calls this function.
It issues **14 separate sequential SQL queries** and hydrates the following tables entirely into
Python memory for the requested course IDs:

- `Course`, `Activity`, `Chapter`, `CourseChapter`, `ChapterActivity`
- `TrailRun`, `TrailStep`
- `Assignment`, `AssignmentUserSubmission`
- `Exam`, `ExamAttempt`
- `QuizAttempt`, `QuizQuestionStat`
- `CodeSubmission`
- `CertificateUser`, `Certifications`
- `User`, `UserGroup`, `UserGroupUser`

**No date filter anywhere.** `TrailStep` and `TrailRun` are fetched for all time. On a platform with
2 years of history and 5,000 users across 20 courses, a single overview request could pull 500,000+
trail step rows into Python RAM and discard 90% of them in the filter loop.

### 1.2 Triple context load on the overview page

The overview endpoint calls `get_teacher_overview()` which internally calls:

1. `load_analytics_context()` (full 14-query load)
2. `build_course_rows()` — which calls `load_analytics_context()` again unless the `context=`
   argument is passed
3. The overview page (`page.tsx`) also calls `getTeacherCourseList` and `getTeacherAssessmentList`
   as separate HTTP requests, which each start their own `load_analytics_context()` inside

**On a page load the context can be constructed 3 separate times for the same data.**

`build_course_rows` has a `context=` parameter added as a patch, but `build_course_rows` →
`build_assessment_rows` still triggers another internal path through `load_analytics_context`.

### 1.3 `TrailStep` used as proxy for user activity timestamps — wrong

`build_activity_events()` uses `step.update_date or step.creation_date` for determining when a user
completed an activity. `update_date` on a `TrailStep` is set whenever the step is updated for any
reason, not only on completion. `creation_date` is the row insertion timestamp. If a step is
backfilled or corrected by an admin, the timestamp is wrong. This corrupts the entire "active
learners" trend series.

### 1.4 `supports_rollup_reads` silently falls back on 90-day window

`rollups.py:30`:

```python
def supports_rollup_reads(filters: AnalyticsFilters) -> bool:
    return not filters.cohort_ids and filters.window in {"7d", "28d"} and filters.compare == "previous_period"
```

The 90-day window **always** runs the full live query path — all 14+ queries, all rows, no rollup. A
teacher viewing 90-day trends hits maximum load every time.

### 1.5 Assignment timestamps are `Text` columns

`migrations/versions/f7a8b9c0d1e2_add_assignment_submission_timestamps.py`:

```python
op.add_column("assignmentusersubmission", sa.Column("submitted_at", sa.Text(), nullable=True))
op.add_column("assignmentusersubmission", sa.Column("graded_at", sa.Text(), nullable=True))
```

`submitted_at` and `graded_at` are stored as **plain text strings**, not `TIMESTAMP` or `DateTime`.
The `hours_between()` helper in `queries.py` has to parse these strings with `parse_timestamp()`,
which can silently return `None` if the format differs even slightly. Any grading-latency metric
(`grading_latency_hours_p50`, `_p90`) is unreliable because timezone information in the stored
string is not guaranteed. These should be `TIMESTAMP WITH TIME ZONE` columns.

---

## 2. Data Correctness Bugs

### 2.1 `previous_at_risk` is hardcoded — delta is always 0

`overview.py`:

```python
at_risk_count = sum(1 for row in risk_rows if row.risk_level in {"medium", "high"})
previous_at_risk = at_risk_count  # no prior snapshot available in live path; neutral delta
```

The at-risk MetricCard always shows a flat direction and a `delta_value` of 0. The badge says
"Stable" (or "+0%") even when 30 new learners fell into risk. The comment acknowledges the problem
("no prior snapshot") but the fix — LearnerRiskSnapshot table — exists in the codebase and is never
queried here to compute a real previous value.

### 2.2 `previous_negative_engagement` is hardcoded to 0 — always inflated

```python
previous_negative_engagement = 0  # baseline for delta; no prior rollup in live path
```

Any non-zero number of failing-engagement courses will always show an "up" (warning) direction. The
delta is `current - 0 = current`, so 3 courses with negative engagement shows "+3" forever.

### 2.3 `delta_pct = None` when previous is 0 renders as "Stable" — misleading

`overview.py`:

```python
delta_pct = round(((value - previous) / previous) * 100, 1) if previous not in (None, 0) else None
```

When previous period had 0 completions and this period has 40, `delta_pct` is `None`. In
`TeacherKpiCards`:

```tsx
{metric.delta_pct === null ? t('kpi.stable') : ...}
```

The metric card says "Stable" for a metric that went from 0 to 40. This is factually wrong and
potentially dangerous for at-risk metrics.

### 2.4 Completion rate previous period calculation is broken

```python
previous_completion_rate = safe_pct(
    sum(1 for snapshot in snapshots.values() if snapshot.is_completed and snapshot.user_id in previous_active_set),
    len(previous_active_set),
)
```

This counts learners who have **completed the course at any point** and whose user ID appears in the
previous active set, divided by the number of previous-period active users. It does not count
completions that happened during the previous window — it counts completions that are true _right
now_ for users who happened to be active before. A learner who completed in the current period but
was also active in the previous period inflates the previous-period rate.

### 2.5 Risk score formula is opaque and arbitrary

`risk.py`:

```python
inactivity_component = min(40, (days_since_last_activity or 0) * 2)
progress_component = max(0, round((100 - snapshot.progress_pct) * 0.3, 1))
failure_component = min(24, failed_assessments[pair] * 8)
missing_component = min(24, missing * 6)
grading_component = min(12, open_grading_blocks[pair] * 4)
```

These multipliers (2, 0.3, 8, 6, 4) and caps (40, 24, 24, 12) are invented. There is no baseline, no
statistical calibration, and no explanation of what the thresholds (70 = high, 40 = medium)
represent. A learner who missed class for exactly 20 days but passed everything with 100% has a risk
score of 40 (medium risk) despite being high-performing. The formula also does not distinguish
between a 1-credit quiz and a final exam, treating all assessments identically.

### 2.6 KPI badge direction semantics are inverted for negative metrics

`TeacherKpiCards.tsx`:

```tsx
const badgeVariant = (direction: MetricCard['direction']) => {
  if (direction === 'up') return 'success';
  if (direction === 'down') return 'warning';
  return 'outline';
};
```

"Up" is always `success` (green). But for `at_risk_learners` and `ungraded_submissions`, "up" means
things are getting worse. A teacher sees a green badge saying "+5" for "At-risk learners" and might
interpret this as positive. The schema has no `is_good_up` flag and the frontend makes no
distinction between metric types.

### 2.7 "Returning learners" metric prefers 28d rollup even when window is 7d

`overview.py`:

```python
returning_learners=_metric(
    "Вернувшиеся учащиеся",
    float(teacher_rollup.returning_learners_28d if teacher_rollup is not None else returning_learners),
    ...
),
```

When the teacher selects the 7-day window and rollups exist, the value shown is the 28-day returning
learner count. The filter applied says "7 days" but the metric reports a 28-day figure. No rollup
field for `returning_learners_7d` exists in `DailyTeacherMetrics`.

---

## 3. Frontend: chart.tsx is Poorly Utilized

`apps/web/components/ui/chart.tsx` is a sophisticated wrapper that provides:

- **`ChartConfig` with `valueFormatter` per series** — formats tooltip values
- **`ChartLegendContent`** — a styled legend that reads labels and icons from config
- **`ChartTooltipContent`** with `labelFormatter`, `formatter`, `nameKey`, `labelKey`,
  `valueFormatter`, `indicator` variants
- **`ChartStyle`** — injects CSS custom properties for theme-aware colors
- **`ChartEmptyState`** — standardized empty state with title and description
- **`getPayloadConfigFromPayload`** — resolves rich label/icon/formatter from config registry

**None of the analytics chart components exploit these capabilities beyond the most basic usage.**

#### 3.1 `valueFormatter` is never set in any chart config

```tsx
// AnalyticsMultiSeriesTrendChart.tsx — actual config
config={{
  active_learners: { label: t('trend.activeLearners'), color: '#0f766e' },
  completions:     { label: t('trend.completions'),    color: '#0284c7' },
  submissions:     { label: t('trend.submissions'),    color: '#f59e0b' },
  grading_completed: { label: t('trend.gradingCompleted'), color: '#7c3aed' },
}}
```

Tooltip values show raw numbers. "Active learners: 47" is fine. "Submissions: 3.0" is confusing.
"Grading completed: 0.0000" is broken-looking when the value is fractional. The `valueFormatter`
callback on `ChartConfig` accepts `(value: number | string | null | undefined) => React.ReactNode`
and would allow `(v) => \`${v} learners\`` or `(v) => \`${v}%\`` per series. Nothing uses it.

#### 3.2 Hard-coded hex colors break dark mode and design-system tokens

Every chart writes literal hex codes directly into the `config` object:

```tsx
color: '#0f766e'; // EngagementAreaChart
color: '#1d4ed8'; // ScoreDistributionChart
color: '#b45309'; // CompletionFunnelChart
color: '#dc2626'; // RISK_COLORS in AnalyticsRiskDistributionChart (outside ChartContainer entirely)
```

`ChartStyle` injects CSS custom properties (`--color-{key}`) that can reference design-system tokens
or respect `prefers-color-scheme`. None of the analytics charts use CSS variable references like
`hsl(var(--chart-1))`. The result: all charts are invisible or clashing in dark mode, and changing
the brand color requires editing every chart file individually.

#### 3.3 `AnalyticsRiskDistributionChart` bypasses ChartContainer entirely

```tsx
const RISK_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#64748b',
};
```

This component renders a `PieChart` with `Cell` elements using raw hex fills, completely skipping
`ChartContainer` and `ChartConfig`. The tooltip has no `ChartTooltipContent` — Recharts renders its
default tooltip. Styling, font, and border are completely inconsistent with every other chart on the
page.

#### 3.4 No `ChartLegend`/`ChartLegendContent` on single-series charts

`EngagementAreaChart` shows a single area series. There is no legend. The card title is the only
context. If the chart is reused in a different context (e.g., embedded in a modal), there is no way
to identify the series without a label in the chart itself. `ChartLegendContent` is only used in
`AnalyticsMultiSeriesTrendChart` but even there the legend sits below the chart where 50% of users
on mobile will not see it because the chart is taller than the viewport.

#### 3.5 `ChartTooltipContent` receives no `labelFormatter`, `valueFormatter`, or `nameKey`

Every chart calls:

```tsx
<ChartTooltip content={<ChartTooltipContent />} />
```

`ChartTooltipContent` falls back to raw `dataKey` names like `"active_learners"`, `"value"`,
`"count"` as the tooltip label. On `EngagementAreaChart`, the tooltip shows `"value: 23"` with no
unit. On `CompletionFunnelChart`, it shows `"count: 150"`. The `ChartTooltipContent` supports
`nameKey` to pull a human label from the config and `valueFormatter` to apply formatting — neither
is ever set.

#### 3.6 `AnalyticsThresholdHistogram` has `thresholdBucketLabel` but no `ReferenceLine`

The component signature declares:

```tsx
thresholdBucketLabel?: string;
/** Label value of the bucket at the passing threshold, used to draw a vertical reference line */
```

The implementation renders a `BarChart` but there is **no `ReferenceLine` element in the component
body**. The prop is documented, accepted, and ignored. A teacher looking at a score distribution
histogram sees bars but cannot tell which bar represents the passing threshold.

#### 3.7 `ChartContainer` default `aspect-video` limits chart height on wide screens

`chart.tsx`:

```tsx
className={cn(
  "flex aspect-video justify-center ...",
  className,
)}
```

On a 1440px wide monitor the multi-series trend chart (`h-[320px] w-full`) is fine because
`className` overrides height, but charts that do not specify `className` will be forced into a 16:9
aspect ratio that looks stretched on large screens and cramped on mobile. Several charts specify
only `h-[XXX]px` without a width override, relying on the parent `w-full`.

---

## 4. Tables: No Pagination

`AnalyticsDataTable` uses `@tanstack/react-table` but only enables three row models:

```tsx
const table = useReactTable({
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  // getPaginationRowModel is MISSING
});
```

There is **no `getPaginationRowModel`, no `PaginationState`, no page size control, and no
next/previous page UI**. Every row returned by the API is rendered in a single DOM table. Problems:

- **At-risk learners table:** The API returns up to `page_size` rows (default 20 in
  `AnalyticsFilters`), but the overview page passes `data.at_risk_preview` directly — the backend
  hard-caps the preview at `risk_rows[:filters.offset + filters.page_size]`. If a teacher has 200
  at-risk learners, the overview shows 20 rows and the separate `/learners/at-risk` page also
  renders all 20 in a single unpaginated table.
- **CourseHealthTable on overview:** `courseRows.slice(0, 8)` hard-slices to 8 rows with a "View
  all" link. The courses page itself has no pagination — it renders all courses. A teacher with 50
  courses gets a 50-row table with no ability to navigate pages.
- **AssessmentOutliersTable:** Same slice-to-8 pattern on overview. The assessments page renders all
  assessments.
- **Client-side global filter (`getFilteredRowModel`) as a substitute for pagination:** The table's
  `globalFilter` searches across all loaded rows in the client. This means 200 rows are all mounted
  in the DOM, serialized into the JS runtime, and filtered in JavaScript. For large datasets this
  causes janky typing and layout reflow.
- **"Visible rows" counter but no total rows indicator:** The table shows
  `t('table.visibleRows', { count: rows.length })` which only counts post-filter visible rows. There
  is no "showing 20 of 200" indicator.

---

## 5. KPI Cards: Numbers Without Meaning

`TeacherKpiCards.tsx` shows six value cards:

```
Active learners: 120  ▲ +20%
Returning learners: 45  ▲ +5%
Completion rate: 67.5  ▲ +3.2%
At-risk learners: 14  ▲ +2   (green — misleadingly positive)
Ungraded submissions: 8  — Stable
Negative-engagement courses: 3  ▲ +3%
```

Every card has:

- A raw number
- A delta badge
- A one-line change text: "Compared to previous period: +20"

**Nothing else.** What is missing:

| Missing feature             | Why it matters                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sparkline**               | "Active learners: 120" tells you nothing about trend shape. Was it 50 two weeks ago and spiked, or has it been 120 for weeks?                                                   |
| **Benchmark / target line** | Is 67.5% completion good or bad? There is no course average, org average, or set goal to compare against.                                                                       |
| **Context label**           | "Active learners" over what window? The window filter exists but the card does not display it. A teacher switching from 7d to 28d sees a different number with no label change. |
| **Drill-down link**         | Clicking a KPI card does nothing. Clicking "At-risk: 14" should navigate to the at-risk learners page pre-filtered.                                                             |
| **Direction semantics**     | "Up" is always green. For `at_risk_learners` and `ungraded_submissions`, an increase is a negative signal. The card has no contextual awareness of metric polarity.             |
| **Unit**                    | "Completion rate: 67.5" — is that percent? Out of 100? The `%` symbol is absent from the card value display.                                                                    |

The `MetricCard` schema has `value: float` with no `unit` field and no `is_higher_better: bool`
field, so fixing this requires both schema and backend changes.

---

## 6. UX and Structural Problems

### 6.1 Filter form causes full-page navigation

`TeacherFilterBar.tsx`:

```tsx
<form action={basePath} method="get" className="...">
```

Applying filters submits an HTML form GET, causing a full Next.js server navigation. Chart data
re-fetches from scratch, scroll position is lost, and all client state (table sorting, expanded
rows) resets. The three window buttons (`7d`, `28d`, `90d`) use
`<Link href={buildHref(windowValue)} />` which is better, but the full filter form is a plain page
reload.

### 6.2 Timezone filter is a free-text `<Input>` with no validation

```tsx
<Input name="timezone" defaultValue={query.timezone || 'UTC'} placeholder={...} />
```

Users can type any string. If the backend receives an unknown timezone string like
`"Europe/Moscoww"`, `ZoneInfo(timezone)` raises `ZoneInfoNotFoundError` which is caught in
`AnalyticsFilters`:

```python
try:
    self._tzinfo = ZoneInfo(tz)
except ZoneInfoNotFoundError:
    raise ValueError(f"Unknown timezone: {tz}")
```

FastAPI converts this to a 422 validation error. The frontend has no error handling for 422
responses on analytics pages — the entire page breaks with the generic error boundary. A user who
makes a typo loses all their data without explanation.

### 6.3 Export buttons bypass auth for cookie-only users

`AnalyticsExportButton.tsx`:

```tsx
onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
```

The export URLs include no access token. Export routes (`/orgs/{org_id}/teacher/exports/*.csv`) rely
on `get_public_user` which reads the `Authorization` header or session cookie. Opening in a new tab
sends the session cookie but if the deployment uses Bearer-token-only auth (which
`getTeacherOverview` proves is the pattern — it passes `accessToken` explicitly), the export
endpoint will return 401 in a blank tab with no user-visible error.

### 6.4 `content_health_score` and `assessment_difficulty_score` are raw floats in tables

`CourseHealthTable.tsx`:

```tsx
{ accessorKey: 'content_health_score', header: t('courseHealth.colHealth') },
```

No cell formatter. The value `0.7843` is displayed as-is. Is this out of 1.0? Out of 100? The schema
says `float` with no documented range. The column header is "Health" with no unit. Same for
`assessment_difficulty_score`.

### 6.5 Alert text and recommended actions are hardcoded Russian strings. It's what I want! Don't change it

### 6.6 No loading or skeleton states

All analytics pages are server-rendered Next.js pages. Fetching runs in `async` page functions. If
`getTeacherOverview` is slow (2–5s under load), the user stares at a blank screen. There are no
loading skeletons, no `<Suspense>` boundaries, and no progressive rendering. The skeleton pattern
used elsewhere in the dashboard (e.g. `SidebarSkeleton`) is absent from all analytics pages.

### 6.7 No drill-down interactivity on charts

Clicking any data point on `AnalyticsMultiSeriesTrendChart`, `EngagementAreaChart`, or
`CompletionFunnelChart` does nothing. The charts do not support `onClick` handlers. A teacher who
sees a spike in submissions on day 14 cannot click it to see which learners submitted on that day or
which course drove the spike. Charts are read-only decoration.

### 6.8 Overview page makes redundant API calls

`page.tsx` (overview):

```tsx
const [overview, courseList, assessments, usergroups] = await Promise.all([
  getTeacherOverview(...),
  getTeacherCourseList(...),
  getTeacherAssessmentList(...),
  getUserGroups(...),
]);
```

`getTeacherOverview` internally runs `build_course_rows` (same computation as
`getTeacherCourseList`) and passes up to 8 course rows in `overview.courses` anyway.
`getTeacherCourseList` is called separately to supply `courseOptions` for the filter bar. The
backend performs the course computation twice per overview page load.

---

## 7. Summary: What Needs to Change

### Highest priority (correctness / trust)

1. **Fix `previous_at_risk`** — query `LearnerRiskSnapshot` for a real previous value instead of
   `at_risk_count`.
2. **Fix `previous_negative_engagement`** — derive from previous rollup, not hardcoded 0.
3. **Fix `delta_pct=None` → "Stable" lie** — use "No data" or "N/A" label, not "Stable".
4. **Fix inverted badge direction** — "up" on at-risk / ungraded submissions should be `warning`,
   not `success`.
5. **Make assigned timestamps `TIMESTAMP WITH TIME ZONE`** — migrate `submitted_at` / `graded_at`
   from `Text`.
6. **Add date bounds to `load_analytics_context`** — pass `start` / `end` to `TrailStep` and
   `TrailRun` queries.

### High priority (performance)

7. **Eliminate re-loading of `AnalyticsContext`** — pass the context object through the call chain
   so one request makes one DB round-trip, not 3–4.
8. **Enable rollup reads for 90d window** — add `active_learners_90d` to `DailyTeacherMetrics`
   rollup or build a separate 90d aggregation job.
9. **Paginate API responses** — `teacher_courses` and `teacher_assessments` endpoints must support
   `limit`/`offset`.

### Medium priority (tables)

10. **Add `getPaginationRowModel` to `AnalyticsDataTable`** — wire `PaginationState`, page size
    selector, and prev/next controls.
11. **Add "N of M total" indicator** to all tables so teachers know how many rows exist beyond the
    visible page.

### Medium priority (charts)

12. **Add `valueFormatter` to every `ChartConfig`** — at minimum: `n => \`\${n} learners\``,`n =>
    \`\${n}%\``,`n => \`\${n} hrs\``.
13. **Replace hardcoded hex colors with design-system tokens** (`hsl(var(--chart-1))` etc.) so dark
    mode works.
14. **Implement the `ReferenceLine` in `AnalyticsThresholdHistogram`** — the prop is documented but
    the element is never rendered.
15. **Fix `AnalyticsRiskDistributionChart`** — wrap in `ChartContainer`, use `ChartTooltipContent`,
    remove raw hex `Cell` fills.
16. **Add meaningful `labelFormatter`** to all tooltips — bucket labels should show formatted dates,
    not raw ISO strings.
17. **Add interactivity** — `onClick` on chart data points should navigate to a filtered view.

### Medium priority (UX)

18. **Add sparklines to KPI cards** — a micro trend line turns a static number into a trend story.
19. **Add metric polarity and unit to `MetricCard` schema** — `unit: string`,
    `is_higher_better: bool`.
20. **Replace the filter `<form method="get">` with client-side router navigation** using
    `useRouter` and `URLSearchParams` to avoid full-page reloads.
21. **Replace timezone free-text input** with a searchable select over the IANA timezone list.
22. **Add loading skeletons** to all analytics pages using `<Suspense>` with skeleton placeholders.
