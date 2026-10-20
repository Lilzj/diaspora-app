// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics end-to-end journeys (Frontend Phase 15, §78)
//
// §78's nine required journeys, each driven through the real API clients, the
// real handlers, the real range resolver and the real access evaluator. These are
// the acceptance tests for the phase: a journey that passes here is a journey a
// member can complete, and a journey that changes shape when a gap closes will
// fail here first.
//
// The repositories are exercised directly rather than through rendered screens,
// following the precedent Phases 12 and 13 set. What that buys is the ability to
// assert the *dataset* each step produced — its status, its provenance, its
// unavailable metrics — which is what the journeys are actually about and which a
// render test would hide behind a spinner.
//
// Journey 9 is the one worth reading first. It is the phase's final principle
// expressed as a test: when the backend is unavailable, the analytics UI is still
// complete, clearly labelled, and not broken.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupAnalyticsGapMocks, resetAnalyticsMockState } from '@/mocks/handlers/analytics';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import { setupLocationMocks } from '@/mocks/handlers/location';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import * as gapApi from '../analytics-gap-api';
import { fetchInventoryCounts } from '../analytics-api';
import { composeDataset } from '../analytics/adapters';
import { evaluateAnalyticsAction, supportedRanges } from '../analytics/access';
import { defaultGranularity, describeRange, resolveRange } from '../analytics/time-range';
import { formatMetricValue } from '../analytics/format';
import type { AnalyticsQuery, AnalyticsSubject, AnalyticsTimeRange } from '@/types/analytics';

let mock: MockAdapter;

const NOW = new Date('2026-08-08T14:30:00Z');

beforeEach(() => {
  mock = new MockAdapter(apiClient);
  resetAnalyticsMockState();

  setupAnalyticsGapMocks(mock);
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

/** The range a member gets after the capability set says which zone to cut in. */
async function rangeFor(subject: AnalyticsSubject, preset = 'last30d' as const) {
  const access = await gapApi.fetchAnalyticsAccess(subject);
  return {
    access,
    range: resolveRange(preset, {
      reportingTimezone: access.reportingTimezone,
      now: NOW,
    }),
  };
}

function query(
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  overrides: Partial<AnalyticsQuery> = {}
): AnalyticsQuery {
  return { subject, range, granularity: defaultGranularity(range), ...overrides };
}

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 1 — Authorized admin → Platform → 30 days → growth → engagement →
//             communities → drill down
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 1 · an administrator reviews the platform', () => {
  const subject: AnalyticsSubject = { type: 'platform', id: null };

  it('completes every step, and each one answers', async () => {
    // Step 1: the capability set is read *before* anything is requested.
    const access = await gapApi.fetchAnalyticsAccess(subject);

    // An ordinary caller is refused, which is the correct default — the
    // administrative preview is opt-in in development. §48.
    expect(access.canViewAdministrative).toBe(false);
    expect(
      evaluateAnalyticsAction({ action: 'view-administrative', access }).kind
    ).toBe('hidden');

    // Step 2: with the capability, the range is cut in the platform's calendar.
    const range = resolveRange('last30d', {
      reportingTimezone: access.reportingTimezone,
      now: NOW,
    });
    expect(range.isDeviceTimezone).toBe(false);
    expect(describeRange(range)).toBe('Last 30 days');

    // Step 3: growth.
    const growth = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: ['growth.members.net', 'growth.content.new'],
        comparison: 'previousPeriod',
        includeSeries: true,
      })
    );
    expect(growth.metrics).toHaveLength(2);
    expect(growth.series.length).toBeGreaterThan(0);

    // Step 4: engagement.
    const engagement = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: ['audience.users.active.daily', 'audience.users.active.monthly'],
      })
    );
    expect(engagement.metrics).toHaveLength(2);

    // Step 5: communities, as a breakdown dimension of the platform.
    const communities = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['content.views'], breakdowns: ['community'] })
    );
    expect(communities.breakdowns[0].dimension).toBe('community');
    expect(communities.breakdowns[0].buckets.length).toBeGreaterThan(1);

    // Step 6: drill down — the same dashboard, narrowed to one community.
    const bucket = communities.breakdowns[0].buckets[0];
    const drilled = await gapApi.fetchAnalyticsDataset(
      query({ type: 'community', id: bucket.key }, range, { metrics: ['content.views'] })
    );
    expect(drilled.subject.id).toBe(bucket.key);

    // And the drill-down is genuinely about that community, not the platform.
    expect(drilled.metrics[0].value.value).not.toBe(communities.metrics[0].value.value);
  });

  it('is hybrid: the inventory is real and the audience is not', async () => {
    const { range } = await rangeFor(subject);

    const adapter = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['audience.users.total'] })
    );
    const { metrics: certified } = await fetchInventoryCounts();

    const composed = composeDataset({
      subject,
      range,
      comparison: 'none',
      parts: [
        {
          metrics: adapter.metrics,
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
      ],
      certifiedMetrics: certified,
      gapKey: adapter.gapKey,
    });

    // §37: PARTIAL is the honest status when half a dashboard is real.
    expect(composed.status).toBe('PARTIAL');
    expect(composed.metrics.some((metric) => metric.value.source === 'backend')).toBe(true);
    expect(composed.metrics.some((metric) => metric.value.source === 'simulated')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 2 — Community moderator → Community analytics → growth → engagement →
//             events → content
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 2 · a moderator reviews their community', () => {
  const subject: AnalyticsSubject = { type: 'community', id: 'dev-ng' };

  it('completes every step', async () => {
    const { access, range } = await rangeFor(subject);
    expect(access.canView).toBe(true);

    const growth = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: ['reach.members', 'growth.members.net'],
        comparison: 'previousPeriod',
        includeSeries: true,
      })
    );
    expect(growth.metrics).toHaveLength(2);

    const engagement = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['content.engagementRate'] })
    );
    expect(engagement.metrics[0].format).toBe('percentage');
    // The model's convention: a ratio, not a whole number.
    expect(engagement.metrics[0].value.value).toBeLessThanOrEqual(1);

    const events = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['inventory.events'] })
    );
    expect(events.metrics[0].key).toBe('inventory.events');

    const content = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['content.published'], breakdowns: ['contentType'] })
    );
    expect(content.breakdowns[0].dimension).toBe('contentType');
  });

  // §65: the two must not be interchangeable.
  it('keeps community and country as distinct dimensions', async () => {
    const { range } = await rangeFor(subject);

    const community = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['content.views'] })
    );
    const country = await gapApi.fetchAnalyticsDataset(
      query({ type: 'country', id: 'NG' }, range, { metrics: ['content.views'] })
    );

    expect(community.subject.type).toBe('community');
    expect(country.subject.type).toBe('country');
    expect(community.metrics[0].value.value).not.toBe(country.metrics[0].value.value);
  });

  it('another community’s figures are different figures', async () => {
    const { range } = await rangeFor(subject);

    const nigerian = await gapApi.fetchAnalyticsDataset(query(subject, range));
    const ghanaian = await gapApi.fetchAnalyticsDataset(
      query({ type: 'community', id: 'dev-gh' }, range)
    );

    expect(nigerian.metrics.map((metric) => metric.value.value)).not.toEqual(
      ghanaian.metrics.map((metric) => metric.value.value)
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 3 — Creator → Dashboard → views → engagement → community reach →
//             revenue → rewards
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 3 · a creator reviews their work', () => {
  const subject: AnalyticsSubject = { type: 'creator', id: null };

  it('completes every step', async () => {
    const { access, range } = await rangeFor(subject);
    expect(access.canView).toBe(true);
    expect(access.canViewFinancial).toBe(true);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: [
          'content.views',
          'content.engagementRate',
          'reach.communities',
          'reach.crossCommunity',
          'revenue.gross',
          'rewards.pointsEarned',
        ],
        includeSeries: true,
        breakdowns: ['community', 'source'],
      })
    );

    expect(dataset.metrics).toHaveLength(6);

    // Revenue carries a Money with its own currency — never a bare number. §57.
    const revenue = dataset.metrics.find((metric) => metric.key === 'revenue.gross')!;
    expect(revenue.money).not.toBeNull();
    expect(revenue.money!.currency).toMatch(/^[A-Z]{3}$/);
    expect(formatMetricValue(revenue, { locale: 'en-GB' })).not.toBe('Not available');

    // Points are a count and are never converted to a currency.
    const points = dataset.metrics.find((metric) => metric.key === 'rewards.pointsEarned')!;
    expect(points.format).toBe('count');
    expect(points.money).toBeNull();
  });

  // The strongest form of §79's "Creator A cannot access Creator B".
  it('has no route that could name another creator', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(query(subject, range));
    expect(dataset.subject.id ?? null).toBeNull();

    // There is no exported function taking a creator id, so there is nothing to
    // manipulate.
    expect(Object.keys(gapApi).filter((name) => /creator/i.test(name))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 4 — Provider → Dashboard → views → leads → conversion → featured
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 4 · a provider reviews their listing', () => {
  const subject: AnalyticsSubject = { type: 'provider', id: 'provider-a' };

  it('completes every step', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: [
          'provider.profileViews',
          'provider.leads',
          'conversion.rate',
          'monetization.featuredPlacements',
        ],
      })
    );
    expect(dataset.metrics).toHaveLength(4);
    // The funnel left this journey on 20 Oct 2026: `GET /analytics/funnels/{key}`
    // is served, and `analytics-reports-funnels-exports.test.ts` covers it.
  });

  it('another provider’s dashboard is another provider’s figures', async () => {
    const { range } = await rangeFor(subject);

    const a = await gapApi.fetchAnalyticsDataset(query(subject, range));
    const b = await gapApi.fetchAnalyticsDataset(
      query({ type: 'provider', id: 'provider-b' }, range)
    );

    expect(a.metrics.map((metric) => metric.value.value)).not.toEqual(
      b.metrics.map((metric) => metric.value.value)
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 5 — Employer → Jobs → Job analytics → views → applications →
//             conversion
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 5 · an employer reviews hiring', () => {
  const subject: AnalyticsSubject = { type: 'employer', id: 'employer-a' };

  it('completes every step, from the employer down to one job', async () => {
    const { range } = await rangeFor(subject);

    const employer = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: ['content.views', 'job.applications', 'job.applicationRate'],
      })
    );
    expect(employer.metrics).toHaveLength(3);

    // Drill into one job — the same content dataset, a different subject.
    const job = await gapApi.fetchAnalyticsDataset(
      query({ type: 'job', id: 'job-42' }, range, { metrics: ['job.applications'] })
    );
    expect(job.subject.type).toBe('job');
    expect(job.subject.id).toBe('job-42');
    // The funnel left this journey on 20 Oct 2026: `GET /analytics/funnels/{key}`
    // is served, and `analytics-reports-funnels-exports.test.ts` covers it.
  });

  // §19, and the reason the register forbids the dimension outright.
  it('offers no demographic breakdown of applicants', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { breakdowns: ['country'] })
    );

    // A country breakdown of *reach* is legitimate — it says where the job was
    // seen. What must not exist is a breakdown of the applicants themselves, and
    // there is no metric key that would produce one.
    const applicantBreakdown = dataset.breakdowns.find(
      (breakdown) => breakdown.metricKey === 'job.applications'
    );
    expect(applicantBreakdown).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 6 — Marketplace seller → Analytics → listing performance → views →
//             saves → offers → sales
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 6 · a seller reviews their listings', () => {
  const subject: AnalyticsSubject = { type: 'seller', id: 'seller-a' };

  it('completes every step', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: ['content.views', 'content.saves', 'listing.offers', 'listing.sales', 'revenue.gross'],
        breakdowns: ['category'],
      })
    );

    expect(dataset.metrics).toHaveLength(5);
    expect(dataset.breakdowns[0].dimension).toBe('category');
    // The funnel left this journey on 20 Oct 2026: `GET /analytics/funnels/{key}`
    // is served, and `analytics-reports-funnels-exports.test.ts` covers it.
  });

  it('drills from the seller into one listing', async () => {
    const { range } = await rangeFor(subject);

    const listing = await gapApi.fetchAnalyticsDataset(
      query({ type: 'listing', id: 'listing-7' }, range)
    );

    expect(listing.subject.type).toBe('listing');
    expect(listing.subject.id).toBe('listing-7');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 7 — Landlord → Housing analytics → views → inquiries → conversion
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 7 · a landlord reviews their listings', () => {
  const subject: AnalyticsSubject = { type: 'landlord', id: 'landlord-a' };

  it('completes every step', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: ['content.views', 'housing.inquiries', 'housing.applications', 'conversion.rate'],
        breakdowns: ['neighborhood'],
      })
    );

    expect(dataset.metrics).toHaveLength(4);
    // The funnel left this journey on 20 Oct 2026: `GET /analytics/funnels/{key}`
    // is served, and `analytics-reports-funnels-exports.test.ts` covers it.
  });

  // §20's discrimination-risk rule, asserted at the contract level.
  it('offers a location breakdown but no enquirer-origin breakdown', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, { metrics: ['housing.inquiries'], breakdowns: ['neighborhood'] })
    );

    // Where the property is, yes. Who enquired, never.
    expect(dataset.breakdowns[0].dimension).toBe('neighborhood');
    expect(
      dataset.breakdowns.some((breakdown) => breakdown.dimension === 'country')
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 8 — Organization → Analytics → events → reach → engagement →
//             community performance
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 8 · an organization reviews its reach', () => {
  const subject: AnalyticsSubject = { type: 'organization', id: 'org-a' };

  it('completes every step', async () => {
    const { range } = await rangeFor(subject);

    const dataset = await gapApi.fetchAnalyticsDataset(
      query(subject, range, {
        metrics: [
          'event.rsvps',
          'organization.followers',
          'organization.announcementReach',
          'content.engagementRate',
        ],
        breakdowns: ['community'],
        includeSeries: true,
      })
    );

    expect(dataset.metrics).toHaveLength(4);
    expect(dataset.breakdowns[0].dimension).toBe('community');
    expect(dataset.series.length).toBeGreaterThan(0);
  });

  // §24: an event that belongs to an organization reports under both without a
  // second contract.
  it('an event carries the same dataset shape as its organization', async () => {
    const { range } = await rangeFor(subject);

    const event = await gapApi.fetchAnalyticsDataset(
      query({ type: 'event', id: 'event-1' }, range, {
        metrics: ['event.rsvps'],
        breakdowns: ['community'],
      })
    );

    expect(event.subject.type).toBe('event');
    expect(event.breakdowns[0].dimension).toBe('community');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 9 — Backend unavailable → complete UI → clearly labelled → not broken
//
// The phase's final principle, as a test.
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 9 · the backend is unavailable and the screen is still complete', () => {
  const subject: AnalyticsSubject = { type: 'community', id: 'dev-ng' };

  it('a total outage rejects rather than returning plausible zeros', async () => {
    const range = resolveRange('last30d', { now: NOW });

    mock.restore();
    mock = new MockAdapter(apiClient);
    mock.onGet(/.*/).networkError();

    // A rejection renders as an error state with a retry. Returning an empty
    // dataset would render as "your community has no members", which is a claim
    // about the community rather than about the network.
    await expect(gapApi.fetchAnalyticsDataset(query(subject, range))).rejects.toThrow();
  });

  it('a partial outage degrades to PARTIAL rather than blanking the dashboard', async () => {
    const { range } = await rangeFor({ type: 'platform', id: null });

    // One certified domain goes down.
    mock.onGet(/\/jobs/).networkError();

    const { metrics, unavailable } = await fetchInventoryCounts();

    // The other five still answer.
    expect(metrics.length).toBeGreaterThan(0);
    expect(unavailable).toContain('inventory.jobs');

    const adapter = await gapApi.fetchAnalyticsDataset(
      query({ type: 'platform', id: null }, range, { metrics: ['audience.users.total'] })
    );

    const composed = composeDataset({
      subject: { type: 'platform', id: null },
      range,
      comparison: 'none',
      parts: [{ metrics: adapter.metrics, series: [], breakdowns: [], unmappedKeys: [] }],
      certifiedMetrics: metrics,
      unavailableMetrics: unavailable,
      gapKey: adapter.gapKey,
    });

    // Complete, labelled, and not broken.
    expect(composed.metrics.length).toBeGreaterThan(0);
    expect(composed.unavailableMetrics).toContain('inventory.jobs');
    expect(composed.status).toBe('PARTIAL');
  });

  it('a subject the backend cannot report on says exactly that', async () => {
    const range = resolveRange('last30d', { now: NOW });

    const dataset = await gapApi.fetchAnalyticsDataset(
      query({ type: 'community', id: 'dev-analytics-unavailable' }, range)
    );

    // §73: UNAVAILABLE is a different state from "no activity", and the UI has a
    // different sentence for each.
    expect(dataset.status).toBe('UNAVAILABLE');
    expect(dataset.metrics).toEqual([]);
    expect(dataset.unavailableMetrics.length).toBeGreaterThan(0);
  });

  it('a subject with genuinely no activity reports zeros, not an error', async () => {
    const range = resolveRange('last30d', { now: NOW });

    const dataset = await gapApi.fetchAnalyticsDataset(
      query({ type: 'community', id: 'dev-analytics-no-activity' }, range)
    );

    // Measured, and the answer was zero. A different claim from "unavailable".
    expect(dataset.metrics.length).toBeGreaterThan(0);
    expect(dataset.metrics.every((metric) => metric.value.value === 0)).toBe(true);
  });

  it('every figure that reaches a screen is marked, in every journey', async () => {
    const range = resolveRange('last30d', { now: NOW });

    const subjects: AnalyticsSubject[] = [
      { type: 'platform', id: null },
      { type: 'community', id: 'dev-ng' },
      { type: 'creator', id: null },
      { type: 'provider', id: 'p1' },
      { type: 'employer', id: 'e1' },
      { type: 'seller', id: 's1' },
      { type: 'landlord', id: 'l1' },
      { type: 'organization', id: 'o1' },
    ];

    for (const subject of subjects) {
      const dataset = await gapApi.fetchAnalyticsDataset(query(subject, range));

      // The phase's central guarantee: no figure reaches a member unmarked.
      for (const metric of dataset.metrics) {
        expect(['backend', 'simulated']).toContain(metric.value.source);
        if (metric.value.source === 'simulated') {
          expect(metric.value.gapKey).toBeTruthy();
        }
      }

      expect(dataset.freshness.sourceName.length).toBeGreaterThan(0);
      expect(dataset.status).toBeTruthy();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING
// ═════════════════════════════════════════════════════════════════════════════

describe('every journey offers only ranges the backend will answer', () => {
  it('the picker is driven by the capability set, not by the union', async () => {
    const access = await gapApi.fetchAnalyticsAccess({ type: 'creator', id: null });
    const offered = supportedRanges(access);

    expect(offered).toEqual(access.supportedRanges);
    // `allTime` is not offered by this deployment, and the picker does not offer
    // a control that would produce an error.
    expect(offered).not.toContain('allTime');
  });
});

// §43's export journey left on 20 Oct 2026 with the simulated export route;
// `analytics-reports-funnels-exports.test.ts` asserts the real export carries the
// dashboard's query.
