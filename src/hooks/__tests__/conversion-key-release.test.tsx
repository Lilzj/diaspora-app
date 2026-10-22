// ─────────────────────────────────────────────────────────────────────────────
// A second conversion is a second conversion — 22 Oct 2026 (FE-12)
//
// `useCreateConversion` keeps its idempotency key per number of points for ten
// minutes, and never released it. Converting 500 points and then, on purpose,
// another 500 sent the first key again; the server — rightly, since the key is
// required and the member's own — replayed the first conversion, and the member
// was shown "Converted" with nothing new converted. The key is released once
// the server answers with a conversion. A retry before an answer still reuses
// it, which is what it is for.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { financialKeys } from '@/lib/financial-api';
import { clearIdempotencyKeys } from '@/lib/idempotency';
import { useAuthStore } from '@/store/auth';
import { useCreateConversion } from '../financial-gaps';

let mock: MockAdapter;
let client: QueryClient;
let sentKeys: string[];

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function conversion(points: number) {
  return {
    conversionId: `conversion-${sentKeys.length}`,
    points,
    credited: { amount: 2.5, currency: 'GBP', minorUnits: 250, exponent: 2, symbol: '£' },
    minorUnitsPerPoint: 0.5,
    transactionId: 'transaction',
    convertedAt: '2026-10-22T10:00:00Z',
  };
}

beforeEach(async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  sentKeys = [];
  await clearIdempotencyKeys();

  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

function recordKey(config: { data?: string }) {
  sentKeys.push(JSON.parse(config.data ?? '{}').idempotencyKey);
}

describe('useCreateConversion', () => {
  it('sends a new key for a second, deliberate conversion of the same points', async () => {
    mock.onPost('/financial/rewards/conversions').reply((config) => {
      recordKey(config);
      return [200, { data: conversion(500) }];
    });

    const { result } = renderHook(() => useCreateConversion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(500);
    });
    await act(async () => {
      await result.current.mutateAsync(500);
    });

    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[0]).toBeTruthy();
    expect(sentKeys[1]).not.toBe(sentKeys[0]);
  });

  it('reuses the key for a retry the server never answered', async () => {
    let calls = 0;
    mock.onPost('/financial/rewards/conversions').reply((config) => {
      recordKey(config);
      calls += 1;
      return calls === 1 ? [503, {}] : [200, { data: conversion(500) }];
    });

    const { result } = renderHook(() => useCreateConversion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(500).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(500);
    });

    expect(sentKeys).toHaveLength(2);
    expect(sentKeys[1]).toBe(sentKeys[0]);
  });

  /**
   * The wallet's Rewards badge reads `['financial', 'rewards', 'me']`, which
   * neither this nor `invalidateAfterMoneyMoved` touched, so the wallet went on
   * showing the points just converted.
   */
  it('makes the wallet re-read the points it converted', async () => {
    mock.onPost('/financial/rewards/conversions').reply((config) => {
      recordKey(config);
      return [200, { data: conversion(500) }];
    });
    client.setQueryData(financialKeys.rewardPoints(), { balance: 1_000 });

    const { result } = renderHook(() => useCreateConversion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(500);
    });

    expect(client.getQueryState(financialKeys.rewardPoints())?.isInvalidated).toBe(true);
  });
});
