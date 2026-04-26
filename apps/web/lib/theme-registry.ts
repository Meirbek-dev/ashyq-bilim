import rawThemeRegistry from './theme-registry.generated.json';
import { loadThemeFonts } from './theme-fonts';

export type ThemeMode = 'light' | 'dark';
export type ThemeTokenMap = Record<string, string>;
export type ThemeStyles = Record<ThemeMode, ThemeTokenMap>;

export interface ThemeColors {
  readonly background: string;
  readonly foreground: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
}

export interface ThemePreset {
  readonly label?: string;
  readonly source?: string;
  readonly styles: {
    readonly light: ThemeTokenMap;
    readonly dark: ThemeTokenMap;
  };
}

export interface ThemeDefinition {
  readonly name: string;
  readonly label: string;
  readonly styles: Readonly<ThemeStyles>;
  readonly commonTokens: Readonly<ThemeTokenMap>;
  readonly modeTokens: Readonly<ThemeTokenMap>;
  readonly tokens: Readonly<ThemeTokenMap>;
  readonly colors: Readonly<ThemeColors>;
  readonly resolvedTheme: ThemeMode;
}

export const THEME_STORAGE_KEY = 'theme';
export const THEME_MODE_STORAGE_KEY = 'theme-mode';
export const THEME_CACHE_STORAGE_KEY = 'theme-cache';
export const DEFAULT_THEME_NAME = 'default';
export const DEFAULT_THEME_MODE: ThemeMode = 'light';
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const registry = rawThemeRegistry as Record<string, ThemePreset>;

export const COMMON_THEME_KEYS = [
  'font-sans',
  'font-serif',
  'font-mono',
  'radius',
  'shadow-opacity',
  'shadow-blur',
  'shadow-spread',
  'shadow-offset-x',
  'shadow-offset-y',
  'shadow-x',
  'shadow-y',
  'letter-spacing',
  'tracking-normal',
  'spacing',
] as const;

const commonThemeKeySet = new Set<string>(COMMON_THEME_KEYS);

const tokenAliases: Record<string, string[]> = {
  'letter-spacing': ['tracking-normal'],
  'tracking-normal': ['letter-spacing'],
  'shadow-x': ['shadow-offset-x'],
  'shadow-offset-x': ['shadow-x'],
  'shadow-y': ['shadow-offset-y'],
  'shadow-offset-y': ['shadow-y'],
};

function normalizeThemeTokens(tokens: ThemeTokenMap): ThemeTokenMap {
  const normalized: ThemeTokenMap = { ...tokens };

  if (normalized['letter-spacing'] === 'normal') {
    normalized['letter-spacing'] = '0em';
  }

  for (const [token, aliases] of Object.entries(tokenAliases)) {
    const tokenValue = normalized[token] ?? aliases.map((alias) => normalized[alias]).find(Boolean);
    if (!tokenValue) continue;

    normalized[token] = tokenValue;
    for (const alias of aliases) {
      normalized[alias] = tokenValue;
    }
  }

  if (normalized['letter-spacing'] === 'normal') {
    normalized['letter-spacing'] = '0em';
    normalized['tracking-normal'] = '0em';
  }

  const shadowTokens = buildShadowTokens(normalized);
  for (const [key, value] of Object.entries(shadowTokens)) {
    normalized[key] ??= value;
  }

  return normalized;
}

function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  const alphaValue = Math.max(0, alpha).toFixed(2);

  if (/^(hsl|oklch|oklab|rgb|lab|lch)\(/i.test(trimmed) && !trimmed.includes('/')) {
    return trimmed.replace(/\)$/, ` / ${alphaValue})`);
  }

  return `color-mix(in srgb, ${trimmed} ${Math.round(alpha * 100)}%, transparent)`;
}

function pxNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildShadowTokens(tokens: ThemeTokenMap): ThemeTokenMap {
  const offsetX = tokens['shadow-offset-x'] ?? tokens['shadow-x'] ?? '0';
  const offsetY = tokens['shadow-offset-y'] ?? tokens['shadow-y'] ?? '1px';
  const blur = tokens['shadow-blur'] ?? '3px';
  const spread = tokens['shadow-spread'] ?? '0px';
  const opacity = pxNumber(tokens['shadow-opacity'], 0.1);
  const shadowColor = tokens['shadow-color'] ?? 'oklch(0 0 0)';
  const firstLayer = (multiplier: number) => `${offsetX} ${offsetY} ${blur} ${spread} ${withAlpha(shadowColor, opacity * multiplier)}`;
  const secondLayer = (fixedOffsetY: string, fixedBlur: string) => {
    const secondSpread = `${pxNumber(spread) - 1}px`;
    return `${offsetX} ${fixedOffsetY} ${fixedBlur} ${secondSpread} ${withAlpha(shadowColor, opacity)}`;
  };

  return {
    'shadow-2xs': firstLayer(0.5),
    'shadow-xs': firstLayer(0.5),
    'shadow-sm': `${firstLayer(1)}, ${secondLayer('1px', '2px')}`,
    shadow: `${firstLayer(1)}, ${secondLayer('1px', '2px')}`,
    'shadow-md': `${firstLayer(1)}, ${secondLayer('2px', '4px')}`,
    'shadow-lg': `${firstLayer(1)}, ${secondLayer('4px', '6px')}`,
    'shadow-xl': `${firstLayer(1)}, ${secondLayer('8px', '10px')}`,
    'shadow-2xl': firstLayer(2.5),
  };
}

const defaultPreset = registry[DEFAULT_THEME_NAME];
const defaultLightTokens = normalizeThemeTokens(defaultPreset?.styles.light ?? {});
const defaultDarkTokens = normalizeThemeTokens(defaultPreset?.styles.dark ?? defaultLightTokens);

function defaultTokensForMode(mode: ThemeMode): ThemeTokenMap {
  return mode === 'dark' ? defaultDarkTokens : defaultLightTokens;
}

function buildModeTokens(mode: ThemeMode, partialTokens: ThemeTokenMap): ThemeTokenMap {
  return normalizeThemeTokens({
    ...defaultTokensForMode(mode),
    ...partialTokens,
  });
}

function splitCommonTokens(tokens: ThemeTokenMap): ThemeTokenMap {
  const commonTokens: ThemeTokenMap = {};

  for (const [key, value] of Object.entries(tokens)) {
    if (commonThemeKeySet.has(key)) {
      commonTokens[key] = value;
    }
  }

  return normalizeThemeTokens(commonTokens);
}

function splitModeTokens(tokens: ThemeTokenMap): ThemeTokenMap {
  const modeTokens: ThemeTokenMap = {};

  for (const [key, value] of Object.entries(tokens)) {
    if (!commonThemeKeySet.has(key) && !key.startsWith('shadow-')) {
      modeTokens[key] = value;
    }
  }

  return modeTokens;
}

function buildColors(tokens: ThemeTokenMap): ThemeColors {
  const background = tokens.background ?? 'oklch(1 0 0)';
  const foreground = tokens.foreground ?? 'oklch(0.145 0 0)';

  return {
    background,
    foreground,
    primary: tokens.primary ?? foreground,
    secondary: tokens.secondary ?? background,
    accent: tokens.accent ?? tokens.secondary ?? background,
  };
}

function buildThemeDefinition(name: string, preset: ThemePreset | undefined, mode: ThemeMode): ThemeDefinition {
  const light = buildModeTokens('light', preset?.styles.light ?? {});
  const dark = buildModeTokens('dark', preset?.styles.dark ?? {});
  const commonTokens = splitCommonTokens(light);
  const modeTokens = splitModeTokens(mode === 'dark' ? dark : light);
  const tokens = normalizeThemeTokens({
    ...commonTokens,
    ...modeTokens,
  });

  return {
    name,
    label: preset?.label ?? name,
    styles: { light, dark },
    commonTokens,
    modeTokens,
    tokens,
    colors: buildColors(tokens),
    resolvedTheme: mode,
  };
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export const themeNames = Object.keys(registry);
export const themes = themeNames.map((name) => buildThemeDefinition(name, registry[name], DEFAULT_THEME_MODE));
export const darkThemeNames = themeNames;

export function getTheme(name: string, mode: ThemeMode = DEFAULT_THEME_MODE): ThemeDefinition {
  const preset = registry[name] ?? registry[DEFAULT_THEME_NAME];
  const resolvedName = registry[name] ? name : DEFAULT_THEME_NAME;

  return buildThemeDefinition(resolvedName, preset, mode);
}

export function getStoredTheme(): string | null {
  if (typeof window === 'undefined') return null;
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme && storedTheme in registry ? storedTheme : null;
}

export function getStoredThemeMode(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  const storedMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
  return isThemeMode(storedMode) ? storedMode : null;
}

export function getSystemThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT_THEME_MODE;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeToElement(theme: ThemeDefinition, root: HTMLElement): void {
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${key}`, value);
  }

  root.setAttribute('data-theme', theme.name);
  root.setAttribute('data-mode', theme.resolvedTheme);
  root.classList.toggle('dark', theme.resolvedTheme === 'dark');
  root.style.colorScheme = theme.resolvedTheme;
}

export function persistTheme(theme: ThemeDefinition): void {
  if (typeof window === 'undefined') return;

  const cachedTheme = {
    name: theme.name,
    tokensByMode: {
      light: getTheme(theme.name, 'light').tokens,
      dark: getTheme(theme.name, 'dark').tokens,
    },
  };

  window.localStorage.setItem(THEME_STORAGE_KEY, theme.name);
  window.localStorage.setItem(THEME_MODE_STORAGE_KEY, theme.resolvedTheme);
  window.localStorage.setItem(THEME_CACHE_STORAGE_KEY, JSON.stringify(cachedTheme));
  document.cookie = `${THEME_STORAGE_KEY}=${encodeURIComponent(theme.name)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  document.cookie = `${THEME_MODE_STORAGE_KEY}=${theme.resolvedTheme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

export function applyTheme(theme: ThemeDefinition, options: { persist?: boolean } = {}): void {
  if (typeof document === 'undefined') return;

  applyThemeToElement(theme, document.documentElement);
  loadThemeFonts(theme.commonTokens);

  if (options.persist ?? true) {
    persistTheme(theme);
  }
}

export function isDarkThemeName(_themeName: string): boolean {
  return false;
}
