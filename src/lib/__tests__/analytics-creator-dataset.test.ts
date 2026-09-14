// ─────────────────────────────────────────────────────────────────────────────
// "Your content" reads the platform's creator dataset — 14 Sep 2026
//
// The first row on the analytics hub opened a screen with period controls, three
// links and no figures, in every release build. The `creator` subject had no
// certified arm in the dataset hook — only the development adapter, which release
// builds switch off — while `GET /analytics/creators/me` served the whole dataset.
// Found by tapping through the app on the emulator; the screen had never been
// checked with the development adapter off.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  fetchOwnerAnalytics,
  isCertifiedContentSubject,
  isCertifiedOwnerSubject,
} from '@/lib/analytics-api';
import type { AnalyticsTimeRange } from '@/types/analytics';

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-08-15',
  to: '2026-09-13',
  timezone: 'Indian/Mauritius',
  isDeviceTimezone: false,
};

/** The creator subject carries no id: the route is `/me` and names nobody. */
const CREATOR = { type: 'creator' as const, id: null };

const LISTING = '01a05769-bbbb-7448-bb77-45d7c85b339d';

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

const FRESHNESS = {
  computedAt: '2026-09-14T10:00:00+00:00',
  sourceName: 'Diaspora analytics',
  methodology: null,
  limitations: null,
};

function metric(key: string, value: number, label: string) {
  return {
    key,
    label,
    value: { value, source: 'backend' },
    format: key === 'content.engagementRate' ? 'percentage' : 'count',
    computation: 'server-aggregate',
    higherIsBetter: true,
    comparison: null,
    freshness: FRESHNESS,
    privacyClass: 'owner',
    isSuppressed: false,
  };
}

/** What `GetCreatorAnalyticsDatasetQueryHandler` builds from the creator headline set. */
function creatorBody() {
  return {
    subject: { type: 'creator', id: null, label: null },
    range: { preset: 'last30d', from: '2026-08-15', to: '2026-09-13', timezone: 'UTC', isDeviceTimezone: false },
    comparison: 'previousPeriod',
    status: 'PARTIAL',
    metrics: [
      metric('content.views', 1, 'Views'),
      metric('content.uniqueViewers', 1, 'Unique viewers'),
      metric('content.saves', 0, 'Saves'),
      metric('content.helpfulVotes', 0, 'Helpful votes'),
      metric('content.comments', 0, 'Comments'),
      metric('content.shares', 0, 'Shares'),
      metric('conversion.count', 0, 'Actions taken'),
      metric('content.published', 4, 'Published'),
      metric('growth.members.net', 0, 'New followers'),
      metric('content.engagementRate', 0, 'Engagement'),
    ],
    series: [],
    breakdowns: [],
    funnels: [],
    leaderboards: [
      {
        key: 'creator-content',
        label: 'Top content',
        metricKey: 'content.views',
        rows: [
          {
            position: 1,
            entity: {
              entityType: 'listing',
              entityId: LISTING,
              title: 'Hand-woven vacoas basket set, Port Louis',
              route: `/marketplace/${LISTING}`,
            },
            value: 1,
            format: 'count',
            secondaryValue: 0,
            secondaryFormat: 'count',
            secondaryLabel: 'Engagements',
          },
        ],
        nextCursor: null,
        hasMore: false,
        source: 'backend',
      },
    ],
    insights: [],
    freshness: FRESHNESS,
    unavailableMetrics: ['content.reach', 'reach.followers', 'provider.profileViews', 'revenue.gross'],
  };
}

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('the creator subject', () => {
  it('has a certified owner route, so a release build has a source at all', () => {
    expect(isCertifiedOwnerSubject(CREATOR)).toBe(true);
  });

  it('is not also a per-item subject', () => {
    expect(isCertifiedContentSubject(CREATOR)).toBe(false);
  });
});

describe('GET /analytics/creators/me', () => {
  it('is what "Your content" asks for, with the period and a series', async () => {
    mock.onGet('/analytics/creators/me').reply(200, envelope(creatorBody()));

    await fetchOwnerAnalytics(CREATOR, RANGE, true);

    const request = mock.history.get[0];
    expect(request.url).toBe('/analytics/creators/me');
    expect(request.params).toMatchObject({ period: 'last30d', includeSeries: true, timezone: 'Indian/Mauritius' });
  });

  it('keeps every figure the platform serves, all of them real', async () => {
    mock.onGet('/analytics/creators/me').reply(200, envelope(creatorBody()));

    const dataset = await fetchOwnerAnalytics(CREATOR, RANGE, true);

    expect(dataset.metrics.map((entry) => entry.key)).toEqual([
      'content.views',
      'content.uniqueViewers',
      'content.saves',
      'content.helpfulVotes',
      'content.comments',
      'content.shares',
      'conversion.count',
      'content.published',
      'growth.members.net',
      'content.engagementRate',
    ]);
    expect(dataset.metrics.every((entry) => entry.value.source === 'backend')).toBe(true);
    expect(dataset.gapKey).toBeNull();
  });

  it('withholds what the platform does not measure rather than showing it as zero', async () => {
    mock.onGet('/analytics/creators/me').reply(200, envelope(creatorBody()));

    const dataset = await fetchOwnerAnalytics(CREATOR, RANGE, true);

    expect(dataset.unavailableMetrics).toEqual(
      expect.arrayContaining(['content.reach', 'reach.followers', 'provider.profileViews', 'revenue.gross'])
    );
    expect(dataset.metrics.find((entry) => entry.key === 'content.reach')).toBeUndefined();
  });

  it('carries the top-content board, which opens the item', async () => {
    mock.onGet('/analytics/creators/me').reply(200, envelope(creatorBody()));

    const [board] = (await fetchOwnerAnalytics(CREATOR, RANGE, true)).leaderboards;

    expect(board.key).toBe('creator-content');
    expect(board.rows[0].entity.route).toBe(`/marketplace/${LISTING}`);
  });
});

describe('the "Your content" screen', () => {
  const screen = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'analytics', 'creator.tsx'), 'utf8');

  it('asks for the creator subject', () => {
    expect(screen).toMatch(/subject=\{\{\s*type:\s*'creator',\s*id:\s*null\s*\}\}/);
  });

  it('no longer tells a member Diaspora records no views', () => {
    expect(screen).not.toMatch(/records no view/);
  });
});
