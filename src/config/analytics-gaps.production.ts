// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `analytics-gaps.ts`, derived by
// `node scripts/generate-production-registers.js`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// `metro.config.js` and `scripts/production-stubs.js`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
//   existingBackendCapability — community/gaps only
//   frontendBehaviour — analytics/gaps, community/gaps, creator/gaps, map/diagnostics
//   existingSeams — creator/gaps only
//   whyNotImplementable — analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection
//   privacyConsiderations — analytics/gaps, community/gaps
//   securityConsiderations — analytics/gaps, community/gaps
//   caching — community/gaps only
//   integrationWork — map/diagnostics only
//   considerations — no reader outside the registers
//   requiredContracts — analytics/gaps, community/gaps — and emptying it takes the nested request, response, authorization, idempotency, aggregation and retryBehaviour shapes with it
//   currentBehaviour — map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS
//   missingBackendCapability — analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS and MULTI_COMMUNITY_GAPS
//
// Edit the source. `production-registers-drift.test.ts` fails if this file
// stops matching what this script would produce from it.

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
  '';

const NO_PII_RULE =
  '';

const SERVER_AUTHORITATIVE =
  '';

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
  '';

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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Any endpoint returning platform-wide totals as a time series',
      'A registered-user count, since no route exposes one',
      'An active-user definition applied consistently server-side (§34)',
      'A capability check distinguishing a platform administrator from a member',
    ],
    requiredContracts: [],
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
      '',
    freshness:
      'Nightly. The UI states "recomputed nightly" and shows the computedAt the server returns; it never claims a platform figure is live.',
    realtimeRequirement:
      'None. A platform total that updated live would be a wasteful subscription to a number nobody watches change.',
    dataRetention:
      'Daily rollups retained for at least 25 months, so a year-on-year comparison has a complete baseline. The raw events behind them need only 90 days.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A daily snapshot of every countable entity, retained, so a change over a period is a fact rather than a guess',
      'A definition of a "lost" member, so net change is not just joins',
      'Growth broken down by acquisition channel, which nothing currently records',
    ],
    requiredContracts: [],
    metrics: ['growth.members.net', 'growth.members.rate', 'growth.content.new', 'growth.*.new'],
    dimensions: ['date', 'country', 'community', 'contentType'],
    filters: ['country', 'community', 'contentType'],
    caching:
      '',
    freshness: 'Nightly, from the previous day’s snapshot. Today is never in a growth figure.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Snapshots retained for at least 25 months. This is the one gap where retention *is* the capability: growth is unknowable without history, and a deployment that starts snapshotting today cannot answer a year-on-year question until next year.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A session model — what starts one, what ends one, what counts as activity',
      'Distinct-member counting over a window, which requires either retained per-member activity or a probabilistic sketch',
      'A stated rule for whether a background push receipt counts as activity',
    ],
    requiredContracts: [],
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
    caching: '',
    freshness: 'Nightly. The current day’s DAU is incomplete and is drawn as a partial bucket.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Per-member activity days retained 400 days for a year-on-year comparison, or a rolling sketch per day retained indefinitely at negligible cost.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  retentionAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-004',
    // 20 Oct 2026. `GET /analytics/retention` is served (backend 52bb2e5) and
    // read by `fetchAnalyticsRetention` in every build. Offsets not yet begun
    // are null; cohorts older than the raw-event horizon come back in
    // `unavailableCohorts` and are listed as "Not counted" with the reason.
    backendStatus: 'connected',
    key: 'retentionAnalytics',
    capability: 'Retention analytics — cohort tables and churn',
    feature: '§33 Retention Analytics',
    screens: ['/analytics/retention'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Cohort assignment at registration, retained',
      'A retention definition — active at all, or active in a specific way',
      'A rule for members who delete their account mid-cohort',
    ],
    requiredContracts: [],
    metrics: ['retention.day1', 'retention.day7', 'retention.day30', 'retention.weekly', 'retention.churn'],
    dimensions: ['date', 'country', 'community'],
    filters: ['country', 'community'],
    caching:
      '',
    freshness: 'Nightly. A cohort is final only after its window elapses, and the UI says which are not.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Registration dates indefinitely; activity days for at least the longest offset plus the deepest cohort history offered.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A time series for any country figure — `CountryStatistics` is a snapshot with a `lastUpdatedAt` and no history',
      'A member population per country distinct from `residenceCountry` on the auth record',
      'Popular-category aggregates per country',
    ],
    requiredContracts: [],
    metrics: ['audience.users.total', 'growth.members.net', 'inventory.*', 'content.views'],
    dimensions: ['date', 'country', 'community', 'neighborhood', 'category'],
    filters: ['category', 'community', 'neighborhood'],
    caching:
      '',
    freshness: 'Inventory counts live; everything else nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
    owner: 'analytics-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  communityAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-006',
    // 20 Oct 2026. `GET /analytics/communities/{idOrSlug}` serves the community
    // dataset (backend a7a94da) to the people who run it; the owner arm reads it.
    // Partial: activity is not recorded per community and arrives in
    // `unavailableMetrics`, and the comparison contract is not built.
    backendStatus: 'partial',
    key: 'communityAnalytics',
    capability: 'Community analytics — growth, activity, engagement and reach per community',
    feature: '§12 Community Analytics · §13 Community Comparison · §65 Analytics + Phase 13',
    screens: ['/analytics/community/[id]', '/community/[slug]/statistics', '/community/compare'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    partiallyCoveredBy: 'FRONTEND-PHASE13-GAP-007 (community statistics) and GAP-008 (comparison)',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A time series for any community metric',
      'Member counts, which Phase 13 already registered as absent because there is no membership record to count',
      'Per-community engagement with a stated methodology',
      'Cross-community reach, which requires knowing which community a viewer belongs to — the most privacy-sensitive join in the platform',
    ],
    requiredContracts: [],
    metrics: ['reach.members', 'growth.members.net', 'reach.crossCommunity', 'content.*', 'inventory.*'],
    dimensions: ['date', 'country', 'community', 'neighborhood', 'category', 'contentType'],
    filters: ['country', 'neighborhood', 'category', 'contentType'],
    caching:
      '',
    freshness: 'Inventory counts live; growth and engagement nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'History for any neighbourhood figure',
      'Community presence per neighbourhood, which Phase 13 registered as GAP-015 and which requires suppression to be safe',
      'Map interaction counts per neighbourhood (see GAP-021)',
    ],
    requiredContracts: [],
    metrics: ['inventory.*', 'map.opens', 'content.views'],
    dimensions: ['date', 'neighborhood', 'community', 'category'],
    filters: ['category', 'community'],
    caching: '',
    freshness: 'Resource counts live; everything else nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'none',
    partiallyCoveredBy: 'CREATOR-GAP series (Phase 7 creator analytics and content performance)',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Any record that a view or an impression occurred',
      'Deduplicated reach, which requires per-viewer state the platform does not keep',
      'Traffic-source attribution — whether a view came from search, a rail, a share or a notification',
    ],
    requiredContracts: [],
    metrics: ['content.impressions', 'content.views', 'content.reach', 'content.engagementRate'],
    dimensions: ['date', 'source', 'country', 'community', 'contentType', 'surface'],
    filters: ['contentType', 'source', 'country', 'community'],
    caching:
      '',
    freshness:
      'Hourly would be ideal for a creator watching a new post; nightly is acceptable and is what the UI promises today.',
    realtimeRequirement:
      'None required. A live view counter is a product decision with a real cost and this phase does not assume one.',
    dataRetention: 'Daily per-item rollups 25 months; raw view events 90 days.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    partiallyCoveredBy: 'CREATOR-GAP-016 (telemetry transport) and the Phase 7 creator analytics gaps',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Reach and engagement as measurements rather than adapter output (GAP-008)',
      'Revenue attributed to a specific piece of content, which requires attribution the payment ledger does not carry',
      'An audience breakdown that is safe to publish (see privacy)',
    ],
    requiredContracts: [],
    metrics: ['content.*', 'reach.followers', 'reach.crossCommunity', 'revenue.*', 'rewards.*'],
    dimensions: ['date', 'community', 'country', 'contentType', 'source'],
    filters: ['contentType', 'community', 'country', 'source'],
    caching:
      '',
    freshness: 'Revenue live from the ledger; reach nightly. The two are labelled separately on the same screen.',
    realtimeRequirement: 'None.',
    dataRetention: 'As GAP-008. Revenue records follow B15’s existing financial retention, unchanged.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Search impression counts — recorded from the search screen and stored, with no metric published from them',
      // CORRECTED 13 Sep 2026. This read "call, message and directions taps are not reported
      // anywhere". A message is: enquiries are counted from a conversation's first message.
      'Call and directions taps — not reported anywhere',
      'A lead definition, which requires joining a contact action to a conversation reply',
    ],
    requiredContracts: [],
    metrics: ['provider.profileViews', 'provider.contactActions', 'provider.leads', 'conversion.rate'],
    dimensions: ['date', 'source', 'community', 'neighborhood'],
    filters: ['source', 'community', 'neighborhood'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months; raw interaction events 90 days.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      // CORRECTED 13 Sep 2026: views per listing are served, by the seller dataset and each
      // listing's own page. This line read "Impressions, views and saves per listing".
      'Impressions and saves per listing',
      'Offer and reservation counts as analytics rather than as records',
      'Attribution linking a placement purchase to the sales that followed it',
    ],
    requiredContracts: [],
    metrics: ['content.impressions', 'listing.contacts', 'listing.sales', 'revenue.gross', 'conversion.rate'],
    dimensions: ['date', 'category', 'community', 'placement'],
    filters: ['category', 'community', 'placement', 'status'],
    caching: '',
    freshness: 'Sales live from the ledger; discovery metrics nightly. Labelled separately.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months. Financial records follow B15’s existing retention.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Search-appearance counts per job',
      'Shortlist, interview and hire stages — published by Jobs, and not counted by analytics until a suppression rule makes a small count safe to show',
    ],
    requiredContracts: [],
    metrics: ['content.views', 'job.applications', 'job.applicationRate', 'conversion.rate'],
    dimensions: ['date', 'community', 'country', 'source'],
    filters: ['community', 'country', 'source', 'status'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Impression, save and search-appearance counts per listing',
      // Enquiries are counted since 13 Sep 2026; applications are published by Housing and not yet.
      'Application counts as aggregates',
      'Location performance broken down below city level, which needs the suppression rule to be safe',
    ],
    requiredContracts: [],
    metrics: ['content.impressions', 'housing.inquiries', 'housing.applications', 'conversion.rate'],
    dimensions: ['date', 'neighborhood', 'community', 'source'],
    filters: ['neighborhood', 'community', 'source', 'status'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    partiallyCoveredBy: 'Phase 12 `organizationAnalytics` gap (COMMUNITY-GAP series)',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Profile view and announcement reach counts',
      'Community reach for an organization, which needs the community association from Phase 13 GAP-009',
      'A capability distinguishing an organization administrator from a member (Phase 12 covers this for its own surfaces)',
    ],
    requiredContracts: [],
    metrics: ['organization.followers', 'organization.announcementReach', 'event.rsvps', 'reach.members'],
    dimensions: ['date', 'community', 'country', 'category'],
    filters: ['community', 'country', 'category'],
    caching: '',
    freshness: 'Nightly; donation totals live from the ledger.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Event view and share counts',
      'Attendance, which requires check-in that no contract supports',
      'Discovery attribution — whether a registration came from the map, search, a rail or a notification',
    ],
    requiredContracts: [],
    metrics: ['content.views', 'event.rsvps', 'event.attendance', 'event.attendanceRate'],
    dimensions: ['date', 'source', 'community', 'country'],
    filters: ['source', 'community', 'country'],
    caching: '',
    freshness: 'Registrations live; views and attendance nightly.',
    realtimeRequirement:
      'A registration count that is live during a popular event is genuinely useful, and the existing event read already provides it. Analytics does not need a second live path.',
    dataRetention: 'Daily rollups 25 months.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
    owner: 'B12-community-life',
    priority: 'medium',
    recommendedPhase: 'B19 Community Insights',
  },

  funnelAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-016',
    // 20 Oct 2026. `GET /analytics/funnels/{key}` is served (backend a7a94da) and
    // read by `fetchAnalyticsFunnel`. Steps are counted from recorded events; the
    // steps nothing records come back in `unavailableSteps` with a reason, and the
    // panel lists them as "Not recorded" instead of drawing a zero.
    backendStatus: 'connected',
    key: 'funnelAnalytics',
    capability: 'Funnel analytics — counts, rates and drop-off across a defined journey',
    feature: '§32 Funnel Analytics',
    screens: ['/analytics/funnel/[key]', '/analytics/provider', '/analytics/seller', '/analytics/employer'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Every non-terminal step — impressions, views, saves, contacts',
      'A stated attribution window per funnel',
      'Deduplication, so one person doing a step twice is one person',
    ],
    requiredContracts: [],
    metrics: ['conversion.rate', 'conversion.count', 'funnel.dropOffRate'],
    dimensions: ['date', 'category', 'community', 'country', 'source'],
    filters: ['category', 'community', 'country', 'source', 'placement'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Raw events for at least the longest attribution window plus the deepest range offered.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
    owner: 'analytics-platform',
    priority: 'high',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MONEY — §16, §30, §31, §67, §68
  // ═══════════════════════════════════════════════════════════════════════════

  monetizationAnalytics: {
    id: 'FRONTEND-PHASE15-GAP-017',
    // 20 Oct 2026. `/analytics/monetization` no longer asks the simulated
    // `/analytics-gap/v0/campaigns/{userId}`; it reads the advertising module's
    // own rollup, `GET /financial/placements/me/performance/summary`. The
    // `/analytics/campaigns/{id}` route is FUNDRAISING, not promotions. Partial:
    // revenue attribution and ROI are still not produceable.
    backendStatus: 'partial',
    key: 'monetizationAnalytics',
    capability: 'Monetization analytics — placement performance, spend, revenue and ROI',
    feature: '§31 Monetization Analytics · §67 Analytics + Phase 6',
    screens: ['/analytics/monetization', '/monetization/analytics'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    partiallyCoveredBy: 'MON-GAP-010 (premium analytics)',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Impression and click counts per placement',
      'Conversion attribution — which purchase followed which placement',
      'Revenue attributable to a placement, without which ROI is unproduceable',
    ],
    requiredContracts: [],
    metrics: ['monetization.impressions', 'monetization.clicks', 'spend.total', 'revenue.gross'],
    dimensions: ['date', 'placement', 'plan', 'category', 'community'],
    filters: ['placement', 'plan', 'category', 'community'],
    caching: '',
    freshness: 'Spend live from the ledger; performance nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Placement events for the longest attribution window offered; spend follows B15 retention.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A server-side wallet aggregate, so a long period does not require paging the whole ledger to the device',
      'Category rollups per period',
      'A stated multi-currency policy for a member holding two currencies',
    ],
    requiredContracts: [],
    metrics: ['wallet.deposits', 'wallet.withdrawals', 'wallet.transactions', 'spend.total'],
    dimensions: ['date', 'category'],
    filters: ['category'],
    caching:
      '',
    freshness: 'Live, because the ledger is. Labelled as computed on this device.',
    realtimeRequirement: 'None beyond the existing wallet invalidation.',
    dataRetention: 'Unchanged — B15’s existing financial retention governs.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Any record of a recommendation being shown, opened or dismissed',
      'Conversion attribution from a recommendation to an action',
      'A relevance measure the engine is willing to publish',
    ],
    requiredContracts: [],
    metrics: [
      'recommendation.impressions',
      'recommendation.clicks',
      'recommendation.clickThroughRate',
      'recommendation.dismissals',
    ],
    dimensions: ['date', 'surface', 'community', 'category'],
    filters: ['surface', 'community', 'category'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Raw recommendation events 90 days; rollups 25 months.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Server-side search logging with a frequency threshold',
      'A no-result flag on the search response, retained',
      'Search-to-action attribution within a session',
    ],
    requiredContracts: [],
    metrics: ['search.volume', 'search.noResultRate', 'search.clickThroughRate', 'search.toActionRate'],
    dimensions: ['date', 'category', 'community', 'country'],
    filters: ['category', 'community', 'country'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Normalised query counts 25 months. **Raw query strings with any member association must not be retained at all** — the aggregate is the record.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Ingestion for those events (GAP-029)',
      'Aggregation by grid cell with suppression',
    ],
    requiredContracts: [],
    metrics: ['map.opens', 'map.markerInteractions', 'map.locationSearches', 'map.routeRequests'],
    dimensions: ['date', 'community', 'neighborhood', 'category'],
    filters: ['category', 'community'],
    caching: '',
    freshness: 'Nightly.',
    realtimeRequirement: 'None.',
    dataRetention:
      'Grid-cell aggregates 25 months. **Precise coordinates must never be retained**, which Phase 8 already guarantees on the client side by never emitting them.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Delivery receipts per channel',
      'Open and dismissal recording',
      'An action definition — what counts as acting on a notification',
    ],
    requiredContracts: [],
    metrics: ['notification.delivered', 'notification.opened', 'notification.readRate', 'notification.actionRate'],
    dimensions: ['date', 'category', 'community'],
    filters: ['category', 'community'],
    caching: '',
    freshness: 'Unread count live; rates nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Rollups 25 months; per-notification receipts 90 days.',
    whyNotImplementable: '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Aggregate conversation and message counts',
      'A response-rate definition and the window it uses',
    ],
    requiredContracts: [],
    metrics: ['messaging.conversationsStarted', 'messaging.messagesSent', 'messaging.responseRate'],
    dimensions: ['date', 'community'],
    filters: ['community'],
    caching: '',
    freshness: 'Unread rate live from the member’s own list; counts nightly.',
    realtimeRequirement: 'None.',
    dataRetention: 'Aggregate counts only. Message bodies are never an analytics input at any retention.',
    whyNotImplementable:
      '',
    privacyConsiderations: '',
    securityConsiderations: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A count as of a past date, so the trend line has more than one point',
      'A `communityIds` filter, which Phase 13 registered as GAP-009 — until it lands, community inventory is a country projection and is labelled as one',
      'A single batched counts endpoint, so a dashboard does not need eight requests',
    ],
    requiredContracts: [],
    metrics: ['inventory.guides', 'inventory.jobs', 'inventory.listings', 'inventory.housing'],
    dimensions: ['date', 'country', 'community', 'neighborhood'],
    filters: ['country', 'community', 'neighborhood', 'category'],
    caching:
      '',
    freshness: 'Live, and labelled as a count taken at the moment of the request rather than a daily figure.',
    realtimeRequirement: 'None.',
    dataRetention: 'Daily snapshots for the history this gap asks for.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations:
      '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A capability set per (caller, analytics subject)',
      'A list of restricted metrics, so the server omits rather than the client hides',
      'The deployment’s reporting timezone and supported ranges, which are capabilities rather than constants',
    ],
    requiredContracts: [],
    metrics: [],
    dimensions: [],
    filters: [],
    caching:
      '',
    freshness: 'Live.',
    realtimeRequirement:
      'A role revocation should reach a running app. The existing `community.role.changed` event is the natural carrier.',
    dataRetention: 'None. Authorization is evaluated, not stored.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations: '',
    owner: 'identity-platform',
    priority: 'critical',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  analyticsExport: {
    id: 'FRONTEND-PHASE15-GAP-026',
    // 20 Oct 2026. `POST /analytics/exports` and `GET /analytics/exports/{id}` are
    // served (backend a7a94da). CSV only: pdf and json are refused, so the sheet
    // offers CSV and says the others are not available. The link is a path on the
    // API origin with a 12-hour token, opened in the system browser.
    backendStatus: 'connected',
    key: 'analyticsExport',
    capability: 'Analytics export — CSV, PDF and share',
    feature: '§43 Export',
    screens: ['/analytics/export', 'every dashboard’s export action'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Export job creation, status and retrieval',
      'A signed, short-lived download URL',
      'A row cap and a documented behaviour when a query exceeds it',
    ],
    requiredContracts: [],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: '',
    freshness: 'The export states the range and the computedAt of the data it contains.',
    realtimeRequirement: 'Polling is sufficient. A push on completion would be a convenience, not a requirement.',
    dataRetention: 'Generated files expire — 24 hours is ample and the model carries `expiresAt` for it.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations: '',
    owner: 'analytics-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },

  savedReports: {
    id: 'FRONTEND-PHASE15-GAP-027',
    // 20 Oct 2026. `GET/POST /analytics/reports` and `GET/PUT/DELETE
    // /analytics/reports/{id}` are served (backend a7a94da). Private only: the
    // server refuses any other sharing level and its shared list is always empty,
    // so the app offers no sharing and no "Shared with you" list, and says why.
    backendStatus: 'connected',
    key: 'savedReports',
    capability: 'Report builder and saved reports',
    feature: '§44 Report Builder · §45 Saved Reports',
    screens: ['/analytics/reports', '/analytics/reports/build', '/analytics/reports/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Report persistence with an owner',
      'Report sharing with server-evaluated visibility',
      'A rule for a shared report whose recipient lacks the capability for its metrics',
    ],
    requiredContracts: [],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: '',
    freshness: 'A saved report shows the freshness of the data it ran against, not of the report definition.',
    realtimeRequirement: 'None.',
    dataRetention: 'Report definitions live as long as their owner’s account.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations: '',
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B20 Analytics Reporting',
  },

  analyticsInsights: {
    id: 'FRONTEND-PHASE15-GAP-028',
    // 20 Oct 2026. `GET /analytics/insights` is served (backend 52bb2e5) and
    // read by `fetchAnalyticsInsights` for every subject it resolves. An empty
    // list is the ordinary answer and leaves the section absent.
    backendStatus: 'connected',
    key: 'analyticsInsights',
    capability: 'Platform-authored insights — short statements about what the data shows',
    feature: '§3 Analytics Domain Architecture (AnalyticsInsight)',
    screens: ['/analytics/platform', '/analytics/creator', '/analytics/community/[id]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Any insight generation',
      'A confidence or sample-size statement, so an insight from three data points is distinguishable from one from three thousand',
    ],
    requiredContracts: [],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: '',
    freshness: 'Nightly, with the underlying data.',
    realtimeRequirement: 'None.',
    dataRetention: 'None beyond the aggregates the insight is drawn from.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations: '',
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
      '',
    coverage: 'none',
    partiallyCoveredBy: 'CREATOR-GAP-016, which registered this first. This entry restates it at platform scope.',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A batch ingestion endpoint',
      'A schema registry, so an event the client emits and the backend does not know about is rejected visibly rather than silently dropped',
      'A retention and deletion policy, including what happens to a member’s events when they delete their account',
    ],
    requiredContracts: [],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: '',
    freshness: 'Not applicable.',
    realtimeRequirement:
      'None. Batching on an interval and on background is correct; a per-event request would be a battery and network cost for no analytical gain.',
    dataRetention:
      'Raw events 90 days is sufficient for every aggregate in this register. Account deletion must delete or irreversibly anonymise the member’s events, and this needs to be settled before ingestion ships rather than after.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations:
      '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A definitions endpoint with a version',
      'A guarantee that a metric key means the same thing across subjects, which is what makes comparison meaningful',
    ],
    requiredContracts: [],
    metrics: [],
    dimensions: [],
    filters: [],
    caching: '',
    freshness: 'Versioned. A definition change must bump the version so a chart can note the discontinuity.',
    realtimeRequirement: 'None.',
    dataRetention: 'Definition history retained, so an old report can state which definition it ran under.',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    securityConsiderations:
      '',
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
