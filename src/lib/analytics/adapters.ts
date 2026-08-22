// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Adapters onto the existing analytics surfaces
// (Frontend Phase 15, §2 · §3 · §66 · §67 · §70)
//
// **This file is why Phase 15 is not a fifth analytics system.**
//
// The audit found four analytics surfaces already shipped, each with its own
// metric type, period type, series type and chart:
//
//   Phase 6   `PerformanceMetric`   premium/business analytics, entitlement-gated
//   Phase 7   `CreatorMetric`       creator analytics and content performance
//   Phase 12  `TimeSeriesPoint`     organization analytics
//   Phase 13  `CommunityMetric`     community statistics and comparison
//
// All four work, all four are tested, and all four have screens members use.
// The brief's instruction is AUDIT → REUSE → UPGRADE, not rewrite, and §3 asks
// for one generic model rather than dozens of unrelated metric types. Those two
// meet here: each existing shape is **normalised into** `AnalyticsMetric` and
// friends, so the new dashboards can show creator, organization and community
// data without a second fetch path, a second cache entry or a second definition
// of "views".
//
// ── What that buys, concretely ───────────────────────────────────────────────
//
//   A community's member count appears on the community statistics screen
//   (Phase 13's own) and on the Phase 15 community dashboard, from **one**
//   request, with **one** provenance marker, and the two cannot disagree.
//
//   Rewriting those screens onto the new model would have risked a regression in
//   working, tested code to gain nothing a normaliser cannot.
//
// ── The rules every adapter follows ──────────────────────────────────────────
//
//   **Provenance is never upgraded.** A `Sourced<number>` that arrives
//   `simulated` leaves `simulated`. The one direction this code must never move
//   in is towards claiming more than the source did, and there is no branch
//   below that sets `source: 'backend'` on anything it did not receive as
//   backend.
//
//   **A metric key that is not in the catalogue is dropped, not invented.**
//   Phase 7 serves metric keys as free strings; §35 requires every rendered
//   metric to have a definition. An unmapped key is skipped and reported, rather
//   than passed through with its server label — which would put an undefined
//   metric on a screen next to defined ones with nothing to distinguish them.
//
//   **Freshness is carried, never fabricated.** Where a source has a
//   `computedAt`, it travels. Where it has only a prose note, that becomes the
//   methodology and the timestamp comes from the source's own field. Nothing here
//   stamps `new Date()` onto a figure somebody else computed.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsBreakdown,
  AnalyticsComparison,
  AnalyticsDataset,
  AnalyticsGranularity,
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsSeries,
  AnalyticsSubject,
  AnalyticsTimeRange,
  DataFreshness,
  DataSource,
  Sourced,
} from '@/types/analytics';
import type { CommunityMetric, CommunityStatistics } from '@/types/community-directory';
import type {
  CreatorAnalyticsSummary,
  CreatorContentPerformance,
  CreatorMetric,
} from '@/types/creator-economy';
import type { OrganizationAnalytics } from '@/types/community-advanced';
import type { PremiumAnalytics } from '@/types/monetization-gaps';
import { ANALYTICS_DEFINITIONS } from './definitions';

// ─────────────────────────────────────────────────────────────────────────────
// Key mapping
//
// Each existing surface names its metrics its own way. These tables are the
// translation, and they are deliberately partial: a key with no entry is a key
// with no definition, and is dropped rather than guessed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phase 7's creator metric keys → the catalogue.
 *
 * **Two spellings, and the second half was added when the backend was read from
 * source.** This table was written from the client's `CreatorMetric` type, whose
 * `key` is a bare string, and it assumed camelCase — `uniqueViewers`,
 * `newFollowers`, `engagementRate`. `GET /api/v1/analytics/creators/me/summary`
 * sends `CreatorMetricResponse.Key`, which is `AnalyticsMetricCatalog`'s Phase 7
 * spelling and is **snake**: `unique_viewers`, `follower_growth`,
 * `engagement_rate`.
 *
 * Six of the fourteen coincide — `reach`, `saves`, `shares`, `comments`,
 * `followers`, `revenue` — and the other eight did not, including views and
 * engagement rate, which are the two headline tiles. `mapKey` drops an unmapped
 * key rather than guessing, so wiring this adapter to the real summary would
 * have produced a dashboard missing more than half its numbers with no error
 * anywhere.
 *
 * Both spellings are kept rather than one replacing the other: the development
 * fixtures speak camelCase, the platform speaks snake, and a table that
 * translates both is smaller than two tables.
 */
const CREATOR_KEY_MAP: Record<string, AnalyticsMetricKey> = {
  // ── The platform's spelling, from `AnalyticsMetricCatalog` ────────────────
  content_views: 'content.views',
  unique_viewers: 'content.uniqueViewers',
  helpful_votes: 'content.helpfulVotes',
  engagement_rate: 'content.engagementRate',
  // Net movement, not the total. The platform serves `followers` separately and
  // reports it as not measured, because it has no count from before it started
  // watching. Mapping the movement onto the total would put a small number under
  // a label meaning a large one.
  follower_growth: 'growth.members.net',
  profile_views: 'provider.profileViews',
  conversion: 'conversion.count',
  content_published: 'content.published',
  // ── The development fixtures' spelling ────────────────────────────────────
  views: 'content.views',
  reach: 'content.reach',
  impressions: 'content.impressions',
  uniqueViewers: 'content.uniqueViewers',
  followers: 'reach.followers',
  newFollowers: 'reach.followers',
  saves: 'content.saves',
  shares: 'content.shares',
  comments: 'content.comments',
  engagement: 'content.engagementRate',
  engagementRate: 'content.engagementRate',
  completionRate: 'content.completionRate',
  published: 'content.published',
  revenue: 'revenue.gross',
  earnings: 'revenue.gross',
  points: 'rewards.pointsEarned',
  communities: 'reach.communities',
  countries: 'reach.countries',
};

/** Phase 13's community statistic keys → the catalogue. */
const COMMUNITY_KEY_MAP: Record<string, AnalyticsMetricKey> = {
  members: 'reach.members',
  memberCount: 'reach.members',
  growth: 'growth.members.rate',
  memberGrowth: 'growth.members.net',
  newMembers: 'growth.members.net',
  activeMembers: 'audience.users.active.monthly',
  engagement: 'content.engagementRate',
  events: 'inventory.events',
  eventCount: 'inventory.events',
  organizations: 'inventory.organizations',
  organizationCount: 'inventory.organizations',
  guides: 'inventory.guides',
  guideCount: 'inventory.guides',
  jobs: 'inventory.jobs',
  jobCount: 'inventory.jobs',
  housing: 'inventory.housing',
  housingCount: 'inventory.housing',
  marketplace: 'inventory.listings',
  marketplaceCount: 'inventory.listings',
  providers: 'inventory.providers',
  providerCount: 'inventory.providers',
  updates: 'inventory.updates',
  contentPublished: 'content.published',
};

/** Phase 6's premium metric keys → the catalogue. */
const MONETIZATION_KEY_MAP: Record<string, AnalyticsMetricKey> = {
  impressions: 'monetization.impressions',
  clicks: 'monetization.clicks',
  conversions: 'monetization.conversions',
  views: 'content.views',
  engagements: 'content.engagementRate',
  spend: 'spend.total',
  revenue: 'revenue.gross',
  ctr: 'recommendation.clickThroughRate',
  conversionRate: 'conversion.rate',
  placements: 'monetization.featuredPlacements',
  subscriptions: 'monetization.activeSubscriptions',
};

/** Phase 12's organization series → the catalogue. */
const ORGANIZATION_SERIES_MAP: { field: keyof OrganizationAnalytics; key: AnalyticsMetricKey }[] = [
  { field: 'memberGrowth', key: 'reach.members' },
  { field: 'eventAttendance', key: 'event.attendance' },
  { field: 'donationTotals', key: 'wallet.donations' },
  { field: 'pollParticipation', key: 'content.engagementRate' },
];

/** The one place a mapping is looked up, so an unmapped key is dropped once. */
function mapKey(
  table: Record<string, AnalyticsMetricKey>,
  key: string
): AnalyticsMetricKey | null {
  const mapped = table[key];
  return mapped && ANALYTICS_DEFINITIONS[mapped] ? mapped : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Freshness from a source that publishes only a timestamp and a note.
 *
 * `sourceName` is required by `DataFreshness` and is never blank, so a caller
 * with nothing better says which phase's surface produced the figure. That is
 * more useful than "Diaspora" — when two dashboards disagree, knowing one came
 * from the creator surface and one from the community surface is the first step.
 */
function freshnessFrom(
  computedAt: string,
  sourceName: string,
  note?: string | null
): DataFreshness {
  return {
    computedAt,
    sourceName,
    methodology: note ?? undefined,
  };
}

/** A comparison from a bare percentage, where a source publishes only that. */
function comparisonFromPercent(
  changePercent: number | null | undefined,
  basis: AnalyticsComparison['basis'] = 'previousPeriod'
): AnalyticsComparison | null {
  if (changePercent === null || changePercent === undefined) return null;
  if (!Number.isFinite(changePercent)) return null;
  return { basis, changePercent };
}

/**
 * Converts a Phase 7 or Phase 6 percentage into the model's ratio convention.
 *
 * Both surfaces publish `changePercentage: 18` meaning eighteen percent, and this
 * model's `changePercent` is a **ratio** — 0.18. Getting this wrong is a
 * hundredfold error that looks plausible in both directions, which is exactly why
 * the conversion lives in one named function rather than inline at four call
 * sites.
 */
function percentToRatio(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value / 100;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 7 — CREATOR
// ═════════════════════════════════════════════════════════════════════════════

export interface AdapterResult {
  metrics: AnalyticsMetric[];
  series: AnalyticsSeries[];
  breakdowns: AnalyticsBreakdown[];
  /** Source keys with no catalogue entry. Surfaced rather than swallowed. */
  unmappedKeys: string[];
}

/**
 * Normalises Phase 7's creator analytics summary.
 *
 * Note the provenance decision: Phase 7's creator analytics is served by the
 * creator development adapter, so every figure is `simulated`. The `source`
 * argument makes that the caller's statement rather than this function's
 * assumption — when a backend phase makes creator analytics real, the hook
 * passes `'backend'` and nothing here changes.
 */
export function fromCreatorSummary(
  summary: CreatorAnalyticsSummary,
  options: { source: DataSource; gapKey?: string }
): AdapterResult {
  const unmappedKeys: string[] = [];
  const freshness = freshnessFrom(
    summary.generatedAt,
    'Diaspora creator analytics',
    summary.freshnessNote
  );

  const metrics = summary.metrics
    .map((metric): AnalyticsMetric | null => {
      const key = mapKey(CREATOR_KEY_MAP, metric.key);
      if (!key) {
        unmappedKeys.push(metric.key);
        return null;
      }
      return creatorMetricToAnalytics(metric, key, freshness, options);
    })
    .filter((metric): metric is AnalyticsMetric => metric !== null);

  const series = summary.series
    .map((entry): AnalyticsSeries | null => {
      const key = mapKey(CREATOR_KEY_MAP, entry.key);
      if (!key) return null;
      const definition = ANALYTICS_DEFINITIONS[key];

      return {
        key,
        label: definition.label,
        // Phase 7 does not publish a granularity. `day` is the honest reading of
        // a series whose points carry ISO dates, and it is what the existing
        // creator chart already assumes.
        granularity: 'day' as AnalyticsGranularity,
        format: definition.format,
        points: entry.points.map((point) => ({ at: point.at, value: point.value })),
        source: options.source,
        currency: null,
      };
    })
    .filter((entry): entry is AnalyticsSeries => entry !== null);

  return { metrics, series, breakdowns: [], unmappedKeys };
}

function creatorMetricToAnalytics(
  metric: CreatorMetric,
  key: AnalyticsMetricKey,
  freshness: DataFreshness,
  options: { source: DataSource; gapKey?: string }
): AnalyticsMetric {
  const definition = ANALYTICS_DEFINITIONS[key];

  // Phase 7 publishes percentages as whole numbers; the model uses ratios.
  const value =
    definition.format === 'percentage' && metric.format === 'percentage'
      ? metric.value / 100
      : metric.value;

  return {
    key,
    label: definition.label,
    value: {
      value,
      source: options.source,
      gapKey: options.source === 'simulated' ? options.gapKey : undefined,
    },
    format: definition.format,
    computation: 'server-aggregate',
    money: metric.amount ?? null,
    higherIsBetter: metric.higherIsBetter ?? definition.higherIsBetter,
    comparison: comparisonFromPercent(percentToRatio(metric.changePercentage)),
    freshness,
    privacyClass: definition.privacyClass,
  };
}

/**
 * Normalises Phase 7's per-content performance rows into leaderboard rows.
 *
 * Kept separate from the summary adapter because the two answer different
 * questions and are paged differently — the content list is cursor-paged and the
 * summary is not.
 */
export function fromCreatorContent(
  items: CreatorContentPerformance[],
  metricKey: AnalyticsMetricKey,
  source: DataSource
): AnalyticsDataset['leaderboards'][number] {
  const definition = ANALYTICS_DEFINITIONS[metricKey];
  const sourceKey = Object.entries(CREATOR_KEY_MAP).find(([, value]) => value === metricKey)?.[0];

  const rows = items.map((item, index) => {
    const metric = item.metrics.find((entry) => entry.key === sourceKey) ?? item.metrics[0];

    return {
      // The server's ordering, echoed. §3: the client never sorts a leaderboard.
      position: index + 1,
      entity: {
        entityType: String(item.contentType),
        entityId: item.contentId,
        title: item.title,
        route: routeForContent(String(item.contentType), item.contentId),
      },
      value: metric?.value ?? 0,
      format: definition.format,
      secondaryValue: null,
      secondaryFormat: null,
      secondaryLabel: null,
      comparison: comparisonFromPercent(percentToRatio(metric?.changePercentage)),
    };
  });

  return {
    key: 'creator-content',
    label: 'Your content',
    metricKey,
    rows,
    nextCursor: null,
    hasMore: false,
    source,
  };
}

/**
 * The in-app path for a content item.
 *
 * A small switch rather than a template, because the platform's routes are not
 * uniform — a guide is `/guide/[id]` and a marketplace item is `/marketplace/[id]`
 * — and a template that assumed they were would produce dead links for half the
 * content types. An unknown type gets `null` rather than a guessed route.
 */
function routeForContent(contentType: string, id: string): string | null {
  switch (contentType.toLowerCase()) {
    case 'guide':
      return `/guide/${id}`;
    case 'update':
      return `/update/${id}`;
    case 'event':
      return `/community-life/event/${id}`;
    case 'job':
      return `/job/${id}`;
    case 'housing':
      return `/housing/${id}`;
    case 'listing':
    case 'marketplace':
      return `/marketplace/${id}`;
    default:
      return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 13 — COMMUNITY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalises Phase 13's community statistics.
 *
 * The most careful of the four, because Phase 13's statistics are **hybrid at
 * field level**: event, organization, guide, job, housing, marketplace and
 * provider counts are real backend figures derived from certified routes, and
 * member counts, growth and engagement are simulated. Each metric's own
 * `Sourced.source` is carried through unchanged — collapsing them to one source
 * would either mark seven real numbers as simulated or three simulated ones as
 * real, and Phase 13 went to some trouble to make that distinction available.
 *
 * `isRestricted` is honoured by **omitting** the metric. §46 and §73: a
 * restricted metric is absent, not zero and not blurred.
 */
export function fromCommunityStatistics(statistics: CommunityStatistics): AdapterResult {
  const unmappedKeys: string[] = [];

  const metrics = statistics.metrics
    .map((metric): AnalyticsMetric | null => {
      if (metric.isRestricted) return null;

      const key = mapKey(COMMUNITY_KEY_MAP, metric.key);
      if (!key) {
        unmappedKeys.push(metric.key);
        return null;
      }

      return communityMetricToAnalytics(metric, key);
    })
    .filter((metric): metric is AnalyticsMetric => metric !== null);

  return { metrics, series: [], breakdowns: [], unmappedKeys };
}

function communityMetricToAnalytics(
  metric: CommunityMetric,
  key: AnalyticsMetricKey
): AnalyticsMetric {
  const definition = ANALYTICS_DEFINITIONS[key];

  return {
    key,
    label: definition.label,
    // Carried verbatim. Never upgraded — see the file header.
    value: metric.value as Sourced<number>,
    format: definition.format,
    computation: 'server-aggregate',
    money: null,
    higherIsBetter: definition.higherIsBetter,
    comparison: metric.changePercent
      ? comparisonFromPercent(percentToRatio(metric.changePercent.value))
      : null,
    freshness: metric.freshness,
    privacyClass: definition.privacyClass,
    unit: metric.unit ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12 — ORGANIZATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalises Phase 12's organization analytics.
 *
 * Phase 12 publishes five parallel time series and no headline metrics, so this
 * adapter produces both: the series verbatim, and a headline metric per series
 * derived from its **last point** rather than its sum.
 *
 * That choice is the interesting one. `memberGrowth` is a running membership
 * level, and summing thirty days of it would report thirty times the membership
 * — the classic stock-versus-flow error. `eventAttendance` and `donationTotals`
 * are genuinely flows and are summed. The distinction is per series and is stated
 * in `ORGANIZATION_STOCK_SERIES` rather than guessed from the name.
 */
const ORGANIZATION_STOCK_SERIES = new Set<AnalyticsMetricKey>([
  'reach.members',
  'content.engagementRate',
]);

export function fromOrganizationAnalytics(analytics: OrganizationAnalytics): AdapterResult {
  const freshness = freshnessFrom(
    analytics.computedAt,
    'Diaspora organization analytics',
    'Recomputed on a schedule by the organization analytics projection.'
  );

  const series: AnalyticsSeries[] = [];
  const metrics: AnalyticsMetric[] = [];

  for (const mapping of ORGANIZATION_SERIES_MAP) {
    const points = analytics[mapping.field] as { date: string; value: number }[] | undefined;
    if (!Array.isArray(points) || points.length === 0) continue;

    const definition = ANALYTICS_DEFINITIONS[mapping.key];

    series.push({
      key: mapping.key,
      label: definition.label,
      granularity: 'day',
      format: definition.format,
      points: points.map((point) => ({ at: point.date, value: point.value })),
      source: analytics.source,
      currency: null,
    });

    const isStock = ORGANIZATION_STOCK_SERIES.has(mapping.key);
    const value = isStock
      ? points[points.length - 1].value
      : points.reduce((total, point) => total + point.value, 0);

    metrics.push({
      key: mapping.key,
      label: definition.label,
      value: { value, source: analytics.source },
      format: definition.format,
      // The series is the server's; the period figure is this device's reduction
      // of it. §5 requires that distinction and this is exactly its case.
      computation: 'client-derived',
      money: null,
      higherIsBetter: definition.higherIsBetter,
      comparison: null,
      freshness,
      privacyClass: definition.privacyClass,
    });
  }

  return { metrics, series, breakdowns: [], unmappedKeys: [] };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 6 — MONETIZATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalises Phase 6's premium analytics.
 *
 * Phase 6's dataset is reached only once the `analytics.advanced` entitlement
 * resolves true — that gate is real, is a real subscription decision, and stays
 * exactly where it is. This adapter is called with the payload; it does not, and
 * must not, decide whether the member is entitled to it.
 *
 * `reportingLagHours` becomes a `limitations` line rather than being dropped: a
 * dashboard whose figures trail by eighteen hours and does not say so is §36's
 * failure, and Phase 6 already went to the trouble of publishing the number.
 */
export function fromPremiumAnalytics(
  premium: PremiumAnalytics,
  options: { source: DataSource; gapKey?: string }
): AdapterResult {
  const unmappedKeys: string[] = [];

  const freshness: DataFreshness = {
    computedAt: premium.periodEnd,
    sourceName: 'Diaspora business analytics',
    methodology: 'Aggregated by the monetization reporting projection.',
    limitations:
      premium.reportingLagHours > 0
        ? [
            `Figures can trail live activity by up to ${premium.reportingLagHours} hours.`,
          ]
        : undefined,
  };

  const metrics = premium.headline
    .map((metric): AnalyticsMetric | null => {
      const key = mapKey(MONETIZATION_KEY_MAP, metric.key);
      if (!key) {
        unmappedKeys.push(metric.key);
        return null;
      }

      const definition = ANALYTICS_DEFINITIONS[key];
      const value =
        definition.format === 'percentage' && metric.unit === 'percentage'
          ? metric.value / 100
          : metric.value;

      return {
        key,
        label: definition.label,
        value: {
          value,
          source: options.source,
          gapKey: options.source === 'simulated' ? options.gapKey : undefined,
        },
        format: definition.format,
        computation: 'server-aggregate',
        money: metric.money ?? null,
        higherIsBetter: definition.higherIsBetter,
        // Phase 6 publishes `changeRatio`, which is already a ratio — so it is
        // passed through rather than divided. The two neighbouring adapters
        // divide by a hundred and this one does not; that asymmetry is real and
        // is the reason `percentToRatio` is a named function used deliberately
        // rather than applied everywhere out of habit.
        comparison: comparisonFromPercent(metric.changeRatio ?? null),
        freshness,
        privacyClass: definition.privacyClass,
      };
    })
    .filter((metric): metric is AnalyticsMetric => metric !== null);

  const breakdowns: AnalyticsBreakdown[] = premium.breakdowns.map((breakdown) => ({
    metricKey: metrics[0]?.key ?? 'monetization.impressions',
    dimension: 'placement',
    label: breakdown.label,
    buckets: breakdown.buckets.map((bucket) => ({
      key: bucket.label,
      label: bucket.label,
      value: bucket.value,
      ratio: bucket.ratio,
      entity: null,
      comparison: null,
    })),
    total: breakdown.buckets.reduce((sum, bucket) => sum + bucket.value, 0),
    remainingBucketCount: 0,
    source: options.source,
  }));

  const series: AnalyticsSeries[] =
    premium.series.length > 0
      ? [
          // Phase 6's series carries `views` and `engagements`, not impressions
          // and clicks. Mapping `views → content.views` rather than to
          // `monetization.impressions` matters: a view of a promoted item is not
          // an impression of the placement, and labelling one as the other would
          // put a number under a definition it does not satisfy.
          {
            key: 'content.views',
            label: ANALYTICS_DEFINITIONS['content.views'].label,
            granularity: 'day',
            format: 'count',
            points: premium.series.map((point) => ({ at: point.date, value: point.views })),
            source: options.source,
            currency: null,
          },
          {
            key: 'content.engagementRate',
            label: ANALYTICS_DEFINITIONS['content.engagementRate'].label,
            granularity: 'day',
            format: 'count',
            points: premium.series.map((point) => ({ at: point.date, value: point.engagements })),
            source: options.source,
            currency: null,
          },
        ]
      : [];

  return { metrics, series, breakdowns, unmappedKeys };
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Merges adapter output and certified metrics into one dataset.
 *
 * The composition rule is the one that keeps §37 honest at dataset level:
 *
 *   Any `backend` metric present and any `simulated` metric present → `PARTIAL`.
 *   All `simulated` → `DEVELOPMENT_DATA`.
 *   All `backend` → `LIVE`.
 *   Nothing at all → `UNAVAILABLE`.
 *
 * Dataset freshness is the **oldest** of its parts, never the newest. A card
 * refreshed a minute ago sitting beside one computed last night makes the whole
 * screen as fresh as last night, and claiming otherwise is the specific way a
 * freshness indicator becomes a lie.
 *
 * Later metrics win on key collision, so a caller passing certified metrics after
 * adapter metrics gets the real figure — which is the direction that is always
 * safe. `mergeDatasets` documents that ordering because getting it backwards
 * would silently prefer a simulated number over a real one.
 */
export function composeDataset(input: {
  subject: AnalyticsSubject;
  range: AnalyticsTimeRange;
  comparison: AnalyticsDataset['comparison'];
  parts: AdapterResult[];
  /** Appended last, so real figures win on a key collision. */
  certifiedMetrics?: AnalyticsMetric[];
  unavailableMetrics?: AnalyticsMetricKey[];
  gapKey?: string | null;
  insights?: AnalyticsDataset['insights'];
  funnels?: AnalyticsDataset['funnels'];
  leaderboards?: AnalyticsDataset['leaderboards'];
  retention?: AnalyticsDataset['retention'];
}): AnalyticsDataset {
  const byKey = new Map<AnalyticsMetricKey, AnalyticsMetric>();

  for (const part of input.parts) {
    for (const metric of part.metrics) byKey.set(metric.key, metric);
  }
  for (const metric of input.certifiedMetrics ?? []) byKey.set(metric.key, metric);

  const metrics = [...byKey.values()];
  const series = input.parts.flatMap((part) => part.series);
  const breakdowns = input.parts.flatMap((part) => part.breakdowns);

  const hasBackend = metrics.some((metric) => metric.value.source === 'backend');
  const hasSimulated = metrics.some((metric) => metric.value.source === 'simulated');

  const status: AnalyticsDataset['status'] =
    metrics.length === 0
      ? 'UNAVAILABLE'
      : hasBackend && hasSimulated
        ? 'PARTIAL'
        : hasSimulated
          ? 'DEVELOPMENT_DATA'
          : 'LIVE';

  return {
    subject: input.subject,
    range: input.range,
    comparison: input.comparison,
    status,
    metrics,
    series,
    breakdowns,
    funnels: input.funnels ?? [],
    retention: input.retention ?? null,
    leaderboards: input.leaderboards ?? [],
    insights: input.insights ?? [],
    freshness: oldestFreshness(metrics),
    unavailableMetrics: input.unavailableMetrics ?? [],
    gapKey: input.gapKey ?? null,
    availableFilters: [],
  };
}

/**
 * The oldest freshness among a set of metrics.
 *
 * See `composeDataset`. Falls back to a stated-unknown rather than to `now` when
 * there is nothing to read — a dataset with no metrics has no freshness, and
 * stamping the current time on it would be the strongest possible claim about
 * data that does not exist.
 */
export function oldestFreshness(metrics: AnalyticsMetric[]): DataFreshness {
  if (metrics.length === 0) {
    return {
      computedAt: '',
      sourceName: 'Unknown',
      methodology: 'No figures were returned, so there is nothing to date.',
    };
  }

  return metrics.reduce((oldest, metric) =>
    metric.freshness.computedAt < oldest.freshness.computedAt ? metric : oldest
  ).freshness;
}
