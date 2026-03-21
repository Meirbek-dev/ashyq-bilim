import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getPlatformContextInfo } from '@/services/platform/platform';
import { getOptionalSession } from '@/lib/get-optional-session';
import { getCourseMetadata } from '@services/courses/courses';
import type { Metadata } from 'next';

import CourseClient from '@/app/_shared/withmenu/course/[courseuuid]/course';

interface MetadataProps {
  params: Promise<{ courseuuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token;
  const platform = await getPlatformContextInfo();
  const course_meta = await getCourseMetadata(params.courseuuid, undefined, access_token || null);

  return {
    title: `${course_meta.name} - Ashyq Bilim`,
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
      title: `${course_meta.name} - Ashyq Bilim`,
      description: course_meta.description || '',
      images: [
        {
          url: getCourseThumbnailMediaDirectory(course_meta?.course_uuid, course_meta?.thumbnail_image),
          width: 800,
          height: 600,
          alt: course_meta.name,
        },
      ],
      type: 'article',
      publishedTime: course_meta.creation_date || '',
      tags: course_meta.learnings || [],
    },
  };
}

export default async function PlatformCoursePage(props: { params: Promise<{ courseuuid: string }> }) {
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token;
  const { courseuuid } = await props.params;
  const course_meta = await getCourseMetadata(courseuuid, undefined, access_token || null);

  return (
    <CourseClient
      courseuuid={courseuuid}
      course={course_meta}
      access_token={access_token}
    />
  );
}
