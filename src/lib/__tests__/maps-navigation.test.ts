// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — navigation state machine (Frontend Phase 8, §18, §19, §52)
//
// Every state in §19 and every transition between them, exercised without a
// map, a device or a provider. This is the file that makes the unhappy paths
// reviewable: drifting off-route while a recalculation is already in flight,
// losing permission mid-journey, exhausting the retries in an area with no
// route data, and arriving off the routed line.
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeProgress,
  initialNavigationState,
  initialProgress,
  isNavigating,
  navigationPhaseLabel,
  navigationReducer,
  requiresPositionWatch,
} from '@/lib/maps/navigation-machine';
import { offsetCoordinate } from '@/lib/maps/geo';
import {
  MAX_RECALCULATIONS,
  OFF_ROUTE_CONFIRMATIONS,
  routeDistance,
  type DeviceLocation,
  type GeoCoordinate,
  type NavigationState,
  type Route,
} from '@/types/maps';
import type { NavigationEvent as Event } from '@/lib/maps/navigation-machine';

const START: GeoCoordinate = { latitude: 51.4742, longitude: -0.0691 };

/** A straight 1 km route east, with four vertices. */
function makeRoute(overrides: Partial<Route> = {}): Route {
  const path = [
    START,
    offsetCoordinate(START, 250, 90),
    offsetCoordinate(START, 500, 90),
    offsetCoordinate(START, 750, 90),
    offsetCoordinate(START, 1000, 90),
  ];

  const instructions = path.map((coordinate, index) => ({
    id: `i${index}`,
    manoeuvre: index === 0 ? ('depart' as const) : ('straight' as const),
    text: `Step ${index}`,
    distance: routeDistance(250, 'walking'),
    duration: { seconds: 180 },
    coordinate,
  }));

  return {
    id: 'route-1',
    travelMode: 'walking',
    origin: { id: 'o', coordinate: START, label: 'Start' },
    destination: { id: 'd', coordinate: path[path.length - 1], label: 'End' },
    waypoints: [],
    segments: [
      {
        id: 's0',
        travelMode: 'walking',
        distance: routeDistance(1000, 'walking'),
        duration: { seconds: 720 },
        path,
        instructions,
        summary: 'Walking · 1.0 km',
      },
    ],
    distance: routeDistance(1000, 'walking'),
    duration: { seconds: 720 },
    path,
    bounds: { north: 51.475, south: 51.473, east: -0.055, west: -0.07 },
    summary: 'Walking · 1.0 km',
    isPrimary: true,
    source: 'simulated',
    computedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fix(coordinate: GeoCoordinate, speed?: number): DeviceLocation {
  return { coordinate, timestamp: Date.now(), source: 'simulated', speed };
}

function run(events: Event[], from: NavigationState = initialNavigationState()): NavigationState {
  return events.reduce(navigationReducer, from);
}

/** Reaches `Navigating` with a loaded route, which most tests start from. */
function navigating(route = makeRoute()): NavigationState {
  return run([
    { type: 'PLAN' },
    { type: 'ROUTE_REQUESTED' },
    { type: 'ROUTE_LOADED', routes: [route] },
    { type: 'START' },
  ]);
}

describe('the happy path', () => {
  it('walks Idle → Planning → RouteLoading → RouteReady → Navigating → Arrived', () => {
    const route = makeRoute();

    let state = initialNavigationState();
    expect(state.phase).toBe('Idle');

    state = navigationReducer(state, { type: 'PLAN' });
    expect(state.phase).toBe('Planning');

    state = navigationReducer(state, { type: 'ROUTE_REQUESTED' });
    expect(state.phase).toBe('RouteLoading');

    state = navigationReducer(state, { type: 'ROUTE_LOADED', routes: [route] });
    expect(state.phase).toBe('RouteReady');
    expect(state.route).toBe(route);

    state = navigationReducer(state, { type: 'START' });
    expect(state.phase).toBe('Navigating');
    expect(state.progress).not.toBeNull();

    state = navigationReducer(state, { type: 'POSITION', location: fix(route.destination.coordinate) });
    expect(state.phase).toBe('Arrived');
  });

  it('reports progress that decreases as the member advances', () => {
    const route = makeRoute();
    let state = navigating(route);

    const first = navigationReducer(state, {
      type: 'POSITION',
      location: fix(offsetCoordinate(START, 100, 90)),
    });
    const later = navigationReducer(first, {
      type: 'POSITION',
      location: fix(offsetCoordinate(START, 700, 90)),
    });

    expect(later.progress!.remainingDistance.metres).toBeLessThan(
      first.progress!.remainingDistance.metres
    );
    expect(later.progress!.fractionTravelled).toBeGreaterThan(first.progress!.fractionTravelled);
  });
});

describe('alternatives', () => {
  it('selects the primary route from a set', () => {
    const primary = makeRoute({ id: 'a', isPrimary: true });
    const alternative = makeRoute({ id: 'b', isPrimary: false });

    const state = run([
      { type: 'PLAN' },
      { type: 'ROUTE_LOADED', routes: [alternative, primary] },
    ]);

    expect(state.route?.id).toBe('a');
    expect(state.alternatives).toHaveLength(2);
  });

  it('lets the member switch before departure', () => {
    const a = makeRoute({ id: 'a' });
    const b = makeRoute({ id: 'b', isPrimary: false });

    const state = run([
      { type: 'PLAN' },
      { type: 'ROUTE_LOADED', routes: [a, b] },
      { type: 'ROUTE_SELECTED', routeId: 'b' },
    ]);

    expect(state.route?.id).toBe('b');
  });

  it('refuses to switch the route mid-journey', () => {
    // Swapping the route from under somebody already following it is how you
    // send them the wrong way.
    const a = makeRoute({ id: 'a' });
    const b = makeRoute({ id: 'b', isPrimary: false });

    const state = run([
      { type: 'PLAN' },
      { type: 'ROUTE_LOADED', routes: [a, b] },
      { type: 'START' },
      { type: 'ROUTE_SELECTED', routeId: 'b' },
    ]);

    expect(state.route?.id).toBe('a');
  });

  it('ignores an unknown route id', () => {
    const state = run([
      { type: 'PLAN' },
      { type: 'ROUTE_LOADED', routes: [makeRoute()] },
      { type: 'ROUTE_SELECTED', routeId: 'nope' },
    ]);
    expect(state.route?.id).toBe('route-1');
  });

  it('treats an empty result as no route rather than as a success', () => {
    const state = run([{ type: 'PLAN' }, { type: 'ROUTE_LOADED', routes: [] }]);
    expect(state.phase).toBe('Failed');
    expect(state.error).toBe('no-route');
  });
});

describe('off-route detection — §18', () => {
  it('tolerates a single bad fix', () => {
    // A GPS bounce off a building is not a wrong turn. Recalculating on one
    // reading produces the flicker everybody has experienced standing still at
    // a junction.
    const state = navigationReducer(navigating(), {
      type: 'POSITION',
      location: fix(offsetCoordinate(START, 200, 0)),
    });

    expect(state.phase).toBe('OffRoute');
    expect(state.recalculationCount).toBe(0);
  });

  it('recalculates after the confirmation threshold', () => {
    let state = navigating();
    const stray = offsetCoordinate(START, 200, 0);

    for (let i = 0; i < OFF_ROUTE_CONFIRMATIONS; i += 1) {
      state = navigationReducer(state, { type: 'POSITION', location: fix(stray) });
    }

    expect(state.phase).toBe('Recalculating');
    expect(state.recalculationCount).toBe(1);
  });

  it('returns to Navigating on one good fix, and clears the counter', () => {
    let state = navigating();

    state = navigationReducer(state, {
      type: 'POSITION',
      location: fix(offsetCoordinate(START, 200, 0)),
    });
    expect(state.phase).toBe('OffRoute');

    state = navigationReducer(state, {
      type: 'POSITION',
      location: fix(offsetCoordinate(START, 300, 90)),
    });
    expect(state.phase).toBe('Navigating');
    expect(state.offRouteBy).toBeUndefined();

    // One more stray fix must not immediately trip the threshold — the counter
    // was reset, so a member weaving in and out of tolerance never accumulates
    // enough noise to trigger a recalculation.
    state = navigationReducer(state, {
      type: 'POSITION',
      location: fix(offsetCoordinate(START, 200, 0)),
    });
    expect(state.phase).toBe('OffRoute');
  });

  it('does not restart the count while already recalculating', () => {
    let state = navigating();
    const stray = offsetCoordinate(START, 200, 0);

    for (let i = 0; i < OFF_ROUTE_CONFIRMATIONS; i += 1) {
      state = navigationReducer(state, { type: 'POSITION', location: fix(stray) });
    }
    expect(state.recalculationCount).toBe(1);

    // Further off-route evidence against a route already known to be stale
    // means nothing.
    state = navigationReducer(state, { type: 'POSITION', location: fix(stray) });
    expect(state.phase).toBe('Recalculating');
    expect(state.recalculationCount).toBe(1);
  });

  it('applies a recalculated route and drops the stale alternatives', () => {
    let state = navigating();
    const stray = offsetCoordinate(START, 200, 0);

    for (let i = 0; i < OFF_ROUTE_CONFIRMATIONS; i += 1) {
      state = navigationReducer(state, { type: 'POSITION', location: fix(stray) });
    }

    const fresh = makeRoute({ id: 'route-2' });
    state = navigationReducer(state, { type: 'RECALCULATED', route: fresh });

    expect(state.phase).toBe('Navigating');
    expect(state.route?.id).toBe('route-2');
    // The old alternatives no longer start where the member is.
    expect(state.alternatives).toEqual([fresh]);
  });

  it('falls back to OffRoute when recalculation fails, not to Failed', () => {
    let state = navigating();
    const stray = offsetCoordinate(START, 200, 0);

    for (let i = 0; i < OFF_ROUTE_CONFIRMATIONS; i += 1) {
      state = navigationReducer(state, { type: 'POSITION', location: fix(stray) });
    }

    state = navigationReducer(state, { type: 'RECALCULATION_FAILED', error: 'routing-failed' });

    // Still on a journey with a route in hand — it is simply the wrong one, and
    // the next fix may well put them back on it.
    expect(state.phase).toBe('OffRoute');
    expect(state.route).not.toBeNull();
  });

  it('gives up after the recalculation ceiling rather than looping forever', () => {
    let state = navigating();
    const stray = offsetCoordinate(START, 400, 0);

    // Each cycle: enough strays to trip, then a fresh route that does not help.
    for (let cycle = 0; cycle <= MAX_RECALCULATIONS; cycle += 1) {
      for (let i = 0; i < OFF_ROUTE_CONFIRMATIONS; i += 1) {
        state = navigationReducer(state, { type: 'POSITION', location: fix(stray) });
      }
      if (state.phase === 'Recalculating') {
        state = navigationReducer(state, { type: 'RECALCULATED', route: makeRoute() });
      }
    }

    expect(state.phase).toBe('Failed');
    expect(state.error).toBe('routing-failed');
    expect(state.errorDetail).toBeTruthy();
  });
});

describe('arrival takes priority', () => {
  it('reports arrival even when the member is off the routed line', () => {
    // Walking the last 40 m across a car park is simultaneously arrived and
    // off-route. Being told to turn around is the worst moment to be wrong.
    const route = makeRoute();
    const nearDestinationButOffLine = offsetCoordinate(route.destination.coordinate, 20, 0);

    const state = navigationReducer(navigating(route), {
      type: 'POSITION',
      location: fix(nearDestinationButOffLine),
    });

    expect(state.phase).toBe('Arrived');
    expect(state.offRouteBy).toBeUndefined();
  });
});

describe('failure and interruption', () => {
  it('distinguishes an absent provider from a failed calculation', () => {
    const failed = run([
      { type: 'PLAN' },
      { type: 'ROUTE_FAILED', error: 'routing-failed' },
    ]);
    expect(failed.phase).toBe('Failed');

    const absent = run([
      { type: 'PLAN' },
      { type: 'ROUTE_FAILED', error: 'provider-unavailable' },
    ]);
    expect(absent.phase).toBe('ProviderUnavailable');
  });

  it('moves to PermissionDenied when permission is lost mid-journey', () => {
    const state = navigationReducer(navigating(), { type: 'PERMISSION_LOST' });
    expect(state.phase).toBe('PermissionDenied');
    expect(state.error).toBe('location-permission-denied');
  });

  it('moves to LocationUnavailable only while actually navigating', () => {
    const live = navigationReducer(navigating(), { type: 'LOCATION_LOST' });
    expect(live.phase).toBe('LocationUnavailable');

    // A route that is merely planned is still valid without a fix.
    const planned = run([{ type: 'PLAN' }, { type: 'ROUTE_LOADED', routes: [makeRoute()] }]);
    expect(navigationReducer(planned, { type: 'LOCATION_LOST' }).phase).toBe('RouteReady');
  });

  it('cancels to a clean state but keeps the last position', () => {
    const state = navigationReducer(
      navigationReducer(navigating(), { type: 'POSITION', location: fix(START) }),
      { type: 'CANCEL' }
    );

    expect(state.phase).toBe('Cancelled');
    expect(state.route).toBeNull();
    // Kept so the map does not jump on cancel.
    expect(state.position).not.toBeNull();
  });

  it('resets to Idle', () => {
    expect(navigationReducer(navigating(), { type: 'RESET' })).toEqual(initialNavigationState());
  });
});

describe('position handling outside a live phase', () => {
  it('records the fix without transitioning', () => {
    // The route planner uses the last fix as its default origin.
    const state = navigationReducer(initialNavigationState(), {
      type: 'POSITION',
      location: fix(START),
    });

    expect(state.phase).toBe('Idle');
    expect(state.position).not.toBeNull();
    expect(state.progress).toBeNull();
  });
});

describe('progress computation', () => {
  it('starts with the whole route ahead', () => {
    const route = makeRoute();
    const progress = initialProgress(route);

    expect(progress.fractionTravelled).toBe(0);
    expect(progress.remainingDistance.metres).toBe(route.distance.metres);
    expect(progress.currentInstruction?.id).toBe('i0');
  });

  it('uses the reported speed when the member is moving', () => {
    const route = makeRoute();
    const slow = computeProgress(route, fix(offsetCoordinate(START, 100, 90), 0.7));
    const fast = computeProgress(route, fix(offsetCoordinate(START, 100, 90), 3.0));

    expect(fast.remainingDuration.seconds).toBeLessThan(slow.remainingDuration.seconds);
  });

  it('does not divide by zero when the member is stationary', () => {
    // Standing at a crossing reports speed 0, which would otherwise produce an
    // infinite arrival time.
    const progress = computeProgress(makeRoute(), fix(offsetCoordinate(START, 100, 90), 0));
    expect(Number.isFinite(progress.remainingDuration.seconds)).toBe(true);
    expect(progress.remainingDuration.seconds).toBeGreaterThan(0);
  });

  it('computes remaining distance as a suffix rather than proportionally', () => {
    // A proportional estimate drifts badly on a route with uneven segment
    // lengths and jumps at every junction.
    const route = makeRoute();
    const nearEnd = computeProgress(route, fix(offsetCoordinate(START, 950, 90)));
    expect(nearEnd.remainingDistance.metres).toBeLessThan(120);
  });

  it('types the remaining distance as a route distance', () => {
    const progress = computeProgress(makeRoute(), fix(START));
    expect(progress.remainingDistance.kind).toBe('route');
    expect(progress.remainingDistance.travelMode).toBe('walking');
  });
});

describe('presentation helpers', () => {
  it('reports which phases are live', () => {
    expect(isNavigating(navigating())).toBe(true);
    expect(isNavigating(initialNavigationState())).toBe(false);
  });

  it('opens a position watch only while navigating — §6 battery', () => {
    expect(requiresPositionWatch(navigating())).toBe(true);

    const arrived = navigationReducer(navigating(), {
      type: 'POSITION',
      location: fix(makeRoute().destination.coordinate),
    });
    expect(requiresPositionWatch(arrived)).toBe(false);
    expect(requiresPositionWatch(navigationReducer(navigating(), { type: 'CANCEL' }))).toBe(false);
  });

  it('labels every phase', () => {
    const phases: NavigationState['phase'][] = [
      'Idle', 'Planning', 'RouteLoading', 'RouteReady', 'Navigating', 'OffRoute',
      'Recalculating', 'Arrived', 'Cancelled', 'Failed', 'LocationUnavailable',
      'PermissionDenied', 'ProviderUnavailable',
    ];

    const labels = phases.map((phase) =>
      navigationPhaseLabel({ ...initialNavigationState(), phase })
    );

    for (const label of labels) {
      expect(label).toBeTruthy();
    }

    // Every phase reads differently, which is the property that matters: a
    // member must be able to tell `OffRoute` from `Recalculating` and
    // `PermissionDenied` from `LocationUnavailable`, because each needs a
    // different response from them. ("Navigating" is deliberately both the enum
    // name and the right word for a person, so identity with the enum is not
    // itself a fault.)
    expect(new Set(labels).size).toBe(phases.length);

    // And the four states that need an explanation actually carry one.
    const explanatory = (['OffRoute', 'Recalculating', 'PermissionDenied', 'ProviderUnavailable'] as const).map(
      (phase) => navigationPhaseLabel({ ...initialNavigationState(), phase })
    );
    for (const label of explanatory) {
      expect(label.split(' ').length).toBeGreaterThan(1);
    }
  });
});
