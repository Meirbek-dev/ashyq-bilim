import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import { getThumbnailMediaDirectory } from '@services/media/media';
import { getOptionalSession } from '@/lib/get-optional-session';
import { getCourses } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import Courses from '@/app/_shared/withmenu/courses/courses';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('General');
  const org = await getPlatformOrganizationContextInfo();

  return {
    title: `${t('courses')} - Ashyq Bilim`,
    description: org.description,
    keywords: `${org.name}, ${org.description}, ${t('courses')}, ${t('learning')}, ${t('education')}, ${t('onlineLearning')}, ${t('edu')}, ${t('onlineCourses')}, ${org.name} ${t('courses')}`,
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
      title: `${t('courses')} - Ashyq Bilim`,
      description: org.description,
      type: 'website',
      images: [
        {
          url: getThumbnailMediaDirectory(org?.thumbnail_image),
          width: 800,
          height: 600,
          alt: org.name,
        },
      ],
    },
  };
}

export default async function PlatformCoursesPage() {
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token;
  const { courses, total } = await getCourses(null, access_token || null);

  return (
    <div>
      <Courses
        courses={courses}
        totalCourses={total}
      />
    </div>
  );
}
