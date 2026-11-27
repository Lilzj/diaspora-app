// Communities hooks: context. ./index.ts is the overview of the whole module.

import { useCallback, useEffect, useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Community,
  CommunityFilterSelection,
  CommunityId,
  CommunityMembership,
  CommunityMembershipSet,
  CommunityRef,
  CommunityScope,
} from '@/types/community-directory';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
import { mapKeys } from '@/lib/api/maps-api';
import {
  communityScopedKeys,
  fetchScopedContent,
  narrowToScope,
  searchScoped,
  type CertifiedContentParams,
  type CommunityContentDomain,
  type CommunityScopedResult,
} from '@/lib/api/community-directory-api';
import {
  ALL_COMMUNITIES_SCOPE,
  canonicalCommunityIds,
  isEmptyScope,
  projectScope,
  resolveInterestedCommunityIds,
  resolveMyCommunityIds,
  resolvePrimaryMembership,
  resolveScope,
  type ScopeProjection,
} from '@/lib/community/scope';
// `selectCommunityFilterSelection` is deliberately **not** imported here.
// It allocates, so passing it to `useCommunityContextStore` is an infinite
// render loop under Zustand v5 — see the comment in `useCommunityContext`.
// It remains exported for callers that read a one-off snapshot through
// `getState()`, where allocation is harmless.
import { useCommunityContextStore } from '@/store/community-context';
import { useAvailableCommunities } from './directory';
import { invalidateForMembershipChange, useMembershipSet } from './membership';

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — GAP-003, GAP-004, GAP-005
// ═════════════════════════════════════════════════════════════════════════════

/** The empty set. Used when membership cannot be read, so callers need no null. */
const EMPTY_MEMBERSHIP_SET: CommunityMembershipSet = {
  memberships: [],
  primaryCommunityId: null,
  fetchedAt: null,
};

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

  // ── Why this is three primitive reads and a `useMemo`, and not one selector ──
  //
  // It used to be `useCommunityContextStore(selectCommunityFilterSelection)`,
  // and that was an **infinite render loop**.
  //
  // `selectCommunityFilterSelection` builds a fresh object — and for
  // `SELECTED_COMMUNITY` a fresh array — on every call. Zustand v5 subscribes
  // through `useSyncExternalStore`, which compares snapshots by **reference**
  // and has no built-in shallow equality (v4's automatic shallow compare was
  // removed). So every render produced a new snapshot, React re-rendered to
  // catch up, and that produced another one: React logged "The result of
  // getSnapshot should be cached to avoid an infinite loop" and then threw
  // "Maximum update depth exceeded".
  //
  // The symptom was a blank screen immediately after signing in, because
  // `(tabs)/index.tsx` renders `<CommunitySelectorSheet>`, which calls this
  // hook. It was latent for several phases — the warning was present and the
  // loop was not always reached — which is exactly why the fix is structural
  // rather than a `useShallow`.
  //
  // `useShallow` would **not** be enough on its own: it compares one level
  // deep, and `communityIds: [state.activeCommunityId]` is a new array every
  // call, so the outer shallow compare still fails. The reliable fix is to
  // subscribe to values that are already stable — two primitives and the
  // store's own array reference — and derive the object here, where `useMemo`
  // can hold it.
  const mode = useCommunityContextStore((state) => state.mode);
  const activeCommunityId = useCommunityContextStore((state) => state.activeCommunityId);
  const selectedCommunityIds = useCommunityContextStore((state) => state.selectedCommunityIds);

  const selection = useMemo<CommunityFilterSelection>(() => {
    switch (mode) {
      case 'SELECTED_COMMUNITY':
        return {
          mode: 'SELECTED_COMMUNITY',
          communityIds: activeCommunityId ? [activeCommunityId] : [],
        };
      case 'CROSS_COMMUNITY':
        return { mode: 'CROSS_COMMUNITY', communityIds: selectedCommunityIds };
      default:
        return { mode };
    }
  }, [mode, activeCommunityId, selectedCommunityIds]);

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
    // Built from the membership set and the directory, both real. Reporting the
    // preview flag here labelled a real context simulated in every dev build.
    isSimulated: false,
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
    // Wave J: prefer the *result's* verdict over the projection's.
    //
    // `projection.isApproximate` says "a country projection is standing in for a
    // community filter". The result knows something the projection cannot: it
    // has seen the page, and if no row on it carried an origin country then no
    // filter was applied and there is nothing to be approximate about. Falling
    // back to the projection's `true` in that case would claim an approximate
    // narrowing over a list that was not narrowed.
    isApproximate: result.data?.isApproximate ?? projection.isApproximate,
    scopeIsEmpty,
  };
}

/**
 * Community-scoped content, page after page — for a list with "Show more".
 *
 * `useScopedContent` reads one server page, by design: following cursors until
 * the projection has enough matches is unbounded. A member tapping "Show more"
 * asks for exactly one more page per tap, which is bounded, so Discover's Jobs
 * tab uses this and shows the next server page's matches on request. Each page
 * is narrowed on its own, as the single-page read is, and appended in order.
 */
export function useScopedContentPages<T>(
  domain: CommunityContentDomain,
  params: Omit<CertifiedContentParams, 'cursor'>,
  options: { enabled?: boolean } = {}
): {
  items: T[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadMoreFailed: boolean;
  loadMore: () => void;
  isApproximate: boolean;
  scopeIsEmpty: boolean;
} {
  const { scope, projection, unexpressedNames } = useCommunityScope();
  const scopeIsEmpty = isEmptyScope(scope);

  const query = useInfiniteQuery({
    queryKey: [...communityScopedKeys.content(domain, scope, { ...params, paged: true })],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchScopedContent<T>(domain, { ...params, cursor: pageParam ?? undefined }, projection, {
        signal,
        unexpressedNames,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    // An empty scope has nothing to ask for; see `useScopedContent`.
    enabled: (options.enabled ?? true) && !scopeIsEmpty,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.items), [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    // A failed first page is a failed list; a failed later page keeps what is
    // shown and is reported on the button.
    isError: query.isError && !query.data,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isApproximate: query.data?.pages[0]?.isApproximate ?? projection.isApproximate,
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
  void queryClient.invalidateQueries({ queryKey: mapKeys.searchAll() });
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
          queryKey: communityDirectoryGapKeys.rolesAll(communityId),
        });
        void queryClient.invalidateQueries({
          queryKey: communityDirectoryGapKeys.reportsAll(communityId),
        });
      },
      [queryClient]
    ),

    onStatusChanged: useCallback(
      (communityId: CommunityId) => {
        void queryClient.invalidateQueries({
          queryKey: communityDirectoryGapKeys.community(communityId),
        });
        void queryClient.invalidateQueries({ queryKey: communityDirectoryGapKeys.directoryAll() });
      },
      [queryClient]
    ),
  };
}
