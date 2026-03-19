import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server';
import { GamificationProvider } from '@/components/Contexts/GamificationContext';
import { RecentActivityFeed } from './Gamification/recent-activity-feed';
import { HeroSection } from './Gamification/hero-section';
import { Leaderboard } from './Gamification/leaderboard';
import { Skeleton } from '@/components/ui/skeleton';
import { auth } from '@/auth';

/**
 * Unified Gamification Dashboard (Server Component)
 *
 * Fetches gamification data and renders dashboard components.
 * Returns null if user is not authenticated to avoid render loops.
 */
export default async function GamificationDashboard() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // Return null early if no session (not authenticated)
    if (!session || !userId) {
      return null;
    }

    // Fetch dashboard data and leaderboard in parallel
    // Caching is handled inside the service functions via `use cache`
    const [dashboardData, leaderboardData] = await Promise.all([
      getServerGamificationDashboard(),
      getServerLeaderboard(10),
    ]);

    // If no dashboard data (error or not available), return null silently
    if (!dashboardData) {
      return null;
    }

    return (
      <GamificationProvider
        initialData={{
          dashboard: dashboardData,
          profile: dashboardData.profile,
          leaderboard: dashboardData.leaderboard ?? null,
        }}
      >
        <div className="space-y-6">
          {/* Hero Section - Main Profile & Stats */}
          <HeroSection
            profile={dashboardData.profile}
            userRank={dashboardData.user_rank}
          />

          {/* Two Column Layout */}
          <div className="grid gap-6 lg:grid-cols-2">
            <RecentActivityFeed transactions={dashboardData.recent_transactions || []} />

            {/* Right Column: Leaderboard */}
            {leaderboardData && (
              <div>
                <Leaderboard
                  entries={leaderboardData.entries}
                  currentUserId={userId || undefined}
                  userRank={dashboardData.user_rank}
                />
              </div>
            )}
          </div>
        </div>
      </GamificationProvider>
    );
  } catch (error) {
    // Silently fail - log error but don't crash the app
    console.error('Gamification dashboard error:', error);
    return null;
  }
}

/**
 * Loading Skeleton
 */
export function GamificationDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero Skeleton */}
      <Skeleton className="h-[240px]" />

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[300px]" />
        </div>
        <Skeleton className="h-[700px]" />
      </div>
    </div>
  );
}
