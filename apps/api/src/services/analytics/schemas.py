from __future__ import annotations

from typing import Literal

from src.db.strict_base_model import PydanticStrictBaseModel


class MetricCard(PydanticStrictBaseModel):
    value: float
    delta_value: float | None
    delta_pct: float | None
    direction: Literal["up", "down", "flat"]
    label: str
    unit: str | None = None
    is_higher_better: bool = True
    # Optional comparative baseline shown alongside the current value.
    benchmark: float | None = None
    benchmark_label: str | None = None


class TimeSeriesPoint(PydanticStrictBaseModel):
    bucket_start: str
    value: float


class AlertItem(PydanticStrictBaseModel):
    id: str
    type: Literal[
        "risk_spike",
        "engagement_drop",
        "grading_backlog",
        "assessment_outlier",
        "content_stale",
    ]
    severity: Literal["info", "warning", "critical"]
    title: str
    body: str
    course_id: int | None = None
    activity_id: int | None = None
    assessment_id: int | None = None
    learner_count: int | None = None


class AnalyticsFilterOption(PydanticStrictBaseModel):
    label: str
    value: str


class RiskDistributionCounts(PydanticStrictBaseModel):
    high: int = 0
    medium: int = 0
    low: int = 0


class InterventionSummary(PydanticStrictBaseModel):
    total: int = 0
    open: int = 0
    resolved: int = 0
    recovered_learners: int = 0
    avg_risk_delta_after_intervention: float | None = None


class TeacherInterventionCreate(PydanticStrictBaseModel):
    user_id: int
    course_id: int
    intervention_type: Literal[
        "message_sent",
        "submission_graded",
        "extension_granted",
        "meeting_scheduled",
        "learner_recovered",
    ]
    status: Literal["planned", "completed", "resolved"] = "completed"
    outcome: str | None = None
    notes: str | None = None
    payload: dict[str, object] = {}  # noqa: RUF012


class TeacherInterventionRow(PydanticStrictBaseModel):
    id: int
    teacher_user_id: int
    user_id: int
    course_id: int
    intervention_type: str
    status: str
    outcome: str | None = None
    notes: str | None = None
    risk_score_before: float | None = None
    risk_score_after: float | None = None
    created_at: str
    updated_at: str
    resolved_at: str | None = None


class TeacherInterventionListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    items: list[TeacherInterventionRow]


class AtRiskLearnerRow(PydanticStrictBaseModel):
    user_id: int
    course_id: int
    course_uuid: str | None = None
    course_name: str
    user_display_name: str
    cohort_name: str | None = None
    progress_pct: float
    days_since_last_activity: int | None = None
    open_grading_blocks: int
    failed_assessments: int
    missing_required_assessments: int
    risk_score: float
    risk_level: Literal["low", "medium", "high"]
    risk_components: dict[str, float] = {}  # noqa: RUF012
    reason_codes: list[str]
    risk_trend: Literal["newly_at_risk", "worsening", "improving", "recovered", "stable"] = "stable"
    previous_risk_score: float | None = None
    risk_score_delta: float | None = None
    top_contributing_factor: str | None = None
    confidence_level: Literal["low", "medium", "high"] = "medium"
    why_now: str | None = None
    intervention_count: int = 0
    last_intervention_type: str | None = None
    last_intervention_at: str | None = None
    last_intervention_outcome: str | None = None
    recommended_action: str


class TeacherOverviewScope(PydanticStrictBaseModel):
    teacher_user_id: int
    course_ids: list[int]
    cohort_ids: list[int]


class TeacherOverviewSummary(PydanticStrictBaseModel):
    active_learners: MetricCard
    returning_learners: MetricCard
    completion_rate: MetricCard
    at_risk_learners: MetricCard
    ungraded_submissions: MetricCard
    negative_engagement_courses: MetricCard


class TeacherOverviewTrends(PydanticStrictBaseModel):
    active_learners: list[TimeSeriesPoint]
    completions: list[TimeSeriesPoint]
    submissions: list[TimeSeriesPoint]
    grading_completed: list[TimeSeriesPoint]


class TeacherOverviewResponse(PydanticStrictBaseModel):
    generated_at: str
    freshness_seconds: int
    window: Literal["7d", "28d", "90d"]
    compare: Literal["previous_period", "none"]
    scope: TeacherOverviewScope
    summary: TeacherOverviewSummary
    trends: TeacherOverviewTrends
    alerts: list[AlertItem]
    risk_distribution: RiskDistributionCounts
    intervention_summary: InterventionSummary
    at_risk_preview: list[AtRiskLearnerRow]
    course_preview: list[TeacherCourseRow]
    assessment_preview: list[AssessmentOutlierRow]
    course_total: int = 0
    assessment_total: int = 0
    at_risk_total: int = 0
    course_options: list[AnalyticsFilterOption] = []  # noqa: RUF012
    cohort_options: list[AnalyticsFilterOption] = []  # noqa: RUF012


class TeacherCourseRow(PydanticStrictBaseModel):
    course_id: int
    course_uuid: str
    course_name: str
    active_learners_7d: int
    completion_rate: float
    engagement_delta_pct: float | None = None
    at_risk_learners: int
    ungraded_submissions: int
    content_health_score: float
    assessment_difficulty_score: float | None = None
    teacher_completion_delta_pct: float | None = None
    platform_completion_delta_pct: float | None = None
    historical_completion_delta_pct: float | None = None
    cohort_completion_delta_pct: float | None = None
    last_content_update_at: str | None = None
    top_alert: AlertItem | None = None


class TeacherCourseListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    page: int = 1
    page_size: int = 25
    items: list[TeacherCourseRow]
    course_options: list[AnalyticsFilterOption] = []  # noqa: RUF012
    cohort_options: list[AnalyticsFilterOption] = []  # noqa: RUF012


class FunnelStep(PydanticStrictBaseModel):
    label: str
    count: int
    pct_of_previous: float | None = None


class ActivityDropoffRow(PydanticStrictBaseModel):
    chapter_id: int
    activity_id: int
    activity_name: str
    activity_type: str
    previous_step_completions: int
    current_step_completions: int
    dropoff_pct: float


class ContentHealthRow(PydanticStrictBaseModel):
    course_id: int
    signal: str
    severity: Literal["info", "warning", "critical"]
    value: float | None = None
    note: str


class AssessmentOutlierRow(PydanticStrictBaseModel):
    assessment_type: Literal["assignment", "quiz", "exam", "code_challenge"]
    assessment_id: int
    activity_id: int | None = None
    course_id: int
    course_name: str
    title: str
    submission_rate: float | None = None
    completion_rate: float | None = None
    pass_rate: float | None = None
    median_score: float | None = None
    avg_attempts: float | None = None
    grading_latency_hours_p50: float | None = None
    grading_latency_hours_p90: float | None = None
    difficulty_score: float | None = None
    score_variance: float | None = None
    reliability_score: float | None = None
    discrimination_index: float | None = None
    suspicious_flag: str | None = None
    outlier_reason_codes: list[str]


class TeacherCourseDetailSummary(PydanticStrictBaseModel):
    enrolled_learners: int
    active_learners_7d: int
    completion_rate: float
    avg_progress_pct: float
    at_risk_learners: int
    ungraded_submissions: int
    certificates_issued: int


class TeacherCourseDetailResponse(PydanticStrictBaseModel):
    generated_at: str
    course: dict[str, int | str]
    summary: TeacherCourseDetailSummary
    funnels: dict[str, list[FunnelStep]]
    engagement_trend: list[TimeSeriesPoint]
    activity_dropoff: list[ActivityDropoffRow]
    at_risk_learners: list[AtRiskLearnerRow]
    assessment_outliers: list[AssessmentOutlierRow]
    content_health: list[ContentHealthRow]


class TeacherAssessmentListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    page: int = 1
    page_size: int = 25
    items: list[AssessmentOutlierRow]
    course_options: list[AnalyticsFilterOption] = []  # noqa: RUF012
    cohort_options: list[AnalyticsFilterOption] = []  # noqa: RUF012


class HistogramBucket(PydanticStrictBaseModel):
    label: str
    count: int


class QuestionDifficultyRow(PydanticStrictBaseModel):
    question_id: str
    question_label: str
    accuracy_pct: float | None = None
    avg_time_seconds: float | None = None
    discrimination_index: float | None = None
    strong_miss_pct: float | None = None
    weak_correct_pct: float | None = None
    distractor_issue_count: int = 0


class CommonFailureRow(PydanticStrictBaseModel):
    key: str
    label: str
    count: int


class AssessmentLearnerRow(PydanticStrictBaseModel):
    user_id: int
    user_display_name: str
    attempts: int
    best_score: float | None = None
    last_score: float | None = None
    submitted_at: str | None = None
    graded_at: str | None = None
    status: str | None = None


class TeacherAssessmentDetailSummary(PydanticStrictBaseModel):
    eligible_learners: int
    submitted_learners: int
    submission_rate: float | None = None
    pass_rate: float | None = None
    median_score: float | None = None
    avg_attempts: float | None = None
    grading_latency_hours_p50: float | None = None
    grading_latency_hours_p90: float | None = None


class TeacherAssessmentDetailResponse(PydanticStrictBaseModel):
    generated_at: str
    assessment_type: Literal["assignment", "quiz", "exam", "code_challenge"]
    assessment_id: int
    course_id: int
    title: str
    pass_threshold: float | None = None
    pass_threshold_bucket_label: str | None = None
    summary: TeacherAssessmentDetailSummary
    score_distribution: list[HistogramBucket]
    attempt_distribution: list[HistogramBucket]
    question_breakdown: list[QuestionDifficultyRow] | None = None
    common_failures: list[CommonFailureRow]
    learner_rows: list[AssessmentLearnerRow]


class AtRiskLearnersResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int
    page: int = 1
    page_size: int = 25
    items: list[AtRiskLearnerRow]
    course_options: list[AnalyticsFilterOption] = []  # noqa: RUF012
    cohort_options: list[AnalyticsFilterOption] = []  # noqa: RUF012
