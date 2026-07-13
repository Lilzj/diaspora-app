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
  const systemScheme = useColorScheme() ?? 'light';
  const [override, setOverride] = useState<ColorScheme | null>(initialOverride);

  const activeScheme: ColorScheme = override ?? systemScheme;
  const tokens = activeScheme === 'dark' ? darkTokens : lightTokens;

  const setThemeOverride = useCallback((scheme: ColorScheme | null) => {
    setOverride(scheme);
    // TODO: Persist to AsyncStorage here so it survives app restarts
    // await AsyncStorage.setItem('theme_override', scheme ?? '');
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
