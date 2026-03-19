# Teacher Analytics Dashboard Technical Design

## Document Status

- Scope: teacher and instructor analytics only
- Audience: backend, frontend, and data implementation work in this repository
- Goal: convert the teacher analytics plan into an implementation-ready design

## Problem Statement

The LMS already has a dashboard shell, permission-driven navigation, and a few isolated analytics
surfaces such as code challenge instructor analytics. What it does not have is a dedicated teacher
analytics domain with stable read APIs, clear metric definitions, and scalable rollups.

The teacher dashboard must help instructors improve courses and intervene on learner risk. It should
answer operational questions, not just display charts.

Primary decisions the dashboard must support:

- Which learners need outreach this week?
- Which courses, chapters, or activities are losing learners?
- Which assignments, quizzes, exams, or code challenges are too hard or unclear?
- Where is grading slowing down progress?
- Did recent course updates improve engagement or completion?

## Existing Repo Constraints

### Confirmed current-state facts

- Dashboard shell already exists under `apps/web/app/orgs/[orgslug]/dash`.
- Frontend navigation is permission-driven in `apps/web/lib/rbac/navigation-policy.ts` and
  `apps/web/hooks/useNavigationPermissions.ts`.
- Backend RBAC already defines `analytics` as a resource in `apps/api/src/db/permission_enums.py`.
- There is no dedicated analytics router in `apps/api/src/router.py`.
- Code challenge instructor analytics already exists in
  `apps/api/src/routers/courses/code_challenges.py`.
- Course participation is currently modeled through `TrailRun` and `TrailStep`, not a dedicated
  enrollment table (feel free to rewrite).

### Critical modeling caveat

There is no canonical `Enrollment` or `CourseEnrollment` table in the current schema.

For v1:

- `TrailRun` is the enrollment proxy for course participation.
- `TrailStep` is the completion/progress backbone.
- `CertificateUser` is a secondary completion validation signal.

This means the first analytics release must explicitly document that completion and enrollment
metrics are based on participation runs, not a true enrollment registry.

## Design Goals

- Keep analytics read APIs separate from transactional course APIs.
- Reuse existing models and analytics islands where they are already correct.
- Use direct ORM queries only where the query cost is bounded.
- Introduce rollup tables for cross-course trends, ranked tables, and time-series charts.
- Exclude preview and teacher test activity from learner-facing performance metrics by default.
- Use the existing shadcn chart primitives in `apps/web/components/ui/chart.tsx` for area, bar, pie,
  radar, radial, and tooltip-based visualizations.
- High type-safety. Minimize any types

## Non-Goals

- No platform-wide maintainer dashboard in this phase.
- No generic BI builder.
- No attempt to solve every historical backfill issue before teacher v1 ships.
- No changes to core transactional endpoints beyond emitting analytics-friendly data and events.

## Architecture Overview

### Backend layers

- Router layer: teacher analytics endpoints under a dedicated analytics router.
- Service layer: overview, courses, assessments, risk, exports, and rollup refresh logic.
- Query layer: centralized SQLModel or SQLAlchemy query builders for filters, course scope, and time
  windows.
- Storage layer:
  - raw transactional tables already in the repo
  - new analytics rollup tables
  - optional analytics event table for missing historical signals

### Frontend layers

- Route entries under the existing org dashboard shell.
- Permission gating at navigation and page boundary levels.
- Shared filter bar, KPI cards, ranked tables, and chart components.
- Thin analytics service client that consumes stable read models from the API.

## Proposed Backend API Contracts

All analytics endpoints live under `GET /api/v1/analytics/...` and are read-only.

### Common query parameters

Use the same filter contract across endpoints.

```ts
type WindowPreset = '7d' | '28d' | '90d';
type ComparePreset = 'previous_period' | 'none';
type Bucket = 'day' | 'week';

interface AnalyticsFilterQuery {
  window?: WindowPreset;
  compare?: ComparePreset;
  bucket?: Bucket;
  course_ids?: string; // comma-separated numeric ids
  cohort_ids?: string; // comma-separated usergroup ids
  teacher_user_id?: number; // org admin or teaching lead only
  timezone?: string; // IANA timezone, fallback UTC
}
```

### Access rules

- Teacher overview, courses, and assessments require `analytics:read` with `assigned`, `org`, or
  `all` scope.
- Exports require `analytics:export` with `assigned`, `org`, or `all` scope.
- Course and assessment detail endpoints must additionally verify the user is the course owner,
  active author, grader, or has org-wide analytics scope.

### 1. Teacher Overview

`GET /api/v1/analytics/orgs/{org_id}/teacher/overview`

Purpose:

- Drive the default dashboard landing page.
- Return summary KPIs, trend lines, urgent alerts, and a compact risk feed.

Response model:

```ts
interface TeacherOverviewResponse {
  generated_at: string;
  freshness_seconds: number;
  window: '7d' | '28d' | '90d';
  compare: 'previous_period' | 'none';
  scope: {
    org_id: number;
    teacher_user_id: number;
    course_ids: number[];
    cohort_ids: number[];
  };
  summary: {
    active_learners: MetricCard;
    returning_learners: MetricCard;
    completion_rate: MetricCard;
    at_risk_learners: MetricCard;
    ungraded_submissions: MetricCard;
    negative_engagement_courses: MetricCard;
  };
  trends: {
    active_learners: TimeSeriesPoint[];
    completions: TimeSeriesPoint[];
    submissions: TimeSeriesPoint[];
    grading_completed: TimeSeriesPoint[];
  };
  alerts: AlertItem[];
  at_risk_preview: AtRiskLearnerRow[];
}

interface MetricCard {
  value: number;
  delta_value: number | null;
  delta_pct: number | null;
  direction: 'up' | 'down' | 'flat';
  label: string;
}

interface TimeSeriesPoint {
  bucket_start: string;
  value: number;
}

interface AlertItem {
  id: string;
  type:
    | 'risk_spike'
    | 'engagement_drop'
    | 'grading_backlog'
    | 'assessment_outlier'
    | 'content_stale';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  course_id?: number;
  activity_id?: number;
  assessment_id?: number;
  learner_count?: number;
}
```

### 2. Teacher Course List

`GET /api/v1/analytics/orgs/{org_id}/teacher/courses`

Purpose:

- Rank teacher-owned or assigned courses by health, engagement, and operational pressure.

Response model:

```ts
interface TeacherCourseListResponse {
  generated_at: string;
  items: TeacherCourseRow[];
}

interface TeacherCourseRow {
  course_id: number;
  course_uuid: string;
  course_name: string;
  active_learners_7d: number;
  completion_rate: number;
  engagement_delta_pct: number | null;
  at_risk_learners: number;
  ungraded_submissions: number;
  content_health_score: number;
  assessment_difficulty_score: number | null;
  last_content_update_at: string | null;
  top_alert: AlertItem | null;
}
```

### 3. Teacher Course Detail

`GET /api/v1/analytics/orgs/{org_id}/teacher/courses/{course_id}`

Purpose:

- Show the full improvement view for one course.

Response model:

```ts
interface TeacherCourseDetailResponse {
  generated_at: string;
  course: {
    id: number;
    course_uuid: string;
    name: string;
    org_id: number;
  };
  summary: {
    enrolled_learners: number;
    active_learners_7d: number;
    completion_rate: number;
    avg_progress_pct: number;
    at_risk_learners: number;
    ungraded_submissions: number;
    certificates_issued: number;
  };
  funnels: {
    course_completion: FunnelStep[];
    chapter_dropoff: FunnelStep[];
  };
  engagement_trend: TimeSeriesPoint[];
  activity_dropoff: ActivityDropoffRow[];
  at_risk_learners: AtRiskLearnerRow[];
  assessment_outliers: AssessmentOutlierRow[];
  content_health: ContentHealthRow[];
}

interface FunnelStep {
  label: string;
  count: number;
  pct_of_previous: number | null;
}

interface ActivityDropoffRow {
  chapter_id: number;
  activity_id: number;
  activity_name: string;
  activity_type: string;
  previous_step_completions: number;
  current_step_completions: number;
  dropoff_pct: number;
}

interface ContentHealthRow {
  course_id: number;
  signal: string;
  severity: 'info' | 'warning' | 'critical';
  value: number | null;
  note: string;
}
```

### 4. Teacher Assessment List

`GET /api/v1/analytics/orgs/{org_id}/teacher/assessments`

Purpose:

- Rank assignments, quizzes, exams, and code challenges that need attention.

Response model:

```ts
interface TeacherAssessmentListResponse {
  generated_at: string;
  items: AssessmentOutlierRow[];
}

interface AssessmentOutlierRow {
  assessment_type: 'assignment' | 'quiz' | 'exam' | 'code_challenge';
  assessment_id: number;
  activity_id: number | null;
  course_id: number;
  course_name: string;
  title: string;
  submission_rate: number | null;
  completion_rate: number | null;
  pass_rate: number | null;
  median_score: number | null;
  avg_attempts: number | null;
  grading_latency_hours_p50: number | null;
  grading_latency_hours_p90: number | null;
  difficulty_score: number | null;
  outlier_reason_codes: string[];
}
```

### 5. Teacher Assessment Detail

`GET /api/v1/analytics/orgs/{org_id}/teacher/assessments/{assessment_type}/{assessment_id}`

Purpose:

- Show one assessment in depth, including score distributions and common failure patterns.

Response model:

```ts
interface TeacherAssessmentDetailResponse {
  generated_at: string;
  assessment_type: 'assignment' | 'quiz' | 'exam' | 'code_challenge';
  assessment_id: number;
  course_id: number;
  title: string;
  summary: {
    eligible_learners: number;
    submitted_learners: number;
    submission_rate: number | null;
    pass_rate: number | null;
    median_score: number | null;
    avg_attempts: number | null;
    grading_latency_hours_p50: number | null;
    grading_latency_hours_p90: number | null;
  };
  score_distribution: HistogramBucket[];
  attempt_distribution: HistogramBucket[];
  question_breakdown?: QuestionDifficultyRow[];
  common_failures: CommonFailureRow[];
  learner_rows: AssessmentLearnerRow[];
}

interface HistogramBucket {
  label: string;
  count: number;
}

interface QuestionDifficultyRow {
  question_id: string;
  question_label: string;
  accuracy_pct: number | null;
  avg_time_seconds: number | null;
}

interface CommonFailureRow {
  key: string;
  label: string;
  count: number;
}

interface AssessmentLearnerRow {
  user_id: number;
  user_display_name: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  submitted_at: string | null;
  graded_at: string | null;
  status: string | null;
}
```

### 6. At-Risk Learners

`GET /api/v1/analytics/orgs/{org_id}/teacher/learners/at-risk`

Purpose:

- Return the operational learner list that teachers actually act on.

Response model:

```ts
interface AtRiskLearnersResponse {
  generated_at: string;
  total: number;
  items: AtRiskLearnerRow[];
}

interface AtRiskLearnerRow {
  user_id: number;
  course_id: number;
  course_name: string;
  user_display_name: string;
  cohort_name: string | null;
  progress_pct: number;
  days_since_last_activity: number | null;
  open_grading_blocks: number;
  failed_assessments: number;
  missing_required_assessments: number;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  reason_codes: string[];
  recommended_action: string;
}
```

### 7. Exports

Endpoints:

- `GET /api/v1/analytics/orgs/{org_id}/teacher/exports/at-risk.csv`
- `GET /api/v1/analytics/orgs/{org_id}/teacher/exports/grading-backlog.csv`
- `GET /api/v1/analytics/orgs/{org_id}/teacher/exports/course-progress.csv`
- `GET /api/v1/analytics/orgs/{org_id}/teacher/exports/assessment-outcomes.csv`

Contract:

- `Content-Type: text/csv`
- same filter parameters as overview endpoints
- maximum row cap per export for v1: 50,000 rows

## Course Scope Resolution

Every teacher endpoint must begin with course scope resolution.

### Scope rules for v1

Use these sources in order:

1. If the caller has `analytics:read:org` or `analytics:read:all`, use all org courses after filter
   narrowing.
2. Otherwise resolve teacher-managed courses through:

- `Course.creator_id == current_user.id`
- active authorship rows in `ResourceAuthor` where `resource_uuid == Course.course_uuid`

1. For assignment and grading workload, also honor assignment-related scope when the user is acting
   as a grader.

### ORM sources

- `apps/api/src/db/courses/courses.py` -> `Course`
- `apps/api/src/db/resource_authors.py` -> `ResourceAuthor`

### Query sketch

```python
course_scope_stmt = (
  select(Course.id)
  .outerjoin(ResourceAuthor, ResourceAuthor.resource_uuid == Course.course_uuid)
  .where(Course.org_id == org_id)
  .where(
    or_(
      Course.creator_id == current_user.id,
      and_(
        ResourceAuthor.user_id == current_user.id,
        ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
      ),
    )
  )
)
```

## Metric Source Map

This section names the concrete source of truth for every v1 metric.

| Metric                         | Primary ORM source                                                                                  | Query strategy                                                                                                            | Rollup target                                         | Notes                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Managed course count           | `Course`, `ResourceAuthor`                                                                          | resolve teacher course scope then count distinct course ids                                                               | `daily_teacher_metrics`                               | Include creator and active author relationships                               |
| Active learners 7d/28d         | `TrailStep`, `QuizAttempt`, `ExamAttempt`, `AssignmentUserSubmission`, `CodeSubmission`             | union distinct `(user_id, course_id)` with activity timestamps inside window                                              | `daily_course_metrics`, `daily_teacher_metrics`       | Exclude exam preview attempts via `ExamAttempt.is_preview == False`           |
| Returning learners             | same as active learner sources                                                                      | active current window intersect active previous window                                                                    | `daily_teacher_metrics`                               | Window comparison metric only                                                 |
| Enrolled learners              | `TrailRun`                                                                                          | distinct `TrailRun.user_id` per course                                                                                    | `daily_course_metrics`                                | Current repo has no dedicated enrollment table                                |
| Completion rate                | `TrailRun`, `TrailStep`, `ChapterActivity`, `CertificateUser`                                       | denominator from `TrailRun`; numerator from all required activities completed; compare certificate issuance as validation | `daily_course_metrics`                                | `TrailRun.status` alone is not strong enough as sole truth                    |
| Average progress percent       | `TrailStep`, `ChapterActivity`                                                                      | `complete_steps / total_course_steps` averaged over active `TrailRun` users                                               | `daily_user_course_progress`, `daily_course_metrics`  | total steps from `ChapterActivity` count                                      |
| At-risk learners               | `TrailRun`, `TrailStep`, `AssignmentUserSubmission`, `QuizAttempt`, `ExamAttempt`, `CodeSubmission` | score by inactivity, low progress, repeated failures, missing assessments, grading blocks                                 | `learner_risk_snapshot`                               | Requires transparent reason codes                                             |
| Days since last activity       | same learner activity union                                                                         | max activity timestamp per learner-course                                                                                 | `daily_user_course_progress`, `learner_risk_snapshot` | compute in UTC, render in local tz                                            |
| Ungraded submissions           | `AssignmentUserSubmission`, `AssignmentTaskSubmission`, `Assignment`                                | count submissions with status `SUBMITTED` or `LATE` for teacher-scoped courses                                            | `daily_teacher_metrics`, `daily_assessment_metrics`   | current schema supports backlog count but not precise grading latency         |
| Grading latency p50/p90        | `AssignmentUserSubmission` plus new timestamps                                                      | `graded_at - submitted_at` percentile aggregates                                                                          | `daily_assessment_metrics`                            | requires schema change; current model lacks first-class timestamps            |
| Chapter or activity drop-off   | `CourseChapter`, `ChapterActivity`, `TrailStep`                                                     | compare completion counts between sequential steps                                                                        | `daily_course_engagement`                             | order driven by `CourseChapter.order` and `ChapterActivity.order`             |
| Quiz score distribution        | `QuizAttempt`                                                                                       | histogram over `score / max_score` by activity                                                                            | `daily_assessment_metrics`                            | use only completed attempts where `end_ts` is present                         |
| Quiz question difficulty       | `QuizQuestionStat`                                                                                  | `correct_count / total_attempts` and avg time                                                                             | `daily_assessment_metrics`                            | already modeled for per-question stats                                        |
| Exam completion rate           | `ExamAttempt`                                                                                       | count non-preview submitted or auto-submitted attempts over eligible learners                                             | `daily_assessment_metrics`                            | exclude `is_preview == True`                                                  |
| Exam pass rate                 | `ExamAttempt`, `Exam.settings`                                                                      | compare `score / max_score` to passing threshold                                                                          | `daily_assessment_metrics`                            | add explicit `passing_score` to settings schema; fallback 60 for legacy exams |
| Code challenge success rate    | `CodeSubmission`                                                                                    | count distinct learners with successful completed submissions                                                             | `daily_assessment_metrics`                            | reuse current code challenge analytics logic                                  |
| Code challenge common failures | `CodeSubmission.test_results`                                                                       | aggregate failed test ids from completed submissions                                                                      | `daily_assessment_metrics`                            | existing router already computes this                                         |
| Certificates issued            | `CertificateUser`, `Certifications`                                                                 | count certificates per course and period                                                                                  | `daily_course_metrics`, `daily_teacher_metrics`       | use `created_at`                                                              |
| Content freshness              | `Course.update_date`, `Activity.update_date`, `CourseUpdate.creation_date`                          | last content edit timestamp and days since update                                                                         | `daily_course_metrics`                                | use latest of course, activity, or course update timestamps                   |
| Courses with no recent updates | same as content freshness                                                                           | thresholded stale-content alert                                                                                           | `daily_course_metrics`                                | default threshold 21 days                                                     |
| Courses updated but no lift    | `CourseUpdate`, engagement rollups                                                                  | compare engagement delta after update event                                                                               | `daily_course_metrics`                                | requires rollups and update timestamp joins                                   |

## Source-Level Query Notes

### Active learner union

Use a normalized union subquery for learner activity rather than maintaining separate logic per
endpoint.

```sql
SELECT user_id, course_id, activity_ts FROM (
 SELECT ts.user_id, ts.course_id, CAST(ts.update_date AS timestamptz) AS activity_ts
 FROM trailstep ts
 WHERE ts.complete = true

 UNION ALL

 SELECT qa.user_id, a.course_id, qa.end_ts AS activity_ts
 FROM quiz_attempt qa
 JOIN activity a ON a.id = qa.activity_id
 WHERE qa.end_ts IS NOT NULL

 UNION ALL

 SELECT ea.user_id, e.course_id, CAST(ea.submitted_at AS timestamptz) AS activity_ts
 FROM exam_attempt ea
 JOIN exam e ON e.id = ea.exam_id
 WHERE ea.is_preview = false AND ea.submitted_at IS NOT NULL

 UNION ALL

 SELECT aus.user_id, a.course_id, CAST(aus.update_date AS timestamptz) AS activity_ts
 FROM assignmentusersubmission aus
 JOIN assignment a ON a.id = aus.assignment_id

 UNION ALL

 SELECT cs.user_id, a.course_id, cs.created_at AS activity_ts
 FROM code_submission cs
 JOIN activity a ON a.id = cs.activity_id
 WHERE cs.status = 'COMPLETED'
) activity_union
WHERE activity_ts >= :window_start
```

Implementation note:

- Put this in a shared analytics query helper rather than duplicating it in overview and course
  detail services.

### Course progress

```sql
SELECT
 tr.course_id,
 tr.user_id,
 COUNT(DISTINCT CASE WHEN ts.complete THEN ts.activity_id END) AS completed_steps,
 total_steps.total_steps,
 ROUND(
  100.0 * COUNT(DISTINCT CASE WHEN ts.complete THEN ts.activity_id END)
  / NULLIF(total_steps.total_steps, 0),
  1
 ) AS progress_pct
FROM trailrun tr
LEFT JOIN trailstep ts
 ON ts.trailrun_id = tr.id AND ts.user_id = tr.user_id
JOIN (
 SELECT course_id, COUNT(*) AS total_steps
 FROM chapteractivity
 GROUP BY course_id
) total_steps ON total_steps.course_id = tr.course_id
WHERE tr.course_id = :course_id
GROUP BY tr.course_id, tr.user_id, total_steps.total_steps
```

### Chapter and activity drop-off

Algorithm for v1:

1. Build the ordered step list from `CourseChapter.order` and `ChapterActivity.order`.
2. For each step, count distinct learners with a completed `TrailStep`.
3. Drop-off at step `n` = `(completions at n-1 - completions at n) / completions at n-1`.

This avoids inferring sequence from timestamps alone.

### Assignment grading backlog and latency

Backlog count can ship in v1 using current schema:

```python
select(AssignmentUserSubmission).where(
  AssignmentUserSubmission.assignment_id.in_(teacher_assignment_ids),
  AssignmentUserSubmission.submission_status.in_(
    [AssignmentUserSubmissionStatus.SUBMITTED, AssignmentUserSubmissionStatus.LATE]
  ),
)
```

Precise latency cannot be trusted until new timestamps exist.

Required schema change for reliable latency:

- add `submitted_at` to `AssignmentUserSubmission`
- add `graded_at` to `AssignmentUserSubmission`

## Rollup Table Definitions

Use ordinary tables refreshed by scheduled jobs, not materialized views, to stay aligned with the
existing SQLModel and alembic workflow.

### 1. `analytics_event`

Purpose:

- capture durable facts where current transactional tables do not preserve enough history

Columns:

```sql
id bigserial primary key,
event_type varchar(100) not null,
org_id bigint not null,
course_id bigint null,
chapter_id bigint null,
activity_id bigint null,
assessment_type varchar(32) null,
assessment_id bigint null,
user_id bigint null,
teacher_user_id bigint null,
cohort_id bigint null,
event_ts timestamptz not null,
event_date date not null,
payload jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now()
```

Indexes:

- `(org_id, event_date)`
- `(course_id, event_date)`
- `(user_id, event_date)`
- `(event_type, event_date)`

### 2. `daily_teacher_metrics`

Grain:

- one row per `(metric_date, org_id, teacher_user_id)`

Columns:

```sql
metric_date date not null,
org_id bigint not null,
teacher_user_id bigint not null,
managed_course_count integer not null default 0,
active_learners_7d integer not null default 0,
active_learners_28d integer not null default 0,
returning_learners_28d integer not null default 0,
completion_rate numeric(5,2) null,
avg_progress_pct numeric(5,2) null,
at_risk_learners integer not null default 0,
ungraded_submissions integer not null default 0,
courses_with_negative_engagement integer not null default 0,
certificates_issued_28d integer not null default 0,
generated_at timestamptz not null default now(),
primary key (metric_date, org_id, teacher_user_id)
```

### 3. `daily_course_metrics`

Grain:

- one row per `(metric_date, org_id, course_id)`

Columns:

```sql
metric_date date not null,
org_id bigint not null,
course_id bigint not null,
teacher_user_id bigint null,
enrolled_learners integer not null default 0,
active_learners_7d integer not null default 0,
active_learners_28d integer not null default 0,
completion_rate numeric(5,2) null,
avg_progress_pct numeric(5,2) null,
at_risk_learners integer not null default 0,
ungraded_submissions integer not null default 0,
certificates_issued integer not null default 0,
content_health_score numeric(5,2) null,
engagement_delta_pct numeric(6,2) null,
last_content_update_at timestamptz null,
generated_at timestamptz not null default now(),
primary key (metric_date, org_id, course_id)
```

### 4. `daily_course_engagement`

Grain:

- one row per `(metric_date, course_id, chapter_id, activity_id)`

Columns:

```sql
metric_date date not null,
org_id bigint not null,
course_id bigint not null,
chapter_id bigint null,
activity_id bigint null,
step_order integer null,
started_learners integer not null default 0,
completed_learners integer not null default 0,
dropoff_from_previous_pct numeric(6,2) null,
generated_at timestamptz not null default now(),
primary key (metric_date, course_id, chapter_id, activity_id)
```

### 5. `daily_assessment_metrics`

Grain:

- one row per `(metric_date, assessment_type, assessment_id)`

Columns:

```sql
metric_date date not null,
org_id bigint not null,
course_id bigint not null,
activity_id bigint null,
assessment_type varchar(32) not null,
assessment_id bigint not null,
eligible_learners integer not null default 0,
submitted_learners integer not null default 0,
submission_rate numeric(5,2) null,
completion_rate numeric(5,2) null,
pass_rate numeric(5,2) null,
median_score numeric(6,2) null,
avg_score numeric(6,2) null,
avg_attempts numeric(6,2) null,
grading_latency_hours_p50 numeric(8,2) null,
grading_latency_hours_p90 numeric(8,2) null,
difficulty_score numeric(6,2) null,
generated_at timestamptz not null default now(),
primary key (metric_date, assessment_type, assessment_id)
```

### 6. `daily_user_course_progress`

Grain:

- one row per `(metric_date, user_id, course_id)`

Columns:

```sql
metric_date date not null,
org_id bigint not null,
course_id bigint not null,
user_id bigint not null,
trailrun_id bigint null,
progress_pct numeric(5,2) not null default 0,
completed_steps integer not null default 0,
total_steps integer not null default 0,
last_activity_at timestamptz null,
is_completed boolean not null default false,
has_certificate boolean not null default false,
generated_at timestamptz not null default now(),
primary key (metric_date, user_id, course_id)
```

### 7. `learner_risk_snapshot`

Grain:

- one row per `(snapshot_date, user_id, course_id)`

Columns:

```sql
snapshot_date date not null,
org_id bigint not null,
course_id bigint not null,
teacher_user_id bigint null,
user_id bigint not null,
progress_pct numeric(5,2) not null default 0,
days_since_last_activity integer null,
failed_assessments integer not null default 0,
missing_required_assessments integer not null default 0,
open_grading_blocks integer not null default 0,
risk_score numeric(6,2) not null,
risk_level varchar(16) not null,
reason_codes jsonb not null default '[]'::jsonb,
recommended_action varchar(255) null,
generated_at timestamptz not null default now(),
primary key (snapshot_date, user_id, course_id)
```

## Refresh Strategy

### V1 refresh schedule

- nightly full refresh for all daily rollups
- lightweight intra-day refresh every 30 minutes for:
  - `learner_risk_snapshot`
  - `daily_teacher_metrics`
  - grading backlog portions of `daily_assessment_metrics`

### Implementation approach

- add analytics refresh service under `apps/api/src/services/analytics/rollups.py`
- expose an internal CLI entry or scheduled task hook from `apps/api/cli.py`
- store `generated_at` on every rollup table and return freshness to frontend widgets

## Required Schema and Model Changes

### Permissions

Add the following permission strings through the existing RBAC model:

- `analytics:read:assigned`
- `analytics:export:assigned`

Role updates:

- `RoleSlug.INSTRUCTOR`: add both of the above
- `RoleSlug.MAINTAINER`: add `analytics:read:org` if maintainers should supervise teaching across
  the org

Remove `analytics:read:own`; Write alembic migrations.

### Assignment timestamps

Add to `AssignmentUserSubmission`:

- `submitted_at: datetime | None`
- `graded_at: datetime | None`

Reason:

- backlog count works without them
- grading latency does not

### Exam pass threshold

Add `passing_score` to the validated exam settings schema in `apps/api/src/db/courses/exams.py`.

Reason:

- pass-rate analytics needs a defined threshold
- current model has time and anti-cheat settings but no passing mark

This can remain in JSON settings and does not require a standalone relational table.

## Backend File-by-File Change Plan

### New files

- `apps/api/src/routers/analytics.py`
  - teacher analytics endpoints
- `apps/api/src/services/analytics/__init__.py`
- `apps/api/src/services/analytics/schemas.py`
  - Pydantic response models for all analytics endpoints
- `apps/api/src/services/analytics/filters.py`
  - shared parsing and filter normalization
- `apps/api/src/services/analytics/scope.py`
  - teacher course-scope resolution
- `apps/api/src/services/analytics/overview.py`
- `apps/api/src/services/analytics/courses.py`
- `apps/api/src/services/analytics/assessments.py`
- `apps/api/src/services/analytics/risk.py`
- `apps/api/src/services/analytics/exports.py`
- `apps/api/src/services/analytics/rollups.py`
- `apps/api/src/db/analytics.py`
  - SQLModel definitions for analytics rollup tables and optional event table
- `apps/api/src/tests/analytics/test_teacher_overview.py`
- `apps/api/src/tests/analytics/test_teacher_courses.py`
- `apps/api/src/tests/analytics/test_teacher_assessments.py`
- `apps/api/src/tests/analytics/test_teacher_exports.py`

### Existing files to update

- `apps/api/src/router.py`
  - include analytics router under `/api/v1/analytics`
- `apps/api/src/db/permission_enums.py`
  - add permission strings to built-in roles
- `apps/api/src/db/courses/assignments.py`
  - add `submitted_at` and `graded_at` to `AssignmentUserSubmission`
- `apps/api/src/db/courses/exams.py`
  - extend `ExamSettingsBase` with `passing_score`
- `apps/api/cli.py`
  - add analytics rollup refresh command
- `apps/api/src/services/courses/activities/assignments.py`
  - populate assignment timestamps when submissions are created or graded
- `apps/api/src/services/courses/activities/exams.py`
  - ensure exam completion analytics can read a stable pass threshold
- `apps/api/src/services/courses/certifications.py`
  - optionally emit analytics event or rollup signal on certificate issuance
- `apps/api/src/services/trail/trail.py`
  - optionally emit analytics event on activity completion and course participation changes

### New migration files

- `apps/api/migrations/versions/<revision>_add_teacher_analytics_rollups.py`
  - create analytics rollup tables and indexes
- `apps/api/migrations/versions/<revision>_add_assignment_submission_timestamps.py`
  - add `submitted_at` and `graded_at`
- `apps/api/migrations/versions/<revision>_resync_teacher_analytics_permissions.py`
  - upsert new permission rows and resync built-in role mappings

## Frontend Route and Component Backlog

### Route entries

Add these route files under the existing dashboard shell:

- `apps/web/app/orgs/[orgslug]/dash/analytics/page.tsx`
  - teacher overview
- `apps/web/app/orgs/[orgslug]/dash/analytics/courses/page.tsx`
  - ranked course list
- `apps/web/app/orgs/[orgslug]/dash/analytics/courses/[courseuuid]/page.tsx`
  - course detail
- `apps/web/app/orgs/[orgslug]/dash/analytics/assessments/page.tsx`
  - assessment outlier list
- `apps/web/app/orgs/[orgslug]/dash/analytics/assessments/[assessmentType]/[assessmentId]/page.tsx`
  - assessment detail
- `apps/web/app/orgs/[orgslug]/dash/analytics/learners/at-risk/page.tsx`
  - full risk table

### New component files

- `apps/web/components/Dashboard/Analytics/TeacherOverview.tsx`
- `apps/web/components/Dashboard/Analytics/TeacherFilterBar.tsx`
- `apps/web/components/Dashboard/Analytics/TeacherKpiCards.tsx`
- `apps/web/components/Dashboard/Analytics/AtRiskLearnersTable.tsx`
- `apps/web/components/Dashboard/Analytics/EngagementAreaChart.tsx`
- `apps/web/components/Dashboard/Analytics/CompletionFunnelChart.tsx`
- `apps/web/components/Dashboard/Analytics/CourseHealthTable.tsx`
- `apps/web/components/Dashboard/Analytics/AssessmentOutliersTable.tsx`
- `apps/web/components/Dashboard/Analytics/ScoreDistributionChart.tsx`
- `apps/web/components/Dashboard/Analytics/QuestionDifficultyRadar.tsx`
- `apps/web/components/Dashboard/Analytics/GradingBacklogPanel.tsx`
- `apps/web/components/Dashboard/Analytics/AnalyticsExportButton.tsx`
- `apps/web/components/Dashboard/Analytics/AnalyticsEmptyState.tsx`

### New service and type files

- `apps/web/services/analytics/teacher.ts`
  - fetchers for overview, course detail, assessments, and exports
- `apps/web/types/analytics.ts`
  - shared response types matching backend contracts

### Existing frontend files to update

- `apps/web/lib/rbac/navigation-policy.ts`
  - add `canSeeAnalytics(can)` using `Resources.ANALYTICS`
- `apps/web/hooks/useNavigationPermissions.ts`
  - surface `canSeeAnalytics`
- `apps/web/components/Dashboard/Menus/DashSidebar.tsx`
  - show analytics nav item when permitted
- `apps/web/components/Dashboard/Menus/DashMobileMenu.tsx`
  - same analytics entry for mobile
- `apps/web/types/permissions.ts`
  - update generated frontend permission artifact for new scope combinations

### Chart guidance

Use the existing chart utilities in `apps/web/components/ui/chart.tsx`.

Recommended chart mapping:

- area chart: active learners and completion trend
- bar chart: activity drop-off, grading backlog buckets
- pie chart: assessment type mix where useful
- radar chart: question or skill difficulty breakdown
- radial chart: content health and assessment health composite scores
- tooltip and legend components from the shared chart wrapper for all dashboard charts

## Permission and Navigation Changes by File

### Backend

- `apps/api/src/db/permission_enums.py`
  - add analytics assigned/export permissions to built-in roles
- `apps/api/migrations/versions/<revision>_resync_teacher_analytics_permissions.py`
  - insert new permission rows into `permissions`
  - update `role_permissions` for system roles

### Frontend

- `apps/web/types/permissions.ts`
  - expose `assigned` analytics permissions to the exact-match permission set used by the UI
- `apps/web/lib/rbac/navigation-policy.ts`
  - define analytics visibility helper
- `apps/web/hooks/useNavigationPermissions.ts`
  - provide analytics visibility state to menus and pages

## Service-Level Authorization Pattern

Analytics router handlers should not trust query params alone. Every endpoint should:

1. require `analytics:read` or `analytics:export`
2. resolve teacher course scope from user, org, and optional filter set
3. reject any requested course or assessment outside the resolved scope

Recommended backend pattern:

```python
checker.require(current_user.id, "analytics:read", org_id, is_assigned=True)
course_scope = await resolve_teacher_course_scope(...)
requested_course_ids = validate_requested_courses(filter_params, course_scope)
```

If the user has org-wide analytics scope, pass through all org courses. Otherwise set
`is_assigned=True` only after the service resolves that the course belongs to the teacher's active
scope.

## Data Freshness and Quality Rules

- Every response includes `generated_at` and widget-level `freshness_seconds`.
- All trend queries must normalize to a canonical timezone before bucketing.
- All teacher metrics must exclude:
  - exam preview attempts
  - teacher-created sandbox activity where identifiable
  - deleted or orphaned content rows
- Completion rollups should reconcile `TrailStep` completion with `CertificateUser` issuance and log
  anomalies.

## Delivery

### One-shot

- add permissions
- add assignment timestamp schema changes
- add analytics rollup tables
- add analytics router skeleton and shared schemas

- teacher overview endpoint
- at-risk learner endpoint
- grading backlog export
- overview page and analytics nav entry

- course list and course detail endpoints
- engagement funnel and content health views
- stale-content and engagement-drop alerts

- assessment list and detail endpoints
- quiz, exam, and code challenge distributions
- assignment latency percentiles once timestamps are live

## Open Risks and Decisions

- `TrailRun` is a participation proxy, not a true enrollment table.
- assignment grading latency is not defensible until timestamps are added.
- exam pass-rate semantics are weak until `passing_score` is formalized.
- some learner activity is currently inferred from update timestamps rather than append-only events.
- if teacher/course scope resolution is inconsistent across endpoints, analytics trust will collapse
  quickly.

## Recommended Acceptance Criteria

Backend is ready when:

- overview, course, assessment, and risk endpoints return stable typed responses
- teacher-scoped queries are permission-safe
- rollups refresh successfully and expose freshness timestamps
- exports are available for risk, backlog, progress, and outcomes

Frontend is ready when:

- analytics nav is gated by both permission
- overview page shows actionable cards, alerts, risk table, and trends
- course and assessment drill-down pages load from stable API contracts
- charts use the shared shadcn chart primitives already present in the repo
