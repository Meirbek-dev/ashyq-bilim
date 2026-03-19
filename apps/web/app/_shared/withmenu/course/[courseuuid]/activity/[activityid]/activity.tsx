'use client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  UserRoundPen,
} from 'lucide-react';
import AssignmentSubmissionProvider, {
  useAssignmentSubmission,
} from '@components/Contexts/Assignments/AssignmentSubmissionContext';
import {
  getAssignmentFromActivityUUID,
  getFinalGrade,
  submitAssignmentForGrading,
} from '@services/courses/assignments';
import PaidCourseActivityDisclaimer from '@components/Objects/Courses/CourseActions/PaidCourseActivityDisclaimer';
import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media';
import { AssignmentsTaskProvider } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { markActivityAsComplete, unmarkActivityAsComplete } from '@services/courses/activity';
import FixedActivitySecondaryBar from '@components/Pages/Activity/FixedActivitySecondaryBar';
import type { Activity, Chapter, CourseStructure } from '@components/Contexts/CourseContext';
import { useOptionalGamificationContext } from '@/components/Contexts/GamificationContext';
import ActivityChapterDropdown from '@components/Pages/Activity/ActivityChapterDropdown';
import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { Suspense, lazy, useEffect, useRef, useState, useTransition } from 'react';
import ActivityBreadcrumbs from '@components/Pages/Activity/ActivityBreadcrumbs';
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import AIChatBotProvider from '@components/Contexts/AI/AIChatBotContext';
import CourseEndView from '@components/Pages/Activity/CourseEndView';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { CourseProvider } from '@components/Contexts/CourseContext';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { getAPIUrl, getAbsoluteUrl } from '@services/config/config';
import { swrFetcher } from '@services/utils/ts/requests';
import UserAvatar from '@components/Objects/UserAvatar';
import { getTrailSwrKey } from '@services/courses/keys';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import Link from '@components/ui/AppLink';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';

// Lazy load heavy components
const Canva = lazy(() => import('@components/Objects/Activities/DynamicCanva/DynamicCanva'));
const VideoActivity = lazy(() => import('@components/Objects/Activities/Video/Video'));
const DocumentPdfActivity = lazy(() => import('@components/Objects/Activities/DocumentPdf/DocumentPdf'));
const AssignmentStudentActivity = lazy(
  () => import('@components/Objects/Activities/Assignment/AssignmentStudentActivity'),
);
const ExamActivity = lazy(() => import('@components/Activities/ExamActivity/ExamActivity'));
const CodeChallengeActivity = lazy(() => import('@components/Objects/Activities/CodeChallenge/CodeChallengeActivity'));
const AIActivityAsk = lazy(() => import('@components/Objects/Activities/AI/AIActivityAsk'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex h-64 items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

// AlertDialog helper for unmark activity
interface UnmarkActivityDialogProps {
  onConfirm: () => Promise<void> | void;
  t: (key: string) => string;
}

function UnmarkActivityDialog({ onConfirm, t }: UnmarkActivityDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      await onConfirm();
      setIsOpen(false);
    });
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        render={
          <div className="soft-shadow flex flex-col rounded-md bg-teal-600 p-2.5 px-4 text-white transition delay-150 duration-300 ease-in-out hover:cursor-pointer">
            <span className="mb-1 text-[10px] font-bold uppercase">{t('status')}</span>
            <div className="flex items-center space-x-2">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                />
                <path d="M7 12l3 3 7-7" />
              </svg>
              <span className="text-xs font-bold">{t('statusComplete')}</span>
            </div>
          </div>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="text-destructive size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('unmarkDialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('unmarkConfirmation')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('unmarkActivity')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// AlertDialog helper for submit assignment
interface SubmitAssignmentDialogProps {
  onSubmit: () => Promise<void> | void;
  t: (key: string) => string;
}

function SubmitAssignmentDialog({ onSubmit, t }: SubmitAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(async () => {
      await onSubmit();
      setIsOpen(false);
    });
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        render={
          <div className="soft-shadow flex flex-col rounded-md bg-cyan-800 p-2.5 px-4 text-white transition delay-150 duration-300 ease-in-out hover:cursor-pointer">
            <span className="mb-1 text-[10px] font-bold uppercase">{t('status')}</span>
            <div className="flex items-center space-x-2">
              <BookOpenCheck size={17} />
              <span className="text-xs font-bold">{t('assignmentActions.submitForGrading')}</span>
            </div>
          </div>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Info className="text-primary size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('assignmentActions.submitYourAssingmentForGrading')}</AlertDialogTitle>
          <AlertDialogDescription>{t('assignmentActions.submitConfirm')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('assignmentActions.submit')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ActivityClientProps {
  activityid: string;
  courseuuid: string;
  activity: Activity | null;
  course: CourseStructure;
}

interface ActivityActionsProps {
  activity: Activity | null;
  activityid: string;
  course: CourseStructure;
  assignment: { assignment_uuid: string } | null;
  showNavigation?: boolean;
}

// Custom hook for activity position
function useActivityPosition(course: CourseStructure, activityId: string) {
  const allActivities: (Activity & { cleanUuid?: string; chapterName?: string })[] = [];
  let currentIndex = -1;

  course.chapters.forEach((chapter: Chapter) => {
    chapter.activities?.forEach((activity: Activity) => {
      const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
      allActivities.push({
        ...activity,
        cleanUuid: cleanActivityUuid,
        chapterName: chapter.name,
      });

      if (cleanActivityUuid === activityId.replace('activity_', '')) {
        currentIndex = allActivities.length - 1;
      }
    });
  });

  return { allActivities, currentIndex };
}

const ActivityActions = ({ activity, activityid, course, assignment, showNavigation = true }: ActivityActionsProps) => {
  const t = useTranslations('ActivityPage');
  const { contributorStatus } = useContributorStatus(course.course_uuid);
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const isAuthenticated = session.status === 'authenticated';

  // Add SWR for trail data
  const TRAIL_KEY = getTrailSwrKey();
  const { data: trailData } = useSWR(TRAIL_KEY && access_token ? [TRAIL_KEY, access_token] : null, ([url, token]) =>
    swrFetcher(url, token),
  );

  return (
    <div className="flex items-center space-x-2">
      {activity &&
      (activity.published === true || contributorStatus === 'ACTIVE') &&
      (activity.content.paid_access !== false || contributorStatus === 'ACTIVE') &&
      isAuthenticated ? (
        <>
          {activity.activity_type !== 'TYPE_ASSIGNMENT' && (
            <MarkStatus
              activity={activity}
              activityid={activityid}
              course={course}
              trailData={trailData}
              t={t}
            />
          )}
          {activity.activity_type === 'TYPE_ASSIGNMENT' && assignment?.assignment_uuid ? (
            <AssignmentSubmissionProvider assignment_uuid={assignment.assignment_uuid}>
              <AssignmentTools
                assignment={assignment}
                activity={activity}
                activityid={activityid}
                course={course}
                t={t}
              />
            </AssignmentSubmissionProvider>
          ) : null}
          {showNavigation ? (
            <NextActivityButton
              course={course}
              currentActivityId={activity.id}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
};

// Helper to ensure Tiptap always receives a valid document
function getValidTiptapContent(content: any): any {
  if (content && typeof content === 'object' && content.type === 'doc' && Array.isArray(content.content)) {
    return content;
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

const ActivityClient = (props: ActivityClientProps) => {
  const { activityid } = props;
  const { courseuuid } = props;
  const { activity } = props;
  const { course } = props;
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const isAuthenticated = session.status === 'authenticated';
  const org = usePlatform();
  const [assignment, setAssignment] = useState(null) as any;
  const [isFocusMode, setIsFocusMode] = useState(() => {
    if (typeof globalThis.window !== 'undefined') {
      const saved = localStorage.getItem('globalFocusMode');
      return saved === 'true';
    }
    return false;
  });

  // Track whether focus mode was auto-initiated (e.g., by starting a quiz) so we can hide manual toggles
  const [isAutoFocusInitiated, setIsAutoFocusInitiated] = useState(() => {
    try {
      return typeof globalThis.window !== 'undefined' && localStorage.getItem('globalFocusModeInitiated') === 'true';
    } catch {
      return false;
    }
  });

  const [isInitialRender, setIsInitialRender] = useState(true);
  const { contributorStatus } = useContributorStatus(courseuuid);
  const router = useRouter();
  const t = useTranslations('ActivityPage');
  const locale = useLocale();
  const format = useFormatter();

  const bgColor = (() => {
    if (!activity) return 'bg-white';

    if (activity.activity_type === 'TYPE_DYNAMIC' || activity.activity_type === 'TYPE_ASSIGNMENT') {
      return isFocusMode ? 'bg-white' : 'bg-white soft-shadow';
    }
    return isFocusMode ? 'bg-background' : 'bg-background soft-shadow';
  })();

  // Helper to get relative time using next-intl
  const getRelativeTimeIntl = (date: Date) => {
    const now = new Date();
    return format.relativeTime(date, now);
  };

  // Add SWR for trail data
  const TRAIL_KEY = getTrailSwrKey();
  const { data: trailData } = useSWR(TRAIL_KEY && access_token ? [TRAIL_KEY, access_token] : null, ([url, token]) =>
    swrFetcher(url, token),
  );

  const { allActivities, currentIndex } = useActivityPosition(course, activityid);

  // Get previous and next activities
  const prevActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  const nextActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;

  const activityContent = (() => {
    // If no activity is provided, nothing to render
    if (!activity) {
      return null;
    }

    // Allow teachers (ACTIVE contributors) to view content even when unpublished or paid-locked
    if (!activity?.published && contributorStatus !== 'ACTIVE') {
      return null;
    }
    if (activity?.content?.paid_access === false && contributorStatus !== 'ACTIVE') {
      return null;
    }

    switch (activity.activity_type) {
      case 'TYPE_DYNAMIC': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Canva
              content={getValidTiptapContent(activity.content)}
              activity={activity}
            />
          </Suspense>
        );
      }
      case 'TYPE_VIDEO': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <VideoActivity
              course={course}
              activity={activity as any}
            />
          </Suspense>
        );
      }
      case 'TYPE_DOCUMENT': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <DocumentPdfActivity
              course={course}
              activity={activity}
            />
          </Suspense>
        );
      }
      case 'TYPE_ASSIGNMENT': {
        return assignment?.assignment_uuid ? (
          <Suspense fallback={<LoadingFallback />}>
            <AssignmentProvider assignment_uuid={assignment.assignment_uuid}>
              <AssignmentsTaskProvider>
                <AssignmentSubmissionProvider assignment_uuid={assignment.assignment_uuid}>
                  <AssignmentStudentActivity />
                </AssignmentSubmissionProvider>
              </AssignmentsTaskProvider>
            </AssignmentProvider>
          </Suspense>
        ) : null;
      }
      case 'TYPE_EXAM': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ExamActivity
              activity={activity}
              course={course}
            />
          </Suspense>
        );
      }
      case 'TYPE_CODE_CHALLENGE': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <CodeChallengeActivity
              activity={activity}
              course={course}
            />
          </Suspense>
        );
      }
      default: {
        return null;
      }
    }
  })();

  // Navigate to an activity
  const navigateToActivity = (activityToNavigate: any) => {
    if (!activityToNavigate) return;

    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${activityToNavigate.cleanUuid}`);
  };

  // Save focus mode to localStorage when it changes
  const initialRenderRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof globalThis.window !== 'undefined') {
      localStorage.setItem('globalFocusMode', isFocusMode.toString());
      // Dispatch custom event for focus mode change
      globalThis.dispatchEvent(
        new CustomEvent('focusModeChange', {
          detail: { isFocusMode },
        }),
      );
      // Mark as no longer initial render after first change
      if (isInitialRender) {
        if (initialRenderRafRef.current) cancelAnimationFrame(initialRenderRafRef.current);
        initialRenderRafRef.current = requestAnimationFrame(() => setIsInitialRender(false));
        return () => {
          if (initialRenderRafRef.current) cancelAnimationFrame(initialRenderRafRef.current);
        };
      }
    }
    return;
  }, [isFocusMode, isInitialRender]);

  // Listen for the auto-initiated flag to hide manual toggles immediately
  useEffect(() => {
    const handler = () => {
      try {
        setIsAutoFocusInitiated(localStorage.getItem('globalFocusModeInitiated') === 'true');
      } catch {
        setIsAutoFocusInitiated(false);
      }
    };

    globalThis.addEventListener('focusModeChange', handler as EventListener);
    globalThis.addEventListener('storage', handler);

    // Run once to initialize
    handler();

    return () => {
      globalThis.removeEventListener('focusModeChange', handler as EventListener);
      globalThis.removeEventListener('storage', handler);
    };
  }, []);

  const getChapterNameByActivityId = (courseData: any, activity_id: number) => {
    for (let i = 0; i < courseData.chapters.length; i += 1) {
      const chapter = courseData.chapters[i];
      for (let j = 0; j < chapter.activities.length; j += 1) {
        const activityItem = chapter.activities[j];
        if (activityItem.id === activity_id) {
          return `${t('chapter')} ${i + 1} : ${chapter.name}`;
        }
      }
    }
    return null;
  };

  // Load assignment data when activity changes
  useEffect(() => {
    const loadAssignment = async () => {
      if (!activity?.activity_uuid || !access_token) return;
      const res = await getAssignmentFromActivityUUID(activity.activity_uuid, access_token);
      setAssignment(res.data);
    };

    if (activity?.activity_type === 'TYPE_ASSIGNMENT') {
      loadAssignment();
    }
  }, [activity?.activity_uuid, activity?.activity_type, access_token, setAssignment]);

  return (
    <CourseProvider courseuuid={course?.course_uuid}>
      <Suspense fallback={<LoadingFallback />}>
        <AIChatBotProvider>
          {isFocusMode ? (
            <AnimatePresence>
              <motion.div
                initial={isInitialRender ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 z-50 bg-white"
              >
                {/* Focus Mode Top Bar */}
                <motion.div
                  initial={isInitialRender ? false : { y: -100 }}
                  animate={{ y: 0 }}
                  exit={{ y: -100 }}
                  transition={{ duration: 0.3 }}
                  className="fixed top-0 right-0 left-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-xl"
                >
                  <div className="container mx-auto px-4 py-2">
                    <div className="flex h-14 items-center justify-between">
                      {/* Progress Indicator - Moved to left */}
                      <motion.div
                        initial={isInitialRender ? false : { opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center space-x-2"
                      >
                        <div className="relative h-8 w-8">
                          <svg className="h-full w-full -rotate-90">
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              stroke="#e5e7eb"
                              strokeWidth="3"
                              fill="none"
                            />
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              stroke="#10b981"
                              strokeWidth="3"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={2 * Math.PI * 14}
                              strokeDashoffset={
                                2 *
                                Math.PI *
                                14 *
                                (1 -
                                  (trailData?.runs
                                    ?.find((run: any) => run.course_uuid === course.course_uuid)
                                    ?.steps?.filter((step: any) => step.complete)?.length || 0) /
                                    (course.chapters?.reduce(
                                      (acc: number, chapter: any) => acc + chapter.activities.length,
                                      0,
                                    ) || 1))
                              }
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-800">
                              {Math.round(
                                ((trailData?.runs
                                  ?.find((run: any) => run.course_uuid === course.course_uuid)
                                  ?.steps?.filter((step: any) => step.complete)?.length || 0) /
                                  (course.chapters?.reduce(
                                    (acc: number, chapter: any) => acc + chapter.activities.length,
                                    0,
                                  ) || 1)) *
                                  100,
                              )}
                              %
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-600">
                          {trailData?.runs
                            ?.find((run: any) => run.course_uuid === course.course_uuid)
                            ?.steps?.filter((step: any) => step.complete)?.length || 0}{' '}
                          {t('of')}{' '}
                          {course.chapters?.reduce((acc: number, chapter: any) => acc + chapter.activities.length, 0) ||
                            0}
                        </div>
                      </motion.div>

                      {/* Center Course Info */}
                      <motion.div
                        initial={isInitialRender ? false : { opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex items-center space-x-4"
                      >
                        <div className="flex">
                          <Link
                            prefetch={false}
                            href={`${getAbsoluteUrl('')}/course/${courseuuid}`}
                          >
                            <img
                              className="h-[34px] w-[60px] rounded-md drop-shadow-md"
                              src={
                                course.thumbnail_image
                                  ? `${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}`
                                  : '/empty_thumbnail.webp'
                              }
                              alt=""
                            />
                          </Link>
                        </div>
                        <div className="flex flex-col -space-y-1">
                          <p className="text-sm font-bold text-gray-700">{t('courseTitle')} </p>
                          <h1 className="text-lg font-bold text-gray-950 first-letter:uppercase">{course.name}</h1>
                        </div>
                      </motion.div>

                      {/* Minimize and Chapters - Moved to right */}
                      <motion.div
                        initial={isInitialRender ? false : { opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center space-x-2"
                      >
                        <ActivityChapterDropdown
                          course={course}
                          currentActivityId={
                            activity?.activity_uuid
                              ? activity.activity_uuid.replace('activity_', '')
                              : activityid.replace('activity_', '')
                          }
                          trailData={trailData}
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setIsFocusMode(false);
                          }}
                          className="soft-shadow cursor-pointer rounded-full bg-white p-2 hover:bg-gray-50"
                          title={t('exitFocusMode')}
                        >
                          <Minimize2
                            size={16}
                            className="text-gray-700"
                          />
                        </motion.button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>

                {/* Focus Mode Content */}
                <div className="h-full overflow-auto pt-16 pb-20">
                  <div className="container mx-auto px-4">
                    {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                      activity.content.paid_access === false && contributorStatus !== 'ACTIVE' ? (
                        <PaidCourseActivityDisclaimer course={course} />
                      ) : (
                        <motion.div
                          initial={isInitialRender ? false : { scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className={`rounded-lg p-7 ${bgColor} mt-4`}
                        >
                          {/* Activity Types */}
                          <div>{activityContent}</div>
                        </motion.div>
                      )
                    ) : null}
                  </div>
                </div>

                {/* Focus Mode Bottom Bar */}
                {activity &&
                (activity.published === true || contributorStatus === 'ACTIVE') &&
                (activity.content.paid_access !== false || contributorStatus === 'ACTIVE') ? (
                  <motion.div
                    initial={isInitialRender ? false : { y: 100 }}
                    animate={{ y: 0 }}
                    exit={{ y: 100 }}
                    transition={{ duration: 0.3 }}
                    className="fixed right-0 bottom-0 left-0 z-50 border-t border-gray-100 bg-white/90 backdrop-blur-xl"
                  >
                    <div className="container mx-auto px-4">
                      <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              navigateToActivity(prevActivity);
                            }}
                            className={`flex cursor-pointer items-center space-x-1.5 rounded-md p-2 transition-all duration-200 ${
                              prevActivity ? 'text-gray-700' : 'cursor-not-allowed text-gray-400 opacity-50'
                            }`}
                            disabled={!prevActivity}
                            title={
                              prevActivity
                                ? t('previousActivityTooltip', {
                                    activityName: prevActivity.name ?? '',
                                  })
                                : t('noPreviousActivity')
                            }
                          >
                            <ChevronLeft
                              size={20}
                              className="shrink-0 text-gray-800"
                            />
                            <div className="flex flex-col items-start">
                              <span className="text-xs text-gray-500">{t('previous')}</span>
                              <span className="text-left text-sm font-semibold capitalize">
                                {prevActivity ? prevActivity.name : t('noPreviousActivity')}
                              </span>
                            </div>
                          </button>
                        </div>
                        <div className="flex items-center space-x-2">
                          <ActivityActions
                            activity={activity}
                            activityid={activityid}
                            course={course}
                            assignment={assignment}
                            showNavigation={false}
                          />
                          <button
                            onClick={() => {
                              navigateToActivity(nextActivity);
                            }}
                            className={`flex cursor-pointer items-center space-x-1.5 rounded-md p-2 transition-all duration-200 ${
                              nextActivity ? 'text-gray-700' : 'cursor-not-allowed text-gray-400 opacity-50'
                            }`}
                            disabled={!nextActivity}
                            title={
                              nextActivity
                                ? t('nextActivityTooltip', {
                                    activityName: nextActivity.name ?? '',
                                  })
                                : t('noNextActivity')
                            }
                          >
                            <div className="flex flex-col items-end">
                              <span className="text-xs text-gray-500">{t('next')}</span>
                              <span className="text-right text-sm font-semibold capitalize">
                                {nextActivity ? nextActivity.name : t('noNextActivity')}
                              </span>
                            </div>
                            <ChevronRight
                              size={20}
                              className="shrink-0 text-gray-800"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          ) : (
            <GeneralWrapper>
              {/* Original non-focus mode UI */}
              {activityid === 'end' ? (
                <CourseEndView
                  courseName={course.name ?? ''}
                  courseUuid={course.course_uuid}
                  thumbnailImage={course.thumbnail_image ?? ''}
                  course={course}
                  trailData={trailData}
                />
              ) : (
                <div className="space-y-4 pt-0">
                  <div className="pt-2">
                    <ActivityBreadcrumbs
                      course={course}
                      activity={activity}
                    />
                    <div className="activity-info-section space-y-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex space-x-6">
                          <div className="flex">
                            <Link
                              prefetch={false}
                              href={`${getAbsoluteUrl('')}/course/${courseuuid}`}
                            >
                              <img
                                className="h-[57px] w-[100px] rounded-md drop-shadow-md"
                                src={
                                  course.thumbnail_image
                                    ? `${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}`
                                    : '/empty_thumbnail.webp'
                                }
                                alt=""
                              />
                            </Link>
                          </div>
                          <div className="flex flex-col -space-y-1">
                            <p className="text-base font-bold text-gray-700">{t('courseTitle')} </p>
                            <h1 className="text-3xl font-bold text-gray-950 first-letter:uppercase">{course.name}</h1>
                          </div>
                        </div>
                      </div>

                      <ActivityIndicators
                        course_uuid={courseuuid}
                        current_activity={activityid}
                        course={course}
                        enableNavigation
                        trailData={trailData}
                      />

                      <div className="flex w-full items-center justify-between">
                        <div className="flex flex-1/3 items-center space-x-3">
                          <div className="flex flex-col -space-y-1">
                            <p className="text-base font-bold text-gray-700">
                              {getChapterNameByActivityId(course, activity!.id)}
                            </p>
                            <h1 className="text-2xl font-bold text-gray-950 first-letter:uppercase">
                              {activity!.name}
                            </h1>
                            {/* Authors and Dates Section */}
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              {/* Avatars */}
                              {course.authors && course.authors.length > 0 ? (
                                <div className="flex -space-x-3">
                                  {course.authors
                                    .filter((a: any) => a.authorship_status === 'ACTIVE')
                                    .slice(0, 3)
                                    .map((author: any, _idx: number) => (
                                      <div
                                        key={author.user.user_uuid}
                                        className="relative z-[${10-idx}]"
                                      >
                                        <UserAvatar
                                          size="sm"
                                          variant="outline"
                                          avatar_url={
                                            author.user.avatar_image
                                              ? getUserAvatarMediaDirectory(
                                                  author.user.user_uuid,
                                                  author.user.avatar_image,
                                                )
                                              : ''
                                          }
                                          predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
                                          showProfilePopup
                                          userId={author.user.id}
                                        />
                                      </div>
                                    ))}
                                  {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length > 3 && (
                                    <div className="z-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-xs font-medium text-neutral-600 shadow-sm">
                                      +{course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length - 3}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                              {/* Author names */}
                              {course.authors && course.authors.length > 0 ? (
                                <div className="flex items-center gap-1 text-xs font-medium text-gray-700">
                                  {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length > 1 && (
                                    <span>{t('coCreatedBy')} </span>
                                  )}
                                  {course.authors
                                    .filter((a: any) => a.authorship_status === 'ACTIVE')
                                    .slice(0, 2)
                                    .map((author: any, idx: number, arr: any[]) => (
                                      <span key={author.user.user_uuid}>
                                        {author.user.first_name && author.user.last_name
                                          ? [author.user.first_name, author.user.middle_name, author.user.last_name]
                                              .filter(Boolean)
                                              .join(' ')
                                          : `@${author.user.username}`}
                                        {idx === 0 && arr.length > 1 ? ' & ' : ''}
                                      </span>
                                    ))}
                                  {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length > 2 && (
                                    <ToolTip
                                      content={
                                        <div className="p-2">
                                          {course.authors
                                            .filter((a: any) => a.authorship_status === 'ACTIVE')
                                            .slice(2)
                                            .map((author: any) => (
                                              <div
                                                key={author.user.user_uuid}
                                                className="py-1 text-sm text-white"
                                              >
                                                {author.user.first_name && author.user.last_name
                                                  ? [
                                                      author.user.first_name,
                                                      author.user.middle_name,
                                                      author.user.last_name,
                                                    ]
                                                      .filter(Boolean)
                                                      .join(' ')
                                                  : `@${author.user.username}`}
                                              </div>
                                            ))}
                                        </div>
                                      }
                                    >
                                      <div className="cursor-pointer rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors duration-200 hover:bg-gray-200">
                                        +
                                        {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length - 2}
                                      </div>
                                    </ToolTip>
                                  )}
                                </div>
                              ) : null}
                              {/* Dates */}
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>
                                  {t('createdOn')}{' '}
                                  {new Date(course.creation_date).toLocaleDateString(locale, {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                                <span className="mx-1">•</span>
                                <span>
                                  {t('lastUpdated')}{' '}
                                  {getRelativeTimeIntl(
                                    new Date(course.updated_at || course.last_updated || course.creation_date),
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {activity &&
                          (activity.published === true || contributorStatus === 'ACTIVE') &&
                          (activity.content.paid_access !== false || contributorStatus === 'ACTIVE') &&
                          isAuthenticated ? (
                            <>
                              {activity.activity_type !== 'TYPE_ASSIGNMENT' && (
                                <>
                                  <AIActivityAsk activity={activity} />
                                  <ActivityChapterDropdown
                                    course={course}
                                    currentActivityId={
                                      activity.activity_uuid
                                        ? activity.activity_uuid.replace('activity_', '')
                                        : activityid.replace('activity_', '')
                                    }
                                    trailData={trailData}
                                  />
                                  {contributorStatus === 'ACTIVE' && activity.activity_type === 'TYPE_DYNAMIC' && (
                                    <Link
                                      prefetch={false}
                                      href={`${getAbsoluteUrl('')}/course/${courseuuid}/activity/${activityid}/edit`}
                                      className="flex items-center space-x-2 rounded-full bg-emerald-600 p-2.5 px-5 text-white drop-shadow-md transition delay-150 duration-300 ease-in-out hover:cursor-pointer"
                                    >
                                      <Edit2 size={17} />
                                      <span className="text-xs font-bold">{t('contribute')}</span>
                                    </Link>
                                  )}
                                </>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {activity && activity.published === false && contributorStatus !== 'ACTIVE' ? (
                      <div className="rounded-lg bg-gray-800 p-7 drop-shadow-xs">
                        <div className="text-white">
                          <h1 className="text-2xl font-bold">{t('activityNotPublished')}</h1>
                        </div>
                      </div>
                    ) : null}

                    {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                      activity.content.paid_access === false ? (
                        <PaidCourseActivityDisclaimer course={course} />
                      ) : (
                        <div className={`rounded-lg p-7 drop-shadow-xs ${bgColor} relative`}>
                          {!isAutoFocusInitiated && (
                            <button
                              onClick={() => {
                                setIsFocusMode(true);
                              }}
                              className="soft-shadow group pointer-events-auto absolute top-4 right-4 z-50 cursor-pointer overflow-hidden rounded-full bg-white/80 p-2 transition-all duration-200 hover:bg-white"
                              title={t('enterFocusMode')}
                            >
                              <div className="flex items-center">
                                <Maximize2
                                  size={16}
                                  className="text-gray-700"
                                />
                                <span className="w-0 text-xs font-bold whitespace-nowrap text-gray-700 opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:w-auto group-hover:opacity-100">
                                  {t('focusMode')}
                                </span>
                              </div>
                            </button>
                          )}
                          {activityContent}
                        </div>
                      )
                    ) : null}

                    {/* Activity Actions below the content box */}
                    {activity &&
                    (activity.published === true || contributorStatus === 'ACTIVE') &&
                    (activity.content.paid_access !== false || contributorStatus === 'ACTIVE') ? (
                      <div className="mt-4 flex w-full items-center justify-between">
                        <div>
                          <PreviousActivityButton
                            course={course}
                            currentActivityId={activity.id}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <ActivityActions
                            activity={activity}
                            activityid={activityid}
                            course={course}
                            assignment={assignment}
                            showNavigation={false}
                          />
                          <NextActivityButton
                            course={course}
                            currentActivityId={activity.id}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Fixed Activity Secondary Bar */}
                    {activity &&
                    (activity.published === true || contributorStatus === 'ACTIVE') &&
                    (activity.content.paid_access !== false || contributorStatus === 'ACTIVE') ? (
                      <FixedActivitySecondaryBar
                        course={course}
                        currentActivityId={activityid}
                        activity={activity}
                      />
                    ) : null}

                    <div className="h-[100px]" />
                  </div>
                </div>
              )}
            </GeneralWrapper>
          )}
        </AIChatBotProvider>
      </Suspense>
    </CourseProvider>
  );
};

export const MarkStatus = (props: {
  activity: any;
  activityid: string;
  course: any;
  trailData: any;
  t: ReturnType<typeof useTranslations<'ActivityPage'>>;
}) => {
  const { t } = props;
  const router = useRouter();
  const session = usePlatformSession() as any;
  const [isLoading, setIsLoading] = useState(false);

  // Gamification state via unified context
  const gamificationContext = useOptionalGamificationContext();
  const refetchGamification = gamificationContext?.refetch ?? (async () => {});

  // Track completed activities to prevent duplicate XP toasts
  const completedActivitiesRef = useRef<Set<string>>(new Set());

  const areAllActivitiesCompleted = () => {
    const run = props.trailData?.runs?.find((run: any) => run.course_uuid === props.course.course_uuid);
    if (!run) return false;

    let totalActivities = 0;
    let completedActivities = 0;

    props.course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((activity: any) => {
        totalActivities += 1;
        const isCompleted = run.steps.find(
          (step: any) => step.activity_uuid === activity.activity_uuid && step.complete === true,
        );
        if (isCompleted) {
          completedActivities += 1;
        }
      });
    });

    return completedActivities >= totalActivities - 1;
  };

  const markActivityAsCompleteFront = async () => {
    try {
      const willCompleteAll = areAllActivitiesCompleted();
      setIsLoading(true);

      await markActivityAsComplete(props.activity.activity_uuid, session.data?.tokens?.access_token);

      await mutate([getTrailSwrKey(), session.data?.tokens?.access_token]);

      // Show XP feedback and update profile
      if (gamificationContext) {
        // Only show XP toast if we haven't already shown it for this activity
        const activityKey = `${props.activity.id}`;
        if (!completedActivitiesRef.current.has(activityKey)) {
          completedActivitiesRef.current.add(activityKey);
          // Show XP toast immediately (backend already awarded XP, this is just UI feedback)
          gamificationContext.showXPToast(25, 'activity_completion', false);
        }

        // Refetch in background to update profile with actual XP from backend
        refetchGamification().catch((error: unknown) => console.error('Failed to refetch gamification:', error));
      } else {
        // Fallback for non-gamified orgs
        toast.success(t('activityCompleted'));
      }

      if (willCompleteAll) {
        const cleanCourseUuid = props.course.course_uuid.replace('course_', '');
        router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/end`);
      }
    } catch (error) {
      console.error('Error marking activity as complete:', error);
      toast.error(t('markCompleteError'));
    } finally {
      setIsLoading(false);
    }
  };

  const unmarkActivityAsCompleteFront = async () => {
    try {
      setIsLoading(true);
      await unmarkActivityAsComplete(props.activity.activity_uuid, session.data?.tokens?.access_token);

      await mutate([getTrailSwrKey(), session.data?.tokens?.access_token]);
    } catch {
      toast.error(t('unmarkCompleteError'));
    } finally {
      setIsLoading(false);
    }
  };

  const isActivityCompleted = (() => {
    // Clean up course UUID by removing 'course_' prefix if it exists
    const cleanCourseUuid = props.course.course_uuid?.replace('course_', '');

    const run = props.trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    });

    if (run) {
      // Find the step that matches the current activity
      return run.steps.find((step: any) => step.activity_id === props.activity.id && step.complete === true);
    }
    return false;
  })();

  // Don't render until we have trail data
  if (!props.trailData) {
    return null;
  }

  return (
    <>
      {isActivityCompleted ? (
        <div className="flex items-center space-x-2">
          <div className="relative">
            <UnmarkActivityDialog
              onConfirm={unmarkActivityAsCompleteFront}
              t={t}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <div className="relative">
            <div
              className={`${isLoading ? 'opacity-90' : ''} soft-shadow flex flex-col rounded-md bg-gray-800 p-2.5 px-4 text-white transition-all duration-200 hover:cursor-pointer ${isLoading ? 'cursor-not-allowed' : 'hover:bg-gray-700'}`}
              onClick={!isLoading ? markActivityAsCompleteFront : undefined}
            >
              <span className="mb-1 text-[10px] font-bold uppercase">{t('status')}</span>
              <div className="flex items-center space-x-2">
                {isLoading ? (
                  <div className="animate-spin">
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  </div>
                ) : (
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                    />
                  </svg>
                )}
                <span className="min-w-[90px] text-xs font-bold">{isLoading ? t('marking') : t('markAsComplete')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const NextActivityButton = ({ course, currentActivityId }: { course: CourseStructure; currentActivityId: number }) => {
  const router = useRouter();
  const t = useTranslations('ActivityPage');

  const nextActivity = (() => {
    const allActivities: (Activity & { cleanUuid?: string; chapterName?: string })[] = [];
    let currentIndex = -1;

    // Flatten all activities from all chapters
    course.chapters.forEach((chapter: Chapter) => {
      chapter.activities?.forEach((activity: Activity) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
        });

        // Check if this is the current activity
        if (activity.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    // Get next activity
    return currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;
  })();

  function navigateToActivity() {
    if (!nextActivity) return;
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${nextActivity.cleanUuid}`);
  }

  if (!nextActivity) return null;

  return (
    <div
      onClick={navigateToActivity}
      className="flex flex-col rounded-md bg-gray-200 p-2.5 px-4 text-gray-600 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] transition delay-150 duration-300 ease-in-out hover:cursor-pointer hover:bg-gray-200"
    >
      <span className="mb-1 text-[10px] font-bold text-gray-500 uppercase">{t('next')}</span>
      <div className="flex items-center space-x-1">
        <span className="max-w-[200px] truncate text-sm font-semibold">{nextActivity.name}</span>
        <ChevronRight size={17} />
      </div>
    </div>
  );
};

const PreviousActivityButton = ({
  course,
  currentActivityId,
}: {
  course: CourseStructure;
  currentActivityId: number;
}) => {
  const router = useRouter();
  const t = useTranslations('ActivityPage');

  const previousActivity = (() => {
    const allActivities: (Activity & { cleanUuid?: string; chapterName?: string })[] = [];
    let currentIndex = -1;

    // Flatten all activities from all chapters
    course.chapters.forEach((chapter: Chapter) => {
      chapter.activities?.forEach((activity: Activity) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
        });

        // Check if this is the current activity
        if (activity.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    // Get previous activity
    return currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  })();

  function navigateToActivityPrevious() {
    if (!previousActivity) return;
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${previousActivity.cleanUuid}`);
  }

  if (!previousActivity) return null;

  return (
    <div
      onClick={navigateToActivityPrevious}
      className="soft-shadow flex flex-col rounded-md bg-white p-2.5 px-4 text-gray-600 transition delay-150 duration-300 ease-in-out hover:cursor-pointer"
    >
      <span className="mb-1 text-[10px] font-bold text-gray-500 uppercase">{t('previous')}</span>
      <div className="flex items-center space-x-1">
        <ChevronLeft size={17} />
        <span className="max-w-[200px] truncate text-sm font-semibold">{previousActivity.name}</span>
      </div>
    </div>
  );
};

const AssignmentTools = (props: {
  activity: any;
  activityid: string;
  course: any;
  assignment: any;
  t: ReturnType<typeof useTranslations<'ActivityPage'>>;
}) => {
  const submissionContext = useAssignmentSubmission();
  const submission = submissionContext.submissions;
  const session = usePlatformSession() as any;
  const [finalGrade, setFinalGrade] = useState(null) as any;
  const { t } = props;

  async function submitForGradingUI() {
    if (props.assignment) {
      const res = await submitAssignmentForGrading(
        props.assignment?.assignment_uuid,
        session.data?.tokens?.access_token,
      );
      if (res.success) {
        toast.success(t('submitSuccessToast'));
        mutate(`${getAPIUrl()}assignments/${props.assignment?.assignment_uuid}/submissions/me`);
      } else {
        toast.error(t('submitErrorToast'));
      }
    }
  }

  // Load final grade when submission is graded - only fetch once and guard against unmounted component
  useEffect(() => {
    if (!(submission && submission.length > 0 && submission[0]?.submission_status === 'GRADED')) {
      return;
    }

    // If we've already loaded the final grade, skip re-fetching (prevents repeated renders)
    if (finalGrade !== null) return;

    let mounted = true;

    const loadGrade = async () => {
      try {
        const res = await getFinalGrade(
          session.data?.user?.id,
          props.assignment?.assignment_uuid,
          session.data?.tokens?.access_token,
        );

        if (mounted && res.success) {
          const { grade, max_grade, grading_type } = res.data;
          let displayGrade: string;

          switch (grading_type) {
            case 'NUMERIC': {
              displayGrade = `${grade}/${max_grade}`;
              break;
            }
            case 'PERCENTAGE': {
              const percentage = (grade / max_grade) * 100;
              displayGrade = `${percentage.toFixed(2)}%`;
              break;
            }
            default: {
              // Fallback static label to avoid pulling in possibly unstable `t` identity in deps
              displayGrade = t('unknownGradingType');
            }
          }

          setFinalGrade(displayGrade);
        }
      } catch (error) {
        // Fail silently - keep `finalGrade` null so we can retry if submission changes
        console.error('Failed to load final grade:', error);
      }
    };

    loadGrade();

    return () => {
      mounted = false;
    };
  }, [
    submission,
    session.data?.user?.id,
    props.assignment?.assignment_uuid,
    session.data?.tokens?.access_token,
    t,
    finalGrade,
    setFinalGrade,
  ]);

  if (!submission || submission.length === 0) {
    return (
      <SubmitAssignmentDialog
        onSubmit={submitForGradingUI}
        t={t}
      />
    );
  }

  // At this point, submission is guaranteed to be an array with at least one element
  const firstSubmission = submission[0];

  if (firstSubmission?.submission_status === 'SUBMITTED') {
    return (
      <div className="soft-shadow flex flex-col rounded-md bg-amber-800 p-2.5 px-4 text-white transition delay-150 duration-300 ease-in-out">
        <span className="mb-1 text-[10px] font-bold uppercase">{t('status')}</span>
        <div className="flex items-center space-x-2">
          <UserRoundPen size={17} />
          <span className="text-xs font-bold">{t('assignmentStatus.grading')}</span>
        </div>
      </div>
    );
  }

  if (firstSubmission?.submission_status === 'GRADED') {
    return (
      <div className="soft-shadow flex flex-col rounded-md bg-teal-600 p-2.5 px-4 text-white transition delay-150 duration-300 ease-in-out">
        <span className="mb-1 text-[10px] font-bold uppercase">{t('status')}</span>
        <div className="flex items-center space-x-2">
          <CheckCircle size={17} />
          <span className="flex items-center space-x-2 text-xs font-bold">
            <span>{t('assignmentStatus.graded')}</span>
            <span className="rounded-md bg-white px-1 py-0.5 text-teal-800">{finalGrade}</span>
          </span>
        </div>
      </div>
    );
  }

  // Default return in case none of the conditions are met
  return null;
};

export default ActivityClient;
