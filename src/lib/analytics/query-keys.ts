// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics query keys (Frontend Phase 15, §52 · §53)
//
// Every analytics cache key in the application is built here. §53 requires a
// *proof* that Community A's analytics cannot appear under Community B, and a
// proof needs one place to reason about — forty screens each assembling an array
// literal is a property nobody can establish.
//
// ── The rule ─────────────────────────────────────────────────────────────────
//
// **Every dimension that changes the answer is in the key.** Subject type,
// subject id, the resolved date window, the timezone, the comparison basis, the
// granularity, the requested metric set, the requested breakdowns, the filters,
// and the community scope token. If two queries would return different data,
// they have different keys; if they would return the same data, they share one.
//
// The failure this prevents is specific and it is not hypothetical: a key of
// `['analytics', 'dataset', range]` would serve the Nigerian community's growth
// chart under the Ghanaian community after a switch, because the range did not
// change. The member would see a real chart, correctly rendered, about the wrong
// community, with nothing on screen to indicate it.
//
// ── Why one namespace rather than two ────────────────────────────────────────
//
// Phases 12 and 13 namespaced their simulated keys separately — `community-gap`,
// `community-directory-gap` — so a cache dump shows at a glance which entries are
// simulated. This phase deliberately does not, and the reason is a property of
// analytics rather than a change of mind:
//
// **A Phase 15 dataset is routinely hybrid.** The platform dashboard's inventory
// counts are real backend figures and its engagement metrics are simulated, in
// one object, from one query. A key root of `analytics-gap` would claim the whole
// entry is simulated and be wrong about half of it; a root of `analytics` with
// per-metric `Sourced` provenance is right about all of it.
//
// Provenance lives on the value here because it varies within the value. That is
// the same reasoning that put `Sourced<T>` at field level in Phase 12 rather than
// at screen level, applied one layer down.
//
// ── Normalisation ────────────────────────────────────────────────────────────
//
// Arrays are sorted and empties dropped before they enter a key, so a selection
// of `['GB','NG']` and `['NG','GB']` are one cache entry rather than two
// identical requests under two keys. Without that the cache silently doubles
// every time a filter chip is toggled off and on.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalyticsComparisonBasis,
  AnalyticsDimensionKey,
  AnalyticsExportFormat,
  AnalyticsFilter,
  AnalyticsGranularity,
  AnalyticsMetricKey,
  AnalyticsQuery,
  AnalyticsSubject,
  AnalyticsSubjectType,
} from '@/types/analytics';
import { rangeToken } from './time-range';

/**
 * The identity of a subject, as a key fragment.
 *
 * `self` for a subject with no id — the creator subject is self-scoped by route
 * design, so there is no id to carry and the literal makes that visible in a
 * cache dump rather than leaving an ambiguous `undefined` that could collide
 * with a genuinely missing id.
 */
export function subjectToken(subject: AnalyticsSubject): string {
  return `${subject.type}:${subject.id ?? 'self'}`;
}

/** A stable fragment for a metric selection. Sorted, so order cannot fork a key. */
function metricsToken(metrics: AnalyticsMetricKey[] | undefined): string {
  if (!metrics?.length) return 'headline';
  return [...metrics].sort().join(',');
}

/** A stable fragment for a breakdown selection. */
function breakdownsToken(dimensions: AnalyticsDimensionKey[] | undefined): string {
  if (!dimensions?.length) return 'none';
  return [...dimensions].sort().join(',');
}

/**
 * A stable fragment for a filter set.
 *
 * Both the dimensions and the values within each dimension are sorted, because
 * either being unordered would fork the key. Empty value lists are dropped
 * rather than encoded — a filter with nothing selected is not a filter, and
 * encoding it would make "cleared the filter" a different cache entry from
 * "never set the filter" while returning identical data.
 */
export function filtersToken(filters: AnalyticsFilter[] | undefined): string {
  if (!filters?.length) return 'none';

  const parts = filters
    .filter((filter) => filter.values.length > 0)
    .map((filter) => `${filter.dimension}=${[...filter.values].sort().join('+')}`)
    .sort();

  return parts.length ? parts.join(';') : 'none';
}

/**
 * Every key this phase uses.
 *
 * Flat rather than hierarchical helpers, following `financialKeys`,
 * `monetizationGapKeys` and `communityDirectoryGapKeys`, so invalidation by
 * prefix works the way the rest of the application expects.
 */
export const analyticsKeys = {
  all: ['analytics'] as const,

  /**
   * The server-evaluated capability set — GAP-025.
   *
   * Keyed by subject so a caller's capabilities for one community cannot be
   * served for another. Short stale time; see the hook.
   */
  access: (subject: AnalyticsSubject) =>
    ['analytics', 'access', subject.type, subject.id ?? 'self'] as const,

  /**
   * A dataset.
   *
   * The long one, and every fragment earns its place — see the header. Note that
   * `subject.type` and `subject.id` are **separate fragments** rather than one
   * combined token: it lets `queryClient.invalidateQueries({ queryKey:
   * ['analytics','dataset','community'] })` clear every community dataset without
   * touching creator datasets, which is what a community switch needs.
   */
  dataset: (query: AnalyticsQuery) =>
    [
      'analytics',
      'dataset',
      query.subject.type,
      query.subject.id ?? 'self',
      rangeToken(query.range),
      query.comparison ?? 'none',
      query.granularity ?? 'auto',
      metricsToken(query.metrics),
      breakdownsToken(query.breakdowns),
      filtersToken(query.filters),
      query.includeSeries ? 'series' : 'no-series',
      query.communityScopeToken ?? 'no-scope',
    ] as const,

  /** Every dataset for one subject type, for prefix invalidation. */
  datasetsForSubjectType: (type: AnalyticsSubjectType) =>
    ['analytics', 'dataset', type] as const,

  /** Every dataset for one specific subject. */
  datasetsForSubject: (subject: AnalyticsSubject) =>
    ['analytics', 'dataset', subject.type, subject.id ?? 'self'] as const,

  funnel: (
    funnelKey: string,
    subject: AnalyticsSubject,
    range: AnalyticsQuery['range'],
    filters?: AnalyticsFilter[]
  ) =>
    [
      'analytics',
      'funnel',
      funnelKey,
      subject.type,
      subject.id ?? 'self',
      rangeToken(range),
      filtersToken(filters),
    ] as const,

  retention: (
    subject: AnalyticsSubject,
    range: AnalyticsQuery['range'],
    granularity: AnalyticsGranularity,
    cohortCount: number
  ) =>
    [
      'analytics',
      'retention',
      subject.type,
      subject.id ?? 'self',
      rangeToken(range),
      granularity,
      cohortCount,
    ] as const,

  leaderboard: (
    leaderboardKey: string,
    subject: AnalyticsSubject,
    range: AnalyticsQuery['range'],
    metricKey: AnalyticsMetricKey
  ) =>
    [
      'analytics',
      'leaderboard',
      leaderboardKey,
      subject.type,
      subject.id ?? 'self',
      rangeToken(range),
      metricKey,
    ] as const,

  /**
   * Live inventory counts — GAP-024, the connected family.
   *
   * Keyed by scope and scope id. Separate from `dataset` because it is answered
   * by the *certified* arm and has a different stale time: a count of open jobs
   * is live, and giving it the dataset's five-minute stale time would make a real
   * number look like a nightly rollup.
   */
  inventory: (scope: AnalyticsSubjectType, scopeId: string | null | undefined) =>
    ['analytics', 'inventory', scope, scopeId ?? 'self'] as const,

  /** The metric catalogue — GAP-030. Reference data. */
  definitions: () => ['analytics', 'definitions'] as const,

  /** Saved reports — GAP-027. */
  reports: (scope: 'mine' | 'shared' | 'favorites') => ['analytics', 'reports', scope] as const,
  report: (reportId: string) => ['analytics', 'report', reportId] as const,

  /** Export jobs — GAP-026. */
  exports: () => ['analytics', 'exports'] as const,
  exportJob: (exportId: string) => ['analytics', 'export', exportId] as const,

  /** Insights — GAP-028. */
  insights: (subject: AnalyticsSubject, range: AnalyticsQuery['range']) =>
    ['analytics', 'insights', subject.type, subject.id ?? 'self', rangeToken(range)] as const,
};

/**
 * Everything invalidated when the active community changes.
 *
 * A named list rather than `queryClient.clear()`, for the reason Phase 13's §61
 * gives: clearing the cache throws away the member's wallet, their conversations
 * and every list they had loaded, to fix a problem confined to community-scoped
 * analytics. It also makes the switch feel like a cold start.
 *
 * Community-scoped analytics is the only thing here whose *answer* changes, and
 * because the scope token is already in the dataset key, even this is belt and
 * braces: the previous community's entries remain addressable under their own
 * keys and are simply not read. The invalidation exists so a stale entry is
 * refetched rather than shown, not to prevent a collision — the key prevents the
 * collision.
 */
export function analyticsKeysInvalidatedByCommunitySwitch(): readonly (readonly unknown[])[] {
  return [
    ['analytics', 'dataset', 'community'],
    ['analytics', 'dataset', 'country'],
    ['analytics', 'dataset', 'neighborhood'],
    ['analytics', 'dataset', 'platform'],
    ['analytics', 'access'],
    ['analytics', 'insights'],
    ['analytics', 'inventory'],
  ];
}

/**
 * Everything invalidated on sign-out.
 *
 * The whole root. Analytics is the one domain where *every* cached entry is
 * either the member's own data or something they were authorized to see, so
 * leaving any of it addressable after a sign-out would be wrong — and unlike the
 * community switch there is no cost to being total, because the next member
 * starts cold anyway.
 */
export function analyticsKeysInvalidatedBySignOut(): readonly (readonly unknown[])[] {
  return [['analytics']];
}
