'use client';

import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  FileText,
  Layers,
  Trophy,
  Video,
} from 'lucide-react';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { getAbsoluteUrl } from '@services/config/config';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { Fragment } from 'react';

interface Props {
  course: any;
  course_uuid: string;
  current_activity?: string;
  enableNavigation?: boolean;
  trailData?: any;
}

// Helper functions
function getActivityTypeLabel(activityType: string, t: (key: string) => string): string {
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return t('activityTypes.video');
    }
    case 'TYPE_DOCUMENT': {
      return t('activityTypes.document');
    }
    case 'TYPE_DYNAMIC': {
      return t('activityTypes.interactive');
    }
    case 'TYPE_ASSIGNMENT': {
      return t('activityTypes.assignment');
    }
    case 'TYPE_EXAM': {
      return t('activityTypes.exam');
    }
    case 'TYPE_CODE_CHALLENGE': {
      return t('activityTypes.codeChallenge');
    }
    default: {
      return t('unknownActivity');
    }
  }
}

function getActivityTypeIconColor(activityType: string): string {
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return 'text-blue-500';
    }
    case 'TYPE_DOCUMENT': {
      return 'text-purple-500';
    }
    case 'TYPE_DYNAMIC': {
      return 'text-emerald-500';
    }
    case 'TYPE_ASSIGNMENT': {
      return 'text-orange-500';
    }
    case 'TYPE_EXAM': {
      return 'text-amber-500';
    }
    case 'TYPE_CODE_CHALLENGE': {
      return 'text-cyan-500';
    }
    default: {
      return 'text-gray-500';
    }
  }
}

function getActivityTypeBadgeColor(activityType: string): string {
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return 'bg-blue-50 text-blue-600 ring-1 ring-blue-200';
    }
    case 'TYPE_DOCUMENT': {
      return 'bg-purple-50 text-purple-600 ring-1 ring-purple-200';
    }
    case 'TYPE_DYNAMIC': {
      return 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200';
    }
    case 'TYPE_ASSIGNMENT': {
      return 'bg-orange-50 text-orange-600 ring-1 ring-orange-200';
    }
    case 'TYPE_EXAM': {
      return 'bg-amber-50 text-amber-600 ring-1 ring-amber-200';
    }
    case 'TYPE_CODE_CHALLENGE': {
      return 'bg-cyan-50 text-cyan-600 ring-1 ring-cyan-200';
    }
    default: {
      return 'bg-gray-50 text-gray-600 ring-1 ring-gray-200';
    }
  }
}

const ActivityTypeIcon = ({ activityType, size = 14 }: { activityType: string; size?: number }) => {
  const colorClass = getActivityTypeIconColor(activityType);
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return (
        <Video
          size={size}
          className={colorClass}
        />
      );
    }
    case 'TYPE_DOCUMENT': {
      return (
        <FileText
          size={size}
          className={colorClass}
        />
      );
    }
    case 'TYPE_DYNAMIC': {
      return (
        <Layers
          size={size}
          className={colorClass}
        />
      );
    }
    case 'TYPE_ASSIGNMENT': {
      return (
        <BookOpenCheck
          size={size}
          className={colorClass}
        />
      );
    }
    case 'TYPE_EXAM': {
      return (
        <ClipboardList
          size={size}
          className={colorClass}
        />
      );
    }
    case 'TYPE_CODE_CHALLENGE': {
      return (
        <Code2
          size={size}
          className={colorClass}
        />
      );
    }
    default: {
      return (
        <FileText
          size={size}
          className={colorClass}
        />
      );
    }
  }
};

const ActivityTooltipContent = ({
  activity,
  isDone,
  isCurrent,
}: {
  activity: any;
  isDone: boolean;
  isCurrent: boolean;
}) => {
  const t = useTranslations('ActivityIndicators');
  return (
    <div className="min-w-[220px] rounded-xl bg-white p-4 shadow-lg ring-1 ring-gray-100">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getActivityTypeBadgeColor(activity.activity_type).split(' ')[0]}`}
        >
          <ActivityTypeIcon
            activityType={activity.activity_type}
            size={16}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{activity.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{getActivityTypeLabel(activity.activity_type, t)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
            isCurrent
              ? 'bg-blue-50 text-blue-600'
              : isDone
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-gray-50 text-gray-500'
          }`}
        >
          {isDone && (
            <Check
              size={12}
              className="stroke-[2.5]"
            />
          )}
          {isCurrent ? t('currentActivity') : isDone ? t('completed') : t('notStarted')}
        </span>
      </div>
    </div>
  );
};

const ChapterTooltipContent = ({
  chapter,
  chapterNumber,
  totalActivities,
  completedActivities,
}: {
  chapter: any;
  chapterNumber: number;
  totalActivities: number;
  completedActivities: number;
}) => {
  const t = useTranslations('ActivityIndicators');
  const progress = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;
  const isComplete = completedActivities === totalActivities;

  return (
    <div className="min-w-[200px] rounded-xl bg-white p-4 shadow-lg ring-1 ring-gray-100">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
            isComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {isComplete ? (
            <Check
              size={16}
              className="stroke-[2.5]"
            />
          ) : (
            chapterNumber
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">
            {t('chapter')} {chapterNumber}
          </p>
          <p className="truncate text-sm font-medium text-gray-900">{chapter.name}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{t('progress')}</span>
          <span className={`font-medium ${isComplete ? 'text-emerald-600' : 'text-gray-700'}`}>
            {completedActivities}/{totalActivities} {t('completed')}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const CertificationBadge = ({ courseid, isCompleted }: { courseid: string; isCompleted: boolean }) => {
  const t = useTranslations('Certificates.ActivityIndicators');
  return (
    <ToolTip
      sideOffset={8}
      unstyled
      content={
        <div className="min-w-[200px] rounded-xl bg-white p-4 shadow-lg ring-1 ring-gray-100">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isCompleted ? 'bg-gradient-to-br from-yellow-400 to-orange-400' : 'bg-gray-100'
              }`}
            >
              <Trophy
                size={20}
                className={isCompleted ? 'text-white' : 'text-gray-400'}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {isCompleted ? t('certificationAvailable') : t('earnCertificate')}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {isCompleted ? t('viewCertificate') : t('completeAllActivities')}
              </p>
            </div>
          </div>
        </div>
      }
    >
      <Link
        href={`${getAbsoluteUrl('')}/course/${courseid}/activity/end`}
        prefetch={false}
        className={`ml-3 flex items-center transition-all duration-200 focus:outline-none ${
          isCompleted ? 'opacity-100' : 'pointer-events-none opacity-40'
        }`}
        aria-disabled={!isCompleted}
      >
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 ${
            isCompleted
              ? 'bg-gradient-to-br from-yellow-400 to-orange-400 shadow-sm hover:scale-105 hover:shadow-md'
              : 'bg-gray-100'
          }`}
        >
          <Trophy
            size={14}
            className={isCompleted ? 'text-white' : 'text-gray-400'}
          />
        </div>
      </Link>
    </ToolTip>
  );
};

const ActivityIndicators = (props: Props) => {
  const t = useTranslations('ActivityIndicators');
  const { course } = props;
  const courseid = props.course_uuid.replace('course_', '');
  const { enableNavigation } = props;
  const router = useRouter();

  // Flatten all activities for navigation and rendering
  const allActivities = course.chapters.flatMap((chapter: any) =>
    chapter.activities.map((activity: any) => ({
      ...activity,
      chapterId: chapter.id,
    })),
  );

  // Find current activity index
  const currentActivityIndex = props.current_activity
    ? allActivities.findIndex(
        (activity: any) => activity.activity_uuid.replace('activity_', '') === props.current_activity,
      )
    : -1;

  function isActivityDone(activity: any) {
    // Clean up course UUID by removing 'course_' prefix if it exists
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');

    const run = props.trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    });

    if (run) {
      return run.steps.find((step: any) => step.activity_id === activity.id && step.complete === true);
    }
    return false;
  }

  function isActivityCurrent(activity: any) {
    const activity_uuid = activity.activity_uuid.replace('activity_', '');
    return Boolean(props.current_activity && props.current_activity === activity_uuid);
  }

  // Keep the allActivities array for navigation purposes only
  function navigateToPrevious() {
    if (currentActivityIndex > 0) {
      const prevActivity = allActivities[currentActivityIndex - 1];
      const activityId = prevActivity.activity_uuid.replace('activity_', '');
      router.push(`${getAbsoluteUrl('')}/course/${courseid}/activity/${activityId}`);
    }
  }

  function navigateToNext() {
    if (currentActivityIndex < allActivities.length - 1) {
      const nextActivity = allActivities[currentActivityIndex + 1];
      const activityId = nextActivity.activity_uuid.replace('activity_', '');
      router.push(`${getAbsoluteUrl('')}/course/${courseid}/activity/${activityId}`);
    }
  }

  // Add function to count completed activities in a chapter
  function getChapterProgress(chapterActivities: any[]) {
    return chapterActivities.reduce((acc, activity) => acc + (isActivityDone(activity) ? 1 : 0), 0);
  }

  // Check if all activities are completed
  const totalActivitiesCount = allActivities.length;
  const completedActivities = allActivities.filter((activity: any) => isActivityDone(activity)).length;
  const isCourseCompleted = totalActivitiesCount > 0 && completedActivities === totalActivitiesCount;

  return (
    <div className="flex items-center gap-3">
      {enableNavigation ? (
        <button
          onClick={navigateToPrevious}
          disabled={currentActivityIndex <= 0}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 transition-all duration-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t('previousActivity')}
        >
          <ChevronLeft
            size={18}
            className="text-gray-600"
          />
        </button>
      ) : null}

      <div className="flex flex-1 items-center gap-1 overflow-hidden rounded-full bg-gray-100 p-1">
        {course.chapters.map((chapter: any, chapterIndex: number) => {
          const completedActivities = getChapterProgress(chapter.activities);
          const isChapterComplete = completedActivities === chapter.activities.length;
          const firstActivity = chapter.activities[0];
          const firstActivityId = firstActivity?.activity_uuid?.replace('activity_', '');
          const chapterLinkHref = firstActivityId
            ? `${getAbsoluteUrl('')}/course/${courseid}/activity/${firstActivityId}`
            : undefined;

          return (
            <Fragment key={chapter.id}>
              {/* Chapter indicator */}
              <ToolTip
                sideOffset={10}
                unstyled
                content={
                  <ChapterTooltipContent
                    chapter={chapter}
                    chapterNumber={chapterIndex + 1}
                    totalActivities={chapter.activities.length}
                    completedActivities={completedActivities}
                  />
                }
              >
                {chapterLinkHref ? (
                  <Link
                    href={chapterLinkHref}
                    prefetch={false}
                    className="group relative flex shrink-0 items-center justify-center focus:outline-none"
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-200 group-hover:scale-110 ${
                        isChapterComplete
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-white text-gray-600 shadow-sm ring-1 ring-gray-200'
                      }`}
                    >
                      {isChapterComplete ? (
                        <Check
                          size={12}
                          className="stroke-[2.5]"
                        />
                      ) : (
                        chapterIndex + 1
                      )}
                    </div>
                  </Link>
                ) : (
                  <div className="relative flex shrink-0 items-center justify-center">
                    <div
                      className={`flex h-6 w-6 cursor-not-allowed items-center justify-center rounded-full text-[10px] font-semibold ${
                        isChapterComplete ? 'bg-emerald-500 text-white' : 'bg-white text-gray-400 ring-1 ring-gray-200'
                      }`}
                    >
                      {chapterIndex + 1}
                    </div>
                  </div>
                )}
              </ToolTip>

              {/* Activity bars */}
              <div className="flex flex-1 items-center gap-0.5 px-1">
                {chapter.activities.map((activity: any) => {
                  const isDone = isActivityDone(activity);
                  const isCurrent = isActivityCurrent(activity);

                  return (
                    <ToolTip
                      sideOffset={10}
                      unstyled
                      content={
                        <ActivityTooltipContent
                          activity={activity}
                          isDone={isDone}
                          isCurrent={isCurrent}
                        />
                      }
                      key={activity.activity_uuid}
                    >
                      <Link
                        prefetch={false}
                        href={`${getAbsoluteUrl('')}/course/${courseid}/activity/${activity.activity_uuid.replace(
                          'activity_',
                          '',
                        )}`}
                        className="group relative flex flex-1 items-center"
                      >
                        {/* Current activity indicator */}
                        {isCurrent && (
                          <span className="absolute inset-0 animate-pulse rounded bg-blue-400 opacity-30" />
                        )}
                        <span
                          className={`relative block h-2 w-full rounded transition-all duration-200 ${
                            isCurrent
                              ? 'bg-blue-500 ring-2 ring-blue-200'
                              : isDone
                                ? 'bg-emerald-500 group-hover:bg-emerald-600'
                                : 'bg-gray-300 group-hover:bg-gray-400'
                          }`}
                        />
                      </Link>
                    </ToolTip>
                  );
                })}
              </div>
            </Fragment>
          );
        })}

        {/* Certification Badge */}
        <CertificationBadge
          courseid={courseid}
          isCompleted={isCourseCompleted}
        />
      </div>

      {enableNavigation ? (
        <button
          onClick={navigateToNext}
          disabled={currentActivityIndex >= allActivities.length - 1}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 transition-all duration-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t('nextActivity')}
        >
          <ChevronRight
            size={18}
            className="text-gray-600"
          />
        </button>
      ) : null}
    </div>
  );
};

export default ActivityIndicators;
