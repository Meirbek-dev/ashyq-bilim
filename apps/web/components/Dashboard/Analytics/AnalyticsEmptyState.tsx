'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivitySquare, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AnalyticsEmptyStateProps {
  title: string;
  description: string;
}

export default function AnalyticsEmptyState({ title, description }: AnalyticsEmptyStateProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-4 py-10">
      <Card className="shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background shadow-md">
            <ActivitySquare className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="max-w-2xl text-base">{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          {t('emptyState.accessNote')}
        </CardContent>
      </Card>
    </div>
  );
}
