import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import { getServerGamificationDashboard } from '@/services/gamification/server';
import { getCollections } from '@services/courses/collections';
import LandingClassic from '@components/Landings/LandingClassic';
import { getOptionalSession } from '@/lib/get-optional-session';
import LandingCustom from '@components/Landings/LandingCustom';
import { getCourses } from '@services/courses/courses';

function isExpectedPrerenderCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('connection closed') ||
    message.includes('aborted') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  );
}

function logLandingFetchError(scope: string, error: unknown) {
  if (isExpectedPrerenderCancellation(error)) {
    return;
  }

  console.error(`[LandingContent] ${scope}:`, {
    message: error instanceof Error ? error.message : 'Unknown error',
    cause: error instanceof Error ? error.cause : undefined,
  });
}

export async function LandingContent() {
  try {
    const session = await getOptionalSession();
    const access_token = session?.tokens?.access_token;

    // Fetch organization info with detailed error handling
    let org;
    try {
      org = await getPlatformOrganizationContextInfo(access_token || undefined);
    } catch (error) {
      console.error('[LandingContent] Failed to fetch organization info:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        cause: error instanceof Error ? error.cause : undefined,
      });
      throw new Error('Unable to load the platform organization. Please check your network connection and try again.', {
        cause: error,
      });
    }

    const hasCustomLanding = org.config?.config?.landing?.enabled;

    // Only fetch gamification data if user is authenticated
    const gamificationPromise = access_token
      ? getServerGamificationDashboard(access_token).catch((error: unknown) => {
          logLandingFetchError('Gamification fetch failed', error);
          return null;
        })
      : Promise.resolve(null);

    if (hasCustomLanding) {
      const gamificationData = await gamificationPromise;

      return (
        <LandingCustom
          landing={org.config.config.landing}
          gamificationData={gamificationData}
        />
      );
    }

    const [coursesData, collections, gamificationData] = await Promise.all([
      getCourses('', access_token || undefined).catch((error: unknown) => {
        logLandingFetchError('Courses fetch failed', error);
        return { courses: [], total: 0 };
      }),
      getCollections(access_token).catch((error: unknown) => {
        logLandingFetchError('Collections fetch failed', error);
        return [];
      }),
      gamificationPromise,
    ]);

    const { courses } = coursesData;
    const totalCourses = coursesData.total;
    return (
      <LandingClassic
        courses={courses}
        totalCourses={totalCourses}
        collections={collections}
        gamificationData={gamificationData}
      />
    );
  } catch (error) {
    console.error('[LandingContent] Critical error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    });
    throw error; // Re-throw to be caught by error boundary
  }
}
