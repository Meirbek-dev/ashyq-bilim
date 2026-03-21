import NewCollection from '@/app/_shared/withmenu/collections/new/NewCollection';
import { getPlatformContextInfo } from '@/services/platform/platform';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('NewCollectionPage');
  const platform = await getPlatformContextInfo();

  return {
    title: `${t('metaTitle')} - Ashyq Bilim`,
    description: t('metaDescription', { platformName: 'Ashyq Bilim' }),
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
      description: t('metaDescription', { platformName: 'Ashyq Bilim' }),
      type: 'website',
      images: platform.thumbnail_image
        ? [
            {
              url: platform.thumbnail_image,
              width: 800,
              height: 600,
              alt: platform.name,
            },
          ]
        : [],
    },
  };
}

export default async function PlatformNewCollectionPage() {
  return <NewCollection />;
}
