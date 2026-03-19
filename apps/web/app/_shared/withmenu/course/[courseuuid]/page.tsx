import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getOptionalSession } from '@/lib/get-optional-session';
import { getCourseMetadata } from '@services/courses/courses';
import type { Metadata } from 'next';

import CourseClient from './course';

interface MetadataProps {
  params: Promise<{ courseuuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token;

  // Get Org context information
  const org = await getPlatformOrganizationContextInfo();
  const course_meta = await getCourseMetadata(params.courseuuid, undefined, access_token || null);

  // SEO
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

const CoursePage = async (params: any) => {
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token;

  const { courseuuid } = await params.params;

  // Fetch course metadata once
  const course_meta = await getCourseMetadata(courseuuid, undefined, access_token || null);

  return (
    <CourseClient
      courseuuid={courseuuid}
      course={course_meta}
      access_token={access_token}
    />
  );
};

export default CoursePage;
