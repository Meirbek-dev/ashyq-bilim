'use client';

import { AssignmentsTaskProvider } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext';
import { useTranslations } from 'next-intl';
import { LayoutList } from 'lucide-react';
import dynamic from 'next/dynamic';

import AssignmentTasks from '../_components/Tasks';

const AssignmentTaskEditor = dynamic(() => import('../_components/TaskEditor/TaskEditor'));

const AssignmentEditorSubPage = ({ assignmentuuid }: { assignmentuuid: string }) => {
  const t = useTranslations('DashPage.Assignments');

  return (
    <AssignmentsTaskProvider>
      <div className="custom-dots-bg flex h-full w-[350px] shrink-0 flex-col">
        <div className="mx-auto my-5 flex items-center space-x-2 rounded-full bg-neutral-600/80 px-3.5 py-1 text-sm font-bold text-white">
          <LayoutList size={18} />
          <p>{t('tasks')}</p>
        </div>
        <div className="min-h-0 flex-1">
          <AssignmentTasks assignment_uuid={`assignment_${assignmentuuid}`} />
        </div>
      </div>
      <div className="soft-shadow flex h-full min-h-0 w-full flex-1 bg-[#fefcfe]">
        <AssignmentProvider assignment_uuid={`assignment_${assignmentuuid}`}>
          <AssignmentTaskEditor page="general" />
        </AssignmentProvider>
      </div>
    </AssignmentsTaskProvider>
  );
};

export default AssignmentEditorSubPage;
