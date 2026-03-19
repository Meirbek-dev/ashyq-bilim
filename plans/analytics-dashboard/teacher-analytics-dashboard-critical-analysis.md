# Teacher Analytics Dashboard — Critical Analysis

## Status

This document is a systematic critique of the currently shipped teacher analytics implementation. It
covers concrete bugs, architectural failures, data correctness problems, frontend structural issues,
and UX deficiencies. Each section names the specific file and line range where the problem lives.

---

## 1. Backend Performance — The `load_analytics_context` Disaster

### 1.1 Whole-database load on every request

`apps/api/src/services/analytics/queries.py` — `load_analytics_context()`

Every single analytics endpoint calls `load_analytics_context(db_session, course_ids)`, which issues
**14+ separate SQL queries** and loads the following tables entirely into Python memory for all
scoped courses:

- `Course`, `Activity`, `Chapter`, `CourseChapter`, `ChapterActivity`
- `TrailRun`, `TrailStep`
- `Assignment`, `AssignmentUserSubmission`
- `Exam`, `ExamAttempt`
- `QuizAttempt`, `QuizQuestionStat`
- `CodeSubmission`
- `CertificateUser`, `Certifications`
- `User` (every learner who has ever touched a course)
- `UserGroup`, `UserGroupUser` (all cohorts for all orgs of the courses)

For a teacher with 10 courses and 500 learners this may still work. For an org admin with 200
courses and 5 000 learners, this is a full cross-join load that will exhaust memory, saturate I/O,
and time out.

### 1.2 `load_analytics_context` is called twice per overview request

`apps/api/src/services/analytics/overview.py` — `get_teacher_overview()`

```python
context = load_analytics_context(db_session, scope.course_ids)   # first load
...
generated_rows_timestamp, course_rows = build_course_rows(scope, filters, db_session)
```

`build_course_rows` in `courses.py` calls `load_analytics_context` a **second time**. Every overview
request therefore pays the full 14-query load twice. There is no caching, no context sharing, and no
guard against this.

### 1.3 The rollup refresh doesn't fix this — it makes it worse

`apps/api/src/services/analytics/rollups.py` — `refresh_teacher_analytics_rollups()`

The rollup refresh job is designed to precompute expensive metrics so live endpoints can be fast.
But the refresh job also calls `load_analytics_context` for every org (loading the entire org into
Python memory), then calls `build_course_rows` which calls it **again**. The refresh therefore runs
the same double-load pattern that plagues the live endpoints, but for every org at once. This is a
nightly job that will run slower and slower as the platform grows and will likely fail at org scale
before providing any value.

---

## 2. Concrete Bugs

### 2.1 `active_learners_7d` is computed with two different definitions in the same function

`apps/api/src/services/analytics/courses.py` — `build_course_rows()` (live path)

```python
# used for engagement_delta_pct
current_active = {
    event.user_id for event in events
    if event.course_id == course_id and event.ts >= current_start
}

# used as the value written to TeacherCourseRow.active_learners_7d
len({event.user_id for event in events
     if event.course_id == course_id and event.ts >= now - timedelta(days=7)})
```

`current_start` is `now - window_days` (7, 28, or 90 days). The second expression is always
`now - 7 days`. When the selected window is 28d or 90d, `current_active` counts all users active in
the full window, while `active_learners_7d` counts only the last 7 days. They will produce different
numbers and the `engagement_delta_pct` is computed against the wrong baseline.

### 2.2 `TeacherOverview.tsx` aligns multi-series trend data by array position, not timestamp

`apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`

```tsx
const trendData = data.trends.active_learners.map((point, index) => ({
  bucket: new Date(point.bucket_start).toLocaleDateString(...),
  active_learners: point.value,
  completions: data.trends.completions[index]?.value ?? 0,
  submissions: data.trends.submissions[index]?.value ?? 0,
  grading_completed: data.trends.grading_completed[index]?.value ?? 0,
}));
```

Each trend series is built independently by `build_series()`. If any series has fewer buckets than
`active_learners` (e.g. because there were no grading events in that window), the positional
indexing falls through to `?? 0`, silently assigning a value of zero to the wrong date bucket. The
series are never re-aligned to their `bucket_start` timestamps. A chart rendered from this data can
show the wrong values on the wrong dates.

### 2.3 `AnalyticsRiskDistributionChart` shows distribution from 8 preview rows, not the full list

`apps/web/components/Dashboard/Analytics/AnalyticsRiskDistributionChart.tsx`

```tsx
export default function AnalyticsRiskDistributionChart({ rows }: ...) {
  const data = [
    { level: 'High', count: rows.filter((row) => row.risk_level === 'high').length },
    ...
  ]
}
```

The component receives `data.at_risk_preview` from the overview, which is capped at **8 rows**. For
an org with 200 at-risk learners, this chart displays a distribution derived from 8 samples. A
teacher looking at this chart will see completely wrong proportions between high, medium, and low
risk, drawing false conclusions about the severity of the situation.

### 2.4 Front-end filter options include sort keys that do not exist in the backend

`apps/web/components/Dashboard/Analytics/TeacherFilterBar.tsx`

```tsx
const sortOptions = [
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'signals', label: 'Signals' },
  ...
];
```

`apps/api/src/services/analytics/courses.py` — `build_course_rows()`:

```python
sort_map = {
    "name": ..., "active": ..., "completion": ...,
    "risk": ..., "health": ..., "engagement": ...,
    "pressure": ...,
}
```

Neither `"difficulty"` nor `"signals"` is a key in the backend sort map. The backend falls back to
`"pressure"` silently. Selecting either of these two sort options from the UI has no effect and
gives no feedback to the user.

### 2.5 `freshness_seconds` is always zero for live queries

`apps/api/src/services/analytics/rollups.py` — `freshness_seconds_from_rollup()`

```python
def freshness_seconds_from_rollup(generated_at: datetime | None) -> int:
    if generated_at is None:
        return 0
    normalized = generated_at ...
    return max(0, int((datetime.now(tz=UTC) - normalized).total_seconds()))
```

`apps/api/src/services/analytics/overview.py`:

```python
freshness_seconds=freshness_seconds_from_rollup(
    teacher_rollup.generated_at if teacher_rollup is not None else generated_at
),
```

When no rollup exists (the default state for most deployments), `generated_at` is
`context.generated_at`, which is `now_utc()` from the moment the request runs. The result is always
0 or a few milliseconds. The UI therefore always displays "0s" in the freshness panel, which is
meaningless and misleading. Teachers cannot tell how old the data is.

### 2.6 Course detail page fetches the full course list just to resolve a UUID

`apps/web/app/orgs/[orgslug]/dash/analytics/courses/[courseuuid]/page.tsx`

```tsx
const courseList = await getTeacherCourseList(org.id ?? org.org_id, accessToken, query);
const courseRow = courseList.items.find((item) => item.course_uuid === courseuuid);
if (!courseRow) notFound();
const detail = await getTeacherCourseDetail(
  org.id ?? org.org_id,
  courseRow.course_id,
  accessToken,
  query,
);
```

This fetches **all courses in scope**, loads all their analytics context on the backend, serializes
the entire list, sends it over the network, just to extract a single `course_id` from it. It then
makes a second round-trip to the detail endpoint. Two full-scope analytics loads for a detail page.
The backend course detail endpoint accepts a `course_id` integer, but the URL uses a UUID — the
UUID-to-ID resolution should be one cheap DB lookup, not a full analytics list computation.

### 2.7 `content_health_score` treats unknown update date as perfect freshness

`apps/api/src/services/analytics/courses.py`

```python
last_update = course_last_content_update(context, course_id)
days_since_update = (now - last_update).days if last_update is not None else None
freshness_score = 100.0 if days_since_update is None else max(0.0, round(100 - (days_since_update * 3.5), 1))
```

If the course has no recorded content update timestamp, `freshness_score = 100.0`. This is
backwards: a course with no update history should be treated as potentially very stale, not
perfectly fresh. Courses that have never been updated should score lower or be marked as unknown,
not receive a full health score.

### 2.8 Rollup teacher attribution only uses `creator_id`, ignoring co-authors

`apps/api/src/services/analytics/rollups.py` — `refresh_teacher_analytics_rollups()`

```python
for row in course_rows:
    teacher_id = context.courses_by_id[row.course_id].creator_id  # only creator
    ...
    db_session.merge(DailyCourseMetrics(
        ...
        teacher_user_id=context.courses_by_id[row.course_id].creator_id,
    ))
```

Rollup rows are written keyed to the course creator only. But `resolve_teacher_scope` correctly
resolves teacher scope through both `Course.creator_id` and active `ResourceAuthor` rows. This means
that for a co-authored course, the live query correctly attributes the course to both author A and
author B, but the rollup only writes metrics for author A. Author B queries will always fall back to
the slow live path.

### 2.9 `export_grading_backlog_csv` silently crashes on unknown course ID

`apps/api/src/services/analytics/exports.py`

```python
context.courses_by_id[assignment.course_id].name
```

This is a direct dictionary access without `.get()`. If `assignment.course_id` is not in
`courses_by_id` (which can happen if a course was deleted after submissions were recorded), this
raises a `KeyError` and crashes the entire CSV export mid-stream, potentially sending a partial CSV
to the browser with no error indicator.

### 2.10 `TeacherKpiCards` shows "stable" for 4 out of 6 metrics because delta is always `None`

`apps/web/components/Dashboard/Analytics/TeacherKpiCards.tsx`

```tsx
{
  metric.delta_pct === null ? 'stable' : `${metric.delta_pct > 0 ? '+' : ''}${metric.delta_pct}%`;
}
```

In `overview.py`, the following metrics pass `None` as the `previous` value in `_metric()`:

- `returning_learners` — always `None`
- `completion_rate` — always `None`
- `at_risk_learners` — always `None`
- `ungraded_submissions` — always `None`
- `negative_engagement_courses` — always `None`

Only `active_learners` gets an actual delta comparison. This means 5 of the 6 KPI cards show a green
"stable" badge even though there is no data to support the stability claim. The badge variant is
`"success"` for "up" and `"warning"` for "down". "stable" maps to `"outline"`, which is visually
identical to the no-data state — but it is still showing a misleading color signal.

---

## 3. Data Model and Metric Correctness

### 3.1 `cohort_ids` filter has no effect on actual data

`apps/api/src/services/analytics/queries.py` — `cohort_user_ids()`

```python
def cohort_user_ids(context: AnalyticsContext, cohort_ids: Iterable[int]) -> set[int] | None:
    normalized = {cohort_id for cohort_id in cohort_ids if cohort_id in context.usergroup_names_by_id}
    if not normalized:
        return None
    ...
```

If the user sends `cohort_ids=5,6` but groups 5 and 6 happen to come from a different org's courses
that are NOT in the scoped course list, `usergroup_names_by_id` won't contain them and `normalized`
will be empty, making the function return `None` (= "no filter applied"). The cohort filter silently
does nothing instead of returning an empty result or an error. Teachers who think they are scoping
to a specific cohort are instead seeing all learners.

### 3.2 Timezone bucketing in `build_series` can produce misaligned buckets

`apps/api/src/services/analytics/queries.py` — `bucket_start()` and `build_series()`

```python
cursor = bucket_start(start, bucket, tzinfo)
end_local = end.astimezone(tzinfo)
while cursor <= end_local:
    ...
    cursor += timedelta(days=7 if bucket == "week" else 1)
```

`timedelta(days=7)` is calendar-correct in most cases, but during a DST transition the local clock
day is not 24 hours. The cursor advances by exactly 604 800 seconds regardless of DST. On week mode
near spring-forward or fall-back boundaries, the cursor can drift to a different local time and
produce a bucket that starts at 1:00 AM or 11:00 PM instead of midnight, depending on timezone. This
is an edge case but causes incorrect aggregation for orgs in DST-affected zones.

### 3.3 Assessment difficulty score on `TeacherCourseRow` is an average of averages

`apps/api/src/services/analytics/courses.py`

```python
difficulty_values = [row.difficulty_score for row in assessments_by_course.get(course_id, []) if row.difficulty_score is not None]
assessment_difficulty_score = round(sum(difficulty_values) / len(difficulty_values), 1) if difficulty_values else None
```

`difficulty_score` for each assessment is itself `round(100 - pass_rate, 2)`. Averaging these across
assessments with different volumes of submissions is statistically meaningless — an assessment with
2 submissions that failed both counts the same as one with 200 submissions. A weighted average by
submission count is required.

### 3.4 Risk score thresholds are arbitrary and undocumented

`apps/api/src/services/analytics/risk.py`

```python
inactivity_component = min(40, (days_since_last_activity or 0) * 2)
progress_component = max(0, round((100 - snapshot.progress_pct) * 0.3, 1))
failure_component = min(24, failed_assessments[pair] * 8)
missing_component = min(24, missing * 6)
grading_component = min(12, open_grading_blocks[pair] * 4)
```

The maximum possible score is 40 + 30 + 24 + 24 + 12 = 130. The thresholds that determine risk level
are 70 (high) and 40 (medium). These numbers appear to be invented without validation against real
learner outcomes. More critically, there is no test that validates these thresholds, no
documentation explaining the rationale, and the score is opaque to teachers (they see "high · 84"
with no explanation of what 84 means or what would reduce it). A learner who has been inactive for
20 days gets a score of 40 and is marked "medium risk" with the same label as a learner who has
failed 3 assessments and missed 4 required items.

---

## 4. Frontend Structure Problems

### 4.1 The page components are bloated server-component wrappers with no separation of concerns

Every analytics page (`page.tsx`) directly calls multiple service functions, creates derived option
arrays for filters, and returns a single component tree. The pattern is:

```tsx
// courses/page.tsx
const [courseList, usergroups] = await Promise.all([...]);
const courseOptions = courseList.items.map(...);
const cohortOptions = ...;
return <div>...<CourseHealthTable ... /></div>;
```

This makes pages impossible to test in isolation, impossible to add loading or error states per
section, and forces full page remounts on filter changes. There are no layout files, no shared
data-fetching boundaries, and no Suspense boundaries.

### 4.2 Filter state is server-driven but components are client-driven with no synchronization

`TeacherFilterBar` submits a native HTML form, which triggers a full-page server-side re-render. But
the tables (`AnalyticsDataTable`) and charts inside are `'use client'` components with client-side
sorting and search state. When the page re-renders, all client state (sort order, search query, open
rows) is reset. A teacher who sorts the at-risk table by risk score, then changes the time window,
loses their sort order. There is no state persistence across filter changes.

### 4.3 Data is sliced at the component boundary with no user feedback

`apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`

```tsx
<CourseHealthTable orgslug={orgslug} rows={courseRows.slice(0, 8)} />
<AssessmentOutliersTable orgslug={orgslug} rows={assessmentRows.slice(0, 8)} />
```

The overview page silently renders only the top 8 courses and top 8 assessments. There is no
"showing 8 of 47" indicator, no "view all" link, no hint that data is truncated. Teachers with many
courses will believe the table is exhaustive.

### 4.4 `EngagementAreaChart` is a dead component

`apps/web/components/Dashboard/Analytics/EngagementAreaChart.tsx`

This component implements a single-series area chart. The overview no longer uses it — it was
replaced by `AnalyticsMultiSeriesTrendChart`. The course detail page still uses it. The component is
nearly identical to the chart configuration inside `AnalyticsMultiSeriesTrendChart`, duplicating
chart config, container sizing, and tooltip setup. There is no shared base chart layer; each
component reimplements its own Recharts setup independently.

### 4.5 The filter bar `course_ids` and `cohort_ids` controls only support single selection

`apps/web/components/Dashboard/Analytics/TeacherFilterBar.tsx`

Both `course_ids` and `cohort_ids` use a single `NativeSelect` element. The backend accepts
comma-separated integer lists for both parameters. The UI makes it impossible to filter to multiple
courses or multiple cohorts simultaneously, which is a primary use case for teaching leads and org
admins who need to compare cohorts.

### 4.6 The assessment detail route requires navigating through the assessment list

There are no links from the **at-risk learner rows** to the specific assessment that is blocking
progress. The risk model tracks `open_grading_blocks`, `failed_assessments`, and
`missing_required_assessments`, but the at-risk table only renders generic text ("Contact the
learner this week"). There is no drill-through from a learner to the specific blocked assessment.

Similarly, the **assessment list page** (`/assessments/page.tsx`) renders `AssessmentOutliersTable`
with `orgslug` for link generation, but the assessment list does not link to the at-risk learners
affected by that assessment. Navigation between the three analytics domains (overview → course →
assessment → learner) is one-directional and incomplete.

### 4.7 No loading states at all

All analytics pages are async server components that produce no loading UI. When a teacher changes a
filter, Next.js suspends the entire page while the server runs the analytics queries (which can take
seconds). There is no skeleton, no spinner, no partial content. The browser shows a blank or stale
page. For the overview endpoint, which triggers two `load_analytics_context` calls as identified in
section 1.2, this pause can be several seconds on any reasonably sized org.

### 4.8 Error handling swallows all errors into the same empty state

Every page wraps everything in a single try/catch:

```tsx
} catch (error) {
  return <AnalyticsEmptyState title="Analytics unavailable"
    description={error instanceof Error ? error.message : '...'} />;
}
```

A backend 403 (permission denied), a 404 (course not found), a 500 (query timeout), and a network
error all produce the same empty state component. Teachers cannot distinguish between "you don't
have access", "this course was deleted", and "the server is down". The error message from the API
(`detail` field) is surfaced as raw text, which is often a Python exception message not suitable for
display to teachers.

---

## 5. Chart and Visualization Problems

### 5.1 `AnalyticsThresholdHistogram` has no actual threshold visualization

`apps/web/components/Dashboard/Analytics/AnalyticsThresholdHistogram.tsx`

Despite being named "Threshold Histogram" and accepting a `thresholdLabel` prop, the component
renders no reference line, no vertical marker, and no visual threshold at all. The threshold is only
a `<Badge>` text label in the card header, which a teacher can easily miss. The pass threshold for
exams and assignments is one of the most actionable pieces of information in the score distribution
— teachers need to see the distribution split around the threshold, not just a badge saying "Pass
threshold: 60%".

### 5.2 `AnalyticsRiskDistributionChart` uses a single color for all risk levels

`apps/web/components/Dashboard/Analytics/AnalyticsRiskDistributionChart.tsx`

```tsx
config={{ count: { label: 'Learners', color: '#dc2626' } }}
```

All three bars (High, Medium, Low) are rendered in the same shade of red. This makes the chart
harder to scan at a glance. Risk levels should have semantically distinct colors: high = destructive
red, medium = warning amber, low = neutral grey/green.

### 5.3 Tooltip zero-value suppression

`apps/web/components/ui/chart.tsx` — `ChartTooltipContent`

```tsx
{item.value !== undefined && item.value !== null && (
  <span ...>{displayValue}</span>
)}
```

This correctly avoids rendering `null`, but the condition also suppresses `0`. When a series has
zero completions or zero submissions on a given day, the tooltip row is hidden entirely. Teachers
hovering over low-activity buckets see an incomplete tooltip that omits the zero values rather than
showing "Completions: 0".

### 5.4 `CompletionFunnelChart` hides the X axis entirely

`apps/web/components/Dashboard/Analytics/CompletionFunnelChart.tsx`

```tsx
<XAxis
  type="number"
  hide
/>
```

A funnel chart without a numeric axis gives no scale reference. Teachers cannot tell whether a bar
represents 3 learners or 300 without a tooltip interaction. For a chart that is supposed to show
drop-off severity, hiding the count axis defeats the purpose.

### 5.5 `QuestionDifficultyRadar` silently caps at 8 questions

`apps/web/components/Dashboard/Analytics/QuestionDifficultyRadar.tsx`

```tsx
const radarData = data.slice(0, 8).map(...)
```

There is no message indicating that questions beyond the first 8 are hidden. An exam with 20
questions has 12 invisible data points. The radar also only shows `accuracy_pct` and drops
`avg_time_seconds`, which is provided in the payload but unused, even though time spent per question
is a strong difficulty signal.

---

## 6. UX and Informational Deficiencies

### 6.1 `freshness_seconds` is displayed raw

`apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`

```tsx
<div className="mt-2 text-lg font-semibold text-slate-900">{data.freshness_seconds}s</div>
```

"864000s" means nothing. "10 days ago" is actionable. Even when the service is running correctly and
rollups are populated, the freshness panel will show numbers like "3600s" or "86400s" that require
mental arithmetic to interpret. This should be a human-readable relative duration.

### 6.2 Alert type is displayed as raw underscore_case

`apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`

```tsx
<span ...>{alert.type.replace('_', ' ')}</span>
```

`"risk_spike"` becomes `"risk spike"`. `"grading_backlog"` becomes `"grading backlog"`. A
`.replace('_', ' ')` only replaces the **first** underscore. `"code_challenge_outlier"` would become
`"code challenge_outlier"`. This is a known JS `.replace()` gotcha — a regex with the global flag is
needed. The display strings should be proper labels anyway ("Grading Backlog", "At-Risk Spike").

### 6.3 The overview page sends 4 API requests on load with no visual feedback between them

`apps/web/app/orgs/[orgslug]/dash/analytics/page.tsx`

```tsx
const [overview, courseRows, assessmentRows, usergroups] = await Promise.all([
  getTeacherOverview(...),
  getTeacherCourseList(...),     // triggers load_analytics_context (second time in this request)
  getTeacherAssessmentList(...), // triggers load_analytics_context (third time)
  getUserGroups(...),
]);
```

Three of these four calls independently trigger a full `load_analytics_context` on the backend
(overview itself calls it twice, course list calls it once more, assessment list calls it once
more). For the same scope and window, this is up to **5 full database loads** per page view.

### 6.4 The "Recommended action" column is generic and not actionable

`apps/api/src/services/analytics/risk.py`

```python
recommended_action = "Send a personal outreach message and review the next blocked assessment."
if "inactive_7d" in reason_codes:
    recommended_action = "Contact the learner this week and ask for a re-entry plan."
if "low_progress" in reason_codes:
    recommended_action = "Schedule a check-in focused on content pacing and chapter engagement."
if "repeated_failures" in reason_codes:
    recommended_action = "Review failed assessments together and offer additional practice resources."
if "missing_required_assessments" in reason_codes:
    recommended_action = "Set a deadline for missing work and offer an catch-up plan."
if "grading_block" in reason_codes:
    recommended_action = "Prioritise grading this learner's submissions to unblock their progress."
```

Each learner gets exactly one recommended action regardless of how many risk factors they have. A
learner who is inactive, has failed 3 assessments, and has 4 missing required exercises gets the
single message for the last matched reason code. The logic is `if, if, if` (not `elif`), so the last
matched condition always wins. The most urgent action is not necessarily last.

### 6.5 The at-risk table shows "user_display_name" as raw `User #123` when name is missing

`apps/web/components/Dashboard/Analytics/AtRiskLearnersTable.tsx`

```tsx
<div className="text-xs text-slate-500">User #{row.original.user_id}</div>
```

When the display name resolves to "Unknown learner" (a user whose name fields are all empty, which
is valid for SSO users) and the secondary line also shows a raw integer ID, there is no way for a
teacher reading the table to identify the learner without going to the user management section. The
table should show the email or username as a fallback rather than a raw integer.

### 6.6 The assessment list page at `/assessments` has no filter bar

`apps/web/app/orgs/[orgslug]/dash/analytics/assessments/page.tsx`

The assessments list page does not render a `TeacherFilterBar`. Window, compare mode, cohort, and
course filters cannot be changed from the assessments page. Teachers who want to see assessments for
a specific cohort or filtered to the last 7 days have to go back to the overview page, change the
filter, and then navigate to assessments again.

---

## 7. Security and Correctness Considerations

### 7.1 No row-level authorization on course detail endpoint

`apps/api/src/routers/analytics.py` — `teacher_course_detail`

```python
scope = _scope_for(db_session, current_user, org_id, filters, action="read")
return get_teacher_course_detail(db_session, scope, course_id, filters)
```

`_scope_for` resolves the teacher's course scope, but the course detail endpoint does not verify
that `course_id` is within `scope.course_ids` before loading it. The check is inside
`get_teacher_course_detail`, which calls `ensure_course_in_scope`. This is correct but fragile: if a
developer adds a new detail endpoint and forgets to call `ensure_course_in_scope`, a teacher can
request analytics for any course by ID.

The assessment detail endpoint has the same pattern — `ensure_assessment_in_scope` is called inside
the service, not at the router layer where it would be enforced as a first-class authorization
boundary.

### 7.2 `sort_by` and `sort_order` query parameters are passed unsanitized into the Python sort_map

`apps/api/src/services/analytics/courses.py`

```python
sort_by = filters.sort_by or "pressure"
sort_map = { ... }
rows.sort(key=sort_map.get(sort_by, sort_map["pressure"]), reverse=reverse)
```

Since `sort_map.get(unknown_key, fallback)` is used, this is not a direct injection risk — unknown
values fall back gracefully. However, `sort_by` is a free-form string from
`AnalyticsFilters.sort_by: str | None` with no validation of allowed values. It should be a
`Literal` type that the Pydantic model validates, ensuring the API rejects invalid sort keys with a
422 rather than silently falling back.

---

## Summary Priority Matrix

| #    | Problem                                                       | Severity | File                                 |
| ---- | ------------------------------------------------------------- | -------- | ------------------------------------ |
| 1.2  | Double `load_analytics_context` per overview request          | Critical | `overview.py`, `courses.py`          |
| 2.2  | Multi-series trend data aligned by index, not timestamp       | Critical | `TeacherOverview.tsx`                |
| 2.3  | Risk distribution from 8-row preview                          | High     | `AnalyticsRiskDistributionChart.tsx` |
| 2.10 | 5 of 6 KPI cards always show "stable"                         | High     | `overview.py`                        |
| 2.5  | `freshness_seconds` always 0 for live queries                 | High     | `rollups.py`, `overview.py`          |
| 2.4  | Frontend sort options that don't exist in backend             | High     | `TeacherFilterBar.tsx`, `courses.py` |
| 2.1  | `active_learners_7d` computed with two definitions            | High     | `courses.py`                         |
| 2.6  | Course detail double-fetch via UUID resolution                | Medium   | `courses/[courseuuid]/page.tsx`      |
| 2.9  | CSV export crashes on deleted course                          | Medium   | `exports.py`                         |
| 3.1  | `cohort_ids` filter silently has no effect                    | Medium   | `queries.py`                         |
| 2.7  | No update timestamp = perfect freshness                       | Medium   | `courses.py`                         |
| 2.8  | Rollup only attributes to creator, not co-authors             | Medium   | `rollups.py`                         |
| 4.3  | Overview silently shows only 8 rows per table                 | Medium   | `TeacherOverview.tsx`                |
| 5.1  | No visual threshold line in histogram                         | Medium   | `AnalyticsThresholdHistogram.tsx`    |
| 4.7  | No loading states anywhere in the UI                          | Medium   | All page files                       |
| 6.3  | 5 full DB loads per overview page view                        | Medium   | `page.tsx` + services                |
| 5.3  | Tooltip hides zero values                                     | Low      | `chart.tsx`                          |
| 6.2  | `alert.type.replace('_', ' ')` only replaces first underscore | Low      | `TeacherOverview.tsx`                |
| 5.4  | Funnel chart hides X axis                                     | Low      | `CompletionFunnelChart.tsx`          |
| 6.1  | `freshness_seconds` displayed as raw integer                  | Low      | `TeacherOverview.tsx`                |
