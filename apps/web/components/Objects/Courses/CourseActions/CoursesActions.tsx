import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  ShoppingCart,
  Sparkles,
  Trophy,
  UserPen,
} from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAbsoluteUrl } from '@services/config/config';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { getProductsByCourse } from '@services/payments/products';
import { applyForContributor } from '@services/courses/courses';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import CourseProgress from '../CourseProgress/CourseProgress';
import { checkPaidAccess } from '@services/payments/payments';
import { revalidateTags } from '@services/utils/ts/requests';
import { startCourse } from '@services/courses/activity';
import { Card, CardContent } from '@/components/ui/card';
import UserAvatar from '@components/Objects/UserAvatar';
import { getTrailSwrKey } from '@services/courses/keys';
import CoursePaidOptions from './CoursePaidOptions';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { mutate } from 'swr';

interface CourseRun {
  status: string;
  course_id: number;
  steps: {
    activity_id: number;
    complete: boolean;
  }[];
}

interface Course {
  id: number;
  course_uuid: string;
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
  open_to_contributors?: boolean;
}

interface CourseActionsProps {
  courseuuid: string;
  course: Course;
  trailData?: any;
}

const CoursesActions = ({ courseuuid, course, trailData }: CourseActionsProps) => {
  const router = useRouter();
  const session = usePlatformSession() as any;
  const [linkedProducts, setLinkedProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isContributeLoading, setIsContributeLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const { contributorStatus, refetch } = useContributorStatus(courseuuid);
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const t = useTranslations('Courses.CoursesActions');

  // stable primitives to avoid effects depending on whole session object
  const accessToken = session.data?.tokens?.access_token;
  const userId = session.data?.user?.id;

  // one-shot guards to avoid repeated requests when context identity changes
  const fetchedLinkedProductsRef = useRef<Record<string, boolean>>({});
  const checkedAccessRef = useRef<Record<string, boolean>>({});

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
        toast.error(t('errorCheckingCourseAccess'));
        setHasAccess(false);
      }
    };

    // Only run when there are linked products and avoid rerunning repeatedly
    if (linkedProducts.length === 0) return;
    const checkKey = `${course.id}:${accessToken || 'no-token'}`;
    if (checkedAccessRef.current[checkKey]) return;
    checkedAccessRef.current[checkKey] = true;
    checkAccess();
  }, [course.id, accessToken, userId, linkedProducts, t]);

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

    setIsActionLoading(true);
    const loadingToast = toast.loading(t('startingCourse'));

    try {
      await startCourse(`course_${courseuuid}`, session.data?.tokens?.access_token);
      mutate([getTrailSwrKey(), session.data?.tokens?.access_token]);
      toast.success(t('startedCourseSuccess'), { id: loadingToast });

      // Get the first activity from the first chapter
      const firstChapter = course.chapters?.[0];
      const firstActivity = firstChapter?.activities?.[0];

      if (firstActivity) {
        // Redirect to the first activity
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${firstActivity.activity_uuid.replace('activity_', '')}`,
        );
      } else {
        mutate([getTrailSwrKey(), session.data?.tokens?.access_token]);
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to perform course action:', error);
      toast.error(t('startCourseError'), {
        id: loadingToast,
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApplyToContribute = async () => {
    if (!session.data?.user) {
      router.push(getAbsoluteUrl('/signup'));
      return;
    }

    setIsContributeLoading(true);
    const loadingToast = toast.loading(t('submittingContributorApplication'));

    try {
      const data = {
        message: t('contributorApplicationMessage'),
      };

      await applyForContributor(`course_${courseuuid}`, data, session.data?.tokens?.access_token);
      await revalidateTags(['courses']);
      refetch();
      toast.success(t('contributorApplicationSuccess'), { id: loadingToast });
    } catch (error) {
      console.error('Failed to apply as contributor:', error);
      toast.error(t('contributorApplicationError'), { id: loadingToast });
    } finally {
      setIsContributeLoading(false);
    }
  };

  const renderActionButton = (action: 'start' | 'continue') => {
    const isAuthenticated = Boolean(session.data?.user);
    const icon = action === 'start' ? <PlayCircle className="size-5" /> : <ArrowRight className="size-5" />;
    const label = action === 'start' ? t('startCourse') : t('continueLearning');

    return (
      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <UserAvatar
            size="xs"
            variant="outline"
            use_with_session
          />
        ) : (
          <UserAvatar
            size="xs"
            variant="outline"
            predefined_avatar="empty"
          />
        )}
        <span className="flex-1">{label}</span>
        {icon}
      </div>
    );
  };

  const renderContributorButton = () => {
    if (contributorStatus === 'INACTIVE' || course.open_to_contributors !== true) {
      return null;
    }

    if (!session.data?.user) {
      return (
        <Button
          variant="outline"
          onClick={() => router.push(getAbsoluteUrl('/signup'))}
          aria-label={t('aria.signupToApply')}
          className="w-full gap-2"
        >
          <UserPen className="size-4" />
          {t('authenticateToContribute')}
        </Button>
      );
    }

    if (contributorStatus === 'ACTIVE') {
      return (
        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50/50 px-4 py-3 text-sm font-medium text-green-700">
          <CheckCircle2 className="size-4" />
          {t('youAreAContributor')}
        </div>
      );
    }

    if (contributorStatus === 'PENDING') {
      return (
        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm font-medium text-amber-700">
          <Clock className="size-4" />
          {t('contributorApplicationPending')}
        </div>
      );
    }

    return (
      <Button
        variant="outline"
        onClick={handleApplyToContribute}
        disabled={isContributeLoading}
        aria-label={t('aria.applyToBecome')}
        className="w-full gap-2"
      >
        {isContributeLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <UserPen className="size-4" />
            {t('applyToContribute')}
          </>
        )}
      </Button>
    );
  };

  const renderProgressSection = () => {
    const totalActivities =
      course.chapters?.reduce((acc: number, chapter: any) => acc + chapter.activities.length, 0) || 0;

    const run = trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    });

    const completedActivities = run?.steps?.filter((step: any) => step.complete)?.length || 0;
    const progressPercentage = totalActivities === 0 ? 0 : Math.round((completedActivities / totalActivities) * 100);
    const isCompleted = progressPercentage === 100;

    if (!isStarted) {
      return (
        <button
          onClick={() => setIsProgressOpen(true)}
          className="group flex w-full items-center gap-4 rounded-xl border border-neutral-200/60 bg-gradient-to-br from-neutral-50 to-white p-4 text-left transition-all hover:border-neutral-300 hover:shadow-sm"
        >
          <div className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-neutral-100 transition-colors group-hover:bg-neutral-200/70">
            <BookOpen className="size-6 text-neutral-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900">{t('readyToBegin')}</p>
            {totalActivities > 0 && (
              <p className="mt-0.5 text-sm text-neutral-500">{t('startLearningJourney', { totalActivities })}</p>
            )}
          </div>
          <Sparkles className="text-primary size-5" />
        </button>
      );
    }

    return (
      <button
        onClick={() => setIsProgressOpen(true)}
        className={cn(
          'group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all hover:shadow-sm',
          isCompleted
            ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/50 hover:border-green-300'
            : 'border-neutral-200/60 bg-gradient-to-br from-neutral-50 to-white hover:border-neutral-300',
        )}
      >
        {/* Circular progress indicator */}
        <div className="relative size-14 shrink-0">
          <svg
            className="size-full -rotate-90"
            viewBox="0 0 64 64"
          >
            <circle
              cx="32"
              cy="32"
              r="26"
              stroke="currentColor"
              strokeWidth="5"
              fill="none"
              className="text-neutral-200"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              stroke="currentColor"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={
                totalActivities === 0 ? 0 : 2 * Math.PI * 26 * (1 - completedActivities / totalActivities)
              }
              className={cn('transition-all duration-700 ease-out', isCompleted ? 'text-green-500' : 'text-primary')}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isCompleted ? (
              <Trophy className="size-5 text-green-600" />
            ) : (
              <span className="text-sm font-bold text-neutral-800">{progressPercentage}%</span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn('text-sm font-medium', isCompleted ? 'text-green-800' : 'text-neutral-900')}>
              {isCompleted ? t('courseCompleted') : t('courseProgress')}
            </p>
            {isCompleted && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-700"
              >
                <CheckCircle2 className="mr-1 size-3" />
                {t('completed')}
              </Badge>
            )}
          </div>
          <p className={cn('mt-0.5 text-sm', isCompleted ? 'text-green-600' : 'text-neutral-500')}>
            {t('completedActivities', { completedActivities, totalActivities })}
          </p>
        </div>

        <ArrowRight
          className={cn(
            'size-5 transition-transform group-hover:translate-x-0.5',
            isCompleted ? 'text-green-500' : 'text-neutral-400',
          )}
        />
      </button>
    );
  };

  if (isLoading) {
    return (
      <Card
        size="sm"
        className="animate-pulse"
      >
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-neutral-400" />
        </CardContent>
      </Card>
    );
  }

  if (linkedProducts.length > 0) {
    return (
      <Card size="sm">
        <CardContent className="space-y-4">
          {hasAccess ? (
            <>
              {/* Access granted banner */}
              <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/50 p-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="size-4 text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-green-800">{t('youOwnThisCourse')}</h3>
                  <p className="mt-0.5 text-sm text-green-700">{t('youHavePurchasedThisCourse')}</p>
                </div>
              </div>

              {/* Progress section for paid courses */}
              {renderProgressSection()}

              {/* Action button */}
              <Button
                onClick={handleCourseAction}
                disabled={isActionLoading}
                className="h-12 w-full gap-2 text-base"
              >
                {isActionLoading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  renderActionButton(isStarted ? 'continue' : 'start')
                )}
              </Button>

              {renderContributorButton()}
            </>
          ) : (
            <>
              {/* Payment required banner */}
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/50 p-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <AlertCircle className="size-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-800">{t('paidCourse')}</h3>
                  <p className="mt-0.5 text-sm text-amber-700">{t('courseRequiresPurchase')}</p>
                </div>
              </div>

              <Modal
                isDialogOpen={isModalOpen}
                onOpenChange={setIsModalOpen}
                dialogContent={<CoursePaidOptions course={course} />}
                dialogTitle={t('purchaseCourse')}
                dialogDescription={t('selectPaymentOption')}
                minWidth="sm"
              />

              <Button
                onClick={() => setIsModalOpen(true)}
                className="h-12 w-full gap-2 text-base"
              >
                <ShoppingCart className="size-5" />
                {t('purchaseCourse')}
              </Button>

              {renderContributorButton()}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        {/* Progress Section */}
        {renderProgressSection()}

        {/* Start/Continue Course Button */}
        <Button
          onClick={handleCourseAction}
          disabled={isActionLoading}
          className="h-12 w-full gap-2 text-base"
        >
          {isActionLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            renderActionButton(isStarted ? 'continue' : 'start')
          )}
        </Button>

        {/* Contributor Button */}
        {renderContributorButton()}

        {/* Course Progress Modal */}
        <CourseProgress
          course={course}
          isOpen={isProgressOpen}
          onClose={() => setIsProgressOpen(false)}
          trailData={trailData}
        />
      </CardContent>
    </Card>
  );
};

export default CoursesActions;
