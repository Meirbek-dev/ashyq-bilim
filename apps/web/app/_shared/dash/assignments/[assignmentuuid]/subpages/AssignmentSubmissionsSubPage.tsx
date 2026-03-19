'use client';

import AssignmentSubmissionProvider from '@components/Contexts/Assignments/AssignmentSubmissionContext';
import { AssignmentsTaskProvider } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext';
import { useAssignmentSubmissions } from '@/hooks/useAssignmentSubmissions';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { SendHorizonal, UserCheck, X } from 'lucide-react';
import UserAvatar from '@components/Objects/UserAvatar';
import { useLocale, useTranslations } from 'next-intl'; // Import useLocale
import { useUserById } from '@/hooks/useUserById';
import { useEffect, useState } from 'react';

import EvaluateAssignment from './Modals/EvaluateAssignment';

const AssignmentSubmissionsSubPage = ({ assignment_uuid }: { assignment_uuid: string }) => {
  const t = useTranslations('DashPage.Assignments');

  const { data: assignmentSubmission } = useAssignmentSubmissions(assignment_uuid);

  useEffect(() => {
    console.log(assignmentSubmission);
  }, [assignmentSubmission]);

  const renderSubmissions = (status: string) => {
    return assignmentSubmission
      ?.filter((submission: any) => submission.submission_status === status)
      .map((submission: any, index: number) => (
        <SubmissionBox
          key={`${submission.submission_uuid}-${index}`}
          submission={submission}
          assignment_uuid={assignment_uuid}
          user_id={submission.user_id}
        />
      ));
  };

  return (
    <div className="mr-10 flex w-full flex-col pt-3 pl-10">
      <div className="flex w-full flex-row">
        <div className="flex-1">
          <div className="mx-auto my-5 flex w-fit items-center space-x-2 rounded-full bg-rose-600/80 px-3.5 py-1 text-sm font-bold text-white">
            <X size={18} />
            <h3>{t('late')}</h3>
          </div>
          <div className="flex flex-col gap-4">{renderSubmissions('LATE')}</div>
        </div>
        <div className="flex-1">
          <div className="mx-auto my-5 flex w-fit items-center space-x-2 rounded-full bg-amber-600/80 px-3.5 py-1 text-sm font-bold text-white">
            <SendHorizonal size={18} />
            <h3>{t('submitted')}</h3>
          </div>
          <div className="flex flex-col gap-4">{renderSubmissions('SUBMITTED')}</div>
        </div>
        <div className="flex-1">
          <div className="mx-auto my-5 flex w-fit items-center space-x-2 rounded-full bg-emerald-600/80 px-3.5 py-1 text-sm font-bold text-white">
            <UserCheck size={18} />
            <h3>{t('graded')}</h3>
          </div>
          <div className="flex flex-col gap-4">{renderSubmissions('GRADED')}</div>
        </div>
      </div>
    </div>
  );
};

const SubmissionBox = ({ assignment_uuid, user_id, submission }: any) => {
  const t = useTranslations('DashPage.Assignments');
  const [gradeSudmissionModal, setGradeSubmissionModal] = useState({
    open: false,
    submission_id: '',
  });
  const locale = useLocale();

  const { data: user } = useUserById(user_id);

  return (
    <div className="soft-shadow mx-auto flex w-[350px] flex-row rounded-lg bg-white p-4 shadow-[0px_4px_16px_rgba(0,0,0,0.06)]">
      <div className="flex w-full flex-col space-y-2">
        <div className="flex w-full justify-between">
          <h2 className="text-xs font-semibold tracking-tight text-slate-400 uppercase">{t('submission')}</h2>
          <p className="text-xs font-semibold tracking-tight uppercase">
            {new Date(submission.creation_date).toLocaleDateString(locale, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex justify-between space-x-2">
          <div className="flex space-x-2">
            <UserAvatar
              size="md"
              variant="outline"
              avatar_url={getUserAvatarMediaDirectory(user?.user_uuid, user?.avatar_image)}
              predefined_avatar={user?.avatar_image ? undefined : 'empty'}
            />
            <div className="flex flex-col">
              {user?.first_name && user?.last_name ? (
                <p className="text-sm font-semibold">
                  {[user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ')}
                </p>
              ) : (
                <p className="text-sm font-semibold">@{user?.username}</p>
              )}
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div className="flex flex-col">
            <Modal
              isDialogOpen={
                gradeSudmissionModal.open ? gradeSudmissionModal.submission_id === submission.submission_uuid : false
              }
              onOpenChange={(open: boolean) => {
                setGradeSubmissionModal({
                  open,
                  submission_id: submission.submission_uuid,
                });
              }}
              minHeight="lg"
              minWidth="lg"
              dialogContent={
                <AssignmentProvider assignment_uuid={`assignment_${assignment_uuid}`}>
                  <AssignmentsTaskProvider>
                    <AssignmentSubmissionProvider assignment_uuid={`assignment_${assignment_uuid}`}>
                      <EvaluateAssignment user_id={user_id} />
                    </AssignmentSubmissionProvider>
                  </AssignmentsTaskProvider>
                </AssignmentProvider>
              }
              dialogTitle={t('evaluateUser', { username: user?.username })}
              dialogDescription={t('evaluateSubmission')}
              dialogTrigger={
                <div className="cursor-pointer rounded bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">
                  {t('evaluate')}
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignmentSubmissionsSubPage;
