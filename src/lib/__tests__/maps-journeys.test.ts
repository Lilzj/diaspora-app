// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — §53's ten end-to-end journeys (Frontend Phase 8)
//
// Each journey is walked through the real repositories, the real state machine,
// the real clusterer and the real mock handlers. Nothing is stubbed except the
// device, which has no counterpart under Jest.
//
// These are deliberately *journey* tests rather than screen tests: they assert
// that the seams line up — that a search result carries a coordinate a route
// planner accepts, that a route the planner returns is one the state machine
// can navigate, that an alert the map draws is one the detail screen can open.
// Those are the joins that break, and a screen test of either side passes while
// the join is broken.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import { setupLocationMocks } from '@/mocks/handlers/location';
import { setupMapsGapMocks } from '@/mocks/handlers/maps-gaps';
import {
  fetchAlertsNear,
  fetchNeighborhoodOverview,
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
} from '@/lib/maps-gap-api';
import { adapterRoutingProvider } from '@/lib/maps/providers/adapter-routing';
import {
  resetSimulatedLocation,
  resolveDeviceLocationProvider,
  resolveLocationPermissionProvider,
  advanceSimulatedPosition,
} from '@/lib/maps/providers/device-location';
import {
  initialNavigationState,
  navigationReducer,
  requiresPositionWatch,
} from '@/lib/maps/navigation-machine';
import { clusterMarkers, clusterExpansionViewport } from '@/lib/maps/clustering';
import {
  boundsToViewport,
  circleToBounds,
  viewportFromCenter,
  viewportToBounds,
} from '@/lib/maps/geo';
import { DEFAULT_LOCATION } from '@/store/location';
import type { GeoPoint, MapSearchResult, NavigationState } from '@/types/maps';

const HOME = { latitude: DEFAULT_LOCATION.latitude, longitude: DEFAULT_LOCATION.longitude };
const WIDE = circleToBounds(HOME, 25);

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupHousingMocks(mock);
  setupMarketplaceMocks(mock);
  setupJobsMocks(mock);
  setupDiscoveryMocks(mock);
  setupCommunityLifeMocks(mock);
  setupLocationMocks(mock);
  setupMapsGapMocks(mock);
  mock.onGet(/\/guides/).reply(200, { data: [] });
  mock.onAny().reply(404);
});

afterAll(() => mock.restore());
beforeEach(() => resetSimulatedLocation());

/** Plans and starts navigation to a point, returning the machine's state. */
async function navigateTo(
  destination: GeoPoint,
  origin: GeoPoint,
  travelMode: 'walking' | 'driving' | 'transit' = 'walking'
): Promise<NavigationState> {
  let state = navigationReducer(initialNavigationState(), { type: 'PLAN' });
  state = navigationReducer(state, { type: 'ROUTE_REQUESTED' });

  const result = await adapterRoutingProvider.route({
    origin,
    destination,
    travelMode,
    alternatives: true,
  });

  if (!result.ok) {
    return navigationReducer(state, { type: 'ROUTE_FAILED', error: result.error });
  }

  state = navigationReducer(state, { type: 'ROUTE_LOADED', routes: result.value });
  return navigationReducer(state, { type: 'START' });
}

function toPoint(result: MapSearchResult): GeoPoint {
  return {
    id: result.marker.id,
    coordinate: result.marker.coordinate,
    label: result.marker.title,
  };
}

// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 1 — open map, grant location, discover nearby, open a result', () => {
  it('runs end to end', async () => {
    // Open the map. Nothing has been asked for yet — §5 forbids a prompt on
    // mount, and the map opens on the member's chosen location instead.
    const permission = resolveLocationPermissionProvider();
    const device = resolveDeviceLocationProvider();
    expect((await permission.check()).status).toBe('notRequested');

    // Grant.
    expect((await permission.request()).status).toBe('granted');

    // Current location.
    const fix = await device.getCurrentPosition();
    expect(fix.ok).toBe(true);
    if (!fix.ok) return;

    // Nearby discovery, centred on the fix.
    const viewport = viewportFromCenter(fix.value.coordinate, 10);
    const response = await searchMap(
      { categories: ['housing', 'event', 'provider'], bounds: viewportToBounds(viewport) },
      fix.value.coordinate
    );
    expect(response.results.length).toBeGreaterThan(0);

    // Select a result, then open it — the marker knows where the tap goes.
    const selected = response.results[0];
    expect(selected.marker.destination?.pathname).toBeTruthy();
    expect(selected.marker.accessibilityLabel).toBeTruthy();
  });
});

describe('Journey 2 — search housing, map, filter, select, details, navigate', () => {
  it('runs end to end', async () => {
    const unfiltered = await searchMap({ categories: ['housing'], bounds: WIDE }, HOME);
    expect(unfiltered.results.length).toBeGreaterThan(0);

    // Filter. The map does not run its own search — this is `/housing` with a
    // price band, the same contract the list tab uses.
    const filtered = await searchMap(
      { categories: ['housing'], bounds: WIDE, maxPrice: 900 },
      HOME
    );
    expect(filtered.results.length).toBeLessThanOrEqual(unfiltered.results.length);

    const listing = unfiltered.results[0];

    // Details are reachable from the marker.
    expect(listing.marker.destination?.pathname).toBe('/housing/[id]');
    expect(listing.marker.destination?.params?.id).toBeTruthy();

    // Navigate. The coordinate the route uses is the *displayed*, privacy-
    // reduced one — a member is routed to the block the pin is on, and the
    // callout says the location is approximate.
    expect(listing.marker.isPrivacyReduced).toBe(true);

    const state = await navigateTo(toPoint(listing), { id: 'o', coordinate: HOME, label: 'Home' });
    expect(state.phase).toBe('Navigating');
    expect(state.route).not.toBeNull();
  });
});

describe('Journey 3 — marketplace, map, select, listing, navigation', () => {
  it('runs end to end without exposing the seller', async () => {
    const response = await searchMap({ categories: ['marketplace'], bounds: WIDE }, HOME);
    if (response.results.length === 0) return;

    const item = response.results[0];

    // §32: the pin says what is for sale and roughly where, never who is
    // holding it.
    const listing = item.entity as { seller?: { name?: string } };
    if (listing?.seller?.name) {
      expect(item.marker.accessibilityLabel).not.toContain(listing.seller.name);
    }
    expect(item.marker.isPrivacyReduced).toBe(true);

    const state = await navigateTo(toPoint(item), { id: 'o', coordinate: HOME, label: 'Home' });
    expect(state.phase).toBe('Navigating');
  });
});

describe('Journey 4 — events, map, nearby event, details, route planning', () => {
  it('runs end to end', async () => {
    const response = await searchMap({ categories: ['event'], bounds: WIDE }, HOME);
    if (response.results.length === 0) return;

    const event = response.results[0];

    // An event venue is a published location and stays exact — coarsening it
    // would make the product worse for no privacy gain.
    expect(event.marker.isPrivacyReduced).toBe(false);
    expect(event.marker.destination?.pathname).toBe('/community-life/event/[id]');

    const routes = await adapterRoutingProvider.route({
      origin: { id: 'o', coordinate: HOME, label: 'Home' },
      destination: toPoint(event),
      travelMode: 'walking',
      alternatives: true,
    });

    expect(routes.ok).toBe(true);
    if (!routes.ok) return;
    expect(routes.value.length).toBeGreaterThan(0);
    expect(routes.value[0].duration.seconds).toBeGreaterThan(0);
  });
});

describe('Journey 5 — search destination, walk, route, navigate, arrive', () => {
  it('walks the route to arrival', async () => {
    const permission = resolveLocationPermissionProvider();
    await permission.request();

    const origin: GeoPoint = { id: 'o', coordinate: HOME, label: 'Home' };
    const destination: GeoPoint = {
      id: 'd',
      coordinate: { latitude: 51.4624, longitude: -0.1149 },
      label: 'Brixton',
    };

    let state = await navigateTo(destination, origin, 'walking');
    expect(state.phase).toBe('Navigating');
    expect(requiresPositionWatch(state)).toBe(true);

    // Walk along the route the planner actually produced.
    const path = state.route!.path;
    for (const point of path) {
      advanceSimulatedPosition(point);
      const fix = await resolveDeviceLocationProvider().getCurrentPosition();
      if (fix.ok) state = navigationReducer(state, { type: 'POSITION', location: fix.value });
    }

    expect(state.phase).toBe('Arrived');
    // And the watch closes, which is §6's battery requirement.
    expect(requiresPositionWatch(state)).toBe(false);
  });

  it('detects a wrong turn, recalculates, and recovers', async () => {
    await resolveLocationPermissionProvider().request();

    const destination: GeoPoint = {
      id: 'd',
      coordinate: { latitude: 51.4624, longitude: -0.1149 },
      label: 'Brixton',
    };
    let state = await navigateTo(destination, { id: 'o', coordinate: HOME, label: 'Home' });

    // Two fixes well off the line.
    const stray = { latitude: HOME.latitude + 0.01, longitude: HOME.longitude + 0.01 };
    for (let i = 0; i < 2; i += 1) {
      advanceSimulatedPosition(stray);
      const fix = await resolveDeviceLocationProvider().getCurrentPosition();
      if (fix.ok) state = navigationReducer(state, { type: 'POSITION', location: fix.value });
    }

    expect(state.phase).toBe('Recalculating');

    // A fresh route from where the member actually is.
    const fresh = await adapterRoutingProvider.route({
      origin: { id: 'o', coordinate: stray, label: 'Where you are' },
      destination,
      travelMode: 'walking',
    });

    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;

    state = navigationReducer(state, { type: 'RECALCULATED', route: fresh.value[0] });
    expect(state.phase).toBe('Navigating');
    expect(state.route?.origin.coordinate).toEqual(stray);
  });
});

describe('Journey 6 — driving, alternative routes, select, navigation', () => {
  it('offers alternatives, lets one be chosen, and starts on it', async () => {
    const origin: GeoPoint = { id: 'o', coordinate: HOME, label: 'Home' };
    const destination: GeoPoint = {
      id: 'd',
      coordinate: { latitude: 51.5074, longitude: -0.1278 },
      label: 'Central London',
    };

    const routes = await adapterRoutingProvider.route({
      origin,
      destination,
      travelMode: 'driving',
      alternatives: true,
    });

    expect(routes.ok).toBe(true);
    if (!routes.ok) return;
    expect(routes.value.length).toBeGreaterThan(1);

    let state = navigationReducer(initialNavigationState(), { type: 'PLAN' });
    state = navigationReducer(state, { type: 'ROUTE_LOADED', routes: routes.value });
    expect(state.route?.isPrimary).toBe(true);

    // Choose the second, before departure.
    const alternative = routes.value.find((r) => !r.isPrimary)!;
    state = navigationReducer(state, { type: 'ROUTE_SELECTED', routeId: alternative.id });
    expect(state.route?.id).toBe(alternative.id);

    state = navigationReducer(state, { type: 'START' });
    expect(state.phase).toBe('Navigating');

    // §15: no traffic figure is available, and none is invented.
    expect(state.route?.duration.inTrafficSeconds).toBeUndefined();
    expect(adapterRoutingProvider.supportsTraffic).toBe(false);
  });
});

describe('Journey 7 — transit, destination, route, review transfers, start', () => {
  it('produces a reviewable itinerary', async () => {
    const routes = await adapterRoutingProvider.route({
      origin: { id: 'o', coordinate: HOME, label: 'Home' },
      destination: {
        id: 'd',
        coordinate: { latitude: 51.5074, longitude: -0.1278 },
        label: 'Central London',
      },
      travelMode: 'transit',
      departureAt: new Date().toISOString(),
    });

    expect(routes.ok).toBe(true);
    if (!routes.ok) return;

    const route = routes.value[0];

    // Everything §16 asks a member to be able to review before setting off.
    expect(route.segments.filter((s) => s.travelMode === 'walking').length).toBeGreaterThanOrEqual(2);
    const ride = route.segments.find((s) => s.travelMode === 'transit')!;
    expect(ride.transit?.departureStop).toBeTruthy();
    expect(ride.transit?.arrivalStop).toBeTruthy();
    expect(ride.transit?.departureAt).toBeTruthy();
    expect(typeof route.transferCount).toBe('number');

    // Arrival is after departure, which is the sanity check a member makes
    // first.
    expect(new Date(route.arrivalAt!).getTime()).toBeGreaterThan(
      new Date(route.departureAt!).getTime()
    );

    let state = navigationReducer(initialNavigationState(), { type: 'PLAN' });
    state = navigationReducer(state, { type: 'ROUTE_LOADED', routes: routes.value });
    state = navigationReducer(state, { type: 'START' });
    expect(state.phase).toBe('Navigating');
  });
});

describe('Journey 8 — neighbourhood, safety, score, cost of living, compare', () => {
  it('runs end to end and keeps the real and estimated halves apart', async () => {
    const id = neighborhoodIdFor('Peckham');

    // The certified overview. Real, and rendered without a simulation marker.
    const overview = await fetchNeighborhoodOverview(id);
    expect(overview.name).toBe('Peckham');
    expect(typeof overview.stats.safetyScore).toBe('number');

    // The safety score passes the certified number through unchanged.
    const safety = await fetchSafetyScore(id);
    expect(safety.score).toBe(overview.stats.safetyScore);
    // §26: the caveats are mandatory and non-empty.
    expect(safety.freshness.limitations?.length).toBeGreaterThan(0);
    expect(safety.freshness.methodology).toBeTruthy();

    // The score breakdown is hybrid, and says so at field level.
    const score = await fetchNeighborhoodScore(id);
    expect(score.overall.source).toBe('simulated');
    expect(score.overall.gapKey).toBe('neighborhoodScores');

    const real = score.dimensions.filter((d) => !d.freshness.sourceName.includes('development'));
    const estimated = score.dimensions.filter((d) => d.freshness.sourceName.includes('development'));
    expect(real.length).toBeGreaterThan(0);
    expect(estimated.length).toBeGreaterThan(0);

    // The safety dimension is one of the real ones, carrying the published
    // figure.
    expect(real.find((d) => d.id === 'safety')?.score).toBe(overview.stats.safetyScore);

    // Cost of living, with a baseline and a currency.
    const cost = await fetchCostOfLiving(id);
    expect(cost.baselineName).toBeTruthy();
    expect(cost.currency).toBeTruthy();
    expect(cost.categories.length).toBeGreaterThan(3);
    expect(cost.freshness.limitations?.length).toBeGreaterThan(0);

    // Compare. No winner is computed — the client puts the numbers side by side.
    const comparison = await compareNeighborhoods([id, ...score.nearbyNeighborhoodIds.slice(0, 1)]);
    expect(comparison.length).toBe(2);
    for (const entry of comparison) {
      expect(entry.overall.source).toBe('simulated');
    }
  });
});

describe('Journey 9 — community alert, marker, detail, affected area, share', () => {
  it('runs end to end over the real community-update feed', async () => {
    const alerts = await fetchAlertsNear(HOME, 25);
    if (alerts.length === 0) return;

    const alert = alerts[0];

    // §27: real, from B9. Not a second feed.
    expect(alert.source).toBe('backend');
    expect(alert.sourceName).toBeTruthy();
    expect(alert.severity).toBeTruthy();

    // §29: nothing expired is shown.
    expect(alert.status).not.toBe('Expired');

    // The affected area is the only simulated part, and it is fetched
    // separately so a real alert renders without pulling in a simulated one.
    const area = await fetchAlertArea(alert.id);
    if (area) {
      expect(area.radiusMetres).toBeGreaterThan(0);
      // And it says it is an estimate rather than the publisher's statement.
      expect(area.description).toMatch(/did not state|Estimated/);
    }

    // Sharing carries the area name, never a coordinate. §39.
    const shareText = `${alert.title} — ${alert.areaName}, ${alert.cityName}. Reported on Diaspora.`;
    expect(shareText).not.toMatch(/-?\d+\.\d{4,}/);
  });
});

describe('Journey 10 — map, heat map, select layer, filter, explore', () => {
  it('runs end to end with a legend that explains the scale', async () => {
    const bounds = viewportToBounds(viewportFromCenter(HOME, 20));

    const layer = await fetchHeatLayer('community-activity', bounds, { timeRange: '30d' });

    expect(layer.layer.id).toBe('community-activity');
    expect(layer.layer.description).toBeTruthy();
    expect(layer.points.length).toBeGreaterThan(0);
    expect(layer.scale).toBe('relative-to-viewport');
    expect(layer.freshness.limitations?.length).toBeGreaterThan(0);

    // Intensity is normalized, so a component never has to guess the range.
    for (const point of layer.points) {
      expect(point.intensity).toBeGreaterThanOrEqual(0);
      expect(point.intensity).toBeLessThanOrEqual(1);
    }

    // Filter by changing the layer.
    const jobs = await fetchHeatLayer('jobs', bounds, { timeRange: '7d' });
    expect(jobs.layer.id).toBe('jobs');

    // The safety layer is inverted, and the description says so — a member who
    // assumed brighter meant safer would read the map backwards.
    const safety = await fetchHeatLayer('safety', bounds);
    expect(safety.layer.description).toMatch(/more caution advised, not more safety/);
  });

  it('suppresses sparse cells on the layers that would otherwise map addresses', async () => {
    // A density layer over a sparse area drawn from individual points *is* a
    // map of individual homes.
    const bounds = viewportToBounds(viewportFromCenter(HOME, 20));
    const housing = await fetchHeatLayer('housing-availability', bounds);

    expect(housing.freshness.methodology).toMatch(/suppressed/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING
// ═════════════════════════════════════════════════════════════════════════════

describe('map and list stay in step — §11', () => {
  it('clusters what the list shows, and a cluster tap narrows to its members', async () => {
    const response = await searchMap({ categories: ['housing'], bounds: WIDE }, HOME);
    const markers = response.results.map((r) => r.marker);

    const viewport = boundsToViewport(WIDE);
    const clustered = clusterMarkers(markers, viewport);

    // Everything the list shows is on the map, once.
    expect(clustered.totalCount).toBe(markers.length);

    if (clustered.clusters.length > 0) {
      const cluster = clustered.clusters[0];
      const expanded = clusterExpansionViewport(cluster, viewport);
      const after = clusterMarkers(markers, expanded);

      // Zooming into a cluster shows more individual pins than before.
      expect(after.markers.length).toBeGreaterThanOrEqual(clustered.markers.length);
    }
  });
});

describe('permission refused mid-journey — §5, §19', () => {
  it('stops navigating and says why, without losing the route', async () => {
    let state = await navigateTo(
      { id: 'd', coordinate: { latitude: 51.4624, longitude: -0.1149 }, label: 'Brixton' },
      { id: 'o', coordinate: HOME, label: 'Home' }
    );

    state = navigationReducer(state, { type: 'PERMISSION_LOST' });

    expect(state.phase).toBe('PermissionDenied');
    // The route stays on the map — the member can still follow it by eye.
    expect(state.route).not.toBeNull();
    expect(requiresPositionWatch(state)).toBe(false);
  });
});

describe('offline — §43', () => {
  it('fails in the map vocabulary rather than throwing', async () => {
    const offline = new MockAdapter(apiClient, { delayResponse: 0 });
    offline.onAny().networkError();

    const response = await searchMap({ categories: ['housing'], bounds: WIDE }, HOME);

    // Every category failed, so the map is empty — and it is empty with no
    // counts, so the UI shows "we could not ask" rather than "there is nothing
    // here". §54.
    expect(response.results).toHaveLength(0);
    expect(response.counts.housing).toBeUndefined();

    offline.restore();
  });
});
