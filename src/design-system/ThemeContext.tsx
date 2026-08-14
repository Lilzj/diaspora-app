/**
 * Diaspora Platform — Theme Context
 *
 * Provides the active design tokens (light or dark) to the entire component
 * tree, and owns the member's Light / Dark / System preference.
 *
 * ── The bifurcation this closes ─────────────────────────────────────────────
 *
 * This file used to carry a warning saying an override here could only move the
 * tokens, because most of the interface is coloured by NativeWind classes that
 * resolve through CSS variables under `@media (prefers-color-scheme: dark)` —
 * *"Nothing in JavaScript can move that media query"*. Setting an override would
 * then have produced a half-dark app.
 *
 * That was true of the Tailwind-for-web `class` strategy, which is what the
 * warning was reasoning about. It is not true of NativeWind v4 on native.
 * `colorScheme.set()` from `nativewind` is implemented as a call to React
 * Native's own `Appearance.setColorScheme()` — see
 * `react-native-css-interop/dist/runtime/native/appearance-observables.js`,
 * where `set()` forwards to `appearance.setColorScheme(value)` and the
 * `systemColorScheme` observable follows through the Appearance change listener.
 *
 * So one call moves *both* systems at once:
 *
 *     colorScheme.set('dark')
 *            ↓
 *     Appearance.setColorScheme('dark')
 *            ↓                        ↓
 *     useColorScheme() === 'dark'     NativeWind's colorScheme observable
 *            ↓                        ↓
 *     lightTokens / darkTokens        the CSS variables in global.css
 *
 * They cannot disagree, because they are reading the same value. That is why
 * `tailwind.config.js` stays on `darkMode: 'media'`: the media query is now
 * something JavaScript can move, and switching to `'class'` is the change that
 * previously stopped `dark:` resolving at all.
 *
 * ── 'system' ────────────────────────────────────────────────────────────────
 *
 * `colorScheme.set('system')` clears the override rather than pinning a value,
 * so the OS is back in charge and a change to the phone's appearance while the
 * app is open flows straight through the Appearance listener. No restart.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTokens, darkTokens, type Tokens, type ColorScheme } from './tokens';

// ---------------------------------------------------------------------------
// Preference
// ---------------------------------------------------------------------------

/** What the member chose in Settings → Appearance. */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCE_KEY = 'diaspora.appearance.preference';

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/**
 * Applies a preference to the one place both styling systems read from.
 *
 * Wrapped in a try/catch because it reaches `Appearance.setColorScheme`, which
 * is absent from some test environments and from React Native for Web builds
 * older than 0.20. A theme preference failing to apply must not take the app
 * down with it.
 */
export function applyThemePreference(preference: ThemePreference): void {
  try {
    nativewindColorScheme.set(preference);
  } catch {
    // Fall back to the tokens alone. The utility-class layer stays on the OS
    // scheme, which is the pre-existing behaviour rather than a new failure.
  }
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  /** All design tokens for the active colour scheme */
  tokens: Tokens;
  /** The colour scheme actually in effect, after the preference is applied */
  colorScheme: ColorScheme;
  /** What the member chose. `'system'` means "follow the phone". */
  preference: ThemePreference;
  /** Persist and apply a preference. */
  setPreference: (preference: ThemePreference) => void;
  /** False until the stored preference has been read back at startup. */
  isPreferenceReady: boolean;
  /** Whether the member has pinned a scheme rather than following the phone */
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
   * Starting preference, for tests and for stories. Production reads the stored
   * one from AsyncStorage instead.
   */
  initialPreference?: ThemePreference;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialPreference,
}) => {
  // Reflects the preference once applied: `Appearance.setColorScheme` moves what
  // this hook returns, so there is no second source of truth to keep in step.
  const activeScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const [preference, setPreferenceState] = useState<ThemePreference>(
    initialPreference ?? 'system'
  );
  const [isPreferenceReady, setPreferenceReady] = useState(initialPreference !== undefined);

  // --- Startup: read the stored preference and apply it ---------------------
  useEffect(() => {
    if (initialPreference !== undefined) return;

    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
        if (cancelled) return;

        if (isThemePreference(stored)) {
          setPreferenceState(stored);
          applyThemePreference(stored);
        }
      } catch (error) {
        // A theme preference is not worth failing startup over. The app keeps
        // the phone's scheme, which is what an unset preference means anyway.
        console.warn('[theme] could not read the stored appearance preference', error);
      } finally {
        // In `finally` deliberately: a read that throws must still release the
        // app, or a failure here is a permanent blank screen.
        if (!cancelled) setPreferenceReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPreference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    // Applied before the write: the member sees the change immediately, and a
    // storage failure costs them the persistence rather than the change.
    applyThemePreference(next);

    AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch((error) => {
      console.warn('[theme] could not persist the appearance preference', error);
    });
  }, []);

  const tokens = useMemo(
    () => (activeScheme === 'dark' ? darkTokens : lightTokens) as unknown as Tokens,
    [activeScheme]
  );

  // --- Compatibility with the pre-preference API ----------------------------
  //
  // `setThemeOverride(null)` meant "follow the system", which is `'system'`.
  const setThemeOverride = useCallback(
    (scheme: ColorScheme | null) => setPreference(scheme ?? 'system'),
    [setPreference]
  );

  const toggleTheme = useCallback(() => {
    setPreference(activeScheme === 'light' ? 'dark' : 'light');
  }, [activeScheme, setPreference]);

  // --- Follow the phone while no preference is pinned -----------------------
  useEffect(() => {
    if (preference !== 'system') return;
    // `useColorScheme` already re-renders on change; this subscription exists so
    // the provider is also notified when the app returns to foreground having
    // had its appearance changed in the background.
    const subscription = Appearance.addChangeListener(() => {});
    return () => subscription.remove();
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      tokens,
      colorScheme: activeScheme,
      preference,
      setPreference,
      isPreferenceReady,
      isOverridden: preference !== 'system',
      setThemeOverride,
      toggleTheme,
    }),
    [
      tokens,
      activeScheme,
      preference,
      setPreference,
      isPreferenceReady,
      setThemeOverride,
      toggleTheme,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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
 * const { tokens, colorScheme, preference, setPreference } = useTheme();
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
 * back to the colour scheme directly — which, since the preference is applied
 * through `Appearance`, is the same answer the provider would give.
 *
 * Primitives use this. Anything that needs `setPreference` or `colorScheme`
 * still uses `useTheme`.
 */
export const useThemeTokens = (): Tokens => {
  const ctx = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  if (ctx) return ctx.tokens;
  return (systemScheme === 'dark' ? darkTokens : lightTokens) as unknown as Tokens;
};
