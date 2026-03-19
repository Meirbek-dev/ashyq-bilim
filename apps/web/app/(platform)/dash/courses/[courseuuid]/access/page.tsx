import EditCourseAccess from '@components/Dashboard/Pages/Course/EditCourseAccess/EditCourseAccess';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseAccessPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'access',
    children: <EditCourseAccess />,
  });
}
