/**
 * Registry module for TYPE_EXAM.
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAttemptProps, KindReviewProps } from './index';

registerKind('TYPE_EXAM', async () => {
  const [
    { default: GradingReviewWorkspace },
    { default: ExamReviewDetail },
    { default: ExamAuthor },
    { default: ExamAttemptContent },
  ] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./exam-review-detail'),
    import('./exam-author'),
    import('./exam/ExamAttemptContent'),
  ]);

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Exam',
    iconName: 'GraduationCap',
    Author: ExamAuthor,
    Attempt: ExamAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
    ReviewDetail: ExamReviewDetail,
  };
});
