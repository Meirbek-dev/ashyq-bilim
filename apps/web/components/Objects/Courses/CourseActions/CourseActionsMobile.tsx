'use client';

import { AlertCircle, BookOpen, Loader2, LogIn, ShoppingCart } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAbsoluteUrl } from '@services/config/config';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { useEffect, useRef, useState, useTransition } from 'react';
import { getProductsByCourse } from '@services/payments/products';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { checkPaidAccess } from '@services/payments/payments';
import { revalidateTags } from '@services/utils/ts/requests';
import { startCourse } from '@services/courses/activity';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import UserAvatar from '../../UserAvatar';

import CoursePaidOptions from './CoursePaidOptions';

interface Author {
  user: {
    user_uuid: string;
    avatar_image: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    username: string;
  };
  authorship: 'CREATOR' | 'CONTRIBUTOR' | 'MAINTAINER' | 'REPORTER';
  authorship_status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
}

interface CourseRun {
  status: string;
  course_id: number;
}

interface Course {
  id: number;
  course_uuid: string;
  authors: Author[];
  trail?: {
    runs: CourseRun[];
  };
  chapters?: {
    name: string;
    activities: {
      id: number;
      activity_uuid: string;
      name: string;
      activity_type: string;
    }[];
  }[];
}

interface CourseActionsMobileProps {
  courseuuid: string;
  course: Course;
  trailData?: any;
}

// Component for displaying multiple authors
const MultipleAuthors = ({ authors }: { authors: Author[] }) => {
  const t = useTranslations('Courses.CourseActionsMobile');

  // Early return if no authors
  if (!authors || authors.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm text-neutral-400">{t('noAuthors')}</div>
      </div>
    );
  }

  const displayedAvatars = authors.slice(0, 3);
  const remainingCount = Math.max(0, authors.length - 3);

  // Avatar size for mobile
  const avatarSize = 36;

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex -space-x-3">
        {displayedAvatars.map((author, index) => (
          <div
            key={author.user.user_uuid}
            className="relative"
            style={{ zIndex: displayedAvatars.length - index }}
          >
            <UserAvatar
              size="sm"
              variant="outline"
              avatar_url={
                author.user.avatar_image
                  ? getUserAvatarMediaDirectory(author.user.user_uuid, author.user.avatar_image)
                  : ''
              }
              predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
            />
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="relative z-0">
            <div
              className="flex items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-xs font-medium text-neutral-600 shadow-sm"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
              }}
            >
              +{remainingCount}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <span className="text-xs font-medium text-neutral-400">{authors.length > 1 ? t('authors') : t('author')}</span>
        {authors.length === 1 ? (
          <span className="text-sm font-semibold text-neutral-800">
            {authors[0]?.user?.first_name && authors[0]?.user?.last_name
              ? [authors[0].user.first_name, authors[0].user.middle_name, authors[0].user.last_name]
                  .filter(Boolean)
                  .join(' ')
              : `@${authors[0]?.user?.username || 'Unknown'}`}
          </span>
        ) : (
          <span className="text-sm font-semibold text-neutral-800">
            {authors[0]?.user?.first_name && authors[0]?.user?.last_name
              ? [authors[0].user.first_name, authors[0].user.middle_name, authors[0].user.last_name]
                  .filter(Boolean)
                  .join(' ')
              : `@${authors[0]?.user?.username || 'Unknown'}`}
            {authors.length > 1 && ` ${t('moreAuthors', { count: authors.length - 1 })}`}
          </span>
        )}
      </div>
    </div>
  );
};

const CourseActionsMobile = ({ courseuuid, course, trailData }: CourseActionsMobileProps) => {
  const t = useTranslations('Courses.CourseActionsMobile');
  const router = useRouter();
  const session = usePlatformSession() as any;
  // stable primitives to avoid effects depending on the whole session object
  const accessToken = session.data?.tokens?.access_token;
  const userId = session.data?.user?.id;

  // one-shot guards to avoid repeated requests when context identity changes
  const fetchedLinkedProductsRef = useRef<Record<string, boolean>>({});
  const checkedAccessRef = useRef<Record<string, boolean>>({});
  const [linkedProducts, setLinkedProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  // Clean up course UUID by removing 'course_' prefix if it exists
  const cleanCourseUuid = course.course_uuid?.replace('course_', '');

  const isStarted =
    trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    }) ?? false;

  useEffect(() => {
    const fetchLinkedProducts = async () => {
      try {
        const response = await getProductsByCourse(course.id, accessToken);
        setLinkedProducts(response.data || []);
      } catch {
        console.error('Failed to fetch linked products');
      } finally {
        setIsLoading(false);
      }
    };

    // run once per course id to avoid loops caused by unstable session/context identity
    if (fetchedLinkedProductsRef.current[course.id]) return;
    fetchedLinkedProductsRef.current[course.id] = true;
    fetchLinkedProducts();
  }, [course.id, accessToken]);

  useEffect(() => {
    const checkAccess = async () => {
      if (!userId) return;
      try {
        const response = await checkPaidAccess(course.id, accessToken);
        setHasAccess(response.has_access);
      } catch {
        console.error('Failed to check course access');
        setHasAccess(false);
      }
    };

    if (linkedProducts.length === 0) return;
    const checkKey = `${course.id}:${accessToken || 'no-token'}`;
    if (checkedAccessRef.current[checkKey]) return;
    checkedAccessRef.current[checkKey] = true;
    checkAccess();
  }, [course.id, accessToken, userId, linkedProducts]);

  const handleCourseAction = async () => {
    if (!session.data?.user) {
      router.push(getAbsoluteUrl('/signup'));
      return;
    }

    // If already started, navigate to first unfinished activity
    if (isStarted) {
      const run = trailData?.runs?.find((r: any) => {
        const cleanRunCourseUuid = r.course?.course_uuid?.replace('course_', '');
        return cleanRunCourseUuid === cleanCourseUuid;
      });

      // Find first unfinished activity
      let firstUnfinishedActivity: { id: number; activity_uuid: string } | null = null;

      if (course.chapters) {
        for (const chapter of course.chapters) {
          for (const activity of chapter.activities) {
            const isCompleted = run?.steps?.some((step: any) => step.activity_id === activity.id && step.complete);
            if (!isCompleted) {
              firstUnfinishedActivity = activity;
              break;
            }
          }
          if (firstUnfinishedActivity) break;
        }
      }

      // If all activities are completed, go to first activity
      const targetActivity = firstUnfinishedActivity || course.chapters?.[0]?.activities?.[0];

      if (targetActivity) {
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${targetActivity.activity_uuid.replace('activity_', '')}`,
        );
      }
      return;
    }

    startTransition(() => setIsActionLoading(true));
    try {
      await startCourse(`course_${courseuuid}`, session.data?.tokens?.access_token);
      await revalidateTags(['courses']);

      // Get the first activity from the first chapter
      const firstChapter = course.chapters?.[0];
      const firstActivity = firstChapter?.activities?.[0];

      if (firstActivity) {
        // Redirect to the first activity
        await revalidateTags(['activities']);
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${firstActivity.activity_uuid.replace('activity_', '')}`,
        );
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to perform course action:', error);
    } finally {
      startTransition(() => setIsActionLoading(false));
      await revalidateTags(['courses']);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-4 mb-8 flex h-16 items-center justify-center rounded-lg bg-gray-100">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  // Filter active authors and sort by role priority
  const sortedAuthors = [...course.authors]
    .filter((author) => author.authorship_status === 'ACTIVE')
    .toSorted((a, b) => {
      const rolePriority: Record<string, number> = {
        CREATOR: 0,
        MAINTAINER: 1,
        CONTRIBUTOR: 2,
        REPORTER: 3,
      };
      const aPriority = rolePriority[a.authorship] ?? 999;
      const bPriority = rolePriority[b.authorship] ?? 999;
      return aPriority - bPriority;
    });

  return (
    <div className="mx-2 my-6 overflow-hidden rounded-lg bg-white/90 p-4 shadow-md shadow-gray-300/25 outline-1 outline-neutral-200/40 backdrop-blur-sm">
      <div className="flex flex-col space-y-4">
        <MultipleAuthors authors={sortedAuthors} />

        {linkedProducts.length > 0 ? (
          <div className="space-y-3">
            {hasAccess ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-green-800">{t('ownCourse')}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-800" />
                  <span className="text-sm font-semibold text-amber-800">{t('paidCourse')}</span>
                </div>
              </div>
            )}

            {hasAccess ? (
              <button
                onClick={handleCourseAction}
                disabled={isActionLoading || isPending}
                className="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:bg-neutral-700"
              >
                {isActionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isStarted ? (
                  <>
                    <BookOpen className="h-4 w-4" />
                    {t('continueLearning')}
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    {t('startCourse')}
                  </>
                )}
              </button>
            ) : (
              <>
                <Modal
                  isDialogOpen={isModalOpen}
                  onOpenChange={setIsModalOpen}
                  dialogContent={<CoursePaidOptions course={course} />}
                  dialogTitle={t('modalTitle')}
                  dialogDescription={t('modalDescription')}
                  minWidth="sm"
                />
                <button
                  onClick={() => {
                    setIsModalOpen(true);
                  }}
                  disabled={isActionLoading || isPending}
                  className="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:bg-neutral-700"
                >
                  {isActionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4" />
                      {t('purchaseCourse')}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={handleCourseAction}
            disabled={isActionLoading || isPending}
            className="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:bg-neutral-700"
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !session.data?.user ? (
              <>
                <LogIn className="h-4 w-4" />
                {t('signIn')}
              </>
            ) : isStarted ? (
              <>
                <BookOpen className="h-4 w-4" />
                {t('continueLearning')}
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                {t('startCourse')}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default CourseActionsMobile;
