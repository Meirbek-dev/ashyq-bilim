'use server';

import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { courseTag, tags } from '@/lib/cacheTags';

export async function getUserGroups(access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function createUserGroup(body: any, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/`,
    RequestBodyWithAuthHeader('POST', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations cache after creating user group
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
  }

  return metadata;
}

export async function linkUserToUserGroup(usergroup_id: number, user_id: number, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/${usergroup_id}/add_users?user_ids=${user_id}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations and users cache after linking user to group
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}

export async function unLinkUserToUserGroup(usergroup_id: number, user_id: number, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/${usergroup_id}/remove_users?user_ids=${user_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations and users cache after unlinking user from group
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}

export async function updateUserGroup(usergroup_id: number, access_token: string, data: any) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/${usergroup_id}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations cache after updating user group
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
  }

  return metadata;
}

export async function deleteUserGroup(usergroup_id: number, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/${usergroup_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations cache after deleting user group
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.organizations, 'max');
  }

  return metadata;
}

export async function linkResourcesToUserGroup(
  usergroup_id: number,
  resource_uuids: any,
  access_token: string,
  options?: UserGroupCourseInvalidationOptions,
) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/${usergroup_id}/add_resources?resource_uuids=${resource_uuids}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations and courses cache after linking resources
  if (metadata.success) {
    await revalidateUserGroupCourseTags(options);
  }

  return metadata;
}

interface UserGroupCourseInvalidationOptions {
  courseUuid?: string;
}

async function revalidateUserGroupCourseTags(options?: UserGroupCourseInvalidationOptions) {
  const { revalidateTag } = await import('next/cache');
  const tagsToRevalidate = new Set<string>([tags.organizations]);

  if (options?.courseUuid) {
    tagsToRevalidate.add(courseTag.detail(options.courseUuid));
    tagsToRevalidate.add(courseTag.access(options.courseUuid));
  }

  tagsToRevalidate.add(tags.courses);

  for (const tag of tagsToRevalidate) {
    revalidateTag(tag, 'max');
  }
}

export async function unLinkResourcesToUserGroup(
  usergroup_id: number,
  resource_uuids: any,
  access_token: string,
  options?: UserGroupCourseInvalidationOptions,
) {
  const result: any = await fetch(
    `${getAPIUrl()}usergroups/${usergroup_id}/remove_resources?resource_uuids=${resource_uuids}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate organizations and courses cache after unlinking resources
  if (metadata.success) {
    await revalidateUserGroupCourseTags(options);
  }

  return metadata;
}
