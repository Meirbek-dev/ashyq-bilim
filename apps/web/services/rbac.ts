/**
 * Unified RBAC service - single file for all permission and role API calls.
 *
 * Every RBAC-related fetch in the frontend should go through this module.
 * No inline fetch() calls for roles/permissions anywhere else.
 */

import type {
  CreateRoleBody,
  OrgUserBasic,
  Permission,
  Role,
  RoleAuditListResponse,
  UpdateRoleBody,
  UserRBACData,
  UserRoleAssignment,
} from '@/types/permissions';
import { getAPIUrl } from '@/services/config/config';

// ============================================================================
// Internal helpers
// ============================================================================

const api = (path: string) => `${getAPIUrl()}${path}`;

async function request<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `RBAC API error: ${res.status}`);
  }

  return res.json();
}

// ============================================================================
// My permissions
// ============================================================================

export function fetchMyPermissions(token: string): Promise<UserRBACData> {
  return request(api('rbac/me/permissions'), token);
}

// ============================================================================
// Permissions - read-only
// ============================================================================

export function listAllPermissions(token: string): Promise<Permission[]> {
  return request(api('roles/permissions/all'), token);
}

// ============================================================================
// Roles - CRUD
// ============================================================================

export function listRoles(token: string): Promise<Role[]> {
  return request(api('roles'), token);
}

export function getRole(token: string, roleId: number): Promise<Role> {
  return request(api(`roles/${roleId}`), token);
}

export function getRolePermissions(token: string, roleId: number): Promise<Permission[]> {
  return request(api(`roles/${roleId}/permissions`), token);
}

export function createRole(token: string, body: CreateRoleBody): Promise<Role> {
  return request(api('roles'), token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateRole(token: string, roleId: number, body: UpdateRoleBody): Promise<Role> {
  return request(api(`roles/${roleId}`), token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteRole(token: string, roleId: number): Promise<void> {
  return request(api(`roles/${roleId}`), token, { method: 'DELETE' });
}

export function getRoleUsersCount(token: string, roleId: number): Promise<{ count: number }> {
  return request(api(`roles/${roleId}/users/count`), token);
}

export function listRoleAuditLog(token: string, page = 1, pageSize = 20): Promise<RoleAuditListResponse> {
  return request(api(`roles/audit-log?page=${page}&page_size=${pageSize}`), token);
}

// ============================================================================
// Role ↔ Permission assignment
// ============================================================================

export function addPermissionToRole(token: string, roleId: number, permissionId: number): Promise<void> {
  return request(api(`roles/${roleId}/permissions`), token, {
    method: 'POST',
    body: JSON.stringify({ permission_id: permissionId }),
  });
}

export function removePermissionFromRole(token: string, roleId: number, permissionId: number): Promise<void> {
  return request(api(`roles/${roleId}/permissions/${permissionId}`), token, {
    method: 'DELETE',
  });
}

// ============================================================================
// User ↔ Role assignment
// ============================================================================

export function listUserRoles(token: string): Promise<UserRoleAssignment[]> {
  return request<UserRoleAssignment[]>(api('rbac/user-roles'), token);
}

export function assignRoleToUser(token: string, userId: number, roleId: number): Promise<void> {
  return request(api('rbac/roles/assign'), token, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  });
}

export function removeRoleFromUser(token: string, userId: number, roleId: number): Promise<void> {
  return request(api('rbac/roles/revoke'), token, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  });
}

// ============================================================================
// Org users (used by role assignment UI)
// ============================================================================

export function listOrgUsers(token: string, limit = 100): Promise<OrgUserBasic[]> {
  // The endpoint may return { users: [...] } or a flat array.
  return request<OrgUserBasic[] | { users: OrgUserBasic[] }>(api(`orgs/users?limit=${limit}`), token).then((data) =>
    Array.isArray(data) ? data : data.users,
  );
}
