// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `multi-community-gaps.ts`, derived by
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
// Diaspora Platform — Backend capability gaps (Frontend Phase 13, Multi-
// Community Expansion)
//
// ⚠ EVERY CAPABILITY REGISTERED HERE IS UNSUPPORTED, OR ONLY PARTLY SUPPORTED,
//   BY THE CERTIFIED BACKEND. ⚠
//
// ── What the audit found, and why this register is shaped the way it is ───────
//
// Phase 13's finding is blunter than any previous phase's: **the certified
// backend has no concept of a community.** Not a partial one — none. What it has
// instead is a *country*, in four different roles:
//
//   `User.nationality`               a self-declared string.
//   `User.residenceCountry`          where the member lives.
//   `X.owner.originCountry`          a `CountryRef` on the publisher of a
//                                    listing, job, housing or marketplace item.
//                                    **Real, certified, and populated.**
//   `CountryVerificationSummary`     B-side verification of origin/residence.
//
// And the application already uses the third of those as a community filter. At
// `src/app/(tabs)/discover.tsx:316` the code reads
//
//     baseListings.filter((i) => i.owner.originCountry?.code === selectedCountryCode)
//
// which is a country filter wearing a community filter's clothes. §2 forbids
// exactly this, and the migration is registered at GAP-009 rather than done
// silently: the filter still works, it is now expressed as a *projection* from a
// community scope onto the country parameter the route actually accepts, and the
// UI says so.
//
// ── The second finding: a name that is already taken ─────────────────────────
//
// Phase 12 registered `/community-gap/v0/communities/*` for **organization
// membership programmes** — paying dues to a community organization. That is a
// different domain from this phase's community membership, and the two must not
// share a URL space, a query-key root, a gap prefix or a type name. So:
//
//                        Phase 12                     Phase 13
//   URL prefix           /community-gap/v0            /community-directory/v0
//   Query key root       ['community-gap', …]         ['community-directory', …]
//   Gap ids              COMMUNITY-GAP-0xx            FRONTEND-PHASE13-GAP-0xx
//   Membership type      MembershipStatus             CommunityMembershipState
//
// A call that crosses those lines fails loudly rather than returning a plausible
// wrong answer.
//
// ── What is genuinely CONNECTED, and is therefore not in this register ───────
//
// A great deal, and it is why this phase adds no second search engine, no second
// notification system, no second recommendation engine and no second map:
//
//   GET /listings, /jobs, /housing, /marketplace   real, with `originCountry` on
//                                                  every publisher and full
//                                                  proximity parameters.
//   GET /discovery/search                          real cross-domain search.
//   GET /community-life/events, /organizations     real, with `cityName`,
//                                                  `category`, proximity and
//                                                  time filters.
//   GET /location/*, /neighborhood/{id}            real geography and real
//                                                  cross-domain nearby counts.
//   GET /notifications/*                           real categories, preferences,
//                                                  channels and quiet hours.
//   /conversations/*                               real messaging.
//   /financial/*                                   real wallet, payments, giving.
//   /trust/*                                       real verification and privacy.
//
// Phase 13 reads all of those unchanged. What it adds is a *scope* that travels
// with the request and the cache key.
//
// ── Where the simulated surfaces live ────────────────────────────────────────
//
// `lib/community-gap-directory-api.ts`, under `/community-directory/v0`, behind
// `areSimulatedFeaturesEnabled()` — the same single switch Phases 5, 6, 7, 8 and
// 12 use. A production bundle contains no path to a fabricated community, an
// invented member count or a synthetic moderation queue, and Metro's minifier
// strips the dead branch.
//
// Nothing in this phase moves money, creates a notification, writes to a
// certified route, or grants a permission. Every gap id below is quoted verbatim
// in `frontend-phase-13-multi-community-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Which backend module should own the work, so a later phase can scope it. */
export type CommunityGapOwner =
  /** B6 — community and social foundation. The natural home for the directory. */
  | 'B6-community-foundation'
  /** B8 / B8.1 / B8.2 — guides and the country knowledge directory. */
  | 'B8-guides'
  /** The Jobs module. */
  | 'B9-jobs'
  /** B10 — marketplace. */
  | 'B10-marketplace'
  /** B11 — housing. */
  | 'B11-housing'
  /** B12 — events, organizations, neighbourhoods. */
  | 'B12-community-life'
  /** B13 / B13.1 — notifications and communication. */
  | 'B13-notifications'
  /** B13.2 — conversations and messaging. */
  | 'B13.2-messaging'
  /** B14 — recommendation and personalization. */
  | 'B14-recommendation'
  /** B15 — financial platform, monetization, creator payouts. */
  | 'B15-financial'
  /** B17 — production platform and operational excellence. */
  | 'B17-platform'
  /** Identity, authorization and the account model. */
  | 'identity-platform'
  /** Geospatial/location services. */
  | 'location-platform'
  /** Nobody's brief yet. */
  | 'future-evolution';

export type CommunityGapPriority = 'critical' | 'high' | 'medium' | 'low';

/** How much of the capability the certified backend already carries. */
export type CommunityGapCoverage =
  /** Nothing on the certified surface addresses this. */
  | 'none'
  /** A certified contract carries part of it; the rest is simulated or projected. */
  | 'partial'
  /**
   * The certified backend carries all of it, and the client now uses it.
   *
   * Added when B18 closed the first six entries. It did not exist before,
   * because when this register was written nothing in it could be `full` — and
   * a vocabulary with no word for "done" is one that cannot record being done.
   */
  | 'full';

/**
 * The frontend's own status, in the vocabulary §80 requires.
 *
 * There is no `incomplete` member, and that is the point: §1 forbids leaving a
 * screen unfinished because the backend is behind. Every entry below is either
 * connected, partially connected, or complete through an adapter.
 */
export type CommunityGapFrontendStatus =
  | 'IMPLEMENTED + BACKEND CONNECTED'
  | 'IMPLEMENTED + BACKEND PARTIAL'
  | 'IMPLEMENTED + DEVELOPMENT ADAPTER';

/** The required contract, at the level of detail §66 asks for. */
export interface CommunityGapContract {
  /** `GET /communities`. Route-level, not hand-waving. */
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** The request shape, as prose or a field list. */
  request: string;
  /** The response shape. */
  response: string;
  /** Who may call it, and on whose behalf. */
  authorization: string;
  /** The specific permission the server must evaluate, where one applies. */
  permission?: string;
  /** Cursor, page-size cap, ordering guarantee. `null` where not a list. */
  pagination?: string | null;
  filtering?: string | null;
  sorting?: string | null;
}

export interface CommunityGap {
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

  /**
   * What is real and what is not, for an entry the backend serves *part* of.
   *
   * Required in practice by `partial`, and it exists because without it a
   * partial entry is indistinguishable from an absent one on screen: every
   * notice on this platform returns null for `connected` and otherwise says
   * "nothing here works". Nine entries across five registers are marked
   * `partial` today and every one of them tells the member that.
   *
   * Written for the member, not the reviewer. It replaces the generic sentence,
   * so it has to say what they can rely on.
   */
  backendPartialNote?: string;
  /** `FRONTEND-PHASE13-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  /** What a member would call it. */
  capability: string;
  /** The Phase 13 scope section(s) this belongs to. */
  feature: string;
  frontendStatus: CommunityGapFrontendStatus;
  /** One paragraph on what the frontend does today. */
  frontendBehaviour: string;
  coverage: CommunityGapCoverage;
  /** What the certified backend already carries, so nobody rebuilds it. */
  existingBackendCapability: string[];
  /** What is missing, at route level. */
  missingBackendCapability: string[];
  /** The contract(s) required. */
  requiredContracts: CommunityGapContract[];
  /** The frontend domain type(s) this fills. */
  domainModel: string[];
  /** Cache behaviour the frontend applies, and what the backend must support. */
  caching: string;
  /** The realtime event, where one is needed. */
  realtimeEvent?: string | null;
  /** The notification event, where one is needed. */
  notificationEvent?: string | null;
  /** Why the frontend cannot safely implement it against what exists. */
  whyNotImplementable: string;
  /** §41/§62. What must not leak, and what the client does about it today. */
  privacyConsiderations: string;
  /** §68. What breaks, or must be backfilled, when the contract lands. */
  migrationConsiderations: string;
  /** True where the capability handles or reveals community membership. */
  isMembershipSensitive: boolean;
  owner: CommunityGapOwner;
  priority: CommunityGapPriority;
  /** Which backend phase should pick it up. */
  recommendedPhase: string;
}

export const MULTI_COMMUNITY_GAPS: Record<string, CommunityGap> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // THE COMMUNITY ENTITY — §5, §31, §32
  // ═══════════════════════════════════════════════════════════════════════════

  communityDirectory: {
    id: 'FRONTEND-PHASE13-GAP-001',
    backendStatus: 'connected',
    key: 'communityDirectory',
    capability: 'Community directory — the list of communities the platform has',
    feature: '§5 Community Domain Model · §31 Community Discovery · §10 Community Selector',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Any endpoint that returns communities as first-class entities with a stable identifier independent of country code',
      'A slug scheme stable enough to put in a deep link (§53)',
      'A visibility model, so an unlisted or private community is not returned to a caller who may not see it',
      'A lifecycle, so a suspended or archived community is distinguishable from a deleted one (§75)',
    ],
    requiredContracts: [],
    domainModel: ['Community', 'CommunityRef', 'CommunityDirectoryEntry', 'CommunityDirectoryPage'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The repository is the only thing that knows which arm answers, so the migration is an import swap. Dev community ids are prefixed `dev-` precisely so a real id can never be mistaken for one, and any persisted active-community id that still carries the prefix is discarded on read rather than sent to a real route.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityProfile: {
    id: 'FRONTEND-PHASE13-GAP-002',
    backendStatus: 'connected',
    key: 'communityProfile',
    capability: 'Community profile read by id or slug',
    feature: '§32 Community Profile · §53 Community Deep Links',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Resolution by slug as well as id, since a deep link carries the slug',
      'A `statusReason` on suspended and archived communities, rendered to the member rather than swallowed',
      'A documented 404-versus-403 rule, so the client can distinguish "no such community" from "you may not see this one"',
    ],
    requiredContracts: [],
    domainModel: ['Community', 'CommunityStatus', 'CommunityUnavailableReason'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Slug-to-id resolution is already isolated in the repository, so a backend that only accepts ids needs one lookup added there and no screen changes.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMBERSHIP — §6, §7, §8, §33
  // ═══════════════════════════════════════════════════════════════════════════

  communityMembershipSet: {
    id: 'FRONTEND-PHASE13-GAP-003',
    backendStatus: 'connected',
    key: 'communityMembershipSet',
    capability: 'The member’s community relationships, including primary and interests',
    feature: '§6 Membership Model · §7 Primary Community · §8 Interested Communities',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A membership record between a user and a community, with a state, a joined-at and a revocation reason',
      'A rule for whether membership requires approval, per community',
      'A distinction between an expressed interest and a membership, so the client stops being the only place that knows the difference',
      'A per-membership visibility field the member controls (§41)',
    ],
    requiredContracts: [],
    domainModel: [
      'CommunityMembership',
      'CommunityMembershipSet',
      'CommunityMembershipState',
      'CommunityMembershipVisibility',
    ],
    caching:
      '',
    realtimeEvent: 'community.membership.changed — so a revocation reaches the device without a refetch',
    notificationEvent: 'B13 notification on approval, rejection and revocation',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The client treats an absent membership set as "no communities" rather than as an error, so a deployment where the route does not exist yet degrades to the no-community experience rather than to a broken app. When the route lands, no screen changes.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityMembershipActions: {
    id: 'FRONTEND-PHASE13-GAP-004',
    backendStatus: 'connected',
    key: 'communityMembershipActions',
    capability: 'Join, leave, follow, unfollow, express interest, remove interest',
    feature: '§33 Community Membership Actions',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Write routes for each transition, with the server deciding legality',
      'A documented rule for which communities may be joined without approval',
      'An idempotency contract, so a double-tap on Join is not two applications',
    ],
    requiredContracts: [],
    domainModel: ['CommunityMembershipAction', 'CommunityMembership'],
    caching:
      '',
    realtimeEvent: 'community.membership.changed',
    notificationEvent: 'B13 notification to the member on an approval decision',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The mutation hooks already take the action as data rather than as four separate functions, so a backend that exposes one route or six needs no screen change.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },
  primaryCommunity: {
    id: 'FRONTEND-PHASE13-GAP-005',
    backendStatus: 'connected',
    key: 'primaryCommunity',
    capability: 'Setting and clearing the primary community',
    feature: '§7 Primary Community · §9 Community Onboarding',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A `primaryCommunityId` on the user record, distinct from `nationality`',
      'A documented rule for whether the primary must be a community the member has joined',
      'An audit entry when it changes, since it drives personalization',
    ],
    requiredContracts: [],
    domainModel: ['CommunityMembershipSet', 'CommunityMembership.isPrimary'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Must not be back-filled from `nationality`. §55 forbids inferring community membership from identity data, and a migration that seeded it would silently assert a community for every existing member.',
    isMembershipSensitive: true,
    owner: 'identity-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityCapabilities: {
    id: 'FRONTEND-PHASE13-GAP-006',
    backendStatus: 'connected',
    key: 'communityCapabilities',
    capability: 'Server-evaluated capabilities per community and caller',
    feature: '§37 Community Role UX · §62 Security · §34 Moderators · §35 Ambassadors',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A capability set per (caller, community), evaluated server-side',
      'A rejection contract distinguishing "not permitted" from "not signed in"',
      'Capability re-evaluation on role change, so a removed moderator loses the affordance without reinstalling',
    ],
    requiredContracts: [],
    domainModel: ['CommunityCapabilities', 'CommunityRole'],
    caching:
      '',
    realtimeEvent: 'community.role.changed — the only reliable way a revocation reaches a running app',
    notificationEvent: 'B13 notification when a role is granted or revoked',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Because no screen reads a role to decide anything, a real capability endpoint changes only which arm the repository calls. The role field stays for badges.',
    isMembershipSensitive: true,
    owner: 'identity-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS — §29, §30
  // ═══════════════════════════════════════════════════════════════════════════

  communityStatistics: {
    id: 'FRONTEND-PHASE13-GAP-007',
    // 20 Oct 2026. Served by CommunityProgramme (backend d07a707) at the declared
    // path and read by `fetchCommunityStatistics` in `community-entity-api.ts`.
    // Counted from stored rows; restricted figures go only to callers the server
    // allows, suppressed under five members; anything it cannot count it names in
    // `unavailableMetrics`, which the panel shows as "Not counted" with the reason.
    backendStatus: 'connected',
    key: 'communityStatistics',
    capability: 'Community statistics — members, growth, activity, content counts',
    feature: '§29 Community Statistics',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Any member count for a community, since there is no membership record to count',
      'A growth figure, which requires a comparable previous period the platform does not retain',
      'An engagement metric with a stated methodology and sample size',
      'A restricted-metric flag, so private statistics are the server’s decision rather than the client’s',
    ],
    requiredContracts: [],
    domainModel: ['CommunityStatistics', 'CommunityMetric', 'StatisticsPeriod', 'DataFreshness'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Because provenance is per metric, a backend that ships member counts first and growth later needs no client change — the marks simply flip as fields become `backend`.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'high',
    recommendedPhase: 'B19 Community Insights',
  },

  communityComparison: {
    id: 'FRONTEND-PHASE13-GAP-008',
    // 20 Oct 2026. Served by CommunityProgramme (backend d07a707), two to four
    // communities aligned by metric, no restricted rows, no winner.
    backendStatus: 'connected',
    key: 'communityComparison',
    capability: 'Side-by-side community comparison',
    feature: '§30 Community Comparison',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A server-side comparison, so the client is not aligning metrics whose periods or methodologies differ',
      'A guarantee that a metric key means the same thing across two communities',
    ],
    requiredContracts: [],
    domainModel: ['CommunityComparison'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'None. The screen already consumes rows rather than computing them.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'medium',
    recommendedPhase: 'B19 Community Insights',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT SCOPING — §17–§24, §38, §39
  // ═══════════════════════════════════════════════════════════════════════════

  communityScopedContent: {
    id: 'FRONTEND-PHASE13-GAP-009',
    key: 'communityScopedContent',
    capability: 'Community association and community filtering on platform content',
    feature:
      '§17 Guides · §18 Jobs · §19 Marketplace · §20 Housing · §21 Events · §22 Providers · §23 Organizations · §24 Updates',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A `communityId` (or `communityIds`) association on guides, jobs, housing, marketplace listings, provider listings, events, organizations and updates',
      'A `communityIds` filter parameter on each of those list routes',
      'A declared-association write path, so a publisher can say which community their content is for',
      'A rule for content that belongs to several communities, and one for content that belongs to none',
    ],
    requiredContracts: [],
    domainModel: ['CommunityAssociation', 'CommunityAssociationBasis', 'CommunityScope'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The projection function is the single migration point. When `communityIds` lands on a route, the projection stops emitting `originCountryCodes` for that route and starts emitting `communityIds`; the query keys already carry the scope token, so no cache is poisoned by the switch. The existing country filter in Discover and Search must keep working throughout, and does — it is now a `SELECTED_COMMUNITY` scope whose projection happens to be a country code.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'critical',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityScopedSearch: {
    id: 'FRONTEND-PHASE13-GAP-010',
    key: 'communityScopedSearch',
    capability: 'Community filter on platform search',
    feature: '§38 Community-Scoped Search · §54 URL State',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A `communityIds` parameter on `GET /discovery/search`',
      'A community facet in the response, so the filter chips show real counts rather than counting the current page',
      'Server-side ranking that can consider community scope, since the client must not rank',
    ],
    requiredContracts: [],
    domainModel: ['CommunityScope', 'CommunityAssociation'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Facet counts are rendered only when present, so the chips lose their numbers gracefully today and gain them when the contract lands.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'high',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityScopedRecommendations: {
    id: 'FRONTEND-PHASE13-GAP-011',
    key: 'communityScopedRecommendations',
    capability: 'Community scope on the recommendation engine',
    feature: '§25 Community-Specific Recommendations · §47 Context + Recommendations',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A `communityIds` scope on the recommendation request',
      'A `scope: "community" | "cross-community"` marker on each recommendation, so the UI can label it honestly',
      'A `reason` string per recommendation, so the rail can say why rather than assert relevance',
    ],
    requiredContracts: [],
    domainModel: ['CommunityScope'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The fallback and the scoped path share a hook, so the label changes and no screen does.',
    isMembershipSensitive: true,
    owner: 'B14-recommendation',
    priority: 'high',
    recommendedPhase: 'B18 Recommendation Scope Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS AND MESSAGING — §26, §27, §40, §48, §52
  // ═══════════════════════════════════════════════════════════════════════════

  communityNotificationPreferences: {
    id: 'FRONTEND-PHASE13-GAP-012',
    backendStatus: 'connected',
    key: 'communityNotificationPreferences',
    capability: 'Community dimension on notification preferences',
    feature: '§26 Community Notifications · §40 Community Notification Preferences',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A community scope per category on the preference record',
      'Server-side application of that scope when a notification is generated — a client-side filter only hides what was already delivered',
      'A rule for a member with no communities, so "primary only" does not silently mean "nothing"',
    ],
    requiredContracts: [],
    domainModel: ['CommunityNotificationPreference', 'CommunityNotificationScope'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'A category with no community scope defaults to `my-communities`, which is the least surprising behaviour and is what the client assumes for an un-migrated record.',
    isMembershipSensitive: true,
    owner: 'B13-notifications',
    priority: 'high',
    recommendedPhase: 'B18 Notification Scope Extension',
  },

  communityNotificationContext: {
    id: 'FRONTEND-PHASE13-GAP-013',
    backendStatus: 'connected',
    key: 'communityNotificationContext',
    capability: 'Community context on notification payloads',
    feature: '§26 Community Notifications · §48 Context + Notifications',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A `communityId` on the notification payload',
      'Server-side application of the community scope from GAP-012, so an out-of-scope notification is never generated',
    ],
    requiredContracts: [],
    domainModel: ['CommunityRef', 'CommunityScope'],
    caching: '',
    realtimeEvent: 'Unchanged — the existing notification channel carries the new field',
    notificationEvent: 'Every community-scoped notification type',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations: 'Additive. A payload without the field renders exactly as it does today.',
    isMembershipSensitive: true,
    owner: 'B13-notifications',
    priority: 'medium',
    recommendedPhase: 'B18 Notification Scope Extension',
  },

  communityConversationContext: {
    id: 'FRONTEND-PHASE13-GAP-014',
    backendStatus: 'connected',
    key: 'communityConversationContext',
    capability: 'Community context on conversations',
    feature: '§27 Community-Scoped Messaging · §52 Context + Messaging',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A `communityId` on the conversation record where the conversation arises from a community context',
      'A rule stating that a community association on a conversation never implies either participant is a member',
    ],
    requiredContracts: [],
    domainModel: ['CommunityRef'],
    caching:
      '',
    realtimeEvent: 'Unchanged',
    notificationEvent: 'Unchanged',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Additive and inert: a conversation with no community field behaves exactly as today.',
    isMembershipSensitive: true,
    owner: 'B13.2-messaging',
    priority: 'medium',
    recommendedPhase: 'B18 Messaging Context Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPS — §28, §46
  // ═══════════════════════════════════════════════════════════════════════════

  communityMapScope: {
    id: 'FRONTEND-PHASE13-GAP-015',
    key: 'communityMapScope',
    capability: 'Community filter and community layers on the map',
    feature: '§28 Community Map Experience · §46 Context + Maps',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'The `communityIds` parameter from GAP-009 on the routes the map queries',
      'A community presence layer — where a community actually is — which is a genuinely new aggregate and not derivable from listings',
    ],
    requiredContracts: [],
    domainModel: ['CommunityScope', 'MapSearchParams.communityIds'],
    caching:
      '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The community filter is already a `MapSearchParams` field, so the projection swap in GAP-009 covers the map with no map-specific work.',
    isMembershipSensitive: true,
    owner: 'location-platform',
    priority: 'medium',
    recommendedPhase: 'B19 Community Insights',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNANCE — §34, §35, §36
  // ═══════════════════════════════════════════════════════════════════════════

  communityGovernance: {
    id: 'FRONTEND-PHASE13-GAP-016',
    // 20 Oct 2026. Rules and notices are served by CommunityProgramme (backend
    // d07a707) with their writes, gated on canManageRules and canPublishNotice. The
    // rules screen reads both and offers add, edit and remove to those the
    // capability set allows; a notice’s own `canEdit` decides its controls.
    backendStatus: 'connected',
    key: 'communityGovernance',
    capability: 'Community rules, guidelines and notices',
    feature: '§36 Community Governance',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Rule and notice records scoped to a community',
      'A write path gated on a server-evaluated capability',
      'A versioning rule, so a member can see that a rule changed after they joined',
    ],
    requiredContracts: [],
    domainModel: ['CommunityRule', 'CommunityNotice'],
    caching:
      '',
    realtimeEvent: 'community.notice.published',
    notificationEvent: 'B13 notification for a pinned notice, subject to GAP-012’s scope',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The platform guidelines screen is untouched, so there is no migration of existing content — only new records.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Governance',
  },

  communityModeration: {
    id: 'FRONTEND-PHASE13-GAP-017',
    // 20 Oct 2026. The client reads the community’s own queue and posts decisions
    // at the declared paths without the gap prefix. Built on the backend
    // moderation branch (64ddcb0) and merged into backend master the same day
    // (7ffb551). A deployment that predates the merge answers 404, and the
    // screen shows its error state, never an empty queue. Warn is refused by the
    // server and is not offered; there is no stored "under review" state, so
    // that tab is gone.
    backendStatus: 'connected',
    key: 'communityModeration',
    capability: 'Community moderation queue and moderator actions',
    feature: '§34 Community Moderators',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A report queue scoped to a community',
      'A decision route that records who decided and why, in the existing audit trail',
      'A rule for escalation from community moderation to platform moderation',
    ],
    requiredContracts: [],
    domainModel: ['CommunityReport', 'CommunityReportStatus', 'CommunityModerationDecision'],
    caching:
      '',
    realtimeEvent: 'community.report.created / community.report.decided',
    notificationEvent: 'B13 notification to moderators on a new report, and to the author on a decision',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Community reports should share the platform audit trail rather than starting a new one, so an escalation keeps its history.',
    isMembershipSensitive: false,
    owner: 'B17-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Governance',
  },

  communityRoleDirectory: {
    id: 'FRONTEND-PHASE13-GAP-018',
    // 20 Oct 2026. `GET /communities/{idOrSlug}/roles` is served (backend d07a707):
    // holders as each chose to be seen, Public to anybody, CommunityOnly to members.
    // The Moderators and Ambassadors screens read it in every build. `since` is
    // when the holder joined, not when the role was given — nothing records that.
    backendStatus: 'connected',
    key: 'communityRoleDirectory',
    capability: 'Moderator and ambassador directories',
    feature: '§34 Moderators · §35 Ambassadors',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      // Served: a role assignment record per (user, community) — roles live on the membership and
      // are granted through the route above. Half-served: the publication rule. A role can only be
      // held with a membership visible to the community, so no role exposes somebody who chose
      // privacy; a PUBLIC directory, readable by non-members, would need `Visibility == Public`
      // as its consent, and the public route is not built.
      'The public read — `GET /communities/{id}/roles` for callers who are not members, listing only holders whose membership is Public',
      'A `since` date, so a member can tell a new moderator from a long-standing one — the membership has `joinedAt`, and nothing records when a role was granted',
    ],
    requiredContracts: [],
    domainModel: ['CommunityRoleHolder', 'CommunityRole'],
    caching: '',
    realtimeEvent: 'community.role.changed',
    notificationEvent: 'B13 notification on role grant or revocation',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Consent must be collected before the first directory is published, not after. A migration that listed every existing moderator would publish affiliations nobody agreed to.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Governance',
  },

  communityInitiatives: {
    id: 'FRONTEND-PHASE13-GAP-019',
    // 20 Oct 2026. Served by CommunityProgramme (backend e57082e) at the declared
    // path, with detail, participation, participants and progress updates beneath
    // it, and read and written by `community-entity-api.ts`. There is no progress
    // figure on the wire, so the app draws no bar: the organisers' updates are the
    // account of progress, and the list shows how many there are.
    backendStatus: 'connected',
    key: 'communityInitiatives',
    capability: 'Community initiatives and ambassador programmes',
    feature: '§35 Community Ambassadors · §36 Governance',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'full',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A progress definition, so a bar means something. Deliberately absent: progress is told through updates.',
    ],
    requiredContracts: [],
    domainModel: ['CommunityInitiative'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: 'B13 notification when an initiative the member follows changes state',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Initiatives should link to Phase 12 volunteer opportunities and campaigns rather than re-implementing either.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'low',
    recommendedPhase: 'B18 Community Governance',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ONBOARDING, PREFERENCES AND LIFECYCLE — §9, §41, §55, §75
  // ═══════════════════════════════════════════════════════════════════════════

  communityOnboardingSuggestions: {
    id: 'FRONTEND-PHASE13-GAP-020',
    // 20 Oct 2026. Suggestions read `GET /recommendations/communities` since
    // 9645a25 (`fetchCommunitySuggestionsReal`), each with the server's reason;
    // the notice on the directory and onboarding screens was still saying the
    // surface was simulated. The route binds `country`, so the presence country
    // this entry asked to send is sent. The declared path below was never built.
    backendStatus: 'connected',
    key: 'communityOnboardingSuggestions',
    capability: 'Suggested communities during onboarding',
    feature: '§9 Community Onboarding · §55 Onboarding Suggestions',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A suggestion endpoint that returns communities with a reason',
      'A documented statement of what inputs it may consider, so the client is not the place that decides',
    ],
    requiredContracts: [],
    domainModel: ['CommunityDirectoryEntry'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The client already renders `reason` when present and omits it when not, so a first version without reasons degrades to a plain list.',
    isMembershipSensitive: true,
    owner: 'B14-recommendation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityPreferencesPersistence: {
    id: 'FRONTEND-PHASE13-GAP-021',
    // 20 Oct 2026. `GET/PUT /communities/preferences/me` is served (backend
    // d07a707) and the settings screen reads and saves it. Partial, because the
    // server acts on one of these preferences — the visibility a new membership
    // starts with — and stores the others without any profile reading them yet.
    backendStatus: 'partial',
    backendPartialNote:
      'Your community settings are saved to your account. The platform applies who sees communities you join from now on; the profile switches are saved, but nothing reads them yet.',
    key: 'communityPreferencesPersistence',
    capability: 'Server-side community preferences and membership privacy controls',
    feature: '§41 Community Privacy · §45 Offline Support',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'Community-specific visibility fields on the privacy record',
      'A per-membership visibility field, since a member may be open about one community and not another',
    ],
    requiredContracts: [],
    domainModel: ['CommunityPreferences', 'CommunityMembershipVisibility'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Defaults must be off on migration too. A migration that set these true "to preserve behaviour" would publish community affiliations for everybody, because the current behaviour is that nothing is published.',
    isMembershipSensitive: true,
    owner: 'identity-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityLifecycle: {
    id: 'FRONTEND-PHASE13-GAP-022',
    backendStatus: 'partial',
    backendPartialNote:
      'A community’s status and the reason behind it are real — a suspended or archived community says so, in its own words. What is not built yet is being told: nothing notifies you when a community you are in changes state, so you will see it the next time you open this screen.',
    key: 'communityLifecycle',
    capability: 'Community lifecycle transitions and their consequences',
    feature: '§75 Community Lifecycle · §74 Error and Edge States',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'The status field and its reason on the community record',
      'A statement of what happens to memberships when a community is archived',
      'A realtime or notification path, so a member in the community learns rather than discovering it on next launch',
    ],
    requiredContracts: [],
    domainModel: ['CommunityStatus', 'CommunityUnavailableReason'],
    caching:
      '',
    realtimeEvent: 'community.status.changed',
    notificationEvent: 'B13 notification to members when their community is suspended or archived',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The fallback chain is already implemented and tested, so a status field arriving changes no screen logic.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM — §49, §50, §51, §63
  // ═══════════════════════════════════════════════════════════════════════════

  communityMonetizationScope: {
    id: 'FRONTEND-PHASE13-GAP-023',
    key: 'communityMonetizationScope',
    capability: 'Community scope on placements, promotions and sponsorship',
    feature: '§49 Context + Monetization · §51 Context + Wallet',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A community targeting dimension on placement and promotion contracts',
      'A price implication, if any, for community-scoped targeting',
      'A reach estimate per community, which requires GAP-007’s member counts',
    ],
    requiredContracts: [],
    domainModel: ['CommunityScope'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Targeting is additive to the existing request body, so no existing placement changes meaning.',
    isMembershipSensitive: true,
    owner: 'B15-financial',
    priority: 'low',
    recommendedPhase: 'B19 Community Insights',
  },

  communityCreatorScope: {
    id: 'FRONTEND-PHASE13-GAP-024',
    key: 'communityCreatorScope',
    capability: 'Community scope on creator content, analytics and campaigns',
    feature: '§50 Context + Creator Economy',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A community association on creator content, from GAP-009',
      'A community breakdown in creator analytics',
      'A community dimension on challenges and campaigns',
    ],
    requiredContracts: [],
    domainModel: ['CommunityScope', 'CommunityAssociation'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations: 'Additive to the existing analytics envelope.',
    isMembershipSensitive: true,
    owner: 'B14-recommendation',
    priority: 'low',
    recommendedPhase: 'B19 Community Insights',
  },

  communityRealtime: {
    id: 'FRONTEND-PHASE13-GAP-025',
    key: 'communityRealtime',
    capability: 'Realtime community channels',
    feature: '§42 Data Isolation · §61 Cache Invalidation · §74 Edge States',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A community-scoped subscription primitive',
      'Payloads for community.membership.changed, community.role.changed and community.status.changed',
      'An authorization rule per channel, so a private community’s events do not reach a non-member',
    ],
    requiredContracts: [],
    domainModel: ['CommunityMembership', 'CommunityCapabilities', 'CommunityStatus'],
    caching:
      '',
    realtimeEvent: 'community.membership.changed · community.role.changed · community.status.changed',
    notificationEvent: 'The same three, as B13 notifications, for the case where the app is not running',
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'The handlers exist and are unit-tested against synthetic events, so a real channel is a wiring change.',
    isMembershipSensitive: true,
    owner: 'B13.2-messaging',
    priority: 'medium',
    recommendedPhase: 'B13.3 Realtime Channel Extension',
  },

  communityAnalyticsIngestion: {
    // ── Closed. See FRONTEND-PHASE15-GAP-029 (`telemetryIngestion`). ──────────
    //
    // This entry asked for `POST /analytics/events`. The route exists and is
    // called: it is `POST /api/v1/telemetry/events`, the analytics module has
    // named that destination since Phase 7, and it takes the batched
    // `TelemetryBatchRequest { events[] }` shape this entry described.
    // `lib/telemetry-api.ts` posts to it and `app/_layout.tsx` starts the
    // sixty-second flush on sign-in. Verified against the deployment on
    // 10 Sep 2026: **202 Accepted**.
    //
    // **What is still true, and belongs to GAP-029 rather than here.** The
    // server registry accepts seven client-submittable names and this app
    // emits four of them — the automation ones. Every other name across the
    // five client vocabularies is refused *locally*, before the network, as
    // `analytics.ingest.event-unknown`. That refusal is the design: the other
    // names are server-produced facts and §41 forbids a client incrementing
    // one. It is not a missing transport, which is what this entry was about.
    //
    // Marked connected rather than deleted: the register is a historical
    // record, and it should show that four entries named one dependency and
    // only one of them was re-read.
    backendStatus: 'connected',
    id: 'FRONTEND-PHASE13-GAP-026',
    key: 'communityAnalyticsIngestion',
    capability: 'Analytics ingestion for community events',
    feature: '§63 Analytics',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [
      'POST /analytics/events — batched, fire-and-forget, with a documented schema and a size limit',
      'A retention policy covering community identifiers',
    ],
    requiredContracts: [],
    domainModel: ['CommunityAnalyticsEvent'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable: '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Registering the vocabulary and the allow-list now is what makes the eventual endpoint a configuration change rather than an audit of every call site.',
    isMembershipSensitive: true,
    owner: 'B17-platform',
    priority: 'low',
    recommendedPhase: 'B17 Operational Excellence',
  },

  communitySavedContent: {
    id: 'FRONTEND-PHASE13-GAP-027',
    key: 'communitySavedContent',
    capability: 'Community context on saved content',
    feature: '§39 Community-Scoped Saved Content',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [
      'A community association on the saved record, so a saved item keeps the association it had when it was saved even if the projection changes',
    ],
    requiredContracts: [],
    domainModel: ['CommunityAssociation'],
    caching: '',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '',
    privacyConsiderations:
      '',
    migrationConsiderations:
      'Recomputation and a stored field agree today, so back-filling is safe and the client prefers the stored field when present.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'low',
    recommendedPhase: 'B19 Community Insights',
  },
};

/** Every gap, ordered by identifier. Used by the register screen and the docs. */
export const MULTI_COMMUNITY_GAP_LIST: CommunityGap[] = Object.values(MULTI_COMMUNITY_GAPS).sort(
  (a, b) => a.id.localeCompare(b.id)
);

export function getMultiCommunityGap(key: string): CommunityGap | undefined {
  return MULTI_COMMUNITY_GAPS[key];
}

/**
 * Whether this build may reach the multi-community development adapter.
 *
 * Delegates to `areSimulatedFeaturesEnabled()` — the single switch shared with
 * Phases 5, 6, 7, 8 and 12. Six different answers to "may this build simulate?"
 * would be six things to get wrong.
 *
 * True under Metro and in a debug binary, and in an internal test build that
 * explicitly opted in with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. False in every
 * production build, where Metro's minifier additionally strips the dead branch —
 * so a production binary contains no path to a fabricated community, an invented
 * member count, a synthetic moderation queue or a simulated role.
 */
export function areMultiCommunityGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/**
 * The URL space every simulated community route lives under.
 *
 * **Never `/communities`** — that path is claimed by Phase 12's organization
 * membership programmes under `/community-gap/v0`, and never
 * `/community-life`, `/notifications`, `/discovery` or `/conversations`, which
 * are real and are read directly. A Phase 13 gap call that escaped a
 * development build 404s at the gateway rather than shadowing either.
 */
export const COMMUNITY_DIRECTORY_GAP_PREFIX = '/community-directory/v0';

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS — §76
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §76's flags.
 *
 * Two rules, both from the brief:
 *
 *   **Nothing completed is hidden behind "Coming Soon".** Every flag below
 *   defaults to `true`, because every capability it guards is built. A flag here
 *   is an operational kill-switch for a deployment that has a reason to disable
 *   a surface — not a placeholder for unfinished work.
 *
 *   **A flag is not the gap switch.** `areMultiCommunityGapsEnabled()` decides
 *   whether simulated data is reachable; these decide whether a *capability* is
 *   offered. A production deployment with a real community backend would have
 *   every flag on and the gap switch off, which is the configuration the
 *   architecture is built for.
 *
 * Read through `getCommunityFeatureFlags()` so a deployment-time override has
 * exactly one place to land.
 */
export interface CommunityFeatureFlags {
  multiCommunityEnabled: boolean;
  crossCommunityDiscoveryEnabled: boolean;
  communityStatisticsEnabled: boolean;
  communityComparisonEnabled: boolean;
  communityGovernanceEnabled: boolean;
  communityModeratorsEnabled: boolean;
  communityAmbassadorsEnabled: boolean;
  communityRecommendationsEnabled: boolean;
  communityScopedNotificationsEnabled: boolean;
  communityMapScopeEnabled: boolean;
  communityOnboardingEnabled: boolean;
}

const DEFAULT_COMMUNITY_FLAGS: CommunityFeatureFlags = {
  multiCommunityEnabled: true,
  crossCommunityDiscoveryEnabled: true,
  communityStatisticsEnabled: true,
  communityComparisonEnabled: true,
  communityGovernanceEnabled: true,
  communityModeratorsEnabled: true,
  communityAmbassadorsEnabled: true,
  communityRecommendationsEnabled: true,
  communityScopedNotificationsEnabled: true,
  communityMapScopeEnabled: true,
  communityOnboardingEnabled: true,
};

let flagOverrides: Partial<CommunityFeatureFlags> = {};

/**
 * Overrides a flag. Test-only in practice — there is deliberately no runtime
 * toggle, no debug menu and no remote flag, for the same reason
 * `gap-preview.ts` gives: a switch a support engineer can flip in production is
 * a switch that will one day be flipped.
 */
export function setCommunityFeatureFlagOverrides(next: Partial<CommunityFeatureFlags>): void {
  flagOverrides = { ...next };
}

export function getCommunityFeatureFlags(): CommunityFeatureFlags {
  return { ...DEFAULT_COMMUNITY_FLAGS, ...flagOverrides };
}
