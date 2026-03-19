'use client';

import type {
  DashboardData,
  GamificationError,
  PlatformLeaderboard,
  UserGamificationProfile,
  XPAwardRequest,
  XPAwardResponse,
} from '@/types/gamification';
import {
  awardXPAction,
  getDashboardDataAction,
  getLeaderboardAction,
  updatePreferencesAction,
  updateStreakAction,
} from '@/app/actions/gamification';

import React, { createContext, lazy, useContext, useEffect, useState } from 'react';
import { useXPToast } from '@/lib/gamification/components/xp-toast';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';

// Lazy load the heavy celebration component
const LevelUpCelebration = lazy(() =>
  import('@/components/Dashboard/Gamification/xp-toast').then((mod) => ({ default: mod.LevelUpCelebration })),
);

/**
 * SIMPLIFIED GAMIFICATION CONTEXT v3
 *
 * Responsibilities:
 * - UI state (animations, loading states)
 * - Server Action orchestration
 * - Optimistic UI updates
 *
 * NOT responsible for:
 * - Data fetching (handled by Server Components)
 * - Client-side caching (handled by Next.js)
 * - Complex retry logic (handled by Server Actions)
 */

interface GamificationContextValue {
  // Core Data (provided by Server Components via props)
  profile: UserGamificationProfile | null;
  dashboard: DashboardData | null;
  leaderboard: PlatformLeaderboard | null;

  // States
  isLoading: boolean;
  error: GamificationError | null;

  // Actions (Server Actions)
  awardXP: (payload: XPAwardRequest, options?: { silent?: boolean }) => Promise<XPAwardResponse>;
  updateStreak: (type: 'login' | 'learning') => Promise<void>;
  updatePreferences: (preferences: Record<string, any>) => Promise<void>;
  refetch: () => Promise<void>;

  // XP Toast notifications
  showXPToast: (amount: number, source?: string, triggeredLevelUp?: boolean) => void;
  showLevelUpCelebration: (newLevel: number) => void;

  // Computed Values
  streaks: {
    login: number;
    learning: number;
    maxLogin: number;
    maxLearning: number;
  };
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

interface GamificationProviderProps {
  children: React.ReactNode;
  initialData?: {
    profile?: UserGamificationProfile | null;
    dashboard?: DashboardData | null;
    leaderboard?: PlatformLeaderboard | null;
  };
}

export function GamificationProvider({ children, initialData }: GamificationProviderProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');

  // Server-provided data (updated via props)
  const [profile, setProfile] = useState<UserGamificationProfile | null>(initialData?.dashboard?.profile || null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(initialData?.dashboard || null);
  const [leaderboard, setLeaderboard] = useState<PlatformLeaderboard | null>(
    initialData?.dashboard?.leaderboard ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GamificationError | null>(null);

  // Circuit breaker: Track failed fetch attempts to prevent infinite retries
  const [fetchAttempts, setFetchAttempts] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const MAX_FETCH_ATTEMPTS = 3;
  const FETCH_COOLDOWN_MS = 60_000; // 1 minute cooldown after max attempts

  // XP notification system with automatic batching - MUST be stable reference
  const xpToastSystem = useXPToast();
  const showEnhancedXPToast = xpToastSystem.showXPToast;
  const { ToastContainer } = xpToastSystem;
  const [levelUpQueue, setLevelUpQueue] = useState<{ newLevel: number }[]>([]);

  // Update state when initialData changes (from server-side refetch)
  useEffect(() => {
    if (initialData?.dashboard?.profile) setProfile(initialData.dashboard.profile);
    if (initialData?.dashboard) setDashboard(initialData.dashboard);
    if (initialData?.dashboard?.leaderboard) {
      setLeaderboard(initialData.dashboard?.leaderboard ?? null);
    }
  }, [initialData]);

  // Fetch initial data if not provided (with circuit breaker)
  useEffect(() => {
    const fetchInitialData = async () => {
      // Circuit breaker: Check if we've exceeded max attempts
      const now = Date.now();
      if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
        if (now - lastFetchTime < FETCH_COOLDOWN_MS) {
          console.warn('Gamification fetch circuit breaker triggered - too many failed attempts');
          return;
        } else {
          // Reset after cooldown period
          setFetchAttempts(0);
        }
      }

      // Only fetch if we don't have profile data yet and initial data was not provided
      if (!profile && !isLoading && initialData === undefined) {
        setIsLoading(true);
        setLastFetchTime(now);
        try {
          const [dashboardData, leaderboardData] = await Promise.all([
            getDashboardDataAction(),
            getLeaderboardAction(),
          ]);

          if (dashboardData) {
            setProfile(dashboardData.profile);
            setDashboard(dashboardData);
            setFetchAttempts(0); // Reset on success
          } else {
            setFetchAttempts((prev) => prev + 1);
          }
          if (leaderboardData) {
            setLeaderboard(leaderboardData);
          }
        } catch (error) {
          console.error('Failed to fetch initial gamification data:', error);
          setFetchAttempts((prev) => prev + 1);
        } finally {
          setIsLoading(false);
        }
      }
    };

    // Only run if initialData was not provided (avoid fetching when server provides data)
    if (initialData === undefined) {
      fetchInitialData();
    }
  }, [profile, isLoading, initialData, fetchAttempts, lastFetchTime]);

  // Computed streaks
  const streaks = {
    login: profile?.login_streak || 0,
    learning: profile?.learning_streak || 0,
    maxLogin: profile?.longest_login_streak || 0,
    maxLearning: profile?.longest_learning_streak || 0,
  };

  // Refetch function (triggers server data refresh)
  async function refetch() {
    // Fetch fresh data from server without full page reload
    setIsLoading(true);
    try {
      const [dashboardData, leaderboardData] = await Promise.all([getDashboardDataAction(), getLeaderboardAction()]);

      if (dashboardData) {
        setProfile(dashboardData.profile);
        setDashboard(dashboardData);
      }
      if (leaderboardData) {
        setLeaderboard(leaderboardData);
      }
    } catch (error) {
      console.error('Failed to refetch gamification data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Award XP with optimistic update (supports silent mode)
  async function awardXP(payload: XPAwardRequest, options?: { silent?: boolean }): Promise<XPAwardResponse> {
    setError(null);
    const isSilent = options?.silent ?? false;

    try {
      // Call Server Action
      const result = await awardXPAction(payload);

      // Optimistically update local state
      if (result.profile) {
        setProfile(result.profile);
        // Update dashboard if needed
        if (dashboard) {
          setDashboard({
            ...dashboard,
            profile: result.profile,
          });
        }

        // Show notification ONLY if not silent
        if (!isSilent && result.transaction.amount > 0) {
          showEnhancedXPToast({
            amount: result.transaction.amount,
            source: payload.source,
          });

          // Check for level up
          if (result.triggered_level_up) {
            setLevelUpQueue((prev) => [...prev, { newLevel: result.profile.level }]);
          }
        }
      }

      return result;
    } catch (error) {
      // Normalize unknown thrown values into our GamificationError shape
      const message =
        (error && typeof (error as any).message === 'string' && (error as any).message) || t('error.awardXPFailed');
      const statusCode = (error && typeof (error as any).statusCode === 'number' && (error as any).statusCode) || 500;
      const gamificationError: GamificationError = {
        type: 'SERVER_ERROR',
        message,
        timestamp: new Date().toISOString(),
        statusCode,
      };
      setError(gamificationError);
      throw gamificationError;
    }
  }

  // Update streak
  async function updateStreak(type: 'login' | 'learning') {
    setError(null);
    try {
      const result = await updateStreakAction(type);

      // Optimistically update local profile
      if (result) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                ...(type === 'login'
                  ? {
                      login_streak: result.current_streak,
                      longest_login_streak: result.longest_streak,
                    }
                  : {
                      learning_streak: result.current_streak,
                      longest_learning_streak: result.longest_streak,
                    }),
              }
            : null,
        );
      }
    } catch (error) {
      const message =
        (error && typeof (error as any).message === 'string' && (error as any).message) ||
        t('error.updateStreakFailed');
      const statusCode = (error && typeof (error as any).statusCode === 'number' && (error as any).statusCode) || 500;
      const gamificationError: GamificationError = {
        type: 'SERVER_ERROR',
        message,
        timestamp: new Date().toISOString(),
        statusCode,
      };
      setError(gamificationError);
      throw gamificationError;
    }
  }

  // Update preferences
  async function updatePreferences(preferences: Record<string, any>) {
    setError(null);
    try {
      await updatePreferencesAction(preferences);

      // Optimistically update local profile
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              preferences: { ...prev.preferences, ...preferences },
            }
          : null,
      );
    } catch (error) {
      const message =
        (error && typeof (error as any).message === 'string' && (error as any).message) ||
        t('error.updatePreferencesFailed');
      const statusCode = (error && typeof (error as any).statusCode === 'number' && (error as any).statusCode) || 500;
      const gamificationError: GamificationError = {
        type: 'SERVER_ERROR',
        message,
        timestamp: new Date().toISOString(),
        statusCode,
      };
      setError(gamificationError);
      throw gamificationError;
    }
  }

  // XP Toast handlers using notification system with automatic batching
  function showXPToast(amount: number, source?: string, triggeredLevelUp?: boolean) {
    showEnhancedXPToast({ amount, source, triggeredLevelUp });
  }

  function showLevelUpCelebration(newLevel: number) {
    // Only show one level-up at a time
    setLevelUpQueue([{ newLevel }]);
  }

  function dismissLevelUpCelebration() {
    setLevelUpQueue([]);
  }

  const value: GamificationContextValue = {
    profile,
    dashboard,
    leaderboard,
    isLoading,
    error,
    awardXP,
    updateStreak,
    updatePreferences,
    refetch,
    showXPToast,
    showLevelUpCelebration,
    streaks,
  };

  return (
    <GamificationContext.Provider value={value}>
      {children}
      {/* XP notification container with automatic batching */}
      <ToastContainer />
      {/* Render level-up celebrations (lazy-loaded only when needed) */}
      <AnimatePresence initial={false}>
        {levelUpQueue.length > 0 && levelUpQueue[0] && (
          <React.Suspense fallback={null}>
            <LevelUpCelebration
              key={`level-up-${levelUpQueue[0].newLevel}`}
              newLevel={levelUpQueue[0].newLevel}
              onDismiss={dismissLevelUpCelebration}
              compact={(profile?.preferences as any)?.display?.compactMode ?? false}
            />
          </React.Suspense>
        )}
      </AnimatePresence>
    </GamificationContext.Provider>
  );
}

export function useGamificationContext(): GamificationContextValue {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamificationContext must be used within GamificationProvider');
  }
  return context;
}

// Optional: Hook with fallback for components that might be outside provider
export function useOptionalGamificationContext(): GamificationContextValue | null {
  return useContext(GamificationContext);
}
