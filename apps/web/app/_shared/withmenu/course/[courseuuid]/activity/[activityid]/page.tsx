import { getActivityWithAuthHeader } from '@services/courses/activities';
import { getOptionalSession } from '@/lib/get-optional-session';
import { getCourseMetadata } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import { jetBrainsMono } from '@/lib/fonts';
import type { Metadata } from 'next';

import ActivityClient from './activity';

interface MetadataProps {
  params: Promise<{ courseuuid: string; activityid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Add this function at the top level to avoid duplicate fetches
async function fetchCourseMetadata(courseuuid: string, access_token: string | null | undefined) {
  return await getCourseMetadata(courseuuid, undefined, access_token || null);
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { courseuuid, activityid } = await props.params;
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token || null;
  const t = await getTranslations('General');
  void courseuuid;

  const course_meta = await fetchCourseMetadata(courseuuid, access_token);

  // Don't fetch activity if it's the end page
  const isCourseEnd = activityid === 'end';
  const activity = isCourseEnd ? null : await getActivityWithAuthHeader(activityid, undefined, access_token || null);

  // Localized page title
  const pageTitle = isCourseEnd
    ? t('courseEndTitle', { course: course_meta.name })
    : t('activityTitle', { activity: activity.name, course: course_meta.name });

  // SEO
  return {
    title: pageTitle,
    description: course_meta.description,
    keywords: course_meta.learnings,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        'index': true,
        'follow': true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: pageTitle,
      description: course_meta.description,
      publishedTime: course_meta.creation_date,
      tags: course_meta.learnings,
    },
  };
}

const ActivityPage = async (params: any) => {
  const { courseuuid, activityid } = await params.params;
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token || null;

  // Don't fetch activity if it's the end page
  const isCourseEnd = activityid === 'end';

  const [course_meta, activity] = await Promise.all([
    fetchCourseMetadata(courseuuid, access_token),
    isCourseEnd ? Promise.resolve(null) : getActivityWithAuthHeader(activityid, undefined, access_token || null),
  ]);

  return (
    <div className={jetBrainsMono.variable}>
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        activity={activity}
        course={course_meta}
      />
    </div>
  );
};

export default ActivityPage;
