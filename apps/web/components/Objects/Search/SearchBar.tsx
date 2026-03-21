'use client';
import {
  ArrowRight,
  ArrowUpRight,
  Book,
  GraduationCap,
  ScanSearch,
  Search,
  Sparkles,
  TextSearch,
  Users,
} from 'lucide-react';
import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { removeCoursePrefix } from '../Thumbnails/CourseThumbnail';
import type { ChangeEvent, FC, KeyboardEvent } from 'react';
import { getAbsoluteUrl } from '@services/config/config';
import { searchContent } from '@services/search/search';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import UserAvatar from '../UserAvatar';

interface User {
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  avatar_image: string;
  bio: string;
  details: Record<string, any>;
  profile: Record<string, any>;
  id: number;
  user_uuid: string;
}

interface Author {
  user: User;
  authorship: string;
  authorship_status: string;
  creation_date: string;
  update_date: string;
}

interface Course {
  name: string;
  description: string;
  about: string;
  learnings: string;
  tags: string;
  thumbnail_image: string;
  public: boolean;
  open_to_contributors: boolean;
  id: number;
  authors: Author[];
  course_uuid: string;
  creation_date: string;
  update_date: string;
}

interface Collection {
  name: string;
  public: boolean;
  description: string;
  id: number;
  courses: string[];
  collection_uuid: string;
  creation_date: string;
  update_date: string;
}

interface SearchResults {
  courses: Course[];
  collections: Collection[];
  users: User[];
}

interface SearchBarProps {
  className?: string;
  isMobile?: boolean;
  showSearchSuggestions?: boolean;
}

const CourseResultsSkeleton = () => (
  <div className="p-2">
    <div className="flex items-center gap-2 px-2 py-2">
      <div className="h-4 w-4 animate-pulse rounded bg-black/5" />
      <div className="h-4 w-20 animate-pulse rounded bg-black/5" />
    </div>
    {[1, 2].map((i) => (
      <div
        key={i}
        className="flex items-center gap-3 p-2"
      >
        <div className="h-10 w-10 animate-pulse rounded-lg bg-black/5" />
        <div className="flex-1">
          <div className="mb-2 h-4 w-48 animate-pulse rounded bg-black/5" />
          <div className="h-3 w-32 animate-pulse rounded bg-black/5" />
        </div>
      </div>
    ))}
  </div>
);

export const SearchBar: FC<SearchBarProps> = ({ className = '', isMobile = false, showSearchSuggestions = false }) => {
  const t = useTranslations('Components.SearchBar');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({
    courses: [],
    collections: [],
    users: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;
  const platform = usePlatform();
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Debounce the search query value
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const handleClickOutside = useEffectEvent((event: MouseEvent) => {
    if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
      setShowResults(false);
    }
  });

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const currentQuery = debouncedSearch.trim();

    if (currentQuery.length === 0) {
      setSearchResults({ courses: [], collections: [], users: [] });
      setIsLoading(false);
      setIsInitialLoad(false);
      return () => {};
    }

    setIsLoading(true);

    (async () => {
      try {
        const response = await searchContent(currentQuery, 1, 3, null, accessToken);
        if (controller.signal.aborted) return;

        // Type assertion and safe access
        const typedResponse = response.data;

        // Ensure we have the correct structure and handle potential undefined values
        const processedResults: SearchResults = {
          courses: Array.isArray(typedResponse?.courses) ? typedResponse.courses : [],
          collections: Array.isArray(typedResponse?.collections) ? typedResponse.collections : [],
          users: Array.isArray(typedResponse?.users) ? typedResponse.users : [],
        };

        setSearchResults(processedResults);
      } catch (error: any) {
        if (controller.signal.aborted) return;
        if (error?.name === 'AbortError') return;
        console.error('Error searching content:', error);
        setSearchResults({ courses: [], collections: [], users: [] });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsInitialLoad(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [debouncedSearch, accessToken]);

  const MemoizedEmptyState = !searchQuery.trim() ? (
    <div className="px-4 py-8">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 rounded-full bg-black/5 p-3">
          <Sparkles className="h-6 w-6 text-black/70" />
        </div>
        <h3 className="mb-1 text-sm font-medium text-black/80">{t('discoverTitle')}</h3>
        <p className="max-w-[240px] text-xs text-black/50">{t('discoverSubtitle')}</p>
      </div>
    </div>
  ) : null;

  // Calculate if we should show the dropdown
  const shouldShowDropdown = (() => {
    if (!showResults) return false;

    // Show if there's a search query with content
    if (searchQuery.trim()) return true;

    // Show empty state only if focused and no initial load
    if (!isInitialLoad && showResults) return true;

    return false;
  })();

  const searchTerms = [
    {
      term: searchQuery,
      type: 'exact',
      icon: (
        <Search
          size={14}
          className="text-black/40"
        />
      ),
    },
    {
      term: `${searchQuery} ${t('coursesSection').toLowerCase()}`,
      type: 'courses',
      icon: (
        <GraduationCap
          size={14}
          className="text-black/40"
        />
      ),
    },
    {
      term: `${searchQuery} ${t('collectionsSection').toLowerCase()}`,
      type: 'collections',
      icon: (
        <Book
          size={14}
          className="text-black/40"
        />
      ),
    },
  ];

  const MemoizedSearchSuggestions = searchQuery.trim() ? (
    <div className="p-2">
      <div className="flex items-center gap-2 px-2 py-2 text-sm text-black/50">
        <ScanSearch size={16} />
        <span className="font-medium">{t('suggestionsTitle')}</span>
      </div>
      <div className="space-y-1">
        {searchTerms.map(({ term, type, icon }) => (
          <Link
            prefetch={false}
            key={`${term}-${type}`}
            href={getAbsoluteUrl(`/search?q=${encodeURIComponent(term)}`)}
            className="group flex items-center rounded-lg px-3 py-2 transition-colors hover:bg-black/2"
          >
            <div className="flex flex-1 items-center gap-2">
              {icon}
              <span className="text-sm text-black/70">{term}</span>
            </div>
            <ArrowUpRight
              size={14}
              className="text-black/30 transition-colors group-hover:text-black/50"
            />
          </Link>
        ))}
      </div>
    </div>
  ) : null;

  const MemoizedQuickResults = (() => {
    const hasResults =
      searchResults.courses.length > 0 || searchResults.collections.length > 0 || searchResults.users.length > 0;

    if (!hasResults) return null;

    return (
      <div className="p-2">
        <div className="flex items-center gap-2 px-2 py-2 text-sm text-black/50">
          <TextSearch size={16} />
          <span className="font-medium">{t('quickResultsTitle')}</span>
        </div>

        {/* Courses Section */}
        {searchResults.courses.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-black/40">
              <GraduationCap size={12} />
              <span>{t('coursesSection')}</span>
            </div>
            {searchResults.courses.map((course) => (
              <Link
                prefetch={false}
                key={course.course_uuid}
                href={getAbsoluteUrl(`/course/${removeCoursePrefix(course.course_uuid)}`)}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-black/2"
              >
                <div className="relative">
                  {course.thumbnail_image ? (
                    <img
                      src={getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}
                      alt={course.name}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5">
                      <Book
                        size={20}
                        className="text-black/40"
                      />
                    </div>
                  )}
                  <div className="absolute -right-1 -bottom-1 rounded-full bg-white p-1 shadow-sm">
                    <GraduationCap
                      size={11}
                      className="text-black/60"
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-black/80">{course.name}</h3>
                    <span className="text-[10px] font-medium tracking-wide whitespace-nowrap text-black/40 uppercase">
                      {t('courseType')}
                    </span>
                  </div>
                  <p className="truncate text-xs text-black/50">{course.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Collections Section */}
        {searchResults.collections.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-black/40">
              <Book size={12} />
              <span>{t('collectionsSection')}</span>
            </div>
            {searchResults.collections.map((collection) => (
              <Link
                prefetch={false}
                key={collection.collection_uuid}
                href={getAbsoluteUrl(`/collection/${collection.collection_uuid}`)}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-black/2"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5">
                  <Book
                    size={20}
                    className="text-black/40"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-black/80">{collection.name}</h3>
                    <span className="text-[10px] font-medium tracking-wide whitespace-nowrap text-black/40 uppercase">
                      {t('collectionType')}
                    </span>
                  </div>
                  <p className="truncate text-xs text-black/50">{collection.description}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Users Section */}
        {searchResults.users.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-black/40">
              <Users size={12} />
              <span>{t('usersSection')}</span>
            </div>
            {searchResults.users.map((user) => (
              <Link
                prefetch={false}
                key={user.user_uuid}
                href={getAbsoluteUrl(`/user/${user.username}`)}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-black/2"
              >
                <UserAvatar
                  size="md"
                  avatar_url={user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : ''}
                  predefined_avatar={user.avatar_image ? undefined : 'empty'}
                  userId={user.id}
                  showProfilePopup
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-black/80">
                      {[user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')}
                    </h3>
                    <span className="text-[10px] font-medium tracking-wide whitespace-nowrap text-black/40 uppercase">
                      {t('userType')}
                    </span>
                  </div>
                  <p className="truncate text-xs text-black/50">@{user.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  })();

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    setShowResults(true);
  }

  // handler for Enter key press
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchQuery.trim().length > 0) {
      globalThis.location.href = getAbsoluteUrl(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  }

  return (
    <div
      ref={searchRef}
      className={`relative ${className}`}
    >
      <div className="group relative">
        <Input
          type="search"
          className="peer ps-10 pe-2"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => {
            setShowResults(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search
            className="text-black/40 transition-colors group-focus-within:text-black/60"
            size={16}
          />
        </div>
      </div>

      <div
        className={`soft-shadow absolute z-50 mt-2 w-full divide-y divide-black/5 overflow-hidden rounded-xl bg-white transition-all duration-200 ease-in-out ${shouldShowDropdown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'} ${isMobile ? 'max-w-full' : 'min-w-[240px]'}`}
      >
        {shouldShowDropdown &&
          (!searchQuery.trim() || isInitialLoad ? (
            MemoizedEmptyState
          ) : (
            <>
              {showSearchSuggestions ? MemoizedSearchSuggestions : null}
              {isLoading ? (
                <CourseResultsSkeleton />
              ) : (
                <>
                  {MemoizedQuickResults}
                  {(searchResults.courses.length > 0 ||
                    searchResults.collections.length > 0 ||
                    searchResults.users.length > 0 ||
                    searchQuery.trim()) && (
                    <Link
                      prefetch={false}
                      href={getAbsoluteUrl(`/search?q=${encodeURIComponent(searchQuery)}`)}
                      className="flex items-center justify-between px-4 py-2.5 text-xs text-black/50 transition-colors hover:bg-black/2 hover:text-black/70"
                    >
                      <span>{t('viewAllResults')}</span>
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </>
              )}
            </>
          ))}
      </div>
    </div>
  );
};
