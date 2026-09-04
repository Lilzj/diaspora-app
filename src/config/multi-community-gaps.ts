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
      'The complete directory experience is built: search, browse by type, filter by country of origin and by presence, suggested communities, membership state per row, and the empty, offline, error and no-results states. It is served by the development adapter and every surface renders <MultiCommunityGapNotice> so no simulated community is presented as a platform fact. Sorting by member count is offered only where the count is a backend figure — the adapter reports its counts as simulated, so that sort is disabled rather than fabricated.',
    coverage: 'full',
    existingBackendCapability: [
      '**Closed by `Diaspora.Modules.CommunityProgramme` (B18).** `GET /api/v1/communities` is real — CommunityEndpoints.cs. It is anonymous, as this entry required: an unauthenticated caller reads public communities and gets `membershipState: "None"` rather than a 401.',
      'The visibility model is real and enforced in the repository rather than by a caller, because the directory is the one place where forgetting it leaks the existence of every private community as an ordinary 200. Unlisted is readable by link and never listed; private answers exactly as absent.',
      'Sorting is honest rather than complete. `relevance` and `recent` are served — newest-first — and `members` is **refused with `communities.community.sort.members-unavailable`** exactly as this entry demanded, because the count is maintained rather than measured. `name` is refused too: the cursor is timestamp-keyed, and paging in timestamp order under a name label would be the same silent fallback in a new place.',
      '`types` and `originCountryCodes` bind as comma-joined strings, which is what this client already sent. A `string[]` parameter would have taken the whole value as one element, matched nothing, and served an unfiltered browse under a lit filter chip.',
      'The directory is seeded with a founding set — eleven communities including a regional one with no country and an interest community with no geography at all, because a directory of nothing but national diasporas would let "one country, one community" back in through the data.',
      '`allCountries` in `mocks/countries.ts` — 192 countries with names and flags. A country list, not a community list, and the distinction is the whole phase.',
      '`CountryRef` and `CountryVerificationSummary` are real and populated on publishers and authors, which is what GAP-009 projects onto.',
      '`GET /community-life/organizations` is a real directory of *organizations within* a community, which is a different level of the hierarchy and is reused unchanged.',
    ],
    missingBackendCapability: [
      'Any endpoint that returns communities as first-class entities with a stable identifier independent of country code',
      'A slug scheme stable enough to put in a deep link (§53)',
      'A visibility model, so an unlisted or private community is not returned to a caller who may not see it',
      'A lifecycle, so a suspended or archived community is distinguishable from a deleted one (§75)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities',
        method: 'GET',
        request:
          'query?: string; types?: CommunityType[]; originCountryCodes?: string[]; presenceCountryCode?: string; includeJoined?: boolean; sort?: relevance|name|members|recent; cursor?: string; limit?: number (server-capped)',
        response:
          '{ data: CommunityDirectoryEntry[], meta: { nextCursor, hasMore, totalCount? } } where each entry carries the community, the caller’s membershipState, isPrimary and an optional reason string',
        authorization:
          'Authenticated. An unauthenticated caller may read public communities only, and receives membershipState "None" rather than an error.',
        permission: 'community.directory.read',
        pagination:
          'Cursor-based with a server-enforced page cap. §77 requires the client to stay responsive at 1,000+ communities, which it does by paging and virtualizing — but only a cursor makes that bounded.',
        filtering: 'query (name and tagline), types, originCountryCodes, presenceCountryCode, includeJoined',
        sorting:
          '`members` must be rejected or omitted where the deployment does not publish authoritative counts, rather than silently falling back — §31 forbids implying popularity the backend does not report.',
      },
    ],
    domainModel: ['Community', 'CommunityRef', 'CommunityDirectoryEntry', 'CommunityDirectoryPage'],
    caching:
      'Query key `["community-directory","directory",query]`. Community metadata is slow-moving: staleTime 5 minutes, gcTime 30 minutes. §60 requires community metadata not be refetched repeatedly, so individual communities are seeded into the per-community cache from list responses rather than refetched on navigation.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A community list cannot be derived from a country list. Two communities can share a country of origin, a regional community has none, and an interest community has no geography at all. Deriving communities from `allCountries` would hardcode "one country = one community" into the architecture — the single thing §82.2 requires this phase to eliminate.',
    privacyConsiderations:
      'The response must not include private or invite-only communities for a caller who is not entitled to know they exist. The client sends no membership information in the request and the adapter stores none; membership state on a row comes from the server, so an unauthenticated browse cannot reveal what the caller belongs to.',
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
      'The full profile is built — identity, description, origin, lifecycle status, languages, statistics, moderators, ambassadors, rules and the seven content sections — and resolves by *either* id or slug so a deep link works before the app knows the id. Suspended, archived and not-found each render their own state with the server’s reason verbatim (§74, §75).',
    coverage: 'full',
    existingBackendCapability: [
      '**Closed by B18.** `GET /api/v1/communities/{idOrSlug}` is real and resolves either — a Guid is read as an identifier, anything else as a handle, so a deep link works before the app knows the id.',
      'The 404-versus-403 rule this entry asked to be documented: **the route never answers 403.** Every reason it would refuse is also a reason not to confirm the community exists. A caller who already demonstrably knows it exists is shown it — public and unlisted to anyone, private and invite-only to anyone holding a membership row in *any* state, including somebody who left or was removed. Pending is absent to everyone but its creator.',
      '`statusReason` is real and served verbatim on suspended and archived communities, which is what §75 keeps them distinct from deleted for.',
      'The community carries `iconName` and `accentColor` as well as a logo, because a regional or interest community has no country and therefore no flag — a contract-valid response with three nulls would have made this screen worse than the adapter it replaced.',
      '`GET /community-life/organizations/{id}` is a real profile read for an organization, and its shape is the template this contract should follow.',
      '`GET /neighborhood/{id}` is a real place profile with resource counts, reused for the community’s local sections.',
    ],
    missingBackendCapability: [
      'Resolution by slug as well as id, since a deep link carries the slug',
      'A `statusReason` on suspended and archived communities, rendered to the member rather than swallowed',
      'A documented 404-versus-403 rule, so the client can distinguish "no such community" from "you may not see this one"',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{idOrSlug}',
        method: 'GET',
        request: 'Path parameter accepts either the opaque id or the slug.',
        response:
          '{ data: Community } including status, statusReason, visibility, primaryLanguage, supportedLanguages and a Sourced memberCount',
        authorization: 'Authenticated for private and unlisted; anonymous for public.',
        permission: 'community.read',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['Community', 'CommunityStatus', 'CommunityUnavailableReason'],
    caching:
      'Query key `["community-directory","community",idOrSlug]`. staleTime 5 minutes. Directory responses seed this cache so opening a profile from a list is instant and costs no request (§60).',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'Nothing to read. A profile assembled client-side from a country code would show a flag, a name and nothing else, and would claim the community exists on the platform when it does not.',
    privacyConsiderations:
      'A 403 must not be answered with a 404 that leaks nothing, nor a 404 with a 403 that confirms a private community exists. The client renders both distinctly and never retries a 403 as an anonymous request.',
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
      'The whole relationship set is modelled and rendered: ten distinct states, a primary marker, roles, per-community server-reported capabilities and per-membership visibility. Member, Interested, Following and Discovering are visually distinct everywhere they appear (§8). The set is server state held in TanStack Query, never duplicated into Zustand (§44); only the *active selection* is client state.',
    coverage: 'full',
    existingBackendCapability: [
      '**This entry was marked connected against the wrong route, and stayed that way for a phase.** `GET /api/v1/communities/memberships/me` is real and answers B18’s *programme* memberships — an organization’s paid membership scheme, a different concept wearing the same word. The mark was made on the path, not on what the path serves.',
      'Its own adapter recorded the symptom without anybody reading it as one: `toMembershipSet` says the route answers a bare array with no wrapper and that “`primaryCommunityId` is not carried at all”. That is not a route missing a field — it is a different route.',
      '**Genuinely closed now, at `GET /api/v1/communities/me/memberships`.** Every community relationship the caller holds, terminal ones included, each with the caller’s capability set and the server’s own statement of which is primary. `me` is a reserved handle, so nothing under `/communities/me/` can be shadowed by a community.',
      '**PARTLY RESOLVED (Remediation Wave C-06), and it was already consumed before this wave looked.** `MembershipEndpoints.cs:67` serves the caller’s memberships, `community-programme-api.ts` calls it and `hooks/community-life.ts` reads it. The entry was baselined as stale on the assumption that nothing consumed it; that assumption was wrong, and checking is what this wave did rather than building a second arm beside the one that existed.',
      '**The declared response shape below is wrong, and wrong in the direction that yields `undefined` rather than an error.** It asks for `{ data: { memberships: CommunityMembership[], primaryCommunityId?: string } }`. The route answers a **bare array**: there is no wrapper object and no `primaryCommunityId`. A client reading `.memberships` off it gets `undefined`, and `.primaryCommunityId` is not served at all — which is why this entry is PARTIAL and not CONNECTED. The primary-community half of §7 still has no contract behind it.',
      '`User.nationality` and `User.residenceCountry` exist on the auth user — a self-declared string and a place, neither of which is a membership.',
      '`CountryVerificationSummary` is a real verification of origin or residence, which is the closest existing thing to `VerifiedMember` and is what that state should eventually be derived from.',
      'Phase 12’s organization membership (`MembershipStatus`) is real-shaped and is a *different* domain — see the header note.',
    ],
    missingBackendCapability: [
      'A membership record between a user and a community, with a state, a joined-at and a revocation reason',
      'A rule for whether membership requires approval, per community',
      'A distinction between an expressed interest and a membership, so the client stops being the only place that knows the difference',
      'A per-membership visibility field the member controls (§41)',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/memberships/me',
        method: 'GET',
        request: 'None. The bearer token is the subject.',
        response:
          '{ data: { memberships: CommunityMembership[], primaryCommunityId?: string } } where each membership carries state, isPrimary, roles, capabilities and visibility',
        authorization: 'Authenticated. Returns only the caller’s own memberships, never another user’s.',
        permission: 'community.membership.read.self',
        pagination:
          'None expected — a member has tens of communities at most. If that assumption breaks, a cursor rather than a cap, because a truncated membership set would silently lose the primary.',
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: [
      'CommunityMembership',
      'CommunityMembershipSet',
      'CommunityMembershipState',
      'CommunityMembershipVisibility',
    ],
    caching:
      'Query key `["community-directory","memberships","me"]`. staleTime 60 seconds and invalidated by every membership mutation. It is the input to scope resolution, so a stale set means a wrong scope — which is why §61’s invalidation list is implemented as one function rather than per-screen calls.',
    realtimeEvent: 'community.membership.changed — so a revocation reaches the device without a refetch',
    notificationEvent: 'B13 notification on approval, rejection and revocation',
    whyNotImplementable:
      'The client cannot invent a membership. Deriving one from `nationality` would assert that everybody of Nigerian nationality is a member of the Nigerian community — which §55 forbids explicitly, and which would be wrong in both directions.',
    privacyConsiderations:
      'This is the most sensitive read in the phase. Membership can imply nationality, immigration status, religion or ethnicity. The route must be self-only; there must be no `GET /users/{id}/memberships`. The client persists **no** membership data to disk (§45) — only the active community id and non-sensitive preferences — and the analytics allow-list drops any membership identifier before an event is buffered (§63).',
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
      'Every §33 action is built with its full state machine, including the approval-required path, the pending state, the declined state and the revoked state. Mutations do not retry automatically, exactly as the platform’s financial mutations do not, and a transport failure renders as indeterminate rather than failed — a member who taps Join and sees a timeout must not be told it failed when it may have succeeded.',
    coverage: 'full',
    existingBackendCapability: [
      '**Closed by B18.** `POST /api/v1/communities/{idOrSlug}/membership` takes the act as data — `join`, `follow`, `express-interest` — and `DELETE` the same path with `?action=` takes `leave`, `unfollow`, `remove-interest`. The removals carry the act in the query string because minimal APIs refuse to infer a body on DELETE; a body would have been ignored and the route would have fallen through to its default, which is `leave`.',
      'The server decides legality and the client checks nothing. A member who taps Follow **stays a member** rather than being demoted; somebody waiting on approval keeps their place; a revoked member cannot follow their way back in.',
      'The approval rule this entry asked for is a property of the community — `requiresApproval`, set by the people who run it and false unless they say otherwise — and it is on the wire, so the button says so before it is pressed rather than after.',
      'The member count moves only on a real transition into membership. An approval-gated join leaves the caller waiting and the community the size it was.',
      'Joining publishes nothing. A new membership is `Private`, and `Private` is the visibility enum’s zero so a path that forgets the field fails closed — §41 satisfied structurally rather than by convention. `PUT /communities/{idOrSlug}/membership/visibility` is the only way that changes, and there is no administrative form of it.',
      'Phase 12’s organization membership application, cancellation and decision routes are real-shaped and are the template for the approval path.',
      '`FollowButton` already exists for following *people* and, since Wave D-2b, writes to `POST`/`DELETE /community/follows/{targetId}` rather than to a local store. Its interaction vocabulary is reused rather than reinvented — as is its shape around the two traps on those routes: `targetType` is a body field on the POST and a query parameter on the DELETE, and unfollowing something you do not follow is a 404 rather than a no-op.',
    ],
    missingBackendCapability: [
      'Write routes for each transition, with the server deciding legality',
      'A documented rule for which communities may be joined without approval',
      'An idempotency contract, so a double-tap on Join is not two applications',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /communities/{id}/membership',
        method: 'POST',
        request: '{ action: "join" | "follow" | "express-interest" }',
        response: '{ data: CommunityMembership } — the resulting state, server-decided',
        authorization: 'Authenticated. The server decides whether the transition is legal.',
        permission: 'community.membership.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
      {
        endpoint: 'DELETE /communities/{id}/membership',
        method: 'DELETE',
        request: '{ action: "leave" | "unfollow" | "remove-interest" }',
        response: '{ data: CommunityMembership } — state after removal, e.g. "Left"',
        authorization: 'Authenticated, self only.',
        permission: 'community.membership.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityMembershipAction', 'CommunityMembership'],
    caching:
      'Every action invalidates the membership set, the community profile, the directory page it was performed from, and the community-scoped content queries whose scope includes the affected community. §61: a targeted list, never `queryClient.clear()`.',
    realtimeEvent: 'community.membership.changed',
    notificationEvent: 'B13 notification to the member on an approval decision',
    whyNotImplementable:
      'A membership the client wrote to itself is not a membership. Optimistically updating a joined state and then discovering the community requires approval would show the member content they cannot see.',
    privacyConsiderations:
      'Joining must not publish anything. The client sends no visibility change with a join and defaults new memberships to `Private` (§41), so the member opts in to being visible rather than out.',
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
      'Setting a primary community, changing it and clearing it are all built, from onboarding and from the community profile. The *profile* half is connected: the existing `/trust/profile` and the auth user already carry `nationality` and `residenceCountry`, and the onboarding flow writes residence through the existing certified path unchanged. The *primary community* half goes to the adapter, because there is nowhere on the certified user record to put a community id.',
    coverage: 'full',
    existingBackendCapability: [
      '**Closed by B18, at a different route.** `PUT /api/v1/communities/me/primary`, not `/users/me/primary-community` — there is no `/api/v1/users` space on this platform and no module owns one, so this entry sketched a route into a prefix that does not exist.',
      'Primary lives on the membership row rather than the user record, which makes "a primary must be a community you belong to" structural rather than a check somebody can forget: there is nowhere to record one without a membership to hang it on. A filtered unique index enforces at most one per member.',
      'It answers the whole set, for the reason this entry gave — so primacy cannot disagree. `primaryCommunityId` is stated rather than left to be scanned.',
      'Not back-filled from `nationality`. §55 forbids inferring community membership from identity data, and no migration writes this field.',
      '`User.residenceCountry` and `User.nationality` are real and are written by the existing onboarding — Phase 13 does not touch either, and specifically does not overwrite `nationality` with a community.',
      '`GET/PUT /trust/profile` is a real profile record with privacy flags, which is where a primary-community field most naturally belongs.',
      '`store/location.ts` already owns residence and is reused unchanged.',
    ],
    missingBackendCapability: [
      'A `primaryCommunityId` on the user record, distinct from `nationality`',
      'A documented rule for whether the primary must be a community the member has joined',
      'An audit entry when it changes, since it drives personalization',
    ],
    requiredContracts: [
      {
        endpoint: 'PUT /users/me/primary-community',
        method: 'PUT',
        request: '{ communityId: string | null }',
        response: '{ data: CommunityMembershipSet } — the whole set, so primacy cannot disagree',
        authorization: 'Authenticated, self only.',
        permission: 'community.primary.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityMembershipSet', 'CommunityMembership.isPrimary'],
    caching:
      'Invalidates the membership set and every query whose scope token was derived from `PRIMARY_COMMUNITY`. Because the token is the resolved id list rather than the literal mode, the previous primary’s cached data remains addressable under its own key and is not shown under the new primary — which is the cache-collision property tested in `community-cache-isolation.test.ts`.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'The primary community drives the home feed, recommendations and notification scope. Storing it only on the device would mean a member’s second device shows a different home feed, and there is no field on the certified user record to store it in.',
    privacyConsiderations:
      'The primary community must not be added to any public profile response by default. §41: the client defaults `showPrimaryCommunityOnProfile` to false and the contract must honour a per-field visibility flag rather than publishing it with the profile.',
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
      'Every role-gated affordance in the phase reads `CommunityCapabilities`, which the *server* fills in. `lib/community/access.ts` has no code path that derives a capability from a role, and a capability the server did not report is false. Where no capability is reported the affordance is **hidden** rather than shown-and-disabled, because a disabled Moderate button tells somebody they are nearly a moderator.',
    coverage: 'full',
    existingBackendCapability: [
      '**Closed by B18.** `GET /api/v1/communities/{idOrSlug}/capabilities` is real, anonymous, and answers **an all-false set rather than a 403** for a stranger — exactly as this entry required, because a refusal would tell them a moderation queue exists.',
      'Eleven booleans, derived server-side from the caller’s standing and the community’s lifecycle. An archived community grants nothing but reading; a suspended one keeps its moderation capabilities and loses its posting one, because suspension usually exists so somebody can review what happened.',
      '**Nothing grants a moderator or administrator role yet.** The role directory is GAP-017 and its own increment, so every member’s moderation capabilities are false — which is true rather than a placeholder. Staff moderate anywhere and do not read the member roll, which is the line B9, B10, B11 and B12 all draw.',
      'Phase 12’s `OrganizationCapabilities` is exactly this shape for organizations, is real-shaped, and is the pattern copied here rather than a new one invented.',
      '`/trust/profile` already returns server-evaluated account state, which is the established precedent for authorization arriving as data.',
    ],
    missingBackendCapability: [
      'A capability set per (caller, community), evaluated server-side',
      'A rejection contract distinguishing "not permitted" from "not signed in"',
      'Capability re-evaluation on role change, so a removed moderator loses the affordance without reinstalling',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/capabilities',
        method: 'GET',
        request: 'None beyond the path. The subject is the bearer token.',
        response: '{ data: CommunityCapabilities } — roles echoed for display, plus one boolean per action',
        authorization: 'Authenticated. Returns an all-false set rather than 403 for a non-member.',
        permission: 'Evaluated per field by the server; the client evaluates none.',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityCapabilities', 'CommunityRole'],
    caching:
      'Query key `["community-directory","capabilities",communityId]`. staleTime 60 seconds — short, because a revoked role must stop being effective quickly — and invalidated on every membership mutation and on the role-revoked realtime event.',
    realtimeEvent: 'community.role.changed — the only reliable way a revocation reaches a running app',
    notificationEvent: 'B13 notification when a role is granted or revoked',
    whyNotImplementable:
      '§62 forbids trusting frontend community state for roles, moderation or content access. Deriving capabilities from a role string would be exactly that, and would show a moderation queue to somebody the server will refuse — which is worse than showing nothing.',
    privacyConsiderations:
      'An all-false set for a non-member must not reveal that a moderation queue exists. The client renders nothing rather than an empty queue with a locked icon.',
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
    key: 'communityStatistics',
    capability: 'Community statistics — members, growth, activity, content counts',
    feature: '§29 Community Statistics',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The statistics experience is complete: metric cards, a period selector, per-metric provenance, freshness with the source and date, a restricted-metric path, and explicit Loading, Data unavailable and Stale states. It is **hybrid and marked at field level**: the counts that are genuinely derivable from certified routes — events, organizations, guides, jobs, housing, marketplace and provider counts for the communities’ presence areas, via the real `/location/nearby` and `/neighborhood/{id}` aggregates — are `backend`; member counts, growth rates and engagement are `simulated`. Every figure carries `DataFreshness`, and an accessible text alternative to each chart exists (§59).',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /location/nearby` genuinely aggregates housing, jobs, marketplace, events, providers and updates for a centre and radius — a real activity count.',
      '`GET /neighborhood/{id}` returns real `resourceCounts`.',
      '`GET /community-life/organizations` and `/events` return a real `totalCount`, which is a real count of community content.',
      '`CountryStatistics` in `types/country.ts` is a real shape with provider, guide, update and contributor counts — a *country* statistic, reused where the community has a single country of origin and marked as such.',
    ],
    missingBackendCapability: [
      'Any member count for a community, since there is no membership record to count',
      'A growth figure, which requires a comparable previous period the platform does not retain',
      'An engagement metric with a stated methodology and sample size',
      'A restricted-metric flag, so private statistics are the server’s decision rather than the client’s',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/statistics',
        method: 'GET',
        request: 'period: 7d|30d|90d|12m|all',
        response:
          '{ data: { metrics: [{ key, label, value, changePercent?, unit?, isRestricted?, computedAt, sourceName, methodology?, sampleSize? }], period } }',
        authorization: 'Authenticated. Restricted metrics omitted — not nulled — for callers without the capability.',
        permission: 'community.statistics.read / community.statistics.read.private',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityStatistics', 'CommunityMetric', 'StatisticsPeriod', 'DataFreshness'],
    caching:
      'Query key `["community-directory","statistics",communityId,period]`. staleTime 10 minutes: a statistic that changes minute to minute is not a statistic. Never invalidated by a membership mutation, because one join does not move a published aggregate.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '§29 forbids inventing authoritative metrics. A member count derived from anything the client can see would be a count of the members the client happens to have loaded, and a growth rate would be a count of nothing. The counts that *are* derivable are shown as backend values; the rest are marked.',
    privacyConsiderations:
      'A count over a small population is an identifier. The contract needs a minimum-cell suppression rule: "3 members in Rose Hill" is three people’s community membership published as an aggregate. The client renders a suppressed metric as "too few to report" rather than as zero.',
    migrationConsiderations:
      'Because provenance is per metric, a backend that ships member counts first and growth later needs no client change — the marks simply flip as fields become `backend`.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'high',
    recommendedPhase: 'B19 Community Insights',
  },

  communityComparison: {
    id: 'FRONTEND-PHASE13-GAP-008',
    key: 'communityComparison',
    capability: 'Side-by-side community comparison',
    feature: '§30 Community Comparison',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Comparison of up to three communities is built, as an aligned table with one row per metric and a screen-reader-navigable alternative. The client **computes no winner, no ranking and no composite score** — that would be the frontend inventing an authoritative judgement about which community is better, which §30 and §29 both forbid. Restricted metrics are absent from the comparison rather than shown as gaps.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 8 established the pattern for a client-side side-by-side that computes nothing (`compareNeighborhoods`), and this follows it exactly.',
    ],
    missingBackendCapability: [
      'A server-side comparison, so the client is not aligning metrics whose periods or methodologies differ',
      'A guarantee that a metric key means the same thing across two communities',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/compare',
        method: 'GET',
        request: 'ids: comma-separated community ids (server-capped at 3–5); period',
        response: '{ data: { communities: CommunityRef[], rows: [{ key, label, values[], unit? }], period } }',
        authorization: 'Authenticated. Restricted metrics omitted per community per caller.',
        permission: 'community.statistics.read',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityComparison'],
    caching:
      'Query key `["community-directory","compare",sortedIds,period]`. Ids are sorted before keying so A-vs-B and B-vs-A are one cache entry rather than two.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'Aligning two statistics the backend computed differently produces a table that looks authoritative and is not. Without a guarantee that `events.count` means the same thing for both communities, a comparison is a category error rendered as a grid.',
    privacyConsiderations:
      'Comparison multiplies the small-population problem in GAP-007: three communities side by side make a suppressed cell obvious by subtraction. Suppression must be applied per cell, and the client renders a suppressed cell as unavailable rather than blank.',
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
      'This is the load-bearing gap of the phase. **Remediation Wave J found the previous description of it to be wrong in the direction that mattered.** It said community-scoped discovery "works across all eight domains … by projecting a community scope onto the publisher’s `originCountry` (real and populated)". No certified list response carries a publisher origin — see the corrected capability list below — so the projection reads a field the fixtures populate and the server does not, and would have matched zero rows under every scope in production. The projection still lives in exactly one place (`lib/community/scope.ts`) and still reports what it could not express; what changed is that `narrowToScope` now checks each page for an origin signal before narrowing it and reports `scopeUnavailable` when there is none. A list therefore says one of three things and never a fourth: the scope was applied approximately, the scope could not be applied at all, or nothing was scoped because the member asked for everything. Community badges still carry a `CommunityAssociationBasis` and a card whose basis is `origin` or `location` renders the qualifier rather than asserting the association.',
    coverage: 'partial',
    existingBackendCapability: [
      // ⚠ Remediation Wave J corrected all four of these lines. Each is kept
      // with its correction attached rather than deleted, because the wrong
      // version was cited by four subsequent waves.
      '⚠ **NOT a backend capability.** This line claimed `owner.originCountry`, `employer.originCountry`, `host.originCountry` and `seller.originCountry` were "real, certified `CountryRef` fields". Audited: `JobCardResponse.cs:17` has no employer object; `LandlordSummaryResponse.cs:4-24` and `SellerSummaryResponse.cs:12-50` declare no country field; `ProviderOwnerResponse.cs:26` declares `OriginCountryCode` and `ProviderMapper.cs:434-444` assigns it `null` unconditionally. The field is populated by the development fixtures and by nothing else.',
      '⚠ `Guide.country` is real, but it is the **jurisdiction the guide is about** (`Guides/…/GuideLocationContext.cs:36`), not a community. A guide to UK tenancy law is not UK-community content.',
      '⚠ `GET /community-life/events` and `/organizations` accept **none** of `cityName`, `latitude`, `longitude`, `radiusKm`, `timeFilter` or `sortBy`. They bind `q`, `category`/`type`, `countryCode`, `city`, `neighborhoodAreaId`, `bounds`, `sort`, `cursor`, `limit` — plus `startsAfter`/`startsBefore`/`free` on events. See `lib/community-life-api.ts`.',
      '⚠ `GET /housing/search` binds a point and `radiusKm`; `GET /jobs` and the two Community Life browses bind **no proximity at all** — they scope by `bounds` or an area id — and none of the four can sort by distance without a resolved centre.',
      'The one thing that **is** real and load-bearing: every discovery route binds a `countryCode`/`country` filter. It resolves to `<entity>.Location.CountryCode` in every case — where the content is, not where its publisher came from — so it cannot stand in for a community scope.',
      '`CommunityUpdate` (B9) carries country, city, area, category and urgency.',
    ],
    missingBackendCapability: [
      'A `communityId` (or `communityIds`) association on guides, jobs, housing, marketplace listings, provider listings, events, organizations and updates',
      'A `communityIds` filter parameter on each of those list routes',
      'A declared-association write path, so a publisher can say which community their content is for',
      'A rule for content that belongs to several communities, and one for content that belongs to none',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /{guides|jobs|housing|marketplace|listings|community-life/events|community-life/organizations|updates}',
        method: 'GET',
        request:
          'communityIds?: string[] (repeatable or comma-separated), alongside every existing parameter, plus crossCommunity?: boolean to opt into unscoped results',
        response:
          'The existing envelope, with a `communities: CommunityRef[]` on each item stating the declared association, and a `communityMatchBasis` where the server matched approximately',
        authorization: 'Unchanged from each existing route. A community filter must not widen visibility.',
        permission: 'Unchanged. A private community’s content must not become visible by naming its id.',
        pagination: 'Unchanged per route.',
        filtering: 'communityIds intersected with the caller’s visibility, never unioned with it.',
        sorting: 'Unchanged. A community filter is not a relevance signal.',
      },
    ],
    domainModel: ['CommunityAssociation', 'CommunityAssociationBasis', 'CommunityScope'],
    caching:
      'Every community-sensitive query key gains the resolved scope token — `["community-life","events",{…,communityScope:"c:dev-ng|dev-gh"}]` — so two scopes are two cache entries and neither can serve the other. This is §43 and it is proved by test rather than asserted.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A country of origin is not a community. A Ghanaian-origin seller’s sofa is not "Ghanaian community content", and a guide about London written by a Nigerian author is not a Nigerian community guide. The projection is the best available approximation of a filter the routes cannot express, it is genuinely useful, and presenting it as a community filter without saying so would be the precise conflation §2 forbids. Client-side filtering also cannot find content the server did not return, so a narrow scope over a wide page shows less than exists.',
    privacyConsiderations:
      '§19 forbids exposing private community membership without permission. The projection therefore uses the publisher’s **country of origin**, which is already published on the card today, and never the publisher’s community membership — which the client does not have and must not ask for. A seller’s membership of a private community can never appear on a listing card, because the card has no field for it.',
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
      'Search gains a community filter, community chips and community-aware result badges, and the community selection survives navigation between search, results and detail (§54). It uses the **existing** `GET /discovery/search` — §38 forbids a second search engine and this phase builds none. The community dimension is projected exactly as in GAP-009 and the results header states when the scope was applied approximately.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /discovery/search` is real and takes `city`, returning listings and guides.',
      '`store/knowledge-search.ts` already owns search state and is reused.',
      'Every search result already carries the publisher’s `originCountry`, which is what the projection filters on.',
    ],
    missingBackendCapability: [
      'A `communityIds` parameter on `GET /discovery/search`',
      'A community facet in the response, so the filter chips show real counts rather than counting the current page',
      'Server-side ranking that can consider community scope, since the client must not rank',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /discovery/search',
        method: 'GET',
        request: 'communityIds?: string[]; crossCommunity?: boolean, alongside the existing city and query parameters',
        response: 'The existing envelope plus `facets: { communities: [{ id, count }] }`',
        authorization: 'Unchanged.',
        permission: 'Unchanged.',
        pagination: 'Unchanged.',
        filtering: 'communityIds',
        sorting: 'Server-side. The client does not re-rank (§25).',
      },
    ],
    domainModel: ['CommunityScope', 'CommunityAssociation'],
    caching:
      'The search query key carries the scope token. A search for "plumber" under the Nigerian scope and the same search under the Ghanaian scope are different cache entries.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'Facet counts cannot be computed from a page. Counting the communities present in twenty returned results and labelling the chips with those numbers would tell the member there are two Ghanaian results when there are two hundred.',
    privacyConsiderations:
      'A community facet must not reveal the existence of private communities. Facets are limited to communities the caller can already see.',
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
      'Recommendation rails are community-aware: they carry the active scope, they are invalidated and refetched when the scope changes, and a cross-community recommendation is **labelled as such** rather than shown silently under one community. **No scoring, ranking or personalization happens in the frontend** — §25 forbids it and this phase implements none. Where the engine accepts no community scope the rail falls back to the existing `/explore/recommendations` and says it is showing platform recommendations rather than community ones.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /explore/recommendations` is real and is the engine surface this phase consumes.',
      'Phase 12’s community recommendation rail and its dismiss route establish the shape.',
      'B14 remains authoritative for ranking and this phase adds nothing to it.',
    ],
    missingBackendCapability: [
      'A `communityIds` scope on the recommendation request',
      'A `scope: "community" | "cross-community"` marker on each recommendation, so the UI can label it honestly',
      'A `reason` string per recommendation, so the rail can say why rather than assert relevance',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /recommendations',
        method: 'GET',
        request: 'communityIds?: string[]; crossCommunity?: boolean; surface: string; limit?: number',
        response: '{ data: [{ …existing, scope: "community"|"cross-community", communityId?, reason? }] }',
        authorization: 'Authenticated.',
        permission: 'Unchanged.',
        pagination: 'Limit only.',
        filtering: 'communityIds',
        sorting: 'Server-side, always. The client never re-orders a recommendation list.',
      },
    ],
    domainModel: ['CommunityScope'],
    caching:
      'Recommendation keys carry the scope token and are invalidated on community switch, on interest change and on primary change (§47, §61). This is what stops Nigerian-community recommendations appearing under Ghanaian context.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'Filtering a ranked list client-side breaks the ranking: removing items 2, 4 and 7 from a top-ten leaves a list the engine never produced and did not endorse. And §25 forbids the frontend implementing scoring, so re-ranking is not available as a repair.',
    privacyConsiderations:
      'A recommendation request that carried the member’s full interest list would send community membership to an engine on every screen. The client sends the *resolved scope for the current surface* only, which is the minimum that makes the request meaningful.',
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
      'The complete settings experience is built: per-category community scope (primary only, my communities, interests included, all, specific communities, none) across every B13 category — events, jobs, marketplace, housing, guides, updates, organizations and providers. It is an **overlay on B13**, not a second preference system: the categories, channels, digest and quiet hours all come from and go to the real `/notifications/preferences`, and this phase adds only the community scope per category, which the adapter holds.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET/PUT /notifications/preferences` is real, with per-category `enabled`, `inApp`, `push`, `email`, `useDigest` and `isMandatory`.',
      '`GET /notifications/categories` is real and is the category vocabulary this overlay keys on.',
      '`/notifications/preferences/communication` is real and owns quiet hours, digest and language — untouched here.',
    ],
    missingBackendCapability: [
      'A community scope per category on the preference record',
      'Server-side application of that scope when a notification is generated — a client-side filter only hides what was already delivered',
      'A rule for a member with no communities, so "primary only" does not silently mean "nothing"',
    ],
    requiredContracts: [
      {
        endpoint: 'PUT /notifications/preferences',
        method: 'PUT',
        request:
          'The existing record, with each category gaining communityScope: primary-only|my-communities|interested-included|all-communities|specific|none and communityIds when specific',
        response: 'The updated record',
        authorization: 'Authenticated, self only.',
        permission: 'notifications.preferences.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityNotificationPreference', 'CommunityNotificationScope'],
    caching:
      'The community overlay is invalidated with the B13 preference record so the two cannot disagree on screen.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A preference the server does not apply is not a preference. Filtering the inbox client-side would still have sent the push notification, which is the part the member was trying to stop.',
    privacyConsiderations:
      'Storing "notify me about the Nigerian community" server-side is storing community interest. It belongs with the membership record under the same access rule, not in a general preferences blob readable by a wider set of services.',
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
      'The notification list gains a community filter and community badges, and tapping a community notification restores the right community context before navigating (§53). It uses the real `/notifications` list and the existing `notification-routes.ts` router — §26 forbids a second notification system and this phase builds none. Where a notification carries no community field the badge is absent rather than guessed.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /notifications` is real, with categories, read state and a deep-link target per notification.',
      '`lib/notification-routes.ts` already routes every notification type and is extended rather than replaced.',
    ],
    missingBackendCapability: [
      'A `communityId` on the notification payload',
      'Server-side application of the community scope from GAP-012, so an out-of-scope notification is never generated',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /notifications',
        method: 'GET',
        request: 'communityIds?: string[] alongside the existing filters',
        response: 'The existing envelope with `communityId?: string` on each notification',
        authorization: 'Authenticated, self only.',
        permission: 'Unchanged.',
        pagination: 'Unchanged.',
        filtering: 'communityIds',
        sorting: 'Unchanged.',
      },
    ],
    domainModel: ['CommunityRef', 'CommunityScope'],
    caching: 'The notification list key carries the scope token when a community filter is applied.',
    realtimeEvent: 'Unchanged — the existing notification channel carries the new field',
    notificationEvent: 'Every community-scoped notification type',
    whyNotImplementable:
      'The client cannot infer which community a notification concerns from its text. §48 says not every community notification belongs in the primary feed, and deciding which do requires a field.',
    privacyConsiderations:
      'A community badge on a notification in a shared-screen context reveals membership. The badge respects the same visibility preference as the profile, and is suppressed on the lock-screen preview path where the platform allows that to be controlled.',
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
      'Where a conversation has a community context the thread header shows it, the list can filter by it, and navigation from it restores that context. It uses the real B13.2 `/conversations/*` unchanged — §27 forbids a second messaging infrastructure. **No participant’s community membership is ever displayed**: the badge describes the *conversation’s* subject, not the people in it, and §52 forbids exposing membership to participants without authorization.',
    coverage: 'partial',
    existingBackendCapability: [
      'The whole of `/conversations/*` is real: threads, messages, requests, blocking, media, search and reporting.',
      'Conversations already carry a `contextType`/`contextId` for the listing or job they concern, which is the natural place a community association would attach.',
    ],
    missingBackendCapability: [
      'A `communityId` on the conversation record where the conversation arises from a community context',
      'A rule stating that a community association on a conversation never implies either participant is a member',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /conversations',
        method: 'GET',
        request: 'communityIds?: string[] alongside the existing filters',
        response: 'The existing envelope with `communityId?: string` on each conversation',
        authorization: 'Authenticated, participant only. Unchanged.',
        permission: 'Unchanged.',
        pagination: 'Unchanged.',
        filtering: 'communityIds',
        sorting: 'Unchanged.',
      },
    ],
    domainModel: ['CommunityRef'],
    caching:
      'The conversation list key carries the scope token only when the member applied a community filter. Switching community does **not** re-key the unfiltered inbox — a member’s conversations are theirs, not a community’s, and hiding half the inbox on a community switch would lose messages.',
    realtimeEvent: 'Unchanged',
    notificationEvent: 'Unchanged',
    whyNotImplementable:
      'There is no field. Inferring a community from the participants would require reading their memberships, which is exactly the leak §52 forbids.',
    privacyConsiderations:
      'The highest-risk surface in the phase for accidental disclosure, and the reason the badge is scoped to the conversation rather than the person. The client has no code path that requests another user’s community memberships, and the repository exposes no function that could.',
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
      'The map gains a community filter that applies to every existing layer — events, providers, organizations, housing, marketplace, jobs, guides and alerts — with multi-community selection and a cross-community mode. It uses **Phase 8’s map** unchanged; §28 forbids a second map system and this phase builds none. The community dimension enters through `MapSearchParams`, which means it enters the existing search fingerprint and therefore the existing cache key, so a community switch cannot leave stale markers behind (§46).',
    coverage: 'partial',
    existingBackendCapability: [
      'The whole of Phase 8 is real where it matters: proximity search on housing, marketplace, jobs, events and organizations; `/location/nearby`; `/location/search`; `/neighborhood/{id}`; and B9 community updates as the live alert feed.',
      '`MapSearchParams` already carries `countryCode`, which is what the projection uses today.',
    ],
    missingBackendCapability: [
      'The `communityIds` parameter from GAP-009 on the routes the map queries',
      'A community presence layer — where a community actually is — which is a genuinely new aggregate and not derivable from listings',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/presence',
        method: 'GET',
        request: 'bounds or centre+radiusKm; zoom',
        response:
          '{ data: { cells: [{ latitude, longitude, weight }], minWeight, maxWeight, computedAt, sourceName } } with minimum-cell suppression applied server-side',
        authorization: 'Authenticated.',
        permission: 'community.presence.read',
        pagination: null,
        filtering: 'bounds',
        sorting: null,
      },
    ],
    domainModel: ['CommunityScope', 'MapSearchParams.communityIds'],
    caching:
      '`mapKeys.search` already hashes the filter object into its fingerprint, so adding the scope to `MapSearchParams` gives per-scope isolation with no new key machinery — verified by test rather than assumed.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A community presence layer built from listing density is a map of where listings are, not of where a community is, and drawing it as the latter would tell somebody a neighbourhood is Nigerian because two people sold sofas there. The suppression rule matters more than the aggregate: an unsuppressed presence layer over a sparse area is a map of individual members’ homes.',
    privacyConsiderations:
      'The single most sensitive artefact this phase could produce is a map of where a diaspora community lives. It is registered here and **not built**, even behind the adapter, beyond a suppressed synthetic layer that carries its provenance. Phase 8’s `lib/maps/privacy.ts` already reduces any coordinate to an ~11 km grid cell before it can reach analytics, and that applies unchanged.',
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
    key: 'communityGovernance',
    capability: 'Community rules, guidelines and notices',
    feature: '§36 Community Governance',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Rules, guidelines and community notices are complete: an ordered rule list with consequences rendered verbatim, pinned and expiring notices, attribution by role, and the publish path gated on the server-reported `canManageRules` / `canPublishNotice` capability rather than on a role string.',
    coverage: 'none',
    existingBackendCapability: [
      '`/profile/community-guidelines` is a real screen for the **platform’s** guidelines, and community rules are deliberately additive to it rather than a replacement.',
      'Phase 12’s community announcements establish the notice shape.',
    ],
    missingBackendCapability: [
      'Rule and notice records scoped to a community',
      'A write path gated on a server-evaluated capability',
      'A versioning rule, so a member can see that a rule changed after they joined',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/rules',
        method: 'GET',
        request: 'None beyond the path.',
        response: '{ data: CommunityRule[] } ordered by position',
        authorization: 'Any caller who can see the community.',
        permission: 'community.rules.read',
        pagination: null,
        filtering: null,
        sorting: 'position',
      },
      {
        endpoint: 'GET /communities/{id}/notices',
        method: 'GET',
        request: 'includeExpired?: boolean; cursor?: string',
        response: '{ data: CommunityNotice[], meta: { nextCursor, hasMore } }',
        authorization: 'Any caller who can see the community.',
        permission: 'community.notices.read / community.notices.write',
        pagination: 'Cursor',
        filtering: 'includeExpired',
        sorting: 'isPinned desc, publishedAt desc',
      },
    ],
    domainModel: ['CommunityRule', 'CommunityNotice'],
    caching:
      'Rules: staleTime 30 minutes — they change rarely. Notices: 2 minutes, because a pinned notice is often the reason a member opened the community.',
    realtimeEvent: 'community.notice.published',
    notificationEvent: 'B13 notification for a pinned notice, subject to GAP-012’s scope',
    whyNotImplementable:
      'A rule the platform invented is not the community’s rule, and a governance screen that displayed one would put words in a moderator’s mouth.',
    privacyConsiderations:
      'A notice may name a moderator. The publisher’s display name is shown only where the community publishes it, and the role is shown without the name where it does not.',
    migrationConsiderations:
      'The platform guidelines screen is untouched, so there is no migration of existing content — only new records.',
    isMembershipSensitive: false,
    owner: 'B6-community-foundation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Governance',
  },

  communityModeration: {
    id: 'FRONTEND-PHASE13-GAP-017',
    key: 'communityModeration',
    capability: 'Community moderation queue and moderator actions',
    feature: '§34 Community Moderators',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The moderator experience is complete: a report queue with five states, reason and excerpt, a report count, and the four decisions (dismiss, remove content, warn, escalate) each requiring the corresponding server-reported capability. The queue is **hidden entirely** where no capability was reported — not shown locked — and every decision is sent as a *request* the server may refuse. The existing platform moderation queue and report flow are reused; this phase adds the community dimension, not a second moderation system.',
    coverage: 'partial',
    existingBackendCapability: [
      '`ReportModal`, `types/moderation.ts` and the platform moderation queue screen already exist, and the reporting flow is real.',
      '`/trust/appeals` and `/trust/audit` are real, and community moderation actions belong in the same audit trail.',
    ],
    missingBackendCapability: [
      'A report queue scoped to a community',
      'A decision route that records who decided and why, in the existing audit trail',
      'A rule for escalation from community moderation to platform moderation',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/reports',
        method: 'GET',
        request: 'status?: Open|UnderReview|Actioned|Dismissed|Escalated; cursor?: string',
        response: '{ data: CommunityReport[], meta: { nextCursor, hasMore, totalCount? } }',
        authorization: 'Authenticated **and** capability-gated server-side. 403 for anyone else.',
        permission: 'community.moderation.queue.read',
        pagination: 'Cursor',
        filtering: 'status',
        sorting: 'createdAt asc, so the oldest report is not buried',
      },
      {
        endpoint: 'POST /communities/{id}/reports/{reportId}/decision',
        method: 'POST',
        request: '{ decision: "dismiss"|"remove-content"|"warn"|"escalate", note?: string }',
        response: '{ data: CommunityReport } — the report in its new state',
        authorization: 'Capability-gated server-side. The client’s check is a courtesy, never the control.',
        permission: 'community.moderation.decide',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityReport', 'CommunityReportStatus', 'CommunityModerationDecision'],
    caching:
      'staleTime 0 and refetch on focus. A moderation queue is the one surface where a stale answer causes two moderators to action the same report.',
    realtimeEvent: 'community.report.created / community.report.decided',
    notificationEvent: 'B13 notification to moderators on a new report, and to the author on a decision',
    whyNotImplementable:
      '§34 forbids implementing moderation authorization in the frontend. A client-side queue would either be empty or would be a list of reports assembled by a device that has no right to them.',
    privacyConsiderations:
      '`CommunityReport` deliberately carries **no reporter identity** — only `reporterCount`. A queue that named the reporter would put the person who reported harassment in front of somebody who can see who reported them. That is a property of the type, not of the screen, so no future screen can leak it either.',
    migrationConsiderations:
      'Community reports should share the platform audit trail rather than starting a new one, so an escalation keeps its history.',
    isMembershipSensitive: false,
    owner: 'B17-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Governance',
  },

  communityRoleDirectory: {
    id: 'FRONTEND-PHASE13-GAP-018',
    key: 'communityRoleDirectory',
    capability: 'Moderator and ambassador directories',
    feature: '§34 Moderators · §35 Ambassadors',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Both directories are built, with role badges, languages, area at city precision, a short bio and a route to the existing profile and messaging surfaces. A badge is rendered only where the server reported the role; §35 forbids implying ambassador status without backend authorization and the client asserts none.',
    coverage: 'none',
    existingBackendCapability: [
      '`GET /creators/{id}` and the contributor directory are real and are the shape a role directory should follow.',
      '`ReputationBadge` and `CommunityTrustBadge` already exist and are reused rather than duplicated.',
    ],
    missingBackendCapability: [
      'A role assignment record per (user, community)',
      'A publication rule, since a moderator may not want to be listed',
      'A `since` date, so a member can tell a new moderator from a long-standing one',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/roles',
        method: 'GET',
        request: 'role?: Moderator|Ambassador|Administrator; cursor?: string',
        response: '{ data: CommunityRoleHolder[], meta: { nextCursor, hasMore } }',
        authorization: 'Any caller who can see the community. Only holders who consented to publication.',
        permission: 'community.roles.read',
        pagination: 'Cursor',
        filtering: 'role',
        sorting: 'role, then since asc',
      },
    ],
    domainModel: ['CommunityRoleHolder', 'CommunityRole'],
    caching: 'staleTime 10 minutes. Invalidated on the role-changed realtime event.',
    realtimeEvent: 'community.role.changed',
    notificationEvent: 'B13 notification on role grant or revocation',
    whyNotImplementable:
      'A role the client invented is a claim about a person’s authority. §35 names this case specifically.',
    privacyConsiderations:
      'A role directory publishes a person’s community affiliation by construction. The contract must be consent-gated per holder, and `areaLabel` is capped at city precision — never a coordinate, never a neighbourhood for a person.',
    migrationConsiderations:
      'Consent must be collected before the first directory is published, not after. A migration that listed every existing moderator would publish affiliations nobody agreed to.',
    isMembershipSensitive: true,
    owner: 'B6-community-foundation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Governance',
  },

  communityInitiatives: {
    id: 'FRONTEND-PHASE13-GAP-019',
    key: 'communityInitiatives',
    capability: 'Community initiatives and ambassador programmes',
    feature: '§35 Community Ambassadors · §36 Governance',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The initiative list and detail are built, with lifecycle states, the ambassadors leading each, dates and a progress figure carrying its provenance. Where the progress figure is simulated it is marked; §29 forbids inventing an authoritative metric and a progress bar is one.',
    coverage: 'none',
    existingBackendCapability: [
      'Phase 12’s volunteer opportunities, campaigns and impact surfaces are the closest real analogue and are reused for the *actions* an initiative links to, rather than duplicated.',
    ],
    missingBackendCapability: [
      'An initiative record scoped to a community',
      'A progress definition, so a bar means something',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{id}/initiatives',
        method: 'GET',
        request: 'status?: Planned|Active|Completed|Cancelled; cursor?: string',
        response: '{ data: CommunityInitiative[], meta: { nextCursor, hasMore } }',
        authorization: 'Any caller who can see the community.',
        permission: 'community.initiatives.read / community.initiatives.write',
        pagination: 'Cursor',
        filtering: 'status',
        sorting: 'status, then startsAt',
      },
    ],
    domainModel: ['CommunityInitiative'],
    caching: 'staleTime 5 minutes.',
    realtimeEvent: null,
    notificationEvent: 'B13 notification when an initiative the member follows changes state',
    whyNotImplementable:
      'Nothing to read, and a progress bar with no definition behind it is a number chosen to look encouraging.',
    privacyConsiderations:
      'Initiative leads are named, so the same consent rule as GAP-018 applies to them.',
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
    key: 'communityOnboardingSuggestions',
    capability: 'Suggested communities during onboarding',
    feature: '§9 Community Onboarding · §55 Onboarding Suggestions',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The onboarding flow is complete — welcome, residence, primary community, interested communities, discovery, preferences, notification preferences, done — with Skip, "change later", search, browse and a genuine no-communities-found state. Suggestions come from the adapter and are shown **with the reason** the server gave. Nothing is preselected: §55 forbids automatically assigning a community from location, and the flow never pre-ticks a community because the member is in a particular country.',
    coverage: 'none',
    existingBackendCapability: [
      'The existing `(auth)/choose-origin`, `choose-country`, `choose-language` and `enable-location` flow is real and is reused unchanged — Phase 13 adds steps after it rather than replacing it.',
      '`/explore/recommendations` is a real suggestion surface and is the engine a real contract should route through.',
    ],
    missingBackendCapability: [
      'A suggestion endpoint that returns communities with a reason',
      'A documented statement of what inputs it may consider, so the client is not the place that decides',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/suggestions',
        method: 'GET',
        request: 'presenceCountryCode?: string; limit?: number',
        response: '{ data: CommunityDirectoryEntry[] } with a populated `reason` on every entry',
        authorization: 'Authenticated. Available during onboarding before any community is chosen.',
        permission: 'community.suggestions.read',
        pagination: 'Limit only',
        filtering: 'presenceCountryCode',
        sorting: 'Server-side',
      },
    ],
    domainModel: ['CommunityDirectoryEntry'],
    caching: 'staleTime 5 minutes; onboarding is a short session and a suggestion list should not change mid-flow.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      '§55 forbids inferring sensitive identity characteristics without explicit product authorization, and a suggestion derived on-device from residence and nationality is exactly that inference — made in the one place nobody can audit it.',
    privacyConsiderations:
      'The request deliberately sends only the residence country the member already gave the platform. It does not send nationality, language, contacts or any inferred attribute. The client sends **nothing at all** if the member skipped residence.',
    migrationConsiderations:
      'The client already renders `reason` when present and omits it when not, so a first version without reasons degrades to a plain list.',
    isMembershipSensitive: true,
    owner: 'B14-recommendation',
    priority: 'medium',
    recommendedPhase: 'B18 Community Platform Foundation',
  },

  communityPreferencesPersistence: {
    id: 'FRONTEND-PHASE13-GAP-021',
    key: 'communityPreferencesPersistence',
    capability: 'Server-side community preferences and membership privacy controls',
    feature: '§41 Community Privacy · §45 Offline Support',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Every §41 control is built and works: whether the primary community, the declared interests and the community roles appear on the profile, plus per-membership visibility. Each defaults to **off**, so a member who never opens the screen has published nothing. The privacy half is connected to the real `/trust/privacy` record where an equivalent field exists; the community-specific fields go to the adapter. On device, only the non-sensitive part is persisted (§45) — the active community id and the display preferences. Membership, roles and interests are never written to disk.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET/PUT /trust/privacy` is a real privacy record with per-field visibility, and is the right home for these controls.',
      '`/profile/privacy-settings` is a real screen and is extended rather than duplicated.',
    ],
    missingBackendCapability: [
      'Community-specific visibility fields on the privacy record',
      'A per-membership visibility field, since a member may be open about one community and not another',
    ],
    requiredContracts: [
      {
        endpoint: 'PUT /trust/privacy',
        method: 'PUT',
        request:
          'The existing record plus showPrimaryCommunity, showInterestedCommunities, showCommunityRoles; and PUT /communities/{id}/membership/visibility for the per-membership case',
        response: 'The updated record',
        authorization: 'Authenticated, self only.',
        permission: 'privacy.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityPreferences', 'CommunityMembershipVisibility'],
    caching: 'Invalidated with the privacy record.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A privacy setting stored only on the device does not stop a server publishing the field. The control has to exist where the disclosure decision is made.',
    privacyConsiderations:
      'This gap is the enforcement point for §41. Until it lands, the client’s defence is that it never *sends* community membership anywhere it would be published — and the adapter cannot publish anything. The `defaultCommunityPreferences()` function encodes the off-by-default choice so no code path can accidentally opt a member in.',
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
      'All five lifecycle states render distinctly, including the case that matters most: a community that was the member’s active or primary community becoming suspended or archived while they are in it. The context store detects an unavailable active community and falls back — to the primary, then to the first membership, then to unscoped — rather than leaving the app pointed at a community that no longer answers.',
    coverage: 'partial',
    existingBackendCapability: [
      '**Partly closed by B18.** `status` and `statusReason` are real on `GET /api/v1/communities/{idOrSlug}` — a suspended or archived community reads rather than 404s, and carries the reason verbatim, which is what §75 keeps those states distinct from deleted for.',
      'What happens to memberships when a community is archived is answered too: the rows persist, and the capability set grants nothing but reading. A member can still see who they were there with.',
      '**The notification path is still missing**, and it is the half that matters most to somebody already in the community: nothing tells them the state changed, so they discover it on next launch. That is what keeps this entry `partial` rather than connected.',
      'Phase 12’s lifecycle unions and `lib/community-state.ts` transition tables are the established pattern and are followed here.',
      '`AccountState` and the access gateway already handle the analogous case for a suspended *account*.',
    ],
    missingBackendCapability: [
      'The status field and its reason on the community record',
      'A statement of what happens to memberships when a community is archived',
      'A realtime or notification path, so a member in the community learns rather than discovering it on next launch',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /communities/{idOrSlug}',
        method: 'GET',
        request: 'Covered by GAP-002; this entry is the lifecycle semantics on the same route.',
        response: 'status: Active|Pending|Suspended|Archived plus statusReason, rendered verbatim',
        authorization: 'As GAP-002.',
        permission: 'community.read',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityStatus', 'CommunityUnavailableReason'],
    caching:
      'A community that resolves to suspended or archived is cached briefly (60 seconds) rather than long, so a reinstated community recovers without a restart.',
    realtimeEvent: 'community.status.changed',
    notificationEvent: 'B13 notification to members when their community is suspended or archived',
    whyNotImplementable:
      '§75 says do not assume a community remains available. Without a status the client can only distinguish "answers" from "404", which cannot tell a member whether their community was archived or their link was wrong.',
    privacyConsiderations:
      'A suspension reason may name a person or an incident. It is rendered verbatim only where the server chose to send it, and the client never composes one.',
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
      'Where a placement, promotion or campaign is being created the community scope is shown as *targeting context* and carried into the existing monetization flows. **No billing behaviour is invented**: prices, entitlements, plans and invoices all come from the real B15 monetization contracts unchanged. Critically, §51 is honoured structurally — this phase creates **no community wallet, no community balance and no community transaction**. `lib/community-gap-directory-api.ts` exports no function that touches money, and that is asserted by a test rather than promised.',
    coverage: 'partial',
    existingBackendCapability: [
      'The whole of B15 monetization is real: catalogue, pricing, plans, entitlements, placements, promotions, invoices and the wallet.',
      'Phase 6’s campaign builder already takes a targeting context, which is where a community scope attaches.',
    ],
    missingBackendCapability: [
      'A community targeting dimension on placement and promotion contracts',
      'A price implication, if any, for community-scoped targeting',
      'A reach estimate per community, which requires GAP-007’s member counts',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /monetization/placements',
        method: 'POST',
        request: 'The existing body plus targeting: { communityIds?: string[] }',
        response: 'The existing placement record with the targeting echoed back',
        authorization: 'Unchanged. Entitlement-gated server-side as today.',
        permission: 'Unchanged.',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityScope'],
    caching: 'Unchanged from Phase 6. Community targeting is part of the request body, not a cache dimension.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A price the client invented is a charge nobody authorized. Community targeting cannot be offered as a paid option until the contract states what it costs and what reach it buys.',
    privacyConsiderations:
      'A reach estimate per community is a member count by another name and inherits GAP-007’s suppression requirement. An advertiser must not be able to enumerate a small community’s size by requesting an estimate.',
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
      'Creator surfaces gain community context: a creator can see which community scope a piece of content is associated with, the creator directory can be filtered by community, and community-scoped analytics are shown where the figures are real and marked where they are not. Phase 7’s creator infrastructure is reused entirely; §50 forbids duplicating it and this phase duplicates none of it.',
    coverage: 'partial',
    existingBackendCapability: [
      'The whole of Phase 7 is built, including the creator directory, analytics, challenges, grants and the Academy.',
      '`GET /creators/{id}` is real-shaped and every creator already carries an origin country, which is what the projection filters on.',
    ],
    missingBackendCapability: [
      'A community association on creator content, from GAP-009',
      'A community breakdown in creator analytics',
      'A community dimension on challenges and campaigns',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /creators/me/analytics',
        method: 'GET',
        request: 'communityIds?: string[]; period',
        response: 'The existing analytics envelope with a per-community breakdown',
        authorization: 'Authenticated, self only.',
        permission: 'Unchanged.',
        pagination: null,
        filtering: 'communityIds',
        sorting: null,
      },
    ],
    domainModel: ['CommunityScope', 'CommunityAssociation'],
    caching: 'Creator analytics keys gain the scope token where a community breakdown is requested.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A per-community view count cannot be derived from a total. Splitting one number into three by any client-side rule would invent two of them.',
    privacyConsiderations:
      'A per-community breakdown over a small audience identifies readers. The same suppression rule as GAP-007 applies, and the client renders a suppressed bucket as unavailable rather than as zero.',
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
      'The phase subscribes through the platform’s **existing** realtime seam and adds no transport. Where a channel exists the subscription is real; where none does, the repository degrades to bounded invalidation on focus and reconnect. The three events that matter — membership changed, role changed, community status changed — each have a handler that invalidates the right keys today; they simply have nothing to fire them yet.',
    coverage: 'partial',
    existingBackendCapability: [
      '`lib/realtime-mock.ts`, `store/presence.ts` and `store/typing.ts` are the existing B13.2 realtime seam and carry conversations today.',
      'TanStack Query invalidation is already the platform’s mechanism for applying a push to the UI, and this phase uses it unchanged.',
    ],
    missingBackendCapability: [
      'A community-scoped subscription primitive',
      'Payloads for community.membership.changed, community.role.changed and community.status.changed',
      'An authorization rule per channel, so a private community’s events do not reach a non-member',
    ],
    requiredContracts: [
      {
        endpoint: 'WS/SSE community:{communityId}',
        method: 'GET',
        request: 'Subscribe with the caller’s token; server rejects channels the caller may not see.',
        response:
          'Events: community.membership.changed { communityId, state }, community.role.changed { communityId, roles }, community.status.changed { communityId, status, reason? }',
        authorization: 'Per channel, server-evaluated. A subscribe is an authorization decision.',
        permission: 'community.realtime.subscribe',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityMembership', 'CommunityCapabilities', 'CommunityStatus'],
    caching:
      'Each event maps to a named invalidation set in `hooks/communities.ts`. §61: a targeted list, never a full cache clear.',
    realtimeEvent: 'community.membership.changed · community.role.changed · community.status.changed',
    notificationEvent: 'The same three, as B13 notifications, for the case where the app is not running',
    whyNotImplementable:
      'A revoked moderator keeps their affordance until the next refetch. Sixty seconds of stale capability is the current exposure and it is bounded by the short staleTime rather than eliminated — only a push removes it. Opening a second connection to fix that is the duplication §42 and Phase 8’s GAP-018 both forbid.',
    privacyConsiderations:
      'A subscription to `community:{id}` is itself a disclosure of interest to whatever can see the connection metadata. The authorization rule has to be per channel rather than per connection.',
    migrationConsiderations:
      'The handlers exist and are unit-tested against synthetic events, so a real channel is a wiring change.',
    isMembershipSensitive: true,
    owner: 'B13.2-messaging',
    priority: 'medium',
    recommendedPhase: 'B13.3 Realtime Channel Extension',
  },

  communityAnalyticsIngestion: {
    id: 'FRONTEND-PHASE13-GAP-026',
    key: 'communityAnalyticsIngestion',
    capability: 'Analytics ingestion for community events',
    feature: '§63 Analytics',
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Every §63 event is emitted through the platform’s **existing** analytics buffer with the allow-list applied at emit. The vocabulary is registered in `lib/community/analytics.ts`; the buffer, the sanitiser and the allow-list all live in `creator-analytics.ts` and are not copied. The buffer drains to nothing because no ingestion endpoint exists — the same absence Phase 7 registered as CREATOR-GAP-016 and Phase 8 as MAPS-GAP-022.',
    coverage: 'none',
    existingBackendCapability: [
      '`lib/creator-analytics.ts` owns the buffer, the sanitiser and the property allow-list, and is extended here rather than duplicated.',
    ],
    missingBackendCapability: [
      'POST /analytics/events — batched, fire-and-forget, with a documented schema and a size limit',
      'A retention policy covering community identifiers',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /analytics/events',
        method: 'POST',
        request: 'A batch of { event, properties, occurredAt }, size-capped',
        response: '202 with no body',
        authorization: 'Authenticated.',
        permission: 'analytics.write.self',
        pagination: null,
        filtering: null,
        sorting: null,
      },
    ],
    domainModel: ['CommunityAnalyticsEvent'],
    caching: 'Not cached. Fire-and-forget.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable: 'There is nowhere to send events.',
    privacyConsiderations:
      '§63 forbids recording sensitive community membership unnecessarily, and the allow-list is the enforcement. `communityId` is on it because a community is a thing; `membershipState`, `roles`, `interestedCommunityIds` and any user identifier are **not**, and a property not on the list is dropped before it reaches the buffer. An event that says a member switched *to* a community is retained; one that says which communities they belong to is not.',
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
      'Saved items keep their community association, can be filtered by community, and show a community badge carrying the same `CommunityAssociationBasis` as the original card. The association is resolved from the saved item’s own fields — the publisher’s origin country and its location — through the same single projection, so a saved item and a live card never disagree about which community they belong to.',
    coverage: 'partial',
    existingBackendCapability: [
      '`store/saved.ts`, `types/saved.ts` and the saved collections screens are real and are reused unchanged.',
      'Every saved content type already resolves to an entity carrying the publisher’s origin country.',
    ],
    missingBackendCapability: [
      'A community association on the saved record, so a saved item keeps the association it had when it was saved even if the projection changes',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /saved',
        method: 'GET',
        request: 'communityIds?: string[] alongside the existing contentType filter',
        response: 'The existing envelope with `communityId?: string` per item',
        authorization: 'Authenticated, self only.',
        permission: 'Unchanged.',
        pagination: 'Unchanged.',
        filtering: 'communityIds',
        sorting: 'Unchanged.',
      },
    ],
    domainModel: ['CommunityAssociation'],
    caching: 'The saved list key carries the scope token only when a community filter is applied.',
    realtimeEvent: null,
    notificationEvent: null,
    whyNotImplementable:
      'A saved item’s association is currently recomputed from the entity each time it is shown. That is correct today and will drift the moment declared associations arrive, which is why the record needs the field.',
    privacyConsiderations:
      'A saved list is private to the member, so the association carries no additional disclosure. Nothing about saved items is emitted to analytics beyond a content type.',
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
