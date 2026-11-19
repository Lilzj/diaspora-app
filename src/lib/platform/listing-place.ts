// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — where a listing is, whatever shape the route sends
//
// ── The crash this exists to prevent ────────────────────────────────────────
//
// `JobCard`, `HousingCard` and `MarketplaceCard` each destructured a `location`
// object off the row and read straight through it:
//
//     const formattedDistance = location.distanceKm != null
//       ? `${location.distanceKm.toFixed(1)}km away`
//       : '';
//
// The three list routes do not agree on that shape, and one of them does not
// send it at all:
//
//   GET  /jobs                 flat. `locationLabel: "Curepipe"`, `countryCode`,
//                              **no `location` object**, no distance.
//   POST /marketplace/search   `location: { countryCode, regionName, cityName,
//                              neighbourhood, areaId, displayName }` — British
//                              spelling — and `distanceKm` at the **top level**.
//   GET  /housing/listings/{id} `location: { countryCode, regionName, cityName,
//                              neighbourhoodName, … }` — and no coordinates.
//
// So on the jobs tab `location` was `undefined` and `location.distanceKm` threw
// `TypeError: Cannot read property 'distanceKm' of undefined` **during render**,
// which React cannot recover from: the process died to the launcher. `JobCard`
// is rendered by seven screens including **Discover → Jobs**, so the crash sat
// on a primary navigation destination.
//
// It had never fired because the jobs table was empty. Every one of these cards
// had only ever been rendered against a hand-written fixture that happened to
// carry the shape the card expected.
//
// ── What this module promises ───────────────────────────────────────────────
//
// One reader for all three shapes, which **never throws** and **never invents**.
// An absent place is an empty string and an absent distance is `null`; the
// caller omits the line rather than printing "undefined" or "0 km away".
// ─────────────────────────────────────────────────────────────────────────────

/** A row from any list route, read defensively. */
type UnknownRow = Record<string, unknown> | null | undefined;

function str(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function nested(row: UnknownRow): Record<string, unknown> {
  const location = (row as Record<string, unknown> | null | undefined)?.location;
  return location && typeof location === 'object' ? (location as Record<string, unknown>) : {};
}

/**
 * The place, in the words a member should read.
 *
 * Most specific first — a neighbourhood beats a city beats a country — and at
 * most two parts, because a card has one line. Both spellings of neighbourhood
 * are accepted: Marketplace sends `neighbourhood`, Housing sends
 * `neighbourhoodName`, and the client's own fixtures say `areaName`.
 */
export function placeLabelOf(row: UnknownRow): string {
  const location = nested(row);
  const flat = (row ?? {}) as Record<string, unknown>;

  const parts = [
    str(location.areaName) || str(location.neighbourhood) || str(location.neighborhood) ||
      str(location.neighbourhoodName) || str(location.neighborhoodName),
    str(location.cityName) || str(location.city),
  ].filter(Boolean);

  if (parts.length > 0) return parts.slice(0, 2).join(', ');

  // `GET /jobs` sends this and nothing else, already formatted for display.
  return (
    str(location.displayName) ||
    str(flat.locationLabel) ||
    str(location.regionName) ||
    str(location.countryCode) ||
    str(flat.countryCode)
  );
}

/**
 * How far away, when the platform actually said.
 *
 * `null` for every other case — absent, non-numeric, or `NaN` — so a caller
 * cannot accidentally render "NaN km away". Marketplace puts this at the top
 * level of the row; the other routes nest it or omit it entirely.
 */
export function distanceKmOf(row: UnknownRow): number | null {
  const candidates = [
    (row as Record<string, unknown> | null | undefined)?.distanceKm,
    nested(row).distanceKm,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }

  return null;
}

/** The distance as a member reads it, or an empty string when there is none. */
export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return '';

  return distanceKm < 1
    ? `${(distanceKm * 1000).toFixed(0)}m away`
    : `${distanceKm.toFixed(1)}km away`;
}

/** Both, for the common case of a card that shows "📍 Place · 2.1km away". */
export function placeOf(row: UnknownRow): { label: string; distance: string } {
  return { label: placeLabelOf(row), distance: formatDistance(distanceKmOf(row)) };
}

/**
 * The provider card's place line. The provider search sends the distance as the
 * server computed it (2.0667064493783025), so it goes through the same rounding
 * as every other card rather than straight into the text.
 */
export function providerPlaceLine(location: {
  areaName?: string | null;
  cityName?: string | null;
  distanceKm?: number | null;
}): string {
  const place = location.areaName ?? location.cityName ?? 'Location not given';
  const distance = formatDistance(
    typeof location.distanceKm === 'number' && Number.isFinite(location.distanceKm)
      ? location.distanceKm
      : null,
  );

  return distance ? `📍 ${place} · ${distance}` : `📍 ${place}`;
}

/**
 * Where a map pin goes. A row with no distance keeps `null`: 0 would tell the
 * pin card the place is "In Your Neighborhood".
 */
export function pinPlaceOf(
  location: Record<string, unknown> | undefined,
): { latitude: number; longitude: number; distanceKm: number | null } | null {
  const readNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const latitude = readNumber(location?.latitude);
  const longitude = readNumber(location?.longitude);
  if (latitude === null || longitude === null) return null;

  return { latitude, longitude, distanceKm: readNumber(location?.distanceKm) };
}
