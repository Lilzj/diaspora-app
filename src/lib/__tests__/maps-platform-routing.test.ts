// The platform routing provider — Phase 8, 27 Sep 2026.
//
// The wire bodies below are what the backend's `RouteResponse` serialises, which
// was built from Google's documented shapes. Until a live route has been compared
// against them, they prove the mapping is consistent with the backend contract,
// not that the contract matches Google.

import { planRoute, type RoutePlanOutcome } from '@/lib/maps/geo-client';
import { PlatformRoutingProvider, mapPlannedRoutes } from '@/lib/maps/providers/platform-routing';
import { fail, ok, type RoutingProvider } from '@/lib/maps/providers/types';
import type { Route, RouteRequest, TravelEstimate } from '@/types/maps';

jest.mock('@/lib/maps/geo-client', () => ({ planRoute: jest.fn() }));

const plan = planRoute as jest.MockedFunction<typeof planRoute>;

const request: RouteRequest = {
  origin: { id: 'o', label: 'Here', coordinate: { latitude: -20.241, longitude: 57.4769 } },
  destination: { id: 'd', label: 'Port Louis', coordinate: { latitude: -20.1609, longitude: 57.4989 } },
  travelMode: 'walking',
  alternatives: true,
};

const walking: RoutePlanOutcome = {
  status: 'Success',
  travelMode: 'Walking',
  provider: 'google',
  isRouted: true,
  message: null,
  attribution: 'Google Maps',
  routes: [
    {
      summary: 'Royal Road',
      distanceMetres: 1234,
      durationSeconds: 905,
      durationInTrafficSeconds: null,
      warnings: ['Walking directions are in beta. Use caution.'],
      geometry: [
        { latitude: -20.241, longitude: 57.4769 },
        { latitude: -20.2, longitude: 57.48 },
        { latitude: -20.1609, longitude: 57.4989 },
      ],
      legs: [
        {
          mode: 'Walking',
          distanceMetres: 1234,
          durationSeconds: 905,
          line: null,
          agency: null,
          headsign: null,
          departureStop: null,
          arrivalStop: null,
          departureAt: null,
          arrivalAt: null,
          stopCount: null,
          steps: [
            { manoeuvre: 'depart', instruction: 'Head north', distanceMetres: 400, durationSeconds: 300, at: { latitude: -20.241, longitude: 57.4769 } },
            { manoeuvre: 'turn-left', instruction: 'Turn left onto Royal Road', distanceMetres: 834, durationSeconds: 605, at: { latitude: -20.2, longitude: 57.48 } },
            { manoeuvre: 'bear-ish', instruction: 'Continue', distanceMetres: 0, durationSeconds: 0, at: null },
          ],
        },
      ],
    },
  ],
};

function fallback(): RoutingProvider & { route: jest.Mock; estimate: jest.Mock } {
  return {
    descriptor: { id: 'adapter-routing', label: 'Estimated routing', isSimulated: true },
    supportedModes: ['walking', 'driving', 'transit', 'cycling'],
    supportsTraffic: false,
    estimate: jest.fn(async () => fail<TravelEstimate>('provider-unavailable')),
    route: jest.fn(async () => ok<Route[]>([])),
  };
}

beforeEach(() => plan.mockReset());

describe('PlatformRoutingProvider', () => {
  it('maps a routed answer into a backend-sourced route with the provider notices', async () => {
    plan.mockResolvedValue(walking);
    const provider = new PlatformRoutingProvider(fallback());

    const result = await provider.route(request);

    expect(result.ok).toBe(true);
    const route = (result as { ok: true; value: Route[] }).value[0];
    expect(route.source).toBe('backend');
    expect(route.distance).toEqual({ kind: 'route', metres: 1234, travelMode: 'walking' });
    expect(route.duration).toEqual({ seconds: 905 });
    expect(route.duration.inTrafficSeconds).toBeUndefined();
    expect(route.warnings).toEqual(['Walking directions are in beta. Use caution.']);
    expect(route.attribution).toBe('Google Maps');
    expect(route.path).toHaveLength(3);
    expect(route.segments[0].instructions.map((step) => step.manoeuvre)).toEqual([
      'depart',
      'turn-left',
      'straight', // an unknown manoeuvre never reaches the navigation machine
    ]);
  });

  it('reports the fallback descriptor until the server has routed, then its own', async () => {
    const provider = new PlatformRoutingProvider(fallback());
    expect(provider.descriptor.isSimulated).toBe(true);

    plan.mockResolvedValue(walking);
    await provider.route(request);

    expect(provider.descriptor).toMatchObject({ id: 'platform-routing', isSimulated: false });
  });

  it('hands a not-configured deployment to the fallback and nothing else', async () => {
    const backup = fallback();
    const provider = new PlatformRoutingProvider(backup);

    plan.mockResolvedValue({ ...walking, status: 'NotConfigured', routes: [] });
    await provider.route(request);
    expect(backup.route).toHaveBeenCalledTimes(1);

    plan.mockResolvedValue({ ...walking, status: 'NoRoute', routes: [], message: 'No route was found.' });
    const refused = await provider.route({ ...request, travelMode: 'driving' });
    expect(refused).toMatchObject({ ok: false, error: 'no-route' });
    expect(backup.route).toHaveBeenCalledTimes(1);
  });

  it('says a spent allowance is a limit, not a fault, and does not retry it', async () => {
    plan.mockResolvedValue({
      ...walking,
      status: 'AllowanceExhausted',
      routes: [],
      message: "Directions have reached this month's limit and will be back next month.",
    });

    const result = await new PlatformRoutingProvider(fallback()).route(request);

    expect(result).toMatchObject({ ok: false, error: 'quota-exceeded', retryable: false });
  });

  it('never spends the allowance on an estimate', async () => {
    const backup = fallback();
    const provider = new PlatformRoutingProvider(backup);

    await provider.estimate(request.origin.coordinate, request.destination.coordinate, 'walking');

    expect(plan).not.toHaveBeenCalled();
    expect(backup.estimate).toHaveBeenCalledTimes(1);
  });

  it('answers the same journey from memory for five minutes', async () => {
    plan.mockResolvedValue(walking);
    let now = 1_000_000;
    const provider = new PlatformRoutingProvider(fallback(), () => now);

    await provider.route(request);
    await provider.route(request);
    expect(plan).toHaveBeenCalledTimes(1);

    now += 5 * 60 * 1000 + 1;
    await provider.route(request);
    expect(plan).toHaveBeenCalledTimes(2);
  });

  it('splits a transit journey into walking and riding segments with the ride details', () => {
    const transit: RoutePlanOutcome = {
      ...walking,
      travelMode: 'Transit',
      routes: [
        {
          ...walking.routes[0],
          warnings: [],
          geometry: [
            { latitude: -20.241, longitude: 57.4769 },
            { latitude: -20.24, longitude: 57.477 },
            { latitude: -20.2, longitude: 57.48 },
            { latitude: -20.1609, longitude: 57.4989 },
          ],
          legs: [
            { ...walking.routes[0].legs[0], steps: [walking.routes[0].legs[0].steps[0]] },
            {
              mode: 'Transit',
              distanceMetres: 8000,
              durationSeconds: 1900,
              line: '198',
              agency: 'Rose Hill Transport',
              headsign: 'Port Louis',
              departureStop: 'Rose Hill Bus Station',
              arrivalStop: 'Victoria Square',
              departureAt: '2026-09-28T05:30:00Z',
              arrivalAt: '2026-09-28T06:02:00Z',
              stopCount: 12,
              steps: [
                { manoeuvre: 'board', instruction: 'Bus towards Port Louis', distanceMetres: 8000, durationSeconds: 1900, at: { latitude: -20.24, longitude: 57.477 } },
              ],
            },
          ],
        },
      ],
    };

    const [route] = mapPlannedRoutes(transit, { ...request, travelMode: 'transit' }, '2026-09-27T12:00:00Z');

    expect(route.segments.map((segment) => segment.travelMode)).toEqual(['walking', 'transit']);
    expect(route.segments[1].transit).toMatchObject({ line: '198', stopCount: 12, agency: 'Rose Hill Transport' });
    expect(route.segments[1].instructions[0].transit?.line).toBe('198');
    expect(route.segments[1].path.length).toBeGreaterThan(1);
    expect(route.transferCount).toBe(0);
    expect(route.departureAt).toBe('2026-09-28T05:30:00Z');
  });

  it('drops a route with no line rather than drawing a straight one', () => {
    const routes = mapPlannedRoutes(
      { ...walking, routes: [{ ...walking.routes[0], geometry: [] }] },
      request,
      '2026-09-27T12:00:00Z'
    );

    expect(routes).toEqual([]);
  });
});
