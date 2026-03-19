import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';
import CourseWorkspaceOverview from '@components/Dashboard/Courses/CourseWorkspaceOverview';
import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server';

export default function PlatformCourseWorkspacePage(props: { params: Promise<{ courseuuid: string }> }) {
  return <PlatformCourseWorkspacePageInner params={props.params} />;
}

async function PlatformCourseWorkspacePageInner(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;
  const capabilities = await requireCourseWorkspaceStageAccess(courseuuid, 'overview');

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'overview',
    capabilities,
    children: (
      <CourseWorkspaceOverview
        courseuuid={courseuuid}
        capabilities={capabilities}
      />
    ),
  });
}
