/**
 * Appearance — Light / Dark / System, and whether it survives a restart
 *
 * §5 and §6 of the post-APK pass: a real preference under Settings, persisted,
 * and in effect the next time the app opens.
 *
 * ── What made this hard before, and what changed ─────────────────────────────
 *
 * `ThemeContext` used to carry a warning that an override could only move the
 * design tokens, because the utility-class layer resolves through CSS variables
 * under `@media (prefers-color-scheme: dark)` — *"Nothing in JavaScript can move
 * that media query"*. Wiring a settings control to it would have produced an app
 * that was dark in its token-styled surfaces and light everywhere else.
 *
 * That is true of Tailwind-for-web's `class` strategy. It is not true of
 * NativeWind v4 on native, where `colorScheme.set()` is a call to React Native's
 * `Appearance.setColorScheme()`. Both layers then read the same value, so they
 * cannot disagree.
 *
 * The test that matters most here is therefore not "does the token change" but
 * **"does the preference reach `colorScheme.set`"** — because that call is the
 * single point where the two styling systems are kept in step. Assert on the
 * tokens alone and the half-dark app comes back without a failure.
 *
 * ── "Close the app and reopen it" ────────────────────────────────────────────
 *
 * `ThemeProvider` keeps the preference in component state and nowhere else, so
 * a freshly mounted provider has no memory of any previous one and must read
 * the value back from storage to know anything. That mount *is* the restart —
 * there is no module-level cache that a `jest.resetModules()` would need to
 * clear, and writing one in would suggest there was.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemeProvider, useTheme, THEME_PREFERENCE_KEY, type ThemePreference } from '../ThemeContext';

// The seam under test. Its production implementation calls
// `Appearance.setColorScheme`, which jest-expo does not run.
const mockSetColorScheme = jest.fn();
jest.mock('nativewind', () => ({
  colorScheme: {
    set: (...args: unknown[]) => mockSetColorScheme(...args),
    get: () => 'light',
  },
}));

function Probe() {
  const { preference, colorScheme, isPreferenceReady } = useTheme();
  return (
    <Text testID="probe">{`${preference}|${colorScheme}|${isPreferenceReady}`}</Text>
  );
}

/** Mounts a provider with no seeded preference — i.e. a cold start. */
function coldStart() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
}

const readProbe = () => screen.getByTestId('probe').props.children as string;

beforeEach(async () => {
  mockSetColorScheme.mockClear();
  await AsyncStorage.clear();
});

describe('choosing an appearance', () => {
  it.each<[ThemePreference]>([['light'], ['dark'], ['system']])(
    'applies %s to the one place both styling systems read from',
    async (preference) => {
      let setPreference: (p: ThemePreference) => void = () => {};

      function Capture() {
        setPreference = useTheme().setPreference;
        return null;
      }

      render(
        <ThemeProvider initialPreference="system">
          <Capture />
        </ThemeProvider>
      );

      await act(async () => setPreference(preference));

      // Not "the tokens changed" — that would still pass in the half-dark
      // state this call exists to prevent. See the file header.
      expect(mockSetColorScheme).toHaveBeenCalledWith(preference);
    }
  );

  it('writes the choice to storage under a stable key', async () => {
    let setPreference: (p: ThemePreference) => void = () => {};
    function Capture() {
      setPreference = useTheme().setPreference;
      return null;
    }
    render(
      <ThemeProvider initialPreference="system">
        <Capture />
      </ThemeProvider>
    );

    await act(async () => setPreference('dark'));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark');
    });
  });
});

describe('surviving a restart', () => {
  // §6 Test A and Test B.
  it.each<[ThemePreference]>([['light'], ['dark']])(
    'reopens on %s after the app is closed',
    async (preference) => {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);

      coldStart();

      await waitFor(() => {
        expect(readProbe()).toContain(`${preference}|`);
      });

      // And it was pushed into the styling systems on the way up, not merely
      // remembered in React state.
      expect(mockSetColorScheme).toHaveBeenCalledWith(preference);
    }
  );

  // §6 Test C.
  it('reopens following the phone when the choice was System', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'system');

    coldStart();

    await waitFor(() => {
      expect(readProbe()).toContain('system|');
    });
  });

  it('follows the phone when nothing was ever chosen', async () => {
    coldStart();

    await waitFor(() => {
      expect(readProbe()).toContain('system|');
    });
    // A cold start with no stored preference must not pin a scheme.
    expect(mockSetColorScheme).not.toHaveBeenCalled();
  });

  it('ignores a stored value that is not a preference', async () => {
    // Defends against a partial write or a key reused by an older build.
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'sepia');

    coldStart();

    await waitFor(() => {
      expect(readProbe()).toContain('system|');
    });
    expect(mockSetColorScheme).not.toHaveBeenCalled();
  });
});

describe('when storage fails', () => {
  it('still releases the app rather than holding the first paint for ever', async () => {
    const getItem = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    coldStart();

    // `isPreferenceReady` is what a splash gate would wait on. If a failed read
    // left it false, the app would never paint.
    await waitFor(() => {
      expect(readProbe()).toContain('|true');
    });

    getItem.mockRestore();
    warn.mockRestore();
  });
});
