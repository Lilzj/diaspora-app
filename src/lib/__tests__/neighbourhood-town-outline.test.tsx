// ─────────────────────────────────────────────────────────────────────────────
// The town's line, drawn on a neighbourhood that has none — 17 Sep 2026
//
// No open dataset draws our neighbourhoods: London's are electoral wards,
// Manchester's are a ward and a district, and Mauritius's are a station and
// localities. The import takes exact matches only, so the neighbourhood page
// keeps its approximate circle — and the user decided it should also show the
// real outline of the town it sits in, under the town's name.
//
// What a member could misread, and what these tests hold: the town's line must
// never arrive as the neighbourhood's own, and a line whose credit is missing
// must not be drawn at all, because the licence is what permits drawing it.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { fetchNeighborhoodOverview } from '@/lib/maps-api';
import { outlinePolygons } from '@/lib/maps/place-outlines';

const QUATRE_BORNES_RING = [
  { latitude: -20.25, longitude: 57.46 },
  { latitude: -20.25, longitude: 57.5 },
  { latitude: -20.28, longitude: 57.5 },
  { latitude: -20.28, longitude: 57.46 },
];

const HUB = {
  id: 'quatre-bornes-center',
  areaId: '7c0a4c7e-0000-4000-8000-000000000004',
  name: 'Quatre Bornes Center',
  cityName: 'Quatre Bornes',
  countryName: 'Mauritius',
  countryCode: 'MU',
  latitude: -20.2644,
  longitude: 57.4786,
  overview: null,
  stats: { safetyScore: null, walkability: null, costOfLiving: null },
  resourceCounts: { housing: 1 },
  boundary: null,
  containingOutline: {
    areaId: '7c0a4c7e-0000-4000-8000-000000000010',
    name: 'Quatre Bornes',
    level: 'City',
    boundary: {
      vertices: QUATRE_BORNES_RING,
      source: 'OpenStreetMap',
      licence: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      sourceReference: 'relation/13476401',
      retrievedOn: '2026-09-17',
    },
  },
};

function serve(hub: unknown): MockAdapter {
  const mock = new MockAdapter(apiClient, { delayResponse: 0 });
  mock.onGet('/location/neighborhoods/quatre-bornes-center').reply(200, { data: hub });
  return mock;
}

describe('the neighbourhood hub read', () => {
  it('carries the town outline with its credit, and no outline of its own', async () => {
    const mock = serve(HUB);

    const overview = await fetchNeighborhoodOverview('quatre-bornes-center');
    mock.restore();

    expect(overview.containingOutline).not.toBeNull();
    expect(overview.containingOutline!.name).toBe('Quatre Bornes');
    expect(overview.containingOutline!.level).toBe('City');
    expect(overview.containingOutline!.countryCode).toBe('MU');
    expect(overview.containingOutline!.path).toHaveLength(4);
    expect(overview.containingOutline!.attribution).toContain('OpenStreetMap');
    expect(overview.containingOutline!.sourceReference).toBe('relation/13476401');

    // The outline is the town's. Nothing about it is filed as the neighbourhood's.
    expect(overview.name).toBe('Quatre Bornes Center');
    expect(overview.containingOutline!.areaId).not.toBe(overview.areaId);
  });

  it('draws nothing when the credit the licence requires is missing', async () => {
    const mock = serve({
      ...HUB,
      containingOutline: {
        ...HUB.containingOutline,
        boundary: { ...HUB.containingOutline.boundary, attribution: null },
      },
    });

    const overview = await fetchNeighborhoodOverview('quatre-bornes-center');
    mock.restore();

    expect(overview.containingOutline).toBeNull();
  });

  it('drops a ring too small to be a shape rather than drawing a line through it', async () => {
    const mock = serve({
      ...HUB,
      containingOutline: {
        ...HUB.containingOutline,
        boundary: { ...HUB.containingOutline.boundary, vertices: QUATRE_BORNES_RING.slice(0, 2) },
      },
    });

    const overview = await fetchNeighborhoodOverview('quatre-bornes-center');
    mock.restore();

    expect(overview.containingOutline).toBeNull();
  });

  it('has no town outline when the platform sends none', async () => {
    const mock = serve({ ...HUB, containingOutline: null });

    const overview = await fetchNeighborhoodOverview('quatre-bornes-center');
    mock.restore();

    expect(overview.containingOutline).toBeNull();
  });

  it('is drawn as a stroke, so it reads as a line rather than as the area in question', async () => {
    const mock = serve(HUB);

    const overview = await fetchNeighborhoodOverview('quatre-bornes-center');
    mock.restore();

    const [polygon] = outlinePolygons([overview.containingOutline!], '#123456');

    expect(polygon.fillColor).toBe('transparent');
    expect(polygon.strokeColor).toContain('#123456');
    expect(polygon.path).toHaveLength(4);
  });
});
