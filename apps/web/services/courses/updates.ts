'use server';

import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

export async function createCourseUpdate(body: any, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${body.course_uuid}/updates`,
    RequestBodyWithAuthHeader('POST', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after creating update
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function deleteCourseUpdate(course_uuid: string, update_uuid: number, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/update/${update_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after deleting update
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}
