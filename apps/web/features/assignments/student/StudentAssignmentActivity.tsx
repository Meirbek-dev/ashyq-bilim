'use client';

import { useTranslations } from 'next-intl';

import { useAssignmentBundle, useAssignmentByActivity } from '@/features/assignments/hooks/useAssignments';
import { normalizeAssignmentTasks } from '@/features/assignments/domain';
import StudentAssignmentShell from '@/features/assignments/student/StudentAssignmentShell';

interface AssignmentObject {
  assignment_uuid: string;
  title?: string;
  due_date?: string | null;
  due_at?: string | null;
  description?: string | null;
}

interface CourseObject {
  course_uuid: string;
}

interface ActivityObject {
  id?: number;
  activity_uuid: string;
}

interface StudentAssignmentActivityProps {
  assignmentUuid?: string | null;
  activityUuid?: string | null;
}

export default function StudentAssignmentActivity({ assignmentUuid, activityUuid }: StudentAssignmentActivityProps) {
  const t = useTranslations('Activities.AssignmentStudentActivity');
  const assignmentByActivity = useAssignmentByActivity(assignmentUuid ? null : activityUuid);
  const resolvedAssignmentUuid = assignmentUuid ?? assignmentByActivity.data?.assignment_uuid ?? null;
  const { data: assignments, isPending } = useAssignmentBundle(resolvedAssignmentUuid);

  if (isPending || assignmentByActivity.isPending) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-slate-500">{t('loading', { default: 'Loading assignment...' })}</p>
      </div>
    );
  }

  if (!assignments.assignment_object) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-slate-500">{t('noAssignment', { default: 'No assignment found' })}</p>
      </div>
    );
  }

  const { assignment_object, assignment_tasks, course_object, activity_object } = assignments;
  const tasks = normalizeAssignmentTasks(assignment_tasks);

  return (
    <StudentAssignmentShell
      data={{
        assignment: {
          assignment_uuid: assignment_object.assignment_uuid,
          title: assignment_object.title,
          description: assignment_object.description,
          due_at: assignment_object.due_at,
          due_date: null,
        },
        tasks,
        courseUuid: course_object?.course_uuid,
        activityUuid: activity_object?.activity_uuid,
        activityId: activity_object?.id ?? null,
      }}
    />
  );
}
