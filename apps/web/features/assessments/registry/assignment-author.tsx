'use client';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import AssignmentStudioRoute from '@/features/assignments/studio/AssignmentStudioShell';
import { useAssignmentByActivity } from '@/features/assignments/hooks/useAssignments';
import type { KindAuthorProps } from './index';

export default function AssignmentAuthor({ activityUuid }: KindAuthorProps) {
  const { data: assignment, isLoading, error } = useAssignmentByActivity(activityUuid);

  if (isLoading) return <PageLoading />;

  if (error || !assignment?.assignment_uuid) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Assignment data is unavailable for this activity.
      </div>
    );
  }

  return (
    <AssignmentStudioRoute
      assignmentUuid={assignment.assignment_uuid}
      embedded
    />
  );
}
