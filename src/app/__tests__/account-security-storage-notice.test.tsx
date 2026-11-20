/**
 * The member is told when their device cannot keep a session (FSEC-006).
 *
 * The operator's half of "surface it" is a telemetry event, asserted in
 * `lib/__tests__/session-persistence.test.ts`. This is the member's half, and
 * it is the half that changes what somebody does: a session that ends when the
 * app closes looks like a bug unless the app says otherwise, and "I keep
 * getting signed out" is a support ticket rather than a security finding.
 *
 * Three states, not two. `web` is the storage adapter working as designed and
 * the member hears nothing about it; a notice that fires on an expected state
 * is a notice people learn to skip past, which is how the original boolean came
 * to be ignored in the first place.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import type { SessionPersistence } from '@/lib/platform/auth-storage';
// Below the mocks only by convention elsewhere in this directory; `jest.mock`
// is hoisted above every import by the Babel transform, so the order of these
// two groups changes nothing and the linter prefers this one.
import AccountSecurityScreen from '@/app/profile/account-security';

const mockShowAlert = jest.fn();

jest.mock('@/providers/notification-provider', () => ({
  ...jest.requireActual('@/providers/notification-provider'),
  useNotification: () => ({ showAlert: mockShowAlert }),
}));

jest.mock('@/components/layout/bottom-inset', () => ({ useBottomInset: () => 0 }));

jest.mock('@/lib/api/auth-api', () => ({
  ...jest.requireActual('@/lib/api/auth-api'),
  fetchSessions: jest.fn(() => Promise.resolve([])),
  revokeSession: jest.fn(() => Promise.resolve()),
  revokeOtherSessions: jest.fn(() => Promise.resolve()),
}));

const NOTICE = /signed out when you close the app/i;

function renderWith(persistence: SessionPersistence) {
  useAuthStore.setState({ sessionPersistence: persistence });

  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <AccountSecurityScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

afterEach(() => {
  useAuthStore.setState({ sessionPersistence: 'refused' });
  jest.clearAllMocks();
});

describe('the account-security screen and where the session lives', () => {
  it('tells the member when this phone has no keystore', async () => {
    renderWith('refused');

    await waitFor(() => expect(screen.getByText(NOTICE)).toBeTruthy());

    // It says what the member will notice and what they can do about it.
    const explanation = screen.getByText(/secure keystore is unavailable/i);

    // What it must not do is explain the credential. "Your refresh token is
    // stored unencrypted" is true, unreadable, and alarming in the wrong
    // direction: the member cannot act on it, and the thing they can act on is
    // that this device will not stay signed in.
    //
    // Asserted on this element rather than the screen: the Trusted Devices card
    // has always said "your Diaspora credentials", which a screen-wide query
    // matches, and a test that fails on somebody else's correct copy is a test
    // that gets deleted.
    const copy = ([] as unknown[]).concat(explanation.props.children).join('');
    expect(copy).not.toMatch(/refresh token|unencrypted|plaintext|credential/i);
  });

  it('says nothing when the keystore works', async () => {
    renderWith('keystore');

    // The sessions list settles first, so the absence is asserted on a screen
    // that has finished rendering rather than on one that has not started.
    await waitFor(() => expect(screen.getByText(/Trusted Devices/i)).toBeTruthy());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('says nothing on web, which is the adapter working as designed', async () => {
    renderWith('web');

    await waitFor(() => expect(screen.getByText(/Trusted Devices/i)).toBeTruthy());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
