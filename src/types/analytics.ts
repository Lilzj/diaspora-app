// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics domain model (Frontend Phase 15, §3)
//
// One model for every dashboard in the application.
//
// ── What the audit found, and why this file exists ───────────────────────────
//
// Four analytics surfaces already shipped, and each brought its own vocabulary:
//
//   Phase 6   `PerformanceMetric` + `AnalyticsBreakdown`   monetization/analytics
//   Phase 7   `CreatorMetric` + `CreatorMetricSeries`      creator/analytics
//   Phase 12  `TimeSeriesPoint` + `OrganizationAnalytics`  community-life dashboard
//   Phase 13  `CommunityMetric` + `StatisticsPeriod`       community statistics
//
// Three metric types, three period types, three series types and three chart
// implementations, none of which can be shown beside another. §3 asks for a
// generic model rather than dozens of unrelated metric types, and §35 asks that
// two dashboards never disagree about what a word means. Both are the same
// problem: the vocabulary was per-feature, so the meaning was too.
//
// This file is the shared vocabulary. The four existing shapes are **adapted
// into it** by `lib/analytics/adapters.ts` rather than replaced — those screens
// work, are tested, and rewriting them would risk a regression to gain nothing
// a normaliser cannot.
//
// ── Three conventions run through the model ──────────────────────────────────
//
//   **Provenance and computation are separate axes (§5).** `Sourced<T>` already
//   exists and already says *who produced a value* — `backend` or `simulated`.
//   It does not say *how it was arrived at*, and §5 requires both: a wallet
//   total the client summed from real transactions is backend-sourced and
//   client-computed, and presenting it as a server aggregate would be a lie of a
//   different kind than presenting a simulated figure as real. So every metric
//   carries `value: Sourced<number>` **and** `computation`. A fourth provenance
//   vocabulary would have been the duplication §3 forbids; a second axis is not
//   the same thing.
//
//   **Freshness is part of the value, not decoration (§36).** `DataFreshness`
//   already exists in `types/maps` and is already required on every geographic
//   intelligence figure. Analytics reuses it unchanged. A dataset that cannot be
//   constructed without saying when it was computed and who computed it is how
//   §36 stops being a matter of somebody remembering.
//
//   **A metric key is a reference into a catalogue, not a label.** `metricKey`
//   is a closed union, and `lib/analytics/definitions.ts` has one entry per
//   member. That is the enforcement behind §35: two dashboards cannot define
//   "active user" differently, because neither of them defines it at all.
//
// ── What is deliberately absent ──────────────────────────────────────────────
//
// **No user identifier anywhere in this file.** Not on a metric, not on a
// breakdown bucket, not on a funnel step, not on a leaderboard row. §47 forbids
// exposing personally identifiable information through aggregate analytics, and
// the enforcement is that there is no field to put it in. `AnalyticsEntityRef`
// names *things* — a listing, a job, a guide — and the one place a person can
// appear, `AnalyticsLeaderboardRow`, carries a display name the server chose to
// publish and nothing else.
//
// **No scoring, ranking or relevance computation.** §25 forbids the frontend
// implementing recommendation scoring, and §30 forbids computing a winner
// between communities. There is no `score`, no `rank` the client may assign and
// no composite index in this model. `AnalyticsLeaderboardRow.position` is the
// server's ordering, echoed.
//
// **No raw money.** Financial analytics carries `Money` from `types/financial`,
// which is minor-units-and-currency and never a bare number. §57 forbids
// assuming a currency and this is where that starts.
// ─────────────────────────────────────────────────────────────────────────────

import type { DataSource, Sourced } from './community-advanced';
import type { Money } from './financial';
import type { DataFreshness } from './maps';

export type { DataFreshness, DataSource, Sourced };

// ═════════════════════════════════════════════════════════════════════════════
// SUBJECT — WHAT THE ANALYTICS IS ABOUT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The kinds of thing that can have analytics.
 *
 * §65's warning is encoded here: `country` and `community` are **separate
 * members**, and no code path converts one into the other. A community may have
 * a country of origin, several, or none — a regional community has one per
 * member state and an interest community has none — and the platform already
 * paid for conflating them once (Phase 13, GAP-009). A union with both members
 * makes the mistake a type error rather than a review comment.
 */
export type AnalyticsSubjectType =
  /** The whole platform. Administrative. */
  | 'platform'
  /** One country, by ISO code. Not a community. */
  | 'country'
  /** One community, by community id. Not a country. */
  | 'community'
  /** One neighbourhood, by neighbourhood id. */
  | 'neighborhood'
  /** One creator, always the caller. There is no "another creator" subject. */
  | 'creator'
  /** One service provider profile. */
  | 'provider'
  /** One employer/recruiter account. */
  | 'employer'
  /** One job posting. */
  | 'job'
  /** One marketplace seller account. */
  | 'seller'
  /** One marketplace listing. */
  | 'listing'
  /** One landlord/host account. */
  | 'landlord'
  /** One housing listing. */
  | 'housing'
  /** One organization. */
  | 'organization'
  /** One guide. */
  | 'guide'
  /** One event. */
  | 'event'
  /** One community update. */
  | 'update'
  /** One paid campaign or placement. */
  | 'campaign';

/**
 * Which thing, exactly.
 *
 * `id` is absent only for `platform`, which has exactly one instance. Everything
 * else is addressed, and the id travels into the query key — which is what makes
 * §53's cache-isolation property hold rather than being asserted.
 */
export interface AnalyticsSubject {
  type: AnalyticsSubjectType;
  /** Absent for `platform`. Required for everything else. */
  id?: string | null;
  /** For display only. Never used to fetch, never used in a key. */
  label?: string | null;
}

/**
 * A thing an analytics row can point at.
 *
 * Used by leaderboards, top-content lists and breakdown drill-downs. Carries a
 * route so the UI can navigate without a per-domain switch statement in every
 * screen, and carries no owner, no author id and no contact detail.
 */
export interface AnalyticsEntityRef {
  entityType: AnalyticsSubjectType | (string & {});
  entityId: string;
  title: string;
  /** An in-app path. Absent where the platform has no screen for it. */
  route?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// TIME — §6, §58
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §6's ranges, in full, plus `custom`.
 *
 * All eleven are modelled even where no backend supports them, which is §6's
 * explicit instruction: "the frontend should gracefully support future ranges
 * even if backend support is currently missing". Which ranges a given subject
 * actually offers is a *capability* — see `AnalyticsAccess.supportedRanges` —
 * rather than a fact about this union, so a deployment that gains 90-day
 * retention needs no client release.
 */
export type AnalyticsRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7d'
  | 'last30d'
  | 'last90d'
  | 'thisMonth'
  | 'previousMonth'
  | 'thisYear'
  | 'previousYear'
  | 'allTime'
  | 'custom';

/**
 * A resolved range.
 *
 * **`from` and `to` are date-only strings, `YYYY-MM-DD`, and `timezone` is
 * required.** That combination is deliberate and it is §58.
 *
 * An instant — `2026-08-08T00:00:00Z` — silently means a different day in
 * Auckland than in Los Angeles, so a dashboard built on instants shows a
 * different "today" depending on where the device is, while claiming to show the
 * platform's today. Sending a calendar date plus the timezone the *report* is
 * computed in moves that decision to the one place that can make it correctly.
 *
 * `timezone` is an IANA name and comes from the backend's stated reporting
 * timezone where it publishes one, falling back to the device's — and the UI
 * says which, because §58 forbids silently using the device's.
 */
export interface AnalyticsTimeRange {
  preset: AnalyticsRangePreset;
  /** Inclusive. `YYYY-MM-DD`. */
  from: string;
  /** Inclusive. `YYYY-MM-DD`. */
  to: string;
  /** IANA zone the buckets are cut in. Never assumed, always stated. */
  timezone: string;
  /** True where `timezone` is the device's rather than the platform's. */
  isDeviceTimezone: boolean;
}

/** How finely a series is bucketed. Chosen by range length, capped by contract. */
export type AnalyticsGranularity = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

// ═════════════════════════════════════════════════════════════════════════════
// COMPARISON — §7
// ═════════════════════════════════════════════════════════════════════════════

/** §7's baselines. */
export type AnalyticsComparisonBasis =
  | 'none'
  | 'previousPeriod'
  | 'previousMonth'
  | 'previousYear'
  | 'custom'
  | 'platformAverage'
  | 'communityAverage'
  | 'countryAverage';

/**
 * Why a comparison could not be made.
 *
 * §7 forbids showing a misleading percentage change when there is no valid
 * baseline, and this is how that is expressed rather than by rendering `0%`.
 * A dashboard reading "+0%" and a dashboard reading "Not enough history" are
 * two different claims and only one of them is true.
 */
export type AnalyticsComparisonUnavailableReason =
  /** The subject did not exist for the whole baseline period. */
  | 'insufficientHistory'
  /** The baseline period had no activity at all, so a ratio is undefined. */
  | 'zeroBaseline'
  /** The backend does not compute this baseline for this metric. */
  | 'unsupported'
  /** Suppressed because the baseline population was too small (§47). */
  | 'suppressed';

/**
 * A change against a baseline.
 *
 * `changePercent` is nullable and `unavailableReason` explains every null. A
 * component that renders a comparison must handle both arms, and the type is
 * what forces it to.
 */
export interface AnalyticsComparison {
  basis: AnalyticsComparisonBasis;
  /** The baseline window, so the UI can say what it is being compared to. */
  baselineFrom?: string | null;
  baselineTo?: string | null;
  /** The baseline value. Absent where the backend publishes only the delta. */
  baselineValue?: number | null;
  /** Signed. Null where no valid comparison exists — see `unavailableReason`. */
  changePercent: number | null;
  /** Signed absolute change. Null for the same reasons. */
  changeAbsolute?: number | null;
  unavailableReason?: AnalyticsComparisonUnavailableReason | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS AND PROVENANCE — §5, §36, §37
// ═════════════════════════════════════════════════════════════════════════════

/** §37's states, verbatim. */
export type AnalyticsDataStatus =
  /** Computed within the freshness window the contract promises. */
  | 'LIVE'
  /** Some requested metrics answered and some did not. */
  | 'PARTIAL'
  /** Modelled rather than counted. The contract says so. */
  | 'ESTIMATED'
  /** Served from the client cache while a refetch is in flight. */
  | 'CACHED'
  /** Served from cache past its validity, usually offline. §54. */
  | 'STALE'
  /** The backend answered that it cannot produce this. */
  | 'UNAVAILABLE'
  /** The development provider answered. §38, §59. */
  | 'DEVELOPMENT_DATA'
  /** No contract exists at all. §61. */
  | 'BACKEND_GAP';

/**
 * How a number was arrived at — the second axis §5 requires.
 *
 * Orthogonal to `Sourced.source`, which says *who* produced it. A wallet total
 * summed by the client from real B15 transactions is `backend`-sourced and
 * `client-derived`; a simulated engagement rate is `simulated`-sourced and
 * `server-aggregate` in shape. Collapsing the two would make one of those
 * unrepresentable.
 */
export type AnalyticsComputation =
  /** The server aggregated it. The only kind that is authoritative. */
  | 'server-aggregate'
  /** The client computed it from records it already had. §5. */
  | 'client-derived'
  /** The server modelled rather than counted it. §5, §37. */
  | 'estimated';

/** How a figure should be rendered. Drives formatting, never meaning. */
export type AnalyticsMetricFormat =
  | 'count'
  | 'percentage'
  | 'ratio'
  | 'currency'
  | 'duration'
  | 'rate'
  | 'score';

/**
 * How sensitive a metric is, so a screen cannot render one it should not.
 *
 * §47's classification, carried on the metric rather than decided per screen.
 * `restricted` metrics are omitted from a response for a caller without the
 * capability rather than nulled — see `AnalyticsAccess`.
 */
export type AnalyticsPrivacyClass =
  /** Safe to show to anybody who can see the subject. */
  | 'public'
  /** The subject's own operator only — a creator's own reach. */
  | 'owner'
  /** A moderator, ambassador or organization admin. */
  | 'privileged'
  /** Platform administrators. */
  | 'administrative'
  /** Money. Owner or platform administration, never a third party. */
  | 'financial';

// ═════════════════════════════════════════════════════════════════════════════
// METRIC KEYS — §35, §63
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Every metric the platform has a definition for.
 *
 * A closed union, and `ANALYTICS_DEFINITIONS` in `lib/analytics/definitions.ts`
 * has one entry per member — a compile error if one is missing. That is the
 * whole of §35's enforcement: a screen cannot show a number the platform has not
 * defined, because there is no key for it.
 *
 * Names are `domain.thing.measure`, lower-case dotted, matching the event
 * taxonomy's convention so a metric and the event that feeds it sort together.
 */
export type AnalyticsMetricKey =
  // ── Audience and engagement — §34 ──────────────────────────────────────────
  | 'audience.users.total'
  | 'audience.users.new'
  | 'audience.users.active.daily'
  | 'audience.users.active.weekly'
  | 'audience.users.active.monthly'
  | 'audience.users.returning'
  | 'audience.sessions.count'
  | 'audience.sessions.duration.median'
  | 'audience.stickiness.dau_mau'
  // ── Growth — §10 ───────────────────────────────────────────────────────────
  | 'growth.members.net'
  | 'growth.members.rate'
  | 'growth.communities.new'
  | 'growth.content.new'
  | 'growth.providers.new'
  | 'growth.organizations.new'
  | 'growth.creators.new'
  | 'growth.listings.new'
  | 'growth.jobs.new'
  | 'growth.housing.new'
  // ── Retention — §33 ────────────────────────────────────────────────────────
  | 'retention.day1'
  | 'retention.day7'
  | 'retention.day30'
  | 'retention.weekly'
  | 'retention.monthly'
  | 'retention.churn'
  // ── Content reach — §15, §22, §23, §24 ─────────────────────────────────────
  | 'content.impressions'
  | 'content.views'
  | 'content.reach'
  | 'content.uniqueViewers'
  | 'content.saves'
  | 'content.enquiries'
  | 'content.shares'
  | 'content.comments'
  /**
   * Added when `GET /api/v1/analytics/content/{type}/{id}` was read from source.
   *
   * The platform serves it on every content item — it is in
   * `AnalyticsMetricCatalog.ContentItem`, it is `Available`, and it counts a
   * *specific* reaction rather than reactions in general. The client had no key
   * for it, so the certified arm would have had to drop a real, measured figure
   * on the floor of every per-item dashboard. A union member is cheaper than
   * silently losing a number the backend already knows.
   */
  | 'content.helpfulVotes'
  | 'content.engagementRate'
  | 'content.completionRate'
  | 'content.published'
  // ── Discovery — §26, §25, §27 ──────────────────────────────────────────────
  | 'search.volume'
  | 'search.noResultRate'
  | 'search.clickThroughRate'
  | 'search.toActionRate'
  | 'search.appearances'
  | 'recommendation.impressions'
  | 'recommendation.clicks'
  | 'recommendation.clickThroughRate'
  | 'recommendation.saves'
  | 'recommendation.dismissals'
  | 'recommendation.conversions'
  | 'map.opens'
  | 'map.markerInteractions'
  | 'map.locationSearches'
  | 'map.routeRequests'
  | 'map.filterUses'
  // ── Relationship and reach — §12, §65 ──────────────────────────────────────
  | 'reach.followers'
  | 'reach.members'
  | 'reach.communities'
  | 'reach.crossCommunity'
  | 'reach.countries'
  // ── Marketplace, jobs, housing, providers — §17–§20 ────────────────────────
  | 'listing.contacts'
  | 'listing.offers'
  | 'listing.reservations'
  | 'listing.sales'
  | 'job.applications'
  | 'job.shortlisted'
  | 'job.interviewed'
  | 'job.hired'
  | 'job.applicationRate'
  | 'housing.inquiries'
  | 'housing.applications'
  | 'provider.profileViews'
  | 'provider.contactActions'
  | 'provider.leads'
  | 'provider.reviews'
  | 'provider.ratingAverage'
  // ── Events and organizations — §21, §23 ────────────────────────────────────
  | 'event.rsvps'
  | 'event.attendance'
  | 'event.attendanceRate'
  | 'organization.followers'
  | 'organization.announcementReach'
  // ── Conversion — §32 ───────────────────────────────────────────────────────
  | 'conversion.rate'
  | 'conversion.count'
  | 'funnel.dropOffRate'
  // ── Money — §16, §30, §31 ──────────────────────────────────────────────────
  | 'revenue.gross'
  | 'revenue.net'
  | 'revenue.pending'
  | 'revenue.available'
  | 'revenue.paid'
  | 'revenue.refunded'
  | 'revenue.perThousandImpressions'
  | 'spend.total'
  | 'wallet.deposits'
  | 'wallet.withdrawals'
  | 'wallet.transactions'
  | 'wallet.donations'
  | 'wallet.contributions'
  | 'rewards.pointsEarned'
  | 'rewards.pointsRedeemed'
  | 'monetization.impressions'
  | 'monetization.clicks'
  | 'monetization.conversions'
  | 'monetization.activeSubscriptions'
  | 'monetization.featuredPlacements'
  // ── Communication — §28, §29 ───────────────────────────────────────────────
  | 'notification.delivered'
  | 'notification.opened'
  | 'notification.dismissed'
  | 'notification.actioned'
  | 'notification.readRate'
  | 'notification.actionRate'
  | 'messaging.conversationsStarted'
  | 'messaging.messagesSent'
  | 'messaging.responseRate'
  | 'messaging.unreadRate'
  // ── Platform inventory — §9 ────────────────────────────────────────────────
  | 'inventory.guides'
  | 'inventory.jobs'
  | 'inventory.listings'
  | 'inventory.housing'
  | 'inventory.providers'
  | 'inventory.organizations'
  | 'inventory.events'
  | 'inventory.updates'
  | 'inventory.communities';

// ═════════════════════════════════════════════════════════════════════════════
// METRIC — §3
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One number, with everything needed to render it honestly.
 *
 * Long, and every field earns its place:
 *
 *   `value` is `Sourced` — §38 forbids silently turning a backend gap into a
 *   production number, and a bare number has nowhere to record that it was not
 *   one.
 *
 *   `computation` is §5's second axis. See `AnalyticsComputation`.
 *
 *   `freshness` is required, not optional. §36 asks every dashboard to
 *   communicate freshness, and an optional field is one somebody forgets.
 *
 *   `comparison` is nullable *and* carries its own reason for being null, so
 *   §7's "insufficient data" is representable rather than rendered as zero.
 *
 *   `money` is present when `format` is `currency` and carries the currency with
 *   it. §57: never assume USD, NGN or anything else.
 */
export interface AnalyticsMetric {
  key: AnalyticsMetricKey;
  /** The catalogue's label, echoed so a list need not re-look-it-up to render. */
  label: string;
  value: Sourced<number>;
  format: AnalyticsMetricFormat;
  computation: AnalyticsComputation;
  /** Present when `format` is `currency`. The authority on the currency. */
  money?: Money | null;
  /** Whether an increase is good. Not every metric is — churn is not. */
  higherIsBetter: boolean;
  comparison?: AnalyticsComparison | null;
  freshness: DataFreshness;
  privacyClass: AnalyticsPrivacyClass;
  /**
   * Suppressed because the underlying population was too small to publish.
   *
   * §47: a count over three people is three people's behaviour. A suppressed
   * metric renders as "too few to report" and `value.value` is meaningless —
   * the UI must check this before rendering the number.
   */
  isSuppressed?: boolean;
  /** Unit for a duration or a rate — "minutes", "per week". Never a currency. */
  unit?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// SERIES, BREAKDOWN, FUNNEL, RETENTION
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsPoint {
  /** Bucket start. `YYYY-MM-DD` for day and coarser; ISO instant for `hour`. */
  at: string;
  value: number;
  /** The comparison period's value at the same offset, where one exists. */
  baselineValue?: number | null;
  /** True where the bucket is incomplete — today, or a partial month. */
  isPartialBucket?: boolean;
}

/**
 * One line on a chart.
 *
 * `granularity` is on the series rather than the dataset because a summary can
 * legitimately hold a daily reach series beside a monthly revenue series, and
 * an axis that assumed one would mislabel the other.
 */
export interface AnalyticsSeries {
  key: AnalyticsMetricKey;
  label: string;
  granularity: AnalyticsGranularity;
  format: AnalyticsMetricFormat;
  points: AnalyticsPoint[];
  source: DataSource;
  /** Present when `format` is `currency` — the currency the values are in. */
  currency?: string | null;
}

/** A dimension a metric can be split by. §8. */
export type AnalyticsDimensionKey =
  | 'date'
  | 'country'
  | 'community'
  | 'neighborhood'
  | 'category'
  | 'contentType'
  | 'source'
  | 'surface'
  | 'placement'
  | 'plan'
  | 'status'
  | 'language'
  | 'platform';

export interface AnalyticsBucket {
  /** Stable key for the bucket — a country code, a category slug. */
  key: string;
  label: string;
  value: number;
  /** Share of the breakdown total, 0–1. Server-computed where possible. */
  ratio?: number | null;
  /** Where the bucket points at a thing the member can open. */
  entity?: AnalyticsEntityRef | null;
  comparison?: AnalyticsComparison | null;
}

export interface AnalyticsBreakdown {
  metricKey: AnalyticsMetricKey;
  dimension: AnalyticsDimensionKey;
  label: string;
  buckets: AnalyticsBucket[];
  /** Sum of every bucket including those not returned. Never guessed. */
  total?: number | null;
  /** How many buckets exist beyond those returned, for "and N more". */
  remainingBucketCount?: number | null;
  source: DataSource;
}

/**
 * One step of a funnel. §32.
 *
 * `count` is the population that reached this step, not the population that left
 * it. `conversionFromPrevious` and `dropOffFromPrevious` are supplied by the
 * server where it computes them; the client may compute them from adjacent
 * counts, and when it does the funnel's `computation` says `client-derived`.
 */
export interface AnalyticsFunnelStep {
  key: string;
  label: string;
  count: number;
  /** 0–1 against the previous step. Null on the first step. */
  conversionFromPrevious?: number | null;
  /** 0–1 against the first step. */
  conversionFromStart?: number | null;
  dropOffFromPrevious?: number | null;
}

export interface AnalyticsFunnel {
  key: string;
  label: string;
  steps: AnalyticsFunnelStep[];
  range: AnalyticsTimeRange;
  source: DataSource;
  computation: AnalyticsComputation;
  freshness: DataFreshness;
}

/**
 * One retention cohort. §33.
 *
 * `cohortDate` and `measurementWindow` are both required because §33 says the UI
 * must clearly identify them, and a cohort table without them is a grid of
 * percentages that could mean anything.
 */
export interface AnalyticsRetentionCohort {
  /** `YYYY-MM-DD` — the day or week the cohort was acquired. */
  cohortDate: string;
  cohortSize: number;
  /** Retention at each offset, 0–1. Index 0 is the acquisition period. */
  values: (number | null)[];
  /** True where the cohort has not yet aged into the later offsets. */
  isIncomplete: boolean;
}

export interface AnalyticsRetentionTable {
  granularity: Extract<AnalyticsGranularity, 'day' | 'week' | 'month'>;
  /** Labels for each offset column — "Day 0", "Day 1", … */
  offsetLabels: string[];
  /** What "retained" counts as, in the platform's own words. Never invented. */
  measurementWindow: string;
  cohorts: AnalyticsRetentionCohort[];
  source: DataSource;
  freshness: DataFreshness;
}

/**
 * A leaderboard row.
 *
 * The one place a person can appear in this model. Carries a display name the
 * server chose to publish and a value, and nothing else — no handle, no id that
 * resolves to an account, no location. §47.
 */
export interface AnalyticsLeaderboardRow {
  /** The server's ordering, echoed. The client never sorts a leaderboard. */
  position: number;
  entity: AnalyticsEntityRef;
  value: number;
  format: AnalyticsMetricFormat;
  /** Secondary figure — "1,204 views · 12% engagement". */
  secondaryValue?: number | null;
  secondaryFormat?: AnalyticsMetricFormat | null;
  secondaryLabel?: string | null;
  comparison?: AnalyticsComparison | null;
}

export interface AnalyticsLeaderboard {
  key: string;
  label: string;
  metricKey: AnalyticsMetricKey;
  rows: AnalyticsLeaderboardRow[];
  nextCursor?: string | null;
  hasMore: boolean;
  source: DataSource;
}

/**
 * A short statement the *platform* made about the data.
 *
 * Never generated by the client. §25 forbids the frontend implementing scoring
 * and this is the same rule applied to narrative: "your Tuesday posts do better"
 * is a claim, and a client that invented it would be inventing an analysis
 * nobody could reproduce. Where the backend publishes none, the section is
 * absent rather than filled.
 */
export interface AnalyticsInsight {
  key: string;
  headline: string;
  detail?: string | null;
  /** `positive`, `negative`, `neutral`. Never the only signal — §55. */
  tone: 'positive' | 'negative' | 'neutral';
  /** What the member could do about it, where the platform suggests one. */
  action?: { label: string; route: string } | null;
  source: DataSource;
}

// ═════════════════════════════════════════════════════════════════════════════
// FILTERS — §8
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One applied filter.
 *
 * Values are always an array even for a single selection, so the query
 * normaliser has one shape to sort and the cache key has one shape to hash.
 */
export interface AnalyticsFilter {
  dimension: AnalyticsDimensionKey;
  values: string[];
}

/** An option the filter bar can offer, as the backend describes it. */
export interface AnalyticsFilterOption {
  key: string;
  label: string;
  /** How many results carry this value, where the backend publishes facets. */
  count?: number | null;
}

export interface AnalyticsFilterDefinition {
  dimension: AnalyticsDimensionKey;
  label: string;
  options: AnalyticsFilterOption[];
  isMultiSelect: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// QUERY AND DATASET — §3, §4
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What a screen asks for.
 *
 * The single request shape for every dashboard in the application. A screen
 * builds one of these; the repository decides whether a certified contract, an
 * existing phase's contract or the development provider answers it. §4: the
 * screen cannot tell, and must not be able to.
 */
export interface AnalyticsQuery {
  subject: AnalyticsSubject;
  /** Which metrics. Empty means "the subject's headline set". */
  metrics?: AnalyticsMetricKey[];
  range: AnalyticsTimeRange;
  granularity?: AnalyticsGranularity;
  comparison?: AnalyticsComparisonBasis;
  filters?: AnalyticsFilter[];
  /** Which breakdowns to include. Omitted means none — §51, fetch narrowly. */
  breakdowns?: AnalyticsDimensionKey[];
  /** Include the time series. Off by default: a summary is cheaper. */
  includeSeries?: boolean;
  /**
   * The community scope this request is made under, as a resolved token.
   *
   * Produced by `communityScopeToken()` in `lib/community/scope.ts` — the
   * platform's existing scope resolver, reused rather than reimplemented. It is
   * on the *query* rather than only on the key because §65 requires community
   * and country to stay distinct dimensions, and a scope that travelled only in
   * the cache key would be invisible to the request.
   */
  communityScopeToken?: string | null;
}

/**
 * Everything a dashboard renders, in one object.
 *
 * `status` and `freshness` are dataset-level and `AnalyticsMetric` carries its
 * own of each, deliberately: a dataset can be `PARTIAL` because two of eight
 * metrics are `BACKEND_GAP`, and flattening that to one status would either
 * mark six real numbers as simulated or six simulated ones as real. §37's last
 * line is the reason.
 */
export interface AnalyticsDataset {
  subject: AnalyticsSubject;
  range: AnalyticsTimeRange;
  comparison: AnalyticsComparisonBasis;
  status: AnalyticsDataStatus;
  metrics: AnalyticsMetric[];
  series: AnalyticsSeries[];
  breakdowns: AnalyticsBreakdown[];
  funnels: AnalyticsFunnel[];
  retention?: AnalyticsRetentionTable | null;
  leaderboards: AnalyticsLeaderboard[];
  insights: AnalyticsInsight[];
  /** Dataset-level freshness — the *oldest* of its parts, never the newest. */
  freshness: DataFreshness;
  /** Metric keys that were asked for and could not be answered. §73. */
  unavailableMetrics: AnalyticsMetricKey[];
  /** The gap register key when `status` is `BACKEND_GAP` or `DEVELOPMENT_DATA`. */
  gapKey?: string | null;
  /** Filters the backend says this subject supports. Drives the filter bar. */
  availableFilters?: AnalyticsFilterDefinition[];
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — §46, §48
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the **server** says this caller may see for this subject.
 *
 * Every field is filled in by the backend. `lib/analytics/access.ts` contains no
 * code path that derives a capability from a role held on the device, for the
 * same reason Phase 13's `CommunityCapabilities` does not: §48 says never trust
 * frontend role state, and a client that computed `canViewAdministrative` from
 * `user.role === 'admin'` would be exactly that.
 *
 * A caller with no access gets an all-false set rather than a 403, so a screen
 * renders "not available to you" rather than an error — and, critically, so the
 * existence of an administrative dashboard is not confirmed by the error code.
 */
export interface AnalyticsAccess {
  subject: AnalyticsSubject;
  canView: boolean;
  /** Money. Separately gated from everything else — §47, §30. */
  canViewFinancial: boolean;
  /** Platform-wide figures. Administrative only. */
  canViewAdministrative: boolean;
  /** Whether this caller may compare this subject against others. §13. */
  canCompare: boolean;
  canExport: boolean;
  canBuildReports: boolean;
  /** Which ranges the backend will actually answer for this subject. §6. */
  supportedRanges: AnalyticsRangePreset[];
  /** Which comparison baselines are computable for this subject. §7. */
  supportedComparisons: AnalyticsComparisonBasis[];
  /** Metric keys withheld from this caller, so the UI omits rather than nulls. */
  restrictedMetrics: AnalyticsMetricKey[];
  /**
   * The backend's stated reporting timezone. §58.
   *
   * Null where the deployment publishes none, in which case the client uses the
   * device's and says so — it does not silently pretend the two are the same.
   */
  reportingTimezone?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORTS AND EXPORT — §43, §44, §45
// ═════════════════════════════════════════════════════════════════════════════

export type AnalyticsVisualization =
  | 'metricCards'
  | 'line'
  | 'bar'
  | 'area'
  | 'donut'
  | 'funnel'
  | 'table'
  | 'leaderboard';

/** A saved report configuration. §44, §45. */
export interface AnalyticsReport {
  reportId: string;
  name: string;
  description?: string | null;
  query: AnalyticsQuery;
  visualization: AnalyticsVisualization;
  /** Whose report it is. An opaque id, compared but never displayed. §47. */
  ownerId: string;
  /** Whether the caller owns it — the server's answer, not a comparison here. */
  isOwnedByCaller: boolean;
  isFavorite: boolean;
  /** Who else can see it, as the server describes it. */
  sharing: 'private' | 'community' | 'organization' | 'platform';
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
}

export type AnalyticsExportFormat = 'csv' | 'pdf' | 'json';

/**
 * An export job.
 *
 * Asynchronous by design, and §43 is the reason: "do not attempt to download
 * massive datasets directly from the client". The client requests an export,
 * polls a job, and receives a URL the platform generated — it never assembles a
 * year of daily rows in memory to write a file.
 */
export interface AnalyticsExport {
  exportId: string;
  format: AnalyticsExportFormat;
  status: 'queued' | 'running' | 'ready' | 'failed' | 'expired';
  query: AnalyticsQuery;
  requestedAt: string;
  completedAt?: string | null;
  /** Short-lived, server-signed. Absent until `ready`. */
  downloadUrl?: string | null;
  /** Bytes, where known, so the UI can warn before a large download. */
  sizeBytes?: number | null;
  /** Verbatim from the server when `failed`. Never invented. */
  failureReason?: string | null;
  expiresAt?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// CATALOGUE — §35, §63
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One entry in the metric catalogue.
 *
 * §63's artifact, as data rather than only as a markdown table, so the app can
 * show a member the definition of the number they are looking at and the
 * document and the app cannot disagree.
 */
export interface AnalyticsDefinition {
  key: AnalyticsMetricKey;
  label: string;
  /** One sentence. What the number counts. §35. */
  definition: string;
  /** How it is calculated, where a formula is meaningful. */
  formula?: string | null;
  format: AnalyticsMetricFormat;
  higherIsBetter: boolean;
  privacyClass: AnalyticsPrivacyClass;
  /** Which backend module owns the truth. §64. */
  owner: string;
  /** How often it is recomputed, in the platform's words. §36. */
  freshnessPolicy: string;
  /** Which dimensions it can be broken down by. §8. */
  dimensions: AnalyticsDimensionKey[];
  /** Which subjects it is meaningful for. */
  subjects: AnalyticsSubjectType[];
  /** Whether a real contract answers it today. §62. */
  status: 'CONNECTED' | 'PARTIAL' | 'DEVELOPMENT_ADAPTER' | 'BACKEND_GAP';
  /** The gap register key where `status` is not `CONNECTED`. */
  gapKey?: string | null;
}
