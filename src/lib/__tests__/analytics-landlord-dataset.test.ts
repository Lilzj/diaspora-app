// ─────────────────────────────────────────────────────────────────────────────
// The letting screen reads the landlord route — 13 Sep 2026
//
// `/analytics/landlord` was a `SubjectDashboard` over the development adapter in
// every build, like the seller screen before it: a release build showed nothing,
// and a preview build showed impressions, saves and enquiries Diaspora has never
// recorded for a home.
//
// `GET /analytics/landlords/me` now serves a real dataset, from the same server
// composer as the seller's. The client arm is shared too — the seller arm became
// the owner arm — so these tests hold the landlord to its own differences:
//
//   **no revenue at all.** A seller's revenue is withheld and named; a landlord
//   has none to withhold, because rent is not taken through Diaspora. A landlord
//   dataset that grew a revenue entry would be telling them to look for money
//   that was never here.
//
//   **viewings, not sales,** beside each home on the board, and the board's rows
//   open the home rather than a marketplace listing.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { fetchOwnerAnalytics, isCertifiedContentSubject } from '@/lib/analytics-api';
import type { AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-08-14',
  to: '2026-09-12',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

const LANDLORD = { type: 'landlord' as const, id: '6b0f2c7e-94d1-4a3b-8e25-1c7d9f0a3b58' };

const HOME = 'c3a9e1f7-2d64-4b8a-9f13-5e0b7d2c6a41';

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

const FRESHNESS = {
  computedAt: '2026-09-13T02:00:00+00:00',
  sourceName: 'Diaspora analytics',
  methodology: null,
  limitations: null,
};

function metric(key: string, value: number, label: string = key) {
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

/** What `AnalyticsOwnerDatasetComposer` builds for `AnalyticsOwnerDatasetProfile.Landlord`. */
function landlordBody() {
  return {
    subject: { type: 'landlord', id: null, label: null },
    range: {
      preset: 'last30d',
      from: '2026-08-14',
      to: '2026-09-12',
      timezone: 'UTC',
      isDeviceTimezone: false,
    },
    comparison: 'previousPeriod',
    status: 'LIVE',
    metrics: [
      metric('content.views', 40),
      metric('content.uniqueViewers', 9),
      metric('conversion.count', 2, 'Viewings'),
      metric('conversion.rate', 5, 'Viewing rate'),
      metric('content.published', 1, 'Published'),
    ],
    series: [],
    breakdowns: [],
    funnels: [],
    leaderboards: [
      {
        key: 'landlord-listings',
        label: 'Top listings',
        metricKey: 'content.views',
        rows: [
          {
            position: 1,
            entity: {
              entityType: 'housing',
              entityId: HOME,
              title: 'Two-bed flat, Peckham',
              route: `/housing/${HOME}`,
            },
            value: 40,
            format: 'count',
            secondaryValue: 2,
            secondaryFormat: 'count',
            secondaryLabel: 'Viewings',
          },
        ],
        nextCursor: null,
        hasMore: false,
        source: 'backend',
      },
    ],
    insights: [],
    freshness: FRESHNESS,
    // Deliberately empty: nothing the landlord set serves is unmeasured.
    unavailableMetrics: [],
  };
}

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('GET /analytics/landlords/me', () => {
  it('asks for /me and never names the landlord', async () => {
    mock.onGet('/analytics/landlords/me').reply(200, envelope(landlordBody()));

    await fetchOwnerAnalytics(LANDLORD, RANGE, true);

    const request = mock.history.get[0];
    expect(request.url).toBe('/analytics/landlords/me');
    expect(JSON.stringify(request.params)).not.toContain(LANDLORD.id);
    expect(request.params).toMatchObject({ period: 'last30d', includeSeries: true });
  });

  it('never asks the seller route for a landlord', async () => {
    mock.onGet('/analytics/landlords/me').reply(200, envelope(landlordBody()));
    mock.onGet('/analytics/sellers/me').reply(500);

    await fetchOwnerAnalytics(LANDLORD, RANGE, true);

    expect(mock.history.get.map((request) => request.url)).toEqual(['/analytics/landlords/me']);
  });

  it('keeps every metric the landlord route serves', async () => {
    mock.onGet('/analytics/landlords/me').reply(200, envelope(landlordBody()));

    const dataset = await fetchOwnerAnalytics(LANDLORD, RANGE, true);

    expect(dataset.metrics.map((entry) => entry.key)).toEqual([
      'content.views',
      'content.uniqueViewers',
      'conversion.count',
      'conversion.rate',
      'content.published',
    ]);
    expect(dataset.metrics.every((entry) => entry.value.source === 'backend')).toBe(true);
    expect(dataset.gapKey).toBeNull();
  });

  it('calls the conversions viewings', async () => {
    mock.onGet('/analytics/landlords/me').reply(200, envelope(landlordBody()));

    const dataset = await fetchOwnerAnalytics(LANDLORD, RANGE, true);
    const label = (key: string) => dataset.metrics.find((entry) => entry.key === key)?.label;

    expect(label('conversion.count')).toBe('Viewings');
    expect(label('conversion.rate')).toBe('Viewing rate');
    expect(label('content.published')).toBe('Items published');
  });

  it('has no revenue anywhere, served or withheld', async () => {
    mock.onGet('/analytics/landlords/me').reply(200, envelope(landlordBody()));

    const dataset = await fetchOwnerAnalytics(LANDLORD, RANGE, true);

    expect(dataset.metrics.find((entry) => entry.key === 'revenue.gross')).toBeUndefined();
    expect(dataset.unavailableMetrics).not.toContain('revenue.gross');
  });

  it('is not also a per-item content subject', () => {
    // `housing` is the per-item subject for one home; `landlord` is the owner of
    // every home. Matching both would give a dashboard two certified bases.
    expect(isCertifiedContentSubject(LANDLORD)).toBe(false);
  });
});

describe('the landlord board', () => {
  it('carries viewings beside views, and opens the home', async () => {
    mock.onGet('/analytics/landlords/me').reply(200, envelope(landlordBody()));

    const [board] = (await fetchOwnerAnalytics(LANDLORD, RANGE, true)).leaderboards;
    const [row] = board.rows;

    expect(board.key).toBe('landlord-listings');
    expect(row.entity.title).toBe('Two-bed flat, Peckham');
    expect(row.entity.entityType).toBe('housing');
    expect(row.entity.route).toBe(`/housing/${HOME}`);
    expect(row.secondaryLabel).toBe('Viewings');
    expect(row.secondaryValue).toBe(2);
  });
});

describe('an owner subject with no route', () => {
  it('is refused before any request is made', async () => {
    // A programming error rather than a network one: the hook checks
    // `isCertifiedOwnerSubject` first, and this is what happens if it did not.
    await expect(
      fetchOwnerAnalytics({ type: 'provider', id: 'p1' }, RANGE, true)
    ).rejects.toThrow('No certified owner analytics route for subject "provider".');

    expect(mock.history.get).toHaveLength(0);
  });
});
