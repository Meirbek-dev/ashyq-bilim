import { getAPIUrl } from '@services/config/config';

export function getOrgUsersSwrKey() {
  return `${getAPIUrl()}orgs/users`;
}

export function getOrgInvitesSwrKey() {
  return `${getAPIUrl()}orgs/invites`;
}

export function getUsergroupsSwrKey() {
  return `${getAPIUrl()}usergroups`;
}

export function getUsergroupUsersSwrKey(usergroupId: number | null | undefined) {
  if (!usergroupId) return '';
  return `${getAPIUrl()}usergroups/${usergroupId}/users`;
}
