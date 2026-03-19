'use server';

import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

interface QuizSubmissionPayload {
  answers: any[];
  start_ts?: string;
  end_ts?: string;
  idempotency_key?: string;
  violation_count?: number;
  violations?: Record<string, any>;
}

export async function submitQuizBlock(activity_id: number, data: QuizSubmissionPayload, access_token: string) {
  try {
    const result = await fetch(
      `${getAPIUrl()}blocks/quiz/${activity_id}`,
      RequestBodyWithAuthHeader('POST', data, null, access_token),
    );
    const response = await result.json();
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
    return response;
  } catch (error) {
    console.log('error', error);
    throw error;
  }
}

export async function getQuizAttempts(activity_id: number, access_token: string, user_id?: number) {
  try {
    const url = user_id
      ? `${getAPIUrl()}blocks/quiz/${activity_id}/attempts?user_id=${user_id}`
      : `${getAPIUrl()}blocks/quiz/${activity_id}/attempts`;

    const result = await fetch(url, RequestBodyWithAuthHeader('GET', null, null, access_token));
    return await result.json();
  } catch (error) {
    console.log('error', error);
    throw error;
  }
}

export async function getQuizStats(activity_id: number, access_token: string) {
  try {
    const result = await fetch(
      `${getAPIUrl()}blocks/quiz/${activity_id}/stats`,
      RequestBodyWithAuthHeader('GET', null, null, access_token),
    );
    return await result.json();
  } catch (error) {
    console.log('error', error);
    throw error;
  }
}
