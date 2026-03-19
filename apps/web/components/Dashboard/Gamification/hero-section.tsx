'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';
import GamifiedUserAvatar from '@/components/Objects/GamifiedUserAvatar';
import { Calendar, Flame, TrendingUp, Trophy, Zap } from 'lucide-react';
import { GlowingLevelBadge, getLevelInfo } from '@/lib/gamification';
import type { UserGamificationProfile } from '@/types/gamification';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  profile: UserGamificationProfile;
  userRank?: number | null;
  className?: string;
}

/**
 * Unified Hero Section - Consolidates profile + quick stats
 *
 * Key improvements:
 * - Single focused view with avatar, level, and progress
 * - Visual daily XP progress with cap indicator
 * - Prominent streak display with animation
 * - Next milestone preview
 */
export function HeroSection({ profile, userRank, className }: HeroSectionProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const session = usePlatformSession();

  const xpToNext = Math.max(0, profile.xp_to_next_level || 0);
  const currentLevelXp = profile.xp_in_current_level || 0;
  const xpProgress = xpToNext > 0 ? (currentLevelXp / (currentLevelXp + xpToNext)) * 100 : 0;

  // Daily XP progress (out of cap - hardcoded for now, will be added to backend)
  const dailyCap = 500;
  const dailyEarned = profile.daily_xp_earned || 0;
  const dailyXpProgress = Math.min((dailyEarned / dailyCap) * 100, 100);

  // Next milestone
  const nextMilestone = [5, 10, 15, 25, 50, 100].find((l) => l > profile.level);

  // Streak status
  const streakStatus = {
    login: profile.login_streak || 0,
    learning: profile.learning_streak || 0,
    max: Math.max(profile.login_streak || 0, profile.learning_streak || 0),
  };

  // Get level info
  const levelInfo = getLevelInfo(profile.level, t);

  // Get display name from session
  const displayName = session?.data?.user?.first_name
    ? [session.data.user.first_name, session.data.user.middle_name, session.data.user.last_name]
        .filter(Boolean)
        .join(' ')
    : session?.data?.user?.username;

  return (
    <Card className={cn('relative overflow-hidden border-2 py-2', className)}>
      <div className="absolute inset-0 opacity-10" />

      {/* Animated particles for high-level users */}
      {profile.level >= 15 && (
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -top-4 -right-4 h-32 w-32 rounded-full bg-yellow-500/20 blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1,
            }}
          />
        </div>
      )}

      <div className="relative px-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          {/* Left: Avatar & Level */}
          <div className="flex shrink-0 flex-col items-center gap-4">
            <div className="relative">
              <GamifiedUserAvatar
                size="3xl"
                gamificationProfile={profile}
                showLevelBadge={false}
                use_with_session
                className="ring-background relative shadow-2xl ring-4"
              />

              {/* Level badge - positioned on avatar */}
              <div className="absolute -right-0.5 -bottom-0.5">
                <GlowingLevelBadge
                  level={profile.level}
                  size="lg"
                  animated
                />
              </div>
            </div>

            {/* Streak indicators */}
            <div className="flex gap-2">
              <StreakBadge
                type="fire"
                value={streakStatus.login}
                label={t('streaks.loginStreak')}
              />
              <StreakBadge
                type="zap"
                value={streakStatus.learning}
                label={t('streaks.learningStreak')}
              />
            </div>
          </div>

          {/* Right: Stats & Progress */}
          <div className="flex-1 space-y-5">
            {/* Header with username and level title */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight">{displayName}</h2>
                {userRank && userRank <= 3 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                  >
                    <Badge
                      variant="secondary"
                      className={cn(
                        'gap-1 px-2 py-1',
                        userRank === 1 && 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/50',
                        userRank === 2 && 'bg-muted/50 text-muted-foreground border-border',
                        userRank === 3 && 'bg-orange-600/20 text-orange-600 dark:text-orange-400 border-orange-600/50',
                      )}
                    >
                      <Trophy className="h-3 w-3" />#{userRank}
                    </Badge>
                  </motion.div>
                )}
              </div>

              {/* Level title with icon */}
              <div className="flex items-center gap-2">
                <levelInfo.icon className={cn('h-5 w-5', levelInfo.color)} />
                <p className={cn('text-lg font-semibold', levelInfo.color)}>{levelInfo.title}</p>
                <span className="text-muted-foreground text-sm">
                  • {t('levelIndicators.level')} {profile.level}
                </span>
              </div>

              <p className="text-muted-foreground text-sm">{t(`levels.${getLevelKey(profile.level)}`)}</p>
            </div>

            {/* Level Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">{t('progress.levelProgress')}</span>
                <span className="text-base font-bold">
                  {t('progress.levelTransition', { current: profile.level, next: profile.level + 1 })}
                </span>
              </div>
              <div className="relative">
                {/* Progress bar with gradient */}
                <div className="bg-muted relative h-4 overflow-hidden rounded-full">
                  <motion.div
                    className={cn('h-full rounded-full bg-linear-to-r from-primary to-purple-500')}
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />

                  {/* Shine effect */}
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent"
                    animate={{
                      x: ['-100%', '200%'],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatDelay: 3,
                      ease: 'linear',
                    }}
                  />
                </div>

                {/* XP labels with better styling */}
                <div className="mt-2 flex justify-between text-xs">
                  <span className="font-medium tabular-nums">
                    <span className="text-foreground">{profile.xp_in_current_level?.toLocaleString() || 0}</span>
                    <span className="text-muted-foreground"> {t('progress.xpAbbreviation')}</span>
                  </span>
                  <span className="text-muted-foreground font-medium tabular-nums">
                    {xpToNext.toLocaleString()} {t('progress.xpToGo')}
                  </span>
                </div>
              </div>
            </div>

            {/* Daily XP Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <Zap className={cn('h-4 w-4', dailyXpProgress >= 100 ? 'text-orange-500' : 'text-yellow-500')} />
                  {t('progress.dailyXP')}
                </span>
                <span
                  className={cn(
                    'font-bold tabular-nums',
                    dailyXpProgress >= 100 ? 'text-orange-500' : 'text-foreground',
                  )}
                >
                  {profile.daily_xp_earned?.toLocaleString() || 0} / 500
                </span>
              </div>
              <div className="relative">
                <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                  <motion.div
                    className={cn(
                      'h-full rounded-full transition-colors',
                      dailyXpProgress >= 100
                        ? 'bg-linear-to-r from-orange-500 to-red-500'
                        : 'bg-linear-to-r from-yellow-500 to-amber-500',
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(dailyXpProgress, 100)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>

                {dailyXpProgress >= 100 && (
                  <motion.p
                    className="mt-1 text-xs font-medium text-orange-500"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {t('dailyCapReached')}
                  </motion.p>
                )}
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-4 pt-2">
              <StatCard
                icon={Trophy}
                label={t('stats.totalXP')}
                value={profile.total_xp?.toLocaleString() || '0'}
                iconColor="text-yellow-500"
              />
              <StatCard
                icon={TrendingUp}
                label={t('stats.rank')}
                value={userRank ? `#${userRank}` : '-'}
                iconColor="text-blue-500"
              />
              <StatCard
                icon={Calendar}
                label={t('stats.nextMilestone')}
                value={nextMilestone ? `${t('progress.levelShort')} ${nextMilestone}` : t('stats.maxLevel')}
                iconColor="text-purple-500"
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Animated Streak Badge
 */
function StreakBadge({ type, value, label }: { type: 'fire' | 'zap'; value: number; label: string }) {
  const Icon = type === 'fire' ? Flame : Zap;
  const baseColor = type === 'fire' ? 'text-orange-500' : 'text-yellow-500';
  const glowColor = type === 'fire' ? 'shadow-orange-500/50' : 'shadow-yellow-500/50';

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="relative"
      title={label}
    >
      <Badge
        variant="secondary"
        className={cn('gap-1 px-3 py-1.5', value > 0 && 'shadow-lg', value > 0 && glowColor)}
      >
        <Icon className={cn('h-4 w-4', value > 0 ? baseColor : 'text-muted-foreground')} />
        <span className="font-bold">{value}</span>
      </Badge>

      {/* Animated glow for active streaks */}
      {value > 3 && (
        <motion.div
          className={cn(
            'absolute inset-0 rounded-full blur-md',
            type === 'fire' ? 'bg-orange-500/30' : 'bg-yellow-500/30',
          )}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.div>
  );
}

/**
 * Compact Stat Card
 */
function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: any;
  label: string;
  value: string;
  iconColor?: string;
}) {
  return (
    <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-center">
      <Icon className={cn('mx-auto h-5 w-5', iconColor)} />
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

/**
 * Helper to get level title key
 */
function getLevelKey(level: number): string {
  if (level >= 50) return 'grandmaster';
  if (level >= 25) return 'master';
  if (level >= 15) return 'expert';
  if (level >= 10) return 'scholar';
  if (level >= 5) return 'apprentice';
  return 'novice';
}
