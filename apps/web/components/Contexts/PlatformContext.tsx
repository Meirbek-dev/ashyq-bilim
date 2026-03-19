'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { createContext, useContext } from 'react';
import type { Platform } from '@/types/org';
import type { ReactNode } from 'react';
import useSWR from 'swr';

export const PlatformContext = createContext<Platform | null>(null);

export const PlatformContextProvider = ({ children, initialOrg }: { children: ReactNode; initialOrg?: any }) => {
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;
  const orgContextKey = `${getAPIUrl()}orgs/platform`;

  const { data: org, isLoading: isOrgLoading } = useSWR(orgContextKey, (url: string) => swrFetcher(url, accessToken), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: !initialOrg,
    fallbackData: initialOrg || undefined,
  });

  const isLoading = session.status === 'loading' || (!org && isOrgLoading);

  if (isLoading) return <PageLoading />;

  return <PlatformContext.Provider value={org}>{children}</PlatformContext.Provider>;
};

export function usePlatform(): Platform | null {
  return useContext(PlatformContext);
}
