'use client';

import PlatformProvider from '@/components/Contexts/PlatformProvider';
import { useTheme } from '@/components/providers/theme-provider';
import NextTopLoader from 'nextjs-toploader';
import type { ReactNode } from 'react';

interface PlatformClientProvidersProps {
  children: ReactNode;
  initialPlatform?: unknown;
}

export default function PlatformClientProviders({ children, initialPlatform }: PlatformClientProvidersProps) {
  const { theme: currentTheme } = useTheme();

  const topLoaderProps = {
    color: currentTheme.colors.primary,
    initialPosition: 0.1,
    crawlSpeed: 300,
    height: 3,
    easing: 'ease' as const,
    speed: 1000,
    showSpinner: false,
    shadow: `0 0 10px ${currentTheme.colors.primary}, 0 0 5px ${currentTheme.colors.primary}`,
    crawl: true,
  };

  return (
    <PlatformProvider initialPlatform={initialPlatform}>
      <NextTopLoader {...topLoaderProps} />
      {children}
    </PlatformProvider>
  );
}
