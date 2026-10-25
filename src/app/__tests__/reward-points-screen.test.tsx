/**
 * The points screen shows points still vesting — 25 Oct 2026 (D-9, FE-06).
 *
 * A grant is pending for a week before it can be converted or spent. The screen
 * had a line for pending points, fed a zero the hook hard-coded because every
 * grant used to land settled, so the line never showed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import type { RewardBalance } from '@/types/financial-gaps';

const mockBalance = jest.fn();

jest.mock('@/hooks/financial-gaps', () => ({
  useRewardBalance: () => ({
    data: mockBalance(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
  useRewardHistory: () => ({
    data: { pages: [{ entries: [], hasMore: false }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useConversionPolicy: () => ({ data: undefined, refetch: jest.fn() }),
}));

// eslint-disable-next-line import/first
import RewardsScreen from '../wallet/rewards';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function balance(overrides: Partial<RewardBalance> = {}): RewardBalance {
  return {
    available: 100,
    pending: 0,
    nextVestsAt: null,
    lifetimeEarned: 100,
    lifetimeConverted: 0,
    lifetimeSpent: 0,
    updatedAt: '2026-10-25T10:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <RewardsScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });
});

describe('points still vesting', () => {
  it('says how many are on their way, and when the first are ready', () => {
    mockBalance.mockReturnValue(balance({ pending: 250, nextVestsAt: '2026-11-01T10:00:00Z', lifetimeEarned: 350 }));

    renderScreen();

    const when = new Date('2026-11-01T10:00:00Z').toLocaleDateString();
    expect(screen.getByText(`250 more still vesting, the first ready on ${when}`)).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('says nothing about vesting when nothing is pending', () => {
    mockBalance.mockReturnValue(balance());

    renderScreen();

    expect(screen.queryByText(/still vesting/)).toBeNull();
  });
});
