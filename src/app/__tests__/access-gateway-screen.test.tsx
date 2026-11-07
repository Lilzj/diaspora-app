/**
 * What a suspended or rejected member is told, 6 Nov 2026.
 *
 * The suspended screen listed two fixed "Policy Violations" (document
 * counterfeiting, misrepresenting residence) to every suspended member, offered
 * an appeal that filed a Verification appeal and so failed with "Nothing to
 * appeal yet", and showed everyone a panel to flip their own displayed state.
 * The rejected screen fell back to an invented finding about the member's
 * document when the reviewer's words had not loaded.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';

const mockSubmit = jest.fn();
const mockLatestOfType = jest.fn();

jest.mock('@/hooks/trust', () => ({
  useMyVerifications: () => ({ latestOfType: (type: string) => mockLatestOfType(type) }),
  useSubmitAppeal: () => ({ submit: mockSubmit, isPending: false, error: null }),
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
}));

jest.mock('@/components/layout/KeyboardAwareScrollView', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));

// eslint-disable-next-line import/first
import AccessGatewayScreen from '../access-gateway';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const MEMBER = '01a05770-33f2-7600-8000-0000000000da';
const REASON = 'I posted nothing that breaks the rules. Please look again at my account.';

function renderAs(accountState: 'Suspended' | 'VerificationRejected', access: Record<string, unknown> | null = null) {
  useAuthStore.setState({
    user: { userId: MEMBER, fullName: 'David Mensah', role: 'Member', accountState },
    access,
  } as never);
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <AccessGatewayScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLatestOfType.mockReturnValue(null);
});

describe('a suspended member', () => {
  it('is told nothing the app does not know, and gets no controls over their own state', () => {
    renderAs('Suspended');

    expect(screen.queryByText(/Policy Violations/i)).toBeNull();
    expect(screen.queryByText(/counterfeit/i)).toBeNull();
    expect(screen.queryByText(/residence boundaries/i)).toBeNull();
    expect(screen.queryByText(/Simulation/i)).toBeNull();
    expect(screen.queryByText(/Suspend Account/)).toBeNull();
    expect(screen.getByText(/The reason could not be loaded just now/)).toBeTruthy();
  });

  it('reads the reason, the note and the end date the server sent (7 Nov 2026)', () => {
    renderAs('Suspended', {
      reasonCode: 'FraudOrScam',
      reasonLabel: 'a fraud or scam',
      note: 'Three fake landlord adverts asking for deposits.',
      restrictedUntil: '2026-12-07T12:00:00.000Z',
    });

    expect(screen.getByText('Diaspora staff found your account was involved in a fraud or scam.')).toBeTruthy();
    expect(screen.getByText('Their note: Three fake landlord adverts asking for deposits.')).toBeTruthy();
    expect(screen.getByText(/It ends on 7 December 2026\./)).toBeTruthy();
  });

  it('appeals the suspension itself, under their own account', async () => {
    mockSubmit.mockResolvedValue({ appealId: 'appeal-1' });
    renderAs('Suspended');

    fireEvent.press(screen.getByText('Appeal this suspension'));
    fireEvent.changeText(screen.getByPlaceholderText(/why you think this suspension is a mistake/), REASON);
    fireEvent.press(screen.getByText('Send appeal'));

    await waitFor(() => expect(screen.getByText('Appeal sent')).toBeTruthy());
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Suspension', targetId: MEMBER, reason: REASON })
    );
  });
});

describe('a member whose verification was rejected', () => {
  it("never sees a finding the reviewer did not make", () => {
    renderAs('VerificationRejected');

    expect(screen.queryByText(/could not be authenticated/)).toBeNull();
    expect(screen.getByText(/could not load the reviewer's explanation/)).toBeTruthy();
  });
});
