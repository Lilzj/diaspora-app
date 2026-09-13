// ─────────────────────────────────────────────────────────────────────────────
// One item's page and one item's row name the action as its owner's dashboard does
// — 13 Sep 2026
//
// The owner dashboards were renamed first — Sales, Viewings, Applications — and
// the same figure still said "Conversions" on the listing's own analytics page and
// "Actions taken" on its row in the creator's content table. The server now names
// conversions by content type in all three places (`AnalyticsConversionNames`).
//
// Two surfaces, handled differently on this side, and both pinned here:
//
//   **The per-item page** maps the dataset through the catalogue, so it must be
//   told to take the served name — for content whose action has one, and only
//   then: a guide's page keeps "Conversions" rather than become "Actions taken".
//
//   **The per-item table** passes the server's labels through untouched, so it
//   needs nothing — and the test is that it keeps doing so.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { fetchContentAnalytics, fetchCreatorContentPerformance } from '@/lib/analytics-api';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import type { AnalyticsSubjectType, AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-08-14',
  to: '2026-09-12',
  timezone: 'UTC',
  isDeviceTimezone: false,
};

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

const FRESHNESS = {
  computedAt: '2026-09-13T02:00:00+00:00',
  sourceName: 'Diaspora analytics',
  methodology: null,
  limitations: null,
};

function metric(key: string, value: number, label: string) {
  return {
    key,
    label,
    value: { value, source: 'backend' },
    format: 'count',
    computation: 'server-aggregate',
    higherIsBetter: true,
    comparison: null,
    freshness: FRESHNESS,
    privacyClass: 'owner',
    isSuppressed: false,
  };
}

/** One item's dataset as `GetContentAnalyticsDatasetQueryHandler` serves it, with a given conversion name. */
function itemBody(type: string, id: string, conversionLabel: string) {
  return {
    subject: { type, id, label: null },
    range: { preset: 'last30d', from: '2026-08-14', to: '2026-09-12', timezone: 'UTC', isDeviceTimezone: false },
    comparison: 'previousPeriod',
    status: 'LIVE',
    metrics: [
      metric('content.views', 20, 'Views'),
      metric('conversion.count', 3, conversionLabel),
      // Served under a name the catalogue does not use, so a test can tell whose name is shown.
      metric('content.saves', 2, 'Bookmarked'),
    ],
    series: [],
    breakdowns: [],
    funnels: [],
    leaderboards: [],
    insights: [],
    freshness: FRESHNESS,
    unavailableMetrics: [],
  };
}

async function conversionLabelOnPage(type: AnalyticsSubjectType, segment: string, served: string) {
  mock.onGet(`/analytics/content/${segment}/i1`).reply(200, envelope(itemBody(segment, 'i1', served)));

  const dataset = await fetchContentAnalytics({ type, id: 'i1' }, RANGE);

  return {
    conversion: dataset.metrics.find((entry) => entry.key === 'conversion.count')?.label,
    saves: dataset.metrics.find((entry) => entry.key === 'content.saves')?.label,
  };
}

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('one item’s analytics page', () => {
  it.each([
    ['listing', 'Sales', 'listing'],
    ['housing', 'Viewings', 'housing'],
    ['job', 'Applications', 'job'],
    ['event', 'RSVPs', 'event'],
  ] as const)('a %s page names its conversions %s', async (type, served, segment) => {
    const labels = await conversionLabelOnPage(type, segment, served);

    expect(labels.conversion).toBe(served);
  });

  it.each([
    ['guide', 'guide'],
    ['update', 'update'],
  ] as const)('a %s page keeps the catalogue name, not the server’s general one', async (type, segment) => {
    // The server sends "Actions taken" for content that asks for nothing. The tile
    // does not change what it has always been called.
    const labels = await conversionLabelOnPage(type, segment, 'Actions taken');

    expect(labels.conversion).toBe('Conversions');
  });

  it('renames only the conversion, never another tile on the page', async () => {
    const labels = await conversionLabelOnPage('job', 'job', 'Applications');

    // Served as "Bookmarked"; shown as the catalogue's own label for the key.
    expect(labels.saves).toBe(ANALYTICS_DEFINITIONS['content.saves'].label);
    expect(labels.saves).not.toBe('Bookmarked');
  });
});

describe('the per-item table in creator analytics', () => {
  it('shows each row’s served name as it arrives — a job’s applications beside a guide’s actions', async () => {
    const conversion = (label: string, value: number) => ({
      key: 'conversion',
      label,
      value,
      format: 'count',
      changePercentage: null,
      previousValue: null,
      comparisonUnavailableReason: 'insufficientHistory',
      higherIsBetter: true,
      definition: 'People who took the action your content asked for.',
      isAvailable: true,
    });

    mock.onGet('/analytics/creators/me/content').reply(
      200,
      envelope({
        items: [
          {
            contentId: 'j1',
            contentType: 'Job',
            title: 'Community nurse, night shifts',
            publishedAt: '2026-08-31T09:00:00Z',
            status: 'Open',
            metrics: [conversion('Applications', 3)],
            isSponsored: false,
          },
          {
            contentId: 'g1',
            contentType: 'Guide',
            title: 'Opening a bank account',
            publishedAt: '2026-08-30T09:00:00Z',
            status: 'Published',
            metrics: [conversion('Actions taken', 0)],
            isSponsored: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      })
    );

    const page = await fetchCreatorContentPerformance({ period: '30d' });

    expect(page.items.map((item) => item.metrics[0].label)).toEqual(['Applications', 'Actions taken']);
  });
});
