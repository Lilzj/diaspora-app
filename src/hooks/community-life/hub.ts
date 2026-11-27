// Community Life hooks: hub. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { organizationSearchResult } from '@/lib/domain/organization-summary';
import { communityGapKeys } from '@/lib/api/community-gap-api';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import * as b12 from '@/lib/api/community-life-api';
import { communityLifeKeys } from '@/lib/api/community-life-api';
import { areCommunityGapsEnabled } from '@/config/community-gaps';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { resolveCommunityAccess, type CommunityAccess } from '@/lib/domain/community-access';
import { useAuthStore } from '@/store/auth';
import type {
  AnalyticsPeriod,
  CommunityEntityType,
  CommunityRecommendation,
  CommunitySearchParams,
  CommunitySearchResult,
} from '@/types/community-advanced';
import {
  composeCommunityLifeSummary,
  hasAnyHubRail,
  hubDismissInput,
  HUB_AREA_RADIUS_KM,
  HUB_NEARBY_RADIUS_KM,
  HUB_PAGE_SIZE,
  HUB_RAIL_LIMITS,
  toHubRecommendations,
} from '@/lib/domain/community-life-hub';
import {
  fetchCommunityRecommendationPage,
  recommendationKeys,
  recordDismiss,
} from '@/lib/api/recommendations-api';
import {
  ANALYTICS_STALE_MS,
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  fingerprint,
  mutationOptions,
  readOptions,
} from './shared';

/** Whether this build can reach the community development adapter at all. */
export function useCommunityGapsEnabled(): boolean {
  return areCommunityGapsEnabled();
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The community capability set.
 *
 * Advisory throughout — it decides what to *draw*. Every action is re-decided
 * by the server, and the organization-level half of the answer comes from
 * `useOrganizationCapabilities`, which fetches rather than computes.
 */
export function useCommunityAccess(): CommunityAccess {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  return useMemo(
    () => resolveCommunityAccess(accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CommunityLifeRepository — the hub, search and recommendations
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The hub's first paint, composed from real reads (20 Oct 2026).
 *
 * The aggregate this used to ask for (`/hub/summary`, COMMUNITY-LIFE-GAP-030)
 * was never served, so outside a simulation build the hub had no rails and no
 * counts. Every part of it is served, so the parts are read here — in parallel,
 * each a short first page — and `composeCommunityLifeSummary` assembles the
 * summary from whatever has answered. A part that fails leaves its rail out and
 * its count `null`; it does not blank the page or the other rails.
 *
 * Keys live under `community-life` and `community-programme` (`'hub'` beneath
 * each) so sign-out's `clearCommunityCache` takes them, and so they never share
 * an entry with the infinite list queries the destination screens use — one key
 * holding two shapes is a crash.
 */
export function useCommunityLifeSummary(params: {
  countryCode?: string;
  cityName?: string;
  latitude?: number;
  longitude?: number;
} = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const countryCode = params.countryCode || undefined;
  const cityName = params.cityName || undefined;
  const point =
    typeof params.latitude === 'number' &&
    typeof params.longitude === 'number' &&
    Number.isFinite(params.latitude) &&
    Number.isFinite(params.longitude)
      ? { latitude: params.latitude, longitude: params.longitude }
      : null;
  const pointKey = point ? `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}` : 'none';

  const upcomingEvents = useQuery({
    // Upcoming is the route's own default: `IncludePast` is false, so nothing that
    // has ended is returned (CommunityEventRepository.cs:582-586).
    queryKey: communityLifeKeys.hubUpcoming(countryCode),
    queryFn: () =>
      b12.fetchEvents({ countryCode, sortBy: 'date', limit: HUB_PAGE_SIZE }),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  // Around the member's point where there is one; otherwise in their town.
  const hasPlace = Boolean(point || cityName);
  const nearbyEvents = useQuery({
    queryKey: communityLifeKeys.hubNearby(pointKey, point ? 'point' : cityName ?? 'none'),
    queryFn: () =>
      b12.fetchEvents(
        point
          ? { ...point, radiusKm: HUB_NEARBY_RADIUS_KM, limit: HUB_RAIL_LIMITS.events }
          : { cityName, limit: HUB_RAIL_LIMITS.events }
      ),
    enabled: hasPlace,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const myMemberships = useQuery({
    queryKey: communityProgrammeKeys.myMemberships(),
    queryFn: b18.fetchMyMemberships,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  const myOrganizations = useQuery({
    queryKey: communityProgrammeKeys.myOrganizations(),
    queryFn: b18.fetchMyOrganizations,
    enabled: isAuthenticated,
    ...readOptions,
  });

  const campaigns = useQuery({
    queryKey: communityProgrammeKeys.hubCampaigns(countryCode),
    queryFn: () => b18.fetchCampaigns({ countryCode, take: HUB_PAGE_SIZE }),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const opportunities = useQuery({
    queryKey: communityProgrammeKeys.hubOpportunities(cityName),
    queryFn: () => b18.fetchOpportunities({ cityName, state: 'Published', take: HUB_PAGE_SIZE }),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const polls = useQuery({
    queryKey: communityProgrammeKeys.hubPolls(),
    queryFn: () => b18.fetchPolls({ state: 'Open', take: HUB_PAGE_SIZE }),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const announcements = useQuery({
    queryKey: communityProgrammeKeys.hubAnnouncements(),
    queryFn: () => b18.fetchAnnouncements({ take: HUB_RAIL_LIMITS.announcements }),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const areaActivity = useQuery({
    queryKey: communityLifeKeys.hubArea(pointKey),
    queryFn: () => b12.fetchAreaActivity({ ...point!, radiusKm: HUB_AREA_RADIUS_KM }),
    enabled: point !== null,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const recommendations = useQuery({
    queryKey: [...recommendationKeys.communities(countryCode), 'hub'],
    queryFn: ({ signal }) =>
      fetchCommunityRecommendationPage(
        { country: countryCode, limit: HUB_RAIL_LIMITS.recommendations },
        signal
      ).then(toHubRecommendations),
    // Recommendations answer a signed-out caller with a bare 401.
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  const queries = [
    upcomingEvents,
    nearbyEvents,
    myMemberships,
    myOrganizations,
    campaigns,
    opportunities,
    polls,
    announcements,
    areaActivity,
    recommendations,
  ];

  const summary = useMemo(
    () =>
      composeCommunityLifeSummary({
        upcomingEvents: upcomingEvents.data
          ? { items: upcomingEvents.data.items, totalCount: upcomingEvents.data.totalCount }
          : undefined,
        nearbyEvents: nearbyEvents.data?.items,
        myMemberships: myMemberships.data,
        myOrganizations: myOrganizations.data,
        campaigns: campaigns.data,
        opportunities: opportunities.data,
        polls: polls.data,
        announcements: announcements.data,
        areaActivity: areaActivity.data,
        recommendations: recommendations.data,
      }),
    [
      upcomingEvents.data,
      nearbyEvents.data,
      myMemberships.data,
      myOrganizations.data,
      campaigns.data,
      opportunities.data,
      polls.data,
      announcements.data,
      areaActivity.data,
      recommendations.data,
    ]
  );

  const isLoading = queries.some((query) => query.isLoading);
  // Every part failed: nothing on the page came from the platform. One failure
  // among ten is a missing rail, not an error state.
  const failed = queries.filter((query) => query.isError);
  const isError = failed.length > 0 && queries.every((query) => query.isError || !query.isFetched);

  // Only the parts that have run: a disabled part (signed out, no point) stays
  // disabled rather than being forced by a pull-to-refresh.
  const refetch = async () => {
    await Promise.all(
      queries.filter((query) => query.isFetched || query.isError).map((query) => query.refetch())
    );
  };

  return {
    summary,
    /** Whether any rail has something to draw. The destination tiles always do. */
    hasRails: hasAnyHubRail(summary),
    /** True while any part is on its first read. The page renders regardless. */
    isLoading,
    isError,
    error: ((failed[0]?.error as FinancialError | undefined) ?? null),
    refetch,
    /** Nothing on the hub is simulated any more. */
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * "Not interested" on a hub recommendation: `POST /recommendations/dismiss`.
 *
 * The body is the server's `RecordFeedbackRequest` — target type, target id,
 * surface, set id and position — taken from the page the card arrived on. It
 * used to post to the gap adapter's `/recommendations/{id}/dismiss`, which no
 * deployment serves for the Communities surface.
 *
 * The item is removed from the cached rail rather than refetched, for the reason
 * `hooks/recommendations.ts` gives: the server suppresses it for ninety days
 * but keeps serving its cached set until that expires, so a refetch would bring
 * the dismissed card straight back. Only a recorded dismissal removes it.
 */
export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recommendation: CommunityRecommendation) => {
      const input = hubDismissInput(recommendation);
      if (!input) {
        return Promise.reject(new Error('This suggestion cannot be dismissed.'));
      }
      return recordDismiss(input);
    },
    onSuccess: (result, recommendation) => {
      if (!result.wasRecorded) return;
      queryClient.setQueriesData<CommunityRecommendation[]>(
        { queryKey: recommendationKeys.communitiesAll() },
        (previous) =>
          Array.isArray(previous)
            ? previous.filter((card) => card.recommendationId !== recommendation.recommendationId)
            : previous
      );
    },
  });
}

/**
 * Unified Community Life search.
 *
 * -- Remediation Wave I: the federated route the register asked for exists -----
 *
 * This hook's own docstring used to end "...and is replaced the day a federated
 * route exists". **That day has been and gone.**
 * `GET /api/v1/communities/search`
 * (`CommunityProgramme/Api/PollAndAnnouncementEndpoints.cs:239`) is real,
 * certified, and is the *only* route on the whole platform that returns a
 * server-computed `relevance` score on each row
 * (`Application/Search/CommunitySearchQuery.cs:122-126`, `:312-344`). The
 * certified client for it -- `searchCommunityProgramme` -- had already been
 * written, and had **no caller**: this hook was still asking the development
 * adapter, so five of the seven types on the Community Life search screen were
 * simulated rows on a build that permits simulation, and nothing at all on a
 * build that does not.
 *
 * So the third arm now goes to the real route. What that changes for a member:
 * membership programmes, volunteer opportunities, polls and announcements are
 * really searched, really ranked by the server, and no longer disappear in a
 * production build.
 *
 * -- What is still concatenated here, and why that is not a ranking -----------
 *
 * Three arms, not one: B12's events, B12's organisations, and B18's four types.
 * The federated route is explicit that it will not do the first two --
 * *"this module does not re-implement a search over another module's rows"*
 * (`CommunitySearchQuery.cs:22`) -- and it names them rather than dropping them
 * silently: a client asking for `event`, `series` or `organization` gets nothing
 * back for those types by design.
 *
 * The three result sets are therefore **concatenated, and the screen groups them
 * by type**. They are deliberately not interleaved by score, because only one of
 * the three carries one: B12's event and organisation searches rank server-side
 * and then strip the score from the response DTO. Sorting the merged list by a
 * number this client invented would present an ordering as relevance that no
 * server computed -- which is the one thing a search surface must not do.
 *
 * -- The two types that have no search anywhere -------------------------------
 *
 * `series` and `campaign`. `GET /community-life/events/series` exists and binds
 * `q`, so series *could* be searched by a further arm; campaigns are B15.1's and
 * do not exist at all. Both used to be answered by the adapter. The hook now
 * reports them through `unsearchableTypes` so the screen can say which filters
 * cannot be honoured, rather than showing an empty list that reads as "nothing
 * matched".
 */
export function useCommunitySearch(params: CommunitySearchParams, isActive = true) {
  const wantsEvents = !params.types?.length || params.types.includes('event');
  const wantsOrgs = !params.types?.length || params.types.includes('organization');
  const hasQuery = params.query.trim().length > 0;

  // Remediation Wave J. `radiusKm` is gone and `filterType` became `free`.
  //
  // `GET /community-life/events` binds neither a radius nor a discovery bucket.
  // `maxDistanceKm` therefore cannot be honoured at all — it is not dropped in
  // favour of a rename, it is dropped because there is nothing on the route to
  // rename it to, and it is out of the cache key for the same reason: two
  // requests that differ only by a parameter the server never sees are one
  // request, and keying them apart would have split the cache for nothing.
  //
  // The price band survives: `free` is a real binding (`:143`).
  const eventsQuery = useQuery({
    queryKey: communityLifeKeys.events({
      query: params.query,
      cityName: params.cityName,
      free: params.priceBand === 'free' ? true : undefined,
    }),
    queryFn: () =>
      b12.fetchEvents({
        query: params.query,
        cityName: params.cityName,
        free: params.priceBand === 'free' ? true : undefined,
      }),
    enabled: isActive && hasQuery && wantsEvents,
    ...readOptions,
  });

  const orgsQuery = useQuery({
    queryKey: communityLifeKeys.organizations({
      query: params.query,
      cityName: params.cityName,
    }),
    queryFn: () => b12.fetchOrganizations({ query: params.query, cityName: params.cityName }),
    enabled: isActive && hasQuery && wantsOrgs,
    ...readOptions,
  });

  // The federated arm. Certified as of Remediation Wave I --
  // `searchCommunityProgramme` sends `q`, `types` and `take` under the names the
  // route binds (they are not `query`, `type` and `limit`) and returns the
  // server's `relevance` order unchanged.
  const federatedQuery = useQuery({
    queryKey: communityProgrammeKeys.search(fingerprint(params)),
    queryFn: () =>
      b18.searchCommunityProgramme({
        query: params.query,
        types: params.types,
        cityName: params.cityName,
        priceBand: params.priceBand === 'any' ? undefined : params.priceBand,
      }),
    enabled: isActive && hasQuery,
    ...readOptions,
  });

  const results = useMemo<CommunitySearchResult[]>(() => {
    const rows: CommunitySearchResult[] = [];

    for (const event of eventsQuery.data?.items ?? []) {
      rows.push({
        entityType: 'event',
        entityId: event.id,
        title: event.title,
        subtitle: `${event.date} · ${event.location.areaName}`,
        imageUrl: event.coverImage,
        locationLabel: event.location.cityName,
        distanceKm: event.location.distanceKm ?? null,
        badge: event.category,
        actionRoute: `/community-life/event/${event.id}`,
        source: 'backend',
      });
    }

    for (const org of orgsQuery.data?.items ?? []) {
      rows.push(organizationSearchResult(org));
    }

    // Appended, not interleaved. These four types arrive in the server's own
    // relevance order and keep it; the events and organisations above keep
    // theirs. Nothing here compares a poll to an event, because nothing on the
    // wire says how.
    rows.push(...(federatedQuery.data?.items ?? []));

    return rows;
  }, [eventsQuery.data, orgsQuery.data, federatedQuery.data]);

  return {
    results,
    /**
     * How many rows came from a certified backend.
     *
     * All of them, now. Kept rather than deleted because the screen renders it
     * beside `simulatedCount`, and a count that is always zero next to a count
     * that is always the total is a *statement*: this search stopped being half
     * a simulation.
     */
    backendCount: results.filter((row) => row.source === 'backend').length,
    simulatedCount: results.filter((row) => row.source === 'simulated').length,
    /**
     * Types the platform cannot search, whatever the member types.
     *
     * `series` has a route that binds `q` but no arm here yet; `campaign` has no
     * backend at all. Named so the screen can say so -- an empty result list
     * under a "Fundraising" filter would read as "there are no fundraisers",
     * which is a claim nobody checked.
     */
    unsearchableTypes: UNSEARCHABLE_COMMUNITY_TYPES,
    isLoading: eventsQuery.isLoading || orgsQuery.isLoading || federatedQuery.isLoading,
    isError: eventsQuery.isError && orgsQuery.isError && federatedQuery.isError,
    error: (eventsQuery.error ?? orgsQuery.error ?? federatedQuery.error) as FinancialError | null,
    refetch: () => {
      void eventsQuery.refetch();
      void orgsQuery.refetch();
      void federatedQuery.refetch();
    },
  };
}

/**
 * The Community Life entity types no route can search.
 *
 * `series` -- `GET /community-life/events/series` binds `q`, so this is a
 * missing *arm* rather than a missing capability, and it is listed so that stays
 * visible rather than becoming a quiet zero.
 * `campaign` -- B15.1's, and it does not exist in either repository.
 */
const UNSEARCHABLE_COMMUNITY_TYPES: readonly CommunityEntityType[] = ['series', 'campaign'];

/**
 * The impact view.
 *
 * **Repointed off the gap adapter.** `GET /communities/impact` has been served
 * since B18 shipped and `community-programme-api` had an adapter for it beside
 * the one this called.
 *
 * The two answer different shapes, and the platform's is the better one: the
 * gap returned eight fixed fields the *client* had named, and the route returns
 * `metrics[]` where each row carries its own `label`, `definition` and `source`.
 * So the screen renders what the platform measured rather than a grid of six
 * headings written here — the same reason the recurrence sentence comes from
 * the server. A metric the platform stops computing disappears; one it adds
 * arrives without a release.
 */
export function useCommunityImpact(params: {
  scope: 'member' | 'organization' | 'neighborhood' | 'country';
  scopeId?: string;
  period: AnalyticsPeriod;
}) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.impact(params.scope, params.scopeId ?? 'me', params.period),
    queryFn: () => b18.fetchCommunityImpact(params),
    ...readOptions,
    staleTime: ANALYTICS_STALE_MS,
  });

  return {
    impact: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Cache maintenance
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Drops every Community Life cache entry.
 *
 * Called on sign-out. The next member on this device must not inherit the last
 * one's memberships, applications or draft campaigns — and the gap namespace
 * has to go with the B12 namespace, because "my memberships" and "the events I
 * saved" are equally personal.
 */
export function clearCommunityCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: communityGapKeys.all });
  queryClient.removeQueries({ queryKey: communityLifeKeys.all });
}

/** The entity types Community Life search and the hub can surface. */
export const COMMUNITY_ENTITY_TYPES: CommunityEntityType[] = [
  'event',
  'series',
  'organization',
  'membership',
  'campaign',
  'opportunity',
  'poll',
  'announcement',
];

/** A stable callback for screens that need to invalidate after a deep action. */
export function useInvalidateCommunity() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: communityGapKeys.all });
    void queryClient.invalidateQueries({ queryKey: communityLifeKeys.all });
  }, [queryClient]);
}
