'use client';

import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { getAbsoluteUrl } from '@services/config/config';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface FixedActivitySecondaryBarProps {
  course: any;
  currentActivityId: string;
  activity: any;
}

// Navigation buttons component
const NavigationButtons = ({
  prevActivity,
  nextActivity,
  currentIndex,
  allActivities,
  navigateToActivity,
  t,
}: {
  prevActivity: any;
  nextActivity: any;
  currentIndex: number;
  allActivities: any[];
  navigateToActivity: (activity: any) => void;
  t: (key: string, values?: Record<string, any>) => string;
}) => (
  <div className="flex items-center space-x-2 sm:space-x-3">
    <button
      onClick={() => {
        navigateToActivity(prevActivity);
      }}
      className={`flex items-center space-x-1 rounded-md px-1.5 py-1.5 transition-all duration-200 sm:space-x-2 sm:px-2 ${
        prevActivity ? 'text-gray-700 hover:bg-gray-100' : 'cursor-not-allowed text-gray-300'
      }`}
      disabled={!prevActivity}
      title={
        prevActivity
          ? t('NavigationButtons.previousActivityTitle', {
              activityName: prevActivity.name,
            })
          : t('NavigationButtons.noPreviousActivity')
      }
    >
      <ChevronLeft
        size={16}
        className="shrink-0 sm:h-5 sm:w-5"
      />
      <div className="hidden flex-col items-start sm:flex">
        <span className="text-xs text-gray-500">{t('NavigationButtons.previous')}</span>
        <span className="max-w-[100px] truncate text-left text-sm font-medium sm:max-w-[150px]">
          {prevActivity ? prevActivity.name : t('NavigationButtons.noPreviousActivity')}
        </span>
      </div>
    </button>

    <span className="px-1 text-sm font-medium text-gray-500 sm:px-2">
      {t('NavigationButtons.currentOfTotal', {
        currentIndex: currentIndex + 1,
        totalActivities: allActivities.length,
      })}
    </span>

    <button
      onClick={() => {
        navigateToActivity(nextActivity);
      }}
      className="flex items-center space-x-1 rounded-md px-1.5 py-1.5 transition-all duration-200 sm:space-x-2 sm:px-2"
      disabled={!nextActivity}
      title={
        nextActivity
          ? t('NavigationButtons.nextActivityTitle', {
              activityName: nextActivity.name,
            })
          : t('NavigationButtons.noNextActivity')
      }
    >
      <div className="hidden flex-col items-end sm:flex">
        <span className={`text-xs ${nextActivity ? 'text-gray-500' : 'text-gray-500'}`}>
          {t('NavigationButtons.next')}
        </span>
        <span className="max-w-[100px] truncate text-right text-sm font-medium sm:max-w-[150px]">
          {nextActivity ? nextActivity.name : t('NavigationButtons.noNextActivity')}
        </span>
      </div>
      <ChevronRight
        size={16}
        className="shrink-0 sm:h-5 sm:w-5"
      />
    </button>
  </div>
);

// Course info component
const CourseInfo = ({
  course,
  org,
  t,
}: {
  course: any;
  org: any;
  t: (key: string, values?: Record<string, any>) => string;
}) => (
  <div className="flex min-w-0 shrink items-center space-x-2 sm:space-x-4">
    <img
      className="h-[20px] w-[35px] shrink-0 rounded-md object-cover sm:h-[26px] sm:w-[45px]"
      src={
        course.thumbnail_image
          ? `${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}`
          : '/empty_thumbnail.webp'
      }
      alt=""
    />
    <div className="hidden min-w-0 flex-col -space-y-0.5 sm:block">
      <p className="text-sm font-medium text-gray-500">{t('CourseInfo.course')}</p>
      <h1 className="truncate text-base font-semibold text-gray-900">{course.name}</h1>
    </div>
  </div>
);

export default function FixedActivitySecondaryBar(props: FixedActivitySecondaryBarProps): ReactNode {
  const router = useRouter();
  const t = useTranslations('FixedActivitySecondaryBar');
  const [isScrolled, setIsScrolled] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const mainActivityInfoRef = useRef<HTMLDivElement | null>(null);
  const org = usePlatform() as any;

  const { allActivities, currentIndex } = (() => {
    const allActivities: any[] = [];
    let currentIndex = -1;

    props.course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((activity: any) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
        });

        if (cleanActivityUuid === props.currentActivityId.replace('activity_', '')) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    return { allActivities, currentIndex };
  })();

  const prevActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  const nextActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;

  const navigateToActivity = (activity: any) => {
    if (!activity) return;

    const cleanCourseUuid = props.course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${activity.cleanUuid}`);
  };

  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 0);
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setShouldShow(!entry.isIntersecting);
        }
      },
      {
        threshold: [0, 0.1, 1],
        rootMargin: '-80px 0px 0px 0px',
      },
    );

    const mainActivityInfo = document.querySelector('.activity-info-section');
    if (mainActivityInfo) {
      mainActivityInfoRef.current = mainActivityInfo as HTMLDivElement;
      observer.observe(mainActivityInfo);
    }

    const listenerOptions = { passive: true } as any;
    window.addEventListener('scroll', handleScroll, listenerOptions);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll, listenerOptions);
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!shouldShow) return null;

  return (
    <div
      className={`fade-in slide-in-from-top animate-in fixed top-[60px] right-0 left-0 z-40 bg-white/90 backdrop-blur-xl transition-all duration-300 ${
        isScrolled ? 'soft-shadow' : ''
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between py-2">
          <CourseInfo
            course={props.course}
            org={org}
            t={t}
          />

          <div className="flex shrink-0 items-center">
            <NavigationButtons
              prevActivity={prevActivity}
              nextActivity={nextActivity}
              currentIndex={currentIndex}
              allActivities={allActivities}
              navigateToActivity={navigateToActivity}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
