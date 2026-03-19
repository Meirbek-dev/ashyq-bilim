'use server';

import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

/*
 This file includes only POST, PUT, DELETE requests
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export async function updateProfile(data: any, user_id: number, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}users/${user_id}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate users cache after updating profile
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}
