// ─────────────────────────────────────────────────────────────────────────────
// A map that is nowhere yet — 17 Sep 2026
//
// Found on a device, cold-started straight into the alerts map. The screen built
// its first viewport before the member's location loaded, so the centre was NaN
// on purpose (`UNKNOWN_LOCATION`) — and the width was NaN too, because a
// viewport's width is scaled by its centre's latitude. The location arrived, the
// screen moved the centre, and the width stayed NaN for the life of the screen.
// Every alert request carried `NaN`, production answered 400, and the list said
// "Something went wrong" to a member with nothing wrong.
//
// Two halves are held here: a viewport built from nothing is recognisably not
// placed even after its centre is patched, and no map query leaves the device
// until the viewport is somewhere.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';

jest.mock('@/config/map-config', () => ({
  ...jest.requireActual('@/config/map-config'),
  getMapFeatureFlags: () => ({
    ...jest.requireActual('@/config/map-config').getMapFeatureFlags(),
    communityAlertsEnabled: true,
    heatMapsEnabled: true,
  }),
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/lib/apiClient';
// eslint-disable-next-line import/first
import { NEARBY_MAX_RADIUS_KM, fetchAlertsNear } from '@/lib/maps-api';
// eslint-disable-next-line import/first
import {
  boundsToCircle,
  isPlacedBounds,
  isPlacedViewport,
  viewportFromCenter,
  viewportToBounds,
} from '@/lib/maps/geo';
// eslint-disable-next-line import/first
import { useCommunityAlerts, useMapSearch, useServerClusters } from '../maps';

const NOWHERE = { latitude: Number.NaN, longitude: Number.NaN };
const PORT_LOUIS = { latitude: -20.1609, longitude: 57.5012 };

let queryClient: QueryClient;
let mock: MockAdapter;

/**
 * The requests that asked about a place. The search hook also reads the
 * member's communities to scope its markers, which has nothing to do with where
 * the map is, so counting every request would test the wrong thing.
 */
function placeRequests() {
  return mock.history.get.filter((entry) => {
    const params = (entry.params ?? {}) as Record<string, unknown>;
    return ['latitude', 'longitude', 'bounds', 'radiusKm'].some((key) => key in params);
  });
}

/** Long enough for a mounted query to have sent its request. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  mock.onAny().reply(200, { data: { groups: {}, unavailableResourceTypes: [] } });
});

afterEach(() => {
  queryClient.clear();
  mock.restore();
});

describe('a viewport built before the location loaded', () => {
  it('has no width, not just no centre', () => {
    const viewport = viewportFromCenter(NOWHERE, 8);

    expect(isPlacedViewport(viewport)).toBe(false);
    expect(Number.isFinite(viewport.longitudeDelta)).toBe(false);
  });

  it('is still not placed after its centre arrives — it has to be rebuilt', () => {
    const patched = { ...viewportFromCenter(NOWHERE, 8), center: PORT_LOUIS };

    expect(isPlacedViewport(patched)).toBe(false);
    expect(isPlacedBounds(viewportToBounds(patched))).toBe(false);

    expect(isPlacedViewport(viewportFromCenter(PORT_LOUIS, 8))).toBe(true);
    expect(isPlacedBounds(viewportToBounds(viewportFromCenter(PORT_LOUIS, 8)))).toBe(true);
  });

  it('never reads as placed from an absent box', () => {
    expect(isPlacedBounds(null)).toBe(false);
    expect(isPlacedBounds(undefined)).toBe(false);
    expect(isPlacedBounds({ north: 1, south: 0, east: Number.POSITIVE_INFINITY, west: 0 })).toBe(false);
  });
});

describe('map queries wait for a placed viewport', () => {
  const unplaced = { ...viewportFromCenter(NOWHERE, 8), center: PORT_LOUIS };

  // Each negative waits as long as the positive below does before looking. A
  // query fires after mount, so asserting straight after render counts nothing
  // either way — the first draft of these passed with the guards removed.
  it('asks nothing for alerts', async () => {
    renderHook(() => useCommunityAlerts(viewportToBounds(unplaced)), { wrapper });

    await settle();
    expect(placeRequests()).toHaveLength(0);
  });

  it('asks nothing for the discovery search', async () => {
    renderHook(
      () => useMapSearch({ viewport: unplaced, categories: ['housing', 'alert'] }),
      { wrapper }
    );

    await settle();
    expect(placeRequests()).toHaveLength(0);
  });

  it('asks nothing for town totals', async () => {
    const wideAndUnplaced = { ...viewportFromCenter(NOWHERE, 400), center: PORT_LOUIS };

    const { result } = renderHook(
      () => useServerClusters(wideAndUnplaced, ['housing']),
      { wrapper }
    );

    await settle();
    expect(result.current.isActive).toBe(false);
    expect(placeRequests()).toHaveLength(0);
  });

  it('asks once the same screen is somewhere', async () => {
    renderHook(() => useCommunityAlerts(viewportToBounds(viewportFromCenter(PORT_LOUIS, 8))), {
      wrapper,
    });

    await settle();
    expect(placeRequests().length).toBeGreaterThan(0);
  });
});

describe('a very wide view', () => {
  it('is read as the widest circle the route answers, not refused', async () => {
    // A country-wide alerts view: the enclosing circle of this box is ~1,400 km.
    const bounds = viewportToBounds(viewportFromCenter(PORT_LOUIS, 800));

    await fetchAlertsNear(PORT_LOUIS, 1_400);
    renderHook(() => useCommunityAlerts(bounds), { wrapper });
    await settle();

    const radii = placeRequests().map((entry) => Number(entry.params.radiusKm));
    expect(radii.length).toBeGreaterThanOrEqual(2);
    for (const radius of radii) {
      expect(radius).toBeLessThanOrEqual(NEARBY_MAX_RADIUS_KM);
    }
  });

  it('opens the alerts map on a country view the route can answer whole', () => {
    // The screen's country view, sized so its enclosing circle fits the cap.
    const circle = boundsToCircle(viewportToBounds(viewportFromCenter(PORT_LOUIS, 250)));

    expect(circle.radiusKm).toBeLessThanOrEqual(NEARBY_MAX_RADIUS_KM);
  });
});

describe('an alerts read asks for alerts', () => {
  it('names the one vertical it reads instead of fanning out to all seven', async () => {
    await fetchAlertsNear(PORT_LOUIS, 8);

    const request = mock.history.get.find((entry) => entry.url?.includes('/location/nearby'));
    expect(request?.params).toMatchObject({ resourceTypes: 'updates' });
    expect(Number.isFinite(request?.params.latitude)).toBe(true);
  });
});
