// ─────────────────────────────────────────────────────────────────────────────
// The points history stops repeating itself — 20 Sep 2026
//
// `GET /financial/rewards/me/history` pages on an **inclusive** `before`, so
// every page began with the entry the previous one ended on — and a page whose
// entries all shared an instant returned itself, which this hook reads as
// "there is more" and scrolls without end. The route now takes `excludeIds`,
// like every other history in the module, and this hook has to send them.
//
// **The accumulation is the part that is easy to get wrong.** A tie group wider
// than one page spans several requests, and sending only the last page's
// identifiers hands page one's entries back on page three. Driven at the
// network boundary through the real client, so identifiers that are not sent
// under the name the route binds fail here.
//
// `act(() => { void fetchNextPage() })` and then `waitFor`, never
// `await act(async () => await fetchNextPage())`: the awaited form fires the
// request — the first version of this file watched all three go out — but React
// never commits the result, so `result.current` sits on page one and every
// assertion about what the hook *holds* reads the state from before the fetch.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth';
import { useRewardHistory } from '../financial-gaps';

const PAGE_SIZE = 25;

/** Every entry in this suite is awarded at one of two instants, by design. */
const TIED = '2026-09-20T11:30:00.0000000+00:00';
const EARLIER = '2026-09-20T09:00:00.0000000+00:00';

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

function entry(entryId: string, occurredAt: string) {
  return {
    entryId,
    points: 10,
    isConversion: false,
    source: 'guide.published',
    occurredAt,
  };
}

/**
 * A history the server pages honestly: an inclusive boundary, minus whatever the
 * caller says it has already been shown. Exactly what the route now does.
 */
function serveHistory(all: ReturnType<typeof entry>[]) {
  const requests: { before?: string; excludeIds: string[] }[] = [];

  mock.onGet('/financial/rewards/me/history').reply((config) => {
    const before = config.params?.before as string | undefined;
    const excludeIds = (config.params?.excludeIds as string[] | undefined) ?? [];
    const take = (config.params?.take as number | undefined) ?? PAGE_SIZE;

    requests.push({ before, excludeIds });

    const page = all
      .filter((row) => before === undefined || row.occurredAt <= before)
      .filter((row) => !excludeIds.includes(row.entryId))
      .slice(0, take);

    return [200, { data: page }];
  });

  return requests;
}

describe('useRewardHistory', () => {
  it('sends the identifiers it has already been shown at the boundary', async () => {
    const all = Array.from({ length: PAGE_SIZE + 3 }, (_, index) =>
      entry(`e${index}`, index < PAGE_SIZE ? TIED : EARLIER)
    );

    const requests = serveHistory(all);

    const { result } = renderHook(() => useRewardHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    // The first page asked for no boundary. The second names the instant the
    // first ended on and every identifier shown at it — without which the
    // server would hand back the same twenty-five entries for ever.
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({ before: undefined, excludeIds: [] });
    expect(requests[1].before).toBe(TIED);
    expect(requests[1].excludeIds).toHaveLength(PAGE_SIZE);

    expect(seenBy(result)).toHaveLength(all.length);
  });

  it('carries identifiers forward while the boundary stands still', async () => {
    // Two full pages of entries sharing one instant, then three older ones. The
    // boundary does not move between the first two requests, so the second
    // page's identifiers have to be added to the first's rather than replace
    // them — otherwise page three re-serves page one.
    const all = [
      ...Array.from({ length: PAGE_SIZE * 2 }, (_, index) => entry(`tied${index}`, TIED)),
      ...Array.from({ length: 3 }, (_, index) => entry(`old${index}`, EARLIER)),
    ];

    const requests = serveHistory(all);

    const { result } = renderHook(() => useRewardHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data!.pages).toHaveLength(2));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    expect(requests).toHaveLength(3);
    expect(requests[2].before).toBe(TIED);
    expect(requests[2].excludeIds).toHaveLength(PAGE_SIZE * 2);

    const seen = seenBy(result);

    expect(seen).toHaveLength(all.length);
    expect(new Set(seen).size).toBe(all.length);
  });

  it('forgets the identifiers once the boundary moves', async () => {
    // A tie group that ends inside the first page: the boundary the first page
    // reports is the *older* instant, so nothing from the tie group is relevant
    // to the next request, and carrying it would grow the query string for
    // nothing.
    const all = [
      ...Array.from({ length: 3 }, (_, index) => entry(`tied${index}`, TIED)),
      ...Array.from({ length: PAGE_SIZE + 2 }, (_, index) => entry(`old${index}`, EARLIER)),
    ];

    const requests = serveHistory(all);

    const { result } = renderHook(() => useRewardHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    expect(requests[1].before).toBe(EARLIER);
    expect(requests[1].excludeIds.every((id) => id.startsWith('old'))).toBe(true);
  });

  it('ends the history rather than looping when the last page is short', async () => {
    const requests = serveHistory([entry('only', TIED)]);

    const { result } = renderHook(() => useRewardHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Points spent on a reward are a debit — 22 Oct 2026
//
// The wire keeps `points` positive and states the direction in a boolean. Only
// `isConversion` existed, so a redeemed reward reached this hook as a positive
// entry and rendered as "+300" — points earned. The server now sends `isSpend`.
// ─────────────────────────────────────────────────────────────────────────────

describe('useRewardHistory signs', () => {
  it('renders points spent on a reward as a debit, as it does a conversion', async () => {
    mock.onGet('/financial/rewards/me/history').reply(200, {
      data: [
        { entryId: 'earned', points: 1000, isConversion: false, isSpend: false, source: 'Milestone', occurredAt: TIED },
        { entryId: 'spent', points: 300, isConversion: false, isSpend: true, source: 'Redemption:creator-badge-supporter', occurredAt: TIED },
        { entryId: 'converted', points: 500, isConversion: true, isSpend: false, source: 'Conversion', occurredAt: EARLIER },
        // A server from before `isSpend` was sent: no field, which reads as not spent.
        { entryId: 'older-server', points: 10, isConversion: false, source: 'guide.published', occurredAt: EARLIER },
      ],
    });

    const { result } = renderHook(() => useRewardHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const byId = new Map(
      (result.current.data?.pages ?? []).flatMap((page) => page.entries).map((row) => [row.entryId, row])
    );

    expect(byId.get('earned')?.points).toBe(1000);
    expect(byId.get('spent')?.points).toBe(-300);
    expect(byId.get('spent')?.reason).toBe('Spent on a reward');
    expect(byId.get('converted')?.points).toBe(-500);
    expect(byId.get('older-server')?.points).toBe(10);
  });

  /** D-9: points taken back before they vested left, like points spent. */
  it('renders points taken back as a debit', async () => {
    mock.onGet('/financial/rewards/me/history').reply(200, {
      data: [
        { entryId: 'earned', points: 50, isConversion: false, isSpend: false, isReversal: false, source: 'GuidePublished', occurredAt: EARLIER },
        { entryId: 'taken-back', points: 50, isConversion: false, isSpend: false, isReversal: true, source: 'GuidePublished', occurredAt: TIED },
      ],
    });

    const { result } = renderHook(() => useRewardHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const byId = new Map(
      (result.current.data?.pages ?? []).flatMap((page) => page.entries).map((row) => [row.entryId, row])
    );

    expect(byId.get('earned')?.points).toBe(50);
    expect(byId.get('taken-back')?.points).toBe(-50);
    expect(byId.get('taken-back')?.reason).toBe('Taken back before it was ready');
  });
});

function seenBy(result: { current: ReturnType<typeof useRewardHistory> }): string[] {
  return (result.current.data?.pages ?? []).flatMap((page) =>
    page.entries.map((row) => row.entryId)
  );
}
