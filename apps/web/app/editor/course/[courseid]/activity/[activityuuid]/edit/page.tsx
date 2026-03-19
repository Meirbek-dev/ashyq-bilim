import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext';
import { getOrganizationContextInfo } from '@/services/platform/platform';
import { getActivityWithAuthHeader } from '@services/courses/activities';
import AIEditorProvider from '@components/Contexts/AI/AIEditorContext';
import EditorWrapper from '@components/Objects/Editor/EditorWrapper';
import { getCourseMetadata } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import { jetBrainsMono } from '@/lib/fonts';
import { connection } from 'next/server';
import type { Metadata } from 'next';
import { auth } from '@/auth';

interface MetadataProps {
  params: Promise<{ courseid: string; activityid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  await connection();
  const params = await props.params;
  const session = await auth();
  const access_token = session?.tokens?.access_token;
  const t = await getTranslations('DashPage.Editor');

  const course_meta = await getCourseMetadata(params.courseid, undefined, access_token ?? null);

  return {
    title: t('metaTitleEdit', { activityName: course_meta.name }),
    description: course_meta.mini_description,
  };
}

const EditActivity = async (props: { params: Promise<{ courseid: string; activityuuid: string }> }) => {
  await connection();
  const params = await props.params;
  const session = await auth();
  const access_token = session?.tokens?.access_token ?? null;
  const { activityuuid, courseid } = params;

  const [courseInfo, activity] = await Promise.all([
    getCourseMetadata(courseid, undefined, access_token),
    getActivityWithAuthHeader(activityuuid, undefined, access_token),
  ]);

  const org = await getOrganizationContextInfo(undefined, access_token || '');

  return (
    <div className={jetBrainsMono.variable}>
      <EditorOptionsProvider options={{ isEditable: true }}>
        <AIEditorProvider>
          <EditorWrapper
            org={org}
            course={courseInfo}
            activity={activity}
            content={activity.content}
          />
        </AIEditorProvider>
      </EditorOptionsProvider>
    </div>
  );
};

export default EditActivity;
