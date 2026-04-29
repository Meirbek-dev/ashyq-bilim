/**
 * Phase 1 passthrough registration for TYPE_CODE_CHALLENGE.
 *
 * Author → wraps CodeChallengeConfigEditor (currently mounted inline by ActivityClient).
 *          Phase 3 will move it to the shared StudioShell.
 * Attempt → wraps CodeChallengeActivity.
 *           Phase 4 will move it to the shared AttemptShell.
 * Review → wraps GradingReviewWorkspace.
 *          Phase 2 ensures code challenge submissions route through Submission.
 */

import type { ComponentType } from 'react';
import { registerKind, type KindAttemptProps, type KindReviewProps } from './index';

registerKind('TYPE_CODE_CHALLENGE', async () => {
  const [{ default: GradingReviewWorkspace }, { default: CodeChallengeAuthor }] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./code-challenge-author'),
  ]);

  /**
   * Phase 1 stub. CodeChallengeActivity is mounted by ActivityClient directly.
   */
  const AttemptPassthrough: ComponentType<KindAttemptProps> = () => null;

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Code Challenge',
    iconName: 'Code2',
    Author: CodeChallengeAuthor,
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
  };
});
