import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import NewCollection from '@/app/_shared/withmenu/collections/new/NewCollection';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('NewCollectionPage');
  const org = await getPlatformOrganizationContextInfo();

  return {
    title: `${t('metaTitle')} - Ashyq Bilim`,
    description: t('metaDescription', { orgName: 'Ashyq Bilim' }),
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
      title: `${t('metaTitle')} - Ashyq Bilim`,
      description: t('metaDescription', { orgName: 'Ashyq Bilim' }),
      type: 'website',
      images: org.thumbnail_image
        ? [
            {
              url: org.thumbnail_image,
              width: 800,
              height: 600,
              alt: org.name,
            },
          ]
        : [],
    },
  };
}

export default async function PlatformNewCollectionPage() {
  return <NewCollection />;
}
