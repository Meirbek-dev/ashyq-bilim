'use client';

import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { AssignmentRead } from '@/features/assignments/domain';

function assessmentToAssignment(data: any): AssignmentRead {
  return {
    assignment_uuid: data.assessment_uuid,
    title: data.title,
    description: data.description ?? '',
    due_at: data.assessment_policy?.due_at ?? null,
    published: data.lifecycle === 'PUBLISHED',
    status: data.lifecycle,
    scheduled_publish_at: data.scheduled_at ?? null,
    published_at: data.published_at ?? null,
    archived_at: data.archived_at ?? null,
    weight: data.weight ?? 1,
    grading_type: data.grading_type ?? 'PERCENTAGE',
    course_uuid: data.course_uuid ?? null,
    activity_uuid: data.activity_uuid ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  } as AssignmentRead;
}

function normalizeAssignmentUuid(assignmentUuid: string) {
  return assignmentUuid.startsWith('assignment_') ? assignmentUuid : `assignment_${assignmentUuid}`;
}

export function assignmentDetailQueryOptions(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.detail(canonicalAssignmentUuid),
    queryFn: async () => assessmentToAssignment(await apiFetcher(`${getAPIUrl()}assessments/${canonicalAssignmentUuid}`)),
  });
}

export function assignmentByActivityQueryOptions(activityUuid: string) {
  const canonicalActivityUuid = activityUuid.startsWith('activity_') ? activityUuid : `activity_${activityUuid}`;

  return queryOptions({
    queryKey: ['assignments', 'activity', canonicalActivityUuid],
    queryFn: async () => assessmentToAssignment(await apiFetcher(`${getAPIUrl()}assessments/activity/${canonicalActivityUuid}`)),
  });
}

export function assignmentTasksQueryOptions(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.tasks(canonicalAssignmentUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}assessments/${canonicalAssignmentUuid}/assignment/tasks`),
  });
}

export function activityDetailQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.activities.detail(activityUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}activities/${activityUuid}`),
  });
}
