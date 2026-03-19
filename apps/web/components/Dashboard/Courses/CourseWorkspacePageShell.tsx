'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  BookCopy,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileCog,
  FileStack,
  Globe,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import CourseConflictDialog from '@components/Dashboard/Pages/Course/CourseConflictDialog';
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server';
import { CourseProvider, useCourse } from '@components/Contexts/CourseContext';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { CourseWorkspaceStage } from '@/lib/course-management';
import { buildCourseWorkspacePath } from '@/lib/course-management';
import { getAbsoluteUrl } from '@services/config/config';
import { CourseStatusBadge } from './courseWorkflowUi';
import { Button } from '@/components/ui/button';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CourseWorkspacePageShellProps {
  courseuuid: string;
  activeStage: CourseWorkspaceStage;
  initialCourse: any;
  capabilities: CourseWorkspaceCapabilities;
  children: ReactNode;
}

function CourseWorkspaceChrome({
  courseuuid,
  activeStage,
  capabilities,
  children,
}: Omit<CourseWorkspacePageShellProps, 'initialCourse'>) {
  const t = useTranslations('DashPage.CourseManagement.Workspace');
  const course = useCourse();
  const hasDirtySections = Object.values(course.dirtySections).some(Boolean);
  const { readiness } = course;
  const unsavedChangesGuard = useUnsavedChangesGuard(hasDirtySections, {
    interceptInAppNavigation: true,
    message: t('unsavedChangesWarning'),
  });
  const stageConfig = [
    { key: 'overview', label: t('tabs.overview'), icon: LayoutDashboard, capability: 'canViewWorkspace' },
    { key: 'details', label: t('tabs.details'), icon: FileCog, capability: 'canEditDetails' },
    { key: 'curriculum', label: t('tabs.curriculum'), icon: FileStack, capability: 'canEditCurriculum' },
    { key: 'access', label: t('tabs.access'), icon: Globe, capability: 'canManageAccess' },
    { key: 'collaboration', label: t('tabs.collaboration'), icon: Users, capability: 'canManageCollaboration' },
    { key: 'certificate', label: t('tabs.certificate'), icon: Sparkles, capability: 'canManageCertificate' },
    { key: 'review', label: t('tabs.reviewPublish'), icon: CheckCircle2, capability: 'canReviewCourse' },
  ] as const;
  const visibleStages = stageConfig.filter((stage) => capabilities[stage.capability]);

  return (
    <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
      <CourseConflictDialog />
      <AlertDialog
        open={unsavedChangesGuard.isPromptOpen}
        onOpenChange={(open) => {
          if (!open) unsavedChangesGuard.cancelNavigation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="rounded-lg bg-muted/80 p-3 text-foreground dark:bg-muted/60">
              <AlertTriangle className="size-8" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('unsavedDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{unsavedChangesGuard.promptMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('unsavedDialogStay')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={unsavedChangesGuard.confirmNavigation}
            >
              {t('unsavedDialogLeave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="sticky top-0 z-20 border-b border-border bg-background shadow-sm">
        {/* Title row */}
        <div className="flex h-16 items-center gap-4 px-4 lg:px-8">
          {/* Breadcrumb */}
          <AppLink
            href="/dash/courses"
            className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          >
            <BookCopy className="size-4 shrink-0" />
            <span className="hidden sm:inline">{t('breadcrumb')}</span>
          </AppLink>

          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />

          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground dark:text-foreground">
            {course.courseStructure.name || t('untitledCourse')}
          </h1>

          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <CourseStatusBadge status={course.courseStructure.public ? 'public' : 'private'} />
            <CourseStatusBadge status={readiness.readyToPublish ? 'ready' : 'needs-review'} />
            {hasDirtySections ? <CourseStatusBadge status="unsaved" /> : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {activeStage !== 'review' ? (
              <Button
                size="sm"
                nativeButton={false}
                variant="ghost"
                render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'review')} />}
                className="gap-2"
              >
                <ShieldCheck className="size-4" />
                <span className="hidden sm:inline">{t('reviewButton')}</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              nativeButton={false}
              variant="outline"
              render={<a href={getAbsoluteUrl(`/course/${courseuuid}`)} />}
              className="gap-2"
            >
              <Eye className="size-4" />
              <span className="hidden sm:inline">{t('previewButton')}</span>
            </Button>
          </div>
        </div>

        {/* Tab nav row */}
        <div className="flex h-12 items-end gap-0 overflow-x-auto border-t border-border/50 px-4 lg:px-8">
          {visibleStages.map((stage) => {
            const Icon = stage.icon;
            const isActive = stage.key === activeStage;
            return (
              <AppLink
                key={stage.key}
                href={buildCourseWorkspacePath(courseuuid, stage.key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-full shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'border-primary text-foreground dark:border-primary dark:text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
                <span className="whitespace-nowrap hidden sm:inline">{stage.label}</span>
                {stage.key === 'review' && !readiness.readyToPublish && readiness.issues.length > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-xs font-semibold text-destructive dark:bg-destructive/20 dark:text-destructive">
                    {readiness.issues.length}
                  </span>
                ) : null}
              </AppLink>
            );
          })}
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">{children}</main>
    </div>
  );
}

export default function CourseWorkspacePageShell({
  courseuuid,
  activeStage,
  initialCourse,
  capabilities,
  children,
}: CourseWorkspacePageShellProps) {
  return (
    <CourseProvider
      courseuuid={`course_${courseuuid}`}
      withUnpublishedActivities
      initialCourse={initialCourse}
    >
      <CourseWorkspaceChrome
        courseuuid={courseuuid}
        activeStage={activeStage}
        capabilities={capabilities}
      >
        {children}
      </CourseWorkspaceChrome>
    </CourseProvider>
  );
}
