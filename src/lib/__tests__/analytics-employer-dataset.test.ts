// ─────────────────────────────────────────────────────────────────────────────
// The hiring dashboard reads the employer route, and can be reached — 13 Sep 2026
//
// Two defects, one of them older than the route:
//
//   **Nothing led to the dashboard.** `/analytics/employer/[id]` existed and no
//   row, button or link in the app opened it — not the analytics hub, not the
//   hiring workspace. Written and never called.
//
//   **Its id came from the route.** Seller and Letting take the caller from the
//   session. An id in the URL is a parameter to get wrong, and the obvious id to
//   put there — the employer profile's — is not the member `/analytics/access`
//   answers for, so the screen would have refused every employer it was opened
//   for.
//
// `GET /analytics/employers/me` now serves a real dataset from the same server
// composer as Selling and Letting. These tests pin the route, the employer's own
// differences (applications, and no hiring stage after them), and the two ways in.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { fetchOwnerAnalytics, isCertifiedContentSubject } from '@/lib/analytics-api';
import { formatMetricValue } from '@/lib/analytics/format';
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

const EMPLOYER = { type: 'employer' as const, id: '2c8e4a1f-7b3d-4e96-a5c0-9d1f6b2e8a37' };

const JOB = 'b5d17e2a-3c49-4f8b-9e06-1a7c4d2f5b83';

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

const FRESHNESS = {
  computedAt: '2026-09-13T02:00:00+00:00',
  sourceName: 'Diaspora analytics',
  methodology: null,
  limitations: null,
};

function metric(key: string, value: number, label: string = key, format: string = 'count') {
  return {
    key,
    label,
    value: { value, source: 'backend' },
    format,
    computation: 'server-aggregate',
    higherIsBetter: true,
    comparison: null,
    freshness: FRESHNESS,
    privacyClass: 'owner',
    isSuppressed: false,
  };
}

/** What `AnalyticsOwnerDatasetComposer` builds for `AnalyticsOwnerDatasetProfile.Employer`. */
function employerBody() {
  return {
    subject: { type: 'employer', id: null, label: null },
    range: { preset: 'last30d', from: '2026-08-14', to: '2026-09-12', timezone: 'UTC', isDeviceTimezone: false },
    comparison: 'previousPeriod',
    status: 'LIVE',
    metrics: [
      metric('content.views', 80),
      metric('content.uniqueViewers', 31),
      metric('conversion.count', 4, 'Applications'),
      // A ratio, as `AnalyticsDatasetBuilder` sends every percentage: 4 of 80 is 0.05.
      metric('conversion.rate', 0.05, 'Application rate', 'percentage'),
      metric('content.published', 2, 'Published'),
    ],
    series: [],
    breakdowns: [],
    funnels: [],
    leaderboards: [
      {
        key: 'employer-jobs',
        label: 'Top jobs',
        metricKey: 'content.views',
        rows: [
          {
            position: 1,
            entity: {
              entityType: 'job',
              entityId: JOB,
              title: 'Community nurse, night shifts',
              route: `/job/${JOB}`,
            },
            value: 80,
            format: 'count',
            secondaryValue: 4,
            secondaryFormat: 'count',
            secondaryLabel: 'Applications',
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

describe('GET /analytics/employers/me', () => {
  it('asks for /me and never names the employer', async () => {
    mock.onGet('/analytics/employers/me').reply(200, envelope(employerBody()));

    await fetchOwnerAnalytics(EMPLOYER, RANGE, true);

    const request = mock.history.get[0];
    expect(request.url).toBe('/analytics/employers/me');
    expect(JSON.stringify(request.params)).not.toContain(EMPLOYER.id);
    expect(request.params).toMatchObject({ period: 'last30d', includeSeries: true });
  });

  it('keeps every metric the employer route serves, and none of them is simulated', async () => {
    mock.onGet('/analytics/employers/me').reply(200, envelope(employerBody()));

    const dataset = await fetchOwnerAnalytics(EMPLOYER, RANGE, true);

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

  it('calls the conversions applications', async () => {
    mock.onGet('/analytics/employers/me').reply(200, envelope(employerBody()));

    const dataset = await fetchOwnerAnalytics(EMPLOYER, RANGE, true);
    const label = (key: string) => dataset.metrics.find((entry) => entry.key === key)?.label;

    expect(label('conversion.count')).toBe('Applications');
    expect(label('conversion.rate')).toBe('Application rate');
    expect(label('content.published')).toBe('Items published');
  });

  it('draws the application rate as a share of views, not a hundred times it', async () => {
    mock.onGet('/analytics/employers/me').reply(200, envelope(employerBody()));

    const dataset = await fetchOwnerAnalytics(EMPLOYER, RANGE, true);
    const rate = dataset.metrics.find((entry) => entry.key === 'conversion.rate');

    // 14 Sep 2026: one application from one view read "10,000%" on the device, because the
    // server sent the rate as a whole percentage and the tile formats a ratio.
    expect(rate?.format).toBe('percentage');
    expect(rate && formatMetricValue(rate)).toBe('5%');
  });

  it('has no revenue anywhere, served or withheld', async () => {
    mock.onGet('/analytics/employers/me').reply(200, envelope(employerBody()));

    const dataset = await fetchOwnerAnalytics(EMPLOYER, RANGE, true);

    expect(dataset.metrics.find((entry) => entry.key === 'revenue.gross')).toBeUndefined();
    expect(dataset.unavailableMetrics).not.toContain('revenue.gross');
  });

  it('carries applications beside views on the board, and opens the job', async () => {
    mock.onGet('/analytics/employers/me').reply(200, envelope(employerBody()));

    const [board] = (await fetchOwnerAnalytics(EMPLOYER, RANGE, true)).leaderboards;
    const [row] = board.rows;

    expect(board.key).toBe('employer-jobs');
    expect(row.entity.entityType).toBe('job');
    expect(row.entity.route).toBe(`/job/${JOB}`);
    expect(row.secondaryLabel).toBe('Applications');
    expect(row.secondaryValue).toBe(4);
  });

  it('is not also a per-item content subject', () => {
    // `job` is one posting; `employer` owns every posting.
    expect(isCertifiedContentSubject(EMPLOYER)).toBe(false);
  });
});

describe('the employer dashboard screen', () => {
  it('takes the employer from the session, never from the route', () => {
    const screen = code('src', 'app', 'analytics', 'employer.tsx');

    expect(screen).toMatch(/useAuthStore\(/);
    expect(screen).toMatch(/type:\s*'employer',\s*id:\s*userId/);
    expect(screen).not.toMatch(/useLocalSearchParams/);
  });

  it('no longer has an id-routed twin for a link to reach with the wrong id', () => {
    expect(
      fs.existsSync(path.join(process.cwd(), 'src', 'app', 'analytics', 'employer', '[id].tsx'))
    ).toBe(false);
  });
});

describe('the ways in', () => {
  it('is a row on the analytics hub', () => {
    expect(code('src', 'app', 'analytics', 'index.tsx')).toMatch(/route:\s*'\/analytics\/employer'/);
  });

  it('is linked from the hiring workspace, where an employer would look for it', () => {
    expect(code('src', 'app', 'job', 'hiring.tsx')).toMatch(
      /router\.push\('\/analytics\/employer'\)/
    );
  });
});
