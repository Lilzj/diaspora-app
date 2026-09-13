// ─────────────────────────────────────────────────────────────────────────────
// The provider dashboard reads the provider route, and can be reached — 13 Sep 2026
//
// Three defects, the same two the hiring dashboard had and one of its own:
//
//   **Nothing led to the dashboard.** `/analytics/provider/[id]` existed and no
//   row, button or link in the app opened it — not the analytics hub, not the
//   provider's own profile. Written and never called.
//
//   **Its id came from the route.** Selling, Letting and Hiring take the caller
//   from the session. The obvious id to put in the URL — the provider's — is not
//   the member `/analytics/access` answers for as an owner.
//
//   **The access check read `provider` as content only.** Asked with the member's
//   own id, it looked for a provider profile with that id, found none, and would
//   have refused the dashboard to every provider it was opened for.
//
// `GET /analytics/providers/me` now serves a real dataset from the same server
// composer as the other owner dashboards. These tests pin the route, the
// provider's own difference — enquiries beside views, and no action at all — and
// the two ways in.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  fetchOwnerAnalytics,
  isCertifiedContentSubject,
  isCertifiedOwnerSubject,
} from '@/lib/analytics-api';
import { catalogueKeyFor } from '@/lib/analytics/catalogue-keys';
import type { AnalyticsTimeRange } from '@/types/analytics';

const fs = require('fs') as {
  readFileSync(p: string, e: string): string;
  existsSync(p: string): boolean;
};
const path = require('path') as { join(...s: string[]): string };

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-08-14',
  to: '2026-09-12',
  timezone: 'Africa/Lagos',
  isDeviceTimezone: false,
};

/** The member — never one of their providers. */
const PROVIDER = { type: 'provider' as const, id: '6a1d4c9e-2f7b-4e38-b5a0-8c3f1d6e9b24' };

const PROFILE = 'c4e8a2d6-7b1f-4a93-8e05-2d9b6f3c1a57';

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

/** What `AnalyticsOwnerDatasetComposer` builds for `AnalyticsOwnerDatasetProfile.Provider`. */
function providerBody() {
  return {
    subject: { type: 'provider', id: null, label: null },
    range: { preset: 'last30d', from: '2026-08-14', to: '2026-09-12', timezone: 'UTC', isDeviceTimezone: false },
    comparison: 'previousPeriod',
    status: 'LIVE',
    metrics: [
      metric('content.views', 64),
      metric('content.uniqueViewers', 41),
      metric('content.enquiries', 5, 'Enquiries'),
      metric('content.saves', 9, 'Saves'),
      metric('content.published', 1, 'Published'),
    ],
    series: [],
    breakdowns: [],
    funnels: [],
    leaderboards: [
      {
        key: 'provider-profiles',
        label: 'Top profiles',
        metricKey: 'content.views',
        rows: [
          {
            position: 1,
            entity: {
              entityType: 'provider',
              entityId: PROFILE,
              title: 'Harbour Plumbing',
              route: `/provider/${PROFILE}`,
            },
            value: 64,
            format: 'count',
            secondaryValue: 5,
            secondaryFormat: 'count',
            secondaryLabel: 'Enquiries',
          },
        ],
        nextCursor: null,
        hasMore: false,
        source: 'backend',
      },
    ],
    insights: [],
    freshness: FRESHNESS,
    unavailableMetrics: [],
  };
}

/** A source file with comments stripped, so a guard reads code rather than prose. */
function code(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('GET /analytics/providers/me', () => {
  it('is the provider subject’s certified route, and not a per-item one', () => {
    expect(isCertifiedOwnerSubject(PROVIDER)).toBe(true);
    // `provider` is the owner of every profile here; one profile's page is not
    // mapped on the client, so the dashboard has exactly one certified base.
    expect(isCertifiedContentSubject(PROVIDER)).toBe(false);
  });

  it('asks for /me and never names the member', async () => {
    mock.onGet('/analytics/providers/me').reply(200, envelope(providerBody()));

    await fetchOwnerAnalytics(PROVIDER, RANGE, true);

    const request = mock.history.get[0];
    expect(request.url).toBe('/analytics/providers/me');
    expect(JSON.stringify(request.params)).not.toContain(PROVIDER.id);
    expect(request.params).toMatchObject({ period: 'last30d', includeSeries: true });
  });

  it('keeps every metric the provider route serves, and none of them is simulated', async () => {
    mock.onGet('/analytics/providers/me').reply(200, envelope(providerBody()));

    const dataset = await fetchOwnerAnalytics(PROVIDER, RANGE, true);

    expect(dataset.metrics.map((entry) => entry.key)).toEqual([
      'content.views',
      'content.uniqueViewers',
      'content.enquiries',
      'content.saves',
      'content.published',
    ]);
    expect(dataset.metrics.every((entry) => entry.value.source === 'backend')).toBe(true);
    expect(dataset.gapKey).toBeNull();
  });

  it('translates the enquiries key a content row sends, so the column is not dropped', () => {
    // `/analytics/creators/me/content` sends the snake key on each row.
    expect(catalogueKeyFor('enquiries')).toBe('content.enquiries');
    expect(catalogueKeyFor('content.enquiries')).toBe('content.enquiries');
  });

  it('has no action, no rate and no revenue anywhere, served or withheld', async () => {
    mock.onGet('/analytics/providers/me').reply(200, envelope(providerBody()));

    const dataset = await fetchOwnerAnalytics(PROVIDER, RANGE, true);

    for (const key of ['conversion.count', 'conversion.rate', 'revenue.gross']) {
      expect(dataset.metrics.find((entry) => entry.key === key)).toBeUndefined();
      expect(dataset.unavailableMetrics).not.toContain(key);
    }
  });

  it('carries enquiries beside views on the board, and opens the profile', async () => {
    mock.onGet('/analytics/providers/me').reply(200, envelope(providerBody()));

    const [board] = (await fetchOwnerAnalytics(PROVIDER, RANGE, true)).leaderboards;
    const [row] = board.rows;

    expect(board.key).toBe('provider-profiles');
    expect(row.entity.entityType).toBe('provider');
    expect(row.entity.route).toBe(`/provider/${PROFILE}`);
    expect(row.secondaryLabel).toBe('Enquiries');
    expect(row.secondaryValue).toBe(5);
  });
});

describe('the provider dashboard screen', () => {
  it('takes the provider from the session, never from the route', () => {
    const screen = code('src', 'app', 'analytics', 'provider.tsx');

    expect(screen).toMatch(/useAuthStore\(/);
    expect(screen).toMatch(/type:\s*'provider',\s*id:\s*userId/);
    expect(screen).not.toMatch(/useLocalSearchParams/);
  });

  it('no longer has an id-routed twin for a link to reach with the wrong id', () => {
    expect(
      fs.existsSync(path.join(process.cwd(), 'src', 'app', 'analytics', 'provider', '[id].tsx'))
    ).toBe(false);
  });
});

describe('the ways in', () => {
  it('is a row on the analytics hub', () => {
    expect(code('src', 'app', 'analytics', 'index.tsx')).toMatch(/route:\s*'\/analytics\/provider'/);
  });

  it('is linked from the provider’s own profile, and only for its owner', () => {
    const profile = code('src', 'app', 'provider', '[id].tsx');

    // The owner-only block: from `{isOwner ? (` to the `) : null}` that closes it.
    const start = profile.indexOf('{isOwner ? (');
    expect(start).toBeGreaterThan(-1);
    const ownerBlock = profile.slice(start, profile.indexOf(') : null}', start));

    expect(ownerBlock).toMatch(/router\.push\('\/analytics\/provider'\)/);
    expect(profile.match(/router\.push\('\/analytics\/provider'\)/g)).toHaveLength(1);
  });

  it('decides ownership by the server’s answer, not a comparison on the device', () => {
    expect(code('src', 'app', 'provider', '[id].tsx')).toMatch(
      /const isOwner = provider\.viewerState\?\.canManage === true;/
    );
  });
});
