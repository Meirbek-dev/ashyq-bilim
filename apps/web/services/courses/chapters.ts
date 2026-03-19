'use server';

import type { OrderPayload } from '@components/Dashboard/Pages/Course/EditCourseStructure/EditCourseStructure';
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { courseTag, tags } from '@/lib/cacheTags';

/*
 This file includes only POST, PUT, DELETE requests
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export async function updateChaptersMetadata(course_uuid: string, data: any, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}chapters/course/course_${course_uuid}/order`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate course cache after updating chapter order
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data_result;
}

interface ChapterInvalidationOptions {
  courseUuid?: string;
  lastKnownUpdateDate?: string | null;
}

async function revalidateChapterTags(options?: ChapterInvalidationOptions) {
  const { revalidateTag } = await import('next/cache');
  revalidateTag(options?.courseUuid ? courseTag.detail(options.courseUuid) : tags.courses, 'max');
}

export async function updateChapter(
  coursechapter_id: number,
  data: any,
  access_token: string,
  options?: ChapterInvalidationOptions,
) {
  const result: any = await fetch(
    `${getAPIUrl()}chapters/${coursechapter_id}`,
    RequestBodyWithAuthHeader(
      'PUT',
      {
        ...data,
        last_known_update_date: options?.lastKnownUpdateDate ?? data.last_known_update_date ?? undefined,
      },
      null,
      access_token,
    ),
  );
  const data_result = await errorHandling(result);

  // Revalidate course cache after chapter update
  if (result.ok) {
    await revalidateChapterTags(options);
  }

  return data_result;
}

export async function updateCourseOrderStructure(
  course_uuid: string,
  data: OrderPayload,
  access_token: string,
  options?: ChapterInvalidationOptions,
) {
  const result: any = await fetch(
    `${getAPIUrl()}chapters/course/${course_uuid}/order`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate course cache after reordering
  if (result.ok) {
    await revalidateChapterTags({ courseUuid: options?.courseUuid ?? course_uuid });
  }

  return data_result;
}

export async function createChapter(data: any, access_token: string, options?: ChapterInvalidationOptions) {
  const result: any = await fetch(
    `${getAPIUrl()}chapters/`,
    RequestBodyWithAuthHeader(
      'POST',
      {
        ...data,
        last_known_update_date: options?.lastKnownUpdateDate ?? data.last_known_update_date ?? undefined,
      },
      null,
      access_token,
    ),
  );
  const data_result = await errorHandling(result);

  // Revalidate course cache after creating chapter
  if (result.ok) {
    await revalidateChapterTags(options);
  }

  return data_result;
}

export async function deleteChapter(
  coursechapter_id: number,
  access_token: string,
  options?: ChapterInvalidationOptions,
) {
  const query = new URLSearchParams();
  if (options?.lastKnownUpdateDate) {
    query.set('last_known_update_date', options.lastKnownUpdateDate);
  }

  const result: any = await fetch(
    `${getAPIUrl()}chapters/${coursechapter_id}${query.size > 0 ? `?${query.toString()}` : ''}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate course cache after deleting chapter
  if (result.ok) {
    await revalidateChapterTags(options);
  }

  return data_result;
}
