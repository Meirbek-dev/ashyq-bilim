'use server';

import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests';
import { CacheProfiles, cacheLife, cacheTag } from '@/lib/cache';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
 Client-side GET requests are called from the frontend using SWR
*/

async function fetchPlatformOrganization(access_token?: string) {
  'use cache';
  cacheTag(tags.organizations);
  cacheLife(CacheProfiles.organization);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(`${getAPIUrl()}orgs/platform`, {
    method: 'GET',
    headers,
  });
  return await errorHandling(result);
}

export async function getOrganizationContextInfo(_next?: unknown, access_token?: string) {
  return fetchPlatformOrganization(access_token);
}

export async function getPlatformOrganizationContextInfo(access_token?: string) {
  return fetchPlatformOrganization(access_token);
}

export async function getOrganizationContextInfoWithoutCredentials(_next?: unknown) {
  return await fetchPlatformOrganization();
}

export async function getOrganizationContextInfoNoAsync(next: unknown, access_token: string) {
  return await fetch(`${getAPIUrl()}orgs/platform`, RequestBodyWithAuthHeader('GET', null, next, access_token));
}

export async function updateOrgLanding(landing_object: any, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}orgs/landing`,
    RequestBodyWithAuthHeader('PUT', landing_object, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations cache after landing update
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
  }

  return metadata;
}

export async function uploadLandingContent(content_file: File, access_token: string) {
  const formData = new FormData();
  formData.append('content_file', content_file);

  const result = await fetch(
    `${getAPIUrl()}orgs/landing/content`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function removeUser(user_id: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}orgs/users/${user_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations cache after user removal
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}
