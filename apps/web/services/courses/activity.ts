'use server';

import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

/*
 This file includes only POST, PUT, DELETE requests
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export async function startCourse(course_uuid: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}trail/add_course/${course_uuid}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate courses cache to update trail data
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data_result;
}

export async function removeCourse(course_uuid: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}trail/remove_course/${course_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate courses cache to update trail data
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data_result;
}

export async function markActivityAsComplete(activity_uuid: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}trail/add_activity/${activity_uuid}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate courses cache to update completion status
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data_result;
}

export async function unmarkActivityAsComplete(activity_uuid: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}trail/remove_activity/${activity_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate courses cache to update completion status
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data_result;
}
