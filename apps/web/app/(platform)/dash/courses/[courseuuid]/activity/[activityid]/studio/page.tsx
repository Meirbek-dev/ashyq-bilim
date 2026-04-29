import AssessmentStudioWorkspace from '@/features/assessments/studio/AssessmentStudioWorkspace';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformAssessmentStudioPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>;
}) {
  const { courseuuid, activityid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: (
      <AssessmentStudioWorkspace
        courseUuid={courseuuid}
        activityUuid={activityid}
      />
    ),
  });
}
