'use client';

/**
 * Centralized Permission Provider
 *
 * Single source of truth for client-side permission checks.
 * Reads permissions from the NextAuth session - no separate API fetch.
 * Does simple Set.has() lookups - the backend expands wildcards and
 * scope-broadening before sending permissions to the frontend.
 */

import type { Action, Resource, Scope } from '@/types/permissions';
import { createContext, useContext, useMemo } from 'react';
import { Resources } from '@/types/permissions';
import { useSession } from 'next-auth/react';
import { perm } from '@/types/permissions';
import type { ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

// Role assignment shape lives in the shared `types/permissions` when needed.
// Keep the context value minimal - only what consumers actually use.
interface PermissionContextValue {
  /** Check if user has a specific permission (scope is required) */
  can: {
    (resource: Resource, action: Action, scope: Scope): boolean;
    (action: Action, resource: Resource, scope: Scope): boolean;
  };
  /** Still loading session */
  loading: boolean;
}

// ============================================================================
// Context
// ============================================================================

/**
 * Permission patterns:
 *
 * 1. RBAC `can()` checks - for feature/section gating (frontend UI & route guards).
 * 2. Backend `can_*` booleans on API objects - for row-level ownership/assignment checks.
 */
const PermissionContext = createContext<PermissionContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const permissions = useMemo(() => new Set<string>(session?.permissions), [session?.permissions]);

  const can = useMemo(() => {
    return (...args: [Resource, Action, Scope] | [Action, Resource, Scope]): boolean => {
      const [first, second, scope] = args;
      if (status !== 'authenticated') return false;
      const firstIsResource = Object.values(Resources).includes(first as Resource);
      const resource = (firstIsResource ? first : second) as Resource;
      const action = (firstIsResource ? second : first) as Action;
      return permissions.has(perm(resource, action, scope));
    };
  }, [status, permissions]);

  const value: PermissionContextValue = useMemo(
    () => ({
      can,
      loading: status === 'loading',
    }),
    [can, status],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use permissions from the centralized provider.
 *
 * @example
 * ```tsx
 * const { can } = usePermissions();
 *
 * if (can(Resources.COURSE, Actions.CREATE, Scopes.PLATFORM)) {
 *   // Show create button
 * }
 * ```
 */
export function usePermissions(): PermissionContextValue {
  const context = useContext(PermissionContext);

  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }

  return context;
}
