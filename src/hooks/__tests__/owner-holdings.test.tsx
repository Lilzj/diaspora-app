// ─────────────────────────────────────────────────────────────────────────────
// Does this dashboard have anything to be about? — 16 Sep 2026
//
// Driven at the network boundary, through the real routes, because the point of
// the hook is the difference between three answers the wire gives differently:
// an empty page, a refusal that means "you are not a landlord", and a failure
// that means nothing at all.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useOwnerHoldings } from '../analytics';

let mock: MockAdapter;
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // `retryDelay: 0` because the hook retries a transport failure once, and the
  // test should not wait a second to watch it give up.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  client.clear();
  mock.restore();
});

describe('useOwnerHoldings', () => {
  it('says so when the member holds none, so the dashboard can stop showing zeros', async () => {
    mock.onGet('/housing/listings/mine').reply(200, { data: { items: [], hasMore: false } });

    const { result } = renderHook(() => useOwnerHoldings('landlord'), { wrapper });

    await waitFor(() => expect(result.current.hasAny).toBe(false));
  });

  it('reads the platform’s own refusal as "you hold none"', async () => {
    // What `/housing/listings/mine` answers for a member with no landlord profile.
    mock.onGet('/housing/listings/mine').reply(403, { code: 'housing.landlord.not_found' });

    const { result } = renderHook(() => useOwnerHoldings('landlord'), { wrapper });

    await waitFor(() => expect(result.current.hasAny).toBe(false));
  });

  it('claims nothing when the ask itself failed', async () => {
    mock.onGet('/providers/me').reply(500, {});

    const { result } = renderHook(() => useOwnerHoldings('provider'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Null, not false: the dashboard shows its figures as it always did.
    expect(result.current.hasAny).toBeNull();
  });

  it('says the member holds something when they do', async () => {
    mock.onGet('/marketplace/listings/mine').reply(200, {
      data: { items: [{ listingId: 'l1' }], hasMore: false },
    });

    const { result } = renderHook(() => useOwnerHoldings('seller'), { wrapper });

    await waitFor(() => expect(result.current.hasAny).toBe(true));
  });

  it('asks nothing at all until a role is known', async () => {
    const { result } = renderHook(() => useOwnerHoldings(null), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasAny).toBeNull();
    expect(mock.history.get).toHaveLength(0);
  });
});
