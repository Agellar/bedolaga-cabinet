// Theme color settings interface
export interface ThemeColors {
  // Main accent color
  accent: string;

  // Dark theme
  darkBackground: string;
  darkSurface: string;
  darkText: string;
  darkTextSecondary: string;

  // Light theme
  lightBackground: string;
  lightSurface: string;
  lightText: string;
  lightTextSecondary: string;

  // Status colors
  success: string;
  warning: string;
  error: string;
}

export interface ThemeSettings extends ThemeColors {
  id?: number;
  updated_at?: string;
}

// Enabled themes settings
export interface EnabledThemes {
  dark: boolean;
  light: boolean;
}

export const DEFAULT_ENABLED_THEMES: EnabledThemes = {
  dark: true,
  light: true,
};

// Default theme colors
// Brand palette derived from the "UP" logo (teal/cyan on navy-slate).
// Tuned for readability: cool near-white text on deep navy (dark),
// dark slate text on cool-white (light).
export const DEFAULT_THEME_COLORS: ThemeColors = {
  accent: '#17A8C0',

  darkBackground: '#0B141B',
  darkSurface: '#15242E',
  darkText: '#EAF3F5',
  darkTextSecondary: '#90A7B1',

  lightBackground: '#E8F1F3',
  lightSurface: '#FBFDFE',
  lightText: '#0E1D26',
  lightTextSecondary: '#566F79',

  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

// Color shade levels for palette generation
export const SHADE_LEVELS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Extended shade levels including 850 for dark palette
export const EXTENDED_SHADE_LEVELS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950,
] as const;

export type ShadeLevel = (typeof SHADE_LEVELS)[number];
export type ExtendedShadeLevel = (typeof EXTENDED_SHADE_LEVELS)[number];

export type ColorPalette = Record<ShadeLevel | 850, string>;

// Extended theme settings for user preferences
export type BorderRadiusPreset = 'none' | 'small' | 'medium' | 'large' | 'pill';
export type SpacingPreset = 'compact' | 'comfortable' | 'spacious';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface UserThemePreferences {
  /**
   * Theme mode preference
   * @default 'system'
   */
  theme: ThemeMode;

  /**
   * Border radius preset
   * @default 'large'
   */
  borderRadius: BorderRadiusPreset;

  /**
   * Whether animations are enabled
   * @default true
   */
  animationsEnabled: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserThemePreferences = {
  theme: 'system',
  borderRadius: 'large',
  animationsEnabled: true,
};

// CSS variable values for each preset
export const BORDER_RADIUS_VALUES: Record<BorderRadiusPreset, string> = {
  none: '0px',
  small: '8px',
  medium: '16px',
  large: '24px',
  pill: '9999px',
};

export const SPACING_VALUES: Record<SpacingPreset, { padding: string; gap: string }> = {
  compact: { padding: '12px', gap: '12px' },
  comfortable: { padding: '16px', gap: '16px' },
  spacious: { padding: '24px', gap: '24px' },
};
