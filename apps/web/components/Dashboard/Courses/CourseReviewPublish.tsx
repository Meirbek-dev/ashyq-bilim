'use client';

import {
  CourseStatusBadge,
  courseWorkflowCardClass,
  courseWorkflowMutedPanelClass,
  courseWorkflowSummaryCardClass,
} from './courseWorkflowUi';
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { buildCourseWorkspacePath } from '@/lib/course-management';
import { useCourse } from '@components/Contexts/CourseContext';
import { updateCourseAccess } from '@services/courses/courses';
import { getAbsoluteUrl } from '@services/config/config';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function CourseReviewPublish({
  courseuuid,
  capabilities,
}: {
  courseuuid: string;
  capabilities: CourseWorkspaceCapabilities;
}) {
  const t = useTranslations('DashPage.CourseManagement.Review');
  const tReadiness = useTranslations('DashPage.CourseManagement.Readiness');
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;
  const course = useCourse();
  const { readiness } = course;
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const criticalReady = readiness.checklist
    .filter((item) => ['details', 'curriculum'].includes(item.id))
    .every((item) => item.complete);

  const toggleVisibility = () => {
    if (!(capabilities.canManageAccess && accessToken)) {
      return;
    }

    const wasPublic = course.courseStructure.public;

    startTransition(() => {
      void (async () => {
        try {
          setIsRefreshing(true);
          const response = await updateCourseAccess(
            course.courseStructure.course_uuid,
            { public: !wasPublic },
            accessToken,
            {
              lastKnownUpdateDate: course.courseStructure.update_date,
            },
          );

          if (!response.success) {
            const error: any = new Error(response.data?.detail || response.HTTPmessage || t('errors.accessUpdate'));
            error.status = response.status;
            error.detail = response.data?.detail;
            throw error;
          }

          await course.refreshCourseMeta();
          toast.success(wasPublic ? t('toasts.movedPrivate') : t('toasts.published'));
        } catch (error: any) {
          if (error?.status === 409) {
            course.showConflict(error?.detail || error?.message);
            return;
          }
          toast.error(error?.message || t('errors.visibilityUpdate'));
        } finally {
          setIsRefreshing(false);
        }
      })();
    });
  };

  return (
    <div className="space-y-6">
      <div className={`${courseWorkflowCardClass} p-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('sectionLabel')}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {readiness.readyToPublish ? t('readyTitle') : t('notReadyTitle')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t('description')}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={getAbsoluteUrl(`/course/${courseuuid}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="size-4" />
              {t('previewPublicPage')}
            </Button>
            {capabilities.canManageAccess ? (
              <Button
                onClick={toggleVisibility}
                disabled={isPending || isRefreshing || !criticalReady}
              >
                {isPending || isRefreshing ? <Loader2 className="size-4 animate-spin" /> : null}
                {course.courseStructure.public ? t('movePrivate') : t('publishCourse')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="text-sm font-semibold text-foreground">{t('readinessChecklist')}</div>
          <div className="mt-4 space-y-3">
            {readiness.checklist.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4"
              >
                <div>
                  <div className="font-medium text-foreground">{tReadiness(`checklist.${item.id}.title`)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {tReadiness(`checklist.${item.id}.description`)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <CourseStatusBadge status={item.complete ? 'ready' : 'needs-review'} />
                  {item.href ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<AppLink href={buildCourseWorkspacePath(courseuuid, item.href)} />}
                    >
                      {t('openAction')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className={courseWorkflowSummaryCardClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('launchState')}
              </div>
              <CourseStatusBadge status={course.courseStructure.public ? 'live' : 'private'} />
            </div>
            <div className="mt-3 text-3xl font-semibold text-foreground">
              {course.courseStructure.public ? t('launchStates.live') : t('launchStates.private')}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {course.courseStructure.public ? t('launchStateDescriptions.live') : t('launchStateDescriptions.private')}
            </div>
          </div>

          <div className={`${courseWorkflowCardClass} p-5`}>
            <div className="text-sm font-semibold text-foreground">{t('publishingNotes')}</div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <div className={courseWorkflowMutedPanelClass}>{t('notes.visibility')}</div>
              <div className={courseWorkflowMutedPanelClass}>{t('notes.curriculum')}</div>
              <div className={courseWorkflowMutedPanelClass}>{t('notes.review')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
