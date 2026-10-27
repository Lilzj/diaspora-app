// ─────────────────────────────────────────────────────────────────────────────
// The points hooks say where their data comes from — 27 Oct 2026 (FE-09)
//
// `useCreatorPoints` read the real balance and reported `isSimulated: true`,
// switched off in a release build by the simulation flag — so a wrapper around
// a certified read described itself as the simulation it had replaced. And
// `useConversions`, the conversion history, still read `/financial-gap/v0`,
// which nothing serves, although `GET /financial/rewards/conversions` has been
// served since conversion shipped. Both are checked here as a release build
// sees them: no development flag and no gap preview.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth';
import { useCreatorPoints } from '../creator-economy';
import { useConversions } from '../financial-gaps';

let mock: MockAdapter;
let client: QueryClient;
const wasDev = (global as { __DEV__?: boolean }).__DEV__;
const wasPreview = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = false;
  delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });

  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'member', accountState: 'FullCommunityAccess' } as never,
  });
});

afterEach(() => {
  (global as { __DEV__?: boolean }).__DEV__ = wasDev;
  if (wasPreview === undefined) delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
  else process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = wasPreview;

  client.clear();
  mock.restore();
});

describe('useCreatorPoints', () => {
  it('is a real read in a release build, and says so', async () => {
    mock.onGet('/financial/rewards/me').reply(200, {
      data: {
        balance: 600,
        pendingPoints: 250,
        lifetimeEarned: 850,
        lifetimeConverted: 0,
        lifetimeSpent: 0,
        canConvert: true,
        resolvedAt: '2026-10-27T10:00:00Z',
      },
    });

    const { result } = renderHook(() => useCreatorPoints(), { wrapper });

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.isSimulated).toBe(false);
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.data!.available).toBe(600);
    expect(result.current.data!.pending).toBe(250);
  });
});

describe('useConversions', () => {
  it('reads the served conversion history, with each crossing as the server recorded it', async () => {
    mock.onGet('/financial/rewards/conversions').reply(200, {
      data: [
        {
          conversionId: 'c-2',
          points: 500,
          credited: { amount: 0.05, currency: 'MUR', minorUnits: 5, exponent: 2 },
          minorUnitsPerPoint: 0.01,
          policyVersion: 'reward.conversion@3',
          transactionId: 't-2',
          convertedAt: '2026-10-26T09:00:00Z',
          status: 'Holding',
          availableAt: '2026-11-09T09:00:00Z',
        },
        {
          conversionId: 'c-1',
          points: 1_000,
          credited: { amount: 0.1, currency: 'MUR', minorUnits: 10, exponent: 2 },
          minorUnitsPerPoint: 0.01,
          transactionId: 't-1',
          convertedAt: '2026-09-01T09:00:00Z',
        },
      ],
    });

    const { result } = renderHook(() => useConversions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      expect.objectContaining({ conversionId: 'c-2', points: 500, isHolding: true, availableAt: '2026-11-09T09:00:00Z' }),
      expect.objectContaining({ conversionId: 'c-1', points: 1_000, isHolding: false, availableAt: null }),
    ]);
  });
});
