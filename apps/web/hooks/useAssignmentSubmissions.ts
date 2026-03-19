'use client';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import useSWR from 'swr';

export function useAssignmentSubmissions(assignmentUuid: string) {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  return useSWR(`${getAPIUrl()}assignments/assignment_${assignmentUuid}/submissions`, (url: string) =>
    swrFetcher(url, access_token),
  );
}
