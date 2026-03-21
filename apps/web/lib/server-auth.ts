import type { Action, Resource, Scope } from '@/types/permissions';
import { perm } from '@/types/permissions';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/**
 * Get the current session or redirect to login.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth');
  }
  return session;
}

/**
 * Check if the session has a specific permission.
 */
export function sessionCan(
  session: { permissions?: string[] } | undefined,
  resource: Resource,
  action: Action,
  scope: Scope,
  permsSet?: Set<string>,
): boolean {
  const perms = permsSet ?? new Set(session?.permissions);
  return perms.has(perm(resource, action, scope));
}

/**
 * Require a specific permission or redirect.
 * Verifies that session permissions are scoped to the correct platform.
 */
export async function requirePermission(action: Action, resource: Resource, scope: Scope, redirectTo?: string) {
  const session = await requireAuth();

  const perms = new Set(session.permissions);
  if (!sessionCan(session, resource, action, scope, perms)) {
    redirect(redirectTo ?? '/unauthorized');
  }
  return session;
}

/**
 * Require any of the specified permissions or redirect.
 * Verifies that session permissions are scoped to the correct platform.
 */
export async function requireAnyPermission(
  checks: { action: Action; resource: Resource; scope: Scope }[],
  redirectTo?: string,
) {
  const session = await requireAuth();

  const perms = new Set(session.permissions);
  const hasAny = checks.some((c) => sessionCan(session, c.resource, c.action, c.scope, perms));
  if (!hasAny) {
    redirect(redirectTo ?? '/unauthorized');
  }
  return session;
}
