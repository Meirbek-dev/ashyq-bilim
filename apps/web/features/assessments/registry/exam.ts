/**
 * Phase 1 passthrough registration for TYPE_EXAM.
 *
 * Author → wraps the existing in-activity manage tab (ExamActivity with manage phase).
 *          Phase 3 will move this to the shared StudioShell.
 * Attempt → wraps ExamActivity (student phases).
 *           Phase 4 will split the phase machine into shared Attempt shell.
 * Review → wraps GradingReviewWorkspace (same as assignment kind).
 *          Phase 2 wires exam attempts into the Submission table so this works.
 */

import type { ComponentType } from 'react';
import { registerKind, type KindAttemptProps, type KindReviewProps } from './index';

registerKind('TYPE_EXAM', async () => {
  const [{ default: GradingReviewWorkspace }, { default: ExamReviewDetail }, { default: ExamAuthor }] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./exam-review-detail'),
    import('./exam-author'),
  ]);

  /**
   * Phase 1 stub. ExamActivity is mounted by ActivityClient directly.
   * Until Phase 4, the attempt route for exams stays at /course/[c]/activity/[a].
   */
  const AttemptPassthrough: ComponentType<KindAttemptProps> = () => null;

  /**
   * Phase 2 target: once ExamAttempt rows are projected to Submission, this
   * will work identically to the assignment Review passthrough.
   * Phase 1: renders the workspace but exam submissions may not appear until
   * the backend projection lands.
   */
  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Exam',
    iconName: 'GraduationCap',
    Author: ExamAuthor,
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
    ReviewDetail: ExamReviewDetail,
  };
});
