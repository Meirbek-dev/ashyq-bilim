'use client';

import CodeChallengeConfigEditor from '@components/features/courses/code-challenges/CodeChallengeConfigEditor';
import type { KindAuthorProps } from './index';

export default function CodeChallengeAuthor({ activityUuid, courseUuid }: KindAuthorProps) {
  return (
    <div className="p-4 lg:p-6">
      <CodeChallengeConfigEditor
        activityUuid={activityUuid}
        courseId={courseUuid}
      />
    </div>
  );
}
