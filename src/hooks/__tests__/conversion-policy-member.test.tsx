// ─────────────────────────────────────────────────────────────────────────────
// Whether a member may convert is the server's answer — 22 Oct 2026
//
// `useConversionPolicy` worked eligibility out as `terms.isEnabled &&
// balance.canConvert`. `canConvert` is false below the minimum with no reason,
// so a member short of the minimum was told "Conversion is not available on
// your account" and never saw the minimum. The terms now carry a `member`
// block; a server from before it gets the old reading.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth';
import { useConversionPolicy } from '../financial-gaps';

let mock: MockAdapter;
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const BALANCE = {
  balance: 320,
  lifetimeEarned: 320,
  lifetimeConverted: 0,
  lifetimeSpent: 0,
  canConvert: true,
  resolvedAt: '2026-10-22T10:00:00Z',
};

const TERMS = {
  isEnabled: true,
  currency: 'GBP',
  minorUnitsPerPoint: 0.5,
  minimumPoints: 500,
  maximumPoints: null,
  dailyMaximumPoints: null,
  dailyRemainingPoints: null,
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });

  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });

  mock.onGet('/financial/rewards/me').reply(200, { data: BALANCE });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

async function policyFor(terms: Record<string, unknown>) {
  mock.onGet('/financial/rewards/conversion').reply(200, { data: terms });

  const { result } = renderHook(() => useConversionPolicy(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  return result.current.data!;
}

describe('useConversionPolicy', () => {
  it('tells a member below the minimum the minimum, in the server’s words', async () => {
    const policy = await policyFor({
      ...TERMS,
      exponent: 2,
      symbol: '£',
      member: {
        canConvert: false,
        reasonCode: 'financial.rewards.below_minimum',
        reasonMessage: 'You need at least 500 points to convert. You have 320.',
        maximumNow: null,
      },
    });

    expect(policy.isEligible).toBe(false);
    expect(policy.ineligibleReason).toBe('You need at least 500 points to convert. You have 320.');
    expect(policy.ineligibleCode).toBe('financial.rewards.below_minimum');
  });

  it('takes the most a member may convert from the server, not from the balance', async () => {
    const policy = await policyFor({
      ...TERMS,
      minimumPoints: 10,
      exponent: 2,
      member: { canConvert: true, reasonCode: null, reasonMessage: null, maximumNow: 150 },
    });

    expect(policy.isEligible).toBe(true);
    expect(policy.maximumPoints).toBe(150);
    expect(policy.ineligibleReason).toBeNull();
  });

  it('prices one whole unit by the currency’s own exponent', async () => {
    const policy = await policyFor({
      ...TERMS,
      currency: 'JPY',
      exponent: 0,
      symbol: '¥',
      member: { canConvert: true, maximumNow: 320 },
    });

    expect(policy.pointsPerMajorUnit).toBe(2);
    expect(policy.exponent).toBe(0);
    expect(policy.symbol).toBe('¥');
  });

  it('reads a server with no member block as it did before', async () => {
    const policy = await policyFor({ ...TERMS, minimumPoints: 10 });

    expect(policy.isEligible).toBe(true);
    expect(policy.maximumPoints).toBe(320);
    expect(policy.exponent).toBe(2);
    expect(policy.pointsPerMajorUnit).toBe(200);
  });

  it('takes how long credit is held from the server', async () => {
    expect((await policyFor({ ...TERMS, holdDays: 14 })).holdDays).toBe(14);
  });

  it('keeps a stated hold of no days apart from a server that states none', async () => {
    expect((await policyFor({ ...TERMS, holdDays: 0 })).holdDays).toBe(0);
    client.clear();
    expect((await policyFor(TERMS)).holdDays).toBeNull();
  });
});
