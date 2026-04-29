/**
 * Phase 1 passthrough registration for TYPE_ASSIGNMENT.
 *
 * Author → wraps existing AssignmentStudioRoute
 * Attempt → wraps existing StudentAssignmentActivity
 * Review → wraps existing GradingReviewWorkspace
 *
 * Phase 3 will replace Author with the shared StudioShell + assignment content panel.
 * Phase 4 will replace Attempt with the shared AttemptShell + assignment content panel.
 */

import type { ComponentType } from 'react';
import { registerKind, type KindAttemptProps, type KindReviewProps } from './index';

registerKind('TYPE_ASSIGNMENT', async () => {
  const [
    { default: AssignmentAuthor },
    { default: StudentAssignmentActivity },
    { default: GradingReviewWorkspace },
  ] = await Promise.all([
    import('./assignment-author'),
    import('@/features/assignments/student/StudentAssignmentActivity'),
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  const AttemptPassthrough: ComponentType<KindAttemptProps> = ({ activityUuid }) => {
    // This passthrough is a stub until Phase 4 migrates it to the unified Attempt shell.
    return <StudentAssignmentActivity activityUuid={activityUuid} />;
  };

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Assignment',
    iconName: 'ClipboardList',
    Author: AssignmentAuthor,
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
  };
});
