/**
 * Diaspora Platform — Theme Context
 *
 * Provides the active design tokens (light or dark) to the entire component tree.
 * Respects the system colour scheme and allows user override from settings.
 *
 * Usage:
 *   Wrap the app in <ThemeProvider> at the root.
 *   Access tokens in any component via the useTheme() hook.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { lightTokens, darkTokens, type Tokens, type ColorScheme } from './tokens';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  /** All design tokens for the active colour scheme */
  tokens: Tokens;
  /** The currently active colour scheme */
  colorScheme: ColorScheme;
  /** Whether the user has manually overridden the system preference */
  isOverridden: boolean;
  /** Override the theme. Pass null to revert to system preference. */
  setThemeOverride: (scheme: ColorScheme | null) => void;
  /** Toggle between light and dark (sets an override) */
  toggleTheme: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * Optional initial override. Pass a stored user preference from AsyncStorage here.
   * If null/undefined, the system preference is used.
   */
  initialOverride?: ColorScheme | null;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialOverride = null,
}) => {
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [override, setOverride] = useState<ColorScheme | null>(initialOverride);

  const activeScheme: ColorScheme = override ?? systemScheme;
  const tokens = (activeScheme === 'dark' ? darkTokens : lightTokens) as unknown as Tokens;

  /**
   * ⚠ The override moves the tokens only, and that is not the whole app.
   *
   * Most of the interface is coloured by NativeWind utility classes, which
   * resolve through CSS custom properties under
   * `@media (prefers-color-scheme: dark)` — the *operating system's* scheme.
   * Nothing in JavaScript can move that media query, so a member who set an
   * override here would get the token-styled surfaces in one scheme and every
   * utility-styled surface in the other: a half-dark app, which is worse than
   * either scheme on its own.
   *
   * Nothing calls this today, so nothing is broken. Before a settings control
   * is wired to it, `tailwind.config.js` has to move from `darkMode: 'media'`
   * back to `'class'` and this has to drive NativeWind's own
   * `setColorScheme()` as well — and then the *system* path needs re-testing,
   * because `'class'` with nothing setting the class is exactly the state that
   * left 84 screens stuck in light mode before.
   *
   * Persistence (AsyncStorage) belongs in the same change, not before it.
   */
  const setThemeOverride = useCallback((scheme: ColorScheme | null) => {
    setOverride(scheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setOverride(prev => {
      const current = prev ?? systemScheme;
      return current === 'light' ? 'dark' : 'light';
    });
  }, [systemScheme]);

  // React to system changes when no override is set
  useEffect(() => {
    if (override !== null) return;
    const subscription = Appearance.addChangeListener(() => {
      // State updates automatically via useColorScheme re-render
    });
    return () => subscription.remove();
  }, [override]);

  return (
    <ThemeContext.Provider
      value={{
        tokens,
        colorScheme: activeScheme,
        isOverridden: override !== null,
        setThemeOverride,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useTheme
 *
 * Access the active design tokens and theme utilities from any component.
 *
 * @example
 * const { tokens, colorScheme, toggleTheme } = useTheme();
 * <View style={{ backgroundColor: tokens.color.surface.background }} />
 */
export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
};

/**
 * useThemeTokens
 *
 * The active tokens, without requiring a provider.
 *
 * `useTheme` throws when there is no provider, which is the right contract for
 * a screen — a screen outside the app tree is a wiring mistake worth failing
 * on. It is the wrong contract for a design-system primitive: a Button or an
 * Input can legitimately be rendered in a detached tree, and crashing there is
 * worse than answering the question. So when the provider is absent this falls
 * back to the system colour scheme directly, which is the same answer the
 * provider itself gives whenever no user override is set.
 *
 * Primitives use this. Anything that needs `toggleTheme` or `colorScheme`
 * still uses `useTheme`.
 */
export const useThemeTokens = (): Tokens => {
  const ctx = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  if (ctx) return ctx.tokens;
  return (systemScheme === 'dark' ? darkTokens : lightTokens) as unknown as Tokens;
};
