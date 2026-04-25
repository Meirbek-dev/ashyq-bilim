/**
 * Theme system exports
 * Centralized exports for theme-related components and utilities
 *
 * Optimized for performance with lazy loading and memoization
 */

// Theme components
export { ThemeSelector } from '@components/ui/custom/theme-selector';
export { ThemeProvider, useTheme } from '@/components/providers/theme-provider';

// Core theme utilities
export {
  DEFAULT_THEME_NAME,
  DEFAULT_THEME_MODE,
  THEME_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  darkThemeNames,
  getStoredThemeMode,
  getSystemThemeMode,
  getStoredTheme,
  getTheme,
  isDarkThemeName,
  themeNames,
  themes,
  type Theme,
  type ThemeColors,
  type ThemeMode,
  type ThemeStyles,
  type ThemeTokenMap,
} from '@/lib/themes';

// Color utilities for UI components
export { getDisplayColor, getThemePreviewColors } from '@/lib/theme-color-utils';
