# Teacher Analytics Dashboard - Critical Analysis (Current State)

**Date:** 2026-03-10 **Scope:** Current shipped teacher analytics implementation in this repository
**Goal:** Explain what is still bad, where the bugs are, why the dashboard is often not informative
enough for teachers, and why pagination feels broken.

---

## Executive Assessment

The teacher analytics dashboard is no longer an MVP stub. It has a real router, scoped pages,
exports, shared schemas, chart components, list/detail views, and loading states. It looks
production-ready.

That is exactly why the remaining problems matter more now.

The current implementation is weak in four places:

1. **The backend analytics data path is still too expensive and too Python-heavy.** Large teacher or
   org scopes will spend too much time loading broad datasets into memory and deriving metrics after
   the query.
2. **Several metrics and visual encodings are misleading.** Some numbers are computed correctly but
   displayed incorrectly; others are displayed as trends even though the sparkline is not the same
   metric.
3. **The dashboard is not informative enough for action.** Teachers can see that something is wrong,
   but the UI often stops before telling them who to contact, what changed, what threshold was
   crossed, or what to do next in-product.
4. **Pagination is inconsistent.** The shared table has client pagination, the page routes add
   server pagination around it, overview tables are hard-capped previews, and the result is
   confusing enough that users reasonably conclude there is no pagination.

This document focuses on the current code, not earlier plans.

---

## What Has Improved Since Earlier Critiques

Some older complaints are no longer true and should not be repeated:

1. `TeacherFilterBar.tsx` now uses client-side navigation via `router.push(..., { scroll: false })`.
2. `AnalyticsExportButton.tsx` now fetches CSV exports with the bearer token instead of relying on a
   raw tab open.
3. Analytics routes now have `loading.tsx` files and render `AnalyticsPageSkeleton`.
4. The threshold histogram now renders its threshold reference line.
5. `MetricCard` now carries `unit` and `is_higher_better`, and `TeacherKpiCards` uses that to avoid
   the earlier always-green polarity bug.

The problem is not that nothing was fixed. The problem is that the remaining defects are deeper and
easier to miss.

---

## 1. Backend Architecture Is Still Too Expensive

### 1.1 `load_analytics_context()` is still a wide in-memory loader

File: `apps/api/src/services/analytics/queries.py`

`load_analytics_context()` still builds one large Python context object by loading:

- courses, activities, chapters, and mappings
- trail runs and trail steps
- assignments and submissions
- exams and attempts
- quizzes and question stats
- code submissions
- certificates
- users
- user groups and memberships

The function is somewhat better than the first version because it now accepts `activity_start` and
`activity_end`, but the narrowing only applies to `TrailRun` and `TrailStep`. Everything else is
still fetched for the full scoped history.

Why this is still bad:

1. A 90-day teacher overview can still load every assignment submission, exam attempt, quiz attempt,
   code submission, certificate row, and cohort membership for the full course scope.
2. The expensive part of analytics is not only activity events. Assessments are also large, and
   those queries are still unbounded.
3. The whole design scales with raw historical row volume, not with the filtered time window the
   teacher selected.

### 1.2 Core endpoints still derive list analytics in Python and paginate after the fact

Files:

- `apps/api/src/services/analytics/courses.py`
- `apps/api/src/services/analytics/assessments.py`
- `apps/api/src/services/analytics/risk.py`

`get_teacher_course_list()`, `get_teacher_assessment_list()`, and `get_at_risk_learners()` all
follow the same pattern:

1. Load the full analytics context.
2. Compute every row for the entire scope in Python.
3. Sort the full result list in Python.
4. Slice `rows[filters.offset : filters.offset + filters.page_size]`.

This means pagination does **not** reduce compute cost. Page 1 and page 40 do almost the same work.
Only the final response payload gets smaller.

### 1.3 Detail pages still pay full-scope load cost

Files:

- `apps/api/src/services/analytics/courses.py`
- `apps/api/src/services/analytics/assessments.py`

`get_teacher_course_detail()` and `get_teacher_assessment_detail()` both load the full scoped
context and then filter in Python for one course or one assessment.

That means opening one course detail page can still load all scoped assignments, exams, quiz
attempts, code submissions, and trail data for every course the teacher can access.

The cost profile is upside down. The most targeted pages should be the cheapest pages.

### 1.4 Rollup coverage still does not remove enough live-query pressure

File: `apps/api/src/services/analytics/rollups.py`

The code now has rollups, but the live-query path still remains active for important cases,
especially as filters get broader or more specific. That means the polished frontend still depends
heavily on analytics-on-demand over operational tables.

---

## 2. Real Bugs In The Current Implementation

### 2.1 Score scaling is wrong in the frontend tables

Files:

- `apps/api/src/services/analytics/courses.py`
- `apps/api/src/services/analytics/assessments.py`
- `apps/web/components/Dashboard/Analytics/CourseHealthTable.tsx`
- `apps/web/components/Dashboard/Analytics/AssessmentOutliersTable.tsx`

Backend behavior:

1. `content_health_score` is calculated on a **0-100** scale in `build_course_rows()`.
2. `difficulty_score` is calculated as `100 - pass_rate`, also on a **0-100** scale in assessment
   builders.

Frontend behavior:

1. `CourseHealthTable` says the score is on a `0-1` scale and renders `Math.round(v * 100)%`.
2. `AssessmentOutliersTable` says `difficulty_score` is on a `0-1` scale and also renders
   `Math.round(v * 100)%`.

This is a concrete display bug. A backend value of `78.4` becomes `7840%` in the UI.

### 2.2 KPI sparklines do not represent the KPI they sit under

File: `apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`

`kpiCards` is assembled like this:

1. `returning_learners` uses the **active learners** trend as its sparkline.
2. `completion_rate` uses the **completions count** trend, not completion rate.
3. `at_risk_learners` uses `[high, medium, low]` risk distribution counts as if they were a time
   series.
4. `ungraded_submissions` uses the **grading completed** trend, which is the opposite operational
   signal.
5. `negative_engagement_courses` uses a per-course distribution of engagement deltas, not a
   historical trend.

This makes the KPI area visually persuasive and analytically dishonest. The card suggests trend
context that the data does not actually supply.

### 2.3 Date filtering inside `load_analytics_context()` is inconsistent

File: `apps/api/src/services/analytics/queries.py`

The function accepts `activity_start` and `activity_end`, but only applies them to trail data.
Assignment submissions, exam attempts, quiz attempts, code submissions, and certificates are still
loaded without the same window bound.

This creates two problems:

1. The optimization benefit is much smaller than it first appears.
2. Different metrics on the same page are computed from differently bounded raw datasets.

### 2.4 Sorting happens on derived Python lists, not stable query-backed order

Files:

- `apps/api/src/services/analytics/courses.py`
- `apps/api/src/services/analytics/assessments.py`

Sorting is performed after full row construction in Python. That means:

1. Sorting cost scales with full-scope row count.
2. It is easy for future fields to sort inconsistently between rollup-backed and live-query-backed
   responses.
3. There is no database-level pagination guarantee for deterministic ordering under concurrent data
   changes.

---

## 3. Why The Dashboard Is Still Not Informative Enough

### 3.1 KPI cards still lack action context

Files:

- `apps/api/src/services/analytics/schemas.py`
- `apps/web/components/Dashboard/Analytics/TeacherKpiCards.tsx`

The cards now show cleaner units and better badge semantics, but they still do not answer the
teacher's next question.

Missing context includes:

1. **Denominator or scope hint.** `Active learners = 120` is less useful without `of 430 enrolled`
   or `across 7 assigned courses`.
2. **Benchmark or target.** `Completion rate = 67.5%` gives no clue whether this is above or below
   org norms.
3. **Direct drill-down intent.** The card still does not route to the list that explains the number.
4. **Metric definition in-product.** There is no hover help or inline definition for what makes a
   learner `returning` or `at risk`.

### 3.2 Risk tables identify problems but do not connect them to workflow

Files:

- `apps/api/src/services/analytics/risk.py`
- `apps/web/components/Dashboard/Analytics/AtRiskLearnersTable.tsx`

The risk rows include `reason_codes`, `risk_components`, and `recommended_action`, which is better
than a bare score. But the table still stops short of operational usefulness:

1. The recommended action is generic text, not a link to the actual blocked submission, missing
   assessment, or learner profile.
2. The component breakdown is shown as `I / P / F / M / G`, which is compact but not
   self-explanatory.
3. The score formula is heuristic and opaque. There is still no explanation of what a `72` means
   beyond the label `high`.
4. Low-risk rows without reasons are excluded, so the table is not a complete ranked learner view;
   it is a reasons-only subset.

### 3.3 Overview preview tables hide too much

File: `apps/api/src/services/analytics/overview.py`

The overview response returns:

- `course_preview = course_rows[:8]`
- `assessment_preview = assessment_rows[:8]`
- `at_risk_preview = risk_rows[:8]`

The overview UI exposes `View all` links for courses and assessments, but not for the at-risk table
in the same immediate section.

Consequences:

1. The teacher sees a watchlist preview but no equally obvious full-list transition from that
   section.
2. Important long-tail risk cases are hidden behind an arbitrary preview cap.
3. The overview page reads like a complete picture while silently showing only the top 8 rows in
   each section.

### 3.4 Trend exploration is still thin

Files:

- `apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`
- `apps/web/components/Dashboard/Analytics/AnalyticsMultiSeriesTrendChart.tsx`

The main trend chart now supports click-through, but the interaction is still generic: clicking a
bucket routes to the assessment list with `bucket_start` and `sort_by=signals`.

That is better than nothing, but it is still weak because:

1. A spike in active learners does not necessarily mean the assessment list is the right
   destination.
2. A grading backlog signal should probably route to grading queues, not analytics assessments.
3. A teacher cannot click directly into the affected course from the same trend interaction.

---

## 4. Why Pagination Feels Broken

This needs to be precise, because the current problem is **not** simply "there is no pagination
code".

### 4.1 The shared table component does have client-side pagination

File: `apps/web/components/Dashboard/Analytics/AnalyticsDataTable.tsx`

`AnalyticsDataTable` uses TanStack Table with:

- `PaginationState`
- `getPaginationRowModel()`
- next/previous controls
- a visible page indicator

So at the component level, pagination exists.

### 4.2 The list pages also add separate server-side pagination outside the table

Files:

- `apps/web/app/orgs/[orgslug]/dash/analytics/courses/page.tsx`
- `apps/web/app/orgs/[orgslug]/dash/analytics/assessments/page.tsx`
- `apps/web/app/orgs/[orgslug]/dash/analytics/learners/at-risk/page.tsx`

These pages request API responses with `page` and `page_size`, then render separate Prev/Next
buttons below the table using the response metadata.

At the same time, the table still paginates the already paged `items` array.

That creates **dual pagination**:

1. Server page 1 might return 25 rows.
2. The client table then paginates those 25 rows again with its own default page size of 20.
3. The user can advance the table pager and the page pager independently.

This is a broken mental model. The teacher does not know whether they are moving through the full
dataset or through a slice of a slice.

### 4.3 Overview tables have no real pagination because they are previews

Files:

- `apps/api/src/services/analytics/overview.py`
- `apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`

The overview page receives only 8-row previews and passes them straight into `AnalyticsDataTable`.

Because there are only 8 rows, the table pager never appears. To the teacher, that looks like "this
table has no pagination", and on the overview page that is effectively true.

### 4.4 The current setup mixes three incompatible pagination modes

Current state:

1. **Overview pages:** fixed previews with no pager.
2. **List pages:** server pagination plus client pagination on top.
3. **Detail tables:** whatever rows are returned, with no coherent dataset navigation strategy.

That is why pagination feels absent or broken depending on where the user is standing.

### 4.5 The fix is architectural, not cosmetic

Choose one model per surface:

1. **Small preview tables:** no pagination, explicit preview label, clear `View all` CTA.
2. **Real list pages:** server pagination only, with the table component switched to manual
   pagination mode or client pagination disabled.
3. **Small local-only tables:** client pagination only, but only when the full dataset is
   intentionally loaded.

Right now the code mixes all three.

---

## 5. Presentation Problems That Hurt Trust

### 5.1 The risk component abbreviations are too cryptic

File: `apps/web/components/Dashboard/Analytics/AtRiskLearnersTable.tsx`

The table shows `I`, `P`, `F`, `M`, `G` for inactivity, progress, failures, missing assessments, and
grading.

That is compact for engineers, not for teachers. Without a legend, the row becomes harder to
understand precisely when the user needs explanation.

### 5.2 The course health metric name over-promises

Files:

- `apps/api/src/services/analytics/courses.py`
- `apps/web/components/Dashboard/Analytics/CourseHealthTable.tsx`

`content_health_score` is computed from a weighted blend of content freshness and average progress.
That is not really `content health`. It is a composite operational heuristic.

Naming it as a health score makes it sound validated and domain-complete when it is actually a
simple formula.

### 5.3 The dashboard uses polished visuals around heuristic data

Files:

- `apps/api/src/services/analytics/risk.py`
- `apps/web/components/Dashboard/Analytics/TeacherKpiCards.tsx`

The risk score and some course-level health numbers are heuristic formulas, but the UI presents them
with polished cards, badges, and charts that imply stronger analytic certainty than the model
deserves.

Visual polish increases perceived truth. That is useful only when the metric semantics are equally
strong.

---

## 6. Improvement Plan

### Highest Priority: Trust And Correctness

1. Fix the score scaling bug in `CourseHealthTable.tsx` and `AssessmentOutliersTable.tsx` so 0-100
   scores are rendered as 0-100, not multiplied by 100 again.
2. Replace fake KPI sparklines with real per-metric historical series, or remove the sparkline
   entirely when no true trend exists.
3. Add explicit metric definitions for `returning learners`, `at risk`, `content health`, and
   `difficulty`.
4. Add a visible `preview` label and a clear full-list CTA to every overview table section,
   including the at-risk section.

5. Disable client pagination inside `AnalyticsDataTable` when the page is already server-paginated.
6. Keep server pagination for courses, assessments, and at-risk learners, but make it the only pager
   users see.
7. Preserve filter, sort, and page state consistently in the URL so list navigation feels stable.
8. Add row counts like `showing 25 of 243` using server totals, not only local table counts.

9. Stop loading full-scope assessment and activity history for detail pages.
10. Push more aggregation into SQL or rollups instead of building whole ranked lists in Python and
    slicing afterward.
11. Apply time bounds consistently to assessment/event queries when a filter window exists.
12. Expand rollup coverage so large-window analytics do not fall back to expensive live-query
    behavior.

13. Turn risk rows into workflow entries with links to learner detail, submissions awaiting grading,
    and missing assessments.
14. Make chart clicks route to context-appropriate destinations instead of always routing through
    the assessment list.
15. Add comparative baselines such as org median, course target, or prior cohort benchmark.
16. Replace cryptic risk-component abbreviations with readable labels or a compact legend.

---

## Bottom Line

The teacher analytics dashboard is not bad because it lacks UI. It is bad where it matters more now:
**performance model, metric honesty, actionability, and navigation coherence**.

The most serious current issues are:

1. expensive full-context analytics computation,
2. wrong score rendering in key tables,
3. misleading KPI sparkline data,
4. preview-heavy UX that hides too much context,
5. and a pagination design that mixes preview caps, client pagination, and server pagination into
   one confusing experience.

If those are fixed, the existing product shell is strong enough to become a credible teacher
operating surface. Until then, it looks more mature than it really is.
