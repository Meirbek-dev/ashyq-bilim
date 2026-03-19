'use client';

// Import Lucide icons
import {
  ArrowRight,
  Backpack,
  Check,
  ChevronDown,
  ClipboardList,
  File,
  ImageIcon,
  Layers,
  Square,
  StickyNote,
  Video,
} from 'lucide-react';
// Import custom components
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import CourseActionsMobile from '@components/Objects/Courses/CourseActions/CourseActionsMobile';
import CoursesActions from '@components/Objects/Courses/CourseActions/CoursesActions';
import CourseAuthors from '@components/Objects/Courses/CourseAuthors/CourseAuthors';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators';
import CourseBreadcrumbs from '@components/Pages/Courses/CourseBreadcrumbs';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getDiscussionsSwrKey } from '@services/courses/discussions-keys';
// Import existing components and utilities
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { CourseProvider } from '@components/Contexts/CourseContext';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { swrFetcher } from '@services/utils/ts/requests';
// Import the new discussions component
import CourseDiscussions from '@/components/discussions';
import { getAbsoluteUrl } from '@services/config/config';
// Import UI components
import { Card, CardContent } from '@/components/ui/card';
import { getTrailSwrKey } from '@services/courses/keys';
import { Separator } from '@/components/ui/separator';
import { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

const CourseClient = (props: any) => {
  const t = useTranslations('CoursePage');
  const [learnings, setLearnings] = useState<any>([]);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [activeThumbnailType, setActiveThumbnailType] = useState<'image' | 'video'>('image');

  const { courseuuid } = props;
  const { course } = props;
  const org = usePlatform() as any;
  const isMobile = useIsMobile();
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;

  const {
    data: discussionPosts = [],
    error: discussionsError,
    mutate: mutateDiscussions,
  } = useSWR(
    course?.course_uuid && access_token ? getDiscussionsSwrKey(course.course_uuid, true, 50, 0) : null,
    (url) => swrFetcher(url, access_token),
  );

  // Add SWR for trail data
  const TRAIL_KEY = getTrailSwrKey();
  const { data: trailData } = useSWR(TRAIL_KEY && access_token ? [TRAIL_KEY, access_token] : null, ([url, token]) =>
    swrFetcher(url, token),
  );

  // Normalizes various formats of `course.learnings` into an array that the UI can render
  const normalizedLearnings = useMemo(() => {
    const normalize = (input: unknown): any[] => {
      if (!input) return [];

      // Already an array
      if (Array.isArray(input)) {
        return input
          .map((item) => {
            if (typeof item === 'string') {
              const s = item.trim();
              if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
              return s;
            }
            if (item && typeof item === 'object') {
              // Keep shape but ensure text field exists if possible
              const text = item.text ?? item.name ?? item.title;
              const t = typeof text === 'string' ? text.trim() : text !== null ? String(text).trim() : '';
              if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return null;
              return { ...item, text: t };
            }
            return null;
          })
          .filter(Boolean);
      }

      // Object: maybe { learnings: [...] } or similar
      if (input && typeof input === 'object') {
        const obj = input as any;
        if (Array.isArray(obj.learnings)) return normalize(obj.learnings);
        if (Array.isArray(obj.items)) return normalize(obj.items);
        if (Array.isArray(obj.data)) return normalize(obj.data);
        // Single object with text
        const text = obj.text ?? obj.name ?? obj.title;
        if (text) return normalize([String(text)]);
        return [];
      }

      // String: try JSON first if it looks like JSON, else split plain text
      if (typeof input === 'string') {
        const raw = input.trim();
        if (!raw || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return [];
        const looksJson = raw.startsWith('[') || raw.startsWith('{');
        if (looksJson) {
          try {
            const parsed = JSON.parse(raw);
            return normalize(parsed);
          } catch {
            // fall through to plain-text handling
          }
        }
        // Legacy: plain text list. Prefer newlines/semicolons/bullets; avoid splitting on commas aggressively.
        const parts = raw
          .split(/\r?\n|\u2022|\u2023|\u25E6|;|\||·|–|—/)
          .map((s) => s.replace(/^[-*\s]+/, '').trim())
          .filter((s) => s.length > 0 && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined');
        // If nothing split out meaningfully, keep as single item
        if (parts.length === 0) return [raw];
        return parts;
      }

      return [];
    };

    const src = course?.learnings as unknown;
    return normalize(src);
  }, [course?.learnings]);

  useEffect(() => {
    setLearnings(normalizedLearnings);
  }, [normalizedLearnings]);

  useEffect(() => {
    // Collapse chapters by default if more than 5 activities in total
    if (course?.chapters) {
      const totalActivities = course.chapters.reduce(
        (sum: number, chapter: any) => sum + (chapter.activities?.length || 0),
        0,
      );
      const defaultExpanded: Record<string, boolean> = {};
      course.chapters.forEach((chapter: any, idx: number) => {
        // Always expand the first chapter
        defaultExpanded[chapter.chapter_uuid] = idx === 0 ? true : totalActivities <= 5;
      });
      setExpandedChapters(defaultExpanded);
    }
  }, [course]);

  const getActivityTypeLabel = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO': {
        return t('video');
      }
      case 'TYPE_DOCUMENT': {
        return t('document');
      }
      case 'TYPE_DYNAMIC': {
        return t('page');
      }
      case 'TYPE_ASSIGNMENT': {
        return t('assignment');
      }
      case 'TYPE_EXAM': {
        return t('exam');
      }
      default: {
        return t('learningMaterial');
      }
    }
  };

  const isActivityDone = (activity: any) => {
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    const run = trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    });
    if (run) {
      return run.steps.find((step: any) => step.activity_id === activity.id && step.complete === true);
    }
    return false;
  };

  const isActivityCurrent = (activity: any) => {
    const activity_uuid = activity.activity_uuid.replace('activity_', '');
    return props.current_activity && props.current_activity === activity_uuid;
  };

  return (
    <>
      {!course ? (
        <PageLoading />
      ) : (
        <>
          <GeneralWrapper>
            <CourseBreadcrumbs course={course} />
            <div className="flex flex-col items-start justify-between pt-3 pb-2 md:flex-row md:items-center">
              <div>
                <h1 className="text-3xl font-bold md:text-3xl">{course.name}</h1>
              </div>
            </div>
            <div className="flex flex-col gap-8 pt-2 md:flex-row">
              <div className="w-full space-y-4 md:w-3/4">
                {(() => {
                  const showVideo =
                    course.thumbnail_type === 'video' ||
                    (course.thumbnail_type === 'both' && activeThumbnailType === 'video');
                  const showImage =
                    course.thumbnail_type === 'image' ||
                    (course.thumbnail_type === 'both' && activeThumbnailType === 'image') ||
                    !course.thumbnail_type;
                  if (showVideo && course.thumbnail_video) {
                    return (
                      <div className="relative w-full overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10 ring-inset">
                        {course.thumbnail_type === 'both' && (
                          <div className="absolute top-3 right-3 z-10">
                            <div className="flex space-x-1 rounded-lg bg-black/20 p-1 backdrop-blur-sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActiveThumbnailType('image');
                                }}
                                className={cn(
                                  'h-8 px-2 text-xs',
                                  activeThumbnailType === 'image'
                                    ? 'bg-white/90 text-gray-900 shadow-sm'
                                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                                )}
                              >
                                <ImageIcon
                                  size={12}
                                  className="mr-1"
                                />
                                {t('thumbnailTypeImage')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActiveThumbnailType('video');
                                }}
                                className={cn(
                                  'h-8 px-2 text-xs',
                                  activeThumbnailType === 'video'
                                    ? 'bg-white/90 text-gray-900 shadow-sm'
                                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                                )}
                              >
                                <Video
                                  size={12}
                                  className="mr-1"
                                />
                                {t('thumbnailTypeVideo')}
                              </Button>
                            </div>
                          </div>
                        )}
                        <video
                          src={getCourseThumbnailMediaDirectory(course?.course_uuid, course?.thumbnail_video)}
                          className="h-auto w-full rounded-lg bg-black object-contain"
                          controls
                          autoPlay
                          muted
                          preload="metadata"
                          playsInline
                        />
                      </div>
                    );
                  }
                  if (showImage && course.thumbnail_image) {
                    return (
                      <div className="relative max-h-192 w-full overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10 ring-inset">
                        <img
                          src={getCourseThumbnailMediaDirectory(course?.course_uuid, course?.thumbnail_image)}
                          alt={t('courseThumbnailAlt')}
                          className="h-auto w-full object-contain"
                        />
                        {course.thumbnail_type === 'both' && (
                          <div className="absolute top-3 right-3 z-10">
                            <div className="flex space-x-1 rounded-lg bg-black/20 p-1 backdrop-blur-sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActiveThumbnailType('image');
                                }}
                                className={cn(
                                  'h-8 px-2 text-xs',
                                  activeThumbnailType === 'image'
                                    ? 'bg-white/90 text-gray-900 shadow-sm'
                                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                                )}
                              >
                                <ImageIcon
                                  size={12}
                                  className="mr-1"
                                />
                                {t('thumbnailTypeImage')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActiveThumbnailType('video');
                                }}
                                className={cn(
                                  'h-8 px-2 text-xs',
                                  activeThumbnailType === 'video'
                                    ? 'bg-white/90 text-gray-900 shadow-sm'
                                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                                )}
                              >
                                <Video
                                  size={12}
                                  className="mr-1"
                                />
                                {t('thumbnailTypeVideo')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      className="relative h-auto w-full overflow-hidden rounded-lg bg-cover bg-center shadow-xl ring-1 ring-black/10 ring-inset"
                      style={{
                        backgroundImage: `url('../empty_thumbnail.webp')`,
                        backgroundSize: 'auto',
                      }}
                    />
                  );
                })()}
                {(() => {
                  const cleanCourseUuid = course.course_uuid?.replace('course_', '');
                  return trailData?.runs?.find((run: any) => {
                    const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
                    return cleanRunCourseUuid === cleanCourseUuid;
                  });
                })() && (
                  <ActivityIndicators
                    course_uuid={props.course.course_uuid}
                    course={course}
                    trailData={trailData}
                  />
                )}
                <div className="course_metadata_left space-y-2">
                  <div>
                    <p className="w-full py-5 leading-relaxed tracking-normal text-pretty wrap-break-word hyphens-auto whitespace-pre-line">
                      {course.about}
                    </p>
                  </div>
                </div>
              </div>
              <div className="course_metadata_right w-full space-y-4 md:w-1/4">
                {/* Actions Box */}
                <CoursesActions
                  courseuuid={courseuuid}
                  course={course}
                  trailData={trailData}
                />
                {/* Authors & Updates Box */}
                <Card className="p-0">
                  <CardContent className="p-4">
                    <CourseProvider courseuuid={course.course_uuid}>
                      <CourseAuthors authors={course.authors} />
                    </CourseProvider>
                  </CardContent>
                </Card>
              </div>
            </div>
            {learnings.length > 0 && learnings[0]?.text !== 'null' && (
              <div className="w-full">
                <h2 className="py-5 text-xl font-semibold md:text-2xl">{t('whatYouWillLearn')}</h2>
                <Card className="p-0">
                  <CardContent className="space-y-2 p-5">
                    {learnings.map((learning: any) => {
                      const learningText = typeof learning === 'string' ? learning : learning.text;
                      const learningEmoji = typeof learning === 'string' ? null : learning.emoji;
                      const learningId = typeof learning === 'string' ? learning : learning.id || learning.text;
                      // Sanitize href: only allow strings that look like URLs or absolute/relative paths
                      const rawHref = typeof learning === 'object' && learning ? learning.link : undefined;
                      const href = typeof rawHref === 'string' ? rawHref.trim() : '';
                      const hasValidHref = Boolean(href && /^(?:[a-z][a-z0-9+.-]*:|\/|\.\/|\.\.\/|#)/i.test(href));
                      if (!learningText) return null;
                      return (
                        <div
                          key={learningId}
                          className="flex items-center space-x-2 font-semibold text-gray-500"
                        >
                          <div className="rounded-full px-2 py-2">
                            {learningEmoji ? (
                              <span>{learningEmoji}</span>
                            ) : (
                              <Check
                                className="text-gray-400"
                                size={15}
                              />
                            )}
                          </div>
                          <p>{learningText}</p>
                          {hasValidHref ? (
                            <Button
                              variant="link"
                              size="sm"
                              render={
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm"
                                />
                              }
                            >
                              <span className="sr-only">{t('linkTo', { learningText })}</span>
                              <ArrowRight size={14} />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            )}
            <div className="my-5 mb-10 w-full">
              <h2 className="pb-5 text-xl font-semibold md:text-2xl">{t('courseLessons')}</h2>
              <Card className="p-0">
                {course.chapters.map((chapter: any, idx: number) => {
                  const isExpanded = expandedChapters[chapter.chapter_uuid] ?? idx === 0;
                  return (
                    <Collapsible
                      key={chapter.chapter_uuid || `chapter-${chapter.name}`}
                      open={isExpanded}
                      onOpenChange={(open) => {
                        setExpandedChapters((prev) => ({
                          ...prev,
                          [chapter.chapter_uuid]: open,
                        }));
                      }}
                    >
                      <CollapsibleTrigger
                        nativeButton={false}
                        render={
                          <div className="flex cursor-pointer items-start bg-neutral-50 px-4 py-4 font-semibold text-neutral-600 transition-colors hover:bg-neutral-100" />
                        }
                      >
                        <div className="mr-3 flex flex-col justify-center pt-1">
                          <ChevronDown className={cn('h-5 w-5 transition-transform', isExpanded ? 'rotate-180' : '')} />
                        </div>
                        <div className="flex w-full flex-col items-start">
                          <div className="mb-1 flex w-full min-w-0 flex-wrap items-center">
                            <Badge
                              variant="secondary"
                              className="mr-2 h-5 w-5 rounded-full p-0 text-xs"
                            >
                              {idx + 1}
                            </Badge>
                            <h3 className="min-w-0 truncate text-lg leading-tight font-semibold">{chapter.name}</h3>
                          </div>
                          <div className="flex items-center space-x-1 text-sm font-normal text-neutral-400">
                            <Layers
                              size={16}
                              className="mr-1"
                            />
                            <span>{t('activitiesCount', { count: chapter.activities.length })}</span>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div>
                          {chapter.activities.map((activity: any) => {
                            return (
                              <Link
                                key={activity.activity_uuid}
                                href={`${getAbsoluteUrl('')}/course/${courseuuid}/activity/${activity.activity_uuid.replace('activity_', '')}`}
                                rel="noopener noreferrer"
                                prefetch={false}
                                className="activity-container group block px-4 py-4 transition-all duration-200 hover:bg-gray-50"
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="flex items-center">
                                    {isActivityDone(activity) ? (
                                      <div className="relative">
                                        <Square
                                          size={16}
                                          className="stroke-2 text-teal-600"
                                        />
                                        <Check
                                          size={16}
                                          className="absolute top-0 left-0 stroke-[2.5] text-teal-600"
                                        />
                                      </div>
                                    ) : (
                                      <Square
                                        size={16}
                                        className="stroke-2 text-neutral-300"
                                      />
                                    )}
                                  </div>
                                  <div className="flex grow flex-col">
                                    <div className="flex w-full items-center space-x-2">
                                      <p className="font-semibold text-neutral-600 transition-colors group-hover:text-neutral-800">
                                        {activity.name}
                                      </p>
                                      {isActivityCurrent(activity) && (
                                        <Badge
                                          variant="secondary"
                                          className="text-primary-foreground animate-pulse bg-blue-50"
                                        >
                                          {t('current')}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="mt-0.5 flex items-center space-x-1.5 text-neutral-400">
                                      {activity.activity_type === 'TYPE_DYNAMIC' && <StickyNote size={10} />}
                                      {activity.activity_type === 'TYPE_VIDEO' && <Video size={10} />}
                                      {activity.activity_type === 'TYPE_DOCUMENT' && <File size={10} />}
                                      {activity.activity_type === 'TYPE_ASSIGNMENT' && <Backpack size={10} />}
                                      {activity.activity_type === 'TYPE_EXAM' && <ClipboardList size={10} />}
                                      <span className="text-xs font-medium">
                                        {getActivityTypeLabel(activity.activity_type)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-neutral-300 transition-colors group-hover:text-neutral-400">
                                    <ArrowRight size={14} />
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                      {idx < course.chapters.length - 1 && <Separator />}
                    </Collapsible>
                  );
                })}
              </Card>
            </div>

            {/* Course Discussions - Using the new component */}
            <CourseDiscussions
              initialPosts={discussionPosts}
              currentUser={session?.data?.user}
              courseUuid={course?.course_uuid}
              onMutate={mutateDiscussions}
            />
          </GeneralWrapper>
          {/* Mobile Actions Box */}
          {isMobile ? (
            <CourseActionsMobile
              courseuuid={courseuuid}
              course={course}
              trailData={trailData}
            />
          ) : null}
        </>
      )}
    </>
  );
};

export default CourseClient;
