'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { applyTheme, getStoredTheme, getTheme } from '@/lib/themes';
import { loadTheme } from '@/lib/theme-lazy-loader';
import type { Theme } from '@/lib/themes';
import type { ReactNode } from 'react';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (themeName: string, syncToServer?: boolean) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultThemeName?: string;
  userTheme?: string | null;
}

export function ThemeProvider({ children, defaultThemeName = 'default', userTheme }: ThemeProviderProps) {
  // Initialize theme name and apply theme immediately during initialization
  const [themeName, setThemeName] = useState<string>(() => {
    if (typeof globalThis.window !== 'undefined') {
      const effectiveTheme = getStoredTheme() || userTheme || defaultThemeName;
      const initialTheme = getTheme(effectiveTheme);
      applyTheme(initialTheme);
      return effectiveTheme;
    }
    return userTheme || defaultThemeName;
  });

  const [isLoading, setIsLoading] = useState(false);
  const serverSyncTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Theme object
  const theme = getTheme(themeName);

  // Track pending theme sync
  const pendingThemeSyncRef = useRef<string | null>(null);

  // Debounced server sync function
  const debouncedServerSync = (theme: string) => {
    pendingThemeSyncRef.current = theme;

    // Clear existing timeout
    if (serverSyncTimeoutRef.current) {
      clearTimeout(serverSyncTimeoutRef.current);
    }

    // Set new timeout for server sync (1000ms debounce)
    serverSyncTimeoutRef.current = setTimeout(() => {
      if (typeof globalThis.window !== 'undefined') {
        globalThis.dispatchEvent(
          new CustomEvent('themeChange', {
            detail: { theme },
          }),
        );
        pendingThemeSyncRef.current = null;
      }
    }, 1000);
  };

  // Sync pending theme on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingThemeSyncRef.current) {
        // Sync immediately before leaving using beacon API (non-blocking)
        const data = JSON.stringify({ theme: pendingThemeSyncRef.current });
        navigator.sendBeacon('/api/user/theme', data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (serverSyncTimeoutRef.current) {
        clearTimeout(serverSyncTimeoutRef.current);
      }
    };
  }, []);

  const setTheme = async (newThemeName: string, syncToServer = true) => {
    // Lazy load theme (uses cache for core themes like 'default' and 'black')
    const newTheme = await loadTheme(newThemeName);

    if (newTheme) {
      setThemeName(newThemeName);
      applyTheme(newTheme);

      // Debounced sync to server
      if (syncToServer) {
        debouncedServerSync(newThemeName);
      }
    } else {
      // Fallback to default theme if load fails
      console.warn(`Failed to load theme: ${newThemeName}, falling back to default`);
      const fallbackTheme = getTheme('default');
      setThemeName('default');
      applyTheme(fallbackTheme);
    }
  };

  // Context value (no memo)
  const contextValue = {
    theme,
    setTheme,
    isLoading,
  };

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access theme context
 */
export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
