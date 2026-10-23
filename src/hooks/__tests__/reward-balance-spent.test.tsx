// ─────────────────────────────────────────────────────────────────────────────
// Points spent are counted — 22 Oct 2026
//
// The balance carried earned and converted but nothing spent, and the creator
// points tile hard-coded `lifetimeSpent` to zero — so after the first redeemed
// reward, earned − converted no longer matched the balance on screen. The
// server now sends `lifetimeSpent`; a server from before it reads as zero.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth';
import { useRewardBalance } from '../financial-gaps';

let mock: MockAdapter;
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });

  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

describe('useRewardBalance', () => {
  it('carries the points spent, and the three totals account for the balance', async () => {
    mock.onGet('/financial/rewards/me').reply(200, {
      data: {
        balance: 400,
        lifetimeEarned: 1_000,
        lifetimeConverted: 300,
        lifetimeSpent: 300,
        canConvert: true,
        resolvedAt: '2026-10-22T10:00:00Z',
      },
    });

    const { result } = renderHook(() => useRewardBalance(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const balance = result.current.data!;

    expect(balance.lifetimeSpent).toBe(300);
    expect(balance.lifetimeEarned - balance.lifetimeConverted - (balance.lifetimeSpent ?? 0)).toBe(
      balance.available
    );
  });

  it('reads a server that does not send it as nothing spent', async () => {
    mock.onGet('/financial/rewards/me').reply(200, {
      data: {
        balance: 700,
        lifetimeEarned: 1_000,
        lifetimeConverted: 300,
        canConvert: true,
        resolvedAt: '2026-10-22T10:00:00Z',
      },
    });

    const { result } = renderHook(() => useRewardBalance(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.lifetimeSpent).toBe(0);
  });
});
