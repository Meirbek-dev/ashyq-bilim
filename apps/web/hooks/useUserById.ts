'use client';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import useSWR from 'swr';

export function useUserById(userId: number | string | undefined) {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  return useSWR(userId !== null ? `${getAPIUrl()}users/id/${userId}` : null, (url: string) =>
    swrFetcher(url, access_token),
  );
}
