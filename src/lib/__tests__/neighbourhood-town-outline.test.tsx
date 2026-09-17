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
import {
  isOutlineInView,
  outlineFitViewport,
  outlinePolygons,
  type PlaceOutline,
} from '@/lib/maps/place-outlines';
import { viewportFromCenter } from '@/lib/maps/geo';

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

// ─────────────────────────────────────────────────────────────────────────────
// When the line is opened to, and when it is named
//
// Both rules decide what a member sees and neither is visible to a type check:
// a page that opens to Greater London shows a neighbourhood as five pixels, and
// one that captions a map whose line is twenty kilometres away names something
// nobody can see. The credit rides with the caption, so the second rule also
// decides when the licence is displayed.
// ─────────────────────────────────────────────────────────────────────────────

/** A square ring of `sizeDegrees` around a centre, as an outline with its credit. */
function ringAround(
  centre: { latitude: number; longitude: number },
  sizeDegrees: number,
  name = 'Somewhere'
): PlaceOutline {
  const half = sizeDegrees / 2;

  return {
    id: `outline:${name}`,
    areaId: `area-${name}`,
    name,
    level: 'City',
    countryCode: 'MU',
    path: [
      { latitude: centre.latitude + half, longitude: centre.longitude - half },
      { latitude: centre.latitude + half, longitude: centre.longitude + half },
      { latitude: centre.latitude - half, longitude: centre.longitude + half },
      { latitude: centre.latitude - half, longitude: centre.longitude - half },
    ],
    attribution: '© OpenStreetMap contributors',
    source: 'OpenStreetMap',
    licence: 'ODbL-1.0',
    sourceReference: 'relation/1',
    retrievedOn: '2026-09-17',
  };
}

const QUATRE_BORNES = { latitude: -20.2644, longitude: 57.4786 };

describe('opening to a containing outline', () => {
  it('opens to a town, which still shows the neighbourhood inside it', () => {
    // ~0.04° ≈ 4.4 km across: Quatre Bornes' order of size.
    const viewport = outlineFitViewport(ringAround(QUATRE_BORNES, 0.04, 'Quatre Bornes'));

    expect(viewport).not.toBeNull();
    expect(viewport!.latitudeDelta).toBeGreaterThan(0.04);
    expect(viewport!.latitudeDelta).toBeLessThan(0.2);
    expect(viewport!.center.latitude).toBeCloseTo(QUATRE_BORNES.latitude, 2);
  });

  it('refuses to open to a region, and says so with null rather than a huge view', () => {
    // ~0.5° ≈ 55 km across: Greater London's order of size.
    expect(outlineFitViewport(ringAround(QUATRE_BORNES, 0.5, 'Greater London'))).toBeNull();
  });

  it('holds the line exactly where the rule says it is', () => {
    const outline = ringAround(QUATRE_BORNES, 0.04);

    expect(outlineFitViewport(outline, 0.5)).toBeNull();
    expect(outlineFitViewport(outline, 50)).not.toBeNull();
  });
});

describe('naming a containing outline', () => {
  it('names the line when the view is opened to it', () => {
    const outline = ringAround(QUATRE_BORNES, 0.04);

    expect(isOutlineInView(outline, outlineFitViewport(outline)!)).toBe(true);
  });

  it('does not name a line the member cannot see, although the view is inside it', () => {
    // The trap a bounding-box test falls into: a 2.5km view of the neighbourhood
    // sits well within Greater London's extent, and its nearest edge is 25km away.
    const region = ringAround(QUATRE_BORNES, 0.5);

    expect(isOutlineInView(region, viewportFromCenter(QUATRE_BORNES, 2.5))).toBe(false);
  });

  it('names it again once the member zooms out far enough to reach the line', () => {
    const region = ringAround(QUATRE_BORNES, 0.5);

    expect(isOutlineInView(region, viewportFromCenter(QUATRE_BORNES, 40))).toBe(true);
  });

  it('counts the closing segment the wire leaves implicit', () => {
    // A view sitting on the western edge, which is the ring's implicit last
    // segment: the path runs NW → NE → SE → SW and closes back to NW.
    const outline = ringAround(QUATRE_BORNES, 0.5);
    const onTheClosingEdge = {
      latitude: QUATRE_BORNES.latitude,
      longitude: QUATRE_BORNES.longitude - 0.25,
    };

    expect(isOutlineInView(outline, viewportFromCenter(onTheClosingEdge, 2))).toBe(true);
  });

  it('names nothing when the view is nowhere', () => {
    const outline = ringAround(QUATRE_BORNES, 0.04);

    expect(
      isOutlineInView(outline, {
        center: { latitude: Number.NaN, longitude: Number.NaN },
        latitudeDelta: Number.NaN,
        longitudeDelta: Number.NaN,
      })
    ).toBe(false);
  });
});
