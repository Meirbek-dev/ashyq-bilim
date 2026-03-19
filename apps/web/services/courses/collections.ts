'use server';

import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests';
import { CacheProfiles, cacheLife, cacheTag } from '@/lib/cache';
import { tags } from '@/lib/cacheTags';

import { getAPIUrl } from '../config/config';

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
 Client-side GET requests are called from the frontend using SWR
*/

export async function deleteCollection(collection_uuid: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}collections/${collection_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate collections cache after deletion
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.collections, 'max');
  }

  return data_result;
}

// Create a new collection
export async function createCollection(collection: any, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}collections/`,
    RequestBodyWithAuthHeader('POST', collection, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate collections cache after creation
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.collections, 'max');
  }

  return data_result;
}

async function fetchCollectionById(collection_uuid: string, access_token?: string) {
  'use cache';
  cacheTag(tags.collections);
  cacheLife(CacheProfiles.courses);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(`${getAPIUrl()}collections/collection_${collection_uuid}`, {
    method: 'GET',
    headers,
  });
  return await errorHandling(result);
}

export async function getCollectionById(collection_uuid: string, access_token?: string, _next?: any) {
  return fetchCollectionById(collection_uuid, access_token);
}

/**
 * Cached fetch for collections
 */
async function fetchCollections(access_token?: string) {
  'use cache';
  cacheTag(tags.collections);
  cacheLife(CacheProfiles.courses);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(`${getAPIUrl()}collections/page/1/limit/10`, {
    method: 'GET',
    headers,
  });
  return await errorHandling(result);
}

export async function getCollections(access_token?: string, _next?: any) {
  return fetchCollections(access_token);
}
