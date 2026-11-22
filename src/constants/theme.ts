import { Platform } from 'react-native';

/**
 * Calm, neutral surfaces with one brand blue. Color only shows up as accents (the rainbow
 * spectrum below), so content always sits on solid, high-contrast surfaces.
 */
export const Colors = {
  light: {
    text: '#11131C',
    textSecondary: '#5E6477',
    background: '#F6F7FB',
    surface: '#FFFFFF',
    backgroundElement: '#EEF0F5',
    backgroundSelected: '#E2E5EE',
    border: 'rgba(17, 19, 28, 0.08)',
    tint: '#2F6FE4',
    onTint: '#FFFFFF',
    /** The mic disk: maximum contrast against the page. */
    ink: '#11131C',
    onInk: '#FFFFFF',
    danger: '#D93D42',
    /** "Couldn't schedule": a nudge, not an alarm. */
    warning: '#B45309',
    success: '#2B9A66',
    priorityHigh: '#E5484D',
    priorityMedium: '#F59E0B',
    priorityLow: '#A3A8B8',
  },
  dark: {
    text: '#F3F4F8',
    textSecondary: '#A1A7B6',
    background: '#0B0C10',
    surface: '#16181E',
    backgroundElement: '#1F2229',
    backgroundSelected: '#2C303A',
    border: 'rgba(255, 255, 255, 0.08)',
    tint: '#3D7BF5',
    onTint: '#FFFFFF',
    ink: '#F3F4F8',
    onInk: '#11131C',
    danger: '#F2555A',
    warning: '#F5A524',
    success: '#3DB37A',
    priorityHigh: '#F2555A',
    priorityMedium: '#F5B947',
    priorityLow: '#8C92A2',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Colors plus the non-color tokens that differ between light and dark. */
export const Themes = {
  light: {
    ...Colors.light,
    dark: false,
    shadowCard: '0px 1px 2px rgba(27, 34, 64, 0.05), 0px 6px 20px rgba(27, 34, 64, 0.06)',
    shadowFloat: '0px 12px 32px rgba(27, 34, 64, 0.16)',
  },
  dark: {
    ...Colors.dark,
    dark: true,
    shadowCard: '0px 1px 2px rgba(0, 0, 0, 0.4)',
    shadowFloat: '0px 16px 40px rgba(0, 0, 0, 0.55)',
  },
};

export type Theme = (typeof Themes)[keyof typeof Themes];

/** Pastel spectrum for large background washes. */
export const RainbowSoft = ['#FFC2D1', '#FFD9B0', '#FFF1B0', '#C4F2D4', '#BDE4FF', '#D2C8FF', '#F6C6F0'];
/** Saturated spectrum for small accents: the mic ring, progress, a completed check. */
export const RainbowVivid = ['#FF5C8A', '#FF9A4D', '#FFCF4A', '#4CD99A', '#45B5FF', '#7B6CFF', '#E36BFF'];

/**
 * A CSS `linear-gradient()` for the `backgroundImage` style (native in React Native 0.88).
 * `loop` repeats the first stop at the end, so a rotating or sliding gradient has no seam.
 */
export function gradient(colors: readonly string[], angleDeg = 90, loop = false): string {
  const stops = loop ? [...colors, colors[0]] : colors;
  return `linear-gradient(${angleDeg}deg, ${stops.join(', ')})`;
}

/** `#RRGGBB` → `rgba(r, g, b, alpha)`. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 14,
  large: 20,
  sheet: 28,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
