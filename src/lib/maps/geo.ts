// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — geographic arithmetic (Frontend Phase 8)
//
// The pure geometry every map surface shares: bounding boxes, viewports,
// containment, and the conversion between the two ways this platform can ask
// "what is near here".
//
// **Haversine is not reimplemented.** `utils/geo.ts` already owns the
// great-circle distance and the platform's distance/commute formatting, and a
// second copy would be a second thing to get wrong. This module imports it and
// adds only what maps need on top: boxes, viewports, and the typed wrappers
// §48 requires so a crow-flies number cannot be mistaken for a routed one.
//
// Two things here are subtler than they look and are handled rather than
// assumed:
//
//   **The antimeridian.** A box may have `west > east`. Sorting the pair, which
//   is the usual shortcut, turns a 2° box over Fiji into a 358° box over the
//   entire planet — and the query built from it asks the backend for every
//   listing on Earth. Every predicate below tests longitude with an explicit
//   wrap branch.
//
//   **Latitude convergence.** A degree of longitude is ~111 km at the equator
//   and ~70 km in London. Anything converting between degrees and metres —
//   circle-to-box, box-to-circle, the cluster grid — scales longitude by
//   `cos(latitude)`. Skipping it makes clusters at high latitude wrong in one
//   axis, which shows up as pins that refuse to merge.
// ─────────────────────────────────────────────────────────────────────────────

import { getDistanceKm } from '@/utils/geo';
import {
  straightLine,
  type GeoBoundingBox,
  type GeoCoordinate,
  type MapViewport,
  type StraightLineDistance,
} from '@/types/maps';

/** Mean Earth radius in metres, matching the value `utils/geo.ts` uses in km. */
export const EARTH_RADIUS_M = 6_371_000;

const DEG_LAT_M = 111_320;

// ═════════════════════════════════════════════════════════════════════════════
// VALIDATION — §44's `invalid-coordinates`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Whether a coordinate is one the map may be pointed at.
 *
 * `0,0` is deliberately rejected. It is a real location in the Gulf of Guinea
 * and an entirely valid coordinate — but on this platform it is overwhelmingly
 * a missing latitude and a missing longitude that both defaulted to zero, and
 * showing a member "your listing is 4,800 km away, off the coast of Ghana" is
 * worse than showing no distance. Null Island is treated as absent data, and
 * the one place that genuinely needs it can construct a viewport directly.
 */
export function isValidCoordinate(coordinate: GeoCoordinate | null | undefined): boolean {
  if (!coordinate) return false;
  const { latitude, longitude } = coordinate;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/** Whether a box is well-formed. `west > east` is legal; `south > north` is not. */
export function isValidBounds(bounds: GeoBoundingBox | null | undefined): boolean {
  if (!bounds) return false;
  const { north, south, east, west } = bounds;
  if (![north, south, east, west].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return false;
  }
  if (north > 90 || south < -90 || north < south) return false;
  if (east > 180 || east < -180 || west > 180 || west < -180) return false;
  return true;
}

/** Clamps latitude to the Mercator-safe range and wraps longitude into ±180. */
export function normalizeCoordinate(coordinate: GeoCoordinate): GeoCoordinate {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, coordinate.latitude));
  let longitude = coordinate.longitude;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return { ...coordinate, latitude, longitude };
}

// ═════════════════════════════════════════════════════════════════════════════
// DISTANCE — §48
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Great-circle distance, typed so it can never be passed off as a routed one.
 *
 * The type is the whole contribution. `utils/geo.ts` returns a bare number,
 * which is right for a badge that says "2.1 km away" and wrong for anything
 * that promised a walking time — §48 exists because those two get confused.
 */
export function distanceBetween(a: GeoCoordinate, b: GeoCoordinate): StraightLineDistance {
  return straightLine(getDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000);
}

/** Metres to kilometres, for the existing formatters which speak km. */
export function toKm(distance: StraightLineDistance | { metres: number }): number {
  return distance.metres / 1000;
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from true north.
 *
 * Used to point the "you are here" chevron during navigation when the device
 * reports no heading of its own — a stationary phone has no heading, but a
 * member walking a route has a direction of travel worth drawing.
 */
export function bearingBetween(a: GeoCoordinate, b: GeoCoordinate): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Shortest distance from `point` to the segment `a`→`b`.
 *
 * This is the off-route test (§18). Done on a local equirectangular projection
 * rather than in spherical geometry: over a road segment of tens of metres the
 * error is millimetres, and the exact spherical cross-track formula is
 * numerically unstable when the point is near an endpoint — which, for someone
 * standing still at a junction waiting to cross, is most of the time.
 */
export function distanceToSegment(
  point: GeoCoordinate,
  a: GeoCoordinate,
  b: GeoCoordinate
): StraightLineDistance {
  const latRef = toRad((a.latitude + b.latitude) / 2);
  const mx = Math.cos(latRef) * DEG_LAT_M;

  const px = (point.longitude - a.longitude) * mx;
  const py = (point.latitude - a.latitude) * DEG_LAT_M;
  const bx = (b.longitude - a.longitude) * mx;
  const by = (b.latitude - a.latitude) * DEG_LAT_M;

  const lengthSq = bx * bx + by * by;
  if (lengthSq === 0) return straightLine(Math.hypot(px, py));

  // Clamped, so a point beyond either end measures to the endpoint rather than
  // to the infinite line the segment sits on.
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq));
  return straightLine(Math.hypot(px - t * bx, py - t * by));
}

/**
 * Shortest distance from a point to a polyline, with the index of the nearest
 * segment.
 *
 * The index is what makes navigation progress cheap: once the member is matched
 * to segment *k*, everything before it is behind them and the remaining
 * distance is a suffix sum rather than a re-walk of the whole route.
 */
export function distanceToPath(
  point: GeoCoordinate,
  path: GeoCoordinate[]
): { distance: StraightLineDistance; segmentIndex: number; fraction: number } {
  if (path.length === 0) return { distance: straightLine(Infinity), segmentIndex: -1, fraction: 0 };
  if (path.length === 1) return { distance: distanceBetween(point, path[0]), segmentIndex: 0, fraction: 0 };

  let best = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const d = distanceToSegment(point, path[i], path[i + 1]).metres;
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }

  // How far along the whole path the match sits, by cumulative length. Used for
  // the progress bar and for the remaining-distance suffix.
  const totalLength = pathLengthMetres(path);
  let travelled = 0;
  for (let i = 0; i < bestIndex; i += 1) {
    travelled += distanceBetween(path[i], path[i + 1]).metres;
  }
  travelled += distanceBetween(path[bestIndex], point).metres;

  return {
    distance: straightLine(best),
    segmentIndex: bestIndex,
    fraction: totalLength > 0 ? Math.max(0, Math.min(1, travelled / totalLength)) : 0,
  };
}

/** Total length of a polyline in metres. */
export function pathLengthMetres(path: GeoCoordinate[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += distanceBetween(path[i], path[i + 1]).metres;
  }
  return total;
}

/** Moves `metres` from `origin` along `bearingDeg`. Used to build dev routes. */
export function offsetCoordinate(
  origin: GeoCoordinate,
  metres: number,
  bearingDeg: number
): GeoCoordinate {
  const δ = metres / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(origin.latitude);
  const λ1 = toRad(origin.longitude);

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return normalizeCoordinate({ latitude: toDeg(φ2), longitude: toDeg(λ2) });
}

/** Linear interpolation between two coordinates. Adequate over route segments. */
export function interpolate(a: GeoCoordinate, b: GeoCoordinate, t: number): GeoCoordinate {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * clamped,
    longitude: a.longitude + (b.longitude - a.longitude) * clamped,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BOUNDING BOXES
// ═════════════════════════════════════════════════════════════════════════════

/** True when the box spans the ±180° meridian. */
export function crossesAntimeridian(bounds: GeoBoundingBox): boolean {
  return bounds.west > bounds.east;
}

/**
 * Whether a coordinate is inside a box.
 *
 * The longitude test branches on the wrap case. A box from 170°E to −170°E
 * contains 175°E and 179°W; a naive `west <= lon && lon <= east` contains
 * neither, and every viewport query near the date line silently returns empty.
 */
export function boundsContain(bounds: GeoBoundingBox, coordinate: GeoCoordinate): boolean {
  const { latitude, longitude } = coordinate;
  if (latitude < bounds.south || latitude > bounds.north) return false;

  return crossesAntimeridian(bounds)
    ? longitude >= bounds.west || longitude <= bounds.east
    : longitude >= bounds.west && longitude <= bounds.east;
}

/** The smallest box containing every coordinate. Null for an empty input. */
export function boundsFromCoordinates(coordinates: GeoCoordinate[]): GeoBoundingBox | null {
  const valid = coordinates.filter(isValidCoordinate);
  if (valid.length === 0) return null;

  // Deliberately does not attempt an antimeridian-minimal box. Points spread
  // across the date line are, on this platform, a diaspora spread across the
  // world rather than a cluster near Fiji — and a "zoom to fit" that wrapped the
  // long way round would frame the Pacific instead of the results.
  return {
    north: Math.max(...valid.map((c) => c.latitude)),
    south: Math.min(...valid.map((c) => c.latitude)),
    east: Math.max(...valid.map((c) => c.longitude)),
    west: Math.min(...valid.map((c) => c.longitude)),
  };
}

export function boundsCenter(bounds: GeoBoundingBox): GeoCoordinate {
  const latitude = (bounds.north + bounds.south) / 2;

  if (!crossesAntimeridian(bounds)) {
    return { latitude, longitude: (bounds.east + bounds.west) / 2 };
  }
  // Average across the wrap, then re-normalize.
  const span = 360 - bounds.west + bounds.east;
  return normalizeCoordinate({ latitude, longitude: bounds.west + span / 2 });
}

/** Longitude span in degrees, correct across the wrap. */
export function boundsWidth(bounds: GeoBoundingBox): number {
  return crossesAntimeridian(bounds)
    ? 360 - bounds.west + bounds.east
    : bounds.east - bounds.west;
}

export function boundsHeight(bounds: GeoBoundingBox): number {
  return bounds.north - bounds.south;
}

/** Grows a box by a fraction of its own size on each axis. */
export function padBounds(bounds: GeoBoundingBox, fraction: number): GeoBoundingBox {
  const padLat = boundsHeight(bounds) * fraction;
  const padLon = boundsWidth(bounds) * fraction;

  return {
    north: Math.min(90, bounds.north + padLat),
    south: Math.max(-90, bounds.south - padLat),
    east: normalizeLongitude(bounds.east + padLon),
    west: normalizeLongitude(bounds.west - padLon),
  };
}

/** True when two boxes share any area. Used to decide whether to refetch. */
export function boundsIntersect(a: GeoBoundingBox, b: GeoBoundingBox): boolean {
  if (a.south > b.north || b.south > a.north) return false;

  if (!crossesAntimeridian(a) && !crossesAntimeridian(b)) {
    return !(a.west > b.east || b.west > a.east);
  }
  // With a wrap on either side the interval algebra stops being a simple
  // comparison; splitting at ±180 and testing the pieces is easier to trust
  // than a clever single expression.
  return splitAtAntimeridian(a).some((pa) =>
    splitAtAntimeridian(b).some((pb) => !(pa.west > pb.east || pb.west > pa.east))
  );
}

function splitAtAntimeridian(bounds: GeoBoundingBox): GeoBoundingBox[] {
  if (!crossesAntimeridian(bounds)) return [bounds];
  return [
    { ...bounds, west: bounds.west, east: 180 },
    { ...bounds, west: -180, east: bounds.east },
  ];
}

/**
 * How much `next` differs from `previous`, as a fraction of the previous size.
 *
 * This is §13's "meaningful map movement" test. A pan of a tenth of a screen or
 * a hair of a zoom is somebody's finger settling, not a new question, and
 * firing a query for it is exactly the "request per pixel of movement" the
 * brief forbids. Centre movement and zoom change are combined into one number
 * so a single threshold covers both gestures.
 */
export function viewportDelta(previous: MapViewport, next: MapViewport): number {
  const prevSpan = Math.max(previous.latitudeDelta, previous.longitudeDelta, 1e-6);

  const centreShift =
    Math.max(
      Math.abs(next.center.latitude - previous.center.latitude),
      Math.abs(next.center.longitude - previous.center.longitude)
    ) / prevSpan;

  const zoomChange = Math.max(
    Math.abs(next.latitudeDelta - previous.latitudeDelta) / previous.latitudeDelta,
    Math.abs(next.longitudeDelta - previous.longitudeDelta) / previous.longitudeDelta
  );

  return Math.max(centreShift, zoomChange);
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEWPORTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Whether a box is somewhere: all four edges are numbers.
 *
 * A map can exist before anyone knows where it should be. A member whose
 * location has not loaded yet has a `NaN` coordinate on purpose (see
 * `UNKNOWN_LOCATION`), and a viewport built from it has `NaN` edges. Every
 * query built from those edges is a 400 that the screen then reports as "we
 * could not load this part of the map" — which was the alerts map's whole
 * screen on a cold start (17 Sep 2026). A query hook asks this first and waits.
 */
export function isPlacedBounds(bounds: GeoBoundingBox | null | undefined): bounds is GeoBoundingBox {
  return (
    !!bounds &&
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west) &&
    // A box with no area is the zero-span placeholder's, not a place on screen.
    bounds.north > bounds.south &&
    bounds.east !== bounds.west
  );
}

/**
 * Whether a viewport is somewhere and has a size.
 *
 * Checked separately from its bounds because a viewport built from a `NaN`
 * centre also has a `NaN` width — the width is scaled by the centre's latitude —
 * and moving only the centre later leaves that width behind. Rebuild a viewport
 * this rejects; do not patch its centre.
 *
 * **A zero span is not a size.** `viewportFromCenter(centre, 0)` is zero wide,
 * and the map session opened on exactly that for its whole life. Projected onto
 * a screen it divides every coordinate into Infinity, which the schematic map
 * wrote into SVG path text and crashed the app with (17 Sep 2026).
 */
export function isPlacedViewport(viewport: MapViewport): boolean {
  return (
    Number.isFinite(viewport.center.latitude) &&
    Number.isFinite(viewport.center.longitude) &&
    Number.isFinite(viewport.latitudeDelta) &&
    Number.isFinite(viewport.longitudeDelta) &&
    viewport.latitudeDelta > 0 &&
    viewport.longitudeDelta > 0
  );
}

/**
 * The viewport a map opens on, given the one it holds and where it should be.
 *
 * - The same place, already sized: unchanged, so a member's zoom survives a revisit.
 * - A different place, already sized: re-centred at the member's zoom.
 * - Anything unsized — the session's placeholder, or one built before the
 *   location loaded: rebuilt around the target at `radiusKm`.
 *
 * `null` when there is nowhere to go yet; the caller keeps what it has.
 */
export function openingViewport(
  current: MapViewport,
  target: GeoCoordinate,
  radiusKm: number
): MapViewport | null {
  if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return null;

  const center = { latitude: target.latitude, longitude: target.longitude };

  if (!isPlacedViewport(current)) return viewportFromCenter(center, radiusKm);

  if (current.center.latitude === center.latitude && current.center.longitude === center.longitude) {
    return current;
  }

  return { ...current, center };
}

export function viewportToBounds(viewport: MapViewport): GeoBoundingBox {
  return {
    north: Math.min(90, viewport.center.latitude + viewport.latitudeDelta / 2),
    south: Math.max(-90, viewport.center.latitude - viewport.latitudeDelta / 2),
    east: normalizeLongitude(viewport.center.longitude + viewport.longitudeDelta / 2),
    west: normalizeLongitude(viewport.center.longitude - viewport.longitudeDelta / 2),
  };
}

export function boundsToViewport(bounds: GeoBoundingBox, padding = 0.15): MapViewport {
  const padded = padBounds(bounds, padding);
  return {
    center: boundsCenter(padded),
    // A floor, so zooming to a single result does not produce a viewport of
    // zero degrees — which every provider interprets differently and at least
    // one interprets as "maximum zoom, somewhere in the ocean".
    latitudeDelta: Math.max(boundsHeight(padded), 0.002),
    longitudeDelta: Math.max(boundsWidth(padded), 0.002),
  };
}

/**
 * An approximate Web-Mercator zoom level for the viewport.
 *
 * Provider-independent and used only for layer thresholds (§22) and cluster
 * radius. Not sent to any provider — a tile zoom is a tile-provider concept and
 * §4 keeps those out of the domain.
 */
export function viewportToZoom(viewport: MapViewport): number {
  const span = Math.max(viewport.longitudeDelta, 1e-6);
  return Math.max(0, Math.min(20, Math.log2(360 / span)));
}

export function viewportFromCenter(center: GeoCoordinate, radiusKm: number): MapViewport {
  const latitudeDelta = ((radiusKm * 2) / (DEG_LAT_M / 1000)) * 1.2;
  const cosLat = Math.max(Math.cos(toRad(center.latitude)), 0.01);

  return {
    center,
    latitudeDelta,
    longitudeDelta: latitudeDelta / cosLat,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CIRCLE ↔ BOX — the bridge to the certified backend
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The smallest circle enclosing a box.
 *
 * This is the compatibility shim FRONTEND-MAPS-GAP-001 is about: every certified
 * search route on this platform takes `latitude`, `longitude` and `radiusKm`,
 * and none takes a bounding box. Rather than pretend the map is a circle, the
 * query layer keeps the viewport as the truth and sends the enclosing circle to
 * routes that only understand one.
 *
 * The circle is always *larger* than the box — up to 4/π ≈ 1.27× the area for a
 * square. That is the correct direction to be wrong in: the extra results fall
 * outside the viewport and are filtered client-side, whereas a smaller circle
 * would silently drop results the member can see empty space where.
 * `hasOverfetch` says so, so the caller can filter rather than trusting.
 */
export function boundsToCircle(bounds: GeoBoundingBox): {
  center: GeoCoordinate;
  radiusKm: number;
  hasOverfetch: boolean;
} {
  const center = boundsCenter(bounds);
  const corner: GeoCoordinate = { latitude: bounds.north, longitude: bounds.east };
  const radiusKm = Math.max(toKm(distanceBetween(center, corner)), 0.1);

  return { center, radiusKm, hasOverfetch: true };
}

/** The smallest box containing a circle. Longitude scaled for latitude. */
export function circleToBounds(center: GeoCoordinate, radiusKm: number): GeoBoundingBox {
  const latDelta = (radiusKm * 1000) / DEG_LAT_M;
  const cosLat = Math.max(Math.cos(toRad(center.latitude)), 0.01);
  const lonDelta = latDelta / cosLat;

  return {
    north: Math.min(90, center.latitude + latDelta),
    south: Math.max(-90, center.latitude - latDelta),
    east: normalizeLongitude(center.longitude + lonDelta),
    west: normalizeLongitude(center.longitude - lonDelta),
  };
}

/**
 * A stable, low-precision key for a viewport.
 *
 * Two purposes, and the second is the important one. It deduplicates TanStack
 * Query cache entries so a one-metre pan is a cache hit rather than a new
 * request (§13, §42) — and because it rounds to three decimals, roughly 110 m,
 * **no precise coordinate ever appears in a query key**. Query keys end up in
 * devtools, in cache dumps and in bug reports, and §39 does not exempt any of
 * those.
 */
export function boundsCacheKey(bounds: GeoBoundingBox): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(bounds.north)},${r(bounds.south)},${r(bounds.east)},${r(bounds.west)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL
// ═════════════════════════════════════════════════════════════════════════════

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function normalizeLongitude(longitude: number): number {
  let value = longitude;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

/** Metres per degree of longitude at a latitude. Exported for the clusterer. */
export function metresPerDegreeLongitude(latitude: number): number {
  return Math.cos(toRad(latitude)) * DEG_LAT_M;
}

export const metresPerDegreeLatitude = DEG_LAT_M;
