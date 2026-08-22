// ─────────────────────────────────────────────────────────────────────────────
// Community Life browse reads the page, not the page's container
//
// `readList` did:
//
//     const items = response.data.data ?? [];
//     return { items, totalCount: response.data.totalCount ?? items.length };
//
// Both browse routes answer the platform's cursor envelope inside `data`:
//
//     { data: { items, nextCursor, hasMore, totalCount, facets, engine } }
//
// so `items` was assigned the **envelope object**. `items.length` is undefined
// and `items.map` is not a function — every Community Life events and
// organisations browse. And `totalCount` was read from a level that has never
// carried it, so the count silently degraded to `items.length` even where the
// server had counted.
//
// Confirmed against the running API on 22 Aug 2026; both routes 200 with the
// keys above.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchEvents, fetchOrganizations } from '../community-life-api';
import { apiClient } from '../apiClient';

jest.mock('../apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

beforeEach(() => mockGet.mockReset());

/** The envelope shape the running API returns, keys and all. */
function page(items: unknown[], totalCount: number | null = null) {
  return {
    data: {
      data: { items, nextCursor: null, hasMore: false, totalCount, facets: {}, engine: 'pg' },
      meta: { requestId: 'r', correlationId: 'c', timestamp: 't' },
    },
  };
}

describe('Community Life browse survives the cursor envelope', () => {
  it('reads events out of the page', async () => {
    mockGet.mockResolvedValue(page([{ eventId: 'e1' }, { eventId: 'e2' }]));

    const result = await fetchEvents();

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('reads organisations out of the page', async () => {
    mockGet.mockResolvedValue(page([{ organizationId: 'o1' }]));

    const result = await fetchOrganizations();

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('keeps the count the server supplied rather than the page size', async () => {
    // The distinction this pins: 3 rows on the first page of 57 matches. Reading
    // the count from the wrong level reported 3, which reads as "that is all
    // there is" — the exact failure `platform-envelope.ts` was written to end.
    mockGet.mockResolvedValue(page([{ eventId: 'e1' }, { eventId: 'e2' }, { eventId: 'e3' }], 57));

    expect((await fetchEvents()).totalCount).toBe(57);
  });

  it('falls back to the row count only when the server declines to count', async () => {
    mockGet.mockResolvedValue(page([{ eventId: 'e1' }, { eventId: 'e2' }], null));

    expect((await fetchEvents()).totalCount).toBe(2);
  });

  it('still reads a route that answers a bare array', async () => {
    // `readPage` accepts both, so this signature keeps its promise whichever
    // shape the route settles on.
    mockGet.mockResolvedValue({ data: { data: [{ eventId: 'e1' }] } });

    expect((await fetchEvents()).items).toHaveLength(1);
  });

  it('yields an empty list, not a crash, on an unrecognised payload', async () => {
    mockGet.mockResolvedValue({ data: { data: { dashboard: {} } } });

    const result = await fetchEvents();

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});
