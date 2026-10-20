// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community directory, development arm (Frontend Phase 13)
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/multi-community-gaps.ts`. ⚠
//
// The development arm of the repository split. The certified arm is
// `community-directory-api.ts`; `hooks/communities.ts` is the stable interface
// above both, and a screen cannot tell which answered except through the
// `isSimulated` flag it is required to render.
//
// ── Why the prefix is `/community-directory/v0` and not `/communities` ───────
//
// Because `/communities` is already taken. Phase 12 serves organization
// membership programmes from `/community-gap/v0/communities/*` — a different
// domain with a colliding name. Three consequences of the distinct prefix, all
// wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance which community
//     concept it is about.
//   * A call that escaped a development build 404s at the gateway. It cannot
//     collide with, shadow, or be mistaken for either a certified route or Phase
//     12's adapter.
//   * Migration is mechanical: when a backend phase ships a community directory,
//     the repository swaps this import and the request shapes already match.
//
// Every function refuses to run when the gap features are disabled, so the
// guarantee does not depend on a screen remembering to check.
//
// ── What is NOT in this file, and why it matters ─────────────────────────────
//
// **Nothing that moves money.** No payment, no donation, no contribution, no
// wallet, no balance, no transaction. §51 forbids inventing a community wallet
// and the absence here is the enforcement — there is no function to call, so no
// screen can call one, and `community-directory-money.test.ts` asserts it
// structurally rather than trusting this comment.
//
// **Nothing that grants a permission.** `fetchCapabilities` *reads* a capability
// set; there is no `grantRole`, no `assignModerator`, no `setCapability`. §62
// keeps authorization server-side, and a development adapter that could mint a
// moderator would be a development adapter that teaches the codebase a habit it
// must not have.
//
// **No content.** No guide, job, listing, event, organization or update is
// fetched here. All of those have certified routes and go to the certified arm.
// §3 and §14 say do not duplicate the platform's discovery systems, and this file
// duplicates none of them.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import {
  COMMUNITY_DIRECTORY_GAP_PREFIX,
  MULTI_COMMUNITY_GAPS,
  areMultiCommunityGapsEnabled,
} from '@/config/multi-community-gaps';
import type {
  Community,
  CommunityCapabilities,
  CommunityDirectoryEntry,
  CommunityDirectoryPage,
  CommunityDirectoryQuery,
  CommunityId,
  CommunityMembership,
  CommunityMembershipAction,
  CommunityMembershipSet,
  CommunityMembershipVisibility,
  CommunityReportStatus,
  CommunityRole,
  StatisticsPeriod,
} from '@/types/community-directory';

const PREFIX = COMMUNITY_DIRECTORY_GAP_PREFIX;

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced under `community-directory-gap`, never colliding with
// `communityScopedKeys` (certified, `community-directory`), `communityGapKeys`
// (Phase 12, `community-gap`) or `communityLifeKeys` (B12, `community-life`).
// A cache dump that shows a `community-directory-gap` entry is showing a
// simulated value, and that should be visible without cross-referencing.
// ─────────────────────────────────────────────────────────────────────────────

export const communityDirectoryGapKeys = {
  all: ['community-directory-gap'] as const,

  directory: (query: CommunityDirectoryQuery) =>
    ['community-directory-gap', 'directory', normalizeQuery(query)] as const,
  suggestions: (presenceCountryCode?: string) =>
    ['community-directory-gap', 'suggestions', presenceCountryCode ?? 'any'] as const,

  community: (idOrSlug: string) => ['community-directory-gap', 'community', idOrSlug] as const,

  memberships: () => ['community-directory-gap', 'memberships', 'me'] as const,
  capabilities: (communityId: CommunityId) =>
    ['community-directory-gap', 'capabilities', communityId] as const,

  statistics: (communityId: CommunityId, period: StatisticsPeriod) =>
    ['community-directory-gap', 'statistics', communityId, period] as const,
  comparison: (ids: readonly CommunityId[], period: StatisticsPeriod) =>
    ['community-directory-gap', 'comparison', [...ids].sort().join(','), period] as const,

  rules: (communityId: CommunityId) => ['community-directory-gap', 'rules', communityId] as const,
  notices: (communityId: CommunityId) => ['community-directory-gap', 'notices', communityId] as const,
  roles: (communityId: CommunityId, role?: CommunityRole) =>
    ['community-directory-gap', 'roles', communityId, role ?? 'all'] as const,
  // Initiatives are real since 20 Oct 2026 (`community-entity-api.ts`); the keys
  // stay in this namespace beside rules and notices so one invalidation reaches them.
  initiatives: (communityId: CommunityId) =>
    ['community-directory-gap', 'initiatives', communityId] as const,
  initiative: (communityId: CommunityId, initiativeId: string) =>
    ['community-directory-gap', 'initiatives', communityId, 'one', initiativeId] as const,
  initiativeParticipants: (communityId: CommunityId, initiativeId: string) =>
    ['community-directory-gap', 'initiatives', communityId, 'participants', initiativeId] as const,
  initiativeUpdates: (communityId: CommunityId, initiativeId: string) =>
    ['community-directory-gap', 'initiatives', communityId, 'updates', initiativeId] as const,

  reports: (communityId: CommunityId, status?: CommunityReportStatus) =>
    ['community-directory-gap', 'reports', communityId, status ?? 'all'] as const,

  preferences: () => ['community-directory-gap', 'preferences', 'me'] as const,
};

/**
 * A stable, comparable form of a directory query.
 *
 * Arrays are sorted and empties dropped so that two selections meaning the same
 * thing are one cache entry. Without this, `types: ['A','B']` and
 * `types: ['B','A']` would be two identical requests under two keys — the
 * duplication §60 forbids.
 */
function normalizeQuery(query: CommunityDirectoryQuery): Record<string, unknown> {
  return {
    query: query.query?.trim().toLowerCase() || undefined,
    types: query.types?.length ? [...query.types].sort() : undefined,
    originCountryCodes: query.originCountryCodes?.length
      ? [...query.originCountryCodes].map((c) => c.toUpperCase()).sort()
      : undefined,
    presenceCountryCode: query.presenceCountryCode?.toUpperCase() || undefined,
    sort: query.sort ?? 'relevance',
    includeJoined: query.includeJoined ?? true,
    limit: query.limit,
    cursor: query.cursor,
  };
}

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export class CommunityDirectoryUnavailableError extends Error {
  readonly gapKey: string;

  constructor(message: string, gapKey: string) {
    super(message);
    this.name = 'CommunityDirectoryUnavailableError';
    this.gapKey = gapKey;
  }
}

export function isCommunityDirectoryUnavailable(
  error: unknown
): error is CommunityDirectoryUnavailableError {
  return error instanceof CommunityDirectoryUnavailableError;
}

/**
 * The guard every function in this file passes through.
 *
 * Throws rather than returning empty, and the distinction matters. An empty
 * result renders as "there are no communities", which is a claim about the
 * platform. A rejection renders as "this is not available in this build", which
 * is a claim about the build — and it is the true one. §64's requirement that
 * development data cannot ship is enforced here rather than by each caller.
 */
/**
 * Note the callers are all `async`. That is deliberate: an `async` function turns
 * this throw into a **rejected promise**, so a caller that wrote
 * `fetchCommunityDirectory().catch(handle)` sees the refusal. A synchronous throw
 * from a non-async function would escape that `catch` entirely and surface as an
 * unhandled error at the call site instead — TanStack Query tolerates both, which
 * is exactly why the difference would go unnoticed until something else called it.
 */
function assertEnabled(gapKey: string): void {
  if (!areMultiCommunityGapsEnabled()) {
    const gap = MULTI_COMMUNITY_GAPS[gapKey];
    throw new CommunityDirectoryUnavailableError(
      gap ? `${gap.id} — ${gap.capability} is not available in this build.` : 'Not available.',
      gapKey
    );
  }
}

async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(`${PREFIX}${path}`, { params, signal });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as the financial and Community
 * Life clients do, so a transport failure on a join becomes an *indeterminate*
 * outcome rather than a failed one.
 *
 * That matters here for the same reason it matters for a payment: a member who
 * taps Join and sees a timeout must not be told it failed, because it may well
 * have succeeded — and the recovery from "it failed" is to tap again, which is
 * how a community ends up with two applications from the same person.
 */
async function write<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: object
): Promise<T> {
  try {
    const url = `${PREFIX}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(url, { params, data: body })
        : method === 'put'
          ? await apiClient.put<Envelope<T>>(url, body, { params })
          : await apiClient.post<Envelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DIRECTORY — FRONTEND-PHASE13-GAP-001
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchCommunityDirectory(
  query: CommunityDirectoryQuery = {},
  signal?: AbortSignal
): Promise<CommunityDirectoryPage> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityDirectory.key);

  return read<CommunityDirectoryPage>(
    '/communities',
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
}

/**
 * Suggested communities for onboarding — FRONTEND-PHASE13-GAP-020.
 *
 * Sends only the residence country the member already gave the platform, and
 * nothing at all if they skipped that step. §55 forbids inferring identity
 * characteristics, so nationality, language and any derived attribute are
 * deliberately not sent — there is no parameter for them.
 */
export async function fetchCommunitySuggestions(
  presenceCountryCode?: string,
  signal?: AbortSignal
): Promise<CommunityDirectoryEntry[]> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityOnboardingSuggestions.key);

  return read<CommunityDirectoryEntry[]>(
    '/communities/suggestions',
    { presenceCountryCode: presenceCountryCode || undefined },
    signal
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE — FRONTEND-PHASE13-GAP-002, GAP-022
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Resolves by id **or** slug, because a deep link carries the slug and the app
 * does not know the id until it has resolved one.
 */
export async function fetchCommunity(idOrSlug: string, signal?: AbortSignal): Promise<Community> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityProfile.key);
  return read<Community>(`/communities/${encodeURIComponent(idOrSlug)}`, undefined, signal);
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — FRONTEND-PHASE13-GAP-003, GAP-004, GAP-005
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Turns whatever the route actually answers into a membership set.
 *
 * ── The mismatch this exists for ────────────────────────────────────────────
 *
 * `config/multi-community-gaps.ts` records it plainly: the client asks for
 * `{ memberships: CommunityMembership[], primaryCommunityId?: string }` and the
 * route answers a **bare array**. There is no wrapper object and no
 * `primaryCommunityId`.
 *
 * It was written down and it still shipped, because reading `.memberships` off
 * an array yields `undefined` rather than throwing at the boundary — so the
 * failure surfaced four layers away, as `Cannot read property 'map' of
 * undefined`, on the Home screen, immediately after a member signed in.
 *
 * Normalising here rather than guarding at each use site is the difference
 * between one place that knows the wire is wrong and nine that each have to
 * remember. `hooks/communities.ts` alone dereferenced `.memberships` five
 * times, including inside two `useMemo` dependency arrays.
 *
 * When the route grows the wrapper this function keeps working: it accepts both
 * shapes deliberately, so the fix on the server side needs no client release.
 */
function toMembershipSet(payload: unknown): CommunityMembershipSet {
  if (Array.isArray(payload)) {
    // What the route serves today. `primaryCommunityId` is not carried at all,
    // and null is the honest answer — §7's primary-community half has no
    // contract behind it yet, which is not the same as "there is no primary".
    return { memberships: payload as CommunityMembership[], primaryCommunityId: null, fetchedAt: null };
  }

  const wrapped = (payload ?? {}) as Partial<CommunityMembershipSet>;

  return {
    memberships: Array.isArray(wrapped.memberships) ? wrapped.memberships : [],
    primaryCommunityId: wrapped.primaryCommunityId ?? null,
    fetchedAt: wrapped.fetchedAt ?? null,
  };
}

export async function fetchMembershipSet(signal?: AbortSignal): Promise<CommunityMembershipSet> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityMembershipSet.key);

  // Deliberately `unknown`: the declared type is what this route *should* answer,
  // and casting the response to it is what hid the mismatch in the first place.
  return toMembershipSet(
    await read<unknown>('/communities/memberships/me', undefined, signal)
  );
}

/**
 * Performs a membership transition.
 *
 * Takes the action as **data** rather than exposing six functions, so a backend
 * that lands one route or six needs no screen change. The server decides whether
 * the transition is legal; this function does not check.
 */
export async function performMembershipAction(
  communityId: CommunityId,
  action: CommunityMembershipAction
): Promise<CommunityMembership> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityMembershipActions.key);

  const removals: CommunityMembershipAction[] = ['leave', 'unfollow', 'remove-interest'];

  return removals.includes(action)
    ? write<CommunityMembership>(
        'delete',
        `/communities/${encodeURIComponent(communityId)}/membership`,
        { action }
      )
    : write<CommunityMembership>(
        'post',
        `/communities/${encodeURIComponent(communityId)}/membership`,
        { action }
      );
}

/**
 * Sets or clears the primary community — GAP-005.
 *
 * Returns the whole set rather than one membership, so `isPrimary` cannot end up
 * true on two entries in the client's cache while the server disagrees.
 */
export async function setPrimaryCommunity(
  communityId: CommunityId | null
): Promise<CommunityMembershipSet> {
  assertEnabled(MULTI_COMMUNITY_GAPS.primaryCommunity.key);
  return write<CommunityMembershipSet>('put', '/users/me/primary-community', { communityId });
}

/** Per-membership visibility — GAP-021, §41. */
export async function setMembershipVisibility(
  communityId: CommunityId,
  visibility: CommunityMembershipVisibility
): Promise<CommunityMembership> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityPreferencesPersistence.key);
  return write<CommunityMembership>(
    'put',
    `/communities/${encodeURIComponent(communityId)}/membership/visibility`,
    { visibility }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CAPABILITIES — FRONTEND-PHASE13-GAP-006
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The caller's capabilities in one community.
 *
 * Read-only, and there is deliberately no write counterpart. §62 keeps
 * authorization server-side; a development adapter able to grant a capability
 * would be one somebody eventually calls from a screen.
 */
export async function fetchCapabilities(
  communityId: CommunityId,
  signal?: AbortSignal
): Promise<CommunityCapabilities> {
  assertEnabled(MULTI_COMMUNITY_GAPS.communityCapabilities.key);
  return read<CommunityCapabilities>(
    `/communities/${encodeURIComponent(communityId)}/capabilities`,
    undefined,
    signal
  );
}
