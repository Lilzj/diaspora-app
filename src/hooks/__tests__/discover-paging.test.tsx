// ─────────────────────────────────────────────────────────────────────────────
// Providers and jobs past the first page — 15 Sep 2026
//
// Discover's Providers and Jobs tabs read one page of twenty and stopped, with
// no way to the rest. Both page now: one server page per "Show more", appended
// in the order it arrived and never re-sorted, so page two continues page one —
// which is what makes "Distance" mean nearest first across every page.
//
// Driven at the network boundary, through the real clients and the real
// community scope, so a cursor that is not sent under the name the route binds
// fails here.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useProviderSearchPages } from '../providers';
import { useScopedContentPages } from '../communities';
import { useCommunityContextStore } from '@/store/community-context';

let mock: MockAdapter;
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  useCommunityContextStore.getState().reset();
});

afterEach(() => {
  client.clear();
  mock.restore();
});

function provider(id: string) {
  return {
    providerId: id,
    slug: id,
    name: `Provider ${id}`,
    category: { name: 'Plumbing' },
    location: { cityName: 'Rose Hill', distanceKm: null },
    owner: { originCountryCode: null },
    reviewSummary: { average: 0, totalReviews: 0 },
    isVerified: false,
  };
}

describe('useProviderSearchPages', () => {
  it('appends the next page under the first, each provider once, and keeps the order it says it is in', async () => {
    const cursors: (string | undefined)[] = [];

    mock.onGet('/providers').reply((config) => {
      const cursor = config.params?.cursor as string | undefined;
      cursors.push(cursor);

      return cursor === 'after-bravo'
        ? [200, { data: { items: [provider('bravo'), provider('charlie')], nextCursor: null, hasMore: false, appliedSort: 'Distance' } }]
        : [200, { data: { items: [provider('alpha'), provider('bravo')], nextCursor: 'after-bravo', hasMore: true, appliedSort: 'Distance' } }];
    });

    const { result } = renderHook(
      () => useProviderSearchPages({ latitude: -20.24, longitude: 57.48, radiusKm: 5, sortBy: 'distance' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.providers).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.appliedSort).toBe('Distance');

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.providers.map((row) => row.providerId)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(cursors).toEqual([undefined, 'after-bravo']);
  });

  it('keeps what is shown when a later page fails, and says so on the button rather than as a failed search', async () => {
    mock.onGet('/providers').reply((config) =>
      config.params?.cursor
        ? [503, {}]
        : [200, { data: { items: [provider('alpha')], nextCursor: 'next', hasMore: true } }]
    );

    const { result } = renderHook(() => useProviderSearchPages({}), { wrapper });

    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.loadMoreFailed).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.providers).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  it('is a failed search when the first page fails', async () => {
    mock.onGet('/providers').reply(503, {});

    const { result } = renderHook(() => useProviderSearchPages({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.providers).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useScopedContentPages', () => {
  it('reads GET /jobs page after page, sending the cursor the route binds', async () => {
    const cursors: (string | undefined)[] = [];

    mock.onGet('/jobs').reply((config) => {
      const cursor = config.params?.cursor as string | undefined;
      cursors.push(cursor);

      return cursor === 'page-two'
        ? [200, { data: { items: [{ jobId: 'job-3' }], nextCursor: null, hasMore: false } }]
        : [200, { data: { items: [{ jobId: 'job-1' }, { jobId: 'job-2' }], nextCursor: 'page-two', hasMore: true } }];
    });
    // The community scope reads the directory for names; an empty one, so its
    // own retry is not left sleeping after the test.
    mock.onGet('/communities').reply(200, { data: { items: [], nextCursor: null, hasMore: false } });

    const { result } = renderHook(
      () => useScopedContentPages<{ jobId: string }>('job', { query: 'nurse', extra: { country: 'MU' } }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.items.map((job) => job.jobId)).toEqual(['job-1', 'job-2', 'job-3']);
    expect(cursors).toEqual([undefined, 'page-two']);

    const firstRequest = mock.history.get.find((request) => request.url === '/jobs');
    expect(firstRequest?.params).toMatchObject({ q: 'nurse', country: 'MU' });
  });
});
