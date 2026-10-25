/**
 * The Profile tab reads reputation through the shared cache — 23 Oct 2026 (FE-11).
 *
 * The tab filled `store/reputation.ts` with a fetch of its own while the
 * reputation screen used `useMyReputation`, so the two kept separate copies of
 * one profile and a member opening the dashboard from the tab cost two requests
 * out of the Trust module's ten a minute. The hook is now the only fetch, and it
 * keeps the store `lib/trustEngine.ts` reads in step.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MockAdapter from 'axios-mock-adapter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { useMyReputation } from '@/hooks/trust';
import { useReputationStore } from '@/store/reputation';
import { ReputationBadge } from '@/components/ReputationBadge';
import type { ReputationLevel } from '@/types/reputation';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: () => undefined,
  Link: ({ children }: { children: unknown }) => children,
}));

// eslint-disable-next-line import/first
import ProfileScreen from '../(tabs)/profile';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const PROFILE = {
  userId: 'member',
  contributionScore: 120,
  verificationScore: 30,
  trustScore: 0,
  combinedScore: 150,
  level: 'VerifiedResident',
  nextLevel: { name: 'TrustedContributor', minScore: 350, pointsNeeded: 200 },
  badges: [],
};

/** Another screen asking for the same profile, as the reputation dashboard does. */
function SecondReader() {
  useMyReputation();
  return null;
}

describe('the Profile tab and reputation', () => {
  let api: MockAdapter;

  beforeEach(() => {
    useReputationStore.setState({ reputation: null });
    api = new MockAdapter(apiClient);
    api.onGet(/\/trust\/reputation\/me$/).reply(200, { data: PROFILE });
    api.onAny().reply(200, { data: {} });
  });

  afterEach(() => api.restore());

  it('asks the server once for the tab and another reader, and fills the store the trust engine reads', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <ProfileScreen />
            <SecondReader />
          </ThemeProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText('REPUTATION DASHBOARD →')).toBeTruthy());

    expect(api.history.get.filter((request) => /\/trust\/reputation\/me$/.test(request.url ?? ''))).toHaveLength(1);
    expect(useReputationStore.getState().reputation?.level).toBe('VerifiedResident');
  });
});

describe('the reputation badge', () => {
  it('names a level this build does not know rather than showing nothing', () => {
    render(<ReputationBadge level={'CommunityLegend' as ReputationLevel} />);

    expect(screen.getByText('Community Legend')).toBeTruthy();
    expect(screen.getByText('🎖️')).toBeTruthy();
  });
});
