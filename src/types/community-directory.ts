// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-Community domain model (Frontend Phase 13)
//
// §5 of the phase brief: a normalized frontend community model. This file is
// the whole vocabulary for the platform concept "a community", and it exists
// because the application previously had no such concept — only a country.
//
// ── The distinction this file exists to hold (§2) ─────────────────────────────
//
// A community is **not** a country. It is not a nationality, a residence, a
// language or a citizenship. The audit that preceded this phase found the
// conflation in three live places:
//
//   `store/auth.ts`                 `nationality` and `residenceCountry` on the
//                                   user, with nothing between them.
//   `(tabs)/discover.tsx:316`       filters listings on
//                                   `owner.originCountry?.code === selected`,
//                                   which is a country filter doing a
//                                   community filter's job.
//   `store/community.ts`            named for communities, actually the
//                                   *community-updates* category filter.
//
// So every field here that touches geography is optional and nullable, and the
// identity of a community is its `id` — never its country code. A community may
// have no country at all (`RegionalDiaspora`, `InterestCommunity`), a country it
// shares with three other communities, or a country nobody in it lives in. The
// type system is arranged so that a screen cannot reach for `countryCode` as an
// identifier: `CommunityOrigin.countryCode` is `string | null | undefined` and
// is not part of `CommunityRef`.
//
// ── The second distinction, which is easier to get wrong ─────────────────────
//
// Phase 12 already has a "community membership": `MembershipStatus`,
// `MembershipProgramme` and `/community-gap/v0/communities/{orgId}/memberships`.
// That is **membership of a community organization** — paying annual dues to the
// Nigerian Association of Manchester. It is a different domain from this one,
// which is about belonging to a diaspora community at all.
//
// The two are kept apart by name rather than by hope. Nothing in this file is
// called `Membership*`; everything is `CommunityMembership*`. Nothing in Phase
// 12 is called `Community*Membership`. A future reader who confuses them will
// get a type error rather than a subtly wrong screen.
//
// ── Provenance ───────────────────────────────────────────────────────────────
//
// `Sourced<T>` and `DataSource` come from `types/community-advanced` and
// `DataFreshness` from `types/maps`. There is no third provenance vocabulary on
// this platform and this file does not add one. Where a statistic is simulated
// the envelope says so at the field level, because a community profile shows a
// real event count beside a simulated growth rate and marking the whole screen
// would be as misleading as marking none of it.
//
// ── State, not booleans ──────────────────────────────────────────────────────
//
// There is no `isMember` on anything here. §8 requires the UI to distinguish
// Member, Interested, Following and Discovering, which is four states, and a
// boolean forces the UI to guess which of the four it is looking at. Roles are
// a separate axis from state for the same reason: a Moderator is not a "more
// member" member.
// ─────────────────────────────────────────────────────────────────────────────

import type { DataSource, Sourced } from './community-advanced';
import type { DataFreshness } from './maps';

export type { DataFreshness, DataSource, Sourced };

// ═════════════════════════════════════════════════════════════════════════════
// IDENTITY — §5
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The opaque identifier for a community.
 *
 * Opaque on purpose. It is **not** an ISO country code, not a slug, and nothing
 * may be inferred from its shape. `communityIdFromCountryCode` does not exist
 * and must not be written: two communities can share a country of origin and
 * one community can have none.
 */
export type CommunityId = string;

/** The URL-safe name a deep link carries (§53). Lowercase, stable, human. */
export type CommunitySlug = string;

/**
 * What kind of community this is.
 *
 * Present so the UI can label a community honestly rather than assume every
 * community is a nationality. A `RegionalDiaspora` ("West African") has no
 * single country; a `CityChapter` ("Nigerians in Manchester") has a country of
 * origin *and* a place of residence, which are different fields.
 */
export type CommunityType =
  /** Tied to one country of origin. "Nigerian", "Ghanaian", "Indian". */
  | 'NationalDiaspora'
  /** Spans several countries. "West African", "Caribbean". No single origin. */
  | 'RegionalDiaspora'
  /** Ethnic or linguistic. "Yoruba", "Tamil". May cross national borders. */
  | 'EthnoLinguistic'
  /** Faith-based. */
  | 'FaithCommunity'
  /** Shared interest or profession rather than origin. */
  | 'InterestCommunity'
  /** A place-bound chapter of a larger community. "Nigerians in Manchester". */
  | 'CityChapter';

/**
 * §75's lifecycle. A community is not permanently available.
 *
 * `Unavailable` is the client's word for "the server would not tell us" — a 404
 * on a community that was in a deep link, or a membership the caller may not
 * see. It is deliberately distinct from `Archived`, which is a statement the
 * server made.
 */
export type CommunityStatus = 'Active' | 'Pending' | 'Suspended' | 'Archived' | 'Unavailable';

/** Who may see the community exists at all. Enforced server-side (§62). */
export type CommunityVisibility = 'Public' | 'Unlisted' | 'Private' | 'InviteOnly';

/**
 * Where a community comes from, as *properties* rather than identity.
 *
 * Every field is optional. §2: do not encode community logic into country
 * logic. A community with `countryCode: null` is not malformed — it is a
 * regional or interest community, and the UI renders its `name` and `iconName`
 * instead of a flag.
 */
export interface CommunityOrigin {
  /** ISO 3166-1 alpha-2, where one applies. Never used as the community's id. */
  countryCode?: string | null;
  countryName?: string | null;
  /** The emoji flag. §59: never the only identifier on screen. */
  flag?: string | null;
  /** For communities that span countries. "West Africa", "South Asia". */
  regionName?: string | null;
}

/**
 * The community's visual identity (§57).
 *
 * `accentColor` is present because the backend may one day supply one, and is
 * *advisory*: the design system decides how much of it to use. §57 forbids
 * community branding overriding the platform design system, so no component
 * takes a colour from here for text, background or anything load-bearing —
 * only for a small accent. `iconName` is an Ionicons name so a community with
 * no flag still has a non-textual identifier.
 */
export interface CommunityIdentity {
  logoUrl?: string | null;
  /** An Ionicons name. The fallback identifier when there is no flag. */
  iconName?: string | null;
  /** Hex. Advisory only — see the note above. */
  accentColor?: string | null;
}

/**
 * The compact reference a badge, a chip or a saved item carries.
 *
 * Deliberately small, and deliberately **without** membership state. A
 * `CommunityRef` on a marketplace listing says which community the listing is
 * associated with; it says nothing about the viewer's relationship to that
 * community, and it must not, because a listing card is not the place to leak
 * one (§19, §41).
 */
export interface CommunityRef {
  id: CommunityId;
  slug: CommunitySlug;
  /** Already localized by whoever produced it. §58: never a hardcoded English name. */
  name: string;
  type: CommunityType;
  origin: CommunityOrigin;
  identity: CommunityIdentity;
}

/**
 * A community, in full.
 *
 * `memberCount` is `Sourced` rather than a bare number because §29 forbids
 * inventing authoritative metrics and §31 forbids implying popularity the
 * backend does not report. A screen holding this cannot print the figure
 * without also holding where it came from.
 */
export interface Community extends CommunityRef {
  /** A one-line description, already localized. */
  tagline?: string | null;
  description?: string | null;
  status: CommunityStatus;
  visibility: CommunityVisibility;

  /** BCP-47. What this community's own content is mostly written in. */
  primaryLanguage?: string | null;
  supportedLanguages?: string[];

  /**
   * Members, with provenance. Absent — not zero — where the backend will not
   * count. A private community may legitimately refuse to report a size.
   */
  memberCount?: Sourced<number> | null;

  /** Where the community's members mostly are, when the backend reports it. */
  presenceCountryCodes?: string[];

  createdAt?: string | null;
  updatedAt?: string | null;

  /**
   * Set when `status` is `Suspended` or `Archived`. Rendered verbatim: a member
   * who opens a deep link to a suspended community is entitled to the reason
   * the server gave rather than a generic error.
   */
  statusReason?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — §6, §8, §33
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The viewer's relationship to a community.
 *
 * Ten states rather than a boolean, because §8 is explicit that Member,
 * Interested, Following and Discovering are not interchangeable and the UI
 * renders each differently:
 *
 *   `None`            no relationship, and none has been expressed.
 *   `Discovering`     the viewer is looking at it. **Not** a relationship — it
 *                     is never persisted server-side and never shown to anyone
 *                     else. It exists so a screen can distinguish "browsing"
 *                     from "following" without inventing a claim.
 *   `Interested`      an explicit, revocable declaration of interest (§8).
 *                     Influences personalization. Is **not** membership.
 *   `Following`       receiving updates without claiming to belong.
 *   `PendingApproval` applied, awaiting the community's decision.
 *   `Member`          belongs.
 *   `VerifiedMember`  belongs, and the platform verified something about it.
 *   `Declined`        applied and was refused.
 *   `Revoked`         was a member; the community ended it (§74).
 *   `Left`            was a member; the member ended it.
 *
 * `Declined`, `Revoked` and `Left` are distinct because the UI offers three
 * different next steps, and collapsing them into `None` would offer "Join" to
 * somebody the community has just removed.
 */
export type CommunityMembershipState =
  | 'None'
  | 'Discovering'
  | 'Interested'
  | 'Following'
  | 'PendingApproval'
  | 'Member'
  | 'VerifiedMember'
  | 'Declined'
  | 'Revoked'
  | 'Left';

/**
 * A role within a community.
 *
 * **A role is not an authorization.** §37 and §62 are explicit: UI visibility
 * is not permission, and the backend remains authoritative. Roles here drive
 * badges and navigation affordances only; every action is gated on
 * `CommunityCapabilities`, which the *server* evaluates. See
 * `lib/community/access.ts`, where that separation is enforced rather than
 * described.
 */
export type CommunityRole = 'Member' | 'Moderator' | 'Ambassador' | 'Administrator';

/**
 * Who may see that the viewer belongs to a community (§41).
 *
 * Community membership can be sensitive. A person's diaspora community can
 * imply their nationality, immigration situation, religion or ethnicity, and in
 * some countries any of those is dangerous to publish. So the default the
 * client assumes when the backend says nothing is `Private`, not `Public` —
 * see `DEFAULT_MEMBERSHIP_VISIBILITY` below.
 */
export type CommunityMembershipVisibility = 'Public' | 'CommunityOnly' | 'Private';

/**
 * The safe default.
 *
 * Chosen rather than inherited: a missing field must not read as consent to
 * publish. Every code path that fills a `CommunityMembership` from a partial
 * payload uses this.
 */
export const DEFAULT_MEMBERSHIP_VISIBILITY: CommunityMembershipVisibility = 'Private';

/**
 * What the *server* says this caller may do in this community.
 *
 * Modelled on Phase 12's `OrganizationCapabilities`, deliberately: that is the
 * established shape for a server-reported capability set on this platform, and
 * a second shape would be a second thing to audit.
 *
 * Every field defaults to `false` when absent. A capability the server did not
 * report is a capability the caller does not have — the client never infers one
 * from a role, and `lib/community/access.ts` has no code path that does.
 */
export interface CommunityCapabilities {
  communityId: CommunityId;
  /** Echoed back by the server for display. Not the source of any decision. */
  roles: CommunityRole[];

  canViewMembers: boolean;
  canViewPrivateStatistics: boolean;
  canPostToCommunity: boolean;
  canModerateContent: boolean;
  canReviewReports: boolean;
  canPublishNotice: boolean;
  canManageRules: boolean;
  canManageRoles: boolean;
  canViewModerationQueue: boolean;
  canViewAmbassadorDirectory: boolean;
  canManageInitiatives: boolean;
}

/** Every capability off. The value used whenever the server reported nothing. */
export function noCommunityCapabilities(communityId: CommunityId): CommunityCapabilities {
  return {
    communityId,
    roles: [],
    canViewMembers: false,
    canViewPrivateStatistics: false,
    canPostToCommunity: false,
    canModerateContent: false,
    canReviewReports: false,
    canPublishNotice: false,
    canManageRules: false,
    canManageRoles: false,
    canViewModerationQueue: false,
    canViewAmbassadorDirectory: false,
    canManageInitiatives: false,
  };
}

/**
 * The viewer's relationship to one community, as the server reports it.
 *
 * `isPrimary` lives here rather than on `Community` because primacy is a
 * property of the *relationship*, not of the community — the Nigerian community
 * is not "the primary community", it is primary *for this member*.
 */
export interface CommunityMembership {
  communityId: CommunityId;
  state: CommunityMembershipState;
  /** §7. At most one membership in a set has this true. */
  isPrimary: boolean;
  /** Display only. Authority comes from `capabilities`. */
  roles: CommunityRole[];
  capabilities: CommunityCapabilities;
  visibility: CommunityMembershipVisibility;
  joinedAt?: string | null;
  verifiedAt?: string | null;
  /** Set on `Revoked`, `Declined` and `Suspended`-adjacent states. Verbatim. */
  stateReason?: string | null;
  /** True where the community requires approval, so the UI says so up front. */
  requiresApproval?: boolean;
}

/**
 * The viewer's whole community relationship set.
 *
 * One object rather than three lists so that "primary" cannot disagree with
 * "memberships" — the primary is derived from the set, and
 * `resolvePrimaryMembership` is the only thing that reads it.
 */
export interface CommunityMembershipSet {
  memberships: CommunityMembership[];
  /**
   * The server's own statement of which is primary, when it makes one. The
   * client prefers this over scanning `isPrimary`, because a set with two
   * `isPrimary` entries is a server bug that should render as *one* primary
   * rather than as an arbitrary pick.
   */
  primaryCommunityId?: CommunityId | null;
  /** ISO-8601. Drives the "showing information from…" line when offline (§45). */
  fetchedAt?: string | null;
}

/** §33's actions, as a closed union so a screen cannot invent one. */
export type CommunityMembershipAction =
  | 'join'
  | 'leave'
  | 'follow'
  | 'unfollow'
  | 'express-interest'
  | 'remove-interest'
  | 'set-primary'
  | 'clear-primary'
  | 'cancel-application';

// ═════════════════════════════════════════════════════════════════════════════
// MODES AND SCOPE — §12, §13, §15
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §13's modes, explicit rather than implied.
 *
 * The brief permits a different implementation but requires the behaviour to be
 * explicit and forbids ambiguous states. These five are the whole set:
 *
 *   `PRIMARY_COMMUNITY`      the member's primary community only.
 *   `SELECTED_COMMUNITY`     one community the member chose, primary or not.
 *   `INTERESTED_COMMUNITIES` everything the member declared interest in.
 *   `ALL_COMMUNITIES`        the platform, unscoped.
 *   `CROSS_COMMUNITY`        an explicit multi-community selection.
 *
 * `ALL_COMMUNITIES` and `CROSS_COMMUNITY` are different and the difference
 * matters: the first means "do not scope this", the second means "scope this to
 * exactly these three". They produce different result sets and different labels.
 */
export type CommunityMode =
  | 'PRIMARY_COMMUNITY'
  | 'SELECTED_COMMUNITY'
  | 'INTERESTED_COMMUNITIES'
  | 'ALL_COMMUNITIES'
  | 'CROSS_COMMUNITY';

/**
 * A resolved community scope: the single value every community-sensitive query
 * key and every community-sensitive request is derived from.
 *
 * **Resolved** is the load-bearing word. `mode` alone is not enough for a cache
 * key: `PRIMARY_COMMUNITY` means different data for two different members, and
 * `INTERESTED_COMMUNITIES` changes meaning the moment an interest is added. So
 * a scope carries the concrete, canonicalized, sorted list of community ids it
 * covers, and `communityScopeToken()` in `lib/community/scope.ts` turns it into
 * the string that goes in the query key.
 *
 * An empty `communityIds` with mode `ALL_COMMUNITIES` is the unscoped case and
 * is legitimate. An empty `communityIds` with any other mode means "the member
 * has no community of that kind", which is also legitimate (§71) and renders as
 * an empty state rather than as everything.
 */
export interface CommunityScope {
  mode: CommunityMode;
  /** Canonical: de-duplicated and sorted. Never mutated in place. */
  communityIds: CommunityId[];
}

/** §15's reusable filter selection, before resolution against membership. */
export interface CommunityFilterSelection {
  mode: CommunityMode;
  /** Meaningful for `SELECTED_COMMUNITY` and `CROSS_COMMUNITY` only. */
  communityIds?: CommunityId[];
}

// ═════════════════════════════════════════════════════════════════════════════
// DISCOVERY — §31
// ═════════════════════════════════════════════════════════════════════════════

/** How a discovery list is ordered. Server-side where the contract allows. */
export type CommunityDiscoverySort =
  | 'relevance'
  | 'name'
  /** Only offered where `memberCount` is a backend figure (§31). */
  | 'members'
  | 'recent';

export interface CommunityDirectoryQuery {
  query?: string;
  types?: CommunityType[];
  /**
   * Filter by country of origin. A *country* filter over communities — which is
   * a legitimate thing to want — and explicitly not a claim that the country is
   * the community.
   */
  originCountryCodes?: string[];
  /** Communities with a presence where the member is. */
  presenceCountryCode?: string;
  sort?: CommunityDiscoverySort;
  cursor?: string;
  limit?: number;
  /** Include communities the member already belongs to. Defaults true. */
  includeJoined?: boolean;
}

/**
 * One row in the directory.
 *
 * Carries the viewer's membership state so the row can render the right action,
 * and carries it *from the server* rather than deriving it — a client that
 * derived "you are a member" from a cached list would offer Leave to somebody
 * whose membership was revoked an hour ago.
 */
export interface CommunityDirectoryEntry {
  community: Community;
  membershipState: CommunityMembershipState;
  isPrimary: boolean;
  /**
   * Why this community is in the list, when the backend says. §55: suggestions
   * may consider residence and stated interests, and the reason is shown rather
   * than the ranking being asserted.
   */
  reason?: string | null;
}

export interface CommunityDirectoryPage {
  items: CommunityDirectoryEntry[];
  nextCursor?: string | null;
  hasMore: boolean;
  /** Absent where the backend will not count. Never guessed. */
  totalCount?: number | null;
  source: DataSource;
}

// ═════════════════════════════════════════════════════════════════════════════
// STATISTICS AND COMPARISON — §29, §30
// ═════════════════════════════════════════════════════════════════════════════

/** The period a statistic covers. A figure with no period is not printable. */
export type StatisticsPeriod = '7d' | '30d' | '90d' | '12m' | 'all';

/**
 * One metric on a community profile.
 *
 * `value` is `Sourced` and `freshness` is required, for the reason §29 gives:
 * do not invent authoritative metrics. A member count that came from the
 * development adapter must be visibly an estimate, and the component that
 * renders this cannot obtain the number without also obtaining the marker.
 */
export interface CommunityMetric {
  key: string;
  /** Already localized. */
  label: string;
  value: Sourced<number>;
  /** For rendering — "1.2k members", "+4%". Never parsed back. */
  displayValue?: string | null;
  unit?: string | null;
  /** Change over `period`, where the backend reports a comparable figure. */
  changePercent?: Sourced<number> | null;
  period: StatisticsPeriod;
  freshness: DataFreshness;
  /**
   * True where the metric is only visible to callers the server authorized
   * (§29, §62). The client renders it only when `canViewPrivateStatistics` is
   * set; it does not decide the metric is private.
   */
  isRestricted?: boolean;
}

export interface CommunityStatistics {
  communityId: CommunityId;
  period: StatisticsPeriod;
  metrics: CommunityMetric[];
  /** Set when the whole set came from the adapter. Per-metric marks still apply. */
  source: DataSource;
  freshness: DataFreshness;
}

/** §30. Side-by-side, with no computed winner — see the note in the repository. */
export interface CommunityComparison {
  period: StatisticsPeriod;
  communities: CommunityRef[];
  /** One row per metric key, aligned to `communities` by index. */
  rows: {
    key: string;
    label: string;
    values: (Sourced<number> | null)[];
    unit?: string | null;
  }[];
  source: DataSource;
  freshness: DataFreshness;
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE — §34, §35, §36
// ═════════════════════════════════════════════════════════════════════════════

/** A rule or guideline a community publishes (§36). */
export interface CommunityRule {
  id: string;
  position: number;
  title: string;
  body: string;
  /** Set where breaking the rule has a stated consequence. Rendered verbatim. */
  consequence?: string | null;
  updatedAt?: string | null;
}

/** A community notice — a moderator or ambassador statement to the community. */
export interface CommunityNotice {
  id: string;
  communityId: CommunityId;
  title: string;
  body: string;
  publishedAt: string;
  /** The role that published it, for attribution. Not an authorization claim. */
  publishedByRole: CommunityRole;
  /** Display name of the publisher, where the community publishes one. */
  publishedByName?: string | null;
  expiresAt?: string | null;
  isPinned: boolean;
}

/** §34's report queue states. */
export type CommunityReportStatus = 'Open' | 'UnderReview' | 'Actioned' | 'Dismissed' | 'Escalated';

export type CommunityReportReason =
  | 'Spam'
  | 'Harassment'
  | 'Misinformation'
  | 'OffTopic'
  | 'Scam'
  | 'HateSpeech'
  | 'Other';

/**
 * A report awaiting moderation.
 *
 * Deliberately carries **no reporter identity**. A moderation queue that named
 * the reporter would put the person who reported harassment in front of
 * somebody who can see who reported them, and that is not a risk this UI takes
 * even in a development build. `reporterCount` is what the queue needs.
 */
export interface CommunityReport {
  id: string;
  communityId: CommunityId;
  status: CommunityReportStatus;
  reason: CommunityReportReason;
  /** What was reported. The client routes on this; it does not interpret it. */
  contentType: string;
  contentId: string;
  /** A short excerpt the server chose to show. Never the full private content. */
  contentExcerpt?: string | null;
  reporterCount: number;
  createdAt: string;
  updatedAt?: string | null;
  /** Free text the reporter wrote, where the community's policy exposes it. */
  note?: string | null;
}

/** What a moderator can decide. The server applies it; the client requests it. */
export type CommunityModerationDecision = 'dismiss' | 'remove-content' | 'warn' | 'escalate';

/** A person holding a role, as a community chooses to publish them. */
export interface CommunityRoleHolder {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  role: CommunityRole;
  /** Since when, where published. */
  since?: string | null;
  /** A short self-description the holder wrote. */
  bio?: string | null;
  /** Languages they can help in. §58 — data-driven, not assumed. */
  languages?: string[];
  /** Where they are, at city precision at most. Never a coordinate. */
  areaLabel?: string | null;
}

/** §35. A community initiative an ambassador runs. */
export interface CommunityInitiative {
  id: string;
  communityId: CommunityId;
  title: string;
  description: string;
  status: 'Planned' | 'Active' | 'Completed' | 'Cancelled';
  startsAt?: string | null;
  endsAt?: string | null;
  /** The ambassadors running it. Display only. */
  leads: CommunityRoleHolder[];
  /** A progress figure, with provenance, where the backend reports one. */
  progress?: Sourced<number> | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PREFERENCES AND NOTIFICATIONS — §40, §41
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Which communities a notification category applies to.
 *
 * §40's list, as a scope rather than a pile of booleans, so the settings screen
 * and the notification filter share one vocabulary.
 */
export type CommunityNotificationScope =
  | 'primary-only'
  | 'my-communities'
  | 'interested-included'
  | 'all-communities'
  | 'specific'
  | 'none';

/**
 * One row on the community notification settings screen (§40).
 *
 * `categoryKey` is a **B13 category key**, not a Phase 13 invention. §26 and
 * §40 both forbid a second notification system, so this record is an overlay
 * that says *which communities* an existing category applies to — it does not
 * re-declare the categories, the channels or the quiet hours, all of which B13
 * already owns.
 */
export interface CommunityNotificationPreference {
  /** A key from B13's `/notifications/categories`. */
  categoryKey: string;
  scope: CommunityNotificationScope;
  /** Meaningful when `scope` is `specific`. */
  communityIds?: CommunityId[];
}

/**
 * The member's community preferences.
 *
 * Split from `CommunityMembershipSet` because these are *preferences* — the
 * member's choices about presentation and personalization — while membership is
 * a relationship the community is party to. They have different privacy
 * consequences and different write paths.
 */
export interface CommunityPreferences {
  /** §14. Whether discovery may reach outside the active scope by default. */
  crossCommunityDiscoveryEnabled: boolean;
  /** §41. Whether the profile shows the primary community to others. */
  showPrimaryCommunityOnProfile: boolean;
  /** §41. Whether declared interests are visible to others. */
  showInterestedCommunitiesOnProfile: boolean;
  /** §41. Whether roles (Moderator, Ambassador) are shown publicly. */
  showCommunityRolesOnProfile: boolean;
  /** Overlay on B13's categories. Never a second notification system. */
  notifications: CommunityNotificationPreference[];
  /** BCP-47, where the member wants community content in a specific language. */
  preferredContentLanguage?: string | null;
}

/** The privacy-safe default, used when the backend has said nothing yet (§41). */
export function defaultCommunityPreferences(): CommunityPreferences {
  return {
    crossCommunityDiscoveryEnabled: true,
    // Every one of these is *off* by default. A member's diaspora community can
    // imply their nationality, immigration status, religion or ethnicity, and
    // §41 forbids exposing it without an explicit product contract. A default
    // of `true` would publish it for everybody who never opened this screen.
    showPrimaryCommunityOnProfile: false,
    showInterestedCommunitiesOnProfile: false,
    showCommunityRolesOnProfile: false,
    notifications: [],
    preferredContentLanguage: null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTENT ASSOCIATION — §17–§24, §39
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How a piece of content came to be associated with a community.
 *
 * This type is the honest core of the phase. There is no certified backend
 * contract that tags a guide, job, listing or event with a community id — the
 * gap register says so at FRONTEND-PHASE13-GAP-009 — so where the frontend
 * shows a community on a content card, it must say how it knows:
 *
 *   `declared`    the server stated the association. The only one that is a
 *                 fact about the content.
 *   `origin`      derived from the publisher's `originCountry`, which is a real
 *                 certified field. An inference, and a good one, but an
 *                 inference: a Ghanaian-origin seller's sofa is not
 *                 "Ghanaian community content".
 *   `location`    derived from where the content is. Weaker still.
 *   `unknown`     no basis. The card shows no community badge at all.
 *
 * Nothing in the UI prints a community badge with basis `origin` or `location`
 * without the qualifier `<CommunityAssociationNote>` renders. That is the
 * difference between §19's "privacy-safe seller information" being honoured and
 * being claimed.
 */
export type CommunityAssociationBasis = 'declared' | 'origin' | 'location' | 'unknown';

/** A content item's community association, with its basis. */
export interface CommunityAssociation {
  community: CommunityRef | null;
  basis: CommunityAssociationBasis;
  /** Where more than one community applies. Sorted, de-duplicated. */
  additional?: CommunityRef[];
}

/** The unknown association. Used rather than `null` so the basis is always read. */
export const UNKNOWN_ASSOCIATION: CommunityAssociation = {
  community: null,
  basis: 'unknown',
};

// ═════════════════════════════════════════════════════════════════════════════
// ERROR AND EDGE STATES — §74
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Why a community surface cannot be shown.
 *
 * §74 lists eighteen states every major feature must handle. They collapse into
 * these, each of which the UI renders differently and each of which offers a
 * different next step. `forbidden` and `unauthorized` are distinct because one
 * is answered by signing in and the other is not.
 */
export type CommunityUnavailableReason =
  | 'loading'
  | 'empty'
  | 'error'
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'community-suspended'
  | 'community-archived'
  | 'membership-revoked'
  | 'role-revoked'
  | 'statistics-unavailable'
  | 'membership-unavailable'
  | 'cross-community-unavailable'
  | 'feature-disabled';

// ═════════════════════════════════════════════════════════════════════════════
// PAGING
// ═════════════════════════════════════════════════════════════════════════════

/** The cursor-paged envelope every list in this phase uses. */
export interface CommunityDirectoryList<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  totalCount?: number | null;
  source: DataSource;
}
