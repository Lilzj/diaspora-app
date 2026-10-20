// ─────────────────────────────────────────────────────────────────────────────
// Retention, boards, insights, the premium summary and a fundraising campaign's
// giving, after the gap closed — 20 Oct 2026 (backend 52bb2e5).
//
// The app reached the first four through `/analytics-gap/v0` (or the
// `/monetization-gap` adapter) and a fundraising campaign not at all. These pin
// what would regress without a screen changing:
//
//   1. The real paths, never a gap prefix.
//   2. Cohorts the server cannot count pass through with their reasons, and a
//      null offset stays null.
//   3. A board is never asked to rank by a rate or distinct viewers.
//   4. An empty insights list is an empty list, not an error.
//   5. The premium refusal is recognisable by its code.
//   6. A campaign's currency figures keep their currency, its words are kept,
//      and "progress" it could not compute stays in `unavailableMetrics`.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  fetchAnalyticsInsights,
  fetchAnalyticsLeaderboard,
  fetchAnalyticsRetention,
  fetchOwnerAnalytics,
  fetchPremiumAnalyticsSummary,
  hasServedInsights,
  isCertifiedOwnerSubject,
  isLeaderboardMetric,
  PREMIUM_NOT_ENTITLED,
} from '../analytics-api';
import type { AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-09-21',
  to: '2026-10-20',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

const freshness = { computedAt: '2026-10-20T08:00:00Z', sourceName: 'Diaspora analytics' };

describe('the analytics reads served since 20 Oct 2026', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mock.onAny(/-gap\//).reply(() => {
      throw new Error('a real read reached a simulated prefix');
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('reads retention from /analytics/retention and keeps the cohorts it could not count', async () => {
    let params: Record<string, unknown> = {};
    mock.onGet('/analytics/retention').reply((config) => {
      params = config.params;
      return [
        200,
        {
          data: {
            subject: { type: 'platform', id: null },
            granularity: 'week',
            offsetLabels: ['Week 0', 'Week 1'],
            measurementWindow: 'Recorded again in the Nth week after.',
            timezone: 'Europe/London',
            cohorts: [
              { cohortDate: '2026-10-05', cohortSize: 40, values: [1, null], isIncomplete: true },
            ],
            unavailableCohorts: [
              { cohortDate: '2026-06-01', reason: 'Raw activity is kept for 90 days.' },
            ],
            source: 'backend',
            freshness,
          },
        },
      ];
    });

    const table = await fetchAnalyticsRetention({ type: 'platform', id: null }, RANGE, 'week', 99);

    expect(params).toMatchObject({ subjectType: 'platform', cohortGranularity: 'week', cohortCount: 24 });
    expect(table.cohorts[0].values).toEqual([1, null]);
    expect(table.cohorts[0].isIncomplete).toBe(true);
    expect(table.unavailableCohorts).toEqual([
      { cohortDate: '2026-06-01', reason: 'Raw activity is kept for 90 days.' },
    ]);
    expect(table.source).toBe('backend');
  });

  it('ranks a board only by additive counts, and pages by the server cursor', async () => {
    expect(isLeaderboardMetric('content.views')).toBe(true);
    expect(isLeaderboardMetric('conversion.count')).toBe(true);
    expect(isLeaderboardMetric('content.uniqueViewers')).toBe(false);
    expect(isLeaderboardMetric('content.engagementRate')).toBe(false);

    await expect(
      fetchAnalyticsLeaderboard('top-content', { type: 'seller', id: null }, RANGE, 'content.engagementRate')
    ).rejects.toThrow();
    expect(mock.history.get).toHaveLength(0);

    let params: Record<string, unknown> = {};
    mock.onGet('/analytics/leaderboards/seller-listings').reply((config) => {
      params = config.params;
      return [
        200,
        {
          data: {
            key: 'seller-listings',
            label: 'Top listings',
            metricKey: 'content.saves',
            rows: [
              {
                position: 11,
                entity: { entityType: 'listing', entityId: 'l-1', title: 'Sofa', route: '/marketplace/l-1' },
                value: 7,
                format: 'count',
                comparison: { basis: 'previousPeriod', baselineValue: 0, unavailableReason: 'zeroBaseline' },
              },
            ],
            nextCursor: '11',
            hasMore: true,
            source: 'backend',
          },
        },
      ];
    });

    const board = await fetchAnalyticsLeaderboard(
      'seller-listings',
      { type: 'seller', id: null },
      RANGE,
      'content.saves',
      { take: 10, cursor: '10' }
    );

    expect(params).toMatchObject({ metric: 'content.saves', take: 10, cursor: '10' });
    expect(board?.rows[0].position).toBe(11);
    expect(board?.rows[0].comparison?.unavailableReason).toBe('zeroBaseline');
    expect(board?.nextCursor).toBe('11');
  });

  it('treats an empty insights list as the ordinary answer', async () => {
    mock.onGet('/analytics/insights').reply(200, { data: [] });

    await expect(fetchAnalyticsInsights({ type: 'creator', id: null }, RANGE)).resolves.toEqual([]);
    expect(hasServedInsights({ type: 'creator', id: null })).toBe(true);
    // Refused by the server with a reason, so never asked.
    expect(hasServedInsights({ type: 'community', id: 'c-1' })).toBe(false);
    expect(hasServedInsights({ type: 'campaign', id: 'k-1' })).toBe(false);
  });

  it('maps insights without generating any', async () => {
    mock.onGet('/analytics/insights').reply(200, {
      data: [
        { key: 'views-steady', headline: 'Views held steady', detail: '120 vs 118', tone: 'neutral', source: 'backend' },
        { key: 'broken', tone: 'positive' },
      ],
    });

    const insights = await fetchAnalyticsInsights({ type: 'seller', id: null }, RANGE);
    expect(insights).toEqual([
      {
        key: 'views-steady',
        headline: 'Views held steady',
        detail: '120 vs 118',
        tone: 'neutral',
        action: null,
        source: 'backend',
      },
    ]);
  });

  it('reads the premium summary and passes its refusal code through', async () => {
    mock.onGet('/analytics/premium/summary').replyOnce(200, {
      data: {
        periodStart: '2026-09-21T00:00:00Z',
        periodEnd: '2026-10-20T00:00:00Z',
        timezone: 'Europe/London',
        headline: [{ key: 'views', label: 'Views', value: 12, unit: 'count', changeRatio: null, definition: 'Views.' }],
        breakdowns: [],
        series: [],
        topSubjects: [],
        reportingLagHours: 1,
        unavailable: [{ key: 'audience.country', label: 'Audience country', reason: 'Not recorded.' }],
        freshness,
      },
    });

    const summary = await fetchPremiumAnalyticsSummary();
    expect(summary.headline[0].changeRatio).toBeNull();
    expect(summary.unavailable).toEqual([
      { key: 'audience.country', label: 'Audience country', reason: 'Not recorded.' },
    ]);

    mock.onGet('/analytics/premium/summary').replyOnce(403, {
      status: 403,
      code: PREMIUM_NOT_ENTITLED,
      detail: 'Requires analytics.advanced.',
    });
    await expect(fetchPremiumAnalyticsSummary()).rejects.toMatchObject({
      code: 'analytics.premium.not-entitled',
      httpStatus: 403,
    });
  });

  it("reads a fundraising campaign's giving with its currency, never as an ad promotion", async () => {
    expect(isCertifiedOwnerSubject({ type: 'campaign', id: 'k-1' })).toBe(true);
    expect(isCertifiedOwnerSubject({ type: 'campaign', id: null })).toBe(false);

    mock.onGet('/analytics/campaigns/k-1').reply(200, {
      data: {
        subject: { type: 'campaign', id: 'k-1', label: 'Clinic roof' },
        range: { preset: 'last30d', from: '2026-09-21', to: '2026-10-20', timezone: 'Europe/London', isDeviceTimezone: false },
        comparison: 'previousPeriod',
        status: 'PARTIAL',
        metrics: [
          {
            key: 'wallet.donations',
            label: 'Raised',
            value: { value: 125.5, source: 'backend' },
            format: 'currency',
            computation: 'server-aggregate',
            higherIsBetter: true,
            freshness,
            privacyClass: 'financial',
            money: { amount: 125.5, currency: 'GBP', minorUnits: 12550, exponent: 2, symbol: '£' },
          },
          {
            key: 'campaign.supporters',
            label: 'Supporters',
            value: { value: 4, source: 'backend' },
            format: 'count',
            computation: 'server-aggregate',
            higherIsBetter: true,
            freshness,
            privacyClass: 'financial',
          },
        ],
        series: [],
        breakdowns: [],
        funnels: [],
        leaderboards: [],
        insights: [],
        freshness,
        unavailableMetrics: ['content.views', 'conversion.rate', 'campaign.progress'],
      },
    });

    const dataset = await fetchOwnerAnalytics({ type: 'campaign', id: 'k-1' }, RANGE, true);

    const raised = dataset.metrics.find((metric) => metric.key === 'wallet.donations');
    expect(raised?.label).toBe('Raised');
    expect(raised?.money).toEqual({ amount: 125.5, currency: 'GBP', minorUnits: 12550, exponent: 2, symbol: '£' });
    expect(dataset.metrics.find((metric) => metric.key === 'campaign.supporters')?.value.value).toBe(4);
    expect(dataset.unavailableMetrics).toEqual(
      expect.arrayContaining(['content.views', 'conversion.rate', 'campaign.progress'])
    );
    expect(dataset.metrics.some((metric) => metric.key === 'campaign.progress')).toBe(false);
  });
});
