import { getAPIUrl } from '@services/config/config';

/**
 * SWR key builder for getting course discussions
 * Usage: useSWR(getDiscussionsSwrKey(course_uuid, true, 50, 0), swrFetcher)
 */
export function getDiscussionsSwrKey(course_uuid: string, include_replies = false, limit = 50, offset = 0) {
  const params = new URLSearchParams({
    include_replies: include_replies.toString(),
    limit: limit.toString(),
    offset: offset.toString(),
  });
  return `${getAPIUrl()}courses/${course_uuid}/discussions?${params.toString()}`;
}

/**
 * SWR key builder for getting discussion replies
 * Usage: useSWR(getDiscussionRepliesSwrKey(course_uuid, discussion_uuid, 50, 0), swrFetcher)
 */
export function getDiscussionRepliesSwrKey(course_uuid: string, discussion_uuid: string, limit = 50, offset = 0) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  return `${getAPIUrl()}courses/${course_uuid}/discussions/${discussion_uuid}/replies?${params.toString()}`;
}
