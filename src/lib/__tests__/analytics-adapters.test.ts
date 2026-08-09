// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Adapters onto the existing surfaces (Frontend Phase 15,
// §2 · §3 · §5 · §37)
//
// The adapters are what make this phase a *consolidation* rather than a fifth
// analytics system, and they are the place a subtle wrongness would be hardest to
// notice: a normaliser that quietly upgraded a simulated figure to a real one
// would produce a dashboard that is confidently wrong and looks right.
//
// Four properties, in descending order of how much damage getting them wrong
// would do:
//
//   **Provenance is never upgraded.** A `simulated` value stays `simulated`. This
//   is the one direction the code must never move in.
//
//   **The percentage convention is applied per source.** Phase 7 publishes
//   `changePercentage: 18` meaning eighteen percent; Phase 6 publishes
//   `changeRatio: 0.18` meaning the same thing. One is divided by a hundred and
//   the other is not, and getting it backwards is a hundredfold error that looks
//   plausible in both directions.
//
//   **Stock and flow are distinguished.** Summing a membership level over thirty
//   days reports thirty times the membership.
//
//   **An unmapped metric key is dropped, not passed through.** §35 requires every
//   rendered metric to have a definition; a metric with a server label and no
//   definition sitting next to defined ones is indistinguishable from them.
// ─────────────────────────────────────────────────────────────────────────────

import {
  composeDataset,
  fromCommunityStatistics,
  fromCreatorContent,
  fromCreatorSummary,
  fromOrganizationAnalytics,
  fromPremiumAnalytics,
  oldestFreshness,
} from '@/lib/analytics/adapters';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import type { AnalyticsMetric, AnalyticsTimeRange, DataFreshness } from '@/types/analytics';
import type { CommunityStatistics } from '@/types/community-directory';
import type { CreatorAnalyticsSummary, CreatorContentPerformance } from '@/types/creator-economy';
import type { OrganizationAnalytics } from '@/types/community-advanced';
import type { PremiumAnalytics } from '@/types/monetization-gaps';

const RANGE: AnalyticsTimeRange = {
  preset: 'last30d',
  from: '2026-07-10',
  to: '2026-08-08',
  timezone: 'Europe/London',
  isDeviceTimezone: false,
};

const FRESHNESS: DataFreshness = {
  computedAt: '2026-08-08T03:00:00.000Z',
  sourceName: 'Diaspora',
};

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 7 — CREATOR
// ═════════════════════════════════════════════════════════════════════════════

function creatorSummary(): CreatorAnalyticsSummary {
  return {
    range: { period: '30d', from: null, to: null },
    metrics: [
      {
        key: 'views',
        label: 'Views (server label)',
        value: 4218,
        format: 'count',
        changePercentage: 18,
        higherIsBetter: true,
        definition: 'A server-published sentence.',
      },
      {
        key: 'engagementRate',
        label: 'Engagement',
        value: 6.4,
        format: 'percentage',
        changePercentage: -7,
      },
      {
        // Not in the catalogue. Must be dropped rather than rendered.
        key: 'someUnknownMetric',
        label: 'Mystery figure',
        value: 99,
        format: 'count',
      },
    ],
    series: [
      {
        key: 'views',
        label: 'Views',
        points: [
          { at: '2026-08-01', value: 100 },
          { at: '2026-08-02', value: 140 },
        ],
      },
    ],
    generatedAt: '2026-08-08T02:00:00.000Z',
    freshnessNote: 'Recomputed nightly.',
  };
}

describe('§2 · Phase 7 creator analytics is normalised rather than rebuilt', () => {
  it('maps known keys onto the catalogue', () => {
    const result = fromCreatorSummary(creatorSummary(), {
      source: 'simulated',
      gapKey: 'creatorAnalytics',
    });

    expect(result.metrics.map((metric) => metric.key)).toEqual([
      'content.views',
      'content.engagementRate',
    ]);
  });

  it('takes the label from the catalogue, not from the server', () => {
    // §35: two dashboards must not disagree about what a figure is called, and the
    // catalogue is the single source. The server's "Views (server label)" is
    // discarded deliberately.
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });

    expect(result.metrics[0].label).toBe(ANALYTICS_DEFINITIONS['content.views'].label);
    expect(result.metrics[0].label).not.toContain('server label');
  });

  it('drops an unmapped key and reports it rather than swallowing it', () => {
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });

    expect(result.unmappedKeys).toEqual(['someUnknownMetric']);
    expect(result.metrics.some((metric) => metric.label === 'Mystery figure')).toBe(false);
  });

  // The conversion that would be a hundredfold error if it went the wrong way.
  it('converts Phase 7’s whole-number percentage into a ratio', () => {
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });
    const views = result.metrics.find((metric) => metric.key === 'content.views')!;

    // 18 (percent) → 0.18 (ratio)
    expect(views.comparison?.changePercent).toBeCloseTo(0.18, 6);
    expect(views.comparison?.changePercent).not.toBeCloseTo(18, 0);
  });

  it('converts a percentage-formatted *value* into a ratio too', () => {
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });
    const engagement = result.metrics.find(
      (metric) => metric.key === 'content.engagementRate'
    )!;

    // 6.4 (percent) → 0.064 (ratio), matching the model's convention.
    expect(engagement.value.value).toBeCloseTo(0.064, 6);
  });

  it('carries a negative change through with its sign intact', () => {
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });
    const engagement = result.metrics.find(
      (metric) => metric.key === 'content.engagementRate'
    )!;

    expect(engagement.comparison?.changePercent).toBeCloseTo(-0.07, 6);
  });

  it('the caller states the provenance rather than the adapter assuming it', () => {
    const simulated = fromCreatorSummary(creatorSummary(), {
      source: 'simulated',
      gapKey: 'creatorAnalytics',
    });
    const real = fromCreatorSummary(creatorSummary(), { source: 'backend' });

    expect(simulated.metrics[0].value.source).toBe('simulated');
    expect(simulated.metrics[0].value.gapKey).toBe('creatorAnalytics');

    // When a backend phase makes creator analytics real, the hook passes
    // 'backend' and nothing in the adapter changes.
    expect(real.metrics[0].value.source).toBe('backend');
    expect(real.metrics[0].value.gapKey).toBeUndefined();
  });

  it('carries the freshness the source published rather than stamping now', () => {
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });

    expect(result.metrics[0].freshness.computedAt).toBe('2026-08-08T02:00:00.000Z');
    expect(result.metrics[0].freshness.methodology).toBe('Recomputed nightly.');
  });

  it('normalises the series and marks its provenance', () => {
    const result = fromCreatorSummary(creatorSummary(), { source: 'simulated' });

    expect(result.series).toHaveLength(1);
    expect(result.series[0].key).toBe('content.views');
    expect(result.series[0].source).toBe('simulated');
    expect(result.series[0].points).toEqual([
      { at: '2026-08-01', value: 100 },
      { at: '2026-08-02', value: 140 },
    ]);
  });
});

describe('§2 · Phase 7 content performance becomes a leaderboard', () => {
  const items: CreatorContentPerformance[] = [
    {
      contentId: 'g1',
      contentType: 'Guide',
      title: 'Registering with a GP',
      status: 'Published',
      metrics: [{ key: 'views', label: 'Views', value: 900, format: 'count', changePercentage: 12 }],
      isSponsored: false,
    },
    {
      contentId: 'g2',
      contentType: 'Update',
      title: 'Council tax changes',
      status: 'Published',
      metrics: [{ key: 'views', label: 'Views', value: 400, format: 'count' }],
      isSponsored: true,
    },
  ];

  it('echoes the server’s order rather than sorting', () => {
    // §3: the client never sorts a leaderboard. Position 1 is whatever the server
    // returned first, even if a later row has a higher value.
    const leaderboard = fromCreatorContent(items, 'content.views', 'simulated');

    expect(leaderboard.rows.map((row) => row.position)).toEqual([1, 2]);
    expect(leaderboard.rows[0].entity.entityId).toBe('g1');
  });

  it('routes each content type to the screen it actually lives at', () => {
    const leaderboard = fromCreatorContent(items, 'content.views', 'simulated');

    expect(leaderboard.rows[0].entity.route).toBe('/guide/g1');
    expect(leaderboard.rows[1].entity.route).toBe('/update/g2');
  });

  it('returns null rather than a guessed route for an unknown type', () => {
    const leaderboard = fromCreatorContent(
      [{ ...items[0], contentType: 'Podcast' }],
      'content.views',
      'simulated'
    );

    expect(leaderboard.rows[0].entity.route).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 13 — COMMUNITY
// ═════════════════════════════════════════════════════════════════════════════

function communityStatistics(): CommunityStatistics {
  return {
    communityId: 'dev-ng',
    period: '30d',
    source: 'simulated',
    freshness: FRESHNESS,
    metrics: [
      {
        key: 'members',
        label: 'Members',
        // Simulated: Phase 13 found no membership record to count.
        value: { value: 12_400, source: 'simulated', gapKey: 'communityStatistics' },
        period: '30d',
        freshness: FRESHNESS,
      },
      {
        key: 'events',
        label: 'Events',
        // Real: derived from a certified route.
        value: { value: 48, source: 'backend' },
        period: '30d',
        freshness: FRESHNESS,
      },
      {
        key: 'growth',
        label: 'Growth',
        value: { value: 0.04, source: 'simulated', gapKey: 'communityStatistics' },
        changePercent: { value: 4, source: 'simulated' },
        period: '30d',
        freshness: FRESHNESS,
      },
      {
        key: 'privateThing',
        label: 'Restricted',
        value: { value: 99, source: 'backend' },
        period: '30d',
        freshness: FRESHNESS,
        isRestricted: true,
      },
    ],
  };
}

describe('§37 · Phase 13’s per-field provenance survives normalisation', () => {
  it('carries a simulated value as simulated', () => {
    const result = fromCommunityStatistics(communityStatistics());
    const members = result.metrics.find((metric) => metric.key === 'reach.members')!;

    expect(members.value.source).toBe('simulated');
    expect(members.value.gapKey).toBe('communityStatistics');
  });

  // The property that matters most. Collapsing to one source would either mark a
  // real event count as simulated or a simulated member count as real.
  it('carries a real value as real, in the same dataset', () => {
    const result = fromCommunityStatistics(communityStatistics());
    const events = result.metrics.find((metric) => metric.key === 'inventory.events')!;

    expect(events.value.source).toBe('backend');
    expect(events.value.value).toBe(48);
  });

  it('never upgrades a simulated value to a real one', () => {
    const result = fromCommunityStatistics(communityStatistics());
    const simulatedCount = result.metrics.filter(
      (metric) => metric.value.source === 'simulated'
    ).length;

    expect(simulatedCount).toBeGreaterThan(0);
  });

  // §46 and §73: omitted, not nulled and not blurred.
  it('omits a restricted metric entirely', () => {
    const result = fromCommunityStatistics(communityStatistics());

    expect(result.metrics.some((metric) => metric.value.value === 99)).toBe(false);
    expect(result.metrics).toHaveLength(3);
  });

  it('converts Phase 13’s whole-number change into a ratio', () => {
    const result = fromCommunityStatistics(communityStatistics());
    const growth = result.metrics.find((metric) => metric.key === 'growth.members.rate')!;

    expect(growth.comparison?.changePercent).toBeCloseTo(0.04, 6);
  });

  it('carries each metric’s own freshness', () => {
    const result = fromCommunityStatistics(communityStatistics());
    for (const metric of result.metrics) {
      expect(metric.freshness.computedAt).toBe(FRESHNESS.computedAt);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12 — ORGANIZATION
// ═════════════════════════════════════════════════════════════════════════════

function organizationAnalytics(): OrganizationAnalytics {
  const points = (values: number[]) =>
    values.map((value, index) => ({ date: `2026-08-0${index + 1}`, value }));

  return {
    organizationId: 'org-1',
    period: '30d',
    source: 'simulated',
    computedAt: '2026-08-08T02:30:00.000Z',
    memberGrowth: points([100, 104, 109]),
    eventAttendance: points([20, 35, 15]),
    donationTotals: points([500, 200, 300]),
    volunteerHours: points([10, 12, 8]),
    pollParticipation: points([0.4, 0.5, 0.45]),
  };
}

describe('§5 · Phase 12 series become both a series and a headline figure', () => {
  it('produces one series per mapped field', () => {
    const result = fromOrganizationAnalytics(organizationAnalytics());
    expect(result.series.length).toBeGreaterThanOrEqual(3);
  });

  // The stock-versus-flow decision, asserted.
  it('takes the last point for a stock, not the sum', () => {
    const result = fromOrganizationAnalytics(organizationAnalytics());
    const members = result.metrics.find((metric) => metric.key === 'reach.members')!;

    // 109, not 313. Summing a membership level over three days would report
    // three times the membership.
    expect(members.value.value).toBe(109);
  });

  it('sums a flow', () => {
    const result = fromOrganizationAnalytics(organizationAnalytics());
    const attendance = result.metrics.find((metric) => metric.key === 'event.attendance')!;

    expect(attendance.value.value).toBe(70); // 20 + 35 + 15
  });

  // §5: the series is the server's; the period figure is this device's reduction.
  it('marks the derived headline figure as client-derived', () => {
    const result = fromOrganizationAnalytics(organizationAnalytics());

    for (const metric of result.metrics) {
      expect(metric.computation).toBe('client-derived');
    }
  });

  it('carries the source’s own computedAt', () => {
    const result = fromOrganizationAnalytics(organizationAnalytics());
    expect(result.metrics[0].freshness.computedAt).toBe('2026-08-08T02:30:00.000Z');
  });

  it('skips an empty series rather than reporting zero', () => {
    const empty = { ...organizationAnalytics(), memberGrowth: [] };
    const result = fromOrganizationAnalytics(empty);

    expect(result.metrics.some((metric) => metric.key === 'reach.members')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 6 — MONETIZATION
// ═════════════════════════════════════════════════════════════════════════════

function premiumAnalytics(): PremiumAnalytics {
  return {
    periodStart: '2026-07-10',
    periodEnd: '2026-08-08',
    headline: [
      {
        key: 'impressions',
        label: 'Impressions',
        value: 180_000,
        unit: 'count',
        // Phase 6 publishes a *ratio* already. This must not be divided again.
        changeRatio: 0.18,
        definition: 'Times a placement was shown.',
      },
      {
        key: 'ctr',
        label: 'Click-through',
        value: 4.1,
        unit: 'percentage',
        definition: 'Opens as a share of impressions.',
      },
      { key: 'invented', label: 'Mystery', value: 1, unit: 'count', definition: 'x' },
    ],
    breakdowns: [
      {
        dimension: 'placement',
        label: 'By placement',
        buckets: [
          { label: 'Featured', value: 120_000, ratio: 0.67 },
          { label: 'Boost', value: 60_000, ratio: 0.33 },
        ],
      },
    ],
    series: [
      { date: '2026-08-01', views: 100, engagements: 10 },
      { date: '2026-08-02', views: 140, engagements: 14 },
    ],
    topSubjects: [],
    reportingLagHours: 18,
  };
}

describe('§67 · Phase 6 premium analytics is normalised, and its ratio is not double-divided', () => {
  // The asymmetry that makes `percentToRatio` a named function used deliberately
  // rather than applied everywhere out of habit.
  it('passes a ratio through without dividing by a hundred', () => {
    const result = fromPremiumAnalytics(premiumAnalytics(), { source: 'simulated' });
    const impressions = result.metrics.find(
      (metric) => metric.key === 'monetization.impressions'
    )!;

    expect(impressions.comparison?.changePercent).toBeCloseTo(0.18, 6);
    // 0.0018 would be the double-divided answer.
    expect(impressions.comparison?.changePercent).not.toBeCloseTo(0.0018, 6);
  });

  it('converts a percentage-unit value into a ratio', () => {
    const result = fromPremiumAnalytics(premiumAnalytics(), { source: 'simulated' });
    const ctr = result.metrics.find(
      (metric) => metric.key === 'recommendation.clickThroughRate'
    )!;

    expect(ctr.value.value).toBeCloseTo(0.041, 6);
  });

  it('drops an unmapped key', () => {
    const result = fromPremiumAnalytics(premiumAnalytics(), { source: 'simulated' });
    expect(result.unmappedKeys).toContain('invented');
  });

  // §36: a dashboard whose figures trail by eighteen hours and does not say so.
  it('turns the reporting lag into a stated limitation rather than dropping it', () => {
    const result = fromPremiumAnalytics(premiumAnalytics(), { source: 'simulated' });

    expect(result.metrics[0].freshness.limitations?.join(' ')).toContain('18 hours');
  });

  it('omits the limitation when there is no lag', () => {
    const result = fromPremiumAnalytics(
      { ...premiumAnalytics(), reportingLagHours: 0 },
      { source: 'simulated' }
    );

    expect(result.metrics[0].freshness.limitations).toBeUndefined();
  });

  it('normalises the breakdown with its ratios intact', () => {
    const result = fromPremiumAnalytics(premiumAnalytics(), { source: 'simulated' });

    expect(result.breakdowns).toHaveLength(1);
    expect(result.breakdowns[0].buckets.map((bucket) => bucket.ratio)).toEqual([0.67, 0.33]);
    expect(result.breakdowns[0].total).toBe(180_000);
  });

  it('maps `views` to content views rather than to placement impressions', () => {
    // A view of a promoted item is not an impression of the placement, and
    // labelling one as the other would put a number under a definition it does not
    // satisfy.
    const result = fromPremiumAnalytics(premiumAnalytics(), { source: 'simulated' });
    const seriesKeys = result.series.map((series) => series.key);

    expect(seriesKeys).toContain('content.views');
    expect(seriesKeys).not.toContain('monetization.impressions');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITION
// ═════════════════════════════════════════════════════════════════════════════

function metric(
  key: AnalyticsMetric['key'],
  source: 'backend' | 'simulated',
  computedAt: string
): AnalyticsMetric {
  return {
    key,
    label: ANALYTICS_DEFINITIONS[key].label,
    value: { value: 1, source },
    format: 'count',
    computation: 'server-aggregate',
    money: null,
    higherIsBetter: true,
    comparison: null,
    freshness: { computedAt, sourceName: 'Diaspora' },
    privacyClass: 'public',
  };
}

describe('§37 · composition decides the dataset status honestly', () => {
  const base = {
    subject: { type: 'community' as const, id: 'dev-ng' },
    range: RANGE,
    comparison: 'none' as const,
  };

  it('mixed provenance is PARTIAL, not one or the other', () => {
    const composed = composeDataset({
      ...base,
      parts: [
        {
          metrics: [metric('inventory.events', 'backend', '2026-08-08T00:00:00Z')],
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
        {
          metrics: [metric('reach.members', 'simulated', '2026-08-08T00:00:00Z')],
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
      ],
    });

    expect(composed.status).toBe('PARTIAL');
  });

  it('all simulated is DEVELOPMENT_DATA', () => {
    const composed = composeDataset({
      ...base,
      parts: [
        {
          metrics: [metric('reach.members', 'simulated', '2026-08-08T00:00:00Z')],
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
      ],
    });

    expect(composed.status).toBe('DEVELOPMENT_DATA');
  });

  it('all real is LIVE', () => {
    const composed = composeDataset({
      ...base,
      parts: [],
      certifiedMetrics: [metric('inventory.events', 'backend', '2026-08-08T00:00:00Z')],
    });

    expect(composed.status).toBe('LIVE');
  });

  it('nothing at all is UNAVAILABLE, not LIVE', () => {
    const composed = composeDataset({ ...base, parts: [] });
    expect(composed.status).toBe('UNAVAILABLE');
  });

  // The ordering rule. Getting it backwards would silently prefer a simulated
  // number over a real one for the same metric.
  it('a certified metric wins over a simulated one on the same key', () => {
    const composed = composeDataset({
      ...base,
      parts: [
        {
          metrics: [
            { ...metric('inventory.events', 'simulated', '2026-08-08T00:00:00Z'), value: { value: 999, source: 'simulated' } },
          ],
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
      ],
      certifiedMetrics: [
        { ...metric('inventory.events', 'backend', '2026-08-08T00:00:00Z'), value: { value: 48, source: 'backend' } },
      ],
    });

    const events = composed.metrics.find((entry) => entry.key === 'inventory.events')!;
    expect(events.value.value).toBe(48);
    expect(events.value.source).toBe('backend');
  });

  // §36: a card refreshed a minute ago beside one computed last night makes the
  // whole screen as fresh as last night.
  it('dataset freshness is the oldest of its parts, never the newest', () => {
    const composed = composeDataset({
      ...base,
      parts: [
        {
          metrics: [
            metric('inventory.events', 'backend', '2026-08-08T09:00:00Z'),
            metric('reach.members', 'simulated', '2026-08-07T03:00:00Z'),
          ],
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
      ],
    });

    expect(composed.freshness.computedAt).toBe('2026-08-07T03:00:00Z');
  });

  it('an empty metric set has a stated-unknown freshness rather than now', () => {
    // Stamping the current time on data that does not exist would be the
    // strongest possible claim about nothing.
    const freshness = oldestFreshness([]);

    expect(freshness.computedAt).toBe('');
    expect(freshness.sourceName).toBe('Unknown');
  });

  it('carries unavailable metrics through so the UI can say something was missing', () => {
    const composed = composeDataset({
      ...base,
      parts: [],
      certifiedMetrics: [metric('inventory.events', 'backend', '2026-08-08T00:00:00Z')],
      unavailableMetrics: ['inventory.jobs', 'inventory.housing'],
    });

    expect(composed.unavailableMetrics).toEqual(['inventory.jobs', 'inventory.housing']);
  });

  it('deduplicates by metric key', () => {
    const composed = composeDataset({
      ...base,
      parts: [
        {
          metrics: [
            metric('inventory.events', 'backend', '2026-08-08T00:00:00Z'),
            metric('inventory.events', 'backend', '2026-08-08T00:00:00Z'),
          ],
          series: [],
          breakdowns: [],
          unmappedKeys: [],
        },
      ],
    });

    expect(composed.metrics).toHaveLength(1);
  });
});
