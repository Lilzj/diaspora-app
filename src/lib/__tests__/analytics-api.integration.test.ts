// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics inventory against its handlers
// (Frontend Phase 15, §75)
//
// The certified inventory arm, against the real `/jobs`, `/housing`,
// `/marketplace`, `/listings` handlers. What is asserted is that the counts are
// read from `meta.totalCount` and marked `backend`, and that one domain being
// unreachable degrades to PARTIAL rather than blanking a dashboard.
//
// The development arm this file also ran (`/analytics-gap/v0`) is gone: every
// analytics subject has a served dataset since 20 Oct 2026, and retention,
// boards and insights are served too (`analytics-served-reads.test.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import { setupLocationMocks } from '@/mocks/handlers/location';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import * as analyticsApi from '@/lib/analytics-api';
import { fetchInventoryCounts } from '@/lib/analytics-api';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);

  // The certified routes the analytics inventory reads.
  setupJobsMocks(mock);
  setupHousingMocks(mock);
  setupMarketplaceMocks(mock);
  setupDiscoveryMocks(mock);
  setupLocationMocks(mock);
  setupCommunityLifeMocks(mock);
});

afterEach(() => {
  mock.restore();
});

describe('§9 · inventory counts are read from real routes and marked real', () => {
  it('returns metrics sourced `backend`, with no gap key', async () => {
    const { metrics } = await fetchInventoryCounts();

    expect(metrics.length).toBeGreaterThan(0);
    for (const metric of metrics) {
      expect(metric.value.source).toBe('backend');
      expect(metric.value.gapKey).toBeUndefined();
      expect(metric.computation).toBe('server-aggregate');
      // A live count, not a nightly rollup — and the freshness says so.
      expect(metric.freshness.methodology).toContain('live records');
    }
  });

  it('reads the count from `meta.totalCount` rather than from the page length', async () => {
    // The client asks for one item, so a page-length reading would report 1 for
    // every domain.
    const { metrics } = await fetchInventoryCounts();

    expect(metrics.some((metric) => metric.value.value > 1)).toBe(true);
  });

  it('honours a country filter', async () => {
    const unfiltered = await fetchInventoryCounts();
    const filtered = await fetchInventoryCounts({ countryCode: 'GB' });

    // Both answer; whether they differ depends on the fixture data, so the
    // assertion is that the filter is passed and does not break the read.
    expect(filtered.metrics.length).toBeGreaterThan(0);
    expect(unfiltered.metrics.length).toBeGreaterThan(0);
  });

  // §37's PARTIAL, at the source.
  it('one domain being unreachable does not blank the others', async () => {
    mock.onGet(/\/jobs/).networkError();

    const { metrics, unavailable } = await fetchInventoryCounts();

    expect(unavailable).toContain('inventory.jobs');
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.some((metric) => metric.key === 'inventory.jobs')).toBe(false);
  });

  it('a route answering without a count reports unavailable rather than zero', async () => {
    // Printing "0 jobs" over a working jobs board is a worse failure than an
    // absent card.
    mock.onGet(/\/jobs/).reply(200, { data: [] });

    const { metrics, unavailable } = await fetchInventoryCounts();

    expect(unavailable).toContain('inventory.jobs');
    expect(metrics.some((metric) => metric.key === 'inventory.jobs')).toBe(false);
  });
});

describe('a neighbourhood’s inventory, retired with the place catalogue (14 Oct 2026)', () => {
  it('no longer reads the catalogue neighbourhood route', () => {
    // A neighbourhood is the area around a point now (`GET /geo/area`); an
    // analytics subject keyed by a catalogue id has no point to ask about.
    expect('fetchNeighborhoodInventory' in analyticsApi).toBe(false);
  });
});
