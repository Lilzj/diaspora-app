// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map search against the certified routes
// (Frontend Phase 8, §52, §53)
//
// Runs the real `maps-api.ts` against the real mock handlers — the same
// `/housing`, `/marketplace`, `/jobs`, `/listings`, `/community-life/*` and
// `/location/nearby` contracts the list tabs use. Nothing is re-implemented
// here; a test against a re-implementation of the thing under test proves
// nothing.
//
// The properties that matter are the ones a screen relies on and cannot check
// for itself: that every category is reachable, that one failing category does
// not empty the map, that results are filtered back to the rectangle after the
// circle overfetches, and that the privacy rule survives the round trip.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import { setupCommunityLifeMocks } from '@/mocks/handlers/community-life';
import { setupLocationMocks } from '@/mocks/handlers/location';
import {
  fetchAlertsNear,
  fetchNearby,
  fetchNeighborhoodOverview,
  mapKeys,
  neighborhoodIdFor,
  searchMap,
} from '@/lib/maps-api';
import { boundsContain, circleToBounds } from '@/lib/maps/geo';
import type { DiscoveryCategory, GeoBoundingBox } from '@/types/maps';

// A fixed point in south London. This used to read `DEFAULT_LOCATION`, the
// product's Peckham default, which no longer exists — the app ships no default
// place. These cases are about bounding-box arithmetic, so the origin only has
// to be a real coordinate that the fixtures sit inside.
const ORIGIN = { latitude: 51.4742, longitude: -0.0691 };

/** A box around the platform's default location, wide enough to contain data. */
const LONDON: GeoBoundingBox = circleToBounds(ORIGIN, 25);

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupHousingMocks(mock);
  setupMarketplaceMocks(mock);
  setupJobsMocks(mock);
  setupDiscoveryMocks(mock);
  setupCommunityLifeMocks(mock);
  setupLocationMocks(mock);
  mock.onGet(/\/guides/).reply(200, { data: [] });
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

describe('federated map search', () => {
  it('returns results for the housing category from the certified route', async () => {
    const response = await searchMap(
      { categories: ['housing'], bounds: LONDON },
      ORIGIN
    );

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results.every((r) => r.category === 'housing')).toBe(true);
    // Certified routes only — nothing in this path is simulated.
    expect(response.hasSimulatedResults).toBe(false);
    expect(response.simulatedCategories).toEqual([]);
  });

  it('reaches every discovery category without throwing', async () => {
    const categories: DiscoveryCategory[] = [
      'housing',
      'marketplace',
      'job',
      'provider',
      'event',
      'organization',
      'guide',
      'alert',
    ];

    for (const category of categories) {
      const response = await searchMap({ categories: [category], bounds: LONDON }, ORIGIN);
      expect(Array.isArray(response.results)).toBe(true);
    }
  });

  it('merges several categories into one result set with per-category counts', async () => {
    const response = await searchMap(
      { categories: ['housing', 'job', 'event'], bounds: LONDON },
      ORIGIN
    );

    const seen = new Set(response.results.map((r) => r.category));
    expect(seen.size).toBeGreaterThan(1);
    expect(response.totalCount).toBe(response.results.length);

    for (const [category, count] of Object.entries(response.counts)) {
      expect(response.results.filter((r) => r.category === category)).toHaveLength(count as number);
    }
  });

  it('orders by distance when an origin is known', async () => {
    const response = await searchMap(
      { categories: ['housing', 'job'], bounds: LONDON },
      ORIGIN
    );

    const distances = response.results
      .map((r) => r.marker.distance?.metres)
      .filter((d): d is number => typeof d === 'number');

    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it('filters overfetched results back to the rectangle', async () => {
    // The circle sent to the backend is up to ~27% larger in area than the
    // viewport (FRONTEND-MAPS-GAP-001). Everything outside the box must be
    // dropped before it reaches the map, or pins appear off-screen and the
    // count disagrees with what is visible.
    const tight = circleToBounds(ORIGIN, 3);
    const response = await searchMap({ categories: ['housing'], bounds: tight }, ORIGIN);

    for (const result of response.results) {
      expect(boundsContain(tight, result.marker.coordinate)).toBe(true);
    }
    expect(response.searchedBounds).toEqual(tight);
  });

  it('survives one category failing — §54', async () => {
    const failing = new MockAdapter(apiClient, { delayResponse: 0 });
    setupHousingMocks(failing);
    failing.onGet(/\/jobs/).reply(500);
    failing.onAny().reply(404);

    const response = await searchMap({ categories: ['housing', 'job'], bounds: LONDON }, ORIGIN);

    // Housing pins still arrive. With `Promise.all` a single 500 would empty
    // the whole map including the results that came back perfectly well.
    expect(response.results.some((r) => r.category === 'housing')).toBe(true);

    // And the failed category is *absent* from the counts rather than recorded
    // as zero — "no jobs here" and "we could not ask" are different facts, and
    // the filter chip shows a dash for the second.
    expect(response.counts.job).toBeUndefined();

    failing.restore();
  });

  it('accepts a centre and radius as well as a box', async () => {
    const response = await searchMap(
      { categories: ['housing'], center: ORIGIN, radiusKm: 10 },
      ORIGIN
    );
    expect(Array.isArray(response.results)).toBe(true);
  });

  it('applies a limit and reports that more exist', async () => {
    const all = await searchMap({ categories: ['housing'], bounds: LONDON }, ORIGIN);
    if (all.results.length < 2) return;

    const limited = await searchMap(
      { categories: ['housing'], bounds: LONDON, limit: 1 },
      ORIGIN
    );

    expect(limited.results).toHaveLength(1);
    expect(limited.hasMore).toBe(true);
    expect(limited.totalCount).toBe(all.totalCount);
  });
});

describe('markers produced by the search', () => {
  it('carries an accessibility label on every marker — §50', async () => {
    const response = await searchMap(
      { categories: ['housing', 'job', 'event'], bounds: LONDON },
      ORIGIN
    );

    for (const result of response.results) {
      expect(result.marker.accessibilityLabel).toBeTruthy();
      // A sentence, not an id. The list view reads these out.
      expect(result.marker.accessibilityLabel.length).toBeGreaterThan(10);
      expect(result.marker.accessibilityLabel).not.toBe(result.marker.id);
    }
  });

  it('coarsens housing coordinates and flags them — §39', async () => {
    const response = await searchMap({ categories: ['housing'], bounds: LONDON }, ORIGIN);
    if (response.results.length === 0) return;

    for (const result of response.results) {
      expect(result.marker.isPrivacyReduced).toBe(true);
      expect(result.marker.coordinate.precision).toBe('approximate');
      // And the member is told, because navigating to an approximate point
      // means being sent to a block rather than a door.
      expect(result.marker.accessibilityLabel).toContain('Approximate');
    }
  });

  it('does not name a marketplace seller — §32', async () => {
    const response = await searchMap({ categories: ['marketplace'], bounds: LONDON }, ORIGIN);
    if (response.results.length === 0) return;

    for (const result of response.results) {
      const listing = result.entity as { seller?: { name?: string } };
      if (listing?.seller?.name) {
        expect(result.marker.accessibilityLabel).not.toContain(listing.seller.name);
        expect(result.marker.title).not.toContain(listing.seller.name);
      }
    }
  });

  it('gives every marker a destination a tap can navigate to', async () => {
    const response = await searchMap(
      { categories: ['housing', 'job', 'event', 'marketplace'], bounds: LONDON },
      ORIGIN
    );

    for (const result of response.results) {
      expect(result.marker.destination?.pathname).toBeTruthy();
      expect(result.marker.destination?.params).toBeTruthy();
    }
  });

  it('marks every certified result as backend-sourced', async () => {
    const response = await searchMap(
      { categories: ['housing', 'job', 'event'], bounds: LONDON },
      ORIGIN
    );

    for (const result of response.results) {
      expect(result.marker.source).toBe('backend');
    }
  });
});

describe('nearby aggregate and alerts', () => {
  it('reads the groups the route answers, not fields at the top of the envelope', async () => {
    const nearby = await fetchNearby(ORIGIN, 10);

    // `NearbyResponse.groups`, keyed by resource type. Read from the top level
    // — as this client did until 16 Sep 2026 — every one of these is undefined
    // and the map draws nothing at all.
    expect(Array.isArray(nearby.groups.housing)).toBe(true);
    expect(Array.isArray(nearby.groups.jobs)).toBe(true);
    expect(Array.isArray(nearby.groups.marketplace)).toBe(true);
    expect(Array.isArray(nearby.groups.events)).toBe(true);
    expect(Array.isArray(nearby.groups.providers)).toBe(true);
    expect(Array.isArray(nearby.groups.updates)).toBe(true);
    expect(nearby.unavailable).toEqual([]);
  });

  it('actually returns alerts, which is what the empty read never proved', async () => {
    const alerts = await fetchAlertsNear(ORIGIN, 50);

    // The assertion this file was missing: every test here passed while the
    // layer was empty, because "for (const alert of [])" proves nothing.
    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];
    expect(alert.title).toBeTruthy();
    // The card renders the body and a "reported …" line from these two.
    expect(alert.body).toBeTruthy();
    expect(Number.isNaN(new Date(alert.publishedAt).getTime())).toBe(false);
    // Camel-cased on the wire; the kind lookup switches on the union and has no
    // default, so an unnormalised category left this undefined.
    expect(alert.kind).toBeTruthy();
    expect(alert.category).toMatch(/^[A-Z]/);
  });

  it('raises rather than drawing an unanswered vertical as nothing nearby', async () => {
    // Its own adapter, restored straight after: the suite's mocks are installed
    // once in `beforeAll`, so an override here would answer every later test.
    const unanswered = new MockAdapter(apiClient, { delayResponse: 0 });
    unanswered.onGet(/\/location\/nearby/).reply(200, {
      data: { groups: {}, unavailableResourceTypes: ['updates'] },
    });
    unanswered.onAny().reply(404);

    await expect(fetchAlertsNear(ORIGIN, 25)).rejects.toThrow(/could not be read/);

    unanswered.restore();
  });

  it('translates community updates into alerts without inventing an area — §27, GAP-017', async () => {
    const alerts = await fetchAlertsNear(ORIGIN, 25);

    for (const alert of alerts) {
      expect(alert.source).toBe('backend');
      // The affected-area geometry has no certified contract. Drawing a radius
      // the publisher never stated would be the client deciding the scope of an
      // emergency.
      expect(alert.area).toBeUndefined();
      expect(alert.severity).toBeTruthy();
      expect(alert.kind).toBeTruthy();
      expect(alert.sourceName).toBeTruthy();
    }
  });

  it('excludes expired alerts — §29', async () => {
    const alerts = await fetchAlertsNear(ORIGIN, 50);
    for (const alert of alerts) {
      expect(alert.status).not.toBe('Expired');
      expect(alert.status).not.toBe('Withdrawn');
      if (alert.expiresAt) {
        expect(new Date(alert.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    }
  });
});

describe('neighbourhood overview — certified', () => {
  it('returns the published stats and resource counts', async () => {
    const overview = await fetchNeighborhoodOverview(neighborhoodIdFor('Peckham'));

    expect(overview.name).toBe('Peckham');
    expect(typeof overview.stats.safetyScore).toBe('number');
    expect(typeof overview.stats.walkability).toBe('number');
    expect(['Low', 'Medium', 'High']).toContain(overview.stats.costOfLiving);
    expect(typeof overview.resourceCounts.housing).toBe('number');
  });

  it('slugifies a name the way the route expects', () => {
    expect(neighborhoodIdFor('Rose Hill Central')).toBe('rose-hill-central');
    expect(neighborhoodIdFor('  Peckham  ')).toBe('peckham');
  });
});

describe('query keys — §39, §42', () => {
  it('rounds coordinates so no precise position reaches a cache key', () => {
    const key = mapKeys.nearby({ latitude: 51.474212345, longitude: -0.069134567 }, 5);
    expect(key.join('|')).toContain('51.474,-0.069');
    expect(key.join('|')).not.toContain('51.4742123');
  });

  it('is stable across category order, so a reorder is a cache hit', () => {
    const a = mapKeys.search(['housing', 'job'], LONDON, 'x');
    const b = mapKeys.search(['job', 'housing'], LONDON, 'x');
    expect(a).toEqual(b);
  });
});
