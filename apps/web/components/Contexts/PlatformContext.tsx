'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { createContext, useContext } from 'react';
import type { Platform } from '@/types/platform';
import type { ReactNode } from 'react';
import useSWR from 'swr';

export const PlatformContext = createContext<Platform | null>(null);

export const PlatformContextProvider = ({
  children,
  initialPlatform,
}: {
  children: ReactNode;
  initialPlatform?: any;
}) => {
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;
  const platformContextKey = `${getAPIUrl()}platform`;

  const { data: platform, isLoading: isPlatformLoading } = useSWR(
    platformContextKey,
    (url: string) => swrFetcher(url, accessToken),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: !initialPlatform,
      fallbackData: initialPlatform || undefined,
    },
  );

  const isLoading = session.status === 'loading' || (!platform && isPlatformLoading);

  if (isLoading) return <PageLoading />;

  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
};

export function usePlatform(): Platform | null {
  return useContext(PlatformContext);
}
