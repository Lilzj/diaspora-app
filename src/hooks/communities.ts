// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community repositories (Frontend Phase 13, §12, §43, §61,
// §64)
//
// §64's repository layer. Every hook here is the *stable domain interface* a
// screen depends on, and each one decides for itself which arm answers:
//
//   CommunityDirectoryRepository     → development adapter        GAP-001
//   CommunityProfileRepository       → development adapter        GAP-002
//   CommunityMembershipRepository    → development adapter        GAP-003/004/005
//   CommunityRoleRepository          → development adapter        GAP-006/018
//   CommunityStatisticsRepository    → adapter, **hybrid marks**  GAP-007
//   CommunityGovernanceRepository    → development adapter        GAP-016/017/019
//   CommunityScopedContentRepository → **certified routes**       GAP-009
//
// Five properties every hook holds to, because screens rely on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented member count
//   without having had the opportunity to mark it. The hybrid hooks report it
//   *per metric* — marking a real event count as simulated would be its own kind
//   of lie.
//
//   **A disabled build is not an error state.** Gap queries are `enabled: false`
//   in a release build rather than left to fail, so a production binary shows
//   "not available yet" rather than a spinner resolving into an error.
//
//   **The scope is resolved once, here.** Screens never combine a mode with a
//   membership set; they ask for a scope and get one. §12 forbids
//   `activeCommunityId` scattered through components, and the way that holds is
//   that no component has the pieces to assemble a scope itself.
//
//   **Server state stays server state.** Membership, roles and capabilities are
//   TanStack Query data. Nothing here mirrors them into Zustand (§44), because a
//   mirrored capability is a capability that outlives its revocation.
//
//   **Nothing is ranked here.** §25 forbids implementing recommendation scoring
//   in the frontend and this file implements none. Ordering is the server's, or
//   it is a documented client behaviour (name, distance) that the UI labels.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  Community,
  CommunityCapabilities,
  CommunityComparison,
  CommunityDirectoryEntry,
  CommunityDirectoryPage,
  CommunityDirectoryQuery,
  CommunityId,
  CommunityInitiative,
  CommunityMembership,
  CommunityMembershipAction,
  CommunityMembershipSet,
  CommunityModerationDecision,
  CommunityNotice,
  CommunityPreferences,
  CommunityRef,
  CommunityReport,
  CommunityReportStatus,
  CommunityRole,
  CommunityRoleHolder,
  CommunityRule,
  CommunityScope,
  CommunityStatistics,
  CommunityUnavailableReason,
  StatisticsPeriod,
} from '@/types/community-directory';
import { defaultCommunityPreferences } from '@/types/community-directory';

import {
  MULTI_COMMUNITY_GAPS,
  areMultiCommunityGapsEnabled,
  getCommunityFeatureFlags,
} from '@/config/multi-community-gaps';

import {
  communityDirectoryGapKeys,
  decideCommunityReport,
  fetchCapabilities,
  fetchCommunity,
  fetchCommunityComparison,
  fetchCommunityDirectory,
  fetchCommunityInitiatives,
  fetchCommunityNotices,
  fetchCommunityPreferences,
  fetchCommunityReports,
  fetchCommunityRoleHolders,
  fetchCommunityRules,
  fetchCommunityStatistics,
  fetchCommunitySuggestions,
  fetchMembershipSet,
  performMembershipAction,
  saveCommunityPreferences,
  setPrimaryCommunity,
} from '@/lib/community-gap-directory-api';

import {
  communityScopedKeys,
  fetchScopedContent,
  narrowToScope,
  searchScoped,
  type CertifiedContentParams,
  type CommunityContentDomain,
  type CommunityScopedResult,
} from '@/lib/community-directory-api';

import {
  ALL_COMMUNITIES_SCOPE,
  canonicalCommunityIds,
  isEmptyScope,
  projectScope,
  resolveInterestedCommunityIds,
  resolveMyCommunityIds,
  resolvePrimaryMembership,
  resolveScope,
  toRef,
  type ScopeProjection,
} from '@/lib/community/scope';

import { communityUnavailableReason } from '@/lib/community/access';
import { mergeCommunityMetadata, readCommunityMetadata } from '@/lib/community/persistence';
import {
  selectCommunityFilterSelection,
  useCommunityContextStore,
} from '@/store/community-context';
import { trackCommunityEvent } from '@/lib/community/analytics';
import { useConnectivityStore } from '@/lib/connectivity';
import { useAuthStore } from '@/store/auth';

/** How many communities the switcher and the projection lookup hold at once. */
const LOOKUP_LIMIT = 250;

// ═════════════════════════════════════════════════════════════════════════════
// DIRECTORY — GAP-001
// ═════════════════════════════════════════════════════════════════════════════

export interface CommunityQueryMeta {
  /** True when the development adapter answered. Screens must render a marker. */
  isSimulated: boolean;
  /** Set where the surface cannot be shown at all. Drives the §74 states. */
  unavailable: CommunityUnavailableReason | null;
}

function gapMeta(query: { isError: boolean; isLoading: boolean }): CommunityQueryMeta {
  const enabled = areMultiCommunityGapsEnabled();

  return {
    isSimulated: enabled,
    unavailable: !enabled ? 'feature-disabled' : query.isError ? 'error' : null,
  };
}

export function useCommunityDirectory(
  query: CommunityDirectoryQuery = {}
): UseQueryResult<CommunityDirectoryPage> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = flags.multiCommunityEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.directory(query),
    queryFn: async ({ signal }) => {
      const page = await fetchCommunityDirectory(query, signal);
      // Warm the offline metadata cache as a side effect of normal use, so a
      // switcher can render names and flags without a network (§45).
      void mergeCommunityMetadata(page.items.map((entry) => entry.community));
      return page;
    },
    enabled,
    // Community metadata is slow-moving. §60 forbids repeated metadata requests.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

/**
 * Every community the client can currently name.
 *
 * The lookup the projection needs, and the switcher's source. Bounded at
 * `LOOKUP_LIMIT` on purpose: §77 requires the app to stay responsive at 1,000+
 * communities, and it does that by *not* holding all of them — the switcher pages
 * and searches server-side, and the projection only needs the communities
 * currently in scope, which is a handful.
 *
 * Falls back to the persisted metadata when the directory query cannot run — a
 * release build, or offline — so a community badge still renders a name rather
 * than an id.
 */
export function useAvailableCommunities(): {
  communities: Community[];
  refs: CommunityRef[];
  lookup: (id: CommunityId) => Community | CommunityRef | undefined;
  isSimulated: boolean;
  isLoading: boolean;
  isOffline: boolean;
} {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const directory = useCommunityDirectory({ limit: LOOKUP_LIMIT, includeJoined: true });

  const cached = useQuery({
    queryKey: ['community-directory', 'metadata-cache'],
    queryFn: () => readCommunityMetadata(),
    staleTime: 60_000,
  });

  const communities = useMemo(
    () => directory.data?.items.map((entry) => entry.community) ?? [],
    [directory.data]
  );

  const refs = useMemo<CommunityRef[]>(() => {
    if (communities.length > 0) return communities.map(toRef);
    // Offline or disabled: the persisted metadata is a `CommunityRef` superset.
    return (cached.data ?? []).map(toRef);
  }, [cached.data, communities]);

  const byId = useMemo(() => {
    const map = new Map<CommunityId, Community | CommunityRef>();
    for (const ref of refs) map.set(ref.id, ref);
    // A full record beats a ref where both exist.
    for (const community of communities) map.set(community.id, community);
    return map;
  }, [communities, refs]);

  return {
    communities,
    refs,
    lookup: useCallback((id: CommunityId) => byId.get(id), [byId]),
    isSimulated: directory.isSimulated,
    isLoading: directory.isLoading,
    isOffline: !isOnline,
  };
}

export function useCommunitySuggestions(
  presenceCountryCode?: string
): UseQueryResult<CommunityDirectoryEntry[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = flags.communityOnboardingEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.suggestions(presenceCountryCode),
    queryFn: ({ signal }) => fetchCommunitySuggestions(presenceCountryCode, signal),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE — GAP-002, GAP-022
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunity(
  idOrSlug: string | undefined
): UseQueryResult<Community> & CommunityQueryMeta {
  const enabled = Boolean(idOrSlug) && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.community(idOrSlug ?? 'none'),
    queryFn: async ({ signal }) => {
      const community = await fetchCommunity(idOrSlug!, signal);
      void mergeCommunityMetadata([community]);
      return community;
    },
    enabled,
    // A suspended or archived community is cached briefly so a reinstatement
    // recovers without a restart (§75).
    staleTime: (query) => {
      const status = (query.state.data as Community | undefined)?.status;
      return status === 'Suspended' || status === 'Archived' ? 60_000 : 5 * 60_000;
    },
    retry: 1,
  });

  const meta = gapMeta(result);
  const lifecycle = communityUnavailableReason(result.data);

  return {
    ...result,
    isSimulated: meta.isSimulated,
    unavailable: meta.unavailable ?? (result.data ? lifecycle : result.isLoading ? null : 'not-found'),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — GAP-003, GAP-004, GAP-005
// ═════════════════════════════════════════════════════════════════════════════

/** The empty set. Used when membership cannot be read, so callers need no null. */
const EMPTY_MEMBERSHIP_SET: CommunityMembershipSet = {
  memberships: [],
  primaryCommunityId: null,
  fetchedAt: null,
};

export function useMembershipSet(): UseQueryResult<CommunityMembershipSet> & CommunityQueryMeta {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enabled = isAuthenticated && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.memberships(),
    queryFn: ({ signal }) => fetchMembershipSet(signal),
    enabled,
    // Short: the membership set is the input to scope resolution, and a stale set
    // is a wrong scope. Also the bound on how long a revoked role stays effective
    // until GAP-025's realtime channel exists.
    staleTime: 60_000,
    retry: 1,
  });

  const meta = gapMeta(result);

  return {
    ...result,
    isSimulated: meta.isSimulated,
    unavailable: !isAuthenticated
      ? 'unauthorized'
      : !areMultiCommunityGapsEnabled()
        ? 'membership-unavailable'
        : meta.unavailable,
  };
}

export function useCommunityCapabilities(
  communityId: CommunityId | undefined
): UseQueryResult<CommunityCapabilities> & CommunityQueryMeta {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enabled = Boolean(communityId) && isAuthenticated && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.capabilities(communityId ?? 'none'),
    queryFn: ({ signal }) => fetchCapabilities(communityId!, signal),
    enabled,
    // Deliberately short. A revoked capability must stop being effective quickly,
    // and until GAP-025 lands this staleTime *is* the exposure window.
    staleTime: 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

/**
 * A membership transition — §33.
 *
 * §61's invalidation, as one named function rather than a list each screen
 * remembers. Never `queryClient.clear()`: clearing the whole cache on a join
 * would throw away the map, the wallet and the inbox to refresh a badge.
 */
export function useMembershipAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { communityId: CommunityId; action: CommunityMembershipAction }) =>
      performMembershipAction(input.communityId, input.action),

    onSuccess: (_membership, input) => {
      invalidateForMembershipChange(queryClient, input.communityId);

      const event =
        input.action === 'join'
          ? 'community.joined'
          : input.action === 'leave'
            ? 'community.left'
            : input.action === 'follow'
              ? 'community.followed'
              : input.action === 'unfollow'
                ? 'community.unfollowed'
                : input.action === 'express-interest'
                  ? 'community.interest.added'
                  : input.action === 'remove-interest'
                    ? 'community.interest.removed'
                    : input.action === 'cancel-application'
                      ? 'community.application.cancelled'
                      : 'community.viewed';

      trackCommunityEvent(event, { communityId: input.communityId });
    },
  });
}

export function useSetPrimaryCommunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (communityId: CommunityId | null) => setPrimaryCommunity(communityId),
    onSuccess: (_set, communityId) => {
      invalidateForMembershipChange(queryClient, communityId ?? undefined);
      trackCommunityEvent('community.primary.changed', {
        communityId: communityId ?? undefined,
      });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CONTEXT — §12
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §12's centralized abstraction, assembled from the store (client selection) and
 * the query cache (server truth).
 *
 * This is the hook nearly every screen uses, and it is the reason no component
 * needs to know how a scope is built. It also runs the §75 reconciliation as a
 * side effect, which is the one place that can — the store cannot, because it
 * deliberately does not hold the membership set.
 */
export interface CommunityContextValue {
  /** The community the member is looking at, where the mode names one. */
  activeCommunity: Community | CommunityRef | null;
  activeCommunityId: CommunityId | null;
  primaryCommunity: Community | CommunityRef | null;
  primaryMembership: CommunityMembership | null;
  interestedCommunityIds: CommunityId[];
  myCommunityIds: CommunityId[];
  /** The resolved scope. The value every query key and request derives from. */
  scope: CommunityScope;
  /** The scope projected onto the parameters certified routes accept. */
  projection: ScopeProjection;
  mode: CommunityScope['mode'];
  availableCommunities: CommunityRef[];
  membershipSet: CommunityMembershipSet;
  /** The membership for the active community, or null. */
  activeMembership: CommunityMembership | null;
  isHydrated: boolean;
  isLoading: boolean;
  isSimulated: boolean;
  isOffline: boolean;
  /** ISO of the persisted selection, for the offline "saved on" line. */
  hydratedFrom: string | null;
  /** True when the member belongs to, follows or is interested in nothing (§71). */
  hasNoCommunities: boolean;
}

export function useCommunityContext(): CommunityContextValue {
  const store = useCommunityContextStore();
  const selection = useCommunityContextStore(selectCommunityFilterSelection);

  const { refs, lookup, isLoading: communitiesLoading, isOffline } = useAvailableCommunities();
  const membership = useMembershipSet();

  const membershipSet = membership.data ?? EMPTY_MEMBERSHIP_SET;

  useEffect(() => {
    void store.hydrate();
    // The store guards against a second hydrate, so an empty dependency list is
    // correct rather than merely convenient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryMembership = useMemo(
    () => resolvePrimaryMembership(membershipSet),
    [membershipSet]
  );

  const scope = useMemo(
    () => (store.isHydrated ? resolveScope(selection, membershipSet) : ALL_COMMUNITIES_SCOPE),
    [membershipSet, selection, store.isHydrated]
  );

  const projection = useMemo(() => projectScope(scope, lookup), [lookup, scope]);

  const availableIds = useMemo(
    () =>
      canonicalCommunityIds([
        ...refs.map((ref) => ref.id),
        ...membershipSet.memberships.map((m) => m.communityId),
      ]),
    [membershipSet.memberships, refs]
  );

  // §75's fallback chain. Runs when the available set or the primary changes, not
  // on every render — an unconditional call would fight the member's selection.
  useEffect(() => {
    if (!store.isHydrated) return;
    store.reconcile({
      availableIds,
      primaryId: primaryMembership?.communityId ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join('|'), primaryMembership?.communityId, store.isHydrated]);

  const activeMembership = useMemo(
    () =>
      store.activeCommunityId
        ? (membershipSet.memberships.find((m) => m.communityId === store.activeCommunityId) ?? null)
        : null,
    [membershipSet.memberships, store.activeCommunityId]
  );

  return {
    activeCommunity: store.activeCommunityId ? (lookup(store.activeCommunityId) ?? null) : null,
    activeCommunityId: store.activeCommunityId,
    primaryCommunity: primaryMembership ? (lookup(primaryMembership.communityId) ?? null) : null,
    primaryMembership,
    interestedCommunityIds: resolveInterestedCommunityIds(membershipSet),
    myCommunityIds: resolveMyCommunityIds(membershipSet),
    scope,
    projection,
    mode: store.mode,
    availableCommunities: refs,
    membershipSet,
    activeMembership,
    isHydrated: store.isHydrated,
    isLoading: communitiesLoading || membership.isLoading,
    isSimulated: areMultiCommunityGapsEnabled(),
    isOffline,
    hydratedFrom: store.hydratedFrom,
    hasNoCommunities: membershipSet.memberships.length === 0,
  };
}

/**
 * The scope alone, for the many screens that need only that.
 *
 * A thin wrapper rather than a second implementation, so there is exactly one
 * place a scope is resolved.
 */
export function useCommunityScope(): {
  scope: CommunityScope;
  projection: ScopeProjection;
  token: string;
  isEmpty: boolean;
  unexpressedNames: string[];
} {
  const context = useCommunityContext();

  return {
    scope: context.scope,
    projection: context.projection,
    token: context.projection.scope.communityIds.join('|'),
    isEmpty: isEmptyScope(context.scope),
    unexpressedNames: context.projection.unexpressed.map((ref) => ref.name),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SCOPED CONTENT — GAP-009, over CERTIFIED routes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Community-scoped content from a certified route.
 *
 * The one hook every scoped list uses. Note the `enabled` condition: an empty
 * scope does **not** fetch. A member in `INTERESTED_COMMUNITIES` mode with no
 * interests sees "you have not followed any communities yet" — not the whole
 * platform, and not a spinner.
 */
export function useScopedContent<T>(
  domain: CommunityContentDomain,
  params: CertifiedContentParams,
  options: { enabled?: boolean } = {}
): UseQueryResult<CommunityScopedResult<T>> & { isApproximate: boolean; scopeIsEmpty: boolean } {
  const { scope, projection, unexpressedNames } = useCommunityScope();
  const scopeIsEmpty = isEmptyScope(scope);

  const filters = useMemo(
    () => ({
      query: params.query || undefined,
      category: params.category || undefined,
      cityName: params.cityName || undefined,
      lat: params.latitude !== undefined ? Number(params.latitude.toFixed(3)) : undefined,
      lon: params.longitude !== undefined ? Number(params.longitude.toFixed(3)) : undefined,
      radiusKm: params.radiusKm,
      distanceKm: params.distanceKm,
      sortBy: params.sortBy || undefined,
      ...(params.extra ?? {}),
    }),
    [params]
  );

  const result = useQuery({
    queryKey: communityScopedKeys.content(domain, scope, filters),
    queryFn: ({ signal }) =>
      fetchScopedContent<T>(domain, params, projection, { signal, unexpressedNames }),
    // An empty scope has nothing to ask for, and asking anyway would return the
    // unscoped platform — the leak §42 warns about, arriving through the front
    // door.
    enabled: (options.enabled ?? true) && !scopeIsEmpty,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    isApproximate: result.data?.isApproximate ?? projection.isApproximate,
    scopeIsEmpty,
  };
}

/**
 * Narrows an in-memory collection to the active scope.
 *
 * For the guide directory and the update feed, which hold their content in the
 * app rather than behind a list route. Uses the identical projection, so a guide
 * card and a job card never disagree about which community they belong to.
 */
export function useScopedCollection<T>(
  domain: CommunityContentDomain,
  items: readonly T[]
): CommunityScopedResult<T> {
  const { projection, unexpressedNames } = useCommunityScope();

  return useMemo(
    () => narrowToScope(domain, items, projection, unexpressedNames),
    [domain, items, projection, unexpressedNames]
  );
}

/** Community-scoped platform search — GAP-010, over the existing search route. */
export function useScopedSearch(input: { query?: string; city?: string; enabled?: boolean }) {
  const { scope, projection, unexpressedNames } = useCommunityScope();
  const scopeIsEmpty = isEmptyScope(scope);

  const result = useQuery({
    queryKey: communityScopedKeys.search(input.query ?? '', scope, { city: input.city }),
    queryFn: ({ signal }) =>
      searchScoped({ query: input.query, city: input.city }, projection, {
        signal,
        unexpressedNames,
      }),
    enabled: (input.enabled ?? true) && !scopeIsEmpty && Boolean(input.query || input.city),
    staleTime: 30_000,
    retry: 1,
  });

  return { ...result, scopeIsEmpty, isApproximate: projection.isApproximate };
}

// ═════════════════════════════════════════════════════════════════════════════
// STATISTICS — GAP-007, GAP-008
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityStatistics(
  communityId: CommunityId | undefined,
  period: StatisticsPeriod = '30d'
): UseQueryResult<CommunityStatistics> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled =
    Boolean(communityId) && flags.communityStatisticsEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.statistics(communityId ?? 'none', period),
    queryFn: ({ signal }) => fetchCommunityStatistics(communityId!, period, signal),
    enabled,
    // A statistic that changes minute to minute is not a statistic.
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const meta = gapMeta(result);

  return {
    ...result,
    isSimulated: meta.isSimulated,
    unavailable: !flags.communityStatisticsEnabled
      ? 'feature-disabled'
      : result.isError
        ? 'statistics-unavailable'
        : meta.unavailable,
  };
}

export function useCommunityComparison(
  communityIds: readonly CommunityId[],
  period: StatisticsPeriod = '30d'
): UseQueryResult<CommunityComparison> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const ids = canonicalCommunityIds(communityIds);
  const enabled = ids.length >= 2 && flags.communityComparisonEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.comparison(ids, period),
    queryFn: ({ signal }) => fetchCommunityComparison(ids, period, signal),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE — GAP-016, GAP-017, GAP-018, GAP-019
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityRules(
  communityId: CommunityId | undefined
): UseQueryResult<CommunityRule[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled =
    Boolean(communityId) && flags.communityGovernanceEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.rules(communityId ?? 'none'),
    queryFn: ({ signal }) => fetchCommunityRules(communityId!, signal),
    enabled,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

export function useCommunityNotices(
  communityId: CommunityId | undefined,
  options: { includeExpired?: boolean } = {}
): UseQueryResult<CommunityNotice[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled =
    Boolean(communityId) && flags.communityGovernanceEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: [
      ...communityDirectoryGapKeys.notices(communityId ?? 'none'),
      options.includeExpired ?? false,
    ],
    queryFn: ({ signal }) => fetchCommunityNotices(communityId!, options, signal),
    enabled,
    // A pinned notice is often the reason a member opened the community.
    staleTime: 2 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

export function useCommunityRoleHolders(
  communityId: CommunityId | undefined,
  role?: CommunityRole
): UseQueryResult<CommunityRoleHolder[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const roleEnabled =
    role === 'Ambassador'
      ? flags.communityAmbassadorsEnabled
      : role === 'Moderator'
        ? flags.communityModeratorsEnabled
        : true;
  const enabled = Boolean(communityId) && roleEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.roles(communityId ?? 'none', role),
    queryFn: ({ signal }) => fetchCommunityRoleHolders(communityId!, role, signal),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

export function useCommunityInitiatives(
  communityId: CommunityId | undefined
): UseQueryResult<CommunityInitiative[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled =
    Boolean(communityId) && flags.communityAmbassadorsEnabled && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.initiatives(communityId ?? 'none'),
    queryFn: ({ signal }) => fetchCommunityInitiatives(communityId!, signal),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return { ...result, ...gapMeta(result) };
}

/**
 * The moderation queue — GAP-017.
 *
 * Gated on the **server-reported** capability, not on a role. The query does not
 * run without it, so a member without the capability never even issues the
 * request — which is both the right UX and one fewer 403 in the logs.
 */
export function useCommunityReports(
  communityId: CommunityId | undefined,
  status?: CommunityReportStatus
): UseQueryResult<CommunityReport[]> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const capabilities = useCommunityCapabilities(communityId);
  const allowed = capabilities.data?.canViewModerationQueue === true;

  const enabled =
    Boolean(communityId) &&
    allowed &&
    flags.communityModeratorsEnabled &&
    areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.reports(communityId ?? 'none', status),
    queryFn: ({ signal }) => fetchCommunityReports(communityId!, status, signal),
    enabled,
    // Zero, and refetch on focus. A moderation queue is the one surface where a
    // stale answer means two moderators action the same report.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const meta = gapMeta(result);

  return {
    ...result,
    isSimulated: meta.isSimulated,
    unavailable: !allowed && !capabilities.isLoading ? 'forbidden' : meta.unavailable,
  };
}

export function useModerationDecision(communityId: CommunityId | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { reportId: string; decision: CommunityModerationDecision; note?: string }) =>
      decideCommunityReport(communityId!, input.reportId, input.decision, input.note),

    onSuccess: (_report, input) => {
      if (communityId) {
        void queryClient.invalidateQueries({
          queryKey: ['community-directory-gap', 'reports', communityId],
        });
      }
      trackCommunityEvent('community.moderation.decided', {
        communityId,
        result: input.decision,
      });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PREFERENCES — GAP-012, GAP-021
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunityPreferences(): UseQueryResult<CommunityPreferences> &
  CommunityQueryMeta {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enabled = isAuthenticated && areMultiCommunityGapsEnabled();

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.preferences(),
    queryFn: ({ signal }) => fetchCommunityPreferences(signal),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
    // Off-by-default for every visibility flag, so a member who never opened the
    // screen has published nothing (§41).
    placeholderData: defaultCommunityPreferences(),
  });

  return { ...result, ...gapMeta(result) };
}

export function useSaveCommunityPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: CommunityPreferences) => saveCommunityPreferences(preferences),
    onSuccess: (saved) => {
      queryClient.setQueryData(communityDirectoryGapKeys.preferences(), saved);
      // A visibility change alters what recommendations and notifications may
      // consider, so the scoped surfaces are refetched rather than left.
      void queryClient.invalidateQueries({ queryKey: ['community-directory', 'content'] });
      trackCommunityEvent('community.preferences.updated');
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// INVALIDATION — §61
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §61's invalidation set for a membership change, as one function.
 *
 * Everything listed, and **nothing else**. `queryClient.clear()` would be one
 * line and would throw away the map tiles, the wallet, the inbox and every
 * certified list in the app to refresh a badge — which §61 forbids in as many
 * words.
 *
 * The statistics are deliberately *not* invalidated: one member joining does not
 * move a published aggregate, and refetching every community's statistics on
 * every join would be the "unnecessary refetching" §60 names.
 */
export function invalidateForMembershipChange(
  queryClient: QueryClient,
  communityId?: CommunityId
): void {
  // The membership set drives scope resolution, so it goes first.
  void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.memberships() });

  // The directory shows membership state per row.
  void queryClient.invalidateQueries({ queryKey: ['community-directory-gap', 'directory'] });
  void queryClient.invalidateQueries({ queryKey: ['community-directory-gap', 'suggestions'] });

  if (communityId) {
    void queryClient.invalidateQueries({
      queryKey: communityDirectoryGapKeys.community(communityId),
    });
    void queryClient.invalidateQueries({
      queryKey: communityDirectoryGapKeys.capabilities(communityId),
    });
  }

  // Community-scoped content and search: the scope may now resolve differently.
  void queryClient.invalidateQueries({ queryKey: ['community-directory', 'content'] });
  void queryClient.invalidateQueries({ queryKey: ['community-directory', 'search'] });

  // §47: community-sensitive recommendations must not survive a membership
  // change. The existing engine surface, invalidated — not a second one.
  void queryClient.invalidateQueries({ queryKey: ['explore', 'recommendations'] });
}

/**
 * §46/§61's invalidation for a community *switch*.
 *
 * Narrower than a membership change: nothing about the member changed, only what
 * they are looking at. The scope token already isolates the caches, so this
 * exists for the surfaces that hold a *derived* view — the map's current
 * viewport results and the recommendation rails — rather than to purge anything.
 */
export function invalidateForCommunitySwitch(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['explore', 'recommendations'] });
  // Phase 8's map search key hashes its filter object, which now carries the
  // scope. Invalidating the family drops the previous scope's markers rather than
  // leaving them to be replaced one refetch later (§46).
  void queryClient.invalidateQueries({ queryKey: ['maps', 'search'] });
}

/**
 * The realtime handlers — GAP-025.
 *
 * There is no channel to subscribe to yet, so these are the functions a channel
 * would call, wired to the right invalidations and unit-testable against
 * synthetic events. No second transport is opened: §42 and Phase 8's GAP-018 both
 * forbid it, and when the platform channel gains community events this becomes a
 * subscription rather than a rewrite.
 */
export function useCommunityRealtimeHandlers(): {
  onMembershipChanged: (communityId: CommunityId) => void;
  onRoleChanged: (communityId: CommunityId) => void;
  onStatusChanged: (communityId: CommunityId) => void;
} {
  const queryClient = useQueryClient();

  return {
    onMembershipChanged: useCallback(
      (communityId: CommunityId) => invalidateForMembershipChange(queryClient, communityId),
      [queryClient]
    ),

    onRoleChanged: useCallback(
      (communityId: CommunityId) => {
        // The capability set is the only thing a role change alters that the UI
        // reads. Invalidating it is what removes a revoked moderator's queue.
        void queryClient.invalidateQueries({
          queryKey: communityDirectoryGapKeys.capabilities(communityId),
        });
        void queryClient.invalidateQueries({
          queryKey: ['community-directory-gap', 'roles', communityId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['community-directory-gap', 'reports', communityId],
        });
      },
      [queryClient]
    ),

    onStatusChanged: useCallback(
      (communityId: CommunityId) => {
        void queryClient.invalidateQueries({
          queryKey: communityDirectoryGapKeys.community(communityId),
        });
        void queryClient.invalidateQueries({ queryKey: ['community-directory-gap', 'directory'] });
      },
      [queryClient]
    ),
  };
}

/** The gap register, for the register screen. Ordered by identifier. */
export function useMultiCommunityGaps() {
  return useMemo(
    () => ({
      gaps: Object.values(MULTI_COMMUNITY_GAPS).sort((a, b) => a.id.localeCompare(b.id)),
      isEnabled: areMultiCommunityGapsEnabled(),
      flags: getCommunityFeatureFlags(),
    }),
    []
  );
}
