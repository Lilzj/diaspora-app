// ─────────────────────────────────────────────────────────────────────────────
// The seller screen reads the seller route — 13 Sep 2026
//
// `/analytics/seller` was a `SubjectDashboard` over the development adapter in
// every build, because `useAnalyticsDataset` had arms for per-item content, for
// inventory counts and for community statistics, and none for a seller. A release
// build showed nothing; a preview build showed invented figures.
//
// `GET /analytics/sellers/me` now serves a real dataset. Wiring it exposed two
// things that would have failed without a sound:
//
//   **`toDataset` hardcoded `leaderboards: []`.** Right for the per-item route,
//   which serves an empty board. The seller route serves real top listings, and
//   the mapper would have thrown them away on the way in.
//
//   **The adapter's board replaced the certified one** whenever both arms
//   answered. Harmless for an empty per-item board; for a seller, invented
//   listings in a preview build above that seller's real sales.
//
// The keys were checked too and are fine: the dataset builder serves catalogue
// keys (`conversion.rate`, `content.uniqueViewers`), and all six are already in
// the client's definitions, so nothing is dropped for being unknown.
//
// Later the same day the landlord route arrived and the seller arm became the
// owner arm (`fetchOwnerAnalytics`, `ownerQuery`). The seller's guarantees are
// unchanged and still pinned here; the landlord's differences are in
// `analytics-landlord-dataset.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  fetchContentAnalytics,
  fetchOwnerAnalytics,
  isCertifiedContentSubject,
  isCertifiedOwnerSubject,
} from '@/lib/analytics-api';
import type { AnalyticsTimeRange } from '@/types/analytics';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-08-14',
  to: '2026-09-12',
  timezone: 'Indian/Mauritius',
  isDeviceTimezone: false,
};

const SELLER = { type: 'seller' as const, id: '0dc73f0c-7efa-4b60-8706-7a60eacace65' };

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

/** What `GetSellerAnalyticsDatasetQueryHandler` builds, with a real board on it. */
function sellerBody(overrides: Record<string, unknown> = {}) {
  return {
    subject: { type: 'seller', id: null, label: null },
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
      metric('content.views', 150),
      metric('content.uniqueViewers', 41),
      // The labels `AnalyticsOwnerDatasetComposer` serves for a seller.
      metric('conversion.count', 4, 'Sales'),
      metric('conversion.rate', 2.67, 'Conversion rate'),
      metric('content.enquiries', 7, 'Enquiries'),
      metric('content.published', 2, 'Published'),
    ],
    series: [],
    breakdowns: [],
    funnels: [],
    leaderboards: [
      {
        key: 'seller-listings',
        label: 'Top listings',
        metricKey: 'content.views',
        rows: [
          {
            position: 1,
            entity: {
              entityType: 'listing',
              entityId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
              title: 'Cast-iron pot, barely used',
              route: '/marketplace/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
            },
            value: 120,
            format: 'count',
            secondaryValue: 3,
            secondaryFormat: 'count',
            secondaryLabel: 'Sales',
          },
          {
            position: 2,
            entity: {
              entityType: 'listing',
              entityId: '9c858901-8a57-4791-81fe-4c455b099bc9',
              title: 'School uniform, age 8',
              route: '/marketplace/9c858901-8a57-4791-81fe-4c455b099bc9',
            },
            value: 30,
            format: 'count',
            secondaryValue: 1,
            secondaryFormat: 'count',
            secondaryLabel: 'Sales',
          },
        ],
        nextCursor: null,
        hasMore: false,
        source: 'backend',
      },
    ],
    insights: [],
    freshness: FRESHNESS,
    unavailableMetrics: ['revenue.gross'],
    ...overrides,
  };
}

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('which subjects the owner routes answer for', () => {
  it('answers for a seller, a landlord, an employer, a provider and a creator, and nothing else', () => {
    expect(isCertifiedOwnerSubject(SELLER)).toBe(true);
    expect(isCertifiedOwnerSubject({ type: 'landlord', id: 'x' })).toBe(true);
    expect(isCertifiedOwnerSubject({ type: 'employer', id: 'x' })).toBe(true);
    // Since 13 Sep 2026 — `GET /analytics/providers/me`.
    expect(isCertifiedOwnerSubject({ type: 'provider', id: 'x' })).toBe(true);
    // Since 14 Sep 2026 — `GET /analytics/creators/me`. Without it "Your content"
    // had no source in a release build.
    expect(isCertifiedOwnerSubject({ type: 'creator', id: null })).toBe(true);

    // An organisation has no owner route. Mapping one speculatively would ask a
    // route that answers 404 and blank a dashboard that has an adapter.
    for (const type of ['organization', 'listing', 'guide', 'housing', 'job'] as const) {
      expect(isCertifiedOwnerSubject({ type, id: 'x' })).toBe(false);
    }
  });

  it('is not also a per-item content subject', () => {
    // A subject that matched both arms would have two certified bases and the
    // merge would pick whichever happened to resolve first.
    expect(isCertifiedContentSubject(SELLER)).toBe(false);
  });
});

describe('GET /analytics/sellers/me', () => {
  it('asks for /me and never names a seller', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    await fetchOwnerAnalytics(SELLER, RANGE, true);

    const request = mock.history.get[0];
    expect(request.url).toBe('/analytics/sellers/me');
    // The subject's id is the caller's own user id, and it is not sent. The route
    // has no id to change, which is the guarantee.
    expect(JSON.stringify(request.params)).not.toContain(SELLER.id);
  });

  it('passes includeSeries, because the server defaults it off', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(mock.history.get[0].params).toMatchObject({
      period: 'last30d',
      includeSeries: true,
      timezone: 'Indian/Mauritius',
    });
  });

  it('keeps every metric the seller route serves', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    // All six would be dropped silently if the client did not know their keys —
    // which is what `content.enquiries` would have been without a definition.
    expect(dataset.metrics.map((entry) => entry.key)).toEqual([
      'content.views',
      'content.uniqueViewers',
      'conversion.count',
      'conversion.rate',
      'content.enquiries',
      'content.published',
    ]);
    expect(dataset.metrics.find((entry) => entry.key === 'content.enquiries')?.value.value).toBe(7);
  });

  it('calls the conversions sales, and leaves every other tile its catalogue name', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);
    const label = (key: string) => dataset.metrics.find((entry) => entry.key === key)?.label;

    expect(label('conversion.count')).toBe('Sales');
    expect(label('conversion.rate')).toBe('Conversion rate');
    // Not a conversion, so never renamed.
    expect(label('content.enquiries')).toBe('Enquiries');
    // Served as "Published"; the tile keeps the catalogue's "Items published".
    expect(label('content.published')).toBe('Items published');
  });

  it('falls back to the catalogue name when the served label is blank', async () => {
    const body = sellerBody();
    (body.metrics as Array<{ key: string; label: string }>)
      .filter((entry) => entry.key === 'conversion.count')
      .forEach((entry) => {
        entry.label = '   ';
      });

    mock.onGet('/analytics/sellers/me').reply(200, envelope(body));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.metrics.find((entry) => entry.key === 'conversion.count')?.label).toBe('Conversions');
  });

  it('reports revenue as not measured rather than as a figure', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.unavailableMetrics).toContain('revenue.gross');
    expect(dataset.metrics.find((entry) => entry.key === 'revenue.gross')).toBeUndefined();
  });

  it('is not a gap', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.gapKey).toBeNull();
    expect(dataset.metrics.every((entry) => entry.value.source === 'backend')).toBe(true);
  });
});

describe('the top-listings board', () => {
  it('is kept, rather than discarded on the way in', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.leaderboards).toHaveLength(1);
    expect(dataset.leaderboards[0].rows.map((row) => row.entity.title)).toEqual([
      'Cast-iron pot, barely used',
      'School uniform, age 8',
    ]);
  });

  it('keeps the server’s order and does not sort it', async () => {
    const body = sellerBody();
    const board = (body.leaderboards as Array<{ rows: Array<{ position: number; value: number }> }>)[0];
    // Deliberately out of value order. The client has no business re-ranking it.
    board.rows[0].value = 10;
    board.rows[1].value = 900;

    mock.onGet('/analytics/sellers/me').reply(200, envelope(body));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.leaderboards[0].rows.map((row) => row.position)).toEqual([1, 2]);
    expect(dataset.leaderboards[0].rows.map((row) => row.value)).toEqual([10, 900]);
  });

  it('carries sales beside views on each row', async () => {
    mock.onGet('/analytics/sellers/me').reply(200, envelope(sellerBody()));

    const [first] = (await fetchOwnerAnalytics(SELLER, RANGE, true)).leaderboards[0].rows;

    expect(first.secondaryLabel).toBe('Sales');
    expect(first.secondaryValue).toBe(3);
    expect(first.entity.route).toBe('/marketplace/3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  });

  it('drops a board whose metric this build does not know, rather than crashing on it', async () => {
    const body = sellerBody({
      leaderboards: [{ ...sellerBody().leaderboards[0], metricKey: 'listing.somethingNew' }],
    });

    mock.onGet('/analytics/sellers/me').reply(200, envelope(body));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.leaderboards).toEqual([]);
  });

  it('drops a row that names nothing, rather than rendering a line that cannot be opened', async () => {
    const body = sellerBody();
    const board = (body.leaderboards as Array<{ rows: Array<{ entity: { entityId: string } }> }>)[0];
    board.rows[1].entity.entityId = '';

    mock.onGet('/analytics/sellers/me').reply(200, envelope(body));

    const dataset = await fetchOwnerAnalytics(SELLER, RANGE, true);

    expect(dataset.leaderboards[0].rows).toHaveLength(1);
  });

  it('still maps the per-item route’s empty board to an empty board', async () => {
    // The change to `toDataset` must not give content a board it never had.
    mock.onGet('/analytics/content/guide/g1').reply(
      200,
      envelope(sellerBody({ subject: { type: 'guide', id: 'g1', label: null }, leaderboards: [] }))
    );

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    expect(dataset.leaderboards).toEqual([]);
  });

  it('keeps the catalogue name for conversions on a per-item dashboard', async () => {
    // Only owner dashboards take the served word. A guide's page is not "Sales".
    mock.onGet('/analytics/content/guide/g1').reply(
      200,
      envelope(sellerBody({ subject: { type: 'guide', id: 'g1', label: null }, leaderboards: [] }))
    );

    const dataset = await fetchContentAnalytics({ type: 'guide', id: 'g1' }, RANGE);

    expect(dataset.metrics.find((entry) => entry.key === 'conversion.count')?.label).toBe('Conversions');
  });
});

describe('the dataset hook', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };

  const hook = fs
    .readFileSync(path.join(process.cwd(), 'src', 'hooks', 'analytics.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('gates the owner arm on what the member asked for, never on the gap switch', () => {
    // `enabled` folds in `areAnalyticsGapsEnabled()`, false in every release build.
    // The inventory arm shipped exactly that once.
    expect(hook).toMatch(/enabled:\s*wanted\s*&&\s*wantsOwner/);
    expect(hook).not.toMatch(/enabled:\s*enabled\s*&&\s*wantsOwner/);
  });

  it('counts the owner arm when deciding whether the dashboard failed', () => {
    // Without this, a failed seller or landlord request in a release build reads as
    // "no data, not loading, not an error" — nothing to show about figures that did
    // not arrive.
    expect(hook).toMatch(/ownerQuery\.isError/);
    expect(hook).toMatch(/ownerQuery\.isLoading/);
  });

  it('does not let the development adapter replace a real board', () => {
    expect(hook).toMatch(/certifiedContent\.leaderboards\.length/);
  });
});
