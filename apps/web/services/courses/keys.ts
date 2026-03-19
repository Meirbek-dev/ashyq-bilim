import { getAPIUrl } from '@services/config/config';

/**
 * SWR key builders for course-related resources
 */
export function getTrailSwrKey() {
  return `${getAPIUrl()}trail`;
}

export function getCoursesSwrKey(page = 1, limit = 20) {
  return `${getAPIUrl()}courses/page/${page}/limit/${limit}`;
}

export function getCourseUpdatesSwrKey(course_uuid: string | null | undefined) {
  if (!course_uuid) return '';
  return `${getAPIUrl()}courses/${course_uuid}/updates`;
}

export function getCourseMetadataSwrKey(course_uuid: string | null | undefined) {
  if (!course_uuid) return '';
  return `${getAPIUrl()}courses/${course_uuid}`;
}
