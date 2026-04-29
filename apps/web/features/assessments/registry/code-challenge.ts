/**
 * Phase 1 passthrough registration for TYPE_CODE_CHALLENGE.
 *
 * Author → wraps CodeChallengeConfigEditor (currently mounted inline by ActivityClient).
 *          Phase 3 will move it to the shared StudioShell.
 * Attempt → renders the code challenge attempt content slot.
 * Review → wraps GradingReviewWorkspace.
 *          Phase 2 ensures code challenge submissions route through Submission.
 */

import type { ComponentType } from 'react';
import { registerKind, type KindAttemptProps, type KindReviewProps } from './index';

registerKind('TYPE_CODE_CHALLENGE', async () => {
  const [
    { default: GradingReviewWorkspace },
    { default: CodeChallengeAuthor },
    { default: CodeChallengeAttemptContent },
  ] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./code-challenge-author'),
    import('./code-challenge/CodeChallengeAttemptContent'),
  ]);

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Code Challenge',
    iconName: 'Code2',
    Author: CodeChallengeAuthor,
    Attempt: CodeChallengeAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  };
});
