'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import React from 'react';

interface ExamHeaderProps {
  title: string;
  subtitle?: string;
  onStart?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  canStart?: boolean;
}

export default function ExamHeader({
  title,
  subtitle,
  onStart,
  onSubmit,
  isSubmitting = false,
  canStart = true,
}: ExamHeaderProps) {
  const t = useTranslations('Activities.ExamActivity');

  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {onStart && (
          <Button
            size="sm"
            variant="outline"
            onClick={onStart}
            disabled={!canStart}
          >
            {t('startExam')}
          </Button>
        )}

        {onSubmit && (
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? t('submitting') : t('submitExam')}
          </Button>
        )}
      </div>
    </div>
  );
}
