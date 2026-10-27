/**
 * The points history, as the screen draws it — 27 Oct 2026 (FE-10, FE-01).
 *
 * A redeemed reward rendered as "+300": the wire keeps `points` positive and
 * says which way they moved in `isConversion`, `isSpend` and `isReversal`, and
 * the client signed only conversions. The sign was fixed in the hook and tested
 * there; nothing rendered the screen to see the row a member sees. This does,
 * through the real hooks, with only the network mocked.
 */
import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth';
import RewardsScreen from '../wallet/rewards';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// The first render loads the whole screen through real hooks; it can take
// longer than the default five seconds on a cold run.
jest.setTimeout(30000);

let mock: MockAdapter;
let client: QueryClient;

function entry(
  entryId: string,
  points: number,
  source: string,
  minutesAgo: number,
  flags: { isConversion?: boolean; isSpend?: boolean; isReversal?: boolean } = {}
) {
  return {
    entryId,
    points,
    source,
    isConversion: flags.isConversion ?? false,
    isSpend: flags.isSpend ?? false,
    isReversal: flags.isReversal ?? false,
    occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });

  // `status` as well: a request sent while it reads 'unknown' starts a session
  // restore, which finds no stored session and signs the member out.
  useAuthStore.setState({
    status: 'authenticated',
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });

  // earned 1,450 − converted 500 − spent 300 − taken back 200 = 450.
  mock.onGet('/financial/rewards/me').reply(200, {
    data: {
      balance: 450,
      pendingPoints: 0,
      lifetimeEarned: 1_450,
      lifetimeConverted: 500,
      lifetimeSpent: 300,
      lifetimeReversed: 200,
      canConvert: false,
      resolvedAt: new Date().toISOString(),
    },
  });

  mock.onGet('/financial/rewards/me/history').reply(200, {
    data: [
      entry('taken-back', 200, 'UpdateVerified', 5, { isReversal: true }),
      entry('spent', 300, 'Redemption:creator-badge-supporter', 10, { isSpend: true }),
      entry('converted', 500, 'Conversion', 15, { isConversion: true }),
      entry('earned', 250, 'GuideApproved', 20),
      entry('first', 1_200, 'Challenge:settling-in-sprint', 25),
    ],
  });

  mock.onAny().reply(404, { title: 'Not mocked', status: 404 });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

function renderScreen() {
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <RewardsScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

describe('the points history', () => {
  it('draws an earning as plus, and every way points leave as minus', async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByLabelText(/^GuideApproved\. plus 250 points/)).toBeTruthy());

    expect(screen.getByLabelText(/^Spent on a reward\. minus 300 points/)).toBeTruthy();
    expect(screen.getByLabelText(/^Converted to wallet credit\. minus 500 points/)).toBeTruthy();
    expect(screen.getByLabelText(/^Taken back before it was ready\. minus 200 points/)).toBeTruthy();
  });

  it('never draws a debit with a plus', async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByLabelText(/^GuideApproved\. plus/)).toBeTruthy());

    expect(screen.queryByLabelText(/^Spent on a reward\. plus/)).toBeNull();
    expect(screen.queryByLabelText(/^Converted to wallet credit\. plus/)).toBeNull();
    expect(screen.queryByLabelText(/^Taken back before it was ready\. plus/)).toBeNull();
  });
});
