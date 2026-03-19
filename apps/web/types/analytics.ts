export type WindowPreset = '7d' | '28d' | '90d';
export type ComparePreset = 'previous_period' | 'none';
export type Bucket = 'day' | 'week';
export type AssessmentType = 'assignment' | 'quiz' | 'exam' | 'code_challenge';
export type SortOrder = 'asc' | 'desc';

export interface AnalyticsQuery {
  window?: WindowPreset;
  compare?: ComparePreset;
  bucket?: Bucket;
  bucket_start?: string;
  course_ids?: string;
  cohort_ids?: string;
  teacher_user_id?: number;
  timezone?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: SortOrder;
}

export interface AnalyticsFilterOption {
  label: string;
  value: string;
}

export interface MetricCard {
  value: number;
  delta_value: number | null;
  delta_pct: number | null;
  direction: 'up' | 'down' | 'flat';
  label: string;
  unit: string | null;
  is_higher_better: boolean;
  benchmark: number | null;
  benchmark_label: string | null;
}

export interface TimeSeriesPoint {
  bucket_start: string;
  value: number;
}

export interface RiskDistributionCounts {
  high: number;
  medium: number;
  low: number;
}

export interface AlertItem {
  id: string;
  type: 'risk_spike' | 'engagement_drop' | 'grading_backlog' | 'assessment_outlier' | 'content_stale';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  course_id?: number;
  activity_id?: number;
  assessment_id?: number;
  learner_count?: number;
}

export interface AtRiskLearnerRow {
  user_id: number;
  course_id: number;
  course_uuid: string | null;
  course_name: string;
  user_display_name: string;
  cohort_name: string | null;
  progress_pct: number;
  days_since_last_activity: number | null;
  open_grading_blocks: number;
  failed_assessments: number;
  missing_required_assessments: number;
  risk_components: Record<string, number>;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  reason_codes: string[];
  recommended_action: string;
}

export interface TeacherOverviewResponse {
  generated_at: string;
  freshness_seconds: number;
  window: WindowPreset;
  compare: ComparePreset;
  scope: {
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
  risk_distribution: RiskDistributionCounts;
  at_risk_preview: AtRiskLearnerRow[];
  course_preview: TeacherCourseRow[];
  assessment_preview: AssessmentOutlierRow[];
  course_total: number;
  assessment_total: number;
  at_risk_total: number;
  course_options: AnalyticsFilterOption[];
  cohort_options: AnalyticsFilterOption[];
}

export interface TeacherCourseRow {
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

export interface TeacherCourseListResponse {
  generated_at: string;
  total: number;
  page: number;
  page_size: number;
  items: TeacherCourseRow[];
  course_options: AnalyticsFilterOption[];
  cohort_options: AnalyticsFilterOption[];
}

export interface FunnelStep {
  label: string;
  count: number;
  pct_of_previous: number | null;
}

export interface ActivityDropoffRow {
  chapter_id: number;
  activity_id: number;
  activity_name: string;
  activity_type: string;
  previous_step_completions: number;
  current_step_completions: number;
  dropoff_pct: number;
}

export interface ContentHealthRow {
  course_id: number;
  signal: string;
  severity: 'info' | 'warning' | 'critical';
  value: number | null;
  note: string;
}

export interface AssessmentOutlierRow {
  assessment_type: AssessmentType;
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

export interface TeacherCourseDetailResponse {
  generated_at: string;
  course: {
    id: number;
    course_uuid: string;
    name: string;
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

export interface TeacherAssessmentListResponse {
  generated_at: string;
  total: number;
  page: number;
  page_size: number;
  items: AssessmentOutlierRow[];
  course_options: AnalyticsFilterOption[];
  cohort_options: AnalyticsFilterOption[];
}

export interface HistogramBucket {
  label: string;
  count: number;
}

export interface QuestionDifficultyRow {
  question_id: string;
  question_label: string;
  accuracy_pct: number | null;
  avg_time_seconds: number | null;
}

export interface CommonFailureRow {
  key: string;
  label: string;
  count: number;
}

export interface AssessmentLearnerRow {
  user_id: number;
  user_display_name: string;
  attempts: number;
  best_score: number | null;
  last_score: number | null;
  submitted_at: string | null;
  graded_at: string | null;
  status: string | null;
}

export interface TeacherAssessmentDetailResponse {
  generated_at: string;
  assessment_type: AssessmentType;
  assessment_id: number;
  course_id: number;
  title: string;
  pass_threshold: number | null;
  pass_threshold_bucket_label: string | null;
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
  question_breakdown?: QuestionDifficultyRow[] | null;
  common_failures: CommonFailureRow[];
  learner_rows: AssessmentLearnerRow[];
}

export interface AtRiskLearnersResponse {
  generated_at: string;
  total: number;
  page: number;
  page_size: number;
  items: AtRiskLearnerRow[];
  course_options: AnalyticsFilterOption[];
  cohort_options: AnalyticsFilterOption[];
}
