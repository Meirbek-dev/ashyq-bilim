import type {
  AnalyticsQuery,
  AssessmentType,
  AtRiskLearnersResponse,
  TeacherAssessmentDetailResponse,
  TeacherAssessmentListResponse,
  TeacherCourseDetailResponse,
  TeacherCourseListResponse,
  TeacherOverviewResponse,
} from '@/types/analytics';
import { getAPIUrl } from '@services/config/config';

const buildQueryString = (query: AnalyticsQuery = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

async function analyticsRequest<T>(path: string, accessToken: string, query?: AnalyticsQuery): Promise<T> {
  const response = await fetch(`${getAPIUrl()}analytics/${path}${buildQueryString(query)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail?.message || payload?.detail || `Analytics request failed (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

export function normalizeAnalyticsQuery(searchParams: Record<string, string | string[] | undefined>): AnalyticsQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const teacherUserId = first(searchParams.teacher_user_id);
  const page = first(searchParams.page);
  const pageSize = first(searchParams.page_size);
  return {
    window: (first(searchParams.window) as AnalyticsQuery['window']) || '28d',
    compare: (first(searchParams.compare) as AnalyticsQuery['compare']) || 'previous_period',
    bucket: (first(searchParams.bucket) as AnalyticsQuery['bucket']) || 'day',
    course_ids: first(searchParams.course_ids),
    cohort_ids: first(searchParams.cohort_ids),
    teacher_user_id: teacherUserId ? Number(teacherUserId) : undefined,
    timezone: first(searchParams.timezone) || 'UTC',
    page: page ? Number(page) : 1,
    page_size: pageSize ? Number(pageSize) : 25,
    sort_by: first(searchParams.sort_by),
    sort_order: (first(searchParams.sort_order) as AnalyticsQuery['sort_order']) || 'desc',
    bucket_start: first(searchParams.bucket_start),
  };
}

export function getTeacherOverview(accessToken: string, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherOverviewResponse>('teacher/overview', accessToken, query);
}

export function getTeacherCourseList(accessToken: string, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherCourseListResponse>('teacher/courses', accessToken, query);
}

export function getTeacherCourseDetailByUuid(courseUuid: string, accessToken: string, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherCourseDetailResponse>(`teacher/courses/by-uuid/${courseUuid}`, accessToken, query);
}

export function getTeacherCourseDetail(courseId: number, accessToken: string, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherCourseDetailResponse>(`teacher/courses/${courseId}`, accessToken, query);
}

export function getTeacherAssessmentList(accessToken: string, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherAssessmentListResponse>('teacher/assessments', accessToken, query);
}

export function getTeacherAssessmentDetail(
  assessmentType: AssessmentType,
  assessmentId: number,
  accessToken: string,
  query?: AnalyticsQuery,
) {
  return analyticsRequest<TeacherAssessmentDetailResponse>(
    `teacher/assessments/${assessmentType}/${assessmentId}`,
    accessToken,
    query,
  );
}

export function getAtRiskLearners(accessToken: string, query?: AnalyticsQuery) {
  return analyticsRequest<AtRiskLearnersResponse>('teacher/learners/at-risk', accessToken, query);
}

export function getAnalyticsExportUrl(
  exportName: 'at-risk' | 'grading-backlog' | 'course-progress' | 'assessment-outcomes',
  query?: AnalyticsQuery,
) {
  return `${getAPIUrl()}analytics/teacher/exports/${exportName}.csv${buildQueryString(query)}`;
}
