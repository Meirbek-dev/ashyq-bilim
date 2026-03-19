'use client';

import {
  CourseStatusBadge,
  courseWorkflowCardClass,
  courseWorkflowMutedPanelClass,
  courseWorkflowSummaryCardClass,
} from './courseWorkflowUi';
import { AlertTriangle, ArrowRight, CheckCircle2, FileStack, Globe, Users } from 'lucide-react';
import { buildCourseWorkspacePath, getCourseContentStats } from '@/lib/course-management';
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCourse } from '@components/Contexts/CourseContext';
import { Button } from '@/components/ui/button';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';

export default function CourseWorkspaceOverview({
  courseuuid,
  capabilities,
}: {
  courseuuid: string;
  capabilities: CourseWorkspaceCapabilities;
}) {
  const t = useTranslations('DashPage.CourseManagement.Overview');
  const tReadiness = useTranslations('DashPage.CourseManagement.Readiness');
  const course = useCourse();
  const stats = getCourseContentStats(course.courseStructure);
  const { readiness } = course;
  const contributors = course.editorData.contributors.data ?? [];
  const certifications = course.editorData.certifications.data ?? [];
  const linkedUserGroups = course.editorData.linkedUserGroups.data ?? [];
  const isPrivateWithNoGroups = !course.courseStructure.public && linkedUserGroups.length === 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className={`${courseWorkflowCardClass} p-6`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('readyLabel')}
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {readiness.readyToPublish ? t('readyTitle') : t('notReadyTitle')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {readiness.readyToPublish ? t('readyDescription') : t('notReadyDescription')}
              </p>
            </div>
            <CourseStatusBadge status={readiness.readyToPublish ? 'ready' : 'needs-review'} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {capabilities.canEditCurriculum ? (
              <Button
                nativeButton={false}
                render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'curriculum')} />}
              >
                {t('openCurriculum')}
              </Button>
            ) : null}
          </div>
          {capabilities.canReviewCourse ? (
            <div className="mt-4 text-sm text-muted-foreground">
              <AppLink
                href={buildCourseWorkspacePath(courseuuid, 'review')}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {t('reviewReadiness')}
              </AppLink>
            </div>
          ) : null}
        </div>

        <div className={courseWorkflowSummaryCardClass}>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('workspacePulse')}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-muted-foreground">{t('chapters')}</div>
              <div className="mt-1 text-3xl font-semibold text-foreground">{stats.chapters}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-muted-foreground">{t('activities')}</div>
              <div className="mt-1 text-3xl font-semibold text-foreground">{stats.activities}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-muted-foreground">{t('contributors')}</div>
              <div className="mt-1 text-3xl font-semibold text-foreground">{contributors.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-4" />
            {t('readinessChecklist')}
          </div>
          <div className="mt-4 space-y-3">
            {readiness.checklist.map((item) => (
              <AppLink
                key={item.id}
                href={buildCourseWorkspacePath(courseuuid, (item.href) || 'overview')}
                className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <CourseStatusBadge status={item.complete ? 'ready' : 'needs-review'} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{tReadiness(`checklist.${item.id}.title`)}</div>
                  <div className="text-sm text-muted-foreground">{tReadiness(`checklist.${item.id}.description`)}</div>
                </div>
                <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </AppLink>
            ))}
          </div>
        </div>

        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileStack className="size-4" />
            {t('curriculumSnapshot')}
          </div>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className={courseWorkflowMutedPanelClass}>
              <div className="font-medium text-foreground">{t('chapterCount', { count: stats.chapters })}</div>
              <div className="mt-1">{t('activityCountDescription', { count: stats.activities })}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="font-medium text-foreground">{t('nextStep')}</div>
              <div className="mt-1">{t('nextStepDescription')}</div>
            </div>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            className="mt-4 w-full justify-between"
            render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'curriculum')} />}
          >
            {t('openCurriculum')}
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="size-4" />
            {t('governanceSnapshot')}
          </div>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className={courseWorkflowMutedPanelClass}>
              <div className="font-medium text-foreground">{t('sections.access')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                {course.courseStructure.public ? t('access.publicState') : t('access.privateState')}
              </div>
              {isPrivateWithNoGroups && capabilities.canManageAccess ? (
                <Alert className="mt-2 border-border bg-muted py-2 text-foreground">
                  <AlertTriangle className="size-3.5" />
                  <AlertDescription className="text-xs text-muted-foreground">
                    {t.rich('access.privateNoGroupsWarning', {
                      link: (chunks) => (
                        <AppLink
                          href={buildCourseWorkspacePath(courseuuid, 'access')}
                          className="font-semibold underline underline-offset-2"
                        >
                          {chunks}
                        </AppLink>
                      ),
                    })}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="font-medium text-foreground">{t('sections.collaboration')}</div>
              <div className="mt-1">{t('collaboration.loadedRecords', { count: contributors.length })}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="font-medium text-foreground">{t('sections.certificate')}</div>
              <div className="mt-1">
                {certifications.length > 0 ? t('certificate.configured') : t('certificate.notConfigured')}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
