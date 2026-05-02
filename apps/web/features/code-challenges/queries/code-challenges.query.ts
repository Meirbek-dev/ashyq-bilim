'use client';

import { apiFetch } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { mapCanonicalCodeSubmission, type CodeSubmission } from '@/services/courses/code-challenges';
import type { Submission as GradingSubmission } from '@/features/grading/domain';

async function fetchCodeChallengeJson<T>(url: string): Promise<T | null> {
  const response = await apiFetch(url);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error('Failed to fetch');
  }
  return response.json() as Promise<T>;
}

export function codeChallengeSettingsQueryOptions<TSettings = unknown>(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.settings(activityUuid),
    queryFn: () => fetchCodeChallengeJson<TSettings>(`${getAPIUrl()}code-challenges/${activityUuid}/settings`),
    refetchOnWindowFocus: false,
  });
}

export function codeChallengeSubmissionsQueryOptions<TSubmission = unknown>(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.submissions(activityUuid),
    queryFn: async () => {
      const raw = await fetchCodeChallengeJson<GradingSubmission[]>(`${getAPIUrl()}code-challenges/${activityUuid}/submissions`);
      return raw ? raw.map(mapCanonicalCodeSubmission) : null;
    },
    refetchOnWindowFocus: false,
  });
}

export function codeChallengeSubmissionQueryOptions<TSubmission = unknown>(submissionUuid: string) {
  return queryOptions({
    queryKey: queryKeys.codeChallenges.submission(submissionUuid),
    queryFn: async () => {
      const raw = await fetchCodeChallengeJson<GradingSubmission>(`${getAPIUrl()}code-challenges/submissions/${submissionUuid}`);
      return raw ? mapCanonicalCodeSubmission(raw) : null;
    },
    refetchOnWindowFocus: false,
  });
}
