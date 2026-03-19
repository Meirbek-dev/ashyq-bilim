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
export { applyTheme, defaultTheme, getStoredTheme, getTheme, themes, type Theme, type ThemeColors } from '@/lib/themes';

// Lazy loading utilities (optimized for performance)
export {
  loadTheme,
  preloadThemes,
  getAvailableThemeNames,
  clearThemeCache,
  getThemeCacheStats,
} from '@/lib/theme-lazy-loader';

// Color utilities for UI components
export { getDisplayColor, getThemePreviewColors } from '@/lib/theme-color-utils';
