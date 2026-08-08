// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — provider adapters (Frontend Phase 8, §4, §44, §52)
//
// The provider abstraction's contract, tested at the seam rather than through a
// screen. Two claims matter most and both are asserted here:
//
//   **Every provider fails in the domain's own vocabulary.** A provider that
//   threw its own error type would push vendor-shaped error handling into every
//   screen, which is the leak §4 exists to prevent.
//
//   **The routing adapter never claims to be routed.** `isRouted: false` and
//   the absence of `inTrafficSeconds` are what stop a surface presenting an
//   estimate as a walking time (§48) or inventing a traffic figure (§15).
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupLocationMocks } from '@/mocks/handlers/location';
import {
  adapterRoutingProvider,
  unavailableRoutingProvider,
} from '@/lib/maps/providers/adapter-routing';
import {
  platformGeocodingProvider,
  platformPlacesProvider,
} from '@/lib/maps/providers/platform-geocoding';
import {
  advanceSimulatedPosition,
  resetSimulatedLocation,
  resolveDeviceLocationProvider,
  resolveLocationPermissionProvider,
  setSimulatedPermissionOutcome,
} from '@/lib/maps/providers/device-location';
import {
  getProviderStatus,
  resolveMapSurfaceProvider,
  resolveRoutingProvider,
} from '@/lib/maps/providers/registry';
import { distanceBetween, pathLengthMetres, toKm } from '@/lib/maps/geo';
import type { GeoPoint } from '@/types/maps';

const PECKHAM = { latitude: 51.4742, longitude: -0.0691 };
const BRIXTON = { latitude: 51.4624, longitude: -0.1149 };

const origin: GeoPoint = { id: 'o', coordinate: PECKHAM, label: 'Peckham' };
const destination: GeoPoint = { id: 'd', coordinate: BRIXTON, label: 'Brixton' };

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupLocationMocks(mock);
  mock.onAny().reply(404);
});

afterAll(() => mock.restore());

// ═════════════════════════════════════════════════════════════════════════════
// ROUTING
// ═════════════════════════════════════════════════════════════════════════════

describe('the routing adapter is honest about what it is', () => {
  it('declares itself simulated and traffic-unaware', () => {
    expect(adapterRoutingProvider.descriptor.isSimulated).toBe(true);
    expect(adapterRoutingProvider.descriptor.gapKey).toBe('routing');
    // The flag the driving screen reads before it may show a traffic line.
    expect(adapterRoutingProvider.supportsTraffic).toBe(false);
  });

  it('reports every estimate as unrouted — §48', async () => {
    for (const mode of ['walking', 'driving', 'transit', 'cycling'] as const) {
      const result = await adapterRoutingProvider.estimate(PECKHAM, BRIXTON, mode);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.isRouted).toBe(false);
      expect(result.value.source).toBe('simulated');
      expect(result.value.distance.kind).toBe('route');
      expect(result.value.distance.travelMode).toBe(mode);
    }
  });

  it('never populates a traffic duration — §15', async () => {
    const routes = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'driving',
      alternatives: true,
    });

    expect(routes.ok).toBe(true);
    if (!routes.ok) return;

    for (const route of routes.value) {
      // The field's absence is what stops any surface rendering a figure this
      // adapter cannot know. Not zero, not null — absent.
      expect(route.duration.inTrafficSeconds).toBeUndefined();
      for (const segment of route.segments) {
        expect(segment.duration.inTrafficSeconds).toBeUndefined();
      }
    }
  });

  it('estimates longer than the straight line, because real journeys are', async () => {
    const direct = distanceBetween(PECKHAM, BRIXTON).metres;
    const result = await adapterRoutingProvider.estimate(PECKHAM, BRIXTON, 'walking');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.distance.metres).toBeGreaterThan(direct);
  });

  it('orders mode durations plausibly', async () => {
    const duration = async (mode: 'walking' | 'driving') => {
      const result = await adapterRoutingProvider.estimate(PECKHAM, BRIXTON, mode);
      return result.ok ? result.value.duration.seconds : Infinity;
    };

    expect(await duration('driving')).toBeLessThan(await duration('walking'));
  });

  it('is deterministic, so a re-render is the same route', async () => {
    const a = await adapterRoutingProvider.route({ origin, destination, travelMode: 'walking' });
    const b = await adapterRoutingProvider.route({ origin, destination, travelMode: 'walking' });

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value[0].path).toEqual(b.value[0].path);
    expect(a.value[0].distance.metres).toBe(b.value[0].distance.metres);
  });

  it('produces a navigable path with corners, not a straight line', async () => {
    // Map matching, off-route detection and per-instruction progress all need a
    // path with vertices. A two-point line cannot be navigated.
    const result = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'walking',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const route = result.value[0];
    expect(route.path.length).toBeGreaterThan(2);
    expect(pathLengthMetres(route.path)).toBeGreaterThan(0);
    expect(route.segments[0].instructions.length).toBeGreaterThan(1);
    // Ends with an arrival, so the state machine has a terminal instruction.
    expect(route.segments[0].instructions.at(-1)?.manoeuvre).toBe('arrive');
  });

  it('names no streets — an invented street name is a lie, not an estimate', async () => {
    const result = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'walking',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const instruction of result.value[0].segments[0].instructions) {
      expect(instruction.text).not.toMatch(/\b(Road|Street|Lane|Avenue|Way|Close)\b/);
    }
  });

  it('returns distinct alternatives when asked, and one route when not', async () => {
    const withAlternatives = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'driving',
      alternatives: true,
    });
    const single = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'driving',
    });

    expect(withAlternatives.ok && single.ok).toBe(true);
    if (!withAlternatives.ok || !single.ok) return;

    expect(withAlternatives.value.length).toBeGreaterThan(1);
    expect(single.value).toHaveLength(1);

    // Exactly one primary, and the alternatives differ from it.
    expect(withAlternatives.value.filter((r) => r.isPrimary)).toHaveLength(1);
    const distances = withAlternatives.value.map((r) => r.distance.metres);
    expect(new Set(distances).size).toBe(distances.length);
  });

  it('builds a transit itinerary with the walking and riding portions separate — §16', async () => {
    const result = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'transit',
      departureAt: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const route = result.value[0];
    const modes = route.segments.map((s) => s.travelMode);
    expect(modes).toContain('walking');
    expect(modes).toContain('transit');

    const ride = route.segments.find((s) => s.travelMode === 'transit')!;
    expect(ride.transit?.line).toBeTruthy();
    expect(ride.transit?.departureAt).toBeTruthy();
    expect(ride.transit?.arrivalAt).toBeTruthy();
    expect(ride.transit?.departureStop).toBeTruthy();

    // A generic service name, not a real operator's route number. Naming a real
    // one would be fabrication rather than estimation.
    expect(ride.transit?.line).toMatch(/City service/);
    expect(route.departureAt).toBeTruthy();
    expect(route.arrivalAt).toBeTruthy();
  });

  it('reports no route rather than a fantasy for an impossible journey', async () => {
    const result = await adapterRoutingProvider.route({
      origin,
      destination: {
        id: 'far',
        coordinate: { latitude: -20.2417, longitude: 57.4806 },
        label: 'Rose Hill',
      },
      travelMode: 'walking',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
    expect(result.retryable).toBe(false);
  });

  it('rejects invalid coordinates in the domain vocabulary', async () => {
    const result = await adapterRoutingProvider.estimate(
      { latitude: NaN, longitude: 0 },
      BRIXTON,
      'walking'
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid-coordinates');
  });
});

describe('the unavailable routing provider', () => {
  it('fails cleanly rather than throwing — §44', async () => {
    const estimate = await unavailableRoutingProvider.estimate(PECKHAM, BRIXTON, 'walking');
    const route = await unavailableRoutingProvider.route({
      origin,
      destination,
      travelMode: 'walking',
    });

    expect(estimate.ok).toBe(false);
    expect(route.ok).toBe(false);
    if (!estimate.ok) expect(estimate.error).toBe('provider-unavailable');
    expect(unavailableRoutingProvider.supportedModes).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GEOCODING — certified
// ═════════════════════════════════════════════════════════════════════════════

describe('geocoding over the certified location routes', () => {
  it('declares itself real, because it is', () => {
    expect(platformGeocodingProvider.descriptor.isSimulated).toBe(false);
    expect(platformPlacesProvider.descriptor.isSimulated).toBe(false);
  });

  it('resolves a neighbourhood name and marks it backend-sourced', async () => {
    const result = await platformGeocodingProvider.geocode('Peckham');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0].source).toBe('backend');
    expect(result.value[0].address.city).toBeTruthy();
    // No invented confidence: the route reports none, and a fabricated 0.9
    // would read as the provider's own assessment.
    expect(result.value[0].confidence).toBeUndefined();
  });

  it('restricts by country', async () => {
    const uk = await platformGeocodingProvider.geocode('Peckham', { countryCodes: ['GB'] });
    const mu = await platformGeocodingProvider.geocode('Peckham', { countryCodes: ['MU'] });

    expect(uk.ok && mu.ok).toBe(true);
    if (!uk.ok || !mu.ok) return;
    expect(uk.value.length).toBeGreaterThan(0);
    expect(mu.value).toHaveLength(0);
  });

  it('returns an empty result for an empty query rather than asking', async () => {
    const result = await platformGeocodingProvider.geocode('   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('reverse-geocodes a nearby point exactly', async () => {
    const result = await platformGeocodingProvider.reverseGeocode(PECKHAM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.address.formatted).toContain('Peckham');
    // A close match is stated plainly, with no hedging.
    expect(result.value.address.formatted).not.toContain('near');
  });

  it('hedges a distant match instead of claiming it — GAP-006', async () => {
    // The certified route is nearest-node and always answers, even when the
    // nearest node is 40 km away. Saying "near Croydon" is different from
    // saying "Croydon", and that difference is the whole of GAP-006.
    const result = await platformGeocodingProvider.reverseGeocode({
      latitude: 51.15,
      longitude: -0.2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.address.formatted).toMatch(/near|km from/);
  });

  it('refuses entirely when the nearest node is on another continent', async () => {
    // Confidently telling somebody in West Africa that they are in Peckham is
    // worse than admitting we do not know.
    const result = await platformGeocodingProvider.reverseGeocode({
      latitude: 6.5244,
      longitude: 3.3792,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not-found');
  });

  it('rejects an invalid coordinate', async () => {
    const result = await platformGeocodingProvider.reverseGeocode({
      latitude: 999,
      longitude: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid-coordinates');
  });

  it('sorts place search by distance when a bias point is given', async () => {
    const result = await platformPlacesProvider.search({ query: 'London', near: PECKHAM });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const distances = result.value
      .map((p) => p.distance?.metres)
      .filter((d): d is number => typeof d === 'number');

    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it('does not query for a single character — §46', async () => {
    const result = await platformPlacesProvider.autocomplete('P');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LOCATION
// ═════════════════════════════════════════════════════════════════════════════

describe('the simulated location provider enforces the permission contract', () => {
  beforeEach(() => resetSimulatedLocation());
  afterAll(() => resetSimulatedLocation());

  it('reports notRequested before anybody asks', async () => {
    const permission = resolveLocationPermissionProvider();
    expect((await permission.check()).status).toBe('notRequested');
  });

  it('refuses a position without a grant', async () => {
    // A caller that reads a position it never asked for is a real bug, and one
    // that only shows up on a device unless the simulation refuses too.
    const device = resolveDeviceLocationProvider();
    const result = await device.getCurrentPosition();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('location-permission-denied');
  });

  it('grants and then returns a fix', async () => {
    const permission = resolveLocationPermissionProvider();
    const device = resolveDeviceLocationProvider();

    expect((await permission.request()).status).toBe('granted');

    const result = await device.getCurrentPosition();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toBe('simulated');
    expect(result.value.coordinate.precision).toBe('exact');
  });

  it('reaches every §5 state', async () => {
    const permission = resolveLocationPermissionProvider();

    const cases = [
      ['grant-precise', 'granted'],
      ['grant-approximate', 'grantedApproximate'],
      ['deny', 'denied'],
      ['deny-permanently', 'deniedPermanently'],
      ['services-disabled', 'servicesDisabled'],
      ['unavailable', 'unavailable'],
    ] as const;

    for (const [outcome, expected] of cases) {
      setSimulatedPermissionOutcome(outcome);
      expect((await permission.request()).status).toBe(expected);
    }
  });

  it('reports a much larger accuracy radius for an approximate grant', async () => {
    // One of the few places a member can see the difference between a precise
    // and an approximate grant.
    setSimulatedPermissionOutcome('grant-approximate');
    const permission = resolveLocationPermissionProvider();
    const device = resolveDeviceLocationProvider();

    await permission.request();
    const result = await device.getCurrentPosition();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accuracyMetres).toBeGreaterThan(500);
    expect(result.value.coordinate.precision).toBe('approximate');
  });

  it('does not claim to open settings it cannot open', async () => {
    const permission = resolveLocationPermissionProvider();
    expect(await permission.openSettings()).toBe(false);
  });

  it('moves only when told to', async () => {
    // Ambient drift would make every screenshot different and every assertion
    // flaky.
    setSimulatedPermissionOutcome('grant-precise');
    const permission = resolveLocationPermissionProvider();
    const device = resolveDeviceLocationProvider();
    await permission.request();

    const before = await device.getCurrentPosition();
    advanceSimulatedPosition(BRIXTON);
    const after = await device.getCurrentPosition();

    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(toKm(distanceBetween(before.value.coordinate, after.value.coordinate))).toBeGreaterThan(3);
  });

  it('returns an unsubscribe from a watch that stops delivering', async () => {
    setSimulatedPermissionOutcome('grant-precise');
    await resolveLocationPermissionProvider().request();

    const device = resolveDeviceLocationProvider();
    const onLocation = jest.fn();
    const unsubscribe = device.watchPosition(onLocation, jest.fn());

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onLocation).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═════════════════════════════════════════════════════════════════════════════

describe('the registry', () => {
  it('falls back to a working renderer rather than a grey rectangle', () => {
    const surface = resolveMapSurfaceProvider();

    expect(surface.descriptor.id).toBe('canvas');
    // Complete, not degraded. It draws whatever real markers it is given.
    expect(surface.descriptor.isSimulated).toBe(false);
    // And it says on its face that the background is a diagram.
    expect(surface.rendersRealGeography).toBe(false);
    expect(surface.descriptor.gapKey).toBe('tileMap');
  });

  it('selects the routing adapter in a development build', () => {
    expect(resolveRoutingProvider().descriptor.id).toBe('adapter-routing');
  });

  it('reports a status snapshot with no key in it', () => {
    const status = getProviderStatus();
    const serialised = JSON.stringify(status);

    expect(status.surface.id).toBeTruthy();
    expect(status.environment).toBeTruthy();
    // Designed to be safe to screenshot into a bug report.
    expect(serialised).not.toMatch(/AIza|pk\.|sk\./);
    expect(serialised).not.toMatch(/apiKey|androidKey|iosKey/i);
  });
});
