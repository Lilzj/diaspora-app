// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps repositories (Frontend Phase 8, §42, §57)
//
// §57's repository layer. Every hook here is the *stable domain interface* a
// screen depends on, and each one decides for itself which arm answers:
//
//   MapSearchRepository       → certified routes for every category
//   LocationRepository        → the device provider (real or simulated)
//   GeocodingRepository       → certified `/location/*`
//   RoutingRepository         → the routing provider (adapter today)
//   HeatMapRepository         → development adapter        GAP-012
//   NeighborhoodRepository    → **certified for the stats**, adapter for detail
//   AlertRepository           → **certified B9 updates**, adapter for geometry
//
// Four properties every hook holds to, because screens rely on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented safety score
//   without having had the opportunity to mark it. The hybrid hooks report it
//   *per part* — marking the real safety number as simulated would be its own
//   kind of lie.
//
//   **A disabled build is not an error state.** Gap queries are `enabled:
//   false` in a release build rather than left to fail, so a production binary
//   shows "not available yet" rather than a spinner resolving into an error.
//
//   **Location is asked for, never assumed.** No hook here requests a position
//   on mount. `useCurrentLocation` exposes a `request()` the member's action
//   calls, because §5 forbids making permission mandatory and §6 forbids
//   continuously requesting location a screen does not need.
//
//   **Nothing is ranked here.** Merge order is distance or category order, and
//   is documented as a client behaviour. §38 forbids implementing
//   recommendation scoring in the frontend and this file implements none.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  VIEWPORT_MOVE_THRESHOLD,
  VIEWPORT_SEARCH_DEBOUNCE_MS,
  type CommunityAlert,
  type CostOfLivingIndex,
  type DeviceLocation,
  type DiscoveryCategory,
  type GeoBoundingBox,
  type GeoCoordinate,
  type HeatMapLayerData,
  type HeatMapTimeRange,
  type LocationPermissionState,
  type MapErrorKind,
  type MapLayerId,
  type MapSearchParams,
  type MapSearchResponse,
  type MapViewport,
  type NeighborhoodScore,
  type Place,
  type Route,
  type RouteRequest,
  type SafetyScore,
  type TravelEstimate,
  type TravelMode,
} from '@/types/maps';
import { MAPS_GAPS, areMapsGapsEnabled } from '@/config/maps-gaps';
import { getMapFeatureFlags } from '@/config/map-config';
import {
  fetchAlert,
  fetchAlertsNear,
  fetchNearby,
  fetchNeighborhoodOverview,
  mapKeys,
  neighborhoodIdFor,
  searchMap,
} from '@/lib/maps-api';
import {
  compareNeighborhoods,
  fetchAlertArea,
  fetchCostOfLiving,
  fetchHeatLayer,
  fetchNeighborhoodScore,
  fetchSafetyScore,
  mapsGapKeys,
} from '@/lib/maps-gap-api';
import {
  boundsToCircle,
  boundsCacheKey,
  distanceBetween,
  viewportDelta,
  viewportToBounds,
  viewportToZoom,
} from '@/lib/maps/geo';
import { classifyError } from '@/lib/maps/errors';
import {
  resolveDeviceLocationProvider,
  resolveLocationPermissionProvider,
  resolvePlacesProvider,
  resolveRoutingProvider,
} from '@/lib/maps/providers/registry';
import {
  isLocationStale,
  useMapSessionStore,
  canRequestPermission,
} from '@/store/map-session';
import { trackMapsEvent, trackPermissionOutcome, trackProviderError } from '@/lib/maps/analytics';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { useCommunityScope } from './communities';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';

/**
 * The active community scope, in the two fields `MapSearchParams` carries.
 *
 * Frontend Phase 13, §28 and §46. Kept as its own hook so the map's dependency on
 * the community context is one import and one call — and so a deployment that
 * turns `communityMapScopeEnabled` off gets an unscoped map without any map code
 * branching on a flag.
 *
 * Returns a stable empty object when unscoped, so the fingerprint of an unscoped
 * map search is byte-identical to what it was before Phase 13 existed. That is
 * what makes §69's "existing behaviour must not regress" true for the map: a
 * member with no community selected gets exactly the previous cache entries.
 */
function useCommunityMapScope(): Pick<
  MapSearchParams,
  'communityIds' | 'communityOriginCountryCodes'
> {
  const flags = getCommunityFeatureFlags();
  const { scope, projection } = useCommunityScope();

  return useMemo(() => {
    if (!flags.communityMapScopeEnabled) return {};
    if (projection.isUnscoped) return {};

    return {
      communityIds: scope.communityIds,
      communityOriginCountryCodes: projection.originCountryCodes,
    };
  }, [
    flags.communityMapScopeEnabled,
    projection.isUnscoped,
    projection.originCountryCodes,
    scope.communityIds,
  ]);
}

// ═════════════════════════════════════════════════════════════════════════════
// LOCATION — §5, §6
// ═════════════════════════════════════════════════════════════════════════════

export interface CurrentLocationApi {
  location: DeviceLocation | null;
  permission: LocationPermissionState;
  isResolving: boolean;
  isStale: boolean;
  error: MapErrorKind | null;
  /** True when the provider is the simulated one. Screens must mark it. */
  isSimulated: boolean;
  /** Reads permission without prompting. Safe on mount. */
  check: () => Promise<void>;
  /** Prompts, then fetches a fix if granted. Only from a member action. */
  request: () => Promise<void>;
  /** Fetches a fresh fix. No-op without permission. */
  refresh: () => Promise<void>;
  openSettings: () => Promise<boolean>;
  canRequest: boolean;
}

/**
 * The device's current location and its permission state.
 *
 * Deliberately does **not** request on mount. §5 is explicit that permission
 * must not be mandatory unless the feature requires it, and a map that prompts
 * the instant it opens is a map that gets denied. `check()` reads the existing
 * answer without prompting; `request()` is wired to a button the member presses.
 */
export function useCurrentLocation(): CurrentLocationApi {
  const {
    deviceLocation,
    permission,
    isResolvingLocation,
    locationError,
    setDeviceLocation,
    setPermission,
    setResolvingLocation,
    setLocationError,
    pruneExpiredLocation,
  } = useMapSessionStore();

  const permissionProvider = useMemo(() => resolveLocationPermissionProvider(), []);
  const locationProvider = useMemo(() => resolveDeviceLocationProvider(), []);

  // §40. A single timer that drops an expired fix, rather than every consumer
  // checking an age. Sixty seconds is granular enough for a fifteen-minute
  // window and cheap enough to leave running while a map is open.
  useEffect(() => {
    pruneExpiredLocation();
    const timer = setInterval(pruneExpiredLocation, 60_000);
    return () => clearInterval(timer);
  }, [pruneExpiredLocation]);

  const fetchFix = useCallback(async () => {
    setResolvingLocation(true);
    const result = await locationProvider.getCurrentPosition();
    setResolvingLocation(false);

    if (result.ok) {
      setDeviceLocation(result.value);
      setLocationError(null);
      trackMapsEvent('maps.current_location.used', {
        accuracyLevel: result.value.accuracyMetres && result.value.accuracyMetres > 500 ? 'approximate' : 'precise',
        isSimulated: locationProvider.descriptor.isSimulated,
      });
      return;
    }

    setLocationError(result.error);
    trackMapsEvent('maps.location.unavailable', { errorKind: result.error });
  }, [locationProvider, setDeviceLocation, setLocationError, setResolvingLocation]);

  const check = useCallback(async () => {
    const next = await permissionProvider.check();
    setPermission(next);
  }, [permissionProvider, setPermission]);

  const request = useCallback(async () => {
    trackMapsEvent('maps.location_permission.requested');
    setResolvingLocation(true);

    const next = await permissionProvider.request();
    setPermission(next);
    trackPermissionOutcome(next.status, next.accuracy);

    if (next.status === 'granted' || next.status === 'grantedApproximate') {
      await fetchFix();
    } else {
      setResolvingLocation(false);
    }
  }, [fetchFix, permissionProvider, setPermission, setResolvingLocation]);

  const refresh = useCallback(async () => {
    // Re-checked rather than trusted: permission can be revoked from Settings
    // while the app is backgrounded, and a refresh that assumed the cached
    // answer would ask for a position the OS is about to refuse.
    const current = await permissionProvider.check();
    setPermission(current);

    if (current.status === 'granted' || current.status === 'grantedApproximate') {
      await fetchFix();
    }
  }, [fetchFix, permissionProvider, setPermission]);

  return {
    location: deviceLocation,
    permission,
    isResolving: isResolvingLocation,
    isStale: isLocationStale(deviceLocation),
    error: locationError,
    isSimulated: locationProvider.descriptor.isSimulated,
    check,
    request,
    refresh,
    openSettings: () => permissionProvider.openSettings(),
    canRequest: canRequestPermission(permission),
  };
}

/**
 * A position watch, for navigation only.
 *
 * `enabled` is not a convenience. §6 forbids continuously requesting location
 * when the screen does not require it, and a watch left open is the single
 * largest battery cost in this phase. The navigation screen passes
 * `requiresPositionWatch(state)` so the watch closes the instant the machine
 * leaves a live phase.
 */
export function usePositionWatch(
  enabled: boolean,
  onLocation: (location: DeviceLocation) => void,
  onError?: (error: MapErrorKind) => void
): void {
  const provider = useMemo(() => resolveDeviceLocationProvider(), []);

  // Held in a ref so a caller passing an inline arrow does not tear down and
  // rebuild the watch on every render — which would restart the GPS hardware
  // several times a second.
  const handler = useRef(onLocation);
  const errorHandler = useRef(onError);
  handler.current = onLocation;
  errorHandler.current = onError;

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = provider.watchPosition(
      (location) => handler.current(location),
      (error) => errorHandler.current?.(error),
      { distanceFilterMetres: 10, highAccuracy: true }
    );

    return unsubscribe;
  }, [enabled, provider]);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAP SEARCH — §10, §11, §12, §13
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Written as an intersection rather than an `interface … extends`.
 * `UseQueryResult` is a discriminated union — the `data`/`error` pairing
 * differs per status — and an interface cannot extend a union without
 * collapsing exactly the narrowing that makes it useful.
 */
export type MapSearchApi = UseQueryResult<MapSearchResponse, Error> & {
  /** True when the camera has moved far enough that the results are stale. */
  isViewportDirty: boolean;
  /** Runs a search for the current viewport. Wired to "Search this area". */
  searchThisArea: () => void;
};

/**
 * Viewport-scoped search across the selected categories.
 *
 * §13's requirements are met in four separate places, and it is worth naming
 * which is which because they are easy to conflate:
 *
 *   **Debounce** — the query key only changes after `debouncedViewport`
 *   settles, so a drag produces one request rather than sixty.
 *
 *   **Movement threshold** — `viewportDelta` gates the debounce, so a pan of
 *   less than a quarter of a screen never starts the timer at all. This is what
 *   stops a finger settling from being a query.
 *
 *   **Deduplication** — the key rounds the bounds to three decimals, so
 *   returning to an area is a cache hit. It also keeps precise coordinates out
 *   of query keys, which end up in devtools and bug reports.
 *
 *   **Cancellation** — TanStack Query's `signal` is passed to axios, so a
 *   superseded request is aborted rather than left racing to overwrite the
 *   newer one.
 */
export function useMapSearch(input: {
  viewport: MapViewport;
  categories: DiscoveryCategory[];
  query?: string;
  filters?: Partial<MapSearchParams>;
  enabled?: boolean;
  /** When true, only an explicit `searchThisArea()` triggers a fetch. */
  manualRefresh?: boolean;
}): MapSearchApi {
  const { viewport, categories, query, filters, enabled = true, manualRefresh = false } = input;

  const [committedViewport, setCommittedViewport] = useState(viewport);
  const lastCommitted = useRef(viewport);

  const activeLocation = useLocationStore(getActiveLocation);
  const deviceLocation = useMapSessionStore((s) => s.deviceLocation);

  const origin: GeoCoordinate | null = useMemo(
    () =>
      deviceLocation?.coordinate ?? {
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
      },
    [activeLocation.latitude, activeLocation.longitude, deviceLocation]
  );

  // The movement threshold and the debounce, in that order.
  useEffect(() => {
    if (manualRefresh) return;
    if (viewportDelta(lastCommitted.current, viewport) < VIEWPORT_MOVE_THRESHOLD) return;

    const timer = setTimeout(() => {
      lastCommitted.current = viewport;
      setCommittedViewport(viewport);
      trackMapsEvent('maps.viewport.searched', {
        zoomBand: undefined,
        categories: categories.join(','),
      });
    }, VIEWPORT_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [categories, manualRefresh, viewport]);

  const bounds = useMemo(() => viewportToBounds(committedViewport), [committedViewport]);

  // Frontend Phase 13, §28/§46. The active community scope is merged in here
  // rather than by each map screen, for the same reason the viewport is: a screen
  // that forgot would show the previous community's markers, and §46 names stale
  // markers as the failure to avoid. Because the scope lands in `filters` it lands
  // in the fingerprint below, so per-scope cache isolation costs no new key
  // machinery — see `mapKeys.search`.
  const communityScope = useCommunityMapScope();

  const scopedFilters = useMemo(
    () => ({ ...filters, ...communityScope }),
    [communityScope, filters]
  );

  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        q: query ?? '',
        ...scopedFilters,
      }),
    [scopedFilters, query]
  );

  const result = useQuery({
    queryKey: mapKeys.search(categories, bounds, fingerprint),
    queryFn: ({ signal }) =>
      searchMap(
        {
          categories,
          query,
          bounds,
          ...scopedFilters,
        },
        origin,
        { signal }
      ),
    enabled: enabled && categories.length > 0,
    // A viewport's results are worth reusing for a minute: a member panning
    // back and forth between two areas should not re-fetch each time. Beyond
    // that, listings and alerts change often enough that a stale answer is a
    // wrong answer.
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // A failed search retries once. More would keep a spinner up through a
    // genuine outage; none would fail on a single dropped packet.
    retry: 1,
  });

  const isViewportDirty = viewportDelta(committedViewport, viewport) >= VIEWPORT_MOVE_THRESHOLD;

  const searchThisArea = useCallback(() => {
    lastCommitted.current = viewport;
    setCommittedViewport(viewport);
    trackMapsEvent('maps.search.performed', {
      categories: categories.join(','),
      hasQuery: Boolean(query),
      zoomBand: undefined,
    });
  }, [categories, query, viewport]);

  return { ...result, isViewportDirty, searchThisArea };
}

/**
 * The cross-domain nearby aggregate.
 *
 * §38: a **surface** on existing capability, never a second engine. This orders
 * by distance and says so; it does not score, rank or personalize, and the rail
 * that renders it is labelled "Nearby" rather than "Recommended" precisely
 * because distance ordering is not a recommendation (FRONTEND-MAPS-GAP-020).
 */
export function useNearby(center: GeoCoordinate | null, radiusKm: number, enabled = true) {
  return useQuery({
    queryKey: center ? mapKeys.nearby(center, radiusKm) : ['maps', 'nearby', 'none'],
    queryFn: ({ signal }) => fetchNearby(center!, radiusKm, { signal }),
    enabled: enabled && center !== null,
    staleTime: 2 * 60_000,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PLACES & GEOCODING — §46
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Debounced place autocomplete.
 *
 * §46: do not call geocoding on every keystroke. The debounce lives here rather
 * than in each screen so no search box can forget it, and the two-character
 * floor is enforced in the provider as well — belt and braces on the one call
 * that would otherwise be billed per keystroke.
 */
export function usePlaceSearch(query: string, options?: { countryCodes?: string[]; near?: GeoCoordinate }) {
  const [debounced, setDebounced] = useState(query);
  const provider = useMemo(() => resolvePlacesProvider(), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return useQuery<Place[], Error>({
    queryKey: mapKeys.places(debounced, options?.countryCodes?.join(',')),
    queryFn: async () => {
      const result = await provider.autocomplete(debounced, options);
      if (!result.ok) throw new Error(result.detail ?? result.error);
      return result.value;
    },
    enabled: debounced.trim().length >= 2,
    // A place's coordinate does not move. Five minutes is conservative and
    // exists only so a corrected corpus is picked up within a session.
    staleTime: 5 * 60_000,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTING — §14, §15, §16, §17
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A travel estimate between two points.
 *
 * The cheap call, used by list rows and detail headers. `isRouted` on the
 * result is what a surface checks before it is allowed to say "12 minute walk"
 * rather than "about 12 minutes" — §48 in one boolean.
 */
export function useTravelEstimate(
  origin: GeoCoordinate | null,
  destination: GeoCoordinate | null,
  travelMode: TravelMode,
  enabled = true
) {
  const provider = useMemo(() => resolveRoutingProvider(), []);

  return useQuery<TravelEstimate, Error>({
    queryKey: [
      'maps',
      'estimate',
      travelMode,
      origin ? `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}` : 'none',
      destination ? `${destination.latitude.toFixed(3)},${destination.longitude.toFixed(3)}` : 'none',
    ],
    queryFn: async () => {
      const result = await provider.estimate(origin!, destination!, travelMode);
      if (!result.ok) {
        trackProviderError({ errorKind: result.error, providerId: provider.descriptor.id });
        throw new Error(result.detail ?? result.error);
      }
      return result.value;
    },
    enabled: enabled && origin !== null && destination !== null,
    // Walking and driving geometry is stable; a traffic-aware duration would
    // need a much shorter window, and when a traffic-capable provider arrives
    // this is the line that changes.
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

export interface RoutePlanApi {
  routes: Route[];
  isLoading: boolean;
  error: MapErrorKind | null;
  isSimulated: boolean;
  supportsTraffic: boolean;
  supportedModes: TravelMode[];
  plan: (request: RouteRequest) => Promise<Route[]>;
}

/**
 * Route planning.
 *
 * A mutation-shaped hook rather than a query: a route is computed in response
 * to a member's action, and a query keyed on origin/destination/mode would
 * re-plan every time a screen re-rendered with the same inputs.
 */
export function useRoutePlanner(): RoutePlanApi {
  const provider = useMemo(() => resolveRoutingProvider(), []);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<MapErrorKind | null>(null);

  const plan = useCallback(
    async (request: RouteRequest) => {
      setIsLoading(true);
      setError(null);

      const result = await provider.route(request);
      setIsLoading(false);

      if (!result.ok) {
        setError(result.error);
        setRoutes([]);
        trackProviderError({
          errorKind: result.error,
          providerId: provider.descriptor.id,
          gapKey: provider.descriptor.gapKey,
        });
        return [];
      }

      setRoutes(result.value);
      return result.value;
    },
    [provider]
  );

  return {
    routes,
    isLoading,
    error,
    isSimulated: provider.descriptor.isSimulated,
    supportsTraffic: provider.supportsTraffic,
    supportedModes: provider.supportedModes,
    plan,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMUNITY ALERTS — §27, §28, §29
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Active community alerts in an area.
 *
 * §27: these are **real** B9 Community Updates. No second feed, no second
 * notification system. The only simulated part is the affected-area geometry,
 * fetched separately by `useAlertArea` so a screen can render a real alert
 * without pulling in a simulated one.
 */
export function useCommunityAlerts(bounds: GeoBoundingBox | null, enabled = true) {
  const flags = getMapFeatureFlags();

  return useQuery<CommunityAlert[], Error>({
    queryKey: bounds ? mapKeys.alerts(bounds) : ['maps', 'alerts', 'none'],
    queryFn: ({ signal }) => {
      const circle = boundsToCircle(bounds!);
      return fetchAlertsNear(circle.center, circle.radiusKm, { signal });
    },
    enabled: enabled && bounds !== null && flags.communityAlertsEnabled,
    // Short, because an alert is time-critical by definition. A road closure
    // shown five minutes after it cleared is a member sent the long way round.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCommunityAlert(id: string | undefined) {
  return useQuery<CommunityAlert, Error>({
    queryKey: mapKeys.alert(id ?? ''),
    queryFn: ({ signal }) => fetchAlert(id!, { signal }),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/** The affected area. Null when unavailable, which is a normal outcome. */
export function useAlertArea(alertId: string | undefined) {
  return useQuery({
    queryKey: mapsGapKeys.alertArea(alertId ?? ''),
    queryFn: () => fetchAlertArea(alertId!),
    enabled: Boolean(alertId) && areMapsGapsEnabled(),
    staleTime: 5 * 60_000,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// GEOGRAPHIC INTELLIGENCE — §21–§26
// ═════════════════════════════════════════════════════════════════════════════

export function useHeatLayer(
  layer: MapLayerId | null,
  bounds: GeoBoundingBox | null,
  options: { zoom?: number; timeRange?: HeatMapTimeRange } = {}
) {
  const flags = getMapFeatureFlags();
  const definition = layer ? MAPS_GAPS.heatMapAggregates : null;

  return useQuery<HeatMapLayerData, Error>({
    queryKey:
      layer && bounds
        ? mapsGapKeys.heatLayer(layer, bounds, options.timeRange ?? '30d')
        : ['maps-gap', 'heat', 'none'],
    queryFn: () => fetchHeatLayer(layer!, bounds!, options),
    // Disabled rather than failing in a release build. §58: a screen shows
    // "not available yet", not a spinner that resolves into an error.
    enabled: Boolean(layer) && bounds !== null && flags.heatMapsEnabled && Boolean(definition),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

/**
 * The neighbourhood overview.
 *
 * **Certified.** This is `/neighborhood/{id}` and everything it returns —
 * safety score, walkability, cost band, resource counts — is real. The screen
 * renders these without a simulation marker, and that is correct.
 */
export function useNeighborhoodOverview(id: string | undefined) {
  return useQuery({
    queryKey: mapKeys.neighborhood(id ?? ''),
    queryFn: ({ signal }) => fetchNeighborhoodOverview(id!, { signal }),
    enabled: Boolean(id),
    staleTime: 10 * 60_000,
  });
}

/**
 * The score breakdown.
 *
 * Hybrid, and the split is visible in the data rather than in a comment: each
 * `ScoreDimension` carries its own `freshness.sourceName`, and
 * `NeighborhoodScore.overall` is a `Sourced<number>` marked `simulated`
 * because it blends real and estimated dimensions.
 */
export function useNeighborhoodScore(id: string | undefined) {
  const flags = getMapFeatureFlags();

  return useQuery<NeighborhoodScore, Error>({
    queryKey: mapsGapKeys.neighborhoodScore(id ?? ''),
    queryFn: () => fetchNeighborhoodScore(id!),
    enabled: Boolean(id) && flags.neighborhoodScoresEnabled && areMapsGapsEnabled(),
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

export function useNeighborhoodComparison(ids: string[]) {
  return useQuery<NeighborhoodScore[], Error>({
    queryKey: mapsGapKeys.neighborhoodComparison(ids),
    queryFn: () => compareNeighborhoods(ids),
    enabled: ids.length >= 2 && areMapsGapsEnabled(),
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

export function useCostOfLiving(id: string | undefined) {
  const flags = getMapFeatureFlags();

  return useQuery<CostOfLivingIndex, Error>({
    queryKey: mapsGapKeys.costOfLiving(id ?? ''),
    queryFn: () => fetchCostOfLiving(id!),
    enabled: Boolean(id) && flags.costOfLivingEnabled && areMapsGapsEnabled(),
    staleTime: 30 * 60_000,
    retry: 0,
  });
}

export function useSafetyScore(id: string | undefined) {
  const flags = getMapFeatureFlags();

  return useQuery<SafetyScore, Error>({
    queryKey: mapsGapKeys.safetyScore(id ?? ''),
    queryFn: () => fetchSafetyScore(id!),
    enabled: Boolean(id) && flags.safetyScoresEnabled && areMapsGapsEnabled(),
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// REALTIME — §30
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Keeps map data current.
 *
 * §30 forbids a second realtime infrastructure, and this phase creates none.
 * There is no geographic subscription on the platform's existing transport
 * (FRONTEND-MAPS-GAP-018), so this degrades to a **bounded, viewport-scoped
 * refetch** through the same TanStack Query invalidation every other phase uses
 * to apply a push.
 *
 * The returned `mode` is not decoration. The alert banner renders "updating
 * every minute" rather than "live" when it says `polling`, because claiming
 * live updates for a road closure that is checked once a minute is exactly the
 * kind of promise §43 forbids making about safety-critical data.
 */
export function useMapRealtime(bounds: GeoBoundingBox | null, enabled = true): {
  mode: 'live' | 'polling' | 'off';
  lastUpdatedAt: number | null;
} {
  const queryClient = useQueryClient();
  const flags = getMapFeatureFlags();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const active = enabled && bounds !== null && flags.realtimeMapUpdatesEnabled;
  const boundsKey = bounds ? boundsCacheKey(bounds) : null;

  useEffect(() => {
    if (!active || !boundsKey) return;

    const timer = setInterval(() => {
      // Scoped to the alerts key rather than invalidating the whole map: a
      // blanket invalidation would refetch every listing in the viewport once a
      // minute, which is the transfer §41 exists to prevent.
      void queryClient.invalidateQueries({ queryKey: ['maps', 'alerts'] });
      setLastUpdatedAt(Date.now());
    }, 60_000);

    return () => clearInterval(timer);
  }, [active, boundsKey, queryClient]);

  return { mode: active ? 'polling' : 'off', lastUpdatedAt };
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** The neighbourhood id for a name, so screens do not each slugify their own. */
export { neighborhoodIdFor };

/** Straight-line distance between two points, typed. */
export { distanceBetween };

/** Zoom for a viewport, for layer thresholds. */
export { viewportToZoom };

/** Classifies a thrown value into the map error vocabulary. */
export { classifyError };
