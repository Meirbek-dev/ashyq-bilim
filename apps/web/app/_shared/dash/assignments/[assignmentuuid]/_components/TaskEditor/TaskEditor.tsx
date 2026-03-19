'use client';

import {
  useAssignmentsTask,
  useAssignmentsTaskDispatch,
} from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { GalleryVerticalEnd, Info, TentTree, Trash } from 'lucide-react';
import { deleteAssignmentTask } from '@services/courses/assignments';
import { getAPIUrl } from '@services/config/config';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useSWRConfig } from 'swr';
import { useState } from 'react';
import { toast } from 'sonner';

import { AssignmentTaskGeneralEdit } from './Subs/AssignmentTaskGeneralEdit';

const AssignmentTaskContentEdit = dynamic(() => import('./Subs/AssignmentTaskContentEdit'));

const AssignmentTaskEditor = ({ page }: any) => {
  const t = useTranslations('DashPage.Assignments.TaskEditor');
  const assignment = useAssignments();
  const assignmentTaskState = useAssignmentsTask();
  const assignmentTaskStateHook = useAssignmentsTaskDispatch();
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const { mutate } = useSWRConfig();

  // Use key to track current task UUID and reset sub-page state when it changes
  const [taskUUIDKey, setTaskUUIDKey] = useState(assignmentTaskState.assignmentTask.assignment_task_uuid);
  const [selectedSubPage, setSelectedSubPage] = useState(page);

  // Reset to general page when task UUID changes
  if (taskUUIDKey !== assignmentTaskState.assignmentTask.assignment_task_uuid) {
    setTaskUUIDKey(assignmentTaskState.assignmentTask.assignment_task_uuid);
    setSelectedSubPage('general');
  }

  async function deleteTaskUI() {
    if (!assignment?.assignment_object?.assignment_uuid) {
      toast.error(t('missingAssignmentUUID'));
      return;
    }

    if (!assignmentTaskState?.assignmentTask?.assignment_task_uuid) {
      toast.error(t('missingTaskUUID'));
      return;
    }

    const toastId = toast.loading(t('deletingTask'));
    try {
      await deleteAssignmentTask(
        assignmentTaskState.assignmentTask.assignment_task_uuid,
        assignment.assignment_object.assignment_uuid,
        access_token,
      );
      assignmentTaskStateHook({
        type: 'setAssignmentTask',
        payload: {},
      });
      assignmentTaskStateHook({
        type: 'setSelectedAssignmentTaskUUID',
        payload: '',
      });

      // Revalidate assignment tasks list so UI updates immediately after deletion ✅
      try {
        await mutate(`${getAPIUrl()}assignments/${assignment.assignment_object.assignment_uuid}/tasks`);
      } catch (error) {
        // non-fatal: if revalidation fails, UI will update on next SWR refresh
        console.warn('Failed to revalidate assignment tasks after delete', error);
      }

      toast.success(t('deleteSuccess'), { id: toastId });
    } catch {
      toast.error(t('deleteError'));
    }
  }

  return (
    <div className="z-20 flex h-full w-full flex-col overflow-auto text-sm font-bold">
      {assignmentTaskState.assignmentTask && Object.keys(assignmentTaskState.assignmentTask).length > 0 ? (
        <div className="flex h-full flex-col space-y-3">
          <div className="soft-shadow z-10 mb-3 flex shrink-0 flex-col bg-white pt-5 pr-10 pl-10 text-sm tracking-tight shadow-[0px_4px_16px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between py-1">
              <div className="text-lg font-semibold">{assignmentTaskState?.assignmentTask.title}</div>
              <div>
                <div
                  onClick={() => deleteTaskUI()}
                  className="flex cursor-pointer items-center space-x-2 rounded-md border border-rose-600/10 bg-rose-100 bg-linear-to-bl px-2 py-1.5 text-red-800 shadow-lg shadow-rose-900/10"
                >
                  <Trash size={18} />
                  <p className="text-xs font-semibold">{t('deleteTask')}</p>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <div
                onClick={() => {
                  setSelectedSubPage('general');
                }}
                className={`border-primary flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                  selectedSubPage === 'general' ? 'border-b-4' : 'opacity-50'
                } cursor-pointer`}
              >
                <div className="mx-2 flex items-center space-x-2.5">
                  <Info size={16} />
                  <div>{t('general')}</div>
                </div>
              </div>
              <div
                onClick={() => {
                  setSelectedSubPage('content');
                }}
                className={`border-primary flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                  selectedSubPage === 'content' ? 'border-b-4' : 'opacity-50'
                } cursor-pointer`}
              >
                <div className="mx-2 flex items-center space-x-2.5">
                  <GalleryVerticalEnd size={16} />
                  <div>{t('content')}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="soft-shadow mx-auto mr-10 ml-10 min-h-0 flex-1 overflow-auto rounded-xl bg-white px-6 py-5 shadow-xs">
            {selectedSubPage === 'general' && <AssignmentTaskGeneralEdit />}
            {selectedSubPage === 'content' && <AssignmentTaskContentEdit />}
          </div>
        </div>
      ) : null}
      {Object.keys(assignmentTaskState.assignmentTask).length === 0 && (
        <div className="z-10 flex flex-1 flex-col bg-white pt-5 pr-10 pl-10 text-sm tracking-tight shadow-[0px_4px_16px_rgba(0,0,0,0.06)]">
          <div className="flex h-full items-center justify-center text-gray-300 antialiased">
            <div className="flex flex-col items-center space-y-2">
              <TentTree size={60} />
              <div className="py-1 text-2xl font-semibold">{t('noTaskSelected')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentTaskEditor;
