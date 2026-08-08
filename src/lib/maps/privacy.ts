// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — location privacy (Frontend Phase 8, §39, §40, §59)
//
// Location is the most sensitive thing this application handles. A wallet
// balance leaks money; a precise home coordinate leaks where somebody sleeps,
// and for a diaspora community — people with immigration status in progress,
// people who left somewhere — that is a materially different category of harm.
//
// This module is the only place that reduces precision, and it is deliberately
// small enough to audit in one sitting.
//
// ── What it does, and the one thing it does not ──────────────────────────────
//
// The backend remains authoritative for privacy rules (§39, closing line). A
// server that returns an exact seller coordinate has made a decision this client
// cannot second-guess into safety — the address has already crossed the wire and
// is in the response cache. What this module provides is **defence in depth**:
// the client additionally refuses to *render* a private-category coordinate at
// full precision, so a backend mistake degrades into a coarse pin rather than a
// front door.
//
// Two techniques, chosen for different reasons:
//
//   **Deterministic jitter** for approximate points. The offset is derived from
//   a hash of the entity id, so the same listing lands in the same place every
//   time. Random jitter would be worse than none: re-render it five times, take
//   the centroid, and you have recovered the true position to within a few
//   metres. A fixed per-entity offset cannot be averaged out.
//
//   **Snapping** for neighbourhood and city precision. There is nothing to
//   recover — every listing in the area collapses to one centroid.
//
// ── Analytics and logging ────────────────────────────────────────────────────
//
// §51 and §59 forbid recording precise coordinates. `coarseForAnalytics()` is
// the only shape that may be attached to an event, and it is a ~11 km cell, not
// a coordinate. There is no function in this file that returns a loggable
// precise coordinate, which is the point: a call site that wants one has to go
// out of its way, in a review-visible manner.
// ─────────────────────────────────────────────────────────────────────────────

import type { GeoCoordinate, GeoPrecision, MarkerCategory } from '@/types/maps';
import { metresPerDegreeLatitude, metresPerDegreeLongitude } from './geo';

/**
 * How coarse each marker category must be before it is drawn.
 *
 * §32 — a marketplace seller's exact location must not be exposed. §39 — no
 * private residential address, no volunteer private location. Everything else
 * on this list is a *published* location: an event venue, an organization
 * office, a service provider's premises, a neighbourhood centroid. Those are
 * public facts and coarsening them would make the product worse for no privacy
 * gain.
 *
 * Housing is the interesting case and it is `approximate` on purpose. A rental
 * listing's street is genuinely useful — it decides whether the flat is worth
 * viewing — but the exact door is what somebody would use to find a person, and
 * the listing is frequently somebody's current home. A ~150 m offset preserves
 * "which end of Rye Lane" and destroys "which building".
 */
export const CATEGORY_PRECISION: Record<MarkerCategory, GeoPrecision> = {
  housing: 'approximate',
  marketplace: 'approximate',
  job: 'exact',
  provider: 'exact',
  guide: 'neighborhood',
  organization: 'exact',
  event: 'exact',
  neighborhood: 'neighborhood',
  alert: 'exact',
  service: 'exact',
  place: 'exact',
  saved: 'exact',
  origin: 'exact',
  destination: 'exact',
  waypoint: 'exact',
};

/** Jitter radius for `approximate`. Roughly a city block. */
const APPROXIMATE_RADIUS_M = 150;

/** Grid the `neighborhood` snap uses. ~1.1 km cells. */
const NEIGHBORHOOD_GRID_DEG = 0.01;

/** Grid the `city` snap uses. ~11 km cells. */
const CITY_GRID_DEG = 0.1;

/**
 * The grid analytics coordinates are snapped to. ~11 km.
 *
 * Chosen so a cell is a *district*, not a street: large enough that it cannot
 * identify a person or a building, small enough that "which parts of London use
 * the housing map" remains an answerable question. §51 asks for the events, not
 * for the coordinates.
 */
const ANALYTICS_GRID_DEG = 0.1;

/**
 * A small, stable, well-distributed hash of a string.
 *
 * FNV-1a **followed by an avalanche step**, and the second half is not
 * optional. Its job is to turn an entity id into a repeatable angle and radius,
 * not to resist an attacker who already has the id — but it must avoid
 * clumping, because a hash that maps most ids to a similar angle pushes every
 * listing on a street the same way and preserves the shape of the road.
 *
 * Plain FNV-1a does exactly that here, and the property test in
 * `maps-privacy.test.ts` is what found it. The final operation of the loop is a
 * multiply, and the low bits of a product depend only on the low bits of the
 * operands — so the bottom 16 bits, which is where the angle was drawn from,
 * carry almost no entropy from the earlier bytes. Eight consecutive short ids
 * produced eight angles inside a 60° arc: every pin displaced north-east, the
 * street still legible, the mitigation worthless.
 *
 * The fix is MurmurHash3's `fmix32` finalizer, which is the standard remedy: a
 * pair of shift-xor-multiply rounds that diffuse the high bits down. After it,
 * a one-character change in the input moves roughly half the output bits.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return avalanche(hash);
}

/** MurmurHash3's `fmix32`. Diffuses high bits into low ones. */
function avalanche(input: number): number {
  let hash = input >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Coarsens a coordinate to the requested precision.
 *
 * `seed` should be a stable entity identifier. Without one the jitter falls
 * back to a hash of the rounded coordinate itself, which is still deterministic
 * — two renders of the same listing agree — but which does mean two listings at
 * the same address receive the same offset. That is acceptable: they are at the
 * same address.
 */
export function reducePrecision(
  coordinate: GeoCoordinate,
  precision: GeoPrecision,
  seed?: string
): GeoCoordinate {
  switch (precision) {
    case 'exact':
      return { ...coordinate, precision: 'exact' };

    case 'approximate': {
      const key = seed ?? `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`;
      const hash = hashString(key);

      // Two draws, from two *separately avalanched* halves rather than from two
      // slices of one value. Slicing a single 32-bit hash correlates the angle
      // and the radius — ids that hash close together get both a similar
      // direction and a similar distance, which is the clumping this is meant
      // to prevent, twice over.
      //
      // `sqrt` on the radius draw makes the offset uniform over the *disc*.
      // Without it points bunch towards the centre and the true position
      // becomes the modal answer, which is most of the way back to no jitter.
      const angle = (avalanche(hash) / 0xffffffff) * Math.PI * 2;
      const radius =
        Math.sqrt(avalanche(hash ^ 0x9e3779b9) / 0xffffffff) * APPROXIMATE_RADIUS_M;

      const latOffset = (radius * Math.cos(angle)) / metresPerDegreeLatitude;
      const lonOffset =
        (radius * Math.sin(angle)) / Math.max(metresPerDegreeLongitude(coordinate.latitude), 1);

      return {
        latitude: coordinate.latitude + latOffset,
        longitude: coordinate.longitude + lonOffset,
        precision: 'approximate',
      };
    }

    case 'neighborhood':
      return { ...snapToGrid(coordinate, NEIGHBORHOOD_GRID_DEG), precision: 'neighborhood' };

    case 'city':
      return { ...snapToGrid(coordinate, CITY_GRID_DEG), precision: 'city' };
  }
}

/**
 * Applies the category's mandated precision.
 *
 * The one call every marker construction goes through. A caller cannot opt out
 * by omission — `markerCoordinate` is the only sanctioned way to get a
 * coordinate onto a pin, and `lib/maps/markers.ts` uses nothing else.
 */
export function markerCoordinate(
  coordinate: GeoCoordinate,
  category: MarkerCategory,
  seed?: string
): { coordinate: GeoCoordinate; isPrivacyReduced: boolean } {
  const required = CATEGORY_PRECISION[category];
  const reduced = reducePrecision(coordinate, required, seed);
  return { coordinate: reduced, isPrivacyReduced: required !== 'exact' };
}

/** Snaps to the centre of a grid cell. */
function snapToGrid(coordinate: GeoCoordinate, cellDeg: number): GeoCoordinate {
  return {
    latitude: Math.round(coordinate.latitude / cellDeg) * cellDeg,
    longitude: Math.round(coordinate.longitude / cellDeg) * cellDeg,
  };
}

/**
 * The only coordinate shape §51 permits on an analytics event.
 *
 * Returns a **cell**, not a coordinate, and the field names say so. That is
 * deliberate: `{ latitude, longitude }` on an event payload reads as a position
 * and would survive review; `{ geoCell: "gb:51.5,-0.1" }` reads as what it is.
 *
 * The country code is included because it is the dimension anyone actually
 * wants — "how many members in the UK opened the map" — and it is not
 * identifying at any plausible scale.
 */
export function coarseForAnalytics(
  coordinate: GeoCoordinate | null | undefined,
  countryCode?: string
): { geoCell: string } | null {
  if (!coordinate) return null;

  const cell = snapToGrid(coordinate, ANALYTICS_GRID_DEG);
  const prefix = countryCode ? `${countryCode.toLowerCase()}:` : '';

  return { geoCell: `${prefix}${cell.latitude.toFixed(1)},${cell.longitude.toFixed(1)}` };
}

/**
 * Whether a coordinate may be sent to the backend for this purpose.
 *
 * §59: do not send location unless the feature requires it, at the minimum
 * necessary precision. The two branches differ by an order of magnitude for a
 * reason — a routing request that rounded the origin to 1 km would start the
 * walk from the wrong street, whereas a nearby-search rounded to ~110 m returns
 * the same results and no longer carries a fix precise enough to place somebody
 * in a building.
 */
export function coordinateForRequest(
  coordinate: GeoCoordinate,
  purpose: 'search' | 'routing' | 'reverse-geocode'
): GeoCoordinate {
  const decimals = purpose === 'routing' ? 5 : 3;
  const factor = 10 ** decimals;

  return {
    latitude: Math.round(coordinate.latitude * factor) / factor,
    longitude: Math.round(coordinate.longitude * factor) / factor,
  };
}

/**
 * Whether a saved location is one whose label must never leave the device.
 *
 * "Home" and "Work" name where a person lives and works. Those two strings on a
 * shared route, an analytics event or a crash report are the whole problem §39
 * describes, so §20's sharing surfaces call this and substitute a neutral label.
 */
export function isSensitiveSavedLocation(kind: string): boolean {
  return kind === 'home' || kind === 'work' || kind === 'school';
}

/**
 * A label safe to show to anyone but the owner.
 *
 * Deliberately drops the coordinate entirely rather than coarsening it. There
 * is no radius at which "somewhere near here is where this person lives" is a
 * fact worth sharing.
 */
export function publicLabelFor(kind: string, label: string): string {
  return isSensitiveSavedLocation(kind) ? 'A saved place' : label;
}
