// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-Community development adapter (Frontend Phase 13)
//
// ⚠ DEVELOPMENT ONLY. Registers nothing in a release build. ⚠
//
// Serves `/community-directory/v0/*` — the routes `community-gap-directory-api.ts`
// calls. Deliberately **not** `/communities`, which Phase 12 already uses for
// organization membership programmes under `/community-gap/v0`.
//
// ── The one thing in here that is not simulated ──────────────────────────────
//
// The statistics handler is genuinely hybrid, and it matters that it is.
//
// A community's *content* counts are derivable from what the certified routes
// already return: the events, organizations, jobs, housing, marketplace listings
// and provider listings whose publisher's `originCountry` matches the community's
// country of origin. So this handler counts the **real** fixtures the certified
// handlers serve and marks those metrics `backend`. Only the metrics with nothing
// behind them — member count, growth, engagement — are marked `simulated`.
//
// That is not a nicety. §29 forbids inventing authoritative metrics, and the
// alternative was either to invent nine numbers or to show none. Marking each
// metric with where it came from means a reviewer opening a community profile can
// see at a glance which figures a real backend would already be able to serve —
// which is exactly the information GAP-007 needs in order to be prioritised.
//
// ── Route order ──────────────────────────────────────────────────────────────
//
// `axios-mock-adapter` matches in registration order, so the specific patterns go
// first. `/communities/memberships/me`, `/communities/suggestions` and
// `/communities/compare` must all be registered before `/communities/{idOrSlug}`,
// or the last one swallows them and a member's membership set comes back as a
// community called "memberships".
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import {
  COMMUNITY_DIRECTORY_GAP_PREFIX,
  areMultiCommunityGapsEnabled,
} from '@/config/multi-community-gaps';
import {
  MOCK_COMMUNITIES,
  MOCK_COMMUNITY_BY_ID,
  MOCK_COMMUNITY_BY_SLUG,
  MOCK_INITIATIVES,
  MOCK_MEMBERSHIPS,
  getPerformanceCommunitySet,
  noCapabilities,
} from '../community-directory-data';
import type {
  Community,
  CommunityCapabilities,
  CommunityDirectoryEntry,
  CommunityMembership,
  CommunityMembershipState,
} from '@/types/community-directory';

const ROOT = COMMUNITY_DIRECTORY_GAP_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown, meta?: Record<string, unknown>): MockReply {
  return [200, meta ? { data, meta } : { data }];
}

function problem(status: number, errorCode: string, detail: string): MockReply {
  return [
    status,
    {
      type: `https://docs.diaspora.app/errors/${errorCode}`,
      title: 'Request refused',
      status,
      detail,
      // `code`, as PlatformProblem writes it. These mocks sent `errorCode`,
      // which matched the client's old lookup and nothing the platform ever sent —
      // so mocked runs agreed with the defect instead of exposing it.
      code: errorCode,
    },
  ];
}

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The last path segment, decoded. */
function lastSegment(url: string, offsetFromEnd = 0): string {
  const parts = url.split('?')[0].split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1 - offsetFromEnd] ?? '');
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTABLE SESSION STATE
//
// Membership transitions have to stick within a session, or a member who joins a
// community sees the Join button again on the next screen and the whole §33 flow
// is untestable. Reset on reload, like every other development adapter here.
// ═════════════════════════════════════════════════════════════════════════════

let memberships: CommunityMembership[] = [];
let primaryCommunityId: string | null = null;

/**
 * Restores the session to its initial state.
 *
 * Called by `setupCommunityDirectoryMocks`, so one call to setup is one adapter
 * session. That matters in two places:
 *
 *   * **A reload starts clean.** A member who joined a community in a previous
 *     Metro session should not find themselves already joined after a refresh,
 *     because the *server* has no record of it.
 *   * **Tests are order-independent.** Without this, a test that leaves the
 *     Nigerian community strips its capabilities for every test that runs after
 *     it, and the suite starts depending on declaration order — which is the kind
 *     of failure that gets "fixed" by reordering tests rather than by finding the
 *     bug.
 *
 * Deep-copied, because the transitions below mutate the membership records in
 * place and a shallow copy would edit the fixture itself.
 */
function resetSession(): void {
  memberships = MOCK_MEMBERSHIPS.map((membership) => ({
    ...membership,
    roles: [...membership.roles],
    capabilities: { ...membership.capabilities, roles: [...membership.capabilities.roles] },
  }));

  primaryCommunityId = MOCK_MEMBERSHIPS.find((m) => m.isPrimary)?.communityId ?? null;
}

function membershipFor(communityId: string): CommunityMembership | undefined {
  return memberships.find((m) => m.communityId === communityId);
}

function membershipStateFor(communityId: string): CommunityMembershipState {
  return membershipFor(communityId)?.state ?? 'None';
}

/**
 * The community set a caller may see.
 *
 * `Private` communities are excluded unless the caller has a membership in them —
 * GAP-001's privacy note requires the directory not to reveal that a private
 * community exists. `Unlisted` is excluded from browse but resolvable by id or
 * slug, which is what "unlisted" means.
 */
function visibleCommunities(includePerformanceSet: boolean): Community[] {
  const curated = MOCK_COMMUNITIES.filter((community) => {
    if (community.visibility === 'Private') {
      // Belonging, and only belonging. A role is not a state (they are separate
      // axes in the domain model), and an expressed interest is not access.
      const state = membershipStateFor(community.id);
      return state === 'Member' || state === 'VerifiedMember';
    }
    return community.visibility !== 'Unlisted';
  });

  return includePerformanceSet ? [...curated, ...getPerformanceCommunitySet()] : curated;
}

function toEntry(community: Community, reason?: string): CommunityDirectoryEntry {
  return {
    community,
    membershipState: membershipStateFor(community.id),
    isPrimary: primaryCommunityId === community.id,
    reason: reason ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

export function setupCommunityDirectoryMocks(mock: MockAdapter): void {
  // The switch is checked once, here. A release build registers nothing, so a
  // call that somehow escaped falls through to the passthrough and 404s at the
  // gateway rather than being answered with development data.
  if (!areMultiCommunityGapsEnabled()) return;

  // One setup call, one adapter session. See `resetSession`.
  resetSession();

  // ── Directory ──────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/communities/suggestions$`)).reply((config) => {
    const presence = config.params?.presenceCountryCode
      ? String(config.params.presenceCountryCode).toUpperCase()
      : null;

    // §55: the reason is *given*, not implied by ranking, and the only input is
    // the residence country the member already supplied. Nothing is inferred from
    // nationality, language or contacts — there is no parameter for them.
    const pool = visibleCommunities(false).filter((c) => c.status === 'Active');

    const suggestions = pool
      .map((community) => {
        const hasPresence = presence
          ? (community.presenceCountryCodes ?? []).includes(presence)
          : false;

        return toEntry(
          community,
          hasPresence
            ? `Members of this community live in your country of residence`
            : `A large community on Diaspora`
        );
      })
      // Presence first, then the curated order. A documented client ordering, not
      // a relevance score — §25 forbids the frontend ranking anything.
      .sort((a, b) => Number(Boolean(b.reason?.startsWith('Members'))) - Number(Boolean(a.reason?.startsWith('Members'))))
      .slice(0, 8);

    return ok(suggestions);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/memberships/me$`)).reply(() =>
    ok({
      memberships,
      primaryCommunityId,
      fetchedAt: nowIso(),
    })
  );

  // ── The directory list. Registered before `/communities/{idOrSlug}`. ────────

  mock.onGet(new RegExp(`${ROOT}/communities$`)).reply((config) => {
    const params = config.params ?? {};
    const query = params.query ? String(params.query).toLowerCase().trim() : '';
    const types = params.types ? String(params.types).split(',').filter(Boolean) : [];
    const originCodes = params.originCountryCodes
      ? String(params.originCountryCodes).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
      : [];
    const presence = params.presenceCountryCode
      ? String(params.presenceCountryCode).toUpperCase()
      : '';
    const includeJoined = params.includeJoined !== false && params.includeJoined !== 'false';
    const sort = params.sort ? String(params.sort) : 'relevance';
    const limit = params.limit ? Math.min(Number(params.limit), 250) : 20;
    const start = params.cursor ? Number(params.cursor) : 0;

    // The performance set is opt-in, via a large `limit`. §77's 1,000+ case is
    // reachable without the curated set being swamped in everyday use.
    let pool = visibleCommunities(limit > 100);

    if (query) {
      pool = pool.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.tagline ?? '').toLowerCase().includes(query) ||
          (c.origin.countryName ?? '').toLowerCase().includes(query) ||
          (c.origin.regionName ?? '').toLowerCase().includes(query)
      );
    }

    if (types.length > 0) pool = pool.filter((c) => types.includes(c.type));

    if (originCodes.length > 0) {
      pool = pool.filter((c) => {
        const code = c.origin.countryCode?.toUpperCase();
        return Boolean(code) && originCodes.includes(code!);
      });
    }

    if (presence) {
      pool = pool.filter((c) => (c.presenceCountryCodes ?? []).includes(presence));
    }

    if (!includeJoined) {
      pool = pool.filter((c) => {
        const state = membershipStateFor(c.id);
        return state !== 'Member' && state !== 'VerifiedMember';
      });
    }

    // `members` sorting is deliberately **refused**, not silently downgraded.
    // GAP-001: §31 forbids implying popularity the backend does not report, and
    // this adapter reports every member count as simulated.
    if (sort === 'members') {
      return problem(
        422,
        'community.sort.unsupported',
        'Sorting by member count is not available: no authoritative member counts are published (FRONTEND-PHASE13-GAP-001).'
      );
    }

    const sorted =
      sort === 'name'
        ? [...pool].sort((a, b) => a.name.localeCompare(b.name))
        : sort === 'recent'
          ? [...pool].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          : pool;

    const slice = sorted.slice(start, start + limit);
    const nextIndex = start + limit;

    return ok({
      items: slice.map((community) => toEntry(community)),
      nextCursor: nextIndex < sorted.length ? String(nextIndex) : null,
      hasMore: nextIndex < sorted.length,
      totalCount: sorted.length,
      source: 'simulated',
    });
  });

  // ── Per-community sub-resources. All before `/communities/{idOrSlug}`. ──────

  mock
    .onGet(new RegExp(`${ROOT}/communities/[^/]+/capabilities$`))
    .reply((config) => {
      const communityId = lastSegment(config.url ?? '', 1);
      const membership = membershipFor(communityId);

      // §62: a capability set the server did not report is every field false. A
      // non-member gets an all-false set rather than a 403, so the UI renders
      // nothing rather than an error — GAP-006's contract note.
      return ok(membership?.capabilities ?? noCapabilities(communityId));
    });

  // Statistics, comparison, rules, notices, role holders, the moderation queue
  // and preferences are served for real since 20 Oct 2026 and are no longer
  // simulated here: the client reads them without the gap prefix, so a handler
  // under it would be answering a route nobody calls.

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/initiatives$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    return ok(MOCK_INITIATIVES[communityId] ?? []);
  });

  // ── Membership transitions ─────────────────────────────────────────────────

  mock
    .onPut(new RegExp(`${ROOT}/communities/[^/]+/membership/visibility$`))
    .reply((config) => {
      const url = config.url ?? '';
      const communityId = url.split('/communities/')[1]?.split('/')[0] ?? '';
      const { visibility } = body<{ visibility: CommunityMembership['visibility'] }>(config);
      const membership = membershipFor(communityId);

      if (!membership) return problem(404, 'community.membership.not_found', 'No membership here.');

      membership.visibility = visibility;
      return ok(membership);
    });

  mock.onPost(new RegExp(`${ROOT}/communities/[^/]+/membership$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const community = MOCK_COMMUNITY_BY_ID.get(communityId);
    const { action } = body<{ action: string }>(config);

    if (!community) return problem(404, 'community.not_found', 'No such community.');

    // §75. A suspended or archived community refuses every transition, and says
    // why rather than returning a generic 403.
    if (community.status === 'Suspended' || community.status === 'Archived') {
      return problem(
        409,
        'community.unavailable',
        community.statusReason ?? 'This community is not currently open to changes.'
      );
    }

    if (action === 'join' && community.status !== 'Active') {
      return problem(
        409,
        'community.not_joinable',
        community.statusReason ?? 'This community is not open for joining yet.'
      );
    }

    const existing = membershipFor(communityId);

    // §74. A revoked membership offers nothing, and the server is the thing that
    // enforces that — the client merely does not draw the button.
    if (existing?.state === 'Revoked') {
      return problem(
        403,
        'community.membership.revoked',
        existing.stateReason ?? 'This community ended your membership.'
      );
    }

    // Tamil requires approval in the development data, so the pending path is
    // reachable. A real contract carries this per community.
    const requiresApproval = communityId.endsWith('tamil');

    const nextState: CommunityMembershipState =
      action === 'join'
        ? requiresApproval
          ? 'PendingApproval'
          : 'Member'
        : action === 'follow'
          ? 'Following'
          : action === 'express-interest'
            ? 'Interested'
            : 'None';

    const membership: CommunityMembership = existing ?? {
      communityId,
      state: 'None',
      isPrimary: false,
      roles: [],
      capabilities: noCapabilities(communityId),
      // §41: a new membership defaults to Private. The member opts in to being
      // visible rather than out.
      visibility: 'Private',
      joinedAt: null,
      verifiedAt: null,
      requiresApproval,
    };

    membership.state = nextState;
    membership.requiresApproval = requiresApproval;

    if (nextState === 'Member') {
      membership.joinedAt = nowIso();
      membership.roles = ['Member'];
      membership.capabilities = {
        ...noCapabilities(communityId),
        roles: ['Member'],
        canViewMembers: true,
        canPostToCommunity: true,
        canViewAmbassadorDirectory: true,
      };
    }

    if (!existing) memberships = [...memberships, membership];

    return ok(membership);
  });

  mock.onDelete(new RegExp(`${ROOT}/communities/[^/]+/membership$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const { action } = body<{ action: string }>(config);
    const membership = membershipFor(communityId);

    if (!membership) {
      return problem(404, 'community.membership.not_found', 'No membership to remove.');
    }

    membership.state = action === 'leave' ? 'Left' : 'None';
    membership.roles = [];
    membership.capabilities = noCapabilities(communityId);

    if (action === 'leave') {
      membership.isPrimary = false;
      if (primaryCommunityId === communityId) primaryCommunityId = null;
    }

    return ok(membership);
  });

  mock.onPut(new RegExp(`${ROOT}/users/me/primary-community$`)).reply((config) => {
    const { communityId } = body<{ communityId: string | null }>(config);

    if (communityId) {
      const membership = membershipFor(communityId);
      // A real contract must state whether the primary has to be a joined
      // community. This adapter says yes, and refuses rather than silently
      // accepting — GAP-005's open question, made visible.
      if (!membership || (membership.state !== 'Member' && membership.state !== 'VerifiedMember')) {
        return problem(
          409,
          'community.primary.not_a_member',
          'A primary community must be one you have joined.'
        );
      }
    }

    primaryCommunityId = communityId;
    memberships = memberships.map((m) => ({ ...m, isPrimary: m.communityId === communityId }));

    return ok({ memberships, primaryCommunityId, fetchedAt: nowIso() });
  });

  // ── The profile read. LAST, because `{idOrSlug}` matches anything. ──────────

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+$`)).reply((config) => {
    const idOrSlug = lastSegment(config.url ?? '');
    const community =
      MOCK_COMMUNITY_BY_ID.get(idOrSlug) ??
      MOCK_COMMUNITY_BY_SLUG.get(idOrSlug) ??
      getPerformanceCommunitySet().find((c) => c.id === idOrSlug || c.slug === idOrSlug);

    if (!community) {
      return problem(404, 'community.not_found', 'We could not find that community.');
    }

    // §62 / GAP-002: a private community the caller has no membership in is a
    // 403, distinct from a 404, so the client can render the right state without
    // guessing — and without the 404 confirming it exists.
    if (community.visibility === 'Private') {
      const state = membershipStateFor(community.id);
      if (state !== 'Member' && state !== 'VerifiedMember') {
        return problem(
          403,
          'community.forbidden',
          'This community is private. Its members choose who can see it.'
        );
      }
    }

    return ok(community);
  });
}
