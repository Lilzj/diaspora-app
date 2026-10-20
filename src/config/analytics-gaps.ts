// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 15, Analytics)
//
// ⚠ EVERY CAPABILITY REGISTERED HERE IS UNSUPPORTED, OR ONLY PARTLY SUPPORTED,
//   BY THE CERTIFIED BACKEND. ⚠
//
// ── What the audit found ─────────────────────────────────────────────────────
//
// **The certified backend has no analytics contract.** Not a partial one — none.
// It has *records*, and it counts them: `GET /jobs` returns a `totalCount` for a
// filter, `GET /neighborhood/{id}` returns real `resourceCounts`, and
// `GET /location/nearby` genuinely aggregates six domains for a centre and a
// radius. Those are real numbers and this phase uses them (GAP-024).
//
// What does not exist anywhere is the thing an analytics platform is made of: a
// *time-bucketed aggregate*. Nothing in the certified surface can answer "how
// many views did this guide get last Tuesday", because nothing records that a
// view happened. §49's event taxonomy has existed since Phase 7 and emits into
// a ring buffer with no transport (GAP-029) — so the platform has a vocabulary
// for what it would measure and no place to put it.
//
// That ordering matters for whoever picks this up: **GAP-029 is the blocker for
// two thirds of this register.** Impressions, views, reach, engagement, search
// volume, map usage, notification open rates and funnel steps are all
// downstream of an ingestion endpoint. Building `GET /analytics/...` before
// there is an event stream would produce contracts that return zero.
//
// ── What was already here, and is therefore not re-registered ────────────────
//
// Four phases built analytics surfaces behind their own adapters, and this phase
// **reuses all four rather than duplicating them**:
//
//   Phase 6   MON-GAP-010    premium/business analytics
//   Phase 7   CREATOR-GAP-*  creator analytics and content performance
//   Phase 12  organizationAnalytics
//   Phase 13  FRONTEND-PHASE13-GAP-007/008  community statistics and comparison
//
// `lib/analytics/adapters.ts` normalises each into the Phase 15 model. Where a
// gap below says "partially covered by" one of those, the frontend calls the
// **existing** client, and the entry documents only what is still missing —
// because re-registering a gap another phase already owns would produce two
// backend tickets for one contract.
//
// ── Where the simulated surfaces live ────────────────────────────────────────
//
// `lib/analytics-gap-api.ts`, under `/analytics-gap/v0`, behind
// `areSimulatedFeaturesEnabled()` — the same single switch Phases 5, 6, 7, 8, 12
// and 13 use.
//
// ── What a production build actually contains, checked rather than assumed ────
//
// The guarantee is a **runtime** one and it is real: in a production export the
// switch inlines to `function(){return!1}`, so `assertEnabled()` rejects on every
// path into this arm and `setupAnalyticsGapMocks()` registers nothing. No
// simulated figure can be served, and none can be rendered.
//
// It is **not** a stripping guarantee, and earlier phases' headers overstate this.
// Inspecting a real `expo export --platform web` bundle shows every phase's gap
// prefix still present — `community-gap/v0`, `creator-gap/v0`, `maps-gap/v0`,
// `analytics-gap/v0` — along with fixture symbols such as `MOCK_CAMPAIGNS`. The
// minifier folds the *branch* that reads the flag; it does not tree-shake the
// modules those branches reference, because they are reached through imports that
// are still live at module scope.
//
// The practical consequence is bounded and worth stating plainly rather than
// leaving implied: a production bundle contains unreachable *generator code* and
// route strings. It contains no member data, and it exposes no way to make the
// application display a fabricated figure. Reducing the dead weight would need a
// build-time module alias, which is a bundler change rather than a phase change —
// it is recorded in the security review rather than fixed here, because doing it
// for one phase and not the other six would be worse than not doing it.
//
// Nothing in this phase moves money, writes to a certified route, creates a
// notification or grants a permission. Every gap id below is quoted verbatim in
// `frontend-phase-15-analytics-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Which backend module should own the work. Matches the vocabulary Phase 13 established. */
export type AnalyticsGapOwner =
  | 'B6-community-foundation'
  | 'B8-guides'
  | 'B9-jobs'
  | 'B10-marketplace'
  | 'B11-housing'
  | 'B12-community-life'
  | 'B13-notifications'
  | 'B13.2-messaging'
  | 'B14-recommendation'
  | 'B15-financial'
  | 'B17-platform'
  | 'identity-platform'
  | 'location-platform'
  /** A dedicated analytics/insights service. Does not exist in any brief yet. */
  | 'analytics-platform'
  | 'future-evolution';

export type AnalyticsGapPriority = 'critical' | 'high' | 'medium' | 'low';

/** How much of the capability the certified backend already carries. */
export type AnalyticsGapCoverage = 'none' | 'partial';

/**
 * The frontend's own status, in §83's vocabulary.
 *
 * There is no `incomplete` member, and that is deliberate: the phase's final
 * principle forbids leaving a screen unfinished because the backend is behind.
 * Every entry below is connected, partially connected, or complete through an
 * adapter.
 */
export type AnalyticsGapFrontendStatus =
  | 'IMPLEMENTED + BACKEND CONNECTED'
  | 'IMPLEMENTED + BACKEND PARTIAL'
  | 'IMPLEMENTED + DEVELOPMENT ADAPTER';

/** The required contract, at the level of detail §61 asks for. */
export interface AnalyticsGapContract {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request: string;
  response: string;
  /** How the server must aggregate. §61 asks for this explicitly. */
  aggregation: string;
  authorization: string;
  permission?: string;
  pagination?: string | null;
  filtering?: string | null;
  sorting?: string | null;
}

export interface AnalyticsGap {
  /**
   * Whether the backend has since shipped this.
   *
   * The register is a historical record and entries are deliberately not deleted
   * when a gap closes — that is the whole point of the file. But a notice that
   * keeps rendering after the capability arrives tells members the platform
   * cannot do something it does, which is the one failure this pattern exists to
   * prevent, pointing the other way.
   *
   * `connected` means every declared endpoint is served, verified against the
   * deployment rather than assumed. The notice stops rendering; nothing else
   * changes. `partial` means some are, and the notice stays because the screen
   * still has a hole in it.
   */
  backendStatus?: 'connected' | 'partial';
  /** `FRONTEND-PHASE15-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  capability: string;
  /** The Phase 15 section(s) this belongs to. */
  feature: string;
  /** Which screens depend on it. §61. */
  screens: string[];
  frontendStatus: AnalyticsGapFrontendStatus;
  frontendBehaviour: string;
  coverage: AnalyticsGapCoverage;
  existingBackendCapability: string[];
  missingBackendCapability: string[];
  requiredContracts: AnalyticsGapContract[];
  /** The metric keys this gap would fill. Cross-checked against the catalogue. */
  metrics: string[];
  dimensions: string[];
  filters: string[];
  /** Cache behaviour the frontend applies, and what the backend must support. */
  caching: string;
  /** How fresh the data can be, and what the UI promises. §36. */
  freshness: string;
  /** Whether anything here needs to be live. Usually not, and saying so matters. */
  realtimeRequirement: string;
  /** How long the underlying events must be kept for this to work. §61. */
  dataRetention: string;
  whyNotImplementable: string;
  privacyConsiderations: string;
  securityConsiderations: string;
  /** Another phase's gap that already covers part of this. */
  partiallyCoveredBy?: string | null;
  owner: AnalyticsGapOwner;
  priority: AnalyticsGapPriority;
  recommendedPhase: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared prose
//
// Several gaps share a privacy or security consideration word for word. Naming
// them keeps the register honest — if the rule for two gaps is genuinely the
// same rule, two paraphrases would eventually drift into two different rules.
// ─────────────────────────────────────────────────────────────────────────────

const SUPPRESSION_RULE =
  'Minimum-cell suppression is mandatory server-side. A count over a small population is an identifier: "3 members in Rose Hill" publishes three people’s membership as an aggregate, and a breakdown by two dimensions makes a suppressed cell recoverable by subtraction. The client renders a suppressed metric as "too few to report" and never as zero, but it cannot apply the rule — by the time a figure reaches the device it has already been disclosed.';

const NO_PII_RULE =
  'The response must contain no user identifier, no email, no handle and no device identifier. Aggregates only. The domain model has no field to put one in, which is the client-side half of the enforcement.';

const SERVER_AUTHORITATIVE =
  'Authorization is entirely server-side. The client renders what it is given and asks for what the capability response says it may have; a caller who edits a subject id in a route must receive a 403 or an all-false capability set from the server rather than being stopped by the client. Frontend role state is never trusted (§48).';

// **Corrected by the register-drift remediation, and the correction is the
// point.** This constant used to open "There is no event ingestion endpoint",
// and because it is shared it repeated that claim across every aggregate that
// depends on the stream. `Diaspora.Modules.Analytics` now maps
// `POST /api/v1/telemetry/events` under its own `/api/v1/telemetry` prefix
// (`Api/AnalyticsEndpoints.cs:225`), answering `202` with a per-event verdict —
// exactly the shape GAP-029 asked for, per-event rather than per-batch, so a
// rejected event is visible rather than silently dropped.
//
// The dependency itself has not gone away, it has moved: the endpoint exists and
// **this client does not post to it**. `deliver()` in `lib/creator-analytics.ts`
// still pushes to a bounded ring buffer and nothing drains it, so the events
// these aggregates would count are still being dropped — on the device now
// rather than for want of a destination.
const EVENT_STREAM_DEPENDENCY =
  'Depends on FRONTEND-PHASE15-GAP-029. The ingestion endpoint now exists — `POST /api/v1/telemetry/events`, 202 with a per-event verdict — but this client does not yet post to it: the events this aggregate would count are still emitted into an in-memory ring buffer and dropped, and no aggregate over them can be anything but zero until `deliver()` gains its destination. What was a missing contract is now unfinished client work.';

export const ANALYTICS_GAPS: Record<string, AnalyticsGap> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM AND GROWTH — §9, §10, §34, §33, §71
  // ═══════════════════════════════════════════════════════════════════════════

  platformAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-001',
    key: 'platformAnalytics',
    capability: 'Platform analytics — the administrative overview of the whole platform',
    feature: '§9 Platform Analytics · §71 Admin Analytics',
    screens: ['/analytics/platform', '/analytics (hub)'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The complete administrative dashboard is built: headline metrics with per-metric provenance, trend series, breakdowns by country and community, a leaderboard of the most active communities, drill-down into every metric, and the full set of §73 empty states and §74 error states. It is **hybrid and marked at field level** — the inventory counts (guides, jobs, listings, housing, providers, organizations, events) come from real certified list routes and render as backend figures; the audience, growth and engagement metrics come from the development provider and render behind <AnalyticsGapNotice>. Access is gated on the server-evaluated capability set from GAP-025, and the screen renders nothing at all rather than an empty dashboard for a caller without it.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /jobs`, `/housing`, `/marketplace`, `/listings`, `/community-life/events`, `/community-life/organizations` each return a real `totalCount` for a filter — a genuine count of platform inventory.',
      '`GET /location/nearby` genuinely aggregates six domains for a centre and radius.',
      '`CountryStatistics` in `types/country.ts` carries real provider, guide, update and contributor counts.',
    ],
    missingBackendCapability: [
      'Any endpoint returning platform-wide totals as a time series',
      'A registered-user count, since no route exposes one',
      'An active-user definition applied consistently server-side (§34)',
      'A capability check distinguishing a platform administrator from a member',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/platform',
        method: 'GET',
        request:
          'from: YYYY-MM-DD; to: YYYY-MM-DD; timezone: IANA; metrics?: string[]; comparison?: previous-period|previous-year; breakdowns?: country|community|category; granularity?: day|week|month',
        response:
          '{ data: { metrics: AnalyticsMetric[], series: AnalyticsSeries[], breakdowns: AnalyticsBreakdown[], computedAt, sourceName, reportingTimezone } }',
        aggregation:
          'Pre-aggregated nightly into a daily rollup table keyed by (date, metric, country, community). Query-time aggregation over raw events must not be offered at this scale — a 90-day platform query would scan the event stream.',
        authorization: 'Platform administrators only. A member receives 403, never a filtered subset.',
        permission: 'analytics.platform.read',
        pagination: 'None on metrics. Breakdown buckets capped server-side with a `remainingBucketCount`.',
        filtering: 'country, community, category, contentType',
        sorting: 'Breakdown buckets sorted by value descending, server-side. The client never re-sorts.',
      },
    ],
    metrics: [
      'audience.users.total',
      'audience.users.new',
      'audience.users.active.daily',
      'audience.users.active.monthly',
      'growth.content.new',
      'inventory.*',
    ],
    dimensions: ['date', 'country', 'community', 'category', 'contentType'],
    filters: ['country', 'community', 'category', 'contentType'],
    caching:
      'Query key `["analytics","dataset",{subject:"platform"},rangeToken,comparison,filters]`. staleTime 5 minutes — a nightly rollup does not change within one, and a shorter time would refetch a dashboard on every tab switch for no new data.',
    freshness:
      'Nightly. The UI states "recomputed nightly" and shows the computedAt the server returns; it never claims a platform figure is live.',
    realtimeRequirement:
      'None. A platform total that updated live would be a wasteful subscription to a number nobody watches change.',
    dataRetention:
      'Daily rollups retained for at least 25 months, so a year-on-year comparison has a complete baseline. The raw events behind them need only 90 days.',
    whyNotImplementable:
      'A platform total cannot be derived client-side. Counting the members the device happens to have loaded would be a count of a page, and a "growth rate" computed from two such counts would be arithmetic on noise. The inventory counts that *are* derivable are shown as backend values; the rest are marked.',
    privacyConsiderations: `${NO_PII_RULE} ${SUPPRESSION_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} A platform dashboard is the highest-value analytics surface on the system; the capability must be checked on every request rather than only at the hub.`,
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  growthAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-002',
    key: 'growthAnalytics',
    capability: 'Growth analytics — net change and growth rate across every entity type',
    feature: '§10 Platform Growth Analytics',
    screens: ['/analytics/growth', '/analytics/platform', '/analytics/community/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The growth experience is complete: net change and growth rate per entity type, a stacked view of what grew, comparison against the previous period and the previous year, and a breakdown by country and community. Growth figures are **never computed by the client from two totals** — that would silently define growth as the difference between whatever two numbers happened to be cached — so where the adapter has no growth figure the card renders "not enough history" rather than a subtraction.',
    coverage: 'none',
    existingBackendCapability: [
      'Nothing. No certified route returns a figure for a past date, so there is no second point to compare against.',
    ],
    missingBackendCapability: [
      'A daily snapshot of every countable entity, retained, so a change over a period is a fact rather than a guess',
      'A definition of a "lost" member, so net change is not just joins',
      'Growth broken down by acquisition channel, which nothing currently records',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/growth',
        method: 'GET',
        request:
          'subjectType: platform|country|community|organization; subjectId?: string; from; to; timezone; granularity; comparison?',
        response:
          '{ data: { metrics: AnalyticsMetric[], series: AnalyticsSeries[], computedAt, sourceName } } where each growth metric carries both the net change and the rate, and the rate carries its denominator',
        aggregation:
          'Daily snapshot table, not a difference computed at query time from a live count. A rate whose denominator is "the count now" rather than "the count at period start" is wrong by exactly the growth being measured.',
        authorization: 'Platform administrators for `platform`; the subject’s operators otherwise.',
        permission: 'analytics.growth.read',
        pagination: null,
        filtering: 'country, community, entityType',
        sorting: null,
      },
    ],
    metrics: ['growth.members.net', 'growth.members.rate', 'growth.content.new', 'growth.*.new'],
    dimensions: ['date', 'country', 'community', 'contentType'],
    filters: ['country', 'community', 'contentType'],
    caching:
      'Shares the dataset key with GAP-001, discriminated by the metric set. staleTime 5 minutes.',
    freshness: 'Nightly, from the previous day’s snapshot. Today is never in a growth figure.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Snapshots retained for at least 25 months. This is the one gap where retention *is* the capability: growth is unknowable without history, and a deployment that starts snapshotting today cannot answer a year-on-year question until next year.',
    whyNotImplementable:
      'Growth is a difference between two points in time and the platform retains only one. A client that subtracted last month’s cached total from this month’s would be comparing two numbers computed by different code paths at different times, and would report growth when a cache expired.',
    privacyConsiderations: SUPPRESSION_RULE,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  engagementAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-003',
    key: 'engagementAnalytics',
    capability: 'Engagement analytics — DAU, WAU, MAU, sessions and stickiness',
    feature: '§34 Engagement Analytics',
    screens: ['/analytics/engagement', '/analytics/platform', '/analytics/community/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The engagement dashboard is complete: the three activity windows on one chart, stickiness, session count and median session length, and a breakdown of what active members actually did. Every card links to the catalogue definition, which is the §34 requirement that "active user" not mean two things — the definition is served once from `lib/analytics/definitions.ts` and every screen shows that one.',
    coverage: 'none',
    existingBackendCapability: [
      'Nothing. The platform records no session and no activity event.',
    ],
    missingBackendCapability: [
      'A session model — what starts one, what ends one, what counts as activity',
      'Distinct-member counting over a window, which requires either retained per-member activity or a probabilistic sketch',
      'A stated rule for whether a background push receipt counts as activity',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/engagement',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; granularity; comparison?',
        response:
          '{ data: { metrics, series, breakdowns, definitionVersion, computedAt, sourceName } } — `definitionVersion` so a change in what "active" means is visible rather than showing as a cliff in the chart',
        aggregation:
          'Distinct counts over rolling windows. HyperLogLog or an equivalent sketch is acceptable and should be declared, because an approximate distinct count presented as exact is §5’s "estimated" case and the client will label it as such if told.',
        authorization: 'Platform administrators for `platform`; community moderators for their own community.',
        permission: 'analytics.engagement.read',
        pagination: null,
        filtering: 'country, community, platform',
        sorting: null,
      },
    ],
    metrics: [
      'audience.users.active.daily',
      'audience.users.active.weekly',
      'audience.users.active.monthly',
      'audience.sessions.count',
      'audience.sessions.duration.median',
      'audience.stickiness.dau_mau',
    ],
    dimensions: ['date', 'country', 'community', 'platform'],
    filters: ['country', 'community', 'platform'],
    caching: 'Dataset key with the engagement metric set. staleTime 5 minutes.',
    freshness: 'Nightly. The current day’s DAU is incomplete and is drawn as a partial bucket.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Per-member activity days retained 400 days for a year-on-year comparison, or a rolling sketch per day retained indefinitely at negligible cost.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `${NO_PII_RULE} Per-member activity is the most re-identifiable data in this register: a daily activity vector for one person is a behavioural fingerprint. Only the aggregate may leave the aggregation service, and a breakdown fine enough to isolate one member must be suppressed.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  retentionAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-004',
    key: 'retentionAnalytics',
    capability: 'Retention analytics — cohort tables and churn',
    feature: '§33 Retention Analytics',
    screens: ['/analytics/retention'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The cohort experience is complete: a scrollable cohort grid with the cohort date and size on every row, an explicit measurement-window statement above it, incomplete cohorts visibly distinguished from cohorts that genuinely lost people, and an accessible row-by-row table alternative. §33 requires the UI to identify the cohort date and measurement window; both are required fields on `AnalyticsRetentionTable`, so a cohort table cannot be rendered without them.',
    coverage: 'none',
    existingBackendCapability: ['Nothing.'],
    missingBackendCapability: [
      'Cohort assignment at registration, retained',
      'A retention definition — active at all, or active in a specific way',
      'A rule for members who delete their account mid-cohort',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/retention',
        method: 'GET',
        request:
          'subjectType; subjectId?; cohortGranularity: day|week|month; cohortCount: number (server-capped); offsets: number; timezone',
        response:
          '{ data: { granularity, offsetLabels, measurementWindow, cohorts: [{ cohortDate, cohortSize, values, isIncomplete }], computedAt, sourceName } }',
        aggregation:
          'Cohort × offset matrix, precomputed. `isIncomplete` must be set by the server from the cohort age, not inferred by the client from a null — a genuine zero and an unelapsed window look identical otherwise.',
        authorization: 'Platform administrators; community moderators for their own community.',
        permission: 'analytics.retention.read',
        pagination: 'Cohorts capped server-side; a cursor over cohort dates for deeper history.',
        filtering: 'country, community',
        sorting: 'Cohorts newest first.',
      },
    ],
    metrics: ['retention.day1', 'retention.day7', 'retention.day30', 'retention.weekly', 'retention.churn'],
    dimensions: ['date', 'country', 'community'],
    filters: ['country', 'community'],
    caching:
      'Query key includes cohort granularity and count. staleTime 30 minutes — a cohort table changes once a day at most.',
    freshness: 'Nightly. A cohort is final only after its window elapses, and the UI says which are not.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Registration dates indefinitely; activity days for at least the longest offset plus the deepest cohort history offered.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `${SUPPRESSION_RULE} A cohort of size 1 is one person’s usage history rendered as a row, and cohort sizes are published, so the suppression threshold must apply to the cohort itself and not only to its cells.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'analytics-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLACE — §11, §12, §13, §14, §65
  // ═══════════════════════════════════════════════════════════════════════════

  countryAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-005',
    // PARTIAL, and closer to a different capability. GET /intelligence/countries/{countryCode}/analytics
    // is served, but returns `IntelligenceAnalyticsResponse` — notice, embassy, visa and holiday view
    // counters for government-intelligence content in that country. That is how people use the
    // intelligence module, not how the platform performs in a country, and it has no date dimension,
    // so the daily rollup declared below does not exist. The previous note verified the path by its
    // 403, which proves existence and nothing about shape. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'countryAnalytics',
    capability: 'Country analytics — population, activity and content by country',
    feature: '§11 Country Analytics',
    screens: ['/analytics/country/[code]', '/country/[code]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Since 20 Oct 2026 the country dashboard is **real in every build**: the job, housing, listing, provider, event and organisation counts come from the certified list routes filtered by country, and the use of the country’s official information — notice views, read completion, searches, alerts followed — comes from `GET /intelligence/countries/{countryCode}/analytics`, shown to the intelligence editors that route authorises and named as unavailable to everybody else. Those counters are all-time, and the dataset says the date range does not narrow them. Population, growth and active members are counted by no route and are named as unavailable rather than simulated. A country is treated as a country throughout — §65 forbids treating it as a community.',
    coverage: 'partial',
    existingBackendCapability: [
      '`CountryStatistics` is a real shape carrying `providerCount`, `guideCount`, `updatesToday`, `verifiedContributorCount` and `expertCount`.',
      '`GET /jobs`, `/housing`, `/marketplace` accept country filters and return a real `totalCount`.',
      '`GET /intelligence/countries/{countryCode}/analytics` (Guides) — all-time usage counters for the country’s official information, behind `IntelligencePermissions.ReadAnalytics`; read by `fetchPlaceAnalytics` since 20 Oct 2026.',
      '`allCountries` in `mocks/countries.ts` is the real country reference list.',
    ],
    missingBackendCapability: [
      'A time series for any country figure — `CountryStatistics` is a snapshot with a `lastUpdatedAt` and no history',
      'A member population per country distinct from `residenceCountry` on the auth record',
      'Popular-category aggregates per country',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/countries/{countryCode}',
        method: 'GET',
        request: 'from; to; timezone; metrics?; breakdowns?: category|community|neighborhood; comparison?',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Daily rollup keyed by (date, countryCode, metric). Country is derived from the *content’s* country rather than the viewer’s, except for audience metrics where it is the member’s residence country — and the response must say which, per metric, because conflating them is how a country dashboard starts double-counting.',
        authorization:
          'Public metrics to any authenticated caller. Population and engagement to platform administrators only.',
        permission: 'analytics.country.read / analytics.country.read.private',
        pagination: null,
        filtering: 'category, community, neighborhood',
        sorting: 'Breakdowns by value descending.',
      },
    ],
    metrics: ['audience.users.total', 'growth.members.net', 'inventory.*', 'content.views'],
    dimensions: ['date', 'country', 'community', 'neighborhood', 'category'],
    filters: ['category', 'community', 'neighborhood'],
    caching:
      'Query key carries the country code. Two countries are two cache entries — proved by `analytics-cache-isolation.test.ts` rather than asserted.',
    freshness: 'Inventory counts live; everything else nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      'A snapshot is not a series. `CountryStatistics.lastUpdatedAt` says when the numbers were computed and nothing about what they were a week ago, so a trend line drawn from it would have one point.',
    privacyConsiderations: `${SUPPRESSION_RULE} §11 warns against exposing sensitive country-level information: for a country with few diaspora members on the platform, a population count plus a neighbourhood breakdown approaches naming individuals. Country-level population is administrative rather than public for that reason.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'analytics-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  communityAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-006',
    key: 'communityAnalytics',
    capability: 'Community analytics — growth, activity, engagement and reach per community',
    feature: '§12 Community Analytics · §13 Community Comparison · §65 Analytics + Phase 13',
    screens: ['/analytics/community/[id]', '/community/[slug]/statistics', '/community/compare'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The community analytics dashboard is complete and reuses Phase 13’s statistics contract rather than adding a second one: `useCommunityStatistics` already returns per-metric `Sourced` values and `DataFreshness`, and `lib/analytics/adapters.ts` normalises that into the Phase 15 dataset. What this phase adds on top is the time dimension — series, comparison, breakdowns and drill-down — which Phase 13’s snapshot shape has no room for. Community and country stay distinct dimensions throughout; the scope token from `lib/community/scope.ts` travels in every request and every cache key.',
    coverage: 'partial',
    partiallyCoveredBy: 'FRONTEND-PHASE13-GAP-007 (community statistics) and GAP-008 (comparison)',
    existingBackendCapability: [
      'Phase 13’s `GET /communities/{id}/statistics` shape, already implemented against the development adapter with real cross-domain counts where derivable.',
      '`GET /location/nearby` and `/neighborhood/{id}` give real activity counts for a community’s presence areas.',
      '`GET /community-life/events` and `/organizations` return a real `totalCount`.',
    ],
    missingBackendCapability: [
      'A time series for any community metric',
      'Member counts, which Phase 13 already registered as absent because there is no membership record to count',
      'Per-community engagement with a stated methodology',
      'Cross-community reach, which requires knowing which community a viewer belongs to — the most privacy-sensitive join in the platform',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/communities/{communityId}',
        method: 'GET',
        request:
          'from; to; timezone; granularity; metrics?; breakdowns?: country|neighborhood|category|contentType; comparison?: previous-period|previous-year|platform-average|country-average',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Daily rollup keyed by (date, communityId, metric). Cross-community reach must be aggregated so that no cell resolves to a single viewer’s community membership.',
        authorization:
          'Members may read public community metrics. Growth, engagement and moderation metrics require the community capability from FRONTEND-PHASE13-GAP-006.',
        permission: 'analytics.community.read / analytics.community.read.private',
        pagination: null,
        filtering: 'country, neighborhood, category, contentType',
        sorting: 'Breakdowns by value descending.',
      },
      {
        endpoint: 'GET /analytics/communities/compare',
        method: 'GET',
        request: 'ids: comma-separated (server-capped at 3–5); from; to; timezone; metrics?',
        response:
          '{ data: { communities: CommunityRef[], rows: [{ metricKey, label, values: (Sourced<number>|null)[] }], range } }',
        aggregation:
          'Metrics must be computed identically across communities or the comparison is a category error rendered as a grid. The response must state a `methodologyVersion` shared by every column.',
        authorization: 'Restricted metrics omitted per community per caller, never nulled.',
        permission: 'analytics.community.read',
        pagination: null,
        filtering: null,
        sorting: 'None. The client computes no winner, no ranking and no composite score (§13).',
      },
    ],
    metrics: ['reach.members', 'growth.members.net', 'reach.crossCommunity', 'content.*', 'inventory.*'],
    dimensions: ['date', 'country', 'community', 'neighborhood', 'category', 'contentType'],
    filters: ['country', 'neighborhood', 'category', 'contentType'],
    caching:
      'Query key carries the community id **and** the resolved community scope token. Community A’s dataset can never be served under Community B — this is the property `analytics-cache-isolation.test.ts` proves for five entity types.',
    freshness: 'Inventory counts live; growth and engagement nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      'The certified backend has no concept of a community at all — Phase 13’s central finding. Analytics over an entity that does not exist cannot be connected, and deriving community analytics from country analytics would rebuild the exact conflation Phase 13 spent a phase removing.',
    privacyConsiderations: `${SUPPRESSION_RULE} A member’s community can imply nationality, immigration situation, religion or ethnicity. Cross-community reach is a join between viewer membership and content, and must be aggregated before it is stored, not after. ${NO_PII_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} A private community’s analytics must not become readable by naming its id in a route.`,
    owner: 'B6-community-foundation',
    priority: 'high',
    recommendedPhase: 'B19 Community Insights',
  },

  neighborhoodAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-007',
    // 20 Oct 2026. The neighbourhood is the area around a point (the catalogue
    // was retired 14 Oct), and its dataset is composed from `/geo/area` and
    // `/community-life/area/activity`. Partial: no history and no presence.
    backendStatus: 'partial',
    key: 'neighborhoodAnalytics',
    capability: 'Neighbourhood analytics — local activity, presence and resource counts',
    feature: '§14 Neighborhood Analytics',
    screens: ['/analytics/neighborhood/[id]', '/neighborhood/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Since 20 Oct 2026 the neighbourhood dashboard describes **the area around a point** — the subject id carries `lat,lng,CC[,radiusKm]` — and is real in every build: homes, items for sale, jobs and updates listed within the circle come from `GET /geo/area`, and upcoming events, organisations, RSVPs and attendance over the chosen range from `GET /community-life/area/activity`. An old catalogue neighbourhood id has no point and shows nothing rather than reading a retired route. Member presence and growth are counted by no route and are named as unavailable; how any figure changed over time is not recorded.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /geo/area` returns real `resourceCounts` for a circle around a point. (This line named the catalogue neighbourhood route until it was retired on 14 Oct 2026.)',
      '`GET /community-life/area/activity` counts upcoming events, organisations, RSVPs and attendance within the same circle over a window of days.',
      'Phase 8’s neighbourhood scores, safety scores and cost-of-living categories with their own `DataFreshness`.',
    ],
    missingBackendCapability: [
      'History for any neighbourhood figure',
      'Community presence per neighbourhood, which Phase 13 registered as GAP-015 and which requires suppression to be safe',
      'Map interaction counts per neighbourhood (see GAP-021)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/neighborhoods/{neighborhoodId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; metrics?; comparison?',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Daily rollup keyed by (date, neighborhoodId, metric). Presence figures must carry minimum-cell suppression before storage.',
        authorization: 'Authenticated. Presence and demographic figures require a platform capability.',
        permission: 'analytics.neighborhood.read',
        pagination: null,
        filtering: 'category, community',
        sorting: null,
      },
    ],
    metrics: ['inventory.*', 'map.opens', 'content.views'],
    dimensions: ['date', 'neighborhood', 'community', 'category'],
    filters: ['category', 'community'],
    caching: 'Query key carries the neighbourhood id. staleTime 10 minutes.',
    freshness: 'Resource counts live; everything else nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      '§14 forbids fabricating location intelligence, and a neighbourhood is small enough that fabrication has consequences — a made-up safety trend for a real street is a claim about a real place people live.',
    privacyConsiderations: `${SUPPRESSION_RULE} A neighbourhood is the smallest geography in the platform and therefore the one where suppression matters most: an unsuppressed community-presence figure over a sparse area is a map of individual members’ homes. Phase 8’s coarse ~11 km analytics grid stays the only geography that leaves a device.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Community Insights',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT AND AUDIENCE — §15, §22, §23, §24
  // ═══════════════════════════════════════════════════════════════════════════

  contentAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-008',
    backendStatus: 'connected',
    key: 'contentAnalytics',
    capability: 'Content performance — impressions, views, reach, saves, shares, engagement',
    feature: '§15 Creator Analytics · §22 Guide Analytics · §23 Event Analytics · §24 Update Analytics',
    screens: [
      '/analytics/content/[type]/[id]',
      '/analytics/creator',
      '/creator/analytics',
      '/analytics/organization/[id]',
    ],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'One content-performance dataset serves guides, updates, events, listings, jobs and housing — §22 forbids duplicating creator analytics for guides and §23 forbids a second event analytics system, and the way to honour both is one contract with a subject type rather than six contracts. The per-item screen is complete: headline metrics, a trend, a traffic-source breakdown, a community and country reach breakdown, and the item’s position in the owner’s own top content. Phase 7’s existing creator analytics is reused unchanged for the creator-level rollup and normalised through the adapter.',
    coverage: 'none',
    partiallyCoveredBy: 'CREATOR-GAP series (Phase 7 creator analytics and content performance)',
    existingBackendCapability: [
      '**RESOLVED (Remediation Wave C-06).** `AnalyticsEndpoints.cs:150`, behind `AnalyticsPolicies.ContentRead`, and `fetchContentAnalytics` in `lib/analytics-api.ts` now calls it. `useAnalyticsDataset` makes it the **base** dataset for the six per-item subjects rather than an additive source, and it is no longer gated on the gap switch. This line used to end "no client arm calls it, so the screens still read the development adapter", which is the sentence it replaces. The backend was written from this entry: its own comment cites FRONTEND-PHASE15-GAP-008 and repeats the reasoning above about one route with a type segment rather than six.',
      '**The divergence that would have been a hundredfold error in front of a member.** The dataset’s `comparison.changePercent` is a **ratio** (`ChangePercentage / 100d`), while the Phase 7 creator summary this client already reads sends a percentage. The certified arm passes it through undivided; copying the adapter’s `/100` would have shown a 12% change as 0.12%.',
      'Metric keys on the dataset are the **dotted** catalogue keys, while `/analytics/access` sends the Phase 7 snake keys for the same metrics. One module, two key spaces, on two routes a screen reads together — see FRONTEND-PHASE15-GAP-025.',
      '`breakdowns`, `funnels`, `insights` and `leaderboards` always come back empty from this route, and the client renders that as "not available for this content" rather than as an empty section implying zero. The development arm still supplies those four, which is the only thing it now contributes.',
      '`content.helpfulVotes` is in `AnalyticsMetricCatalog.ContentItem`, is `Available`, and had **no client metric key at all** — so the certified arm would have silently dropped a real measured figure on every per-item dashboard. It has been added to the metric union and the definitions catalogue.',
      'Phase 7’s `GET /creator-gap/v0/creators/me/analytics` and `/analytics/content` are already implemented and already cursor-paged. They are development-adapter contracts, not certified ones.',
      'Phase 7’s `GET /creator-gap/v0/creators/me/analytics` and `/analytics/content` are already implemented and already cursor-paged. They are development-adapter contracts, not certified ones.',
      'Every content type has a real read route, so titles, types and publication dates on a performance row are real.',
    ],
    missingBackendCapability: [
      'Any record that a view or an impression occurred',
      'Deduplicated reach, which requires per-viewer state the platform does not keep',
      'Traffic-source attribution — whether a view came from search, a rail, a share or a notification',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/content/{contentType}/{contentId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; metrics?; breakdowns?: source|country|community|surface',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Daily rollup keyed by (date, contentType, contentId, metric, source). Reach requires a distinct-viewer sketch per item per day, unioned across days server-side — unioning daily reach figures in the client would overcount every returning viewer.',
        authorization:
          'The content owner, plus platform administrators. A third party receives 403 — content performance is not public.',
        permission: 'analytics.content.read.own',
        pagination: 'Breakdowns capped; the owner’s content list is cursor-paged.',
        filtering: 'contentType, source, country, community',
        sorting: 'Content list by the requested metric, server-side.',
      },
    ],
    metrics: ['content.impressions', 'content.views', 'content.reach', 'content.engagementRate'],
    dimensions: ['date', 'source', 'country', 'community', 'contentType', 'surface'],
    filters: ['contentType', 'source', 'country', 'community'],
    caching:
      'Query key carries content type **and** content id. Listing A’s analytics can never be served under Listing B.',
    freshness:
      'Hourly would be ideal for a creator watching a new post; nightly is acceptable and is what the UI promises today.',
    realtimeRequirement:
      'None required. A live view counter is a product decision with a real cost and this phase does not assume one.',
    dataRetention: 'Daily per-item rollups 25 months; raw view events 90 days.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `§15 forbids exposing private viewer information and this is where that bites. A viewer breakdown fine enough to identify who read a guide is a readership record. Country and community breakdowns must be suppressed below a threshold, and there must be no per-viewer endpoint at any level of authorization short of a legal process. ${NO_PII_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} Content analytics is owner-scoped, so the subject id in the route must be checked against the caller on every request — this is the single most likely place for an IDOR in the phase.`,
    owner: 'analytics-platform',
    priority: 'critical',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  creatorAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-009',
    // CONNECTED. GET /analytics/creators/me returns a real `AnalyticsDatasetResponse` of content
    // engagement. It carries **no revenue metrics** — the response note below used to promise
    // revenue as `Money`; revenue lives in Financial and is not part of this dataset. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'connected',
    key: 'creatorAnalytics',
    capability: 'Creator analytics — audience, reach, revenue and rewards in one view',
    feature: '§15 Creator Analytics · §16 Creator Revenue Analytics · §66 Analytics + Phase 7',
    screens: ['/analytics/creator', '/creator/analytics', '/creator/revenue'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Creator analytics **already existed** and is reused rather than rebuilt: `/creator/analytics` keeps its period selector, metric definitions, trend and cursor-paged content list. What this phase adds is the dimensions it lacked — community and cross-community reach, country reach, comparison baselines and drill-down — served through the unified dataset, plus a revenue view that consumes the **real** B15 wallet and earnings contracts rather than recomputing them. §16 forbids duplicating wallet logic and none is duplicated: available, pending, paid and refunded come from the certified financial client.',
    coverage: 'partial',
    partiallyCoveredBy: 'CREATOR-GAP-016 (telemetry transport) and the Phase 7 creator analytics gaps',
    existingBackendCapability: [
      '`GET /financial/wallets/me`, `/wallets/me/transactions`, `/creators/me/revenue/summary` and `/creators/me/earnings` are real and already power the creator revenue screen.',
      'Points, milestones, referrals and sponsored placements are all real contracts from Phase 7.',
      'Phase 7’s creator analytics adapter supplies views, reach and follower trends.',
    ],
    missingBackendCapability: [
      'Reach and engagement as measurements rather than adapter output (GAP-008)',
      'Revenue attributed to a specific piece of content, which requires attribution the payment ledger does not carry',
      'An audience breakdown that is safe to publish (see privacy)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/creators/me',
        method: 'GET',
        request: 'from; to; timezone; granularity; metrics?; breakdowns?: community|country|contentType|source',
        response: '{ data: AnalyticsDataset } of content engagement. No revenue metrics: those are Financial’s, typed `Money`, and not part of this dataset',
        aggregation:
          'Content-level rollups summed to the creator. Revenue joined from the settled ledger, never from pending intents — §16 keeps pending and available separate and an analytics rollup must not merge them.',
        authorization: 'Self only. There is deliberately no `GET /analytics/creators/{id}`.',
        permission: 'analytics.creator.read.self',
        pagination: 'Content list cursor-paged.',
        filtering: 'contentType, community, country, source',
        sorting: 'By the requested metric, server-side.',
      },
    ],
    metrics: ['content.*', 'reach.followers', 'reach.crossCommunity', 'revenue.*', 'rewards.*'],
    dimensions: ['date', 'community', 'country', 'contentType', 'source'],
    filters: ['contentType', 'community', 'country', 'source'],
    caching:
      'Self-scoped, so the key carries no creator id — and that is the isolation property: there is no id to get wrong. Invalidated on sign-out with every other self-scoped query.',
    freshness: 'Revenue live from the ledger; reach nightly. The two are labelled separately on the same screen.',
    realtimeRequirement: 'None.',
    dataRetention: 'As GAP-008. Revenue records follow B15’s existing financial retention, unchanged.',
    whyNotImplementable:
      'The reach half depends on GAP-008. The revenue half is genuinely connected and is not simulated — presenting it as a gap would be as wrong as presenting the reach half as real.',
    privacyConsiderations: `§15 says audience breakdown "where legitimately supported", and the qualifier is doing real work: an audience breakdown by country over a creator with forty readers names people. Breakdowns are suppressed below a threshold and there is no viewer-level endpoint. Financial figures are the creator’s own and must never appear on a public creator profile.`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} Self-only by route design — the absence of an id parameter is what makes Creator A unable to read Creator B, and it is stronger than a check.`,
    owner: 'B15-financial',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OPERATORS — §17, §18, §19, §20, §21
  // ═══════════════════════════════════════════════════════════════════════════

  providerAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-010',
    // PARTIAL. GET /analytics/providers/me — note `/me`, not the `/providers/{providerId}` declared
    // below — serves a real `AnalyticsDatasetResponse` since 13 Sep 2026: provider-profile rollups
    // summed to the member who owns them, read by the member's user id. Views, unique viewers
    // (narrowed to provider profiles), enquiries (the first message in a `ProviderInquiry`
    // conversation, once per conversation, since 13 Sep 2026), saves (the profile's save button,
    // which Providers delegates to Community), profiles published, with a views series and a
    // top-profiles leaderboard that carries enquiries beside views. The same server composer as the
    // seller, landlord and employer datasets. **Not served**: search impressions, which the search
    // screen records and nothing publishes; calls and directions, which nothing records; leads; the
    // discovery funnel; the rating trend; the breakdowns; placement performance. No conversion and
    // no revenue.
    // Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'providerAnalytics',
    capability: 'Provider analytics — discovery, contacts, leads and reviews',
    feature: '§17 Provider Analytics',
    screens: ['/analytics/provider'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The provider dashboard reads the certified provider dataset for views, unique viewers, enquiries, saves and profiles published, with a top-profiles board, and is reached from the analytics hub and from the owner’s own provider profile. Impressions, call and directions taps, leads, the discovery funnel from impression to conversion, the review and rating trend, community and location reach and featured-placement performance remain development-adapter sections, absent in a release build. No customer identity appears anywhere — every figure is a count.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /analytics/providers/me` serves the provider’s own profiles dataset: views, unique viewers, enquiries, saves and profiles published, a views series and top profiles with enquiries beside views.',
      // CORRECTED 13 Sep 2026. This line read "`GET /listings` returns real provider listings"; the
      // backend has no `/listings` route. Providers are listed by `GET /providers`.
      '`GET /providers` returns real providers, with a real `totalCount` when `includeTotalCount` asks for one.',
      'Reviews and ratings are real and already render on the provider profile.',
      'Phase 6’s placement and promotion contracts are real for what was bought, if not for how it performed.',
    ],
    missingBackendCapability: [
      'Search impression counts — recorded from the search screen and stored, with no metric published from them',
      // CORRECTED 13 Sep 2026. This read "call, message and directions taps are not reported
      // anywhere". A message is: enquiries are counted from a conversation's first message.
      'Call and directions taps — not reported anywhere',
      'A lead definition, which requires joining a contact action to a conversation reply',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/providers/{providerId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; metrics?; breakdowns?: source|community|neighborhood',
        response: '{ data: AnalyticsDataset } including a `funnels` array for the discovery funnel',
        aggregation:
          'Daily rollup keyed by (date, providerId, metric, source). Funnel steps must be computed from the same event stream with one attribution window, stated in the response — steps assembled from separately-defined counts do not form a funnel.',
        authorization: 'The provider’s owner, plus platform administrators.',
        permission: 'analytics.provider.read.own',
        pagination: null,
        filtering: 'source, community, neighborhood',
        sorting: null,
      },
    ],
    metrics: ['provider.profileViews', 'provider.contactActions', 'provider.leads', 'conversion.rate'],
    dimensions: ['date', 'source', 'community', 'neighborhood'],
    filters: ['source', 'community', 'neighborhood'],
    caching: 'Query key carries the member’s own id, and the route is `/me`, so one member’s profiles can never be served to another.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months; raw interaction events 90 days.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `§17 forbids exposing private customer information. A lead count is safe; a lead *list* is a list of people who contacted a business and is not analytics. There is no contract here that returns one. ${NO_PII_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} Owner-scoped by id, so the ownership check is the load-bearing one.`,
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  marketplaceAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-011',
    // PARTIAL. GET /analytics/sellers/me — note `/me`, not the `/sellers/{sellerId}` declared below
    // — serves a real `AnalyticsDatasetResponse` since 13 Sep 2026: listing rollups summed to the
    // seller. Views, unique viewers (narrowed to listings, so a seller's guide readers are not
    // counted), sales, conversion rate, enquiries and listings published, with a views series and a
    // top-listings leaderboard. Enquiries since 13 Sep 2026: the first message in a
    // `MarketplaceListing` conversation, published by Conversations as `ConversationFirstMessageSent`,
    // once per conversation. **Not served**: impressions, which nothing records for a listing; offers,
    // which Marketplace publishes and analytics does not count; revenue, served as not measured
    // because it is Financial's; and the funnel, the breakdowns and cursor-paged listing
    // performance. There is deliberately no `/{sellerId}`
    // variant at any level, and `/sellers/{id}` answers 404 on the deployment. The operational
    // dashboard is GET /marketplace/sellers/me/dashboard, which this complements.
    // Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'marketplaceAnalytics',
    capability: 'Marketplace analytics — listing performance and the seller funnel',
    feature: '§18 Marketplace Analytics · §67 Analytics + Phase 6',
    screens: ['/analytics/seller', '/analytics/content/listing/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The seller dashboard is complete: per-listing performance, the full impression → view → save → contact → offer → reservation → purchase funnel, category and community breakdowns, and featured-listing performance. Sales and refunds are **real** — they come from the certified B15 purchase and transaction contracts — and are marked as backend figures beside the simulated discovery metrics. §18 forbids duplicating marketplace business logic and none is duplicated; the dashboard reads existing contracts.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /analytics/sellers/me` serves the seller’s own listings dataset: views, unique viewers, sales, conversion rate, enquiries and listings published, a views series and top listings.',
      '`GET /marketplace` and `/marketplace/{id}` are real, with a real `totalCount` per filter.',
      '`GET /financial/purchases` and `/wallets/me/transactions` are real records of completed sales and refunds.',
      'Phase 6’s featured-listing and boost purchases are real.',
    ],
    missingBackendCapability: [
      // CORRECTED 13 Sep 2026: views per listing are served, by the seller dataset and each
      // listing's own page. This line read "Impressions, views and saves per listing".
      'Impressions and saves per listing',
      'Offer and reservation counts as analytics rather than as records',
      'Attribution linking a placement purchase to the sales that followed it',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/sellers/{sellerId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; breakdowns?: category|community|placement; funnels?: boolean',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Listing-level rollups summed to the seller, plus a funnel over one attribution window. Revenue must come from the settled ledger so it reconciles with the wallet the seller can also open.',
        authorization: 'The seller, plus platform administrators.',
        permission: 'analytics.seller.read.own',
        pagination: 'Listing performance cursor-paged.',
        filtering: 'category, community, placement, status',
        sorting: 'By the requested metric, server-side.',
      },
    ],
    metrics: ['content.impressions', 'listing.contacts', 'listing.sales', 'revenue.gross', 'conversion.rate'],
    dimensions: ['date', 'category', 'community', 'placement'],
    filters: ['category', 'community', 'placement', 'status'],
    caching: 'Keyed by seller id, and per-listing datasets keyed by listing id.',
    freshness: 'Sales live from the ledger; discovery metrics nightly. Labelled separately.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months. Financial records follow B15’s existing retention.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `A buyer is a person. Sales counts are safe; a buyer list is not analytics, and no contract here returns one. ${NO_PII_RULE}`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'B10-marketplace',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  employerAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-012',
    // PARTIAL. GET /analytics/employers/me — note `/me`, not the `/employers/{employerId}` declared
    // below — serves a real `AnalyticsDatasetResponse` since 13 Sep 2026: job rollups summed to the
    // employer, read by the member's user id and never the employer profile id. Views, unique
    // viewers (narrowed to jobs), applications (`ApplicationSubmitted`), application rate and jobs
    // published, with a views series and a top-jobs leaderboard. The same server composer as the
    // seller and landlord datasets. **Not served**: search appearances; the candidate funnel — no
    // shortlist, interview, offer or hire stage is counted, deliberately, because at those stages a
    // count names a person; the breakdowns; cursor-paged job performance. No revenue.
    // Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'employerAnalytics',
    capability: 'Employer analytics — job performance and the candidate funnel',
    feature: '§19 Employer / Job Analytics',
    screens: ['/analytics/employer', '/analytics/content/job/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The employer dashboard reads the certified employer dataset for views, unique viewers, applications, application rate and jobs published, with a top-jobs board, and is reached from the analytics hub and the hiring workspace. Search appearances, the view → apply → shortlist → interview → hire funnel, community and cross-community reach and featured-job performance remain development-adapter sections, absent in a release build. Everything is **counts only** — §19 warns against exposing candidate PII unnecessarily, and a count is a number, not a list of people.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /analytics/employers/me` serves the employer’s own jobs dataset: views, unique viewers, applications, application rate and jobs published, a views series and top jobs.',
      '`GET /jobs` and `/jobs/{id}` are real with a real `totalCount`.',
      // CORRECTED (Remediation Wave K). This line read "`GET /employers/{id}` is
      // a real employer profile." It is not, and never has been:
      // `EmployerEndpoints.cs` maps three routes — register, update and
      // dashboard — and none of them reads a profile by id. `app/employer/[id].tsx`
      // calls it and is answered **only** by the development fixture in
      // `mocks/handlers/jobs.ts`; against a real deployment it 404s.
      //
      // Worth recording as a class, not just a correction. The platform audit
      // found 164 register entries claiming *missing* for routes that exist, and
      // Wave M-2's drift check now fails CI on those. This is the **opposite
      // direction** — a register claiming a route *exists* when it does not — and
      // M-2 cannot see it: the check reads declared-missing endpoints and
      // compares them against the backend, so a false "this is real" passes
      // silently. That asymmetry is a known limit of the check rather than an
      // oversight in it, and closing it needs the inverse comparison.
      //
      // CORRECTED AGAIN (15 Sep 2026). The correction above was right about
      // `/employers/{id}` and wrong about the capability: the server had added
      // the public read under the Jobs group (gaps G-1 and G-2), and "NG-04"
      // stood here while it did. The employer profile screen now reads it.
      '`GET /jobs/employers/{idOrSlug}` is a real, anonymous employer profile — the one the employer screen reads. `/employers/{id}` without the `/jobs` prefix has never existed.',
      'Phase 6’s featured-job purchases are real.',
    ],
    missingBackendCapability: [
      'Search-appearance counts per job',
      'Shortlist, interview and hire stages — published by Jobs, and not counted by analytics until a suppression rule makes a small count safe to show',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/employers/{employerId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; breakdowns?: community|country|source; funnels?: boolean',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Job-level rollups summed to the employer. Funnel stages must be counts at every step; the contract must not offer a candidate list at any stage.',
        authorization: 'The employer, plus platform administrators.',
        permission: 'analytics.employer.read.own',
        pagination: 'Job performance cursor-paged.',
        filtering: 'community, country, source, jobStatus',
        sorting: 'By the requested metric.',
      },
    ],
    metrics: ['content.views', 'job.applications', 'job.applicationRate', 'conversion.rate'],
    dimensions: ['date', 'community', 'country', 'source'],
    filters: ['community', 'country', 'source', 'status'],
    caching: 'Keyed by employer id; per-job datasets keyed by job id.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `A candidate funnel is the most sensitive funnel in the platform: it describes real people’s job applications. Counts only, suppressed below a threshold — an employer with two applicants seeing "1 shortlisted" has learnt something about a named individual, because they know who the two are. ${NO_PII_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} A demographic breakdown of applicants must not be offered at all: it would be both a privacy failure and, in most jurisdictions, an employment-law one.`,
    owner: 'B9-jobs',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  housingAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-013',
    // PARTIAL. GET /analytics/landlords/me — note `/me`, not the `/landlords/{landlordId}` declared
    // below — serves a real `AnalyticsDatasetResponse` since 13 Sep 2026: housing listing rollups
    // summed to the landlord, read by the member's user id and never the landlord profile id.
    // Views, unique viewers (narrowed to homes), viewings booked (`ViewingScheduled`), viewing rate,
    // enquiries and homes published, with a views series and a top-listings leaderboard. The same
    // server composer as the seller dataset. Enquiries since 13 Sep 2026: the first message in a
    // `HousingListing` conversation about one home, once per conversation. **Not served**:
    // impressions, saves and search appearances, which nothing records for a home; applications,
    // which Housing publishes and analytics does not count; the funnel, the breakdowns and
    // cursor-paged listing performance. No revenue in any form — rent is not taken through
    // Diaspora. There is deliberately no `/{landlordId}` variant at any level.
    // Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'housingAnalytics',
    capability: 'Housing analytics — listing performance and the enquiry funnel',
    feature: '§20 Housing Analytics',
    screens: ['/analytics/landlord', '/analytics/content/housing/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The landlord dashboard reads the certified landlord dataset for views, unique viewers, viewings, viewing rate, enquiries and homes published, with a top-listings board. Impressions, saves, search appearances, contact requests, applications, the impression → view → save → enquiry → application funnel, location performance and featured-housing performance remain development-adapter sections, absent in a release build. No prospective tenant is identifiable anywhere.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /analytics/landlords/me` serves the landlord’s own housing dataset: views, unique viewers, viewings booked, viewing rate, enquiries and homes published, a views series and top listings.',
      '`GET /analytics/content/{contentType}/{contentId}` serves one home’s dataset to its owner, with `housing` as the content type.',
      '`GET /housing`, `/housing/{id}` and `/housing/hosts/{id}` are real with a real `totalCount`.',
      'Phase 6’s featured-housing purchases are real.',
    ],
    missingBackendCapability: [
      'Impression, save and search-appearance counts per listing',
      // Enquiries are counted since 13 Sep 2026; applications are published by Housing and not yet.
      'Application counts as aggregates',
      'Location performance broken down below city level, which needs the suppression rule to be safe',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/landlords/{landlordId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; breakdowns?: neighborhood|community|source; funnels?: boolean',
        response: '{ data: AnalyticsDataset }',
        aggregation: 'Listing-level rollups summed to the landlord, plus one funnel per attribution window.',
        authorization: 'The landlord, plus platform administrators.',
        permission: 'analytics.landlord.read.own',
        pagination: 'Listing performance cursor-paged.',
        filtering: 'neighborhood, community, source, status',
        sorting: 'By the requested metric.',
      },
    ],
    metrics: ['content.impressions', 'housing.inquiries', 'housing.applications', 'conversion.rate'],
    dimensions: ['date', 'neighborhood', 'community', 'source'],
    filters: ['neighborhood', 'community', 'source', 'status'],
    caching: 'Keyed by landlord id; per-listing datasets keyed by housing id.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `§20 forbids exposing renter information. Housing is also where discrimination risk is highest: a breakdown of enquirers by country or community must not be offered, because it would let a landlord filter on it. The contract deliberately lists no such dimension. ${NO_PII_RULE}`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'B11-housing',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  organizationAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-014',
    // PARTIAL, not connected. GET /communities/organizations/{organizationId}/analytics is served
    // but returns a bespoke `OrganizationAnalyticsResponse` — { period, memberGrowth[],
    // volunteerHours[], pollParticipation[], computedAt } — not the `AnalyticsDataset` this entry
    // declares, so the Phase 15 dashboards cannot render it. `community-programme-api.ts` reads it
    // correctly through its own adapter. The generic content route also accepts `organization`,
    // but that dataset is profile engagement, not membership or attendance. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'organizationAnalytics',
    capability: 'Organization analytics — reach, events, membership and announcements',
    feature: '§21 Organization Analytics · §70 Analytics + Phase 12',
    screens: ['/analytics/organization/[id]', '/community-life/dashboard/analytics'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Since 20 Oct 2026 the organisation dashboard reads `GET /communities/organizations/{organizationId}/analytics` and `.../analytics/members` in every build and maps them onto the catalogue: active members (`reach.members`), and the three daily flows the route computes — members joined, confirmed volunteer hours and poll responses — as `organization.memberJoins`, `organization.volunteerHours` and `organization.pollResponses`, each with its series. Access is the organisation’s own `canViewAnalytics` capability, which is what the route requires. Event attendance (B12), donations (B15), followers and announcement reach are not computed by these routes and are named as unavailable.',
    coverage: 'partial',
    partiallyCoveredBy: 'Phase 12 `organizationAnalytics` gap (COMMUNITY-GAP series)',
    existingBackendCapability: [
      'Phase 12’s organization analytics adapter supplies five real-shaped series.',
      '`GET /community-life/organizations/{id}` is a real profile with a real membership programme.',
      '`GET /financial/giving/me` and the donation contracts are real.',
    ],
    missingBackendCapability: [
      'Profile view and announcement reach counts',
      'Community reach for an organization, which needs the community association from Phase 13 GAP-009',
      'A capability distinguishing an organization administrator from a member (Phase 12 covers this for its own surfaces)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/organizations/{organizationId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; metrics?; breakdowns?: community|country|category',
        response: '{ data: AnalyticsDataset }',
        aggregation: 'Daily rollup keyed by (date, organizationId, metric).',
        authorization: 'Organization roles with the reporting capability, plus platform administrators.',
        permission: 'analytics.organization.read',
        pagination: null,
        filtering: 'community, country, category',
        sorting: null,
      },
    ],
    metrics: ['organization.followers', 'organization.announcementReach', 'event.rsvps', 'reach.members'],
    dimensions: ['date', 'community', 'country', 'category'],
    filters: ['community', 'country', 'category'],
    caching: 'Keyed by organization id.',
    freshness: 'Nightly; donation totals live from the ledger.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      'Half of it is genuinely absent (views, reach) and half already has an adapter that this phase reuses. Rebuilding the half that exists would be the duplication §3 forbids.',
    privacyConsiderations: `${SUPPRESSION_RULE} A donor is a person and a small campaign’s donor count plus an amount can identify one; donation analytics stays at the aggregate the existing Phase 12 transparency contract already publishes.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'B12-community-life',
    priority: 'medium',
    recommendedPhase: 'B19 Community Insights',
  },

  eventAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-015',
    // CONNECTED, and genuinely. GET /analytics/content/event/{eventId} — the endpoint declared
    // below — returns a real `AnalyticsDatasetResponse`: `AnalyticsContentTypes.FromRouteSegment`
    // maps `event`. The bespoke GET /community-life/events/{eventId}/analytics also exists and
    // returns flat counters; it is an additional route, not this one. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'connected',
    key: 'eventAnalytics',
    capability: 'Event analytics — discovery, registration and attendance',
    feature: '§23 Event Analytics · §24 Organization / Community Event Analytics',
    screens: ['/analytics/content/event/[id]', '/analytics/organization/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Event analytics is a *subject* of the shared content dataset rather than a second system — §23 forbids creating one and this phase creates none. Registration counts are real: `GET /community-life/events/{id}` already returns them. Views, shares and attendance are the development provider’s. §24 is honoured by the dataset carrying community and organization dimensions, so an event that belongs to an organization reports under both without a second contract.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /community-life/events` and `/events/{id}` are real, with registration counts and capacity.',
      'Phase 12’s event registration and cancellation flows are real-shaped.',
    ],
    missingBackendCapability: [
      'Event view and share counts',
      'Attendance, which requires check-in that no contract supports',
      'Discovery attribution — whether a registration came from the map, search, a rail or a notification',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/content/event/{eventId}',
        method: 'GET',
        request: 'from; to; timezone; granularity; breakdowns?: source|community|country',
        response: '{ data: AnalyticsDataset }',
        aggregation: 'Shares GAP-008’s content rollup, keyed by contentType `event`.',
        authorization: 'The organizer, the owning organization’s reporting roles, plus platform administrators.',
        permission: 'analytics.content.read.own',
        pagination: null,
        filtering: 'source, community, country',
        sorting: null,
      },
    ],
    metrics: ['content.views', 'event.rsvps', 'event.attendance', 'event.attendanceRate'],
    dimensions: ['date', 'source', 'community', 'country'],
    filters: ['source', 'community', 'country'],
    caching: 'Keyed by content type `event` and event id.',
    freshness: 'Registrations live; views and attendance nightly.',
    realtimeRequirement:
      'A registration count that is live during a popular event is genuinely useful, and the existing event read already provides it. Analytics does not need a second live path.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      'Attendance is not merely unrecorded — there is no check-in flow to record it. Showing an attendance figure would mean inventing the fact that somebody turned up.',
    privacyConsiderations: `An attendee list is not analytics. Counts only. A small event’s attendance breakdown by community identifies who came. ${NO_PII_RULE}`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'B12-community-life',
    priority: 'medium',
    recommendedPhase: 'B19 Community Insights',
  },

  funnelAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-016',
    key: 'funnelAnalytics',
    capability: 'Funnel analytics — counts, rates and drop-off across a defined journey',
    feature: '§32 Funnel Analytics',
    screens: ['/analytics/funnel/[key]', '/analytics/provider', '/analytics/seller', '/analytics/employer'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'One reusable funnel visualization serves every journey in §32 — job, marketplace, housing, provider and monetization — with counts, conversion from previous, conversion from start, drop-off, the period and the applied filters. The client computes conversion between adjacent steps **only when the server did not**, and when it does the funnel is marked `client-derived` rather than presented as a server figure. §32 forbids inventing funnel events, and the four funnels shipped are exactly the four the brief names.',
    coverage: 'none',
    existingBackendCapability: [
      'The terminal steps of three funnels are real records: a completed sale, a submitted application, a submitted enquiry.',
    ],
    missingBackendCapability: [
      'Every non-terminal step — impressions, views, saves, contacts',
      'A stated attribution window per funnel',
      'Deduplication, so one person doing a step twice is one person',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/funnels/{funnelKey}',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; filters?',
        response:
          '{ data: { key, label, attributionWindow, steps: [{ key, label, count, conversionFromPrevious, conversionFromStart, dropOffFromPrevious }], computedAt, sourceName } }',
        aggregation:
          'Distinct people per step within one attribution window, not event counts. A funnel built from independently-counted events is not a funnel: steps can exceed the step before them and the drop-off becomes negative.',
        authorization: 'The subject’s owner, plus platform administrators.',
        permission: 'analytics.funnel.read',
        pagination: null,
        filtering: 'category, community, country, source, placement',
        sorting: null,
      },
    ],
    metrics: ['conversion.rate', 'conversion.count', 'funnel.dropOffRate'],
    dimensions: ['date', 'category', 'community', 'country', 'source'],
    filters: ['category', 'community', 'country', 'source', 'placement'],
    caching: 'Keyed by funnel key, subject type, subject id, range and filters.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Raw events for at least the longest attribution window plus the deepest range offered.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `${SUPPRESSION_RULE} A funnel is a journey, and a journey with a step count of one is one person’s journey.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MONEY — §16, §30, §31, §67, §68
  // ═══════════════════════════════════════════════════════════════════════════

  monetizationAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-017',
    key: 'monetizationAnalytics',
    capability: 'Monetization analytics — placement performance, spend, revenue and ROI',
    feature: '§31 Monetization Analytics · §67 Analytics + Phase 6',
    screens: ['/analytics/monetization', '/monetization/analytics'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Monetization analytics **already existed** behind Phase 6’s `analytics.advanced` entitlement, and both halves of that are kept: the entitlement gate is real and remains real, and the premium dataset is normalised into the Phase 15 model through the adapter. What this phase adds is spend against revenue over time, per-product breakdowns and the placement funnel. **ROI is deliberately absent** where attribution is: §31 forbids fabricating ROI without proper attribution data, and rather than showing a plausible number the card renders "needs conversion attribution" and names the gap.',
    coverage: 'partial',
    partiallyCoveredBy: 'MON-GAP-010 (premium analytics)',
    existingBackendCapability: [
      'Phase 6’s entitlement catalogue and `analytics.advanced` gate are real on real plans.',
      '`GET /financial/placements/me`, `/purchases` and `/subscriptions/me` are real records of what was bought.',
      'Phase 6’s premium analytics adapter supplies headline metrics, breakdowns and top subjects.',
    ],
    missingBackendCapability: [
      'Impression and click counts per placement',
      'Conversion attribution — which purchase followed which placement',
      'Revenue attributable to a placement, without which ROI is unproduceable',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/monetization',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; granularity; breakdowns?: placement|plan|category',
        response:
          '{ data: AnalyticsDataset } where every money metric carries `Money` and ROI is **omitted** rather than nulled when attribution is unavailable',
        aggregation:
          'Placement-level rollups. Attribution requires a click identifier carried through to the purchase; without it, revenue-per-placement is unknowable and must not be approximated by proportional allocation.',
        authorization: 'The spender, plus platform administrators. Entitlement-gated for advanced breakdowns.',
        permission: 'analytics.monetization.read.own',
        pagination: null,
        filtering: 'placement, plan, category, community',
        sorting: 'By spend or revenue, server-side.',
      },
    ],
    metrics: ['monetization.impressions', 'monetization.clicks', 'spend.total', 'revenue.gross'],
    dimensions: ['date', 'placement', 'plan', 'category', 'community'],
    filters: ['placement', 'plan', 'category', 'community'],
    caching: 'Keyed by subject and range. Premium data is fetched only once the entitlement resolves true.',
    freshness: 'Spend live from the ledger; performance nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Placement events for the longest attribution window offered; spend follows B15 retention.',
    whyNotImplementable:
      'ROI without attribution is a fabrication with a decimal point. Allocating revenue across concurrent placements in proportion to spend produces a number that always looks reasonable and is never right.',
    privacyConsiderations: `Spend is financial data and is the spender’s own. It must never appear on a public profile or in a community-visible aggregate. ${NO_PII_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} Premium analytics must not be sent to a device that has not bought it and then hidden in the UI — anything on the device is available to anybody with a debugger. Phase 6 established this and the phase-15 hooks keep it: the query does not fire while the entitlement is false.`,
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  walletAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-018',
    // PARTIAL, not connected. GET /financial/wallets/me/analytics returns per-currency totals as
    // `Money` — one row per currency, never summed, exactly as declared — but **no series**, and
    // `entryType` where the note below says `category`. The wallet screen already renders
    // `series: []` with no gap key, so nothing on it changes. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'walletAnalytics',
    capability: 'Wallet and payment analytics — money in, money out, and what it was for',
    feature: '§30 Wallet & Payment Analytics · §68 Analytics + Phase 5',
    screens: ['/analytics/wallet', '/wallet/statement'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'This is the most connected surface in the phase and the one where §5 matters most. Deposits, withdrawals, refunds, donations, contributions and transaction counts are **computed on the device from the real B15 transaction ledger**, which the wallet screens already read. That makes them backend-sourced and client-derived, and every card says so — §5 forbids presenting a client-computed figure as an authoritative server metric, and the two-axis provenance model is what lets the card be honest instead of choosing between two wrong labels. §30 and §68 forbid recreating financial calculations; the client sums signed minor units by currency and does no conversion, no netting across currencies and no fee arithmetic.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /financial/wallets/me` and `/wallets/me/transactions` are real, cursor-paged, and carry a signed `Money` and a category per entry.',
      '`GET /financial/giving/me` and `/purchases` are real.',
      '`lib/money.ts` already provides exact minor-unit arithmetic, reused unchanged.',
    ],
    missingBackendCapability: [
      'A server-side wallet aggregate, so a long period does not require paging the whole ledger to the device',
      'Category rollups per period',
      'A stated multi-currency policy for a member holding two currencies',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /financial/wallets/me/analytics',
        method: 'GET',
        request: 'from; to; timezone; granularity; groupBy?: category|direction|currency',
        response:
          '{ data: { totals: [{ currency, direction, category, amount: Money }], series, computedAt } } — one row per currency, never a summed total across currencies',
        aggregation:
          'Server-side sum over the ledger, grouped by currency. Cross-currency totals must not be produced: the platform does not convert, so a single "total" would require an exchange rate it has no authority to pick.',
        authorization: 'Self only. There is no wallet analytics route that takes a user id.',
        permission: 'financial.wallet.read.self',
        pagination: null,
        filtering: 'category, direction, currency',
        sorting: null,
      },
    ],
    metrics: ['wallet.deposits', 'wallet.withdrawals', 'wallet.transactions', 'spend.total'],
    dimensions: ['date', 'category'],
    filters: ['category'],
    caching:
      'Self-scoped. The client-derived aggregate is memoised from the existing transaction query rather than fetched separately, so opening the analytics view costs no extra request.',
    freshness: 'Live, because the ledger is. Labelled as computed on this device.',
    realtimeRequirement: 'None beyond the existing wallet invalidation.',
    dataRetention: 'Unchanged — B15’s existing financial retention governs.',
    whyNotImplementable:
      'It *is* implemented, correctly, and the gap is one of scale rather than of capability. Paging a year of transactions to a phone to sum them works and is wrong for a heavy user, which is why the server-side aggregate is registered. The client caps how far it will page and says when a period is truncated rather than silently reporting a partial total.',
    privacyConsiderations: `Financial data is the member’s own and never leaves the device in aggregate form. No analytics event carries an amount: the existing telemetry allow-list reduces money to a currency and an order-of-magnitude band, and that rule is inherited unchanged.`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} Self-only by route design. No wallet figure is ever included in a community, organization or platform aggregate that another member can read.`,
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DISCOVERY AND COMMUNICATION — §25, §26, §27, §28, §29
  // ═══════════════════════════════════════════════════════════════════════════

  recommendationAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-019',
    // PARTIAL, not connected. GET /recommendations/operations/analytics is served but returns a
    // list of per-day `RecommendationAnalyticsResponse` rows, not an `AnalyticsDataset`. The rates
    // are computed server-side, which is the one property below it does honour. The client does
    // not read this route at all — `frontendStatus` still says DEVELOPMENT ADAPTER. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'recommendationAnalytics',
    capability: 'Recommendation performance — impressions, opens, saves, dismissals, conversions',
    feature: '§25 Recommendation Analytics',
    screens: ['/analytics/discovery'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The recommendation dashboard is complete: impressions, opens, click-through, saves, dismissals and conversions, broken down by surface and community. **No scoring or relevance computation happens in the frontend** — §25 forbids it and this phase implements none. Click-through is read from the contract rather than divided in the client, so the number a dashboard shows is the number the recommendation service computed.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /explore/recommendations` is real and is the engine surface the app already consumes.',
      'Phase 13 registered the community scope on recommendations as GAP-011; this gap is about their *performance*, which is a different contract.',
    ],
    missingBackendCapability: [
      'Any record of a recommendation being shown, opened or dismissed',
      'Conversion attribution from a recommendation to an action',
      'A relevance measure the engine is willing to publish',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/recommendations',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; breakdowns?: surface|community|category',
        response: '{ data: AnalyticsDataset } with rates computed server-side',
        aggregation:
          'Daily rollup keyed by (date, surface, community, category). Rates must be computed by the engine, not divided by the client — a client-computed CTR over a filtered breakdown silently changes the denominator.',
        authorization: 'Platform administrators; community moderators for their own community.',
        permission: 'analytics.recommendation.read',
        pagination: null,
        filtering: 'surface, community, category',
        sorting: null,
      },
    ],
    metrics: [
      'recommendation.impressions',
      'recommendation.clicks',
      'recommendation.clickThroughRate',
      'recommendation.dismissals',
    ],
    dimensions: ['date', 'surface', 'community', 'category'],
    filters: ['surface', 'community', 'category'],
    caching: 'Keyed by subject and range.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Raw recommendation events 90 days; rollups 25 months.',
    whyNotImplementable: `${EVENT_STREAM_DEPENDENCY} And §25 is explicit that recommendation scoring belongs to B14, so the frontend cannot fill the gap by computing relevance even in principle.`,
    privacyConsiderations: `A per-member recommendation history is a behavioural profile. Aggregates only. ${NO_PII_RULE}`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'B14-recommendation',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  searchAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-020',
    key: 'searchAnalytics',
    capability: 'Search analytics — volume, no-result rate, popular queries and conversion',
    feature: '§26 Search Analytics',
    screens: ['/analytics/discovery'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The search dashboard is complete: volume, no-result rate, click-through, search-to-action, popular queries and a category breakdown. Popular queries are shown **only as an aggregate the backend published**, with a minimum-frequency threshold — §26 forbids exposing individual search history as analytics, and a "popular queries" list with a long tail is exactly that.',
    coverage: 'none',
    existingBackendCapability: [
      '`GET /discovery/search` is a real cross-domain search route.',
      '`store/knowledge-search.ts` holds recent searches **on the device only**, and this phase does not send them anywhere.',
    ],
    missingBackendCapability: [
      'Server-side search logging with a frequency threshold',
      'A no-result flag on the search response, retained',
      'Search-to-action attribution within a session',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/search',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; breakdowns?: category|community|country',
        response:
          '{ data: AnalyticsDataset, popularQueries?: [{ query, count }] } where `popularQueries` omits any query below the publication threshold entirely',
        aggregation:
          'Queries normalised and counted, with a minimum-count threshold applied **before** storage rather than before display. A query seen once, stored, is a search-history record whatever the API does with it later.',
        authorization: 'Platform administrators; community moderators for their own community.',
        permission: 'analytics.search.read',
        pagination: 'Popular queries capped server-side.',
        filtering: 'category, community, country',
        sorting: 'By count descending.',
      },
    ],
    metrics: ['search.volume', 'search.noResultRate', 'search.clickThroughRate', 'search.toActionRate'],
    dimensions: ['date', 'category', 'community', 'country'],
    filters: ['category', 'community', 'country'],
    caching: 'Keyed by subject and range.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Normalised query counts 25 months. **Raw query strings with any member association must not be retained at all** — the aggregate is the record.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `Search queries are among the most revealing data any platform holds — a diaspora member searching for immigration advice, a clinic or a lawyer is disclosing something they did not choose to publish. The threshold and the prohibition on member association are the two rules that make this capability safe to build at all, and they belong in the contract rather than in a policy document. ${NO_PII_RULE}`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} There must be no route that returns searches for a member id, at any authorization level.`,
    owner: 'B14-recommendation',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  mapAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-021',
    key: 'mapAnalytics',
    capability: 'Map analytics — opens, marker interactions, location searches and routes',
    feature: '§27 Map Analytics · §69 Analytics + Phase 8',
    screens: ['/analytics/discovery', '/analytics/neighborhood/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The map analytics section is complete: opens, marker taps, cluster expansions, location searches, route requests and filter usage, broken down by layer and by coarse geography. It reuses **Phase 8’s existing map event vocabulary** unchanged — §27 and §69 forbid a second map system and this phase builds none. The geography dimension is Phase 8’s ~11 km analytics grid cell, never a coordinate.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 8’s `MapsEvent` vocabulary is complete and already emits, with coordinates banded and destinations absent.',
      '`coarseForAnalytics()` already produces the only geography permitted to leave a device.',
    ],
    missingBackendCapability: [
      'Ingestion for those events (GAP-029)',
      'Aggregation by grid cell with suppression',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/map',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; breakdowns?: layer|geoCell|community',
        response: '{ data: AnalyticsDataset }',
        aggregation:
          'Daily rollup keyed by (date, geoCell, layer). Cells below the suppression threshold must be merged upward or dropped, never returned with a small count.',
        authorization: 'Platform administrators; community moderators for their own community.',
        permission: 'analytics.map.read',
        pagination: null,
        filtering: 'layer, community, country',
        sorting: null,
      },
    ],
    metrics: ['map.opens', 'map.markerInteractions', 'map.locationSearches', 'map.routeRequests'],
    dimensions: ['date', 'community', 'neighborhood', 'category'],
    filters: ['category', 'community'],
    caching: 'Keyed by subject and range.',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Grid-cell aggregates 25 months. **Precise coordinates must never be retained**, which Phase 8 already guarantees on the client side by never emitting them.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `§27 forbids collecting precise location history. Phase 8 already made that structurally impossible on the client: latitude and longitude are absent from the analytics allow-list, so a call site that passes them has them dropped by the sanitiser. This gap inherits that guarantee and must not weaken it — an ingestion endpoint that accepted a coordinate would undo a phase of work.`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'location-platform',
    priority: 'low',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  notificationAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-022',
    // PARTIAL, not connected. GET /notifications/analytics is served but returns a bespoke
    // `NotificationAnalyticsResponse` — flat totals and rates with byChannel, byCategory and
    // byTemplate breakdowns. Not an `AnalyticsDataset`, and there is **no community dimension**,
    // which the aggregation below keys on. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'partial',
    key: 'notificationAnalytics',
    capability: 'Notification analytics — delivered, opened, dismissed, actioned',
    feature: '§28 Notification Analytics',
    screens: ['/analytics/communication'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The notification dashboard is complete: delivery, open, dismissal and action counts with read and action rates, broken down by category, channel and community. The **unread count is real** — `GET /notifications/unread-count` is certified — and renders as a backend figure beside the simulated rates. §28 forbids creating another notification service and this phase creates none; it reads B13’s existing categories as its dimension vocabulary.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /notifications`, `/notifications/categories` and `/notifications/unread-count` are all real.',
      'B13’s per-category preferences and channels are real and supply the breakdown dimensions.',
    ],
    missingBackendCapability: [
      'Delivery receipts per channel',
      'Open and dismissal recording',
      'An action definition — what counts as acting on a notification',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/notifications',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone; breakdowns?: category|channel|community',
        response: '{ data: AnalyticsDataset }',
        aggregation: 'Daily rollup keyed by (date, category, channel, community).',
        authorization: 'Platform administrators; organization and community roles for their own sends.',
        permission: 'analytics.notification.read',
        pagination: null,
        filtering: 'category, channel, community',
        sorting: null,
      },
    ],
    metrics: ['notification.delivered', 'notification.opened', 'notification.readRate', 'notification.actionRate'],
    dimensions: ['date', 'category', 'community'],
    filters: ['category', 'community'],
    caching: 'Keyed by subject and range.',
    freshness: 'Unread count live; rates nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Rollups 25 months; per-notification receipts 90 days.',
    whyNotImplementable: EVENT_STREAM_DEPENDENCY,
    privacyConsiderations: `Open rates per member are a presence signal — they say when somebody is looking at their phone. Aggregates only. ${NO_PII_RULE}`,
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'B13-notifications',
    priority: 'low',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  messagingAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-023',
    key: 'messagingAnalytics',
    capability: 'Messaging analytics — privacy-safe aggregates only',
    feature: '§29 Messaging Analytics',
    screens: ['/analytics/communication'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The messaging section is deliberately the smallest dashboard in the phase and shows only what §29 permits: conversations started, messages sent, response rate and unread rate. The **unread rate is real** — it is derived on the device from the member’s own conversation list, which they already have — and is marked client-derived. There is no contract, no hook and no type in this phase that could carry a message, a participant or a thread subject.',
    coverage: 'partial',
    existingBackendCapability: [
      'The whole of `/conversations/*` is real, and the member’s own list already carries unread state.',
    ],
    missingBackendCapability: [
      'Aggregate conversation and message counts',
      'A response-rate definition and the window it uses',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/messaging',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone',
        response:
          '{ data: AnalyticsDataset } — counts and rates only. The contract must expose no field that could carry message content, a participant or a thread identifier.',
        aggregation: 'Daily counts. Response rate over a stated window, computed server-side.',
        authorization:
          'The subject themselves for their own response rate; platform administrators for platform aggregates. **No role reads another member’s conversation metrics.**',
        permission: 'analytics.messaging.read.own / analytics.messaging.read.platform',
        pagination: null,
        filtering: 'community',
        sorting: null,
      },
    ],
    metrics: ['messaging.conversationsStarted', 'messaging.messagesSent', 'messaging.responseRate'],
    dimensions: ['date', 'community'],
    filters: ['community'],
    caching: 'Self-scoped where owner-level; keyed by subject otherwise.',
    freshness: 'Unread rate live from the member’s own list; counts nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Aggregate counts only. Message bodies are never an analytics input at any retention.',
    whyNotImplementable:
      'Aggregates over private conversations require the aggregation to happen inside the messaging service and only counts to leave it. That is a deliberate architectural boundary rather than a missing endpoint.',
    privacyConsiderations: `§29 is the strictest constraint in the brief and is treated as a hard boundary rather than a guideline. Message contents, private conversations and participant information never appear, and the enforcement is structural: there is no type in the Phase 15 model with a field for any of them, so no contract change on the backend could surface one without a corresponding frontend change that would be visible in review.`,
    securityConsiderations: `${SERVER_AUTHORITATIVE} An administrative messaging aggregate must be a count and must not be drillable to a conversation.`,
    owner: 'B13.2-messaging',
    priority: 'low',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  inventoryAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-024',
    key: 'inventoryAnalytics',
    capability: 'Inventory counts — how much of each thing exists, by place',
    feature: '§9 Platform Analytics · §11 Country Analytics · §14 Neighborhood Analytics',
    screens: ['/analytics/platform', '/analytics/country/[code]', '/analytics/neighborhood/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The one genuinely connected family in this phase. Guides, jobs, listings, housing, providers, organizations, events and updates are counted from the **real** certified list routes, which return a `totalCount` for a filter, and from `GET /location/nearby` and `GET /neighborhood/{id}`, which return real cross-domain aggregates. These cards render as backend figures with no gap notice, because they are not gaps. The registered gap is narrow and specific: these are counts *now*, with no history, and no way to count by community rather than by place.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /jobs`, `/housing`, `/marketplace`, `/listings` return a real `totalCount` honouring the filter.',
      '`GET /community-life/events` and `/organizations` return a real `totalCount`.',
      '`GET /location/nearby` genuinely aggregates six domains for a centre and radius.',
      '`GET /neighborhood/{id}` returns real `resourceCounts`.',
    ],
    missingBackendCapability: [
      'A count as of a past date, so the trend line has more than one point',
      'A `communityIds` filter, which Phase 13 registered as GAP-009 — until it lands, community inventory is a country projection and is labelled as one',
      'A single batched counts endpoint, so a dashboard does not need eight requests',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/inventory',
        method: 'GET',
        request:
          'scope: platform|country|community|neighborhood; scopeId?; asOf?: YYYY-MM-DD; types?: string[]',
        response: '{ data: { counts: [{ type, count, asOf }], computedAt, sourceName } }',
        aggregation:
          'One batched response rather than eight list requests with `limit=1`. The client does the latter today, which works and is wasteful.',
        authorization: 'Unchanged from each existing list route. A count must not reveal items the caller cannot see.',
        permission: 'Unchanged per domain.',
        pagination: null,
        filtering: 'scope, type',
        sorting: null,
      },
    ],
    metrics: ['inventory.guides', 'inventory.jobs', 'inventory.listings', 'inventory.housing'],
    dimensions: ['date', 'country', 'community', 'neighborhood'],
    filters: ['country', 'community', 'neighborhood', 'category'],
    caching:
      'Query key carries the scope and scope id. staleTime 10 minutes — an inventory count that changes minute to minute is not a metric anybody acts on.',
    freshness: 'Live, and labelled as a count taken at the moment of the request rather than a daily figure.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily snapshots for the history this gap asks for.',
    whyNotImplementable:
      'The counts themselves are implementable and are implemented. Only the history and the community dimension are missing, and both are registered rather than approximated.',
    privacyConsiderations:
      'A count of public listings is public information. The only sensitivity is the community dimension, which inherits Phase 13’s rules.',
    securityConsiderations:
      'A count must honour the caller’s visibility. Counting items the caller cannot list would leak the existence of private content.',
    owner: 'B17-platform',
    priority: 'low',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM CAPABILITIES — §43, §44, §45, §46, §48, §49
  // ═══════════════════════════════════════════════════════════════════════════

  analyticsAccess: {
    id: 'FRONTEND-PHASE15-GAP-025',
    backendStatus: 'connected',
    key: 'analyticsAccess',
    capability: 'Server-evaluated analytics permissions per caller and subject',
    feature: '§46 Role-Aware Analytics · §48 Security',
    screens: ['every analytics screen'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'Every analytics affordance in the application reads `AnalyticsAccess`, which the **server** fills in. `lib/analytics/access.ts` contains no code path that derives a capability from a role held on the device — the same discipline Phase 13 applied to `CommunityCapabilities`, and for the same reason §48 gives. Where no capability is reported the surface is **hidden** rather than shown-and-disabled, because a greyed-out "Platform analytics" entry tells a member that an administrative dashboard exists.',
    coverage: 'none',
    existingBackendCapability: [
      '**RESOLVED (Remediation Wave C-06).** `AnalyticsEndpoints.cs:42` serves every field this entry specified, field for field, and `fetchAnalyticsAccess` now calls it. `useAnalyticsAccess` selects the certified arm whenever the gap switch is off. This line used to end "connecting it is client work that has not been done", which is the sentence it replaces.',
      '**What connecting it revealed is worse than what it fixed, and it was a release-build-only failure.** The hook ran the gap query and nothing else, so with gaps disabled it never ran at all and every screen fell back to `noAnalyticsAccess()` — every capability false. A release build was not showing a member *less* analytics than a development build; it was showing them none.',
      '**`restrictedMetrics` was silently non-functional and a widened type would have hidden it.** The route sends Phase 7 **snake** keys (`content_views`) from `AnalyticsMetricCatalog.CreatorHeadline`; `canViewMetric` and the dataset both compare against Phase 15 **dotted** keys. Nothing could ever match, so no metric was ever restricted. Fixed at the boundary with `lib/analytics/catalogue-keys.ts`, which translates using the `key`/`catalogueKey` pairs the definitions route serves.',
      '**Four capabilities are hardcoded false on the server** — `canViewFinancial`, `canCompare`, `canExport`, `canBuildReports`. They are passed through untouched and their surfaces are hidden rather than disabled, per §48: a greyed-out control tells a member the capability exists.',
      'It answers **200 with everything false** rather than 403 when the caller may not view, and the client does not translate that into an error. `supportedRanges` is six presets and `supportedComparisons` is `["previousPeriod"]` alone; the client’s `DEFAULT_RANGES` fallback offered `thisMonth` and `previousMonth`, which this deployment refuses, and omitted `thisYear`, which it answers. Corrected.',
      'Phase 13’s `CommunityCapabilities` is exactly this shape for communities and is the pattern copied rather than a new one invented.',
      'Phase 13’s `CommunityCapabilities` is exactly this shape for communities and is the pattern copied rather than a new one invented.',
      'Phase 12’s `OrganizationCapabilities` covers organization reporting roles.',
      'Phase 6’s entitlement decisions are real and gate premium analytics today.',
      '`/trust/profile` already returns server-evaluated account state, the established precedent for authorization arriving as data.',
    ],
    missingBackendCapability: [
      'A capability set per (caller, analytics subject)',
      'A list of restricted metrics, so the server omits rather than the client hides',
      'The deployment’s reporting timezone and supported ranges, which are capabilities rather than constants',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/access',
        method: 'GET',
        request: 'subjectType; subjectId?',
        response:
          '{ data: { canView, canViewFinancial, canViewAdministrative, canCompare, canExport, canBuildReports, supportedRanges, supportedComparisons, restrictedMetrics, reportingTimezone } }',
        aggregation: 'None. This is an authorization read.',
        authorization:
          'Authenticated. Returns an all-false set rather than 403 for a caller with no access, so the existence of a dashboard is not confirmed by the status code.',
        permission: 'Evaluated per field by the server; the client evaluates none.',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    caching:
      'Query key `["analytics","access",subjectType,subjectId]`. staleTime 60 seconds — short, because a revoked role must stop being effective quickly — and invalidated on sign-out and on any role change event.',
    freshness: 'Live.',
    realtimeRequirement:
      'A role revocation should reach a running app. The existing `community.role.changed` event is the natural carrier.',
    dataRetention: 'None. Authorization is evaluated, not stored.',
    whyNotImplementable:
      '§48 forbids trusting frontend role state. Deriving `canViewAdministrative` from a role string on the auth user would be exactly that, and would render an administrative dashboard for somebody the server will refuse — which is worse than rendering nothing, because it teaches the member the data exists.',
    privacyConsiderations:
      'An all-false set for a non-privileged caller must not reveal which dashboards exist. The client renders nothing rather than a locked list.',
    securityConsiderations: `${SERVER_AUTHORITATIVE} This gap is the linchpin: every other gap’s authorization line depends on it being real. It should land first.`,
    owner: 'identity-platform',
    priority: 'critical',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  analyticsExport: {
    id: 'FRONTEND-PHASE15-GAP-026',
    key: 'analyticsExport',
    capability: 'Analytics export — CSV, PDF and share',
    feature: '§43 Export',
    screens: ['/analytics/export', 'every dashboard’s export action'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The complete export experience is built: format selection, a summary of exactly what will be exported, an asynchronous job with queued, running, ready and failed states, and a share/download action when ready. It is **asynchronous by design** — §43 forbids downloading massive datasets directly from the client, and a design where the client assembles the file would make that failure the default. The client never builds a CSV from a year of paged rows.',
    coverage: 'none',
    existingBackendCapability: ['Nothing. No export route of any kind exists.'],
    missingBackendCapability: [
      'Export job creation, status and retrieval',
      'A signed, short-lived download URL',
      'A row cap and a documented behaviour when a query exceeds it',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /analytics/exports',
        method: 'POST',
        request: '{ query: AnalyticsQuery, format: csv|pdf|json }',
        response: '{ data: { exportId, status, requestedAt } }',
        aggregation: 'The export runs the same aggregation as the dashboard, so the two cannot disagree.',
        authorization: 'Requires `canExport` for the subject. The export inherits the caller’s restrictions exactly — a restricted metric must not appear in a file that the dashboard would have withheld.',
        permission: 'analytics.export.create',
        pagination: null,
        filtering: null,
        sorting: null,
      },
      {
        endpoint: 'GET /analytics/exports/{exportId}',
        method: 'GET',
        request: 'None beyond the path.',
        response: '{ data: AnalyticsExport } including a signed `downloadUrl` when ready',
        aggregation: 'None.',
        authorization: 'The requester only. An export id must not be guessable or shareable.',
        permission: 'analytics.export.read.own',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: 'The job is polled while running with a bounded interval, and not cached once terminal.',
    freshness: 'The export states the range and the computedAt of the data it contains.',
    realtimeRequirement: 'Polling is sufficient. A push on completion would be a convenience, not a requirement.',
    dataRetention: 'Generated files expire — 24 hours is ample and the model carries `expiresAt` for it.',
    whyNotImplementable:
      'A client-side export of an analytics query is either small enough to be pointless or large enough to be an out-of-memory crash on a phone. The asynchronous shape is not a workaround for a missing endpoint; it is the correct design and the endpoint is missing.',
    privacyConsiderations:
      'An exported file leaves every protection the app provides. It must carry the same suppression and the same metric restrictions as the dashboard, and the URL must expire — a permanent link to a platform analytics CSV in somebody’s downloads folder is a data breach waiting for a lost laptop.',
    securityConsiderations: `${SERVER_AUTHORITATIVE} The download URL must be signed and short-lived, and the export must be re-authorized at download time rather than only at request time.`,
    owner: 'analytics-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  savedReports: {
    id: 'FRONTEND-PHASE15-GAP-027',
    key: 'savedReports',
    capability: 'Report builder and saved reports',
    feature: '§44 Report Builder · §45 Saved Reports',
    screens: ['/analytics/reports', '/analytics/reports/build', '/analytics/reports/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The report builder is complete: pick a subject, metrics, a date range, a comparison, a breakdown dimension and a visualization; preview it against live data; save, rerun, favourite, rename and delete. Saved, recent and favourite reports each have their own list. Sharing is built and **deliberately limited to the sharing levels the server would evaluate** — the client offers private, community, organization and platform, and does not pretend that choosing one grants anybody access, because it does not.',
    coverage: 'none',
    existingBackendCapability: ['Nothing.'],
    missingBackendCapability: [
      'Report persistence with an owner',
      'Report sharing with server-evaluated visibility',
      'A rule for a shared report whose recipient lacks the capability for its metrics',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/reports',
        method: 'GET',
        request: 'scope?: mine|shared|favorites; cursor?; limit?',
        response: '{ data: AnalyticsReport[], meta: { nextCursor, hasMore } }',
        aggregation: 'None. This is configuration storage.',
        authorization: 'Authenticated. Returns the caller’s own reports plus those genuinely shared with them.',
        permission: 'analytics.report.read',
        pagination: 'Cursor-based.',
        filtering: 'scope',
        sorting: 'By updatedAt descending.',
      },
      {
        endpoint: 'POST /analytics/reports',
        method: 'POST',
        request: '{ name, description?, query, visualization, sharing }',
        response: '{ data: AnalyticsReport }',
        aggregation: 'None.',
        authorization:
          'Requires `canBuildReports`. The server must reject a report whose query names a subject or metric the caller may not read — otherwise a report is a way to launder an authorization failure into a saved object.',
        permission: 'analytics.report.write',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: 'Report list keyed by scope; a report’s *results* use the ordinary dataset key for its query.',
    freshness: 'A saved report shows the freshness of the data it ran against, not of the report definition.',
    realtimeRequirement: 'None.',
    dataRetention: 'Report definitions live as long as their owner’s account.',
    whyNotImplementable:
      'A report saved only on the device is not a saved report — it does not survive a reinstall, cannot be shared, and would make the second device show a different set. And storing a shared report client-side would mean the client deciding who may read it, which is §48’s prohibition.',
    privacyConsiderations:
      'A shared report is a data-sharing act. The recipient’s own restrictions must be applied at run time, not the author’s — a report built by an administrator and shared into a community must not run with administrative visibility for a member.',
    securityConsiderations: `${SERVER_AUTHORITATIVE} Report execution is the subtlest authorization surface in the phase: the query inside a saved report must be re-authorized on every run, against the caller, every time.`,
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B20 Analytics Reporting',
  },

  analyticsInsights: {
    id: 'FRONTEND-PHASE15-GAP-028',
    key: 'analyticsInsights',
    capability: 'Platform-authored insights — short statements about what the data shows',
    feature: '§3 Analytics Domain Architecture (AnalyticsInsight)',
    screens: ['/analytics/platform', '/analytics/creator', '/analytics/community/[id]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The insight surface is built and renders whatever the platform publishes, with a tone, an optional action and a source marker. It generates **nothing** on the device. "Your Tuesday posts do better" is an analysis, and a client that produced one would be inventing a finding nobody could reproduce or audit — the same rule §25 applies to recommendation scoring. Where the backend publishes no insights the section is absent rather than filled with generated filler.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 7’s creator recommendations are a real-shaped precedent for server-authored next actions.',
    ],
    missingBackendCapability: [
      'Any insight generation',
      'A confidence or sample-size statement, so an insight from three data points is distinguishable from one from three thousand',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/insights',
        method: 'GET',
        request: 'subjectType; subjectId?; from; to; timezone',
        response: '{ data: [{ key, headline, detail, tone, action, confidence, sampleSize }] }',
        aggregation: 'Server-side, with a stated method. An insight without a method is an assertion.',
        authorization: 'Inherits the subject’s analytics capability exactly.',
        permission: 'analytics.insight.read',
        pagination: null,
        filtering: null,
        sorting: 'By importance, server-side.',
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: 'Keyed with the dataset. staleTime 15 minutes.',
    freshness: 'Nightly, with the underlying data.',
    realtimeRequirement: 'None.',
    dataRetention: 'None beyond the aggregates the insight is drawn from.',
    whyNotImplementable:
      'An insight is a claim. The client has one period of data and no way to know whether a change is significant, seasonal or noise, so any insight it generated would be confident and unfounded.',
    privacyConsiderations:
      'An insight can leak what an aggregate suppressed — "engagement from Rose Hill doubled" over a suppressed cell restates it in prose. Insights must be generated from suppressed aggregates, not from raw data.',
    securityConsiderations: SERVER_AUTHORITATIVE,
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B20 Analytics Reporting',
  },

  telemetryIngestion: {
    id: 'FRONTEND-PHASE15-GAP-029',
    backendStatus: 'connected',
    key: 'telemetryIngestion',
    capability: 'Event ingestion — somewhere for the platform’s telemetry to go',
    feature: '§49 Analytics Events · §50 Event Naming',
    screens: ['every screen that emits an event'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The client-side instrumentation is complete and has been since Phase 7: a closed event vocabulary per phase, one shared property allow-list applied at emit, amounts reduced to currency-and-magnitude bands, coordinates absent entirely, and a ring buffer that drops the oldest rather than growing. Phase 15 adds its own closed vocabulary in `lib/analytics/events.ts` and **no second buffer, sanitiser or transport** — the fourth phase in a row to extend the same module rather than fork it. What is still missing is one function’s worth of behaviour: somewhere to send the batch.',
    coverage: 'none',
    partiallyCoveredBy: 'CREATOR-GAP-016, which registered this first. This entry restates it at platform scope.',
    existingBackendCapability: [
      '**`POST /telemetry/events` now exists**, mapped by `TelemetryEndpointContributor` under its own `/api/v1/telemetry` prefix (`AnalyticsEndpoints.cs:225`). This array used to read "None for ingestion", and that sentence is the reason this line replaces it rather than sitting beside it.',
      'It answers **202** with per-event verdicts rather than a batch acknowledgement — the requirement stated below, honoured — and its own comment gives this entry’s reason back: a batch that answered "202, thanks" would leave a client unable to tell an accepted event from one the schema registry has never heard of.',
      'It reads the correlation id from the request context rather than the body, and accepts no client-supplied user identifier — which is the server-side half of the allow-list discipline this entry insists on.',
      '**The transport was already connected before this wave looked, and this array said otherwise.** `lib/telemetry-api.ts` drains the ring buffer and posts to the route, started from `app/_layout.tsx` on sign-in — Remediation Wave C-03. The sentence that stood here, "`deliver()` pushes to the buffer and nothing drains it to the route", had been false since that wave landed. Checking is what C-06 did, rather than writing a second transport beside the one that existed.',
      '**PARTIAL, and what remains is at the emitter rather than on the wire.** The server registry accepts seven client-submittable names; this app emits four of them — `automation.tested`, `automation.builder.started`, `automation.builder.abandoned`, `automation.gap.encountered`. It emits **none** of `content.viewed`, `profile.viewed` or `content.impression`, which is precisely why `content.views` and `content.uniqueViewers` come back `AWAITING_SOURCE`. Every other name across the five client vocabularies is refused with `analytics.ingest.event-unknown`.',
      '**And every one of those refusals was invisible.** Nothing inspected `results[].status`, so a batch of rejections read exactly like a batch of acceptances. `flushTelemetry` now folds the per-event verdicts into per-reason counts and reports them through the same development warning path the emitter uses, and `partitionForDelivery` filters unsubmittable events out **before** posting rather than sending a batch the client already knows will be refused.',
      'The client mirrors the server’s own limits so a batch is not refused wholesale: the 50-event cap (exceeding it fails the **whole** request with `analytics.ingest.batch-invalid`, not the offending event), the 24-key ingest property allow-list, the 64-character value cap, `RequiresContent`, the 48-hour age limit and the 15-minute forward clamp.',
      '**The ingest allow-list is far narrower than the emit allow-list** — 24 keys against roughly 70. A property key that is legal at emit and illegal at ingest refuses the entire event, not just the key.',
      'Two refusals are left to the server on purpose, because only it can decide them: `analytics.ingest.self-excluded` (an owner viewing their own item) and deduplication by actor, content and day. The client does not guess at either.',
    ],
    missingBackendCapability: [
      'A batch ingestion endpoint',
      'A schema registry, so an event the client emits and the backend does not know about is rejected visibly rather than silently dropped',
      'A retention and deletion policy, including what happens to a member’s events when they delete their account',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /telemetry/events',
        method: 'POST',
        request:
          '{ events: [{ event, properties, occurredAt }] } — batched, with `occurredAt` set at emit so a buffered event keeps the time it happened rather than the time it was delivered',
        response: '202 Accepted with per-event acceptance, so a rejected event is visible in development',
        aggregation: 'None at ingestion. Aggregation is downstream.',
        authorization:
          'Authenticated. The server associates events with the caller; **the client sends no user identifier**, which is why the allow-list has no `userId` and must never gain one.',
        permission: 'telemetry.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: 'Not a query. The buffer is bounded at 200 records and drops the oldest.',
    freshness: 'Not applicable.',
    realtimeRequirement:
      'None. Batching on an interval and on background is correct; a per-event request would be a battery and network cost for no analytical gain.',
    dataRetention:
      'Raw events 90 days is sufficient for every aggregate in this register. Account deletion must delete or irreversibly anonymise the member’s events, and this needs to be settled before ingestion ships rather than after.',
    whyNotImplementable:
      'This is the blocker for two thirds of this register and it is one function: `deliver()` in `lib/creator-analytics.ts` currently pushes to a buffer and nothing reads it. Nothing else in the app changes when it gains a destination — which is the point of having centralised it four phases ago.',
    privacyConsiderations:
      'The allow-list is the whole privacy design and it must not be weakened at the ingestion end. An endpoint that accepted arbitrary properties would make the client-side sanitiser advisory. The server should reject unregistered property keys rather than store them.',
    securityConsiderations:
      'The endpoint is a write path open to every client, so it needs rate limiting and a payload cap. It must not accept an arbitrary `occurredAt` far in the past or future without clamping.',
    owner: 'B17-platform',
    priority: 'critical',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  metricCatalogue: {
    id: 'FRONTEND-PHASE15-GAP-030',
    // CONNECTED. GET /analytics/definitions is served and consumed correctly. Its shape differs
    // from the note below: `data` is an envelope `{ version, definitions[] }`, not an array with
    // `meta.version` — `analytics-api.ts` already reads it that way. Payload traced in source 13 Sep 2026, not inferred from the path.
    backendStatus: 'connected',
    key: 'metricCatalogue',
    capability: 'Server-published metric definitions',
    feature: '§35 Analytics Definitions · §63 Analytics Definitions Catalog',
    screens: ['/analytics/definitions', 'every metric card’s definition sheet'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The catalogue is complete and lives in `lib/analytics/definitions.ts` as a `Record` keyed by the metric union, so a metric without a definition is a compile error. Every metric card can show its definition, formula, owner, freshness policy and privacy class. The client ships the catalogue rather than fetching it, which is the right trade today — a definition the app cannot show because the network is down is worse than one that is a release behind — and the gap is that the *backend* has no definition of its own to disagree with.',
    coverage: 'none',
    existingBackendCapability: [
      '**`GET /analytics/definitions` is now certified and served** — `AnalyticsEndpoints.cs:56`. `AnalyticsDefinitionResponse` carries `key`, `catalogueKey`, `label`, `definition`, `formula`, `format`, `higherIsBetter`, `privacyClass`, `owner` and `freshnessPolicy`, and it carries **both** key spaces at once — the Phase 7 key the client switches on and the Phase 15 dotted catalogue key — which is what makes a reconciliation against `lib/analytics/definitions.ts` possible rather than a guess.',
      '**RESOLVED (Remediation Wave C-06).** `fetchAnalyticsDefinitions` calls it, `useAnalyticsDefinitions` exposes it and `/analytics/definitions` reads it. The two catalogues no longer diverge unwatched: the arm **reconciles** rather than replaces, joining on `catalogueKey`. The server’s `definition`, `formula`, `status`, `owner` and `freshnessPolicy` win, because those are what a definitions page exists to be right about; the client’s `label`, `format`, `higherIsBetter`, `privacyClass`, `dimensions` and `subjects` win, because those decide how a *tile* renders and a definitions page disagreeing with the card beside it is worse than either being a release behind.',
      '**The response is an envelope, not a list.** `AnalyticsDefinitionsResponse` is `{ version, definitions }`, so the body is `{ data: { version, definitions: [...] } }`. The contract declared below says `{ data: { version, definitions: AnalyticsDefinition[] } } — an envelope inside `data`, not an array`, and a client written from that declaration calls `.map` on `undefined` — the same failure `/rewards/rules` produced.',
      'Two status vocabularies share exactly one member. The server sends `CONNECTED | AWAITING_SOURCE | NOT_MEASURED`; this client’s union is `CONNECTED | PARTIAL | DEVELOPMENT_ADAPTER | BACKEND_GAP`. The arm maps `AWAITING_SOURCE` to `PARTIAL` and `NOT_MEASURED` to `BACKEND_GAP`, and keeps the shipped value for anything it does not recognise rather than guessing.',
      'The client still ships its own catalogue and that is deliberate, not residue: a definition the app cannot show because the network is down is worse than one a release behind. A failed fetch costs the reader the platform’s latest sentence, not the page.',
      'Phase 7’s creator metrics carry a served `definition` string, which is the precedent and the shape.',
      'Phase 7’s creator metrics carry a served `definition` string, which is the precedent and the shape.',
    ],
    missingBackendCapability: [
      'A definitions endpoint with a version',
      'A guarantee that a metric key means the same thing across subjects, which is what makes comparison meaningful',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /analytics/definitions',
        method: 'GET',
        request: 'None. Optionally `since` for a version check.',
        response: '{ data: { version, definitions: AnalyticsDefinition[] } } — an envelope inside `data`, not an array',
        aggregation: 'None.',
        authorization: 'Authenticated. Definitions are not sensitive.',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: 'staleTime 24 hours once a contract exists. Reference data changes with a deployment, not with a request.',
    freshness: 'Versioned. A definition change must bump the version so a chart can note the discontinuity.',
    realtimeRequirement: 'None.',
    dataRetention: 'Definition history retained, so an old report can state which definition it ran under.',
    whyNotImplementable:
      'It is implemented, client-side, and works. The gap matters when the backend starts computing metrics: two definitions of "engagement rate", one in this file and one in an aggregation job, is precisely the failure §35 exists to prevent, and only a shared source fixes it.',
    privacyConsiderations:
      'The definitions themselves describe method rather than data, so publishing them discloses nothing about any member. The one care needed is that the catalogue must not name a metric the deployment does not compute for anybody — a definition for "immigration status verified" would disclose that Diaspora intends to hold that, before it does.',
    securityConsiderations:
      'A read every dashboard trusts, which makes it worth thinking about even though it carries no member data. Two properties matter: it must be integrity-protected, because a tampered definition changes what a member believes a figure means without changing the figure; and it must be versioned rather than mutable in place, so a report cannot silently start running under a definition it was not built against. The client currently ships the catalogue, which sidesteps both — and is the reason this gap is medium rather than high.',
    owner: 'analytics-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },
};

/** The URL prefix every simulated analytics route lives under. */
export const ANALYTICS_GAP_PREFIX = '/analytics-gap/v0';

/**
 * Whether this build may reach the simulated analytics surfaces.
 *
 * Delegates to the platform's single switch rather than answering the question
 * itself. Seven phases now register gaps and one answer to "may this build
 * simulate?" is the only arrangement that cannot drift.
 */
export function areAnalyticsGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/** Every gap, for the register screen and the generated document. */
export function allAnalyticsGaps(): AnalyticsGap[] {
  return Object.values(ANALYTICS_GAPS);
}

/** The gaps a given screen depends on, so a screen can name its own. */
export function analyticsGapsForScreen(route: string): AnalyticsGap[] {
  return allAnalyticsGaps().filter((gap) => gap.screens.some((screen) => screen === route));
}
