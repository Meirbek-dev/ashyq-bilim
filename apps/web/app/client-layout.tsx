'use client';

import PlatformSessionProvider, { usePlatformSession } from '@/components/Contexts/SessionContext';
import { PermissionProvider } from '@/components/Security/PermissionProvider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { swrFetcher } from '@services/utils/ts/requests';
import { updateUserTheme } from '@services/users/users';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';

interface ClientLayoutProps {
  children: ReactNode;
}

function ThemeSync() {
  const session = usePlatformSession() as any;
  const sessionRef = useRef(session);

  // Keep a ref to the latest session so the event listener doesn't need to be
  // re-attached every time the session object identity changes.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: string }>;
      const theme = customEvent?.detail?.theme;
      if (!theme) return;
      const s = sessionRef.current;
      if (s?.data?.user?.id && s?.data?.tokens?.access_token) {
        // Fire-and-forget and surface failures to console to avoid unhandled rejections
        updateUserTheme(s.data.user.id, theme, s.data.tokens.access_token).catch((error: unknown) =>
          console.error('Failed to sync theme to server:', error),
        );
      }
    };

    globalThis.addEventListener('themeChange', handleThemeChange);
    return () => {
      globalThis.removeEventListener('themeChange', handleThemeChange);
    };
  }, []);

  return null;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    // Lower frequency of session refetches to avoid unnecessary periodic calls that
    // may contribute to being rate limited. Also disable refetch on window focus.
    <SessionProvider
      refetchInterval={5 * 60_000} // 5 minutes
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
    >
      <PlatformSessionProvider>
        <PermissionProvider>
          {/* Global SWR defaults to reduce frequent revalidation and dedupe identical requests. */}
          <SWRConfig
            value={{
              // Use the central swrFetcher which accepts (url, token)
              fetcher: (url: string, token?: string) => swrFetcher(url, token),
              dedupingInterval: 60_000, // dedupe identical requests for 60s
              focusThrottleInterval: 60_000, // throttle refetches on focus
              revalidateOnFocus: false,
              revalidateOnReconnect: false,
              shouldRetryOnError: true,
              errorRetryCount: 3,
            }}
          >
            <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
          </SWRConfig>
        </PermissionProvider>
      </PlatformSessionProvider>
    </SessionProvider>
  );
}

function ThemeProviderWrapper({ children }: { children: ReactNode }) {
  const session = usePlatformSession() as any;
  const userTheme = session?.data?.user?.theme;

  return (
    <ThemeProvider userTheme={userTheme}>
      <ThemeSync />
      <main>{children}</main>
      <Toaster />
    </ThemeProvider>
  );
}
