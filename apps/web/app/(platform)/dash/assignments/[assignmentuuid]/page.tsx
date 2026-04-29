'use client';

import { useParams, useSearchParams } from 'next/navigation';

import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext';
import LegacyAssignmentEdit from '@/app/_shared/dash/assignments/[assignmentuuid]/page';
import AssignmentSubmissionsSubPage from '@/app/_shared/dash/assignments/[assignmentuuid]/subpages/AssignmentSubmissionsSubPage';
import { isAssignmentsV2Enabled } from '@/features/assignments/flags';
import AssignmentStudioRoute from '@/features/assignments/studio/AssignmentStudioShell';

const PlatformAssignmentPage = () => {
  const params = useParams<{ assignmentuuid: string }>();
  const searchParams = useSearchParams();
  const subpage = searchParams.get('subpage');

  if (!isAssignmentsV2Enabled()) {
    return <LegacyAssignmentEdit />;
  }

  if (subpage === 'submissions' || subpage === 'review') {
    return (
      <AssignmentProvider assignment_uuid={`assignment_${params.assignmentuuid}`}>
        <AssignmentSubmissionsSubPage assignment_uuid={params.assignmentuuid} />
      </AssignmentProvider>
    );
  }

  return <AssignmentStudioRoute assignmentUuid={params.assignmentuuid} />;
};

export default PlatformAssignmentPage;
