'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import { Monitor } from 'lucide-react';
import React from 'react';

interface Props {
  Icon?: React.ComponentType<{ className?: string; size?: number }>;
  children: React.ReactNode;
}

export default function DesktopOnlyGuard({ Icon = Monitor, children }: Props) {
  const t = useTranslations('DashPage.UserSettings');
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="bg-muted/40 flex h-screen w-full items-center justify-center p-4">
        <Card className="max-w-sm">
          <CardContent className="flex flex-col items-center space-y-4 px-6 py-8">
            <Icon className="text-muted-foreground h-14 w-14" />
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-semibold tracking-tight">{t('desktopOnlyTitle')}</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">{t('desktopOnlyMessage1')}</p>
              <p className="text-muted-foreground/80 text-xs">{t('desktopOnlyMessage2')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
