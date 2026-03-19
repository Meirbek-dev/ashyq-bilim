'use server';

import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

/*
 This file includes POST, PUT, DELETE requests for course discussions
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export interface DiscussionCreate {
  content: string;
  type?: 'post' | 'reply';
  parent_discussion_id?: number;
}

export interface DiscussionUpdate {
  content?: string;
  status?: 'active' | 'hidden' | 'deleted';
}

export interface Discussion {
  id: number;
  discussion_uuid: string;
  content: string;
  type: 'post' | 'reply';
  status: 'active' | 'hidden' | 'deleted';
  course_id: number;
  user_id: number;
  parent_discussion_id?: number;
  likes_count: number;
  dislikes_count: number;
  replies_count: number;
  creation_date: string;
  update_date: string;
  user?: {
    id: number;
    user_uuid: string;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_image?: string;
    bio?: string;
    details?: any;
    profile?: any;
  };
  replies?: Discussion[];
  is_liked: boolean;
  is_disliked: boolean;
}

/**
 * Create a new discussion post or reply
 */
export async function createDiscussion(
  course_uuid: string,
  discussion: DiscussionCreate,
  access_token: string,
): Promise<Discussion> {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/discussions`,
    RequestBodyWithAuthHeader('POST', discussion, null, access_token),
  );
  const data = await errorHandling(result);

  // Revalidate courses cache after creating discussion
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

/**
 * Update a discussion
 */
export async function updateDiscussion(
  course_uuid: string,
  discussion_uuid: string,
  discussion: DiscussionUpdate,
  access_token: string,
): Promise<Discussion> {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/discussions/${discussion_uuid}`,
    RequestBodyWithAuthHeader('PUT', discussion, null, access_token),
  );
  const data = await errorHandling(result);

  // Revalidate courses cache after updating discussion
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

/**
 * Delete a discussion
 */
export async function deleteDiscussion(
  course_uuid: string,
  discussion_uuid: string,
  access_token: string,
): Promise<{ message: string }> {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/discussions/${discussion_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data = await errorHandling(result);

  // Revalidate courses cache after deleting discussion
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

/**
 * Like a discussion
 */
export async function likeDiscussion(course_uuid: string, discussion_uuid: string, access_token: string): Promise<any> {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/discussions/${discussion_uuid}/like`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const data = await errorHandling(result);

  // Revalidate courses cache after liking discussion
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

/**
 * Toggle like status for a discussion (like if not liked, unlike if liked)
 */
export async function toggleDiscussionLike(
  course_uuid: string,
  discussion_uuid: string,
  access_token: string,
): Promise<{ message: string; is_liked: boolean; is_disliked: boolean; likes_count: number; dislikes_count: number }> {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/discussions/${discussion_uuid}/like`,
    RequestBodyWithAuthHeader('PUT', null, null, access_token),
  );
  const data = await errorHandling(result);

  // Revalidate courses cache after toggling like
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

/**
 * Toggle dislike status for a discussion (dislike if not disliked, undislike if disliked)
 */
export async function toggleDiscussionDislike(
  course_uuid: string,
  discussion_uuid: string,
  access_token: string,
): Promise<{ message: string; is_liked: boolean; is_disliked: boolean; likes_count: number; dislikes_count: number }> {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/discussions/${discussion_uuid}/dislike`,
    RequestBodyWithAuthHeader('PUT', null, null, access_token),
  );
  const data = await errorHandling(result);

  // Revalidate courses cache after toggling dislike
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}
