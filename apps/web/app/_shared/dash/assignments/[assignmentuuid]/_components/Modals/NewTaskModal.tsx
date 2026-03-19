import { useAssignmentsTaskDispatch } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { createAssignmentTask } from '@services/courses/assignments';
import { AArrowUp, FileUp, ListTodo } from 'lucide-react';
import { getAPIUrl } from '@services/config/config';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { mutate } from 'swr';

const NewTaskModal = ({ closeModal, assignment_uuid }: any) => {
  const t = useTranslations('DashPage.Assignments.NewTaskModal');
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const assignmentTaskStateHook = useAssignmentsTaskDispatch();

  function showReminderToast() {
    // Check if the reminder has already been shown using sessionStorage
    if (sessionStorage.getItem('TasksReminderShown') !== 'true') {
      setTimeout(() => {
        toast(t('reminderToast'), {
          icon: '✋',
          duration: 10_000,
          style: { minWidth: 600 },
        });
        // Mark the reminder as shown in sessionStorage
        sessionStorage.setItem('TasksReminderShown', 'true');
      }, 3000);
    }
  }

  async function createTask(type: string) {
    const task_object = {
      title: t('untitledTaskTitle'),
      description: '',
      hint: '',
      reference_file: '',
      assignment_type: type,
      contents: {},
      max_grade_value: 100,
    };
    const res = await createAssignmentTask(task_object, assignment_uuid, access_token);
    toast.success(t('createSuccess'));
    showReminderToast();
    mutate(`${getAPIUrl()}assignments/${assignment_uuid}/tasks`);
    assignmentTaskStateHook({
      type: 'setSelectedAssignmentTaskUUID',
      payload: res.data.assignment_task_uuid,
    });
    closeModal(false);
  }

  return (
    <div className="mx-auto flex items-center justify-center space-x-6">
      <div
        onClick={() => createTask('QUIZ')}
        className="flex flex-col justify-center space-y-2 pt-10 text-center"
      >
        <div className="soft-shadow mx-auto w-fit cursor-pointer rounded-full bg-gray-100/50 px-5 py-5 text-gray-500 transition-all ease-linear hover:bg-gray-100">
          <ListTodo size={30} />
        </div>
        <p className="text-xl font-semibold text-gray-700">{t('quizTitle')}</p>
        <p className="w-40 text-sm text-gray-500">{t('quizDescription')}</p>
      </div>
      <div
        onClick={() => createTask('FILE_SUBMISSION')}
        className="flex flex-col justify-center space-y-2 pt-10 text-center"
      >
        <div className="soft-shadow mx-auto w-fit cursor-pointer rounded-full bg-gray-100/50 px-5 py-5 text-gray-500 transition-all ease-linear hover:bg-gray-100">
          <FileUp size={30} />
        </div>
        <p className="text-xl font-semibold text-gray-700">{t('fileSubmissionTitle')}</p>
        <p className="w-40 text-sm text-gray-500">{t('fileSubmissionDescription')}</p>
      </div>
      <div
        onClick={() => createTask('FORM')}
        className="flex flex-col justify-center space-y-2 pt-10 text-center"
      >
        <div className="soft-shadow mx-auto w-fit cursor-pointer rounded-full bg-gray-100/50 px-5 py-5 text-gray-500 transition-all ease-linear hover:bg-gray-100">
          <AArrowUp size={30} />
        </div>
        <p className="text-xl font-semibold text-gray-700">{t('formTitle')}</p>
        <p className="w-40 text-sm text-gray-500">{t('formDescription')}</p>
      </div>
    </div>
  );
};

export default NewTaskModal;
