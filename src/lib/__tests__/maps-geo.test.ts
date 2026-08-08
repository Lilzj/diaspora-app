// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — geographic arithmetic (Frontend Phase 8, §52)
//
// The geometry every map surface depends on. Tested against hand-checked
// figures rather than against itself, and weighted towards the cases that are
// easy to get wrong and invisible when they are: the antimeridian, latitude
// convergence, and the circle-versus-rectangle conversion the whole viewport
// search rests on.
// ─────────────────────────────────────────────────────────────────────────────

import {
  boundsCacheKey,
  boundsCenter,
  boundsContain,
  boundsFromCoordinates,
  boundsIntersect,
  boundsToCircle,
  boundsToViewport,
  boundsWidth,
  circleToBounds,
  crossesAntimeridian,
  distanceBetween,
  distanceToPath,
  distanceToSegment,
  isValidBounds,
  isValidCoordinate,
  metresPerDegreeLongitude,
  normalizeCoordinate,
  offsetCoordinate,
  pathLengthMetres,
  toKm,
  viewportDelta,
  viewportFromCenter,
  viewportToBounds,
  viewportToZoom,
} from '@/lib/maps/geo';

const PECKHAM = { latitude: 51.4742, longitude: -0.0691 };
const BRIXTON = { latitude: 51.4624, longitude: -0.1149 };
const ROSE_HILL = { latitude: -20.2417, longitude: 57.4806 };

describe('coordinate validation', () => {
  it('accepts a real coordinate', () => {
    expect(isValidCoordinate(PECKHAM)).toBe(true);
    expect(isValidCoordinate(ROSE_HILL)).toBe(true);
  });

  it('rejects out-of-range, non-finite and missing values', () => {
    expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidCoordinate({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(isValidCoordinate(null)).toBe(false);
    expect(isValidCoordinate(undefined)).toBe(false);
  });

  it('rejects 0,0 as missing data rather than accepting the Gulf of Guinea', () => {
    // The single most common cause of a listing appearing 5,000 km away is a
    // pair of fields that both defaulted to zero. Treating Null Island as
    // absent data is a deliberate trade documented in `geo.ts`.
    expect(isValidCoordinate({ latitude: 0, longitude: 0 })).toBe(false);
    // A coordinate genuinely near it is still valid.
    expect(isValidCoordinate({ latitude: 0.5, longitude: 0.5 })).toBe(true);
  });

  it('clamps latitude and wraps longitude', () => {
    const wrapped = normalizeCoordinate({ latitude: 95, longitude: 200 });
    expect(wrapped.latitude).toBeLessThanOrEqual(85.06);
    expect(wrapped.longitude).toBeCloseTo(-160, 5);
  });
});

describe('distance', () => {
  it('matches the known Peckham–Brixton distance', () => {
    // ~3.5 km on the ground.
    const km = toKm(distanceBetween(PECKHAM, BRIXTON));
    expect(km).toBeGreaterThan(3.2);
    expect(km).toBeLessThan(3.8);
  });

  it('is zero for a point to itself and symmetric', () => {
    expect(distanceBetween(PECKHAM, PECKHAM).metres).toBe(0);
    expect(distanceBetween(PECKHAM, BRIXTON).metres).toBeCloseTo(
      distanceBetween(BRIXTON, PECKHAM).metres,
      6
    );
  });

  it('is typed as straight-line so it cannot be passed off as routed', () => {
    // The brand is the whole point of §48 — asserted here so a future change
    // that widened the type would fail rather than pass silently.
    expect(distanceBetween(PECKHAM, BRIXTON).kind).toBe('straight-line');
  });

  it('offsets by a known distance and bearing', () => {
    const moved = offsetCoordinate(PECKHAM, 1000, 90);
    expect(toKm(distanceBetween(PECKHAM, moved))).toBeCloseTo(1, 2);
    expect(moved.longitude).toBeGreaterThan(PECKHAM.longitude);
    expect(moved.latitude).toBeCloseTo(PECKHAM.latitude, 3);
  });
});

describe('point-to-path matching — the off-route test', () => {
  const path = [
    { latitude: 51.4742, longitude: -0.0691 },
    { latitude: 51.4742, longitude: -0.0591 },
    { latitude: 51.4842, longitude: -0.0591 },
  ];

  it('measures zero for a point on the line', () => {
    expect(distanceToSegment(path[0], path[0], path[1]).metres).toBeCloseTo(0, 3);
  });

  it('measures to the endpoint, not to the infinite line, when past the end', () => {
    // A point beyond the segment's end. Without clamping this measures the
    // perpendicular to an infinite line and reports a much smaller distance —
    // which is how somebody standing 200 m past a junction is told they are
    // on route.
    const beyond = { latitude: 51.4742, longitude: -0.0391 };
    const toSegment = distanceToSegment(beyond, path[0], path[1]).metres;
    const toEndpoint = distanceBetween(beyond, path[1]).metres;

    // `beyond` sits on the same latitude as the segment, so its perpendicular
    // distance to the *infinite* line is ~0. Anything near the endpoint
    // distance proves the clamp is doing its job.
    expect(toSegment).toBeGreaterThan(1000);

    // Compared with a relative tolerance rather than an absolute one:
    // `distanceToSegment` projects equirectangularly and `distanceBetween` is
    // Haversine, so over 1.4 km they differ by ~1.5 m. That 0.1% is the
    // documented approximation in `geo.ts` — tightening this assertion would
    // be asserting the two functions are the same function, which they are
    // deliberately not.
    expect(Math.abs(toSegment - toEndpoint) / toEndpoint).toBeLessThan(0.005);
  });

  it('finds the nearest segment and reports progress along the path', () => {
    const nearSecondSegment = { latitude: 51.4790, longitude: -0.0589 };
    const match = distanceToPath(nearSecondSegment, path);

    expect(match.segmentIndex).toBe(1);
    expect(match.distance.metres).toBeLessThan(30);
    expect(match.fraction).toBeGreaterThan(0.4);
    expect(match.fraction).toBeLessThan(1);
  });

  it('handles a degenerate path without dividing by zero', () => {
    expect(distanceToPath(PECKHAM, []).segmentIndex).toBe(-1);
    expect(distanceToPath(PECKHAM, [BRIXTON]).segmentIndex).toBe(0);
  });

  it('sums path length', () => {
    expect(pathLengthMetres(path)).toBeGreaterThan(0);
    expect(pathLengthMetres([PECKHAM])).toBe(0);
  });
});

describe('bounding boxes', () => {
  const london = { north: 51.55, south: 51.4, east: 0.05, west: -0.2 };

  it('contains a point inside and excludes one outside', () => {
    expect(boundsContain(london, PECKHAM)).toBe(true);
    expect(boundsContain(london, ROSE_HILL)).toBe(false);
  });

  it('validates well-formed boxes', () => {
    expect(isValidBounds(london)).toBe(true);
    expect(isValidBounds({ ...london, north: 51.0 })).toBe(false); // north < south
    expect(isValidBounds(null)).toBe(false);
  });

  it('builds the smallest box around a set of points', () => {
    const bounds = boundsFromCoordinates([PECKHAM, BRIXTON])!;
    expect(bounds.north).toBeCloseTo(PECKHAM.latitude, 6);
    expect(bounds.south).toBeCloseTo(BRIXTON.latitude, 6);
    expect(bounds.west).toBeCloseTo(BRIXTON.longitude, 6);
  });

  it('ignores invalid coordinates when building a box', () => {
    const bounds = boundsFromCoordinates([PECKHAM, { latitude: 0, longitude: 0 }, BRIXTON])!;
    // Null Island would otherwise drag the box across half of Europe and
    // Africa, and "zoom to fit" would frame the Atlantic.
    expect(bounds.south).toBeCloseTo(BRIXTON.latitude, 6);
  });

  it('returns null for no usable coordinates', () => {
    expect(boundsFromCoordinates([])).toBeNull();
    expect(boundsFromCoordinates([{ latitude: NaN, longitude: 0 }])).toBeNull();
  });

  it('detects intersection', () => {
    expect(boundsIntersect(london, { north: 51.5, south: 51.45, east: 0, west: -0.1 })).toBe(true);
    expect(boundsIntersect(london, { north: -20, south: -21, east: 58, west: 57 })).toBe(false);
  });
});

describe('the antimeridian', () => {
  // The case a sorted-pair shortcut turns into a request for every listing on
  // Earth. Every predicate in `geo.ts` branches on it explicitly.
  const fiji = { north: 20, south: -20, east: -170, west: 170 };

  it('is recognised', () => {
    expect(crossesAntimeridian(fiji)).toBe(true);
    expect(crossesAntimeridian({ north: 52, south: 51, east: 0, west: -1 })).toBe(false);
  });

  it('contains points on both sides of the meridian', () => {
    expect(boundsContain(fiji, { latitude: 0, longitude: 175 })).toBe(true);
    expect(boundsContain(fiji, { latitude: 0, longitude: -175 })).toBe(true);
    expect(boundsContain(fiji, { latitude: 0, longitude: 0 })).toBe(false);
  });

  it('measures a 20-degree width rather than a 340-degree one', () => {
    expect(boundsWidth(fiji)).toBeCloseTo(20, 6);
  });

  it('centres inside the box, not on the far side of the planet', () => {
    const centre = boundsCenter(fiji);
    expect(Math.abs(centre.longitude)).toBeGreaterThan(179);
    expect(boundsContain(fiji, centre)).toBe(true);
  });

  it('intersects a box on either side', () => {
    expect(boundsIntersect(fiji, { north: 5, south: -5, east: 178, west: 176 })).toBe(true);
    expect(boundsIntersect(fiji, { north: 5, south: -5, east: -176, west: -178 })).toBe(true);
  });
});

describe('circle and rectangle — the certified-backend bridge', () => {
  const bounds = { north: 51.5, south: 51.45, east: -0.05, west: -0.12 };

  it('encloses the whole rectangle', () => {
    const circle = boundsToCircle(bounds);

    // Every corner must be inside the circle. A circle that were smaller would
    // silently drop results the member can see empty space where — the failure
    // mode FRONTEND-MAPS-GAP-001 is written about.
    const corners = [
      { latitude: bounds.north, longitude: bounds.east },
      { latitude: bounds.north, longitude: bounds.west },
      { latitude: bounds.south, longitude: bounds.east },
      { latitude: bounds.south, longitude: bounds.west },
    ];

    for (const corner of corners) {
      expect(toKm(distanceBetween(circle.center, corner))).toBeLessThanOrEqual(
        circle.radiusKm + 0.001
      );
    }
  });

  it('declares that it overfetches, so callers filter rather than trust', () => {
    expect(boundsToCircle(bounds).hasOverfetch).toBe(true);
  });

  it('never returns a zero radius for a degenerate box', () => {
    const point = { north: 51.5, south: 51.5, east: -0.1, west: -0.1 };
    expect(boundsToCircle(point).radiusKm).toBeGreaterThan(0);
  });

  it('round-trips a circle to a box that contains it', () => {
    const box = circleToBounds(PECKHAM, 2);
    expect(boundsContain(box, PECKHAM)).toBe(true);
    expect(boundsContain(box, offsetCoordinate(PECKHAM, 1900, 0))).toBe(true);
    expect(boundsContain(box, offsetCoordinate(PECKHAM, 1900, 90))).toBe(true);
  });

  it('scales longitude for latitude', () => {
    // A degree of longitude is ~111 km at the equator and ~70 km in London.
    // A box that ignored this would be half the width it should be up north.
    const equator = circleToBounds({ latitude: 0, longitude: 0.0001 }, 10);
    const london = circleToBounds({ latitude: 51.5, longitude: -0.1 }, 10);
    expect(boundsWidth(london)).toBeGreaterThan(boundsWidth(equator) * 1.4);
  });

  it('reports metres per degree of longitude shrinking with latitude', () => {
    expect(metresPerDegreeLongitude(0)).toBeGreaterThan(metresPerDegreeLongitude(51.5));
    expect(metresPerDegreeLongitude(51.5)).toBeGreaterThan(metresPerDegreeLongitude(80));
  });
});

describe('viewports', () => {
  it('round-trips through bounds', () => {
    const viewport = viewportFromCenter(PECKHAM, 3);
    const bounds = viewportToBounds(viewport);

    expect(boundsContain(bounds, PECKHAM)).toBe(true);
    expect(bounds.north).toBeGreaterThan(PECKHAM.latitude);
    expect(bounds.south).toBeLessThan(PECKHAM.latitude);
  });

  it('never produces a zero-span viewport from a single point', () => {
    // Providers interpret a zero delta differently and at least one reads it as
    // maximum zoom over the ocean.
    const viewport = boundsToViewport({
      north: 51.5,
      south: 51.5,
      east: -0.1,
      west: -0.1,
    });
    expect(viewport.latitudeDelta).toBeGreaterThan(0);
    expect(viewport.longitudeDelta).toBeGreaterThan(0);
  });

  it('derives a zoom that increases as the span narrows', () => {
    const wide = viewportToZoom({ center: PECKHAM, latitudeDelta: 10, longitudeDelta: 10 });
    const tight = viewportToZoom({ center: PECKHAM, latitudeDelta: 0.01, longitudeDelta: 0.01 });

    expect(tight).toBeGreaterThan(wide);
    expect(wide).toBeGreaterThanOrEqual(0);
    expect(tight).toBeLessThanOrEqual(20);
  });
});

describe('viewport delta — §13 movement threshold', () => {
  const base = { center: PECKHAM, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  it('is zero for an unchanged viewport', () => {
    expect(viewportDelta(base, base)).toBe(0);
  });

  it('stays under the threshold for a finger settling', () => {
    const nudged = {
      ...base,
      center: { latitude: PECKHAM.latitude + 0.0005, longitude: PECKHAM.longitude },
    };
    // 0.25 is `VIEWPORT_MOVE_THRESHOLD`. A movement this small must not start a
    // query — that is the "request per pixel of movement" §13 forbids.
    expect(viewportDelta(base, nudged)).toBeLessThan(0.25);
  });

  it('exceeds the threshold for a real pan', () => {
    const panned = {
      ...base,
      center: { latitude: PECKHAM.latitude + 0.03, longitude: PECKHAM.longitude },
    };
    expect(viewportDelta(base, panned)).toBeGreaterThan(0.25);
  });

  it('exceeds the threshold for a zoom, not only for a pan', () => {
    const zoomed = { ...base, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    expect(viewportDelta(base, zoomed)).toBeGreaterThan(0.25);
  });
});

describe('cache keys — §39, §42', () => {
  it('rounds so a one-metre pan is a cache hit', () => {
    const a = { north: 51.5, south: 51.45, east: -0.05, west: -0.12 };
    const b = { north: 51.50001, south: 51.45001, east: -0.05001, west: -0.12001 };
    expect(boundsCacheKey(a)).toBe(boundsCacheKey(b));
  });

  it('keeps precise coordinates out of query keys', () => {
    // Query keys reach devtools, cache dumps and bug reports. §39 exempts none
    // of those, so three decimals — roughly 110 m — is the most precision a key
    // is allowed to carry.
    const key = boundsCacheKey({
      north: 51.474212345,
      south: 51.462498765,
      east: -0.069123456,
      west: -0.114998765,
    });

    expect(key).toBe('51.474,51.462,-0.069,-0.115');
    expect(key).not.toContain('51.4742123');
  });

  it('distinguishes genuinely different viewports', () => {
    const london = boundsCacheKey({ north: 51.5, south: 51.45, east: -0.05, west: -0.12 });
    const mauritius = boundsCacheKey({ north: -20.2, south: -20.3, east: 57.5, west: 57.45 });
    expect(london).not.toBe(mauritius);
  });
});
