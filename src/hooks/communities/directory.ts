// Communities hooks: directory. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  Community,
  CommunityCapabilities,
  CommunityComparison,
  CommunityDirectoryEntry,
  CommunityDirectoryPage,
  CommunityDirectoryQuery,
  CommunityId,
  CommunityRef,
  CommunityStatistics,
  StatisticsPeriod,
} from '@/types/community-directory';
import {
  MULTI_COMMUNITY_GAPS,
  areMultiCommunityGapsEnabled,
  getCommunityFeatureFlags,
} from '@/config/multi-community-gaps';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
import {
  fetchCapabilities,
  fetchCommunity,
  fetchCommunityComparison,
  fetchCommunityDirectory,
  fetchCommunityStatistics,
  fetchCommunitySuggestionsReal,
} from '@/lib/api/community-entity-api';
import { communityScopedKeys } from '@/lib/api/community-directory-api';
import { canonicalCommunityIds, toRef } from '@/lib/community/scope';
import { communityUnavailableReason } from '@/lib/community/access';
import { mergeCommunityMetadata, readCommunityMetadata } from '@/lib/community/persistence';
import { useConnectivityStore } from '@/lib/platform/connectivity';
import { useAuthStore } from '@/store/auth';
import { realMeta } from './shared';
import type { CommunityQueryMeta } from './shared';

/** How many communities the switcher and the projection lookup hold at once. */
const LOOKUP_LIMIT = 250;

export function useCommunityDirectory(
  query: CommunityDirectoryQuery = {}
): UseQueryResult<CommunityDirectoryPage> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();

  // The product switch only. The route is real; see `realMeta`.
  const enabled = flags.multiCommunityEnabled;

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

  return { ...result, ...realMeta(result) };
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
 * Falls back to the persisted metadata when the directory query cannot run —
 * offline, or before it has answered — so a community badge still renders a name
 * rather than an id. (This used to list "a release build" first. That was true
 * only because of a preview-flag gate left on a real route; see `realMeta`.)
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
    queryKey: communityScopedKeys.metadataCache(),
    queryFn: () => readCommunityMetadata(),
    staleTime: 60_000,
  });

  const communities = useMemo(
    // `?.` guards the response, not the array inside it — see `lib/community/scope.ts`.
    () => (directory.data?.items ?? []).map((entry) => entry.community),
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
  // Real since 21 Oct 2026 (`GET /recommendations/communities`), so not gated on
  // the simulation flag.
  const enabled = flags.communityOnboardingEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.suggestions(presenceCountryCode),
    queryFn: ({ signal }) => fetchCommunitySuggestionsReal(presenceCountryCode, signal),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return { ...result, ...realMeta(result) };
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE — GAP-002, GAP-022
// ═════════════════════════════════════════════════════════════════════════════

export function useCommunity(
  idOrSlug: string | undefined
): UseQueryResult<Community> & CommunityQueryMeta {
  const enabled = Boolean(idOrSlug);

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

  const meta = realMeta(result);
  const lifecycle = communityUnavailableReason(result.data);

  return {
    ...result,
    isSimulated: meta.isSimulated,
    unavailable: meta.unavailable ?? (result.data ? lifecycle : result.isLoading ? null : 'not-found'),
  };
}

export function useCommunityCapabilities(
  communityId: CommunityId | undefined
): UseQueryResult<CommunityCapabilities> & CommunityQueryMeta {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enabled = Boolean(communityId) && isAuthenticated;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.capabilities(communityId ?? 'none'),
    queryFn: ({ signal }) => fetchCapabilities(communityId!, signal),
    enabled,
    // Deliberately short. A revoked capability must stop being effective quickly,
    // and until GAP-025 lands this staleTime *is* the exposure window.
    staleTime: 60_000,
    retry: 1,
  });

  return { ...result, ...realMeta(result) };
}

// ═════════════════════════════════════════════════════════════════════════════
// STATISTICS — GAP-007, GAP-008
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A community's figures — real since 20 Oct 2026 (`GET /communities/{id}/statistics`).
 *
 * Gated on the product flag only, never on the gap switch: the route is real,
 * and the gap switch is false in every `production` build. Figures the server
 * cannot count arrive in `unavailableMetrics` and are rendered as such.
 */
export function useCommunityStatistics(
  communityId: CommunityId | undefined,
  period: StatisticsPeriod = '30d'
): UseQueryResult<CommunityStatistics> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const enabled = Boolean(communityId) && flags.communityStatisticsEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.statistics(communityId ?? 'none', period),
    queryFn: ({ signal }) => fetchCommunityStatistics(communityId!, period, signal),
    enabled,
    // A statistic that changes minute to minute is not a statistic.
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    isSimulated: false,
    unavailable: !flags.communityStatisticsEnabled
      ? 'feature-disabled'
      : result.isError
        ? 'statistics-unavailable'
        : null,
  };
}

export function useCommunityComparison(
  communityIds: readonly CommunityId[],
  period: StatisticsPeriod = '30d'
): UseQueryResult<CommunityComparison> & CommunityQueryMeta {
  const flags = getCommunityFeatureFlags();
  const ids = canonicalCommunityIds(communityIds);
  // The server compares two to four. Asking with five is a 400, not a comparison.
  const enabled = ids.length >= 2 && ids.length <= 4 && flags.communityComparisonEnabled;

  const result = useQuery({
    queryKey: communityDirectoryGapKeys.comparison(ids, period),
    queryFn: ({ signal }) => fetchCommunityComparison(ids, period, signal),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  return {
    ...result,
    ...realMeta(result),
    unavailable: !flags.communityComparisonEnabled ? 'feature-disabled' : realMeta(result).unavailable,
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
