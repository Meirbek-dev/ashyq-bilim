'use client';
import { BookOpen, BookX, EllipsisVertical, Eye, Layers2, Monitor, Pencil, UserRoundPen } from 'lucide-react';
import EditAssignmentModal from '@components/Objects/Modals/Activities/Assignments/EditAssignmentModal';
import { AssignmentProvider, useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import BreadCrumbs from '@components/Dashboard/Misc/BreadCrumbs';
import { updateAssignment } from '@services/courses/assignments';
import { updateActivity } from '@services/courses/activities';
import { useParams, useSearchParams } from 'next/navigation';
import { getAPIUrl } from '@services/config/config';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';

import AssignmentEditorSubPage from '@/app/_shared/dash/assignments/[assignmentuuid]/subpages/AssignmentEditorSubPage';

const AssignmentSubmissionsSubPage = dynamic(
  () => import('@/app/_shared/dash/assignments/[assignmentuuid]/subpages/AssignmentSubmissionsSubPage'),
);

const PlatformAssignmentPage = () => {
  const t = useTranslations('DashPage.Assignments.AssignmentPage');
  const params = useParams<{ assignmentuuid: string }>();
  const searchParams = useSearchParams();
  const [selectedSubPage, setSelectedSubPage] = useState(searchParams.get('subpage') || 'editor');
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f8f8f8] p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md">
          <h2 className="mb-4 text-xl font-bold">{t('desktopOnlyTitle')}</h2>
          <Monitor
            className="mx-auto my-5"
            size={60}
          />
          <p>{t('desktopOnlyMessage1')}</p>
          <p>{t('desktopOnlyMessage2')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <AssignmentProvider assignment_uuid={`assignment_${params.assignmentuuid}`}>
        <div className="soft-shadow z-10 flex shrink-0 flex-col bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.06)]">
          <div className="mr-10 flex h-full justify-between">
            <div className="mr-10 pl-10 tracking-tighter">
              <BrdCmpx />
              <div className="flex w-100 justify-between">
                <div className="flex text-2xl font-bold">
                  <div className="flex items-center gap-2">{t('assignmentTools')}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center antialiased">
              <PublishingState />
            </div>
          </div>
          <div className="mr-10 flex space-x-2 pt-2 pl-10 text-sm font-semibold tracking-tight">
            <div
              onClick={() => {
                setSelectedSubPage('editor');
              }}
              className={`border-primary flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                selectedSubPage === 'editor' ? 'border-b-4' : 'opacity-50'
              } cursor-pointer`}
            >
              <div className="mx-2 flex items-center space-x-2.5">
                <Layers2 size={16} />
                <div>{t('editor')}</div>
              </div>
            </div>
            <div
              onClick={() => {
                setSelectedSubPage('submissions');
              }}
              className={`border-primary flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                selectedSubPage === 'submissions' ? 'border-b-4' : 'opacity-50'
              } cursor-pointer`}
            >
              <div className="mx-2 flex items-center space-x-2.5">
                <UserRoundPen size={16} />
                <div>{t('submissions')}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 w-full flex-1">
          {selectedSubPage === 'editor' && <AssignmentEditorSubPage assignmentuuid={params.assignmentuuid} />}
          {selectedSubPage === 'submissions' && (
            <AssignmentSubmissionsSubPage assignment_uuid={params.assignmentuuid} />
          )}
        </div>
      </AssignmentProvider>
    </div>
  );
};

export default PlatformAssignmentPage;

const BrdCmpx = () => {
  const assignment = useAssignments();

  return (
    <BreadCrumbs
      type="assignments"
      last_breadcrumb={assignment?.assignment_object?.title}
    />
  );
};

const PublishingState = () => {
  const t = useTranslations('DashPage.Assignments.AssignmentPage');
  const assignment = useAssignments();
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  async function updateAssignmentPublishState(assignmentUUID: string) {
    const res = await updateAssignment(
      { published: !assignment?.assignment_object?.published },
      assignmentUUID,
      access_token,
    );
    const res2 = await updateActivity(
      { published: !assignment?.assignment_object?.published },
      assignment?.activity_object?.activity_uuid,
      access_token,
    );
    const toast_loading = toast.loading(t('updateLoading'));
    if (res.success && res2) {
      mutate(`${getAPIUrl()}assignments/${assignmentUUID}`);
      toast.success(t('updateSuccess'));
      toast.dismiss(toast_loading);
    } else {
      toast.error(t('updateError'));
    }
  }

  return (
    <>
      <div className="mx-auto mt-5 flex items-center space-x-4">
        <div
          className={`mx-auto flex rounded-full px-3.5 py-2 text-xs font-bold text-nowrap outline-1 ${!assignment?.assignment_object?.published ? 'bg-gray-200/60 outline-gray-300' : 'bg-green-200/60 outline-green-300'}`}
        >
          {assignment?.assignment_object?.published ? t('published') : t('unpublished')}
        </div>
        <div>
          <EllipsisVertical
            className="text-gray-500"
            size={13}
          />
        </div>

        <ToolTip
          side="left"
          slateBlack
          sideOffset={10}
          content={t('editDetailsTooltip')}
        >
          <div
            onClick={() => {
              setIsEditModalOpen(true);
            }}
            className="flex cursor-pointer items-center space-x-2 rounded-md border bg-background px-3 py-2 font-medium text-foreground shadow-sm hover:bg-accent"
          >
            <Pencil size={18} />
            <p className="text-sm font-bold">{t('edit')}</p>
          </div>
        </ToolTip>

        <ToolTip
          side="left"
          slateBlack
          sideOffset={10}
          content={t('previewTooltip')}
        >
          <Link
            target="_blank"
            href={`/course/${assignment?.course_object?.course_uuid.replace('course_', '')}/activity/${assignment?.activity_object?.activity_uuid.replace('activity_', '')}`}
            className="flex cursor-pointer items-center space-x-2 rounded-md border bg-background px-3 py-2 font-medium text-foreground shadow-sm hover:bg-accent"
          >
            <Eye size={18} />
            <p className="text-sm font-bold">{t('preview')}</p>
          </Link>
        </ToolTip>
        {assignment?.assignment_object?.published ? (
          <ToolTip
            side="left"
            slateBlack
            sideOffset={10}
            content={t('unpublishTooltip')}
          >
            <div
              onClick={() => updateAssignmentPublishState(assignment?.assignment_object?.assignment_uuid)}
              className="flex cursor-pointer items-center space-x-2 rounded-md border bg-background px-3 py-2 font-medium text-foreground shadow-sm hover:bg-accent"
            >
              <BookX size={18} />
              <p className="text-sm font-bold">{t('unpublish')}</p>
            </div>
          </ToolTip>
        ) : null}
        {!assignment?.assignment_object?.published && (
          <ToolTip
            side="left"
            slateBlack
            sideOffset={10}
            content={t('publishTooltip')}
          >
            <div
              onClick={() => updateAssignmentPublishState(assignment?.assignment_object?.assignment_uuid)}
              className="flex cursor-pointer items-center space-x-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <BookOpen size={18} />
              <p className="text-sm font-bold">{t('publish')}</p>
            </div>
          </ToolTip>
        )}
      </div>
      {isEditModalOpen ? (
        <EditAssignmentModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
          }}
          assignment={assignment?.assignment_object}
          accessToken={access_token}
        />
      ) : null}
    </>
  );
};
