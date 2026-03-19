'use client';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import useSWR from 'swr';

export function useCourseList(page = 1, limit = 20) {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  return useSWR(`${getAPIUrl()}courses/page/${page}/limit/${limit}`, (url: string) => swrFetcher(url, access_token));
}
