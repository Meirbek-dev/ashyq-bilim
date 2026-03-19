import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import { getThumbnailMediaDirectory } from '@services/media/media';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import SearchPage from '@/app/_shared/withmenu/search/search';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const t = await getTranslations('General');
  const org = await getPlatformOrganizationContextInfo();
  const searchQuery = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q || '';
  const searchType = Array.isArray(searchParams.type) ? searchParams.type[0] : searchParams.type || 'all';

  let title = `${t('search')} - Ashyq Bilim`;
  let description = `${t('searchContent')} ${org.name}. ${t('discoverCourses')}, ${t('collections')}, ${t('andUsers')}.`;

  if (searchQuery) {
    title = `${t('searchResults')} "${searchQuery}" - Ashyq Bilim`;
    description = `${t('searchResultsFor')} "${searchQuery}" ${t('in')} ${org.name}. ${t('findCourses')}, ${t('collections')}, ${t('andUsers')}.`;
  }

  if (searchType !== 'all' && searchType) {
    const typeLabel = t(searchType as 'courses' | 'collections' | 'users');
    title = searchQuery
      ? `${typeLabel} ${t('searchResults')} "${searchQuery}" - Ashyq Bilim`
      : `${typeLabel} - Ashyq Bilim`;
    description = searchQuery
      ? `${t('searchResultsFor')} "${searchQuery}" ${t('in')} ${typeLabel.toLowerCase()} ${t('at')} ${org.name}.`
      : `${t('browse')} ${typeLabel.toLowerCase()} ${t('at')} ${org.name}.`;
  }

  const keywords = [
    org.name,
    t('search'),
    t('courses'),
    t('collections'),
    t('users'),
    t('learning'),
    t('education'),
    t('onlineLearning'),
    t('edu'),
    searchQuery,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    title,
    description,
    keywords,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        'index': true,
        'follow': true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: org.name,
      images: [
        {
          url: getThumbnailMediaDirectory(org?.thumbnail_image),
          width: 800,
          height: 600,
          alt: `${org.name} - ${t('search')}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [getThumbnailMediaDirectory(org?.thumbnail_image)],
    },
    alternates: {
      canonical: searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : '/search',
    },
  };
}

export default async function PlatformSearchPage() {
  return (
    <div>
      <SearchPage />
    </div>
  );
}
