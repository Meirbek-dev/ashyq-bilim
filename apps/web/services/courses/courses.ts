'use server';
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests';
import { CacheProfiles, cacheLife, cacheTag } from '@/lib/cache';
import { getAPIUrl } from '@services/config/config';
import { courseTag, tags } from '@/lib/cacheTags';

/*
 This file includes POST, PUT, DELETE requests and cached GET requests
 Client-side GET requests are called from the frontend using SWR
*/

/**
 * Cached fetch for courses
 * Uses `use cache` directive for cacheComponents
 * Returns both courses and total count for pagination
 */
async function fetchCourses(page = 1, limit = 20, access_token?: string): Promise<{ courses: any[]; total: number }> {
  'use cache';
  cacheTag(tags.courses);
  cacheTag(courseTag.publicList());
  cacheLife(CacheProfiles.courses);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(`${getAPIUrl()}courses/page/${page}/limit/${limit}`, {
    method: 'GET',
    headers,
  });

  if (!result.ok) {
    const error: any = new Error(result.statusText || 'Request failed');
    error.status = result.status;
    throw error;
  }

  const courses = await result.json();
  const total = Number.parseInt(result.headers.get('X-Total-Count') ?? '0', 10);

  return { courses, total };
}

export async function getCourses(_next?: any, access_token?: any, page = 1, limit = 20) {
  return fetchCourses(page, limit, access_token);
}

/**
 * Cached fetch for courses the current user can edit
 */
async function fetchEditableCourses(
  page = 1,
  limit = 20,
  access_token?: string,
  query?: string,
  sortBy = 'updated',
  preset?: string,
): Promise<{
  courses: any[];
  total: number;
  summary: { total: number; ready: number; private: number; attention: number };
}> {
  'use cache';
  cacheTag(tags.editableCourses);
  cacheTag(courseTag.editableList());
  cacheLife(CacheProfiles.courses);

  if (!access_token) {
    return {
      courses: [],
      total: 0,
      summary: { total: 0, ready: 0, private: 0, attention: 0 },
    };
  }

  const queryParams = new URLSearchParams();
  if (query?.trim()) {
    queryParams.set('query', query.trim());
  }
  if (sortBy) {
    queryParams.set('sort_by', sortBy);
  }
  if (preset?.trim()) {
    queryParams.set('preset', preset.trim());
  }

  const result = await fetch(
    `${getAPIUrl()}courses/editable/page/${page}/limit/${limit}${queryParams.size > 0 ? `?${queryParams.toString()}` : ''}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
    },
  );

  if (!result.ok) {
    const error: any = new Error(result.statusText || 'Request failed');
    error.status = result.status;
    throw error;
  }

  const courses = await result.json();
  const total = Number.parseInt(result.headers.get('X-Total-Count') ?? '0', 10);
  const summary = {
    total: Number.parseInt(result.headers.get('X-Summary-Total') ?? String(total), 10),
    ready: Number.parseInt(result.headers.get('X-Summary-Ready') ?? '0', 10),
    private: Number.parseInt(result.headers.get('X-Summary-Private') ?? '0', 10),
    attention: Number.parseInt(result.headers.get('X-Summary-Attention') ?? '0', 10),
  };

  return { courses, total, summary };
}

export async function getEditableCourses(
  access_token?: any,
  page = 1,
  limit = 20,
  query?: string,
  sortBy = 'updated',
  preset?: string,
) {
  return fetchEditableCourses(page, limit, access_token, query, sortBy, preset);
}

export async function getCourseUserRights(course_uuid: string, access_token?: string | null) {
  if (!access_token) {
    throw new Error('Access token required');
  }

  const result = await fetch(`${getAPIUrl()}courses/${course_uuid}/rights`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
  });

  return await errorHandling(result);
}

export async function searchCourses(query: string, page = 1, limit = 20, next: any, access_token?: any) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token),
  );
  return await errorHandling(result);
}

/**
 * Cached fetch for course metadata
 */
async function fetchCourseMetadata(course_uuid: string, access_token?: string, withUnpublishedActivities = false) {
  'use cache';
  const normalizedCourseUuid = course_uuid.startsWith('course_') ? course_uuid : `course_${course_uuid}`;
  cacheTag(tags.courses);
  cacheTag(courseTag.detail(normalizedCourseUuid));
  cacheLife(CacheProfiles.courses);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(
    `${getAPIUrl()}courses/${normalizedCourseUuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`,
    {
      method: 'GET',
      headers,
    },
  );
  return await errorHandling(result);
}

export async function getCourseMetadata(
  course_uuid: string,
  _next?: any,
  access_token?: string | null,
  withUnpublishedActivities = false,
) {
  return fetchCourseMetadata(course_uuid, access_token || undefined, withUnpublishedActivities);
}

interface CourseWriteOptions {
  lastKnownUpdateDate?: string | null;
  includeEditableList?: boolean;
  includePublicList?: boolean;
}

async function revalidateCourseMutationTags(course_uuid: string | undefined, options?: CourseWriteOptions) {
  const { revalidateTag } = await import('next/cache');
  const tagsToRevalidate = new Set<string>();

  if (course_uuid) {
    tagsToRevalidate.add(courseTag.detail(course_uuid));
  }

  const includeEditableList = options?.includeEditableList ?? true;
  const includePublicList = options?.includePublicList ?? true;

  if (includeEditableList) {
    tagsToRevalidate.add(tags.editableCourses);
  }
  if (includePublicList) {
    tagsToRevalidate.add(tags.courses);
  }

  for (const tag of tagsToRevalidate) {
    revalidateTag(tag, 'max');
  }
}

const toCourseMetadataPayload = (data: any, options?: CourseWriteOptions) => ({
  name: data.name,
  description: data.description ?? '',
  about: data.about ?? '',
  learnings: Array.isArray(data.learnings) ? JSON.stringify(data.learnings) : data.learnings,
  tags: Array.isArray(data.tags) ? JSON.stringify(data.tags) : data.tags,
  thumbnail_type: data.thumbnail_type,
  last_known_update_date: options?.lastKnownUpdateDate ?? data.update_date ?? undefined,
});

export async function updateCourseMetadata(
  course_uuid: string,
  data: any,
  access_token: string,
  options?: CourseWriteOptions,
) {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/metadata`,
    RequestBodyWithAuthHeader('PUT', toCourseMetadataPayload(data, options), null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    await revalidateCourseMutationTags(course_uuid, {
      ...options,
      includeEditableList: true,
      includePublicList: true,
    });
  }

  return metadata;
}

export async function updateCourseAccess(
  course_uuid: string,
  data: any,
  access_token: string,
  options?: CourseWriteOptions,
) {
  const result = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/access`,
    RequestBodyWithAuthHeader(
      'PUT',
      {
        ...data,
        last_known_update_date: options?.lastKnownUpdateDate ?? data.update_date ?? undefined,
      },
      null,
      access_token,
    ),
  );
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(courseTag.access(course_uuid), 'max');
    await revalidateCourseMutationTags(course_uuid, {
      ...options,
      includeEditableList: true,
      includePublicList: true,
    });
  }

  return metadata;
}

/**
 * Cached fetch for full course data
 */
async function fetchCourse(course_uuid: string, access_token: string) {
  'use cache';
  cacheTag(tags.courses);
  cacheTag(courseTag.detail(course_uuid));
  cacheLife(CacheProfiles.courses);

  const result = await fetch(`${getAPIUrl()}courses/${course_uuid}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
  });
  return await errorHandling(result);
}

export async function getCourse(course_uuid: string, _next?: any, access_token?: string) {
  if (!access_token) {
    throw new Error('Access token required');
  }
  return fetchCourse(course_uuid, access_token);
}

/**
 * Cached fetch for course by ID
 */
async function fetchCourseById(course_id: number, access_token: string) {
  'use cache';
  cacheTag(tags.courses);
  cacheLife(CacheProfiles.courses);

  const result = await fetch(`${getAPIUrl()}courses/id/${course_id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
  });
  return await errorHandling(result);
}

export async function getCourseById(course_id: number, _next?: any, access_token?: string) {
  if (!access_token) {
    throw new Error('Access token required');
  }
  return fetchCourseById(course_id, access_token);
}

export async function updateCourseThumbnail(
  course_uuid: string,
  formData: FormData,
  access_token: string,
  options?: CourseWriteOptions,
) {
  if (options?.lastKnownUpdateDate) {
    formData.set('last_known_update_date', options.lastKnownUpdateDate);
  }

  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/thumbnail`,
    RequestBodyFormWithAuthHeader('PUT', formData, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate course cache after thumbnail update
  if (metadata.success) {
    await revalidateCourseMutationTags(course_uuid, {
      ...options,
      includeEditableList: true,
      includePublicList: true,
    });
  }

  return metadata;
}

export async function createNewCourse(
  course_body: any,
  thumbnail: any,
  access_token: string,
  options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  // Send file thumbnail as form data
  const formData = new FormData();
  formData.append('name', course_body.name);
  formData.append('description', course_body.description || '');
  formData.append('public', course_body.visibility);
  formData.append('learnings', course_body.learnings || '');
  formData.append('tags', course_body.tags || '');
  formData.append('about', course_body.description || '');

  if (thumbnail) {
    formData.append('thumbnail', thumbnail);
  }

  const result = await fetch(
    `${getAPIUrl()}courses`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate course cache after creating new course
  if (metadata.success) {
    await revalidateCourseMutationTags(undefined, {
      includeEditableList: options?.includeEditableList ?? true,
      includePublicList: options?.includePublicList ?? true,
    });
  }

  return metadata;
}

export async function deleteCourseFromBackend(
  course_uuid: string,
  access_token: string,
  options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data_result = await errorHandling(result);

  // Revalidate course cache after deletion
  if (result.ok) {
    await revalidateCourseMutationTags(course_uuid, {
      includeEditableList: options?.includeEditableList ?? true,
      includePublicList: options?.includePublicList ?? true,
    });
  }

  return data_result;
}

export async function getCourseContributors(course_uuid: string, access_token: string | null | undefined) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/contributors`,
    RequestBodyWithAuthHeader('GET', null, null, access_token || undefined),
  );
  return await getResponseMetadata(result);
}

export async function editContributor(
  course_uuid: string,
  contributor_id: number,
  authorship: any,
  authorship_status: any,
  access_token: string | null | undefined,
  options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/contributors/${contributor_id}?authorship=${authorship}&authorship_status=${authorship_status}`,
    RequestBodyWithAuthHeader('PUT', null, null, access_token || undefined),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after editing contributor
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(courseTag.contributors(course_uuid), 'max');
    await revalidateCourseMutationTags(course_uuid, {
      includeEditableList: options?.includeEditableList ?? true,
      includePublicList: options?.includePublicList ?? false,
    });
  }

  return metadata;
}

export async function applyForContributor(course_uuid: string, data: any, access_token: string | null | undefined) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/apply-contributor`,
    RequestBodyWithAuthHeader('POST', data, null, access_token || undefined),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after applying for contributor
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function bulkAddContributors(
  course_uuid: string,
  data: any,
  access_token: string | null | undefined,
  options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/bulk-add-contributors`,
    RequestBodyWithAuthHeader('POST', data, null, access_token || undefined),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after bulk adding contributors
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(courseTag.contributors(course_uuid), 'max');
    await revalidateCourseMutationTags(course_uuid, {
      includeEditableList: options?.includeEditableList ?? true,
      includePublicList: options?.includePublicList ?? false,
    });
  }

  return metadata;
}

export async function bulkRemoveContributors(
  course_uuid: string,
  data: any,
  access_token: string | null | undefined,
  options?: Pick<CourseWriteOptions, 'includeEditableList' | 'includePublicList'>,
) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/bulk-remove-contributors`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token || undefined),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after bulk removing contributors
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(courseTag.contributors(course_uuid), 'max');
    await revalidateCourseMutationTags(course_uuid, {
      includeEditableList: options?.includeEditableList ?? true,
      includePublicList: options?.includePublicList ?? false,
    });
  }

  return metadata;
}

export async function getCourseRights(course_uuid: string, access_token: string | null | undefined) {
  const result: any = await fetch(
    `${getAPIUrl()}courses/${course_uuid}/rights`,
    RequestBodyWithAuthHeader('GET', null, null, access_token || undefined),
  );
  return await errorHandling(result);
}
