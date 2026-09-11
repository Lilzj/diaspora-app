// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The community as a first-class entity (Frontend Phase 13)
//
// ✅ EVERY ROUTE IN THIS FILE IS REAL. It is served by `Diaspora.Modules.
//    CommunityProgramme` (B18) at `/api/v1/communities`, and it closes
//    FRONTEND-PHASE13-GAP-001 through -006.
//
// This is the certified arm of the split `community-gap-directory-api.ts` has
// held alone since Phase 13 began. `hooks/communities.ts` imports one or the
// other and no screen can tell which answered, which is what makes the
// migration an import swap — the thing the register said it would be.
//
// ── What this file does that the adapter did not ─────────────────────────────
//
// Nothing, on the surface: same function names, same signatures, same return
// types. The difference is that a community here is a row somebody created
// rather than a country code dressed as a community, and every membership state
// is the server's answer rather than a local store's.
//
// ── Three places the wire and the client type genuinely differ ───────────────
//
// Named here rather than absorbed silently, because each is a decision:
//
//   1. `identity.logoMediaId` → `identity.logoUrl`. Every module on this
//      platform answers a media *id*; B18's own client file already says so.
//      The device resolves ids through the media route, which is where the
//      signing and sizing live. One `mediaUri` call, here, at the boundary.
//
//   2. `origin.countryName` and `origin.flag` arrive null and stay null. The
//      device holds all 192 names and flags in `mocks/countries.ts` and renders
//      from the code — §58 forbids a server-supplied English name as the only
//      label. The fields exist on the type so the shape matches; nothing fills
//      them.
//
//   3. `source` is added here, not sent. `CommunityDirectoryPage.source` exists
//      so a screen can mark simulated data; everything from this file is
//      `'backend'` by construction, and stamping it at the boundary is what
//      stops a screen having to know which arm it called.
//
// ── Two routes are not where the register sketched them ──────────────────────
//
// `GET /communities/memberships/me` is taken — it has answered B18's *programme*
// memberships since the module shipped, a different concept with the same word,
// and the register marked GAP-003 connected against it. The community set is at
// `/communities/me/memberships`.
//
// `PUT /users/me/primary-community` was sketched into a prefix that does not
// exist: no module on this platform owns `/api/v1/users`. Primary lives on the
// membership, where "a primary must be a community you belong to" is structural
// rather than a check somebody can forget, and the route is
// `/communities/me/primary`.
//
// `me` is a reserved community handle, so nothing under `/communities/me/` can
// be shadowed by a community, and a guardrail over the composed route table
// keeps that true.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { API_BASE_URL } from './apiClient';
import { FinancialError, toFinancialError } from './financial-errors';
import type {
  OfferCommunityOwnershipInput,
  RequestCommunityDeletionInput,
  CommunityOwnershipOfferStatus,
  CommunityOwnershipOffer,
  CommunityDeletionStatus,
  CommunityDeletionRequest,
  AssignableCommunityRole,
  Community,
  CommunityCapabilities,
  CommunityDirectoryEntry,
  CommunityDirectoryPage,
  CommunityDirectoryQuery,
  CommunityId,
  CommunityMember,
  CommunityMemberPage,
  CommunityMembership,
  CommunityMembershipAction,
  CommunityMembershipSet,
  CommunityMembershipVisibility,
  CommunityRole,
  CommunityStatus,
  CommunityType,
  CommunityVisibility,
  ProposeCommunityInput,
} from '@/types/community-directory';
import { noCommunityCapabilities } from '@/types/community-directory';

const ROOT = '/communities';

interface Envelope<T> {
  data: T;
}

/**
 * Reads a certified route.
 *
 * Failures are classified `read`, so a transport error renders as "we could not
 * load this" rather than as an empty community list — an empty directory and an
 * unreachable one are different sentences on the same screen.
 */
async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(path, { params, signal });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Writes to a certified route.
 *
 * Classified `mutating` for the same reason the financial client does it: a
 * member who taps Join and sees a timeout must not be told it failed, because it
 * may well have succeeded — and the recovery from "it failed" is to tap again,
 * which is how somebody ends up with two applications.
 */
async function write<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: object
): Promise<T> {
  try {
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(path, { params })
        : method === 'put'
          ? await apiClient.put<Envelope<T>>(path, body, { params })
          : await apiClient.post<Envelope<T>>(path, body, { params });

    return response.data.data;
  } catch (cause) {
    throw withCommunityDetail(cause, toFinancialError(cause, 'mutating'));
  }
}

/**
 * Keeps the community module's own sentence when it refuses.
 *
 * `toFinancialError` shows a server's `detail` only for validation errors, and
 * looks copy up by `problem.errorCode` — a field the backend never sends; its
 * problem builder writes `code`. So a 409 like "This member keeps their
 * membership private. They need to make it visible to the community before they
 * can hold a role." reached the member as a generic line, and the one thing an
 * owner needs to know about why a role would not stick was lost.
 *
 * Narrow on purpose: only `communities.*` codes, whose details that module
 * writes for members. The platform-wide fix — reading `code` — changes retry and
 * terminal behaviour for every coded error in the app, and is its own piece.
 */
function withCommunityDetail(cause: unknown, error: FinancialError): FinancialError {
  const problem = (cause as { response?: { data?: { code?: unknown; detail?: unknown } } })
    ?.response?.data;

  const code = typeof problem?.code === 'string' ? problem.code : undefined;
  const detail = typeof problem?.detail === 'string' ? problem.detail.trim() : '';

  if (!code?.startsWith('communities.') || !detail) {
    return error;
  }

  return new FinancialError({
    kind: error.kind,
    code,
    httpStatus: error.httpStatus,
    message: detail,
    hint: error.hint,
    isRetryable: error.isRetryable,
    isTerminal: error.isTerminal,
    isIndeterminate: error.isIndeterminate,
    fieldErrors: error.fieldErrors,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// WIRE SHAPES
//
// Declared rather than imported, because they are the *server's* shape and the
// client's types are the client's. Where the two agree the mapping is a copy;
// where they differ it is visible. See the header.
// ═════════════════════════════════════════════════════════════════════════════

interface SourcedWire<T> {
  value: T;
  source: string;
}

interface CommunityWire {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  visibility: string;
  tagline?: string | null;
  description?: string | null;
  primaryLanguage?: string | null;
  supportedLanguages?: string[] | null;
  memberCount?: SourcedWire<number> | null;
  presenceCountryCodes?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  statusReason?: string | null;
  origin?: {
    countryCode?: string | null;
    countryName?: string | null;
    flag?: string | null;
    regionName?: string | null;
  } | null;
  identity?: {
    logoMediaId?: string | null;
    iconName?: string | null;
    accentColor?: string | null;
  } | null;
}

interface CapabilitiesWire {
  communityId: string;
  roles?: string[] | null;
  canViewMembers?: boolean;
  canViewPrivateStatistics?: boolean;
  canPostToCommunity?: boolean;
  canModerateContent?: boolean;
  canReviewReports?: boolean;
  canPublishNotice?: boolean;
  canManageRules?: boolean;
  canManageRoles?: boolean;
  canAppointAdministrators?: boolean;
  canLeave?: boolean;
  canRequestDeletion?: boolean;
  canTransferOwnership?: boolean;
  canViewModerationQueue?: boolean;
  canViewAmbassadorDirectory?: boolean;
  canManageInitiatives?: boolean;
}

interface MembershipWire {
  communityId: string;
  state: string;
  isPrimary: boolean;
  roles?: string[] | null;
  capabilities?: CapabilitiesWire | null;
  visibility?: string | null;
  joinedAt?: string | null;
  verifiedAt?: string | null;
  stateReason?: string | null;
  requiresApproval?: boolean | null;
}

interface MembershipSetWire {
  memberships?: MembershipWire[] | null;
  primaryCommunityId?: string | null;
  fetchedAt?: string | null;
}

interface DirectoryEntryWire {
  community: CommunityWire;
  membershipState: string;
  isPrimary: boolean;
  reason?: string | null;
}

interface DirectoryPageWire {
  items?: DirectoryEntryWire[] | null;
  nextCursor?: string | null;
  hasMore?: boolean;
  totalCount?: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAPPING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Where the platform serves a media item's bytes.
 *
 * `GET /media/{mediaId}/content` answers without a bearer token, which is what
 * lets a plain `<Image source={{ uri }}>` load it. `undefined` for a missing id
 * rather than a URL with `undefined` in it — the former is nothing to load, the
 * latter is a request that 404s on every render.
 */
function mediaUri(mediaId?: string | null): string | undefined {
  return typeof mediaId === 'string' && mediaId.length > 0
    ? `${API_BASE_URL}/media/${mediaId}/content`
    : undefined;
}

function toCommunity(wire: CommunityWire): Community {
  return {
    id: wire.id as CommunityId,
    slug: wire.slug,
    name: wire.name,
    type: wire.type as CommunityType,
    status: wire.status as CommunityStatus,
    visibility: wire.visibility as CommunityVisibility,
    tagline: wire.tagline ?? null,
    description: wire.description ?? null,
    primaryLanguage: wire.primaryLanguage ?? null,
    supportedLanguages: wire.supportedLanguages ?? [],
    presenceCountryCodes: wire.presenceCountryCodes ?? [],
    createdAt: wire.createdAt ?? null,
    updatedAt: wire.updatedAt ?? null,
    statusReason: wire.statusReason ?? null,

    // Absent stays absent. A withheld count is not zero — a private community
    // the viewer does not belong to reports no size at all, and rendering that
    // as "0 members" would be a statement the server declined to make.
    memberCount: wire.memberCount
      ? { value: wire.memberCount.value, source: 'backend' }
      : null,

    origin: {
      countryCode: wire.origin?.countryCode ?? null,
      regionName: wire.origin?.regionName ?? null,

      // Filled by the device from the code. See the header.
      countryName: null,
      flag: null,
    },

    identity: {
      logoUrl: mediaUri(wire.identity?.logoMediaId) ?? null,
      iconName: wire.identity?.iconName ?? null,
      accentColor: wire.identity?.accentColor ?? null,
    },
  };
}

/**
 * A capability the server did not report is a capability the caller does not
 * have. `noCommunityCapabilities` is the floor, and every field is an override
 * of an explicit `false` rather than a fill of an absence — which is the same
 * rule `lib/community/access.ts` applies, stated once more at the boundary.
 */
function toCapabilities(communityId: string, wire?: CapabilitiesWire | null): CommunityCapabilities {
  const none = noCommunityCapabilities(communityId as CommunityId);

  if (!wire) {
    return none;
  }

  return {
    ...none,
    communityId: (wire.communityId ?? communityId) as CommunityId,
    roles: (wire.roles ?? []) as CommunityRole[],
    canViewMembers: wire.canViewMembers ?? false,
    canViewPrivateStatistics: wire.canViewPrivateStatistics ?? false,
    canPostToCommunity: wire.canPostToCommunity ?? false,
    canModerateContent: wire.canModerateContent ?? false,
    canReviewReports: wire.canReviewReports ?? false,
    canPublishNotice: wire.canPublishNotice ?? false,
    canManageRules: wire.canManageRules ?? false,
    canManageRoles: wire.canManageRoles ?? false,
    canAppointAdministrators: wire.canAppointAdministrators ?? false,
    canLeave: wire.canLeave ?? false,
    canRequestDeletion: wire.canRequestDeletion ?? false,
    canTransferOwnership: wire.canTransferOwnership ?? false,
    canViewModerationQueue: wire.canViewModerationQueue ?? false,
    canViewAmbassadorDirectory: wire.canViewAmbassadorDirectory ?? false,
    canManageInitiatives: wire.canManageInitiatives ?? false,
  };
}

function toMembership(wire: MembershipWire): CommunityMembership {
  return {
    communityId: wire.communityId as CommunityId,
    state: wire.state as CommunityMembership['state'],
    isPrimary: wire.isPrimary ?? false,
    roles: (wire.roles ?? []) as CommunityRole[],
    capabilities: toCapabilities(wire.communityId, wire.capabilities),

    // Private when the server did not say. §41: an absent field must never read
    // as consent to publish.
    visibility: (wire.visibility ?? 'Private') as CommunityMembershipVisibility,

    joinedAt: wire.joinedAt ?? null,
    verifiedAt: wire.verifiedAt ?? null,
    stateReason: wire.stateReason ?? null,
    requiresApproval: wire.requiresApproval ?? undefined,
  };
}

function toMembershipSet(wire: MembershipSetWire | null | undefined): CommunityMembershipSet {
  const payload = wire ?? {};

  return {
    memberships: (payload.memberships ?? []).map(toMembership),
    primaryCommunityId: (payload.primaryCommunityId ?? null) as CommunityId | null,
    fetchedAt: payload.fetchedAt ?? null,
  };
}

function toDirectoryEntry(wire: DirectoryEntryWire): CommunityDirectoryEntry {
  return {
    community: toCommunity(wire.community),
    membershipState: wire.membershipState as CommunityDirectoryEntry['membershipState'],
    isPrimary: wire.isPrimary ?? false,
    reason: wire.reason ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DIRECTORY — GAP-001
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The communities on the platform, with the caller's standing in each.
 *
 * ── Two parameters are sent as comma-joined strings, and that is the contract ─
 *
 * `types` and `originCountryCodes` are single values rather than repeated keys,
 * because the route binds them as strings and splits. Sending repeated keys
 * would bind only the last one; sending an array here would serialize as
 * `types[]=…` and bind nothing at all, which the model binder discards without
 * an error — a 200 with an unfiltered list under a lit filter chip.
 *
 * ── `sort` ────────────────────────────────────────────────────────────────────
 *
 * The route serves newest-first, and `relevance` and `recent` both mean it. It
 * *refuses* `members` (§31: no popularity the backend does not authoritatively
 * report) and `name` (the cursor is timestamp-keyed), each with its own error
 * code rather than a silent fallback. The default sent here is the one the
 * server serves.
 */
export async function fetchCommunityDirectory(
  query: CommunityDirectoryQuery = {},
  signal?: AbortSignal
): Promise<CommunityDirectoryPage> {
  const page = await read<DirectoryPageWire>(
    ROOT,
    {
      query: query.query || undefined,
      types: query.types?.join(',') || undefined,
      originCountryCodes: query.originCountryCodes?.join(',') || undefined,
      presenceCountryCode: query.presenceCountryCode || undefined,
      includeJoined: query.includeJoined ?? true,
      sort: query.sort ?? 'relevance',
      cursor: query.cursor,
      limit: query.limit,
    },
    signal
  );

  return {
    items: (page.items ?? []).map(toDirectoryEntry),
    nextCursor: page.nextCursor ?? null,
    hasMore: page.hasMore ?? false,
    totalCount: page.totalCount ?? null,
    source: 'backend',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE — GAP-002
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One community, by id or by handle.
 *
 * ── The 404-versus-403 rule, so a caller can rely on it ──────────────────────
 *
 * This route never answers 403. Every reason it would refuse is also a reason
 * not to confirm the community exists, so a refusal is the same 404 a caller
 * gets for a handle nobody has taken. A private community is readable by anyone
 * holding *any* membership row — including somebody who left or was removed,
 * who already knows it is there.
 *
 * Suspended and archived communities **read**, and carry `statusReason`
 * verbatim. A screen that treats a non-Active status as an error throws away
 * the explanation the member is entitled to.
 */
export async function fetchCommunity(idOrSlug: string, signal?: AbortSignal): Promise<Community> {
  return toCommunity(
    await read<CommunityWire>(`${ROOT}/${encodeURIComponent(idOrSlug)}`, undefined, signal)
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — GAP-003, GAP-004, GAP-005
// ═════════════════════════════════════════════════════════════════════════════

/** Every community relationship the caller holds, terminal ones included. */
export async function fetchMembershipSet(signal?: AbortSignal): Promise<CommunityMembershipSet> {
  return toMembershipSet(
    await read<MembershipSetWire>(`${ROOT}/me/memberships`, undefined, signal)
  );
}

/**
 * Performs a membership transition.
 *
 * Takes the action as data rather than exposing six functions, and the server
 * decides whether the transition is legal — this function checks nothing.
 *
 * ── The removals go in the query string, not a body ──────────────────────────
 *
 * ASP.NET Core minimal APIs refuse to *infer* a body parameter on DELETE, so a
 * body here is not read at all. A query parameter is the better shape besides: a
 * body on DELETE is dropped by enough proxies that an action lost in transit
 * would read as the route's default, and that default is `leave`.
 */
export async function performMembershipAction(
  communityId: CommunityId,
  action: CommunityMembershipAction
): Promise<CommunityMembership> {
  const removals: CommunityMembershipAction[] = ['leave', 'unfollow', 'remove-interest'];
  const path = `${ROOT}/${encodeURIComponent(communityId)}/membership`;

  const wire = removals.includes(action)
    ? await write<MembershipWire>('delete', path, undefined, { action })
    : await write<MembershipWire>('post', path, { action });

  return toMembership(wire);
}

/**
 * Sets or clears the primary community — GAP-005.
 *
 * Answers the whole set rather than one membership, so `isPrimary` cannot end up
 * true on two entries in the client's cache while the server disagrees. `null`
 * clears it, and is a value rather than a second route.
 */
export async function setPrimaryCommunity(
  communityId: CommunityId | null
): Promise<CommunityMembershipSet> {
  return toMembershipSet(
    await write<MembershipSetWire>('put', `${ROOT}/me/primary`, { communityId })
  );
}

/**
 * Who may see the caller belongs to a community — §41.
 *
 * The opt-in half of the privacy default. A new membership is `Private`, so
 * joining publishes nothing; this is the only way a member changes that, and
 * there is no administrative form of it.
 */
export async function setMembershipVisibility(
  communityId: CommunityId,
  visibility: CommunityMembershipVisibility
): Promise<CommunityMembership> {
  return toMembership(
    await write<MembershipWire>(
      'put',
      `${ROOT}/${encodeURIComponent(communityId)}/membership/visibility`,
      { visibility }
    )
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CAPABILITIES — GAP-006
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the *server* says this caller may do here.
 *
 * A stranger gets eleven falses rather than a 403 — a refusal would tell them a
 * moderation queue exists. §62 keeps this server-side, and nothing in
 * `lib/community/access.ts` derives a capability from a role.
 *
 * Roles are granted since 11 Sep 2026: whoever founds a community is its Owner
 * and an Administrator, and the Owner and administrators give the others through
 * `changeCommunityRole`. This used to say nothing granted them, which was true —
 * the backend had the roles and no route that handed one out.
 */
export async function fetchCapabilities(
  communityId: CommunityId,
  signal?: AbortSignal
): Promise<CommunityCapabilities> {
  return toCapabilities(
    communityId,
    await read<CapabilitiesWire>(
      `${ROOT}/${encodeURIComponent(communityId)}/capabilities`,
      undefined,
      signal
    )
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMINISTRATION — founding, members and roles (11 Sep 2026)
// ═════════════════════════════════════════════════════════════════════════════

interface CommunityMemberWire {
  userId: string;
  displayName?: string | null;
  roles?: string[] | null;
  visibility?: string | null;
  joinedAt?: string | null;
  isYou?: boolean | null;
}

interface CommunityMemberPageWire {
  items?: CommunityMemberWire[] | null;
  nextCursor?: string | null;
  hasMore?: boolean | null;
}

function toMember(wire: CommunityMemberWire): CommunityMember {
  return {
    userId: wire.userId,
    // Null stays null. A screen that fell back to the id would print a GUID where
    // a name belongs — which the organisation members screen does today.
    displayName: wire.displayName?.trim() ? wire.displayName.trim() : null,
    roles: (wire.roles ?? []) as CommunityRole[],
    visibility: (wire.visibility ?? 'Private') as CommunityMembershipVisibility,
    joinedAt: wire.joinedAt ?? null,
    isYou: wire.isYou === true,
  };
}

/**
 * Found a community. The caller becomes its Owner and an Administrator.
 *
 * It opens **Pending**: only the founder (and Diaspora staff) can see it, and
 * nobody else can join until Diaspora opens it — the answer to somebody
 * squatting "Nigerians in London". The founder's own membership comes back,
 * capabilities included, so the next screen knows what they may do without
 * asking again.
 */
export async function proposeCommunity(input: ProposeCommunityInput): Promise<CommunityMembership> {
  return toMembership(
    await write<MembershipWire>('post', ROOT, {
      name: input.name,
      type: input.type,
      visibility: input.visibility,
      originCountryCode: input.originCountryCode || undefined,
      originRegionName: input.originRegionName || undefined,
      tagline: input.tagline || undefined,
      description: input.description || undefined,
    })
  );
}

/** Members the caller may see. For members only; newest first. */
export async function fetchCommunityMembers(
  idOrSlug: string,
  cursor?: string | null,
  signal?: AbortSignal
): Promise<CommunityMemberPage> {
  const wire = await read<CommunityMemberPageWire>(
    `${ROOT}/${encodeURIComponent(idOrSlug)}/members`,
    cursor ? { cursor } : undefined,
    signal
  );

  return {
    items: (wire.items ?? []).map(toMember),
    nextCursor: wire.nextCursor ?? null,
    hasMore: wire.hasMore === true,
  };
}

/**
 * Give a member a role, or take it away.
 *
 * The server decides everything: Moderator and Ambassador are any
 * administrator's to give, Administrator is the Owner's alone, and a member who
 * keeps their membership private cannot hold a role until they make it visible.
 * Its refusals are written for a member to read and are shown as they are.
 */
export async function changeCommunityRole(
  idOrSlug: string,
  userId: string,
  role: AssignableCommunityRole,
  granted: boolean
): Promise<CommunityMember> {
  return toMember(
    await write<CommunityMemberWire>(
      'put',
      `${ROOT}/${encodeURIComponent(idOrSlug)}/members/${encodeURIComponent(userId)}/roles`,
      { role, granted }
    )
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CLOSING A COMMUNITY, AND HANDING ONE OVER — 12 Sep 2026
//
// Nine routes. None of them performs a deletion: asking opens a request that
// waits thirty days, a Diaspora administrator decides in the meantime, and the
// platform's own sweep closes the community at the end if the answer was yes.
// ══════════════════════════════════════════════════════════════════════════════

interface DeletionRequestWire {
  id: string;
  communityId: string;
  communityName: string;
  communitySlug: string;
  status: string;
  reason: string;
  requestedBy: string;
  requestedByName?: string | null;
  requestedAt: string;
  effectiveAt: string;
  reviewedAt?: string | null;
  decisionReason?: string | null;
}

interface OwnershipOfferWire {
  id: string;
  communityId: string;
  communityName: string;
  communitySlug: string;
  status: string;
  offeredBy: string;
  offeredByName?: string | null;
  offeredTo: string;
  offeredToName?: string | null;
  message?: string | null;
  offeredAt: string;
  expiresAt: string;
  declineReason?: string | null;
}

function toDeletionRequest(wire: DeletionRequestWire): CommunityDeletionRequest {
  return {
    id: wire.id,
    communityId: wire.communityId as CommunityId,
    communityName: wire.communityName,
    communitySlug: wire.communitySlug,
    status: wire.status as CommunityDeletionStatus,
    reason: wire.reason,
    requestedBy: wire.requestedBy,
    // Absent stays absent. A screen with no name says "a member"; it never
    // prints the identifier.
    requestedByName: wire.requestedByName ?? null,
    requestedAt: wire.requestedAt,
    effectiveAt: wire.effectiveAt,
    reviewedAt: wire.reviewedAt ?? null,
    decisionReason: wire.decisionReason ?? null,
  };
}

function toOwnershipOffer(wire: OwnershipOfferWire): CommunityOwnershipOffer {
  return {
    id: wire.id,
    communityId: wire.communityId as CommunityId,
    communityName: wire.communityName,
    communitySlug: wire.communitySlug,
    status: wire.status as CommunityOwnershipOfferStatus,
    offeredBy: wire.offeredBy,
    offeredByName: wire.offeredByName ?? null,
    offeredTo: wire.offeredTo,
    offeredToName: wire.offeredToName ?? null,
    message: wire.message ?? null,
    offeredAt: wire.offeredAt,
    expiresAt: wire.expiresAt,
    declineReason: wire.declineReason ?? null,
  };
}

/** Ask Diaspora to close a community. The owner's alone, and it performs nothing. */
export async function requestCommunityDeletion(
  idOrSlug: string,
  input: RequestCommunityDeletionInput
): Promise<CommunityDeletionRequest> {
  return toDeletionRequest(
    await write<DeletionRequestWire>(
      'post',
      `${ROOT}/${encodeURIComponent(idOrSlug)}/deletion-request`,
      { reason: input.reason }
    )
  );
}

/** Change your mind, at any point before the community closes. */
export async function withdrawCommunityDeletion(
  idOrSlug: string
): Promise<CommunityDeletionRequest> {
  return toDeletionRequest(
    await write<DeletionRequestWire>(
      'delete',
      `${ROOT}/${encodeURIComponent(idOrSlug)}/deletion-request`
    )
  );
}

/**
 * What is happening to this community, if anything.
 *
 * Null where nothing ever has been: the platform answers with no request rather
 * than a 404, and a screen showing a banner for a community nobody asked to
 * close would be inventing one.
 */
export async function fetchCommunityDeletionRequest(
  idOrSlug: string,
  signal?: AbortSignal
): Promise<CommunityDeletionRequest | null> {
  const wire = await read<DeletionRequestWire | null>(
    `${ROOT}/${encodeURIComponent(idOrSlug)}/deletion-request`,
    undefined,
    signal
  );

  return wire ? toDeletionRequest(wire) : null;
}

/** The review queue. Platform administrators only — anybody else is refused. */
export async function fetchCommunityDeletionRequests(
  status?: string | null,
  cursor?: string | null,
  signal?: AbortSignal
): Promise<{ items: CommunityDeletionRequest[]; nextCursor: string | null; hasMore: boolean }> {
  const wire = await read<{
    items?: DeletionRequestWire[] | null;
    nextCursor?: string | null;
    hasMore?: boolean;
  }>(
    `${ROOT}/deletion-requests`,
    { status: status || undefined, cursor: cursor || undefined },
    signal
  );

  return {
    items: (wire.items ?? []).map(toDeletionRequest),
    nextCursor: wire.nextCursor ?? null,
    hasMore: wire.hasMore === true,
  };
}

/** Approve or refuse. A refusal needs a reason; the owner is shown it word for word. */
export async function decideCommunityDeletion(
  requestId: string,
  approve: boolean,
  reason?: string
): Promise<CommunityDeletionRequest> {
  return toDeletionRequest(
    await write<DeletionRequestWire>(
      'post',
      `${ROOT}/deletion-requests/${encodeURIComponent(requestId)}/decision`,
      { approve, reason: reason || undefined }
    )
  );
}

/** Offer the community to one of its moderators or administrators. */
export async function offerCommunityOwnership(
  idOrSlug: string,
  input: OfferCommunityOwnershipInput
): Promise<CommunityOwnershipOffer> {
  return toOwnershipOffer(
    await write<OwnershipOfferWire>(
      'post',
      `${ROOT}/${encodeURIComponent(idOrSlug)}/ownership-offers`,
      { userId: input.userId, message: input.message || undefined }
    )
  );
}

/** Take back an offer nobody has answered. */
export async function withdrawCommunityOwnershipOffer(
  idOrSlug: string
): Promise<CommunityOwnershipOffer> {
  return toOwnershipOffer(
    await write<OwnershipOfferWire>(
      'delete',
      `${ROOT}/${encodeURIComponent(idOrSlug)}/ownership-offers`
    )
  );
}

/** Communities somebody has asked you to take over. */
export async function fetchMyCommunityOwnershipOffers(
  signal?: AbortSignal
): Promise<CommunityOwnershipOffer[]> {
  const wire = await read<OwnershipOfferWire[] | null>(
    `${ROOT}/ownership-offers/mine`,
    undefined,
    signal
  );

  return (wire ?? []).map(toOwnershipOffer);
}

/** Accept or refuse a community somebody offered you. Only the person asked may answer. */
export async function decideCommunityOwnership(
  transferId: string,
  accept: boolean,
  reason?: string
): Promise<CommunityOwnershipOffer> {
  return toOwnershipOffer(
    await write<OwnershipOfferWire>(
      'post',
      `${ROOT}/ownership-offers/${encodeURIComponent(transferId)}/decision`,
      { accept, reason: reason || undefined }
    )
  );
}
