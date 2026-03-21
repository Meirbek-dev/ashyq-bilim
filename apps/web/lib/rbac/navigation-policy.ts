import type { Action, Resource, Scope } from '@/types/permissions';
import { Actions, Resources, Scopes } from '@/types/permissions';

type CanCheck = (action: Action, resource: Resource, scope: Scope) => boolean;

export function canSeePlatform(can: CanCheck): boolean {
  return (
    can(Actions.MANAGE, Resources.PLATFORM, Scopes.OWN) ||
    can(Actions.UPDATE, Resources.PLATFORM, Scopes.OWN) ||
    can(Actions.MANAGE, Resources.PLATFORM, Scopes.PLATFORM) ||
    can(Actions.UPDATE, Resources.PLATFORM, Scopes.PLATFORM)
  );
}

export function canSeeCourses(can: CanCheck): boolean {
  return (
    can(Actions.CREATE, Resources.COURSE, Scopes.PLATFORM) ||
    can(Actions.UPDATE, Resources.COURSE, Scopes.PLATFORM) ||
    can(Actions.MANAGE, Resources.COURSE, Scopes.PLATFORM)
  );
}

export function canSeeAssignments(can: CanCheck): boolean {
  return (
    can(Actions.CREATE, Resources.COURSE, Scopes.PLATFORM) ||
    can(Actions.UPDATE, Resources.COURSE, Scopes.PLATFORM) ||
    can(Actions.UPDATE, Resources.COURSE, Scopes.OWN) ||
    can(Actions.GRADE, Resources.ASSIGNMENT, Scopes.PLATFORM) ||
    can(Actions.CREATE, Resources.ASSIGNMENT, Scopes.PLATFORM)
  );
}

export function canSeeAnalytics(can: CanCheck): boolean {
  return (
    can(Actions.READ, Resources.ANALYTICS, Scopes.ASSIGNED) ||
    can(Actions.READ, Resources.ANALYTICS, Scopes.PLATFORM) ||
    can(Actions.READ, Resources.ANALYTICS, Scopes.ALL) ||
    can(Actions.EXPORT, Resources.ANALYTICS, Scopes.ASSIGNED) ||
    can(Actions.EXPORT, Resources.ANALYTICS, Scopes.PLATFORM) ||
    can(Actions.EXPORT, Resources.ANALYTICS, Scopes.ALL)
  );
}

export function canSeeUsers(can: CanCheck): boolean {
  return (
    can(Actions.UPDATE, Resources.USER, Scopes.PLATFORM) ||
    can(Actions.READ, Resources.USER, Scopes.PLATFORM) ||
    can(Actions.MANAGE, Resources.USERGROUP, Scopes.PLATFORM)
  );
}

export function canSeeAdmin(can: CanCheck): boolean {
  return (
    can(Actions.MANAGE, Resources.PLATFORM, Scopes.OWN) ||
    can(Actions.UPDATE, Resources.PLATFORM, Scopes.OWN) ||
    can(Actions.MANAGE, Resources.PLATFORM, Scopes.PLATFORM) ||
    can(Actions.UPDATE, Resources.PLATFORM, Scopes.PLATFORM) ||
    can(Actions.UPDATE, Resources.ROLE, Scopes.PLATFORM) ||
    can(Actions.READ, Resources.ROLE, Scopes.PLATFORM)
  );
}

export function canSeePayments(can: CanCheck): boolean {
  return can(Actions.MANAGE, Resources.PAYMENT, Scopes.PLATFORM) || can(Actions.MANAGE, Resources.PLATFORM, Scopes.OWN);
}

export function canAccessDashboard(can: CanCheck): boolean {
  return (
    canSeePlatform(can) ||
    canSeeCourses(can) ||
    canSeeAssignments(can) ||
    canSeeAnalytics(can) ||
    canSeeUsers(can) ||
    canSeeAdmin(can) ||
    canSeePayments(can)
  );
}
