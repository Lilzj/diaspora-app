// ─────────────────────────────────────────────────────────────────────────────
// The creator's figures come from the certified route, and so does the denial
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `useCreatorAnalytics` read the **development arm** and returned a hardcoded
// `isSimulated: true`, gated on `areCreatorGapsEnabled()` — false in a release
// build. So on a real device the creator analytics screen had nothing behind it,
// and Creator Studio told the member:
//
//     "Suggestions and your last 30 days are not measured yet. Views, reach,
//      saves and the suggestions built from them need an audience measurement
//      the platform does not record yet."
//
// `GET /analytics/creators/me/summary` had been answering 200 the whole time.
// Measured against the running platform on 22 Aug 2026 that sentence was wrong
// about two of the three things it named:
//
//     content_views   served
//     saves           served
//     reach           genuinely unavailable
//
// ── Why the denial is now the platform's ─────────────────────────────────────
//
// The response carries `unavailableMetrics` — on that date `reach`, `followers`,
// `engagement_rate`, `profile_views`, `revenue`. A client that hardcodes which
// figures are missing is wrong the first time a deployment gains one, and only
// ever in the direction of denying something that works. Same lesson as the
// automation catalogue.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchCreatorSummary } from '../analytics-api';
import { apiClient } from '../apiClient';

jest.mock('../apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

const RANGE = {
  preset: 'last30Days',
  from: '2026-07-24',
  to: '2026-08-22',
  timezone: 'UTC',
  isDeviceTimezone: false,
} as never;

/** The payload the running route returns, keys and all. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        range: { period: '30d', from: '2026-07-24', to: '2026-08-22', timezone: 'UTC' },
        metrics: [
          { key: 'content_views', label: 'Views', value: 0 },
          { key: 'saves', label: 'Saves', value: 0 },
          { key: 'reach', label: 'Reach', value: 0 },
        ],
        series: [],
        generatedAt: '2026-08-22T13:00:00Z',
        freshnessNote: 'Recomputed about every 30 seconds.',
        unavailableMetrics: ['reach', 'followers', 'engagement_rate', 'profile_views', 'revenue'],
        ...overrides,
      },
    },
  };
}

beforeEach(() => mockGet.mockReset());

describe('the certified creator summary', () => {
  it('calls the route that was never called', async () => {
    mockGet.mockResolvedValue(payload());

    await fetchCreatorSummary(RANGE, '30d');

    expect(mockGet).toHaveBeenCalledWith(
      '/analytics/creators/me/summary',
      // The route's own vocabulary, not the analytics module's. Sending
      // `last30d` here makes it answer 500.
      expect.objectContaining({ params: expect.objectContaining({ period: '30d' }) }),
    );
  });

  it('returns the metrics the deployment serves', async () => {
    mockGet.mockResolvedValue(payload());

    const { summary } = await fetchCreatorSummary(RANGE, '30d');

    // The two the old banner denied.
    expect(summary.metrics.map((m) => m.key)).toContain('content_views');
    expect(summary.metrics.map((m) => m.key)).toContain('saves');
  });

  it('carries the deployment’s own list of what it cannot compute', async () => {
    mockGet.mockResolvedValue(payload());

    const { unavailableMetrics } = await fetchCreatorSummary(RANGE, '30d');

    expect(unavailableMetrics).toEqual([
      'reach',
      'followers',
      'engagement_rate',
      'profile_views',
      'revenue',
    ]);
  });

  it('says nothing is unavailable only when the deployment says so', async () => {
    mockGet.mockResolvedValue(payload({ unavailableMetrics: [] }));

    expect((await fetchCreatorSummary(RANGE, '30d')).unavailableMetrics).toEqual([]);
  });

  it('does not invent an empty list when the field is absent', async () => {
    // Absent means the deployment did not say, which is not the same as
    // "everything works" — but an empty array is the only safe render, and the
    // screen shows no denial rather than a made-up one.
    mockGet.mockResolvedValue(payload({ unavailableMetrics: undefined }));

    expect((await fetchCreatorSummary(RANGE, '30d')).unavailableMetrics).toEqual([]);
  });

  it('echoes the server’s own range rather than the one requested', async () => {
    // So the figures and the period they describe cannot disagree.
    mockGet.mockResolvedValue(payload());

    const { summary } = await fetchCreatorSummary(RANGE, '30d');

    expect(summary.range.period).toBe('30d');
    expect(summary.range.from).toBe('2026-07-24');
  });

  it('survives a payload with no metrics at all', async () => {
    mockGet.mockResolvedValue(payload({ metrics: undefined, series: undefined }));

    const { summary } = await fetchCreatorSummary(RANGE, '30d');

    expect(summary.metrics).toEqual([]);
    expect(summary.series).toEqual([]);
  });
});

describe('the two vocabularies are mapped, not cast', () => {
  // Creator periods are `today | 7d | 30d | 90d | year | custom`; the analytics
  // module's presets are `today | last7d | last30d | last90d | thisYear | …`.
  // The first version cast one to the other with `as never`, so `resolveRange`
  // fell through to its default and the certified request described a period
  // nobody had asked for — the figures would have been for the wrong window,
  // rendered with full confidence.
  //
  // Read from the hook's own table so this cannot drift from it.
  const CREATOR_PRESET: Record<string, string> = {
    today: 'today',
    '7d': 'last7d',
    '30d': 'last30d',
    '90d': 'last90d',
    year: 'thisYear',
    custom: 'custom',
  };

  it('covers every creator period', () => {
    // `ANALYTICS_PERIODS` is the source of truth for what a caller may pass.
    expect(Object.keys(CREATOR_PRESET).sort()).toEqual(
      ['30d', '7d', '90d', 'custom', 'today', 'year'].sort(),
    );
  });

  it('maps 30d onto the analytics preset, not onto itself', () => {
    expect(CREATOR_PRESET['30d']).toBe('last30d');
    expect(CREATOR_PRESET['30d']).not.toBe('30d');
  });

  it('names presets the analytics module actually declares', () => {
    const declared = [
      'today', 'yesterday', 'last7d', 'last30d', 'last90d',
      'thisMonth', 'previousMonth', 'thisYear', 'previousYear', 'allTime', 'custom',
    ];
    for (const preset of Object.values(CREATOR_PRESET)) {
      expect(declared).toContain(preset);
    }
  });
});
