// ─────────────────────────────────────────────────────────────────────────────
// The gap namespace must not be swallowed by the real handlers
//
// ── The bug this exists to prevent ───────────────────────────────────────────
//
// `setupCommunityLifeMocks` is registered before `setupCommunityGapMocks`, and
// axios-mock-adapter answers with the *first* pattern that matches. One of the
// community-life patterns was unanchored:
//
//     /\/community-life\/events\/[a-zA-Z0-9_-]+$/
//
// which also matches
//
//     /community-gap/v0/community-life/events/series
//
// because the gap namespace nests the simulated event-series routes under
// `/community-life`. So the series *list* request was answered by the real
// handler as a request for an **event whose id is the literal string
// "series"** — which does not exist. Every caller of `useSeriesList` got a 404.
//
// ── Why it went unnoticed ────────────────────────────────────────────────────
//
// A 404 from a mock is indistinguishable from a 404 from a server. The screens
// that read the series list rendered a recoverable error, which looks like a
// transient failure rather than a route that can never succeed. It was found
// only when a new screen showed the error state on a device and the seed data
// was checked against it.
//
// ── What this test asserts ───────────────────────────────────────────────────
//
// Not that the data is any particular shape — that the request *arrives*. Each
// case below is a gap route whose path begins with a segment the real handlers
// also claim, which is the only condition under which the collision can recur.
// ─────────────────────────────────────────────────────────────────────────────

import { initMocks } from '@/mocks';
import * as gapApi from '@/lib/community-gap-api';
import { MOCK_SERIES } from '@/mocks/community-gap-data';

describe('gap routes are not intercepted by the real community-life handlers', () => {
  beforeAll(() => {
    initMocks();
  });

  it('answers the series list rather than 404ing it as an event id', async () => {
    const page = await gapApi.fetchSeriesList();
    expect(page.items.length).toBe(MOCK_SERIES.length);
  });

  it('filters the series list by organisation', async () => {
    // `ser-2` is the only seeded series for `org-1`. If the request were being
    // answered by the real events handler this would throw rather than filter.
    const page = await gapApi.fetchSeriesList({ organizationId: 'org-1' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].organizationId).toBe('org-1');
  });

  it('answers a single series', async () => {
    const series = await gapApi.fetchSeries('ser-2');
    expect(series.seriesId).toBe('ser-2');
  });

  it('answers organisation announcements', async () => {
    const page = await gapApi.fetchAnnouncements({ scope: 'Organization', scopeId: 'org-1' });
    expect(page.items.every((a) => a.scopeId === 'org-1')).toBe(true);
  });

  it('answers the organisation roster', async () => {
    // Role-gated: `org-1` grants `canManageMembers`, so this resolves. It 403s
    // for `org-2` and `org-3`, which is a different thing from being routed to
    // the wrong handler and is asserted separately below.
    const page = await gapApi.fetchOrganizationMembers('org-1');
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('refuses the roster on an organisation the caller cannot manage', async () => {
    // A 403 proves the gap handler was reached and applied its own rule. A 404
    // would mean the request never got there.
    await expect(gapApi.fetchOrganizationMembers('org-2')).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});
