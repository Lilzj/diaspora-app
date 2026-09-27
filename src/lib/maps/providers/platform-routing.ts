// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — platform routing provider (Phase 8, 27 Sep 2026)
//
// Directions from `POST /geo/routes`, which the backend answers through its
// configured vendor (Google Maps since 27 Sep 2026, free tier only).
//
// ── Three rules this file keeps ──────────────────────────────────────────────
//
//   1. **`estimate()` never calls the server.** It is used by every card in a
//      list, and each server call spends one unit of a monthly allowance shared
//      by every member. Thirty cards would cost thirty units. Estimates stay
//      with the fallback, which marks them as straight-line estimates.
//
//   2. **"Not configured" is the only answer that falls back.** A deployment
//      with no vendor hands the request to the fallback (the adapter in a gap
//      build, the refusing provider in production). "No route", "rate limited"
//      and "allowance spent" are the deployment's real answers, and swapping in
//      an estimate would hide them.
//
//   3. **The descriptor tells the truth about the last answer.** Until the
//      server has routed something, the screen is told what the fallback is, so
//      it keeps its "estimated times only" labels.
// ─────────────────────────────────────────────────────────────────────────────

import { planRoute, type RoutePlanOutcome } from '@/lib/maps/geo-client';
import {
  routeDistance,
  type GeoBoundingBox,
  type GeoCoordinate,
  type ManoeuvreKind,
  type NavigationInstruction,
  type Route,
  type RouteRequest,
  type RouteSegment,
  type TransitDetail,
  type TravelEstimate,
  type TravelMode,
} from '@/types/maps';
import { boundsFromCoordinates, distanceBetween } from '../geo';
import { fail, ok, type ProviderDescriptor, type ProviderResult, type RoutingProvider } from './types';

type PlannedRouteWire = RoutePlanOutcome['routes'][number];
type RouteLegWire = PlannedRouteWire['legs'][number];

const MANOEUVRES: readonly ManoeuvreKind[] = [
  'depart', 'straight', 'turn-left', 'turn-right', 'slight-left', 'slight-right',
  'sharp-left', 'sharp-right', 'uturn', 'roundabout', 'merge', 'fork', 'board',
  'alight', 'transfer', 'arrive',
];

const WIRE_MODES: Record<string, TravelMode> = {
  walking: 'walking',
  cycling: 'cycling',
  driving: 'driving',
  transit: 'transit',
};

/** How long an identical request is answered from memory rather than spent again. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 30;

const PLATFORM_DESCRIPTOR: ProviderDescriptor = {
  id: 'platform-routing',
  label: 'Directions',
  isSimulated: false,
};

export class PlatformRoutingProvider implements RoutingProvider {
  supportedModes: TravelMode[] = ['walking', 'driving', 'transit', 'cycling'];
  supportsTraffic = false;

  private hasRouted = false;
  private readonly cache = new Map<string, { at: number; routes: Route[] }>();

  constructor(
    private readonly fallback: RoutingProvider,
    private readonly now: () => number = Date.now
  ) {}

  get descriptor(): ProviderDescriptor {
    return this.hasRouted ? PLATFORM_DESCRIPTOR : this.fallback.descriptor;
  }

  estimate(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    travelMode: TravelMode
  ): Promise<ProviderResult<TravelEstimate>> {
    // Rule 1: never a server call. See the header.
    return this.fallback.estimate(origin, destination, travelMode);
  }

  async route(request: RouteRequest): Promise<ProviderResult<Route[]>> {
    const key = cacheKey(request);
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return ok(cached.routes);

    let outcome: RoutePlanOutcome;

    try {
      outcome = await planRoute({
        origin: request.origin.coordinate,
        destination: request.destination.coordinate,
        waypoints: request.waypoints?.map((point) => point.coordinate),
        travelMode: request.travelMode,
        alternatives: request.alternatives,
        departAt: request.departureAt,
      });
    } catch {
      return fail('provider-unavailable', 'Directions could not be reached.', true);
    }

    switch (outcome.status) {
      case 'Success': {
        const routes = mapPlannedRoutes(outcome, request, new Date(this.now()).toISOString());
        if (routes.length === 0) return fail('no-route', outcome.message ?? undefined, false);

        this.hasRouted = true;
        this.remember(key, routes);
        return ok(routes);
      }
      case 'NotConfigured':
        return this.fallback.route(request);
      case 'NoRoute':
        return fail('no-route', outcome.message ?? undefined, false);
      case 'Unsupported':
        return fail(
          request.travelMode === 'transit' ? 'transit-unavailable' : 'routing-failed',
          outcome.message ?? undefined,
          false
        );
      case 'RateLimited':
        return fail('rate-limited', outcome.message ?? undefined, true);
      case 'AllowanceExhausted':
        return fail('quota-exceeded', outcome.message ?? undefined, false);
      case 'Unavailable':
        return fail('provider-unavailable', outcome.message ?? undefined, true);
      default:
        return fail('routing-failed', outcome.message ?? undefined, false);
    }
  }

  private remember(key: string, routes: Route[]): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: this.now(), routes });
  }
}

/** ~11 m of rounding, so a fix that jittered does not count as a new journey. */
function cacheKey(request: RouteRequest): string {
  const point = (coordinate: GeoCoordinate) =>
    `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`;

  return [
    request.travelMode,
    point(request.origin.coordinate),
    point(request.destination.coordinate),
    ...(request.waypoints ?? []).map((waypoint) => point(waypoint.coordinate)),
    request.alternatives ? 'alt' : 'one',
  ].join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping — exported for tests
// ─────────────────────────────────────────────────────────────────────────────

export function mapPlannedRoutes(
  outcome: RoutePlanOutcome,
  request: RouteRequest,
  computedAt: string
): Route[] {
  return outcome.routes
    .map((wire, index) => mapRoute(wire, index, outcome, request, computedAt))
    .filter((route): route is Route => route !== null);
}

function mapRoute(
  wire: PlannedRouteWire,
  index: number,
  outcome: RoutePlanOutcome,
  request: RouteRequest,
  computedAt: string
): Route | null {
  const mode = request.travelMode;
  const path = wire.geometry.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));

  // A route with no line cannot be drawn or navigated. It is dropped rather than
  // replaced with a straight one.
  if (path.length < 2) return null;

  // Held monotonic, so a leg whose first manoeuvre matched an earlier point on a
  // looping line still gets a stretch of its own rather than an empty one.
  const starts: number[] = [];
  wire.legs.forEach((leg, legIndex) => {
    const found = legIndex === 0 ? 0 : nearestIndex(path, leg.steps[0]?.at ?? null);
    starts.push(Math.max(found, starts[legIndex - 1] ?? 0));
  });
  const segments = wire.legs.map((leg, legIndex) =>
    mapSegment(leg, legIndex, mode, path.slice(starts[legIndex], (starts[legIndex + 1] ?? path.length - 1) + 1), index)
  );

  const rides = segments.filter((segment) => segment.transit);
  const bounds: GeoBoundingBox =
    boundsFromCoordinates(path) ?? boundsFromCoordinates([request.origin.coordinate, request.destination.coordinate])!;

  return {
    id: `${outcome.provider}-${mode}-${index}`,
    travelMode: mode,
    origin: request.origin,
    destination: request.destination,
    waypoints: request.waypoints ?? [],
    segments,
    distance: routeDistance(wire.distanceMetres, mode),
    duration:
      wire.durationInTrafficSeconds == null
        ? { seconds: wire.durationSeconds }
        : { seconds: wire.durationSeconds, inTrafficSeconds: wire.durationInTrafficSeconds },
    path,
    bounds,
    summary: wire.summary ?? (index === 0 ? 'Suggested route' : `Alternative ${index}`),
    isPrimary: index === 0,
    source: 'backend',
    computedAt,
    transferCount: mode === 'transit' ? Math.max(0, rides.length - 1) : undefined,
    departureAt: rides[0]?.transit?.departureAt,
    arrivalAt: rides[rides.length - 1]?.transit?.arrivalAt,
    warnings: wire.warnings ?? [],
    attribution: outcome.attribution ?? undefined,
  };
}

function mapSegment(
  leg: RouteLegWire,
  legIndex: number,
  routeMode: TravelMode,
  path: GeoCoordinate[],
  routeIndex: number
): RouteSegment {
  const mode = WIRE_MODES[leg.mode.toLowerCase()] ?? routeMode;
  const transit: TransitDetail | undefined =
    leg.line || leg.departureStop
      ? {
          mode: 'Transit',
          line: leg.line ?? 'Service',
          headsign: leg.headsign ?? undefined,
          departureStop: leg.departureStop ?? '',
          arrivalStop: leg.arrivalStop ?? '',
          departureAt: leg.departureAt ?? undefined,
          arrivalAt: leg.arrivalAt ?? undefined,
          stopCount: leg.stopCount ?? undefined,
          agency: leg.agency ?? undefined,
        }
      : undefined;

  const instructions: NavigationInstruction[] = leg.steps.map((step, stepIndex) => ({
    id: `${routeIndex}-${legIndex}-${stepIndex}`,
    manoeuvre: (MANOEUVRES as readonly string[]).includes(step.manoeuvre)
      ? (step.manoeuvre as ManoeuvreKind)
      : 'straight',
    text: step.instruction,
    distance: routeDistance(step.distanceMetres, mode),
    duration: { seconds: step.durationSeconds },
    coordinate: step.at ? { latitude: step.at.latitude, longitude: step.at.longitude } : path[0],
    transit: step.manoeuvre === 'board' ? transit : undefined,
  }));

  return {
    id: `${routeIndex}-${legIndex}`,
    travelMode: mode,
    distance: routeDistance(leg.distanceMetres, mode),
    duration: { seconds: leg.durationSeconds },
    path,
    instructions,
    transit,
    summary: transit
      ? `${transit.line}${transit.headsign ? ` towards ${transit.headsign}` : ''}`
      : instructions[0]?.text || modeWord(mode),
  };
}

/** Where along the line a leg begins: the point nearest its first manoeuvre. */
function nearestIndex(path: GeoCoordinate[], at: { latitude: number; longitude: number } | null): number {
  if (!at) return 0;

  let best = 0;
  let bestMetres = Number.POSITIVE_INFINITY;

  path.forEach((point, index) => {
    const metres = distanceBetween(point, at).metres;
    if (metres < bestMetres) {
      bestMetres = metres;
      best = index;
    }
  });

  return best;
}

function modeWord(mode: TravelMode): string {
  return { walking: 'Walk', cycling: 'Cycle', driving: 'Drive', transit: 'Transit' }[mode];
}
