// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — navigation state machine (Frontend Phase 8, §19)
//
// A pure reducer over `NavigationState`. No React, no map, no provider, no
// clock beyond what the caller passes in.
//
// ── Why this is a reducer and not a screen ───────────────────────────────────
//
// §19 lists thirteen states. Written as flags on a screen, that is thirteen
// booleans and a large number of combinations that mean nothing — `isNavigating
// && isOffRoute && isRecalculating && locationWentStale` is four flags and one
// real situation, and the screen has to get every guard right at 3 a.m. inside
// a render.
//
// As a reducer it is one `phase` field, a set of events, and a transition table
// that is exhaustively testable without a device, a GPS fix or a route. Every
// interesting sequence in §18 — drift off-route, recalculate, drift again,
// exhaust the retries, lose permission mid-journey, arrive — is a list of
// events applied to an initial state, which is what `navigation-machine.test.ts`
// does.
//
// ── The three decisions that are not obvious ─────────────────────────────────
//
//   **Off-route requires confirmation.** A single fix 60 m off the line is
//   usually a GPS bounce off a building, not a wrong turn. Recalculating on it
//   produces the behaviour everybody has experienced where the route flickers
//   while you stand still at a junction. `OFF_ROUTE_CONFIRMATIONS` consecutive
//   bad fixes are required, and one good fix resets the counter.
//
//   **Recalculation is bounded.** A member walking through an area the route
//   data does not cover would otherwise recalculate forever, burning battery
//   and data. After `MAX_RECALCULATIONS` the machine stops and says so, which
//   is a worse outcome for the member than a working route and a much better
//   one than a phone that gets hot and never arrives.
//
//   **Arrival is checked before off-route.** Someone who walks the last 40 m
//   across a car park is simultaneously arrived and off-route. Testing arrival
//   first means they are told they have arrived rather than being sent round
//   the block.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ARRIVAL_THRESHOLD_METRES,
  MAX_RECALCULATIONS,
  OFF_ROUTE_CONFIRMATIONS,
  OFF_ROUTE_THRESHOLD_METRES,
  routeDistance,
  straightLine,
  type DeviceLocation,
  type MapErrorKind,
  type NavigationInstruction,
  type NavigationProgress,
  type NavigationState,
  type Route,
} from '@/types/maps';
import { distanceBetween, distanceToPath, pathLengthMetres } from './geo';

export type NavigationEvent =
  /** The member chose a destination. */
  | { type: 'PLAN' }
  /** A route request went out. */
  | { type: 'ROUTE_REQUESTED' }
  /** Routes came back. The first is treated as selected. */
  | { type: 'ROUTE_LOADED'; routes: Route[] }
  | { type: 'ROUTE_FAILED'; error: MapErrorKind; detail?: string }
  /** The member picked a different alternative before starting. */
  | { type: 'ROUTE_SELECTED'; routeId: string }
  | { type: 'START' }
  /** A position fix arrived. The workhorse event. */
  | { type: 'POSITION'; location: DeviceLocation }
  /** A recalculated route came back. */
  | { type: 'RECALCULATED'; route: Route }
  | { type: 'RECALCULATION_FAILED'; error: MapErrorKind }
  | { type: 'CANCEL' }
  | { type: 'PERMISSION_LOST' }
  | { type: 'LOCATION_LOST' }
  | { type: 'PROVIDER_UNAVAILABLE' }
  | { type: 'RESET' };

export function initialNavigationState(): NavigationState {
  return {
    phase: 'Idle',
    route: null,
    alternatives: [],
    progress: null,
    position: null,
    recalculationCount: 0,
  };
}

/** Phases in which a position fix is worth processing at all. */
const LIVE_PHASES: NavigationState['phase'][] = ['Navigating', 'OffRoute', 'Recalculating'];

export function navigationReducer(
  state: NavigationState,
  event: NavigationEvent
): NavigationState {
  switch (event.type) {
    case 'RESET':
      return initialNavigationState();

    case 'PLAN':
      return { ...initialNavigationState(), phase: 'Planning' };

    case 'ROUTE_REQUESTED':
      // Reachable from `RouteReady` too — changing the travel mode re-plans
      // without going back through `Planning`, which would drop the endpoints.
      return { ...state, phase: 'RouteLoading', error: undefined, errorDetail: undefined };

    case 'ROUTE_LOADED': {
      if (event.routes.length === 0) {
        return { ...state, phase: 'Failed', error: 'no-route', route: null, alternatives: [] };
      }
      const primary = event.routes.find((r) => r.isPrimary) ?? event.routes[0];
      return {
        ...state,
        phase: 'RouteReady',
        route: primary,
        alternatives: event.routes,
        progress: null,
        recalculationCount: 0,
        error: undefined,
        errorDetail: undefined,
      };
    }

    case 'ROUTE_FAILED':
      return {
        ...state,
        // A provider that is not there at all is a different member-facing
        // state from a route that could not be computed, and §19 names both.
        phase: event.error === 'provider-unavailable' ? 'ProviderUnavailable' : 'Failed',
        route: null,
        alternatives: [],
        error: event.error,
        errorDetail: event.detail,
      };

    case 'ROUTE_SELECTED': {
      const selected = state.alternatives.find((r) => r.id === event.routeId);
      // Only before departure. Swapping the route from under a member who is
      // already following it is how you send somebody the wrong way.
      if (!selected || state.phase !== 'RouteReady') return state;
      return { ...state, route: selected };
    }

    case 'START': {
      if (!state.route || state.phase !== 'RouteReady') return state;
      return {
        ...state,
        phase: 'Navigating',
        recalculationCount: 0,
        progress: state.position
          ? computeProgress(state.route, state.position)
          : initialProgress(state.route),
      };
    }

    case 'POSITION': {
      // Recorded even outside a live phase — the route planner uses it as the
      // default origin — but no progress is computed and no transition happens.
      if (!LIVE_PHASES.includes(state.phase) || !state.route) {
        return { ...state, position: event.location };
      }

      const route = state.route;
      const progress = computeProgress(route, event.location);
      const toDestination = distanceBetween(
        event.location.coordinate,
        route.destination.coordinate
      );

      // Arrival first. See the header: the last few metres of a journey are
      // frequently off the routed line, and being told to turn around in a car
      // park is the worst moment to be wrong.
      if (toDestination.metres <= ARRIVAL_THRESHOLD_METRES) {
        return {
          ...state,
          phase: 'Arrived',
          position: event.location,
          progress,
          offRouteBy: undefined,
        };
      }

      const match = distanceToPath(event.location.coordinate, route.path);
      const isOff = match.distance.metres > OFF_ROUTE_THRESHOLD_METRES;

      if (!isOff) {
        // One good fix clears the counter. Deliberately not decrementing: a
        // member weaving in and out of tolerance is on the route, and a
        // decrementing counter would eventually trip on accumulated noise.
        return {
          ...state,
          phase: 'Navigating',
          position: event.location,
          progress,
          offRouteBy: undefined,
        };
      }

      // Already recalculating: keep the fix, do not restart the count. The
      // route in hand is stale by definition, so further off-route evidence
      // against it means nothing.
      if (state.phase === 'Recalculating') {
        return { ...state, position: event.location, offRouteBy: match.distance };
      }

      const confirmations = state.phase === 'OffRoute' ? bumpConfirmations(state) : 1;

      if (confirmations < OFF_ROUTE_CONFIRMATIONS) {
        return {
          ...state,
          phase: 'OffRoute',
          position: event.location,
          progress,
          offRouteBy: match.distance,
          ...withConfirmations(confirmations),
        };
      }

      if (state.recalculationCount >= MAX_RECALCULATIONS) {
        return {
          ...state,
          phase: 'Failed',
          position: event.location,
          offRouteBy: match.distance,
          error: 'routing-failed',
          errorDetail:
            'We have not been able to get you back on route. You may be somewhere we do not have route data for.',
        };
      }

      return {
        ...state,
        phase: 'Recalculating',
        position: event.location,
        progress,
        offRouteBy: match.distance,
        recalculationCount: state.recalculationCount + 1,
        ...withConfirmations(0),
      };
    }

    case 'RECALCULATED': {
      if (state.phase !== 'Recalculating') return state;
      return {
        ...state,
        phase: 'Navigating',
        route: event.route,
        // The alternatives belonged to the abandoned route and are no longer
        // alternatives to anything. Keeping them would let the member pick a
        // route that no longer starts where they are.
        alternatives: [event.route],
        progress: state.position
          ? computeProgress(event.route, state.position)
          : initialProgress(event.route),
        offRouteBy: undefined,
        ...withConfirmations(0),
      };
    }

    case 'RECALCULATION_FAILED':
      return {
        ...state,
        // Back to OffRoute rather than Failed: the member is still on a journey
        // with a route in hand, it is simply the wrong one, and the next fix
        // may well put them back on it.
        phase: 'OffRoute',
        error: event.error,
        errorDetail: 'We could not update your route. Following the original one.',
      };

    case 'CANCEL':
      return {
        ...initialNavigationState(),
        phase: 'Cancelled',
        // The last position is kept so the map does not jump on cancel.
        position: state.position,
      };

    case 'PERMISSION_LOST':
      return { ...state, phase: 'PermissionDenied', error: 'location-permission-denied' };

    case 'LOCATION_LOST':
      // Only meaningful mid-journey. Losing a fix while a route is merely
      // planned is not a navigation failure — the route is still valid.
      if (!LIVE_PHASES.includes(state.phase)) return state;
      return { ...state, phase: 'LocationUnavailable', error: 'location-unavailable' };

    case 'PROVIDER_UNAVAILABLE':
      return { ...state, phase: 'ProviderUnavailable', error: 'provider-unavailable' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Off-route confirmations
//
// Held in `progress.segmentIndex`'s sibling rather than in the public state,
// because it is machine bookkeeping and not something a screen should render.
// Kept as a non-enumerable-ish extra field on the state object: adding it to
// `NavigationState` would put an implementation detail in the domain model that
// every consumer would then see and wonder about.
// ─────────────────────────────────────────────────────────────────────────────

interface WithConfirmations {
  __offRouteConfirmations?: number;
}

function bumpConfirmations(state: NavigationState): number {
  return ((state as NavigationState & WithConfirmations).__offRouteConfirmations ?? 0) + 1;
}

function withConfirmations(count: number): WithConfirmations {
  return { __offRouteConfirmations: count };
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

/** Progress before the first fix: the whole route still ahead. */
export function initialProgress(route: Route): NavigationProgress {
  const instructions = allInstructions(route);

  return {
    currentInstruction: instructions[0] ?? null,
    nextInstruction: instructions[1] ?? null,
    distanceToInstruction: straightLine(0),
    remainingDistance: route.distance,
    remainingDuration: route.duration,
    estimatedArrivalAt: new Date(Date.now() + route.duration.seconds * 1000).toISOString(),
    fractionTravelled: 0,
    segmentIndex: 0,
  };
}

/**
 * Where the member is along the route, and what they should do next.
 *
 * Everything here is derived from geometry. It is exactly as correct as the
 * route it is given — which means it is *real* even when the route came from
 * the development adapter, and it is the reason the navigation experience is
 * reviewable today rather than after a provider lands.
 */
export function computeProgress(route: Route, location: DeviceLocation): NavigationProgress {
  const match = distanceToPath(location.coordinate, route.path);
  const instructions = allInstructions(route);

  // Remaining distance as a suffix from the matched point, not as
  // `total × (1 − fraction)`. The proportional form drifts badly on a route
  // with uneven segment lengths — a 5 km motorway leg followed by a 200 m
  // street would report a remaining distance that jumps at the junction.
  const remainingMetres = remainingFromMatch(route, match.segmentIndex, location);

  const currentIndex = instructionIndexFor(route, match.segmentIndex);
  const current = instructions[currentIndex] ?? null;

  // Speed-aware where the device reports it, otherwise the route's own average.
  // A member stopped at a crossing has speed 0, which would produce an infinite
  // arrival time, so the average is the floor.
  const averageSpeed =
    route.distance.metres > 0 ? route.distance.metres / Math.max(route.duration.seconds, 1) : 1.4;
  const speed = location.speed && location.speed > 0.5 ? location.speed : averageSpeed;
  const remainingSeconds = Math.round(remainingMetres / Math.max(speed, 0.3));

  return {
    currentInstruction: current,
    nextInstruction: instructions[currentIndex + 1] ?? null,
    distanceToInstruction: current
      ? distanceBetween(location.coordinate, current.coordinate)
      : straightLine(0),
    remainingDistance: routeDistance(Math.round(remainingMetres), route.travelMode),
    remainingDuration: { seconds: remainingSeconds },
    estimatedArrivalAt: new Date(Date.now() + remainingSeconds * 1000).toISOString(),
    fractionTravelled: match.fraction,
    segmentIndex: segmentIndexFor(route, match.segmentIndex),
  };
}

function remainingFromMatch(
  route: Route,
  pathIndex: number,
  location: DeviceLocation
): number {
  if (route.path.length < 2) return 0;

  const clamped = Math.max(0, Math.min(pathIndex, route.path.length - 2));

  // From the member to the end of the segment they are on...
  let remaining = distanceBetween(location.coordinate, route.path[clamped + 1]).metres;
  // ...plus every segment after it.
  remaining += pathLengthMetres(route.path.slice(clamped + 1));

  return remaining;
}

function allInstructions(route: Route): NavigationInstruction[] {
  return route.segments.flatMap((segment) => segment.instructions);
}

/**
 * Which instruction corresponds to a point on the path.
 *
 * Instructions are emitted one per path vertex plus a final arrival, so the
 * mapping is the identity, bounded. Written as a function rather than inlined
 * because a real provider's instruction density is *not* one per vertex — it
 * emits one per manoeuvre over a much denser geometry — and this is the single
 * place that assumption will need to change.
 */
function instructionIndexFor(route: Route, pathIndex: number): number {
  const total = allInstructions(route).length;
  return Math.max(0, Math.min(pathIndex, total - 1));
}

/** Which `RouteSegment` a path vertex belongs to. Matters for transit legs. */
function segmentIndexFor(route: Route, pathIndex: number): number {
  let consumed = 0;
  for (let i = 0; i < route.segments.length; i += 1) {
    // Segments after the first share their opening vertex with the previous
    // segment's closing one, hence the −1.
    consumed += route.segments[i].path.length - (i === 0 ? 0 : 1);
    if (pathIndex < consumed) return i;
  }
  return Math.max(0, route.segments.length - 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Whether the machine is in a state where a member is actively travelling. */
export function isNavigating(state: NavigationState): boolean {
  return LIVE_PHASES.includes(state.phase);
}

/** Whether the screen should keep a position watch open. §6: battery. */
export function requiresPositionWatch(state: NavigationState): boolean {
  return isNavigating(state);
}

/** One line describing the current phase, for the status banner and for a11y. */
export function navigationPhaseLabel(state: NavigationState): string {
  switch (state.phase) {
    case 'Idle':
      return 'Not navigating';
    case 'Planning':
      return 'Choose where you are going';
    case 'RouteLoading':
      return 'Working out your route';
    case 'RouteReady':
      return 'Route ready';
    case 'Navigating':
      return 'Navigating';
    case 'OffRoute':
      return 'You have moved off the route';
    case 'Recalculating':
      return 'Updating your route';
    case 'Arrived':
      return 'You have arrived';
    case 'Cancelled':
      return 'Navigation cancelled';
    case 'Failed':
      return 'Navigation could not continue';
    case 'LocationUnavailable':
      return 'We cannot find your position';
    case 'PermissionDenied':
      return 'Location access is off';
    case 'ProviderUnavailable':
      return 'Navigation is not available in this build';
  }
}
