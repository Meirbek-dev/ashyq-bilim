'use client';

import TaskQuizObject from '@/app/_shared/dash/assignments/[assignmentuuid]/_components/TaskEditor/Subs/TaskTypes/TaskQuizObject';
import TaskFormObject from '@/app/_shared/dash/assignments/[assignmentuuid]/_components/TaskEditor/Subs/TaskTypes/TaskFormObject';
import TaskFileObject from '@/app/_shared/dash/assignments/[assignmentuuid]/_components/TaskEditor/Subs/TaskTypes/TaskFileObject';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Backpack, Calendar, Download, Info } from 'lucide-react';
import { getTaskRefFileDir } from '@services/media/media';
import { Card, CardContent } from '@components/ui/card';
import { Separator } from '@components/ui/separator';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { useMemo } from 'react';

// Type definitions
type AssignmentType = 'QUIZ' | 'FILE_SUBMISSION' | 'FORM';

interface AssignmentTask {
  id: number;
  assignment_task_uuid: string;
  description: string;
  hint?: string | null;
  reference_file?: string | null;
  assignment_type: AssignmentType;
}

interface AssignmentObject {
  assignment_uuid: string;
  due_date?: string | null;
  description?: string | null;
}

interface CourseObject {
  course_uuid: string;
}

interface ActivityObject {
  activity_uuid: string;
}

interface AssignmentsData {
  assignment_object?: AssignmentObject | null;
  assignment_tasks?: AssignmentTask[] | null;
  course_object?: CourseObject | null;
  activity_object?: ActivityObject | null;
}

const AssignmentStudentActivity = () => {
  const t = useTranslations('Activities.AssignmentStudentActivity');
  const assignments = useAssignments() as AssignmentsData | null;

  // Early returns for loading/error states
  if (!assignments) {
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

  // Sort tasks (plain computation - avoid conditional hooks)
  const sortedTasks: AssignmentTask[] = assignment_tasks ? [...assignment_tasks].toSorted((a, b) => a.id - b.id) : [];

  const hasTasks = sortedTasks.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Badge
              variant="secondary"
              className="h-7 w-fit gap-2 px-4 py-2"
            >
              <Backpack className="h-4 w-4" />
              <span className="font-semibold">{t('assignment')}</span>
            </Badge>

            {assignment_object.due_date && (
              <>
                <Separator
                  orientation="vertical"
                  className="hidden h-6 sm:block"
                />
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">
                    {t('dueDate')}: {assignment_object.due_date}
                  </span>
                </div>
              </>
            )}
          </div>

          {assignment_object.description && (
            <>
              <Separator className="my-4" />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-700">
                  <Info className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold">{t('descriptionTitle')}</h3>
                </div>
                <p className="pl-6 text-sm leading-relaxed text-slate-600">{assignment_object.description}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tasks Section */}
      {!hasTasks ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-slate-500">{t('noTasks', { default: 'No tasks available' })}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedTasks.map((task, index) => (
            <TaskCard
              key={task.assignment_task_uuid}
              task={task}
              index={index}
              assignments={assignments}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Extracted TaskCard component for better organization
interface TaskCardProps {
  task: AssignmentTask;
  index: number;
  assignments: AssignmentsData;
  t: ReturnType<typeof useTranslations>;
}

const TaskCard = ({ task, index, assignments, t }: TaskCardProps) => {
  const hasHint = Boolean(task.hint);
  const hasReferenceFile = Boolean(task.reference_file);

  const referenceFileUrl = useMemo(() => {
    if (
      !hasReferenceFile ||
      !assignments.course_object ||
      !assignments.activity_object ||
      !assignments.assignment_object
    ) {
      return null;
    }

    return getTaskRefFileDir(
      assignments.course_object.course_uuid,
      assignments.activity_object.activity_uuid,
      assignments.assignment_object.assignment_uuid,
      task.assignment_task_uuid,
      task.reference_file!,
    );
  }, [hasReferenceFile, assignments, task]);

  return (
    <Card>
      <CardContent className="p-6 pt-0">
        {/* Task Header */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-lg font-semibold text-slate-800">{t('task', { index: index + 1 })}:</span>
            <span className="break-words text-slate-600">{task.description}</span>
          </div>

          {/* Task Actions */}
          {(hasHint || hasReferenceFile) && (
            <div className="flex flex-wrap gap-2">
              {hasHint && (
                <Popover>
                  <PopoverTrigger>
                    <Badge
                      variant="outline"
                      className="h-7 cursor-pointer gap-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      role="button"
                      tabIndex={0}
                    >
                      <Info className="h-3 w-3" />
                      <span className="text-xs font-semibold">{t('hint')}</span>
                    </Badge>
                  </PopoverTrigger>
                  <PopoverContent className="max-h-[200px] overflow-y-auto">
                    <p className="text-sm text-slate-700">{task.hint}</p>
                  </PopoverContent>
                </Popover>
              )}

              {hasReferenceFile && referenceFileUrl && (
                <Link
                  href={referenceFileUrl}
                  target="_blank"
                  download
                  className="inline-flex"
                >
                  <Badge
                    variant="outline"
                    className="h-7 cursor-pointer gap-2 border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
                  >
                    <Download className="h-3 w-3" />
                    <span className="text-xs font-semibold">{t('referenceDocument')}</span>
                  </Badge>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Task Content */}
        <div className="w-full">
          {task.assignment_type === 'QUIZ' && (
            <TaskQuizObject
              view="student"
              assignmentTaskUUID={task.assignment_task_uuid}
            />
          )}
          {task.assignment_type === 'FILE_SUBMISSION' && (
            <TaskFileObject
              view="student"
              assignmentTaskUUID={task.assignment_task_uuid}
            />
          )}
          {task.assignment_type === 'FORM' && (
            <TaskFormObject
              view="student"
              assignmentTaskUUID={task.assignment_task_uuid}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AssignmentStudentActivity;
