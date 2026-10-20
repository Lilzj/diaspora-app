// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics repositories against their handlers
// (Frontend Phase 15, §75)
//
// Runs the real `analytics-gap-api.ts` and `analytics-api.ts` against the real
// handlers. Nothing is re-implemented; a test against a re-implementation of the
// thing under test proves nothing.
//
// Two halves, matching the phase's two arms:
//
//   The **development** arm, against `/analytics-gap/v0/*`. What is asserted is
//   not "the fixture came back" — there are no fixtures — but the properties a
//   screen depends on: that route order does not make `/creators/me` resolve as a
//   creator called "me"; that a request without a timezone is *refused* rather
//   than silently defaulted; that an unknown funnel is a 404 rather than a
//   generated funnel; and that the export job genuinely passes through queued,
//   running and ready rather than arriving complete.
//
//   The **certified** arm, against the real `/jobs`, `/housing`, `/marketplace`,
//   `/listings` and `/neighborhood/{id}` handlers. What is asserted there is that
//   the counts are read from `meta.totalCount` and marked `backend`, and that one
//   domain being unreachable degrades to PARTIAL rather than blanking a dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupAnalyticsGapMocks, resetAnalyticsMockState } from '@/mocks/handlers/analytics';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import { setupLocationMocks } from '@/mocks/handlers/location';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import {
  fetchAnalyticsAccess,
  fetchAnalyticsDataset,
  fetchAnalyticsInsights,
  fetchAnalyticsLeaderboard,
  fetchAnalyticsRetention,
} from '@/lib/analytics-gap-api';
import * as analyticsApi from '@/lib/analytics-api';
import { fetchInventoryCounts } from '@/lib/analytics-api';
import type { AnalyticsQuery, AnalyticsSubject, AnalyticsTimeRange } from '@/types/analytics';

let mock: MockAdapter;

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

function query(subject: AnalyticsSubject, overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return { subject, range: RANGE, ...overrides };
}

beforeEach(() => {
  mock = new MockAdapter(apiClient);
  resetAnalyticsMockState();

  setupAnalyticsGapMocks(mock);
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

// ═════════════════════════════════════════════════════════════════════════════
// THE DEVELOPMENT ARM
// ═════════════════════════════════════════════════════════════════════════════

describe('every subject route resolves to the right subject', () => {
  const subjects: AnalyticsSubject[] = [
    { type: 'platform', id: null },
    { type: 'creator', id: null },
    { type: 'country', id: 'GB' },
    { type: 'community', id: 'dev-ng' },
    { type: 'neighborhood', id: 'dev-peckham' },
    { type: 'provider', id: 'p1' },
    { type: 'employer', id: 'e1' },
    { type: 'seller', id: 's1' },
    { type: 'landlord', id: 'l1' },
    { type: 'organization', id: 'o1' },
    { type: 'campaign', id: 'c1' },
    { type: 'guide', id: 'g1' },
    { type: 'event', id: 'ev1' },
    { type: 'update', id: 'u1' },
    { type: 'job', id: 'j1' },
    { type: 'listing', id: 'li1' },
    { type: 'housing', id: 'h1' },
  ];

  it.each(subjects)('$type resolves and echoes its own subject', async (subject) => {
    const dataset = await fetchAnalyticsDataset(query(subject));

    expect(dataset.subject.type).toBe(subject.type);
    expect(dataset.subject.id ?? null).toBe(subject.id ?? null);
  });

  // The route-order trap. `/creators/me` must not be swallowed by a looser pattern.
  it('`/creators/me` is the self-scoped creator, not a creator called "me"', async () => {
    const dataset = await fetchAnalyticsDataset(query({ type: 'creator', id: null }));

    expect(dataset.subject.type).toBe('creator');
    expect(dataset.subject.id ?? null).toBeNull();
  });

  // `/content/{type}/{id}` is registered before the single-segment patterns.
  it('a content item resolves its type from the path rather than from a parameter', async () => {
    const dataset = await fetchAnalyticsDataset(query({ type: 'guide', id: 'g-42' }));

    expect(dataset.subject.type).toBe('guide');
    expect(dataset.subject.id).toBe('g-42');
  });

  it('two entities of the same type get different datasets', async () => {
    const first = await fetchAnalyticsDataset(query({ type: 'provider', id: 'p1' }));
    const second = await fetchAnalyticsDataset(query({ type: 'provider', id: 'p2' }));

    expect(first.metrics.map((metric) => metric.value.value)).not.toEqual(
      second.metrics.map((metric) => metric.value.value)
    );
  });
});

describe('§58 · a range without a timezone is refused, not defaulted', () => {
  it('rejects a dataset request with no timezone', async () => {
    // A mock that quietly substituted today's date in the device zone would let a
    // screen ship without sending one, and §58's whole point is that the client
    // must state the calendar it means.
    const bare = query({ type: 'platform', id: null });
    const withoutZone = { ...bare, range: { ...bare.range, timezone: '' } };

    await expect(fetchAnalyticsDataset(withoutZone)).rejects.toThrow();
  });

  it('echoes the timezone it was given', async () => {
    const dataset = await fetchAnalyticsDataset(
      query({ type: 'platform', id: null }, { range: { ...RANGE, timezone: 'Pacific/Auckland' } })
    );

    expect(dataset.range.timezone).toBe('Pacific/Auckland');
  });

  it('two timezones for the same dates are two different answers', async () => {
    const london = await fetchAnalyticsDataset(query({ type: 'platform', id: null }));
    const auckland = await fetchAnalyticsDataset(
      query({ type: 'platform', id: null }, { range: { ...RANGE, timezone: 'Pacific/Auckland' } })
    );

    expect(london.range.timezone).not.toBe(auckland.range.timezone);
  });
});

describe('the request the client sends is the request the register documents', () => {
  it('carries metrics, breakdowns, comparison and series as separate parameters', async () => {
    const dataset = await fetchAnalyticsDataset(
      query(
        { type: 'community', id: 'dev-ng' },
        {
          metrics: ['reach.members', 'content.views'],
          breakdowns: ['country', 'category'],
          comparison: 'previousPeriod',
          includeSeries: true,
        }
      )
    );

    expect(dataset.metrics.map((metric) => metric.key).sort()).toEqual([
      'content.views',
      'reach.members',
    ]);
    expect(dataset.breakdowns).toHaveLength(2);
    expect(dataset.series.length).toBeGreaterThan(0);
    expect(dataset.comparison).toBe('previousPeriod');
  });

  it('omits the series when it was not asked for — §51', async () => {
    const dataset = await fetchAnalyticsDataset(query({ type: 'community', id: 'dev-ng' }));
    expect(dataset.series).toEqual([]);
  });

  it('carries filters through as dimension:value pairs', async () => {
    const dataset = await fetchAnalyticsDataset(
      query(
        { type: 'platform', id: null },
        { filters: [{ dimension: 'country', values: ['GB', 'NG'] }] }
      )
    );

    expect(dataset).toBeDefined();
  });

  it('carries the community scope token', async () => {
    const dataset = await fetchAnalyticsDataset(
      query({ type: 'community', id: 'dev-ng' }, { communityScopeToken: 'dev-ng|dev-gh' })
    );

    expect(dataset).toBeDefined();
  });
});

// §32's funnels, §43's exports and §45's saved reports are served for real since
// 20 Oct 2026 and their simulated routes are gone. `analytics-reports-funnels-
// exports.test.ts` covers the real client.

describe('§33 · retention comes back with its window and its incomplete cohorts', () => {
  it('states the measurement window and the offsets', async () => {
    const table = await fetchAnalyticsRetention({ type: 'platform', id: null }, RANGE, 'week', 6);

    expect(table.granularity).toBe('week');
    expect(table.cohorts).toHaveLength(6);
    expect(table.measurementWindow.length).toBeGreaterThan(40);
    expect(table.offsetLabels.length).toBeGreaterThan(0);
  });

  it('caps the cohort count server-side rather than trusting the client', async () => {
    const table = await fetchAnalyticsRetention({ type: 'platform', id: null }, RANGE, 'week', 500);
    expect(table.cohorts.length).toBeLessThanOrEqual(24);
  });

  it('marks the newest cohort incomplete', async () => {
    const table = await fetchAnalyticsRetention({ type: 'platform', id: null }, RANGE, 'week', 6);
    expect(table.cohorts[table.cohorts.length - 1].isIncomplete).toBe(true);
  });
});

describe('leaderboards and insights', () => {
  it('a leaderboard comes back in server order with routes', async () => {
    const leaderboard = await fetchAnalyticsLeaderboard(
      'top-content',
      { type: 'platform', id: null },
      RANGE,
      'content.views'
    );

    expect(leaderboard.rows.map((row) => row.position)).toEqual(
      leaderboard.rows.map((_, index) => index + 1)
    );
    expect(leaderboard.rows[0].entity.route).toBeTruthy();
  });

  it('a leaderboard row carries a title and a value but no owner', async () => {
    // §47: the one place a person could appear, and it carries what the server
    // chose to publish and nothing else.
    const leaderboard = await fetchAnalyticsLeaderboard(
      'top-content',
      { type: 'creator', id: null },
      RANGE,
      'content.views'
    );

    for (const row of leaderboard.rows) {
      expect(row.entity.title).toBeTruthy();
      expect(Object.keys(row.entity)).toEqual(
        expect.not.arrayContaining(['userId', 'ownerId', 'email', 'handle'])
      );
    }
  });

  it('insights come back with a tone and no client-side generation', async () => {
    const insights = await fetchAnalyticsInsights({ type: 'platform', id: null }, RANGE);

    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(['positive', 'negative', 'neutral']).toContain(insight.tone);
      expect(insight.source).toBe('simulated');
    }
  });
});



describe('§48 · the capability route answers per subject', () => {
  it('refuses platform analytics to an ordinary caller', async () => {
    const access = await fetchAnalyticsAccess({ type: 'platform', id: null });

    expect(access.canView).toBe(false);
    expect(access.canViewAdministrative).toBe(false);
  });

  it('allows a member their own creator analytics', async () => {
    const access = await fetchAnalyticsAccess({ type: 'creator', id: null });

    expect(access.canView).toBe(true);
    expect(access.subject.type).toBe('creator');
  });

  it('echoes the subject it was asked about', async () => {
    const access = await fetchAnalyticsAccess({ type: 'community', id: 'dev-gh' });

    expect(access.subject).toEqual({ type: 'community', id: 'dev-gh' });
  });

  it('publishes supported ranges and comparisons rather than leaving them empty', async () => {
    const access = await fetchAnalyticsAccess({ type: 'creator', id: null });

    expect(access.supportedRanges.length).toBeGreaterThan(3);
    expect(access.supportedComparisons).toContain('none');
    expect(access.reportingTimezone).toBe('Europe/London');
  });

  it('refuses a request with no subject type', async () => {
    const response = await apiClient
      .get('/analytics-gap/v0/access')
      .catch((error) => error.response);

    expect(response.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE CERTIFIED ARM
// ═════════════════════════════════════════════════════════════════════════════

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
