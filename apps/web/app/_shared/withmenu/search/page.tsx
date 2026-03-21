import { getPlatformContextInfo } from '@/services/platform/platform';
import { getThumbnailMediaDirectory } from '@services/media/media';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import SearchPage from './search';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const t = await getTranslations('General');

  const platform = await getPlatformContextInfo();

  const searchQuery = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q || '';
  const searchType = Array.isArray(searchParams.type) ? searchParams.type[0] : searchParams.type || 'all';

  // Build dynamic title and description based on search parameters
  let title = `${t('search')} - Ashyq Bilim`;
  let description = `${t('searchContent')} ${platform.name}. ${t('discoverCourses')}, ${t('collections')}, ${t('andUsers')}.`;

  if (searchQuery) {
    title = `${t('searchResults')} "${searchQuery}" - Ashyq Bilim`;
    description = `${t('searchResultsFor')} "${searchQuery}" ${t('in')} ${platform.name}. ${t('findCourses')}, ${t('collections')}, ${t('andUsers')}.`;
  }

  if (searchType !== 'all' && searchType) {
    const typeLabel = t(searchType as 'courses' | 'collections' | 'users');
    title = searchQuery
      ? `${typeLabel} ${t('searchResults')} "${searchQuery}" - Ashyq Bilim`
      : `${typeLabel} - Ashyq Bilim`;
    description = searchQuery
      ? `${t('searchResultsFor')} "${searchQuery}" ${t('in')} ${typeLabel.toLowerCase()} ${t('at')} ${platform.name}.`
      : `${t('browse')} ${typeLabel.toLowerCase()} ${t('at')} ${platform.name}.`;
  }

  // SEO keywords
  const keywords = [
    platform.name,
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
      siteName: platform.name,
      images: [
        {
          url: getThumbnailMediaDirectory(platform?.thumbnail_image),
          width: 800,
          height: 600,
          alt: `${platform.name} - ${t('search')}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [getThumbnailMediaDirectory(platform?.thumbnail_image)],
    },
    alternates: {
      canonical: searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : `/search`,
    },
  };
}

const SearchPageWrapper = async () => {
  return (
    <div>
      <SearchPage />
    </div>
  );
};

export default SearchPageWrapper;
