/**
 * Diaspora Platform — Design Tokens v1.0
 *
 * Single source of truth for all visual decisions.
 * All components must consume values from this file — never raw hex/number literals.
 *
 * Usage:
 *   import { lightTokens, darkTokens } from '@/design-system/tokens';
 *   const { tokens } = useTheme();
 *   style={{ color: tokens.color.primary[500] }}
 */

// ---------------------------------------------------------------------------
// COLOR PALETTE
// ---------------------------------------------------------------------------

const primaryPalette = {
  50: '#FFF8EB',
  100: '#FEEFC3',
  200: '#FDD98A',
  300: '#FCC052',
  400: '#FBA726',
  500: '#F59300', // Brand primary — Deep Amber
  600: '#D97D00',
  700: '#B56500',
  800: '#924F00',
  900: '#6B3800',
} as const;

const secondaryPalette = {
  50: '#E8F7F4',
  100: '#D1F5ED',
  200: '#A3EBDB',
  300: '#75E1C9',
  400: '#3DD4B3',
  500: '#0D7C66', // Brand secondary — Forest Teal
  600: '#0B6655',
  700: '#094F44',
  800: '#073933',
  900: '#042622',
} as const;

const accentPalette = {
  50: '#FEF4F2',
  100: '#FDEAE7',
  200: '#FAD0CB',
  300: '#F6B0A8',
  400: '#EE8175',
  500: '#E8533A', // Accent — Warm Coral
  600: '#D03D25',
  700: '#AD2F1A',
  800: '#8B2412',
  900: '#6B1B0C',
} as const;

// Semantic
const success = {
  default: '#16A34A',
  surface: '#F0FDF4',
  darkDefault: '#4ADE80',
  darkSurface: '#052E16',
} as const;

const warning = {
  default: '#D97706',
  surface: '#FFFBEB',
  darkDefault: '#FCD34D',
  darkSurface: '#1C1400',
} as const;

const error = {
  default: '#DC2626',
  surface: '#FEF2F2',
  darkDefault: '#F87171',
  darkSurface: '#1F0000',
} as const;

const info = {
  default: '#2563EB',
  surface: '#EFF6FF',
  darkDefault: '#60A5FA',
  darkSurface: '#0A1628',
} as const;

// Neutrals
const neutralLight = {
  50: '#F8F9FC',
  100: '#F3F4F8',
  200: '#E5E7EF',
  300: '#C8CCD8',
  400: '#9BA3B8',
  500: '#6B7280',
  600: '#4B5268',
  700: '#3A3D4A',
  800: '#272A35',
  900: '#0F1117',
} as const;

const neutralDark = {
  50: '#0F1117',
  100: '#151820',
  200: '#1A1D26',
  300: '#22263A',
  400: '#2A2E40',
  500: '#3A3D4A',
  600: '#8A8FA8',
  700: '#B0B5CC',
  800: '#D0D3DF',
  900: '#F5F6FA',
} as const;

// Surface
const lightSurface = {
  background: '#F8F9FC',
  card: '#FFFFFF',
  elevated: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.6)',
  border: '#C8CCD8',
} as const;

const darkSurface = {
  background: '#0F1117',
  card: '#1A1D26',
  elevated: '#22263A',
  overlay: 'rgba(0,0,0,0.75)',
  border: '#2A2E40',
} as const;

// ---------------------------------------------------------------------------
// TYPOGRAPHY
// ---------------------------------------------------------------------------

export const fontFamily = {
  primary: 'Inter',
  fallback: 'System',
  mono: 'SpaceMono',
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const typography = {
  display: {
    xl: { fontSize: 36, lineHeight: 44, fontWeight: fontWeight.bold, letterSpacing: -0.5 },
    lg: { fontSize: 30, lineHeight: 38, fontWeight: fontWeight.bold, letterSpacing: -0.3 },
  },
  heading: {
    xl: { fontSize: 24, lineHeight: 32, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
    lg: { fontSize: 20, lineHeight: 28, fontWeight: fontWeight.semibold, letterSpacing: -0.1 },
    md: { fontSize: 18, lineHeight: 26, fontWeight: fontWeight.semibold, letterSpacing: 0 },
    sm: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.semibold, letterSpacing: 0 },
  },
  body: {
    lg: { fontSize: 17, lineHeight: 25, fontWeight: fontWeight.regular, letterSpacing: 0 },
    md: { fontSize: 15, lineHeight: 23, fontWeight: fontWeight.regular, letterSpacing: 0 },
    sm: { fontSize: 14, lineHeight: 21, fontWeight: fontWeight.regular, letterSpacing: 0.1 },
  },
  label: {
    lg: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium, letterSpacing: 0.1 },
    md: { fontSize: 13, lineHeight: 19, fontWeight: fontWeight.medium, letterSpacing: 0.2 },
    sm: { fontSize: 12, lineHeight: 18, fontWeight: fontWeight.medium, letterSpacing: 0.3 },
  },
  mono: {
    md: { fontSize: 14, lineHeight: 21, fontWeight: fontWeight.regular, letterSpacing: 0 },
  },
} as const;

// ---------------------------------------------------------------------------
// SPACING
// ---------------------------------------------------------------------------

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,  // Default padding
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// ---------------------------------------------------------------------------
// BORDER RADIUS
// ---------------------------------------------------------------------------

export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,   // Standard card radius
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// SHADOWS
// ---------------------------------------------------------------------------

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
  },
} as const;

// ---------------------------------------------------------------------------
// ICON SIZES
// ---------------------------------------------------------------------------

export const iconSize = {
  xs: 16,
  sm: 20,
  md: 24,  // Default
  lg: 28,
  xl: 32,
  '2xl': 48,
} as const;

// ---------------------------------------------------------------------------
// OPACITY
// ---------------------------------------------------------------------------

export const opacity = {
  disabled: 0.4,
  overlay: 0.6,
  subtle: 0.08,
  medium: 0.16,
} as const;

// ---------------------------------------------------------------------------
// Z-INDEX
// ---------------------------------------------------------------------------

export const zIndex = {
  base: 0,
  card: 10,
  header: 100,
  bottomSheet: 200,
  modal: 300,
  toast: 400,
} as const;

// ---------------------------------------------------------------------------
// MOTION
// ---------------------------------------------------------------------------

export const motion = {
  duration: {
    instant: 0,
    fast: 100,
    normal: 200,
    slow: 300,
    xslow: 400,
  },
  spring: {
    default: { damping: 15, mass: 1, stiffness: 150 },
    bouncy: { damping: 10, mass: 1, stiffness: 200 },
    snappy: { damping: 20, mass: 1, stiffness: 300 },
  },
} as const;

// ---------------------------------------------------------------------------
// COMPOSED THEME OBJECTS
// ---------------------------------------------------------------------------

export const lightTokens = {
  color: {
    primary: primaryPalette,
    secondary: secondaryPalette,
    accent: accentPalette,
    neutral: neutralLight,
    surface: lightSurface,
    success: {
      default: success.default,
      surface: success.surface,
      /** Fixed: a fill with white text on it. */
      solid: success.default,
    },
    warning: {
      default: warning.default,
      surface: warning.surface,
      /** Fixed: a fill with white text on it. */
      solid: warning.default,
    },
    error: {
      default: error.default,
      surface: error.surface,
      /** Fixed: a fill with white text on it. */
      solid: error.default,
    },
    info: {
      default: info.default,
      surface: info.surface,
      /** Fixed: a fill with white text on it. */
      solid: info.default,
    },
    text: {
      primary: neutralLight[900],
      secondary: neutralLight[700],
      placeholder: neutralLight[500],
      disabled: neutralLight[400],
      inverse: '#FFFFFF',
      /**
       * The brand amber used *as text* on a light surface.
       *
       * `primary[500]` scores 2.32:1 on white, so it fails WCAG AA (1.4.3) for
       * body and label text. Anything that renders the brand colour as a word
       * rather than as a fill must use this instead.
       */
      brand: primaryPalette[800],
    },
    border: {
      default: neutralLight[300],
      focused: primaryPalette[500],
      error: error.default,
    },
    /**
     * The loading-placeholder fill.
     *
     * It needs its own token because it is defined by *contrast against the
     * card*, not by a fixed step on the neutral ramp: one step darker than the
     * card in light, one step lighter in dark. Reusing `neutral[200]` for both
     * lands exactly on the dark card colour and the placeholder disappears.
     */
    skeleton: neutralLight[200],
    /**
     * Bottom navigation. Both the tab bar and the scroll-end menu read from
     * here so the two can never drift apart again.
     */
    navigation: {
      background: lightSurface.card,
      border: neutralLight[200],
      /** Icon tint for the selected destination — brand-true. */
      activeIcon: primaryPalette[500],
      /**
       * Label tint for the selected destination — 6.29:1, clears WCAG AA.
       *
       * This was `primary[500]`, which scores 2.32:1 and made the *selected*
       * destination the least readable text in the app: the unselected labels
       * beside it score 4.83:1 and pass. Held open for a while as a brand
       * decision, and that was the wrong reading. `color.text.brand` exists
       * precisely for "the brand amber used as a word rather than as a fill",
       * and its own documentation says anything in that position must use it.
       * The navigation label was the one place that did not, so this is the
       * design system being applied rather than overruled.
       *
       * The *icon* stays `primary[500]`, so the selected destination still
       * reads as brand orange — only the 12px label darkens.
       */
      activeLabel: primaryPalette[800],
      /** 4.83:1 on the navigation background — clears AA for the 12px label. */
      inactive: neutralLight[500],
      badge: error.default,
      onBadge: '#FFFFFF',
    },
  },
  typography,
  spacing,
  radius,
  shadow,
  iconSize,
  opacity,
  zIndex,
  motion,
} as const;

export const darkTokens = {
  color: {
    primary: primaryPalette,
    secondary: secondaryPalette,
    accent: accentPalette,
    neutral: neutralDark,
    surface: darkSurface,
    success: {
      default: success.darkDefault,
      surface: success.darkSurface,
      /** Fixed: white text on `darkDefault` would not read. */
      solid: success.default,
    },
    warning: {
      default: warning.darkDefault,
      surface: warning.darkSurface,
      /** Fixed: white text on `darkDefault` would not read. */
      solid: warning.default,
    },
    error: {
      default: error.darkDefault,
      surface: error.darkSurface,
      /** Fixed: white text on `darkDefault` would not read. */
      solid: error.default,
    },
    info: {
      default: info.darkDefault,
      surface: info.darkSurface,
      /** Fixed: white text on `darkDefault` would not read. */
      solid: info.default,
    },
    text: {
      primary: neutralDark[900],
      secondary: neutralDark[800],
      placeholder: neutralDark[600],
      disabled: neutralDark[500],
      inverse: '#0F1117',
      /** 7.26:1 on the dark card surface — the ramp inverts against dark. */
      brand: primaryPalette[500],
    },
    skeleton: neutralDark[300],
    border: {
      default: darkSurface.border,
      focused: primaryPalette[400],
      error: error.darkDefault,
    },
    navigation: {
      background: darkSurface.card,
      border: darkSurface.border,
      activeIcon: primaryPalette[500],
      /** 7.26:1 on the dark navigation background — already clears AA. */
      activeLabel: primaryPalette[500],
      inactive: neutralDark[600],
      badge: error.darkDefault,
      onBadge: '#0F1117',
    },
  },
  typography,
  spacing,
  radius,
  shadow: {
    // In dark mode, shadows are replaced with subtle borders
    sm: { ...shadow.sm, shadowOpacity: 0.02, elevation: 0 },
    card: { ...shadow.card, shadowOpacity: 0.04, elevation: 0 },
    elevated: { ...shadow.elevated, shadowOpacity: 0.06, elevation: 0 },
    floating: { ...shadow.floating, shadowOpacity: 0.08, elevation: 2 },
  },
  iconSize,
  opacity,
  zIndex,
  motion,
} as const;

export type Tokens = typeof lightTokens;
export type ColorScheme = 'light' | 'dark';
