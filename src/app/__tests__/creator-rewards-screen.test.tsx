/**
 * The creator rewards screen says what pays points — 27 Oct 2026 (FE-10, RWD-02).
 *
 * Its Earn tab listed Creator's per-action rules as "Earns 50 points" for a
 * guide and "+30" for an event. Nothing ever paid them: they weigh activity
 * toward leaderboards and milestones. Points are paid for confirmed outcomes
 * alone (D-2), priced by Trust. `EarnPointsList` is tested on its own; this
 * renders the screen, reading the rules through the real hook from the mocked
 * route that `reputation-rules-drift.test.ts` holds to the server.
 */
import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { resetTrustMocks, setupTrustMocks } from '@/mocks/handlers/trust';
import { useAuthStore } from '@/store/auth';

jest.mock('@/hooks/creator-economy', () => {
  const actual = jest.requireActual('@/hooks/creator-economy');
  const idle = { isLoading: false, isError: false, error: null, refetch: jest.fn() };

  return {
    ...actual,
    useCreatorAccess: () => ({ creatorStatus: 'Contributor' }),
    useCreatorPoints: () => ({
      ...idle,
      isSimulated: false,
      isEnabled: true,
      data: {
        available: 1_750,
        pending: 250,
        lifetimeEarned: 2_000,
        lifetimeConverted: 0,
        lifetimeSpent: 0,
        lifetimeExpired: 0,
        nextThreshold: null,
        nextThresholdLabel: null,
        nextExpiryAt: null,
        nextExpiryPoints: null,
        updatedAt: '2026-10-27T10:00:00Z',
      },
    }),
    useRewardCatalogue: () => ({ ...idle, rewards: [], isEnabled: true }),
    useRewardRedemptions: () => ({ ...idle, redemptions: [] }),
    useCreatorConversionPolicy: () => ({ ...idle, data: undefined }),
    useRedeemReward: () => ({ mutateAsync: jest.fn(), isPending: false }),
  };
});

// eslint-disable-next-line import/first
import CreatorRewardsScreen from '../creator/rewards';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

jest.setTimeout(30000);

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupTrustMocks(mock);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resetTrustMocks();
  useAuthStore.setState({
    status: 'authenticated',
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <CreatorRewardsScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

describe('the Earn tab', () => {
  it('lists the confirmed outcomes Trust pays points for, at their price', async () => {
    renderScreen();

    fireEvent.press(screen.getByRole('tab', { name: 'How to earn' }));

    await waitFor(() => expect(screen.getByLabelText(/^Guides approved\. Earns 250/)).toBeTruthy());

    expect(screen.getByLabelText(/^Updates confirmed by the community\. Earns 200/)).toBeTruthy();
    expect(screen.getByLabelText(/^Referrals qualified\. Earns 250/)).toBeTruthy();
  });

  it('offers no points for publishing, which earns XP and nothing else', async () => {
    renderScreen();

    fireEvent.press(screen.getByRole('tab', { name: 'How to earn' }));

    await waitFor(() => expect(screen.getByLabelText(/^Guides approved\. Earns/)).toBeTruthy());

    for (const xpOnly of ['Guides published', 'Events published', 'Comments written', 'Academy courses completed']) {
      expect(screen.queryByLabelText(new RegExp(`^${xpOnly}\\. Earns`))).toBeNull();
    }
  });

  it('shows the balance the server reports', () => {
    renderScreen();

    expect(screen.getAllByText((1_750).toLocaleString()).length).toBeGreaterThan(0);
  });
});
