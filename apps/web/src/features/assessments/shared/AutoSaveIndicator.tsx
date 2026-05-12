'use client';

/**
 * AutoSaveIndicator — Shows draft save status (Saved / Saving… / Offline / Conflict).
 *
 * Pairs with the useAssessmentAutosave hook that fires PATCH /assessments/{uuid}/draft
 * every 30 seconds with If-Match header for optimistic concurrency.
 */

import { Check, Cloud, CloudOff, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';

interface AutoSaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

const STATUS_CONFIG: Record<SaveStatus, { icon: typeof Check; label: string; color: string }> = {
  idle: { icon: Cloud, label: 'Draft', color: 'text-muted-foreground' },
  saving: { icon: Loader2, label: 'Saving…', color: 'text-muted-foreground' },
  saved: { icon: Check, label: 'Saved', color: 'text-green-600 dark:text-green-400' },
  error: { icon: AlertCircle, label: 'Save failed', color: 'text-red-600 dark:text-red-400' },
  offline: { icon: CloudOff, label: 'Offline', color: 'text-yellow-600 dark:text-yellow-400' },
  conflict: { icon: AlertCircle, label: 'Conflict', color: 'text-red-600 dark:text-red-400' },
};

export default function AutoSaveIndicator({ status, className }: AutoSaveIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div
      className={cn('flex items-center gap-1 text-xs', config.color, className)}
      role="status"
      aria-live="polite"
      aria-label={config.label}
    >
      <Icon className={cn('size-3', status === 'saving' && 'animate-spin')} />
      <span>{config.label}</span>
    </div>
  );
}
