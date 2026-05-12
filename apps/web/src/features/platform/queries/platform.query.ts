'use client';

import { listAllPermissions } from '@services/rbac';
import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import type { Platform } from '@/types/platform';
import { queryKeys } from '@/lib/react-query/queryKeys';

export function platformConfigQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.platform.config(),
    queryFn: () => apiFetcher<Platform>(`platform`),
  });
}

export function platformPermissionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.platform.permissions(),
    queryFn: () => listAllPermissions(),
    staleTime: 3_600_000,
  });
}
