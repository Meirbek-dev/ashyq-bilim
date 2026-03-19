'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';

import { PlatformContextProvider } from '@/components/Contexts/PlatformContext';
import { updateActivity } from '@services/courses/activities';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { toast } from 'sonner';

import Editor from './Editor';

interface EditorWrapperProps {
  content: string;
  activity: any;
  course: any;
  org: any;
}

const EditorWrapper = (props: EditorWrapperProps): JSX.Element => {
  const t = useTranslations('DashPage.Editor.EditorWrapper');
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const isReady = !session.isLoading;

  async function setContent(content: any) {
    const { activity } = props;

    // CRITICAL: Deep clone and ensure plain object before server action call
    // Next.js server action serialization can corrupt Tiptap JSON if not plain
    const plainContent = structuredClone(content);
    const updatedActivity = { ...activity, content: plainContent };

    toast.promise(
      updateActivity(updatedActivity, activity.activity_uuid, access_token).then((res) => {
        if (!res.success) {
          throw res;
        }
        return res;
      }),
      {
        loading: t('saving'),
        success: () => <b>{t('saveSuccess')}</b>,
        error: (err) => {
          const errorMessage = err?.data?.detail || err?.data?.message || t('saveError');
          const status = err?.status;
          return <b>{status ? t('detailedSaveError', { status, message: errorMessage }) : errorMessage}</b>;
        },
      },
    );
  }

  return (
    <PlatformContextProvider initialOrg={props.org}>
      {isReady ? (
        <Editor
          org={props.org}
          course={props.course}
          activity={props.activity}
          content={props.content}
          setContent={setContent}
          session={session}
        />
      ) : null}
    </PlatformContextProvider>
  );
};

export default EditorWrapper;
