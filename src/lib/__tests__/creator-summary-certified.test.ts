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

    await fetchCreatorSummary(RANGE);

    expect(mockGet).toHaveBeenCalledWith(
      '/analytics/creators/me/summary',
      expect.objectContaining({ params: expect.objectContaining({ period: 'last30Days' }) }),
    );
  });

  it('returns the metrics the deployment serves', async () => {
    mockGet.mockResolvedValue(payload());

    const { summary } = await fetchCreatorSummary(RANGE);

    // The two the old banner denied.
    expect(summary.metrics.map((m) => m.key)).toContain('content_views');
    expect(summary.metrics.map((m) => m.key)).toContain('saves');
  });

  it('carries the deployment’s own list of what it cannot compute', async () => {
    mockGet.mockResolvedValue(payload());

    const { unavailableMetrics } = await fetchCreatorSummary(RANGE);

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

    expect((await fetchCreatorSummary(RANGE)).unavailableMetrics).toEqual([]);
  });

  it('does not invent an empty list when the field is absent', async () => {
    // Absent means the deployment did not say, which is not the same as
    // "everything works" — but an empty array is the only safe render, and the
    // screen shows no denial rather than a made-up one.
    mockGet.mockResolvedValue(payload({ unavailableMetrics: undefined }));

    expect((await fetchCreatorSummary(RANGE)).unavailableMetrics).toEqual([]);
  });

  it('echoes the server’s own range rather than the one requested', async () => {
    // So the figures and the period they describe cannot disagree.
    mockGet.mockResolvedValue(payload());

    const { summary } = await fetchCreatorSummary(RANGE);

    expect(summary.range.period).toBe('30d');
    expect(summary.range.from).toBe('2026-07-24');
  });

  it('survives a payload with no metrics at all', async () => {
    mockGet.mockResolvedValue(payload({ metrics: undefined, series: undefined }));

    const { summary } = await fetchCreatorSummary(RANGE);

    expect(summary.metrics).toEqual([]);
    expect(summary.series).toEqual([]);
  });
});
