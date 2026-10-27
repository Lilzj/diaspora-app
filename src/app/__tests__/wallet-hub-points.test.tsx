/**
 * The wallet hub always reaches the points screen — 27 Oct 2026 (FE-10, FE-04).
 *
 * The hub hid the member's real points balance whenever conversion was off,
 * which on every deployment so far is always: a member with points could not
 * find them from their wallet. Rewards is not a capability to gate. The fix had
 * a test of the gating rule and none of the screen; this renders it.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';

const mockRewardBalance = jest.fn();

jest.mock('@/hooks/financial', () => {
  const actual = jest.requireActual('@/hooks/financial');
  const idle = { isLoading: false, isError: false, error: null, refetch: jest.fn() };

  return {
    ...actual,
    usePrimaryWallet: () => ({ ...idle, wallet: null }),
    useTransactions: () => ({ ...idle, data: [] }),
    useMySubscription: () => ({ ...idle, data: null }),
    // A deployment that offers no way in and no way out, as production does for
    // payouts today.
    useFinancialCapabilities: () => ({ ...idle, data: { payoutsEnabled: false, supportedMethods: [] } }),
    useRewardPointsBalance: () => ({ ...idle, data: mockRewardBalance() }),
  };
});

jest.mock('@/hooks/financial-gaps', () => ({
  ...jest.requireActual('@/hooks/financial-gaps'),
  useGapFeaturesEnabled: () => false,
}));

jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
}));

// eslint-disable-next-line import/first
import WalletScreen from '../wallet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

jest.setTimeout(30000);

function renderHub() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <WalletScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  useAuthStore.setState({
    status: 'authenticated',
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });
});

describe('points on the wallet hub', () => {
  it('shows the server’s balance and opens the points screen while conversion is off', () => {
    mockRewardBalance.mockReturnValue({
      balance: 1_250,
      lifetimeEarned: 1_250,
      lifetimeConverted: 0,
      canConvert: false,
      resolvedAt: '2026-10-27T10:00:00Z',
    });

    renderHub();

    const rewards = screen.getByLabelText(`Rewards, ${(1_250).toLocaleString()} pts`);
    expect(rewards.props.accessibilityState?.disabled).not.toBe(true);

    fireEvent.press(rewards);
    expect(router.push).toHaveBeenCalledWith('/wallet/rewards');
  });

  it('still opens the points screen before the balance has loaded', () => {
    mockRewardBalance.mockReturnValue(undefined);

    renderHub();

    fireEvent.press(screen.getByLabelText('Rewards'));
    expect(router.push).toHaveBeenCalledWith('/wallet/rewards');
  });
});
