/**
 * Diaspora Platform — Design System Index
 *
 * Single import point for all design system exports.
 *
 * Usage:
 *   import { useTheme, ThemeProvider, lightTokens } from '@/design-system';
 */

export { useThemeTokens } from './ThemeContext';
export { lightTokens, darkTokens, typography, spacing, radius, shadow, iconSize, opacity, zIndex, motion, fontFamily, fontWeight } from './tokens';
export type { Tokens, ColorScheme } from './tokens';

export { ThemeProvider, useTheme, applyThemePreference, THEME_PREFERENCE_KEY } from './ThemeContext';
export type { ThemePreference } from './ThemeContext';
