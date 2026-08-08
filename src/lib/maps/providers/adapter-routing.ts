// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — development routing provider (Frontend Phase 8)
//
// ⚠ EVERY ROUTE THIS FILE PRODUCES IS AN ESTIMATE. NO ROUTING PROVIDER IS
//   CONFIGURED. See MAP-PROVIDER-GAP-003 and MAP-PROVIDER-GAP-004. ⚠
//
// This exists so §14–§19 can be built, reviewed and tested in full before a
// routing vendor is chosen. Every value it returns is derived from two things
// this platform genuinely knows — the great-circle distance, and the mode
// speeds `utils/geo.ts` has used for commute badges since before this phase —
// and every one is stamped `source: 'simulated'`, `isRouted: false`.
//
// ── The line this file does not cross ────────────────────────────────────────
//
// It does not invent facts that only a real network could supply:
//
//   * No street names. Instructions say "Head north-east for 400 m", never
//     "Turn left onto Rye Lane". A fabricated street name is indistinguishable
//     from a real one to a member following it, and that is the difference
//     between an estimate and a lie.
//   * No traffic. `TravelTime.inTrafficSeconds` is left absent, so no surface
//     can render a traffic figure — the field simply is not there to read.
//   * No real transit. Line names are generic ("City service"), never a real
//     operator's route number, and departure times are relative offsets rather
//     than timetable entries.
//
// ── Why the geometry is a dogleg ─────────────────────────────────────────────
//
// A straight line between two points is not navigable: the state machine's
// map matching, off-route detection and per-instruction progress all need a
// path with corners. So the adapter bends the line into a small number of legs
// with a deterministic offset, which produces something with the *shape* of a
// route — turns, segment lengths, a manoeuvre at each corner — without
// pretending to follow a road. It looks schematic on the map, which is exactly
// the impression it should give.
//
// Determinism matters: the same origin and destination always yield the same
// route, so a test asserting arrival after N steps is stable and a reviewer
// comparing two screenshots is comparing the same route.
// ─────────────────────────────────────────────────────────────────────────────

import { MAP_PROVIDER_GAPS } from '@/config/map-provider-gaps';
import {
  routeDistance,
  type GeoCoordinate,
  type NavigationInstruction,
  type ManoeuvreKind,
  type Route,
  type RouteRequest,
  type RouteSegment,
  type TravelEstimate,
  type TravelMode,
  type TransitDetail,
} from '@/types/maps';
import {
  bearingBetween,
  boundsFromCoordinates,
  distanceBetween,
  interpolate,
  offsetCoordinate,
  pathLengthMetres,
  toKm,
} from '../geo';
import { fail, ok, type ProviderResult, type RoutingProvider } from './types';

/**
 * How much longer a real journey is than the crow-flies distance.
 *
 * These are not invented. They are the widely-used circuity ratios for urban
 * street networks: a pedestrian on a dense grid walks ~20% further than the
 * straight line, a car ~30% because it is constrained to a coarser network and
 * to one-way systems, and a transit journey ~45% because it must route via
 * stops that were not placed for this trip.
 *
 * They are still estimates and the UI says so. Their job is to keep the number
 * in the right neighbourhood rather than to be right.
 */
const DETOUR_FACTOR: Record<TravelMode, number> = {
  walking: 1.2,
  cycling: 1.25,
  driving: 1.3,
  transit: 1.45,
};

/** Legs the dogleg is broken into, per mode. More legs, more manoeuvres. */
const LEG_COUNT: Record<TravelMode, number> = {
  walking: 3,
  cycling: 3,
  driving: 4,
  transit: 3,
};

/** Below this, a route is a single leg — a dogleg over 80 m is nonsense. */
const MIN_DOGLEG_METRES = 150;

function seedFrom(origin: GeoCoordinate, destination: GeoCoordinate): number {
  // A small deterministic value in [0,1) from the coordinates, so the same pair
  // always bends the same way. Rounded first, so a one-metre difference in the
  // origin does not produce a visibly different route on a re-render.
  const key =
    Math.round(origin.latitude * 1000) * 7919 +
    Math.round(origin.longitude * 1000) * 104_729 +
    Math.round(destination.latitude * 1000) * 15_485_863 +
    Math.round(destination.longitude * 1000) * 32_452_843;
  return (Math.abs(key) % 1000) / 1000;
}

/**
 * Duration for a distance and mode.
 *
 * Reuses `getCommuteTimeEstimate`, which is the platform's existing answer and
 * is already on screen next to every distance badge. Two different speed models
 * would mean the map and the listing card disagreed about the same journey.
 * That function returns a formatted string, so this parses its own inputs back
 * out rather than re-deriving speeds — the numbers below mirror it exactly and
 * a change there should be mirrored here.
 */
const SPEED_KMH: Record<TravelMode, number> = {
  walking: 5,
  cycling: 15,
  driving: 40,
  transit: 20,
};

const FIXED_OVERHEAD_S: Record<TravelMode, number> = {
  walking: 0,
  cycling: 0,
  driving: 120,
  // Waiting for a service is most of a short transit journey's duration, and
  // omitting it makes transit look implausibly competitive over 2 km.
  transit: 300,
};

function durationSeconds(metres: number, mode: TravelMode): number {
  const hours = metres / 1000 / SPEED_KMH[mode];
  return Math.round(hours * 3600 + FIXED_OVERHEAD_S[mode]);
}

/** Builds the bent path. Deterministic in its inputs. */
function buildPath(
  origin: GeoCoordinate,
  destination: GeoCoordinate,
  mode: TravelMode,
  variant: number
): GeoCoordinate[] {
  const direct = distanceBetween(origin, destination).metres;
  if (direct < MIN_DOGLEG_METRES) return [origin, destination];

  const legs = LEG_COUNT[mode];
  const seed = seedFrom(origin, destination);
  const bearing = bearingBetween(origin, destination);

  // The lateral offset that makes the route bend. Scaled from the trip length
  // so a 20 km drive bows proportionally rather than by a fixed 200 m, and
  // capped so a cross-country route does not bow into the sea.
  const amplitude = Math.min(direct * 0.08, 600) * (0.6 + seed * 0.8);
  const side = variant % 2 === 0 ? 1 : -1;

  const path: GeoCoordinate[] = [origin];

  for (let i = 1; i < legs; i += 1) {
    const t = i / legs;
    const base = interpolate(origin, destination, t);
    // A sine bow: zero at both ends, maximum in the middle. Ends that met the
    // endpoints at an angle would put a spurious turn at the front door.
    const lateral = Math.sin(t * Math.PI) * amplitude * side * (1 + (variant % 3) * 0.35);
    path.push(offsetCoordinate(base, Math.abs(lateral), bearing + (lateral >= 0 ? 90 : -90)));
  }

  path.push(destination);
  return path;
}

/** Names a bearing in words, since the adapter has no street names to use. */
function compassOf(bearing: number): string {
  const points = [
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
  ];
  return points[Math.round(bearing / 45) % 8];
}

function manoeuvreFor(previousBearing: number, nextBearing: number): ManoeuvreKind {
  let delta = ((nextBearing - previousBearing + 540) % 360) - 180;

  if (Math.abs(delta) < 20) return 'straight';
  if (Math.abs(delta) > 150) return 'uturn';
  if (delta > 0) return delta > 60 ? 'turn-right' : 'slight-right';
  delta = -delta;
  return delta > 60 ? 'turn-left' : 'slight-left';
}

function buildInstructions(
  path: GeoCoordinate[],
  mode: TravelMode,
  idPrefix: string
): NavigationInstruction[] {
  const instructions: NavigationInstruction[] = [];
  const verb = mode === 'walking' ? 'Walk' : mode === 'cycling' ? 'Cycle' : 'Continue';

  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i];
    const to = path[i + 1];
    const legMetres = distanceBetween(from, to).metres;
    const bearing = bearingBetween(from, to);

    const manoeuvre: ManoeuvreKind =
      i === 0 ? 'depart' : manoeuvreFor(bearingBetween(path[i - 1], from), bearing);

    // Deliberately geographic rather than street-named. See the header.
    const text =
      i === 0
        ? `Head ${compassOf(bearing)} for ${formatMetres(legMetres)}`
        : manoeuvre === 'straight'
          ? `${verb} ${compassOf(bearing)} for ${formatMetres(legMetres)}`
          : `Bear ${manoeuvre.includes('left') ? 'left' : 'right'} and continue ${compassOf(
              bearing
            )} for ${formatMetres(legMetres)}`;

    instructions.push({
      id: `${idPrefix}-i${i}`,
      manoeuvre,
      text,
      distance: routeDistance(legMetres, mode),
      duration: { seconds: durationSeconds(legMetres, mode) },
      coordinate: from,
    });
  }

  instructions.push({
    id: `${idPrefix}-arrive`,
    manoeuvre: 'arrive',
    text: 'Arrive at your destination',
    distance: routeDistance(0, mode),
    duration: { seconds: 0 },
    coordinate: path[path.length - 1],
  });

  return instructions;
}

function formatMetres(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * A transit itinerary: walk, ride, walk.
 *
 * The shape is real — every transit journey has access and egress legs, and
 * §16 asks for the walking and riding portions to be shown separately — but
 * the service is generic on purpose. "City service 1" is obviously not a real
 * route number; naming a real one would be the fabrication this adapter avoids.
 */
function buildTransitSegments(
  path: GeoCoordinate[],
  request: RouteRequest,
  idPrefix: string
): RouteSegment[] {
  const total = pathLengthMetres(path);
  const boardAt = interpolate(path[0], path[1] ?? path[path.length - 1], 0.35);
  const alightAt = interpolate(path[path.length - 2] ?? path[0], path[path.length - 1], 0.65);

  const walkIn = [path[0], boardAt];
  const ride = [boardAt, ...path.slice(1, -1), alightAt];
  const walkOut = [alightAt, path[path.length - 1]];

  const departure = request.departureAt ? new Date(request.departureAt) : new Date();
  const walkInSeconds = durationSeconds(pathLengthMetres(walkIn), 'walking');
  // A wait, stated as a wait. Members plan around this number, so hiding it
  // inside the ride duration would make the itinerary unusable.
  const waitSeconds = 240;
  const rideSeconds = durationSeconds(pathLengthMetres(ride), 'transit');

  const boardTime = new Date(departure.getTime() + (walkInSeconds + waitSeconds) * 1000);
  const alightTime = new Date(boardTime.getTime() + rideSeconds * 1000);

  const transit: TransitDetail = {
    mode: 'Bus',
    line: 'City service 1',
    headsign: 'Towards the city centre',
    departureStop: 'Nearest stop to your start',
    arrivalStop: 'Nearest stop to your destination',
    departureAt: boardTime.toISOString(),
    arrivalAt: alightTime.toISOString(),
    stopCount: Math.max(2, Math.round(total / 900)),
    agency: 'Local operator',
  };

  return [
    {
      id: `${idPrefix}-walk-in`,
      travelMode: 'walking',
      distance: routeDistance(pathLengthMetres(walkIn), 'walking'),
      duration: { seconds: walkInSeconds },
      path: walkIn,
      instructions: buildInstructions(walkIn, 'walking', `${idPrefix}-wi`),
      summary: 'Walk to the stop',
    },
    {
      id: `${idPrefix}-ride`,
      travelMode: 'transit',
      distance: routeDistance(pathLengthMetres(ride), 'transit'),
      duration: { seconds: rideSeconds + waitSeconds },
      path: ride,
      instructions: [
        {
          id: `${idPrefix}-board`,
          manoeuvre: 'board',
          text: `Board ${transit.line} towards ${transit.headsign}`,
          distance: routeDistance(0, 'transit'),
          duration: { seconds: waitSeconds },
          coordinate: boardAt,
          transit,
        },
        {
          id: `${idPrefix}-alight`,
          manoeuvre: 'alight',
          text: `Alight after about ${transit.stopCount} stops`,
          distance: routeDistance(pathLengthMetres(ride), 'transit'),
          duration: { seconds: rideSeconds },
          coordinate: alightAt,
          transit,
        },
      ],
      summary: `${transit.line} · about ${transit.stopCount} stops`,
      transit,
    },
    {
      id: `${idPrefix}-walk-out`,
      travelMode: 'walking',
      distance: routeDistance(pathLengthMetres(walkOut), 'walking'),
      duration: { seconds: durationSeconds(pathLengthMetres(walkOut), 'walking') },
      path: walkOut,
      instructions: buildInstructions(walkOut, 'walking', `${idPrefix}-wo`),
      summary: 'Walk to your destination',
    },
  ];
}

function buildRoute(request: RouteRequest, variant: number): Route {
  const mode = request.travelMode;
  const stops = [request.origin, ...(request.waypoints ?? []), request.destination];
  const idPrefix = `adapter-${mode}-${variant}`;

  // Waypoints produce one sub-path per hop, concatenated. Building the whole
  // thing as a single bend would route through the waypoints only by accident.
  const path: GeoCoordinate[] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const leg = buildPath(stops[i].coordinate, stops[i + 1].coordinate, mode, variant + i);
    path.push(...(i === 0 ? leg : leg.slice(1)));
  }

  const geometryMetres = pathLengthMetres(path);
  // The bend already adds length; the detour factor accounts for the rest of
  // what a real network would add. Applied to the *distance figure* rather than
  // to the drawn geometry, because a drawn line that did not match its own
  // stated length would be visibly wrong.
  const statedMetres = Math.round(
    Math.max(geometryMetres, distanceBetween(stops[0].coordinate, stops[stops.length - 1].coordinate).metres) *
      DETOUR_FACTOR[mode] *
      // Alternatives are longer than the primary, which is what makes them
      // alternatives rather than duplicates.
      (1 + variant * 0.08)
  );

  const segments =
    mode === 'transit'
      ? buildTransitSegments(path, request, idPrefix)
      : [
          {
            id: `${idPrefix}-s0`,
            travelMode: mode,
            distance: routeDistance(statedMetres, mode),
            duration: { seconds: durationSeconds(statedMetres, mode) },
            path,
            instructions: buildInstructions(path, mode, idPrefix),
            summary: summaryFor(mode, statedMetres),
          },
        ];

  const totalSeconds = segments.reduce((sum, s) => sum + s.duration.seconds, 0);
  const totalMetres = segments.reduce((sum, s) => sum + s.distance.metres, 0);
  const bounds = boundsFromCoordinates(path) ?? {
    north: stops[0].coordinate.latitude,
    south: stops[0].coordinate.latitude,
    east: stops[0].coordinate.longitude,
    west: stops[0].coordinate.longitude,
  };

  return {
    id: idPrefix,
    travelMode: mode,
    origin: request.origin,
    destination: request.destination,
    waypoints: request.waypoints ?? [],
    segments,
    distance: routeDistance(totalMetres, mode),
    // No `inTrafficSeconds`. The field's absence is what stops any surface
    // rendering a traffic figure this adapter cannot know.
    duration: { seconds: totalSeconds },
    path,
    bounds,
    summary:
      variant === 0
        ? summaryFor(mode, totalMetres)
        : `${summaryFor(mode, totalMetres)} · alternative ${variant}`,
    isPrimary: variant === 0,
    source: 'simulated',
    computedAt: new Date().toISOString(),
    transferCount: mode === 'transit' ? 0 : undefined,
    departureAt: mode === 'transit' ? (request.departureAt ?? new Date().toISOString()) : undefined,
    arrivalAt:
      mode === 'transit'
        ? new Date(
            (request.departureAt ? new Date(request.departureAt).getTime() : Date.now()) +
              totalSeconds * 1000
          ).toISOString()
        : undefined,
  };
}

function summaryFor(mode: TravelMode, metres: number): string {
  const label =
    mode === 'walking'
      ? 'Walking'
      : mode === 'cycling'
        ? 'Cycling'
        : mode === 'driving'
          ? 'Driving'
          : 'Transit';
  return `${label} · ${formatMetres(metres)}`;
}

/**
 * The development routing provider.
 *
 * Declares every mode as supported, and `supportsTraffic: false`. That second
 * flag is what the driving screen reads to decide whether it may show a traffic
 * line at all — the honest answer is no, and it comes from the provider rather
 * than from a screen remembering.
 */
export class AdapterRoutingProvider implements RoutingProvider {
  descriptor = {
    id: 'adapter-routing',
    label: 'Estimated routing',
    isSimulated: true,
    gapKey: MAP_PROVIDER_GAPS.routing.key,
  };

  supportedModes: TravelMode[] = ['walking', 'driving', 'transit', 'cycling'];
  supportsTraffic = false;

  async estimate(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    travelMode: TravelMode
  ): Promise<ProviderResult<TravelEstimate>> {
    const direct = distanceBetween(origin, destination).metres;
    if (!Number.isFinite(direct)) {
      return fail('invalid-coordinates', 'One of the coordinates is not usable.', false);
    }

    const metres = Math.round(direct * DETOUR_FACTOR[travelMode]);

    return ok({
      travelMode,
      distance: routeDistance(metres, travelMode),
      duration: { seconds: durationSeconds(metres, travelMode) },
      source: 'simulated',
      // The field every surface checks before it is allowed to call this a
      // walking time rather than an estimate.
      isRouted: false,
    });
  }

  async route(request: RouteRequest): Promise<ProviderResult<Route[]>> {
    const { origin, destination } = request;

    if (!Number.isFinite(origin.coordinate.latitude) || !Number.isFinite(destination.coordinate.latitude)) {
      return fail('invalid-coordinates', 'The start or end point is not usable.', false);
    }

    const direct = distanceBetween(origin.coordinate, destination.coordinate);

    // A real provider returns "no route" for an unreachable pair. The only
    // honest analogue here is a distance no ground journey covers — routing
    // London to Port Louis by bus is not a long route, it is not a route.
    if (toKm(direct) > 2000 && request.travelMode !== 'driving') {
      return fail('no-route', 'There is no ground route between these two places.', false);
    }

    const variants = request.alternatives ? [0, 1, 2] : [0];
    return ok(variants.map((v) => buildRoute(request, v)));
  }
}

export const adapterRoutingProvider = new AdapterRoutingProvider();

/**
 * A provider that refuses everything, for a production build with no routing.
 *
 * Returns `provider-unavailable` rather than throwing, so §44's "fall back
 * gracefully, do not crash" is the default path rather than something each
 * screen has to arrange.
 */
export class UnavailableRoutingProvider implements RoutingProvider {
  descriptor = {
    id: 'unavailable',
    label: 'Routing unavailable',
    isSimulated: false,
    gapKey: MAP_PROVIDER_GAPS.routing.key,
  };

  supportedModes: TravelMode[] = [];
  supportsTraffic = false;

  // The parameters are declared and unused on purpose: this class stands in for
  // a real provider at the same call sites, and a narrower signature would make
  // it structurally incompatible with `RoutingProvider` the moment a caller
  // passed arguments — which every caller does.
  async estimate(
    _origin: GeoCoordinate,
    _destination: GeoCoordinate,
    _travelMode: TravelMode
  ): Promise<ProviderResult<TravelEstimate>> {
    return fail('provider-unavailable', 'No routing provider is configured.', false);
  }

  async route(_request: RouteRequest): Promise<ProviderResult<Route[]>> {
    return fail('provider-unavailable', 'No routing provider is configured.', false);
  }
}

export const unavailableRoutingProvider = new UnavailableRoutingProvider();
