import {
  useAssignmentsTask,
  useAssignmentsTaskDispatch,
} from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { FileUp, ListTodo, PanelLeftOpen, Plus, Type } from 'lucide-react';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import NewTaskModal from './Modals/NewTaskModal';

const AssignmentTasks = ({ assignment_uuid }: any) => {
  const t = useTranslations('DashPage.Assignments.Tasks');
  const assignments = useAssignments();
  const assignmentTask = useAssignmentsTask();
  const assignmentTaskHook = useAssignmentsTaskDispatch();
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  async function setSelectTask(task_uuid: string) {
    assignmentTaskHook({
      type: 'setSelectedAssignmentTaskUUID',
      payload: task_uuid,
    });
  }

  return (
    <div className="flex h-full w-full overflow-auto">
      <div className="mx-auto flex flex-col space-y-3 p-4">
        {assignments?.assignment_tasks && assignments.assignment_tasks.length < 10 ? (
          <Modal
            isDialogOpen={isNewTaskModalOpen}
            onOpenChange={setIsNewTaskModalOpen}
            minHeight="sm"
            minWidth="sm"
            dialogContent={
              <NewTaskModal
                assignment_uuid={assignment_uuid}
                closeModal={setIsNewTaskModalOpen}
              />
            }
            dialogTitle={t('addTaskModalTitle')}
            dialogDescription={t('addTaskModalDescription')}
            dialogTrigger={
              <div className="bg-primary flex cursor-pointer items-center justify-center space-x-1 rounded-md px-3 py-2 text-xs font-semibold text-white antialiased">
                <Plus size={17} />
                <p>{t('addTask')}</p>
              </div>
            }
          />
        ) : null}
        {assignments?.assignment_tasks?.map((task: any) => {
          return (
            <div
              key={task.id}
              className="soft-shadow flex w-[250px] cursor-pointer flex-col rounded-md bg-white p-3 shadow-[0px_4px_16px_rgba(0,0,0,0.06)]"
              onClick={() => setSelectTask(task.assignment_task_uuid)}
            >
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center space-x-3">
                  <div className="text-gray-500">
                    {task.assignment_type === 'QUIZ' && <ListTodo size={15} />}
                    {task.assignment_type === 'FILE_SUBMISSION' && <FileUp size={15} />}
                    {task.assignment_type === 'FORM' && <Type size={15} />}
                  </div>
                  <div className="text-sm font-semibold">{task.title}</div>
                </div>
                <button
                  className={`outline-gray-200 ${task.assignment_task_uuid === assignmentTask.selectedAssignmentTaskUUID ? 'bg-slate-100' : ''} rounded-md px-3 py-2 font-bold text-gray-500 transition-all ease-linear hover:bg-slate-100/50`}
                >
                  <PanelLeftOpen size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AssignmentTasks;
