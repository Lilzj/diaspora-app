// Community Life hooks: events. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as b12 from '@/lib/api/community-life-api';
import { communityLifeKeys } from '@/lib/api/community-life-api';
// Frontend Phase 13, §43. The community scope becomes part of the cache key for
// the community-sensitive B12 reads. Imported from the repository layer rather
// than resolved here, so there is one place a scope is computed.
import { useCommunityScope } from '../communities';
import { communityScopeToken } from '@/lib/community/scope';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { DISCOVERY_STALE_MS, mutationOptions, readOptions } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// B12 passthroughs — real events, organizations and the calendar
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Real B12 events.
 *
 * Not a gap hook: `isSimulated` is false and there is no notice above a list
 * that came from here. §58.2 — extend the existing Events infrastructure — and
 * this is the extension: a typed, cached, error-handled read of the route the
 * screens used to call by hand.
 */
export function useEvents(params: b12.EventQueryParams = {}, isActive = true) {
  // Frontend Phase 13, §21/§43. The community scope joins the key — not the
  // request, which B12 would ignore. Two scopes are two cache entries, so a
  // community switch cannot serve the previous community's events.
  const { scope } = useCommunityScope();
  const scopeToken = communityScopeToken(scope);

  const query = useQuery({
    queryKey: communityLifeKeys.events(params, scopeToken),
    queryFn: () => b12.fetchEvents(params),
    enabled: isActive,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

/**
 * The events posted in one community — `GET /community-life/events?communityId=`
 * (21 Oct 2026). Only events the host chose to post there, so an empty list
 * means exactly that, not a projection that found nothing.
 */
export function useCommunityEvents(communityId: string | null | undefined, limit?: number) {
  const params: b12.EventQueryParams = { communityId: communityId ?? undefined, sortBy: 'date', limit };

  const query = useQuery({
    queryKey: communityLifeKeys.communityEvents(communityId ?? '', limit ?? null),
    queryFn: () => b12.fetchEvents(params),
    enabled: Boolean(communityId),
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useEvent(eventId: string | undefined) {
  const query = useQuery({
    queryKey: communityLifeKeys.event(eventId ?? ''),
    queryFn: () => b12.fetchEvent(eventId as string),
    enabled: Boolean(eventId),
    ...readOptions,
  });

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

/**
 * Announces the organiser's event.
 *
 * Invalidates the discovery lists as well as the event: a published event is a
 * new arrival everywhere it was previously absent, and the whole point of
 * publishing is that other people can now find it.
 */
export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ eventId }: { eventId: string }) => b12.publishEvent(eventId),
    onSuccess: (event) => {
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(event.id) });
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.eventsAll() });
    },
  });
}

export function useSetEventCapacity() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      eventId,
      capacity,
      baseRevision,
    }: {
      eventId: string;
      /** Null is uncapped, and it is not zero. */
      capacity: number | null;
      baseRevision?: number;
    }) => b12.setEventCapacity(eventId, capacity, baseRevision),
    onSuccess: (event) => {
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(event.id) });
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.eventsAll() });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// NeighborhoodEventsRepository — GAP-015
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Events in the member's city.
 *
 * **Remediation Wave J — this was called `useNearbyEvents` and the docblock said
 * "Entirely real. B12's event list accepts `latitude`, `longitude` and
 * `radiusKm` and computes `distanceKm` server-side". None of that is true.**
 *
 * `EventSearchParameters` (`CommunityLifeDiscoveryEndpoints.cs:113`) has no
 * latitude, no longitude and no radius property. All three were discarded by the
 * model binder, and `sortBy: 'distance'` did not parse as an `EventSortOrder`
 * either, so the "nearest first" list was the server's default schedule
 * ordering. The screen then drew a radius selector over a result set that no
 * radius had ever touched, and every event in it carried no `distanceKm`.
 *
 * What the route genuinely narrows by, and this hook now sends, is the city.
 * `proximityAvailable` is false and the screen says so rather than presenting a
 * city list as a proximity search — the difference matters to a member deciding
 * whether a 25 km radius will reach the next town.
 *
 * The two ways this *could* become a real proximity read, neither invented here:
 * `bounds` needs a viewport the member has drawn (the map has one; this screen
 * does not), and `neighborhoodAreaId` needs a B4 area id, which is what
 * `useNeighborhoodEvents` below is for.
 */
export function useNearbyEvents(
  params: { latitude?: number; longitude?: number; radiusKm?: number; cityName?: string },
  isActive = true
) {
  const hasCity = Boolean(params.cityName);

  const query = useQuery({
    // `latitude`, `longitude` and `radiusKm` are out of the key as well as out
    // of the request. Keeping them would key apart requests that are byte-for-
    // byte identical on the wire.
    queryKey: communityLifeKeys.events({ cityName: params.cityName }),
    queryFn: () => b12.fetchEvents({ cityName: params.cityName }),
    enabled: isActive && hasCity,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    /** Whether a city was resolved. Without one there is nothing to narrow by. */
    hasLocation: hasCity,
    /**
     * False, always, on this route. Rendered — a screen that offers a radius
     * must either honour it or say it cannot, and this is how it says so.
     */
    proximityAvailable: false as const,
  };
}

/**
 * Public events around a point (14 Oct 2026): `/community-life/events` with
 * `latitude`, `longitude` and `radiusKm`, which the event route binds since the
 * place catalogue was retired. Disabled until there is a finite point.
 */
export function useEventsAroundPoint(
  point: { latitude: number; longitude: number } | null,
  radiusKm: number,
  isActive = true
) {
  const hasPoint = Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const params = hasPoint
    ? { latitude: point!.latitude, longitude: point!.longitude, radiusKm }
    : {};

  const query = useQuery({
    queryKey: communityLifeKeys.eventsAround(
      hasPoint ? point!.latitude.toFixed(5) : 'none',
      hasPoint ? point!.longitude.toFixed(5) : 'none',
      radiusKm
    ),
    queryFn: () => b12.fetchEvents(params),
    enabled: isActive && hasPoint,
    ...readOptions,
    staleTime: DISCOVERY_STALE_MS,
  });

  return {
    events: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    hasPoint,
  };
}

/**
 * How much community life the area around a point has, from
 * `GET /community-life/area/activity` (14 Oct 2026). Replaces the catalogue
 * neighbourhood's activity read.
 */
export function useAreaActivity(
  point: { latitude: number; longitude: number; name?: string | null } | null,
  radiusKm: number
) {
  const hasPoint = Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

  const query = useQuery({
    queryKey: communityLifeKeys.areaActivity(
      hasPoint ? point!.latitude.toFixed(5) : 'none',
      hasPoint ? point!.longitude.toFixed(5) : 'none',
      point?.name ?? '',
      radiusKm
    ),
    queryFn: () =>
      b12.fetchAreaActivity({
        latitude: point!.latitude,
        longitude: point!.longitude,
        radiusKm,
        name: point?.name,
      }),
    enabled: hasPoint,
    ...readOptions,
  });

  return {
    activity: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}
