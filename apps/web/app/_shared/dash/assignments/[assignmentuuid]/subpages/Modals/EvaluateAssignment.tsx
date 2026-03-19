import { deleteUserSubmission, markActivityAsDoneForUser, putFinalGrade } from '@services/courses/assignments';
import TaskQuizObject from '../../_components/TaskEditor/Subs/TaskTypes/TaskQuizObject';
import TaskFormObject from '../../_components/TaskEditor/Subs/TaskTypes/TaskFormObject';
import TaskFileObject from '../../_components/TaskEditor/Subs/TaskTypes/TaskFileObject';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BookOpenCheck, Check, Download, Info, MoveRight, X } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { getTaskRefFileDir } from '@services/media/media';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { toast } from 'sonner';

const EvaluateAssignment = ({ user_id }: any) => {
  const t = useTranslations('DashPage.Assignments.EvaluateModal');
  const assignments = useAssignments();
  const session = usePlatformSession();
  const org = usePlatform() as any;

  // Guard clause for missing assignment data
  if (!assignments?.assignment_object) {
    return (
      <div className="flex min-h-[120px] items-center justify-center text-gray-500">
        {t('assignmentDataMissing', {
          defaultValue: 'Assignment data is unavailable.',
        })}
      </div>
    );
  }

  async function gradeAssignment() {
    if (!(assignments?.assignment_object?.assignment_uuid && session?.data?.tokens?.access_token)) return;
    const res = await putFinalGrade(
      user_id,
      assignments.assignment_object.assignment_uuid,
      session.data.tokens.access_token,
    );
    if (res.success) {
      toast.success(t('gradeFinalSuccess', { message: res.data.message }));
    } else {
      toast.error(t('gradeFinalError', { message: res.data.message }));
    }
  }

  async function markActivityAsDone() {
    if (!(assignments?.assignment_object?.assignment_uuid && session?.data?.tokens?.access_token)) return;
    const res = await markActivityAsDoneForUser(
      user_id,
      assignments.assignment_object.assignment_uuid,
      session.data.tokens.access_token,
    );
    if (res.success) {
      toast.success(t('markDoneSuccess', { message: res.data.message }));
    } else {
      toast.error(t('markDoneError', { message: res.data.message }));
    }
  }

  async function rejectAssignment() {
    if (!(assignments?.assignment_object?.assignment_uuid && session?.data?.tokens?.access_token)) return;
    const _res = await deleteUserSubmission(
      user_id,
      assignments.assignment_object.assignment_uuid,
      session.data.tokens.access_token,
    );
    toast.success(t('rejectSuccess'));
    globalThis.location.reload();
  }

  return (
    <div className="min-h-fit flex-col space-y-4 overflow-y-auto px-3 py-3">
      {assignments?.assignment_tasks
        ?.toSorted((a: any, b: any) => a.id - b.id)
        .map((task: any, index: number) => {
          return (
            <div
              className="flex flex-col space-y-2"
              key={task.assignment_task_uuid}
            >
              <div className="flex justify-between py-2">
                <div className="flex space-x-2 font-semibold text-slate-800">
                  <p>{t('taskLabel', { index: index + 1 })} : </p>
                  <p className="text-slate-500">{task.description}</p>
                </div>
                <div className="flex space-x-2">
                  {task.hint ? (
                    <Popover>
                      <PopoverTrigger className="soft-shadow flex cursor-pointer items-center space-x-2 rounded-full bg-amber-50/40 px-3 py-1 text-amber-900">
                        <Info size={13} />
                        <p className="text-xs font-semibold">{t('hint')}</p>
                      </PopoverTrigger>
                      <PopoverContent className="max-h-[200px] overflow-y-auto">{task.hint}</PopoverContent>
                    </Popover>
                  ) : null}
                  {task.reference_file ? (
                    <Link
                      href={getTaskRefFileDir(
                        assignments?.course_object.course_uuid,
                        assignments?.activity_object.activity_uuid,
                        assignments?.assignment_object.assignment_uuid,
                        task.assignment_task_uuid,
                        task.reference_file,
                      )}
                      target="_blank"
                      download
                      className="soft-shadow flex cursor-pointer items-center space-x-2 rounded-full bg-cyan-50/40 px-3 py-1 text-cyan-900"
                    >
                      <Download size={13} />
                      <div className="flex items-center space-x-2">
                        {task.reference_file ? (
                          <span className="relative">
                            <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-green-400 ring-2 ring-white" />
                          </span>
                        ) : null}
                        <p className="text-xs font-semibold">{t('refDoc')}</p>
                      </div>
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="min-h-full">
                {task.assignment_type === 'QUIZ' && (
                  <TaskQuizObject
                    key={task.assignment_task_uuid}
                    view="grading"
                    user_id={user_id}
                    assignmentTaskUUID={task.assignment_task_uuid}
                  />
                )}
                {task.assignment_type === 'FILE_SUBMISSION' && (
                  <TaskFileObject
                    key={task.assignment_task_uuid}
                    view="custom-grading"
                    user_id={user_id}
                    assignmentTaskUUID={task.assignment_task_uuid}
                  />
                )}
                {task.assignment_type === 'FORM' && (
                  <TaskFormObject
                    key={task.assignment_task_uuid}
                    view="grading"
                    user_id={user_id}
                    assignmentTaskUUID={task.assignment_task_uuid}
                  />
                )}
              </div>
            </div>
          );
        })}
      <div className="flex items-center justify-between space-x-4 font-semibold">
        <button
          onClick={rejectAssignment}
          className="soft-shadow flex cursor-pointer items-center space-x-2 rounded-lg bg-rose-600/80 px-4 py-2 text-sm text-white"
        >
          <X size={18} />
          <span>{t('rejectAssignment')}</span>
        </button>
        <div className="flex items-center space-x-3">
          <button
            onClick={gradeAssignment}
            className="soft-shadow flex cursor-pointer items-center space-x-2 rounded-lg bg-violet-600/80 px-4 py-2 text-sm text-white"
          >
            <BookOpenCheck size={18} />
            <span>{t('setFinalGrade')}</span>
          </button>
          <MoveRight
            className="text-gray-400"
            size={18}
          />
          <button
            onClick={markActivityAsDone}
            className="soft-shadow flex cursor-pointer items-center space-x-2 rounded-lg bg-teal-600/80 px-4 py-2 text-sm text-white"
          >
            <Check size={18} />
            <span>{t('markAsDone')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluateAssignment;
