/**
 * Theme utility functions and types
 */

export interface ThemeColors {
  readonly background: string;
  readonly foreground: string;
  readonly card: string;
  readonly cardForeground: string;
  readonly popover: string;
  readonly popoverForeground: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly secondaryForeground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly destructive: string;
  readonly destructiveForeground: string;
  readonly border: string;
  readonly input: string;
  readonly ring: string;
  readonly chart1: string;
  readonly chart2: string;
  readonly chart3: string;
  readonly chart4: string;
  readonly chart5: string;
  readonly sidebar: string;
  readonly sidebarForeground: string;
  readonly sidebarPrimary: string;
  readonly sidebarPrimaryForeground: string;
  readonly sidebarAccent: string;
  readonly sidebarAccentForeground: string;
  readonly sidebarBorder: string;
  readonly sidebarRing: string;
  readonly radius: string;
}

export interface Theme {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly colors: Readonly<ThemeColors>;
  readonly radius: string;
}

/**
 * Map of camelCase theme property names to kebab-case CSS variable names
 */
export const CSS_VARIABLE_MAP = {
  background: 'background',
  foreground: 'foreground',
  card: 'card',
  cardForeground: 'card-foreground',
  popover: 'popover',
  popoverForeground: 'popover-foreground',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  secondary: 'secondary',
  secondaryForeground: 'secondary-foreground',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  accent: 'accent',
  accentForeground: 'accent-foreground',
  destructive: 'destructive',
  destructiveForeground: 'destructive-foreground',
  border: 'border',
  input: 'input',
  ring: 'ring',
  chart1: 'chart-1',
  chart2: 'chart-2',
  chart3: 'chart-3',
  chart4: 'chart-4',
  chart5: 'chart-5',
  sidebar: 'sidebar',
  sidebarForeground: 'sidebar-foreground',
  sidebarPrimary: 'sidebar-primary',
  sidebarPrimaryForeground: 'sidebar-primary-foreground',
  sidebarAccent: 'sidebar-accent',
  sidebarAccentForeground: 'sidebar-accent-foreground',
  sidebarBorder: 'sidebar-border',
  sidebarRing: 'sidebar-ring',
  radius: 'radius',
} as const satisfies Record<keyof ThemeColors, string>;

/**
 * Helper function to create a theme from CSS variables
 * Copy-paste CSS from :root selector and this will parse it
 *
 * @example
 * ```ts
 * const myTheme = createThemeFromCSS('my-theme', 'My Theme', `
 *   --background: oklch(1 0 0);
 *   --foreground: oklch(0.3211 0 0);
 *   --primary: oklch(0.6231 0.188 259.8145);
 *   // ... more variables
 * `);
 * ```
 */
export function createThemeFromCSS(
  name: string,
  label: string,
  cssVars: string,
  description?: string,
): Readonly<Theme> {
  // Parse CSS variables from the string
  const vars = new Map<string, string>();

  // Match CSS variable declarations (supports letters, numbers, and hyphens)
  const regex = /--([a-z0-9-]+):\s*([^;]+);/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cssVars)) !== null) {
    const varName = match[1]?.toLowerCase();
    const varValue = match[2]?.trim();
    if (varName && varValue) {
      vars.set(varName, varValue);
    }
  }

  // Simple getter - returns undefined if not found
  const getVar = (cssName: string): string | undefined => vars.get(cssName);

  // Build theme colors - only include values that were actually defined
  const colors: any = {};

  for (const [key, cssName] of Object.entries(CSS_VARIABLE_MAP)) {
    const value = getVar(cssName);
    if (value) {
      colors[key] = value;
    }
  }

  return Object.freeze({
    name,
    label,
    description,
    colors: Object.freeze(colors),
    radius: getVar('radius') || '0.5rem',
  });
}
