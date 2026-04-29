import CourseGradebook from '@/components/Grading/CourseGradebook';
import { isAssignmentsV2Enabled } from '@/features/assignments/flags';
import CourseGradebookCommandCenter from '@/features/grading/gradebook/CourseGradebookCommandCenter';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseGradebookPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'gradebook',
    children: isAssignmentsV2Enabled() ? (
      <CourseGradebookCommandCenter courseUuid={courseuuid} />
    ) : (
      <CourseGradebook courseUuid={courseuuid} />
    ),
  });
}
