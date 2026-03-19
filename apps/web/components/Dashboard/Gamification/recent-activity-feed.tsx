'use client';

import { EmptyState, GamificationCard, LoadingState, getXPSourceTheme } from '@/lib/gamification';
import { animations } from '@/lib/gamification/design-tokens';
import { useDateFnsLocale } from '@/hooks/useDateFnsLocale';
import type { XPTransaction } from '@/types/gamification';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface RecentActivityFeedProps {
  transactions: XPTransaction[];
  isLoading?: boolean;
}

export function RecentActivityFeed({ transactions, isLoading }: RecentActivityFeedProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const locale = useDateFnsLocale();

  if (isLoading) {
    return (
      <LoadingState
        title={t('dashboard.recentActivity')}
        variant="feed"
        itemCount={5}
      />
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <EmptyState
        title={t('dashboard.recentActivity')}
        message={t('dashboard.noActivityDescription')}
        variant="info"
      />
    );
  }

  return (
    <GamificationCard title={t('dashboard.recentActivity')}>
      <ScrollArea className="max-h-[500] pr-4">
        <div className="space-y-3">
          {transactions.map((transaction, index) => {
            const theme = getXPSourceTheme(transaction.source);
            const timeAgo = transaction.created_at
              ? formatDistanceToNow(new Date(transaction.created_at), {
                  addSuffix: true,
                  locale,
                })
              : '';

            return (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: index * 0.05,
                  duration: animations.duration.normal / 1000,
                }}
                className={cn(
                  'flex items-start gap-3 rounded-lg p-2 transition-colors',
                  animations.css.fast,
                  'hover:bg-muted/70',
                )}
              >
                <div className={cn('rounded-lg p-2', theme.bgColor)}>
                  <theme.icon className={cn('h-4 w-4', theme.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t(`xpSources.${transaction.source}`)}</p>
                  <p className="text-muted-foreground text-xs">{timeAgo}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-primary text-sm font-bold tabular-nums">+{transaction.amount}</span>
                  <p className="text-muted-foreground text-xs">XP</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </GamificationCard>
  );
}
