// ─────────────────────────────────────────────────────────────────────────────
// Filing coordinates (14 Oct 2026)
//
// The place catalogue is retired: listings are filed by coordinates + the
// member's country + the typed town. These are the shared rules every form
// applies to the coordinates it sends. Kept apart from `town-search.ts` so a
// test that mocks the Google search does not also remove the rules.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The coordinates a form sends to file a listing by (14 Oct 2026): both or
 * neither, in range, as every create/update route requires. Half a pair, or a
 * value out of range, sends neither rather than earning a refusal. A typed town
 * with no Google match has none, and that is never an error.
 */
export function coordinatesOf(
  place: { latitude?: number | null; longitude?: number | null } | null | undefined
): { latitude: number | null; longitude: number | null } {
  const latitude = place?.latitude;
  const longitude = place?.longitude;
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return { latitude, longitude };
  }
  return { latitude: null, longitude: null };
}

/**
 * Where a place the member describes is filed (14 Oct 2026): their own pin
 * (address search or "use my location") when they set one, otherwise the
 * picked town's coordinates, otherwise nothing. A town centre never replaces a
 * pin the member chose. Without a town, the town's coordinates are not used.
 */
export function ownPinOrTown(
  ownPin: { latitude: number; longitude: number } | null | undefined,
  cityName: string,
  town: { latitude?: number | null; longitude?: number | null } | null | undefined
): { latitude: number; longitude: number } | undefined {
  const own = coordinatesOf(ownPin);
  if (own.latitude !== null && own.longitude !== null) {
    return { latitude: own.latitude, longitude: own.longitude };
  }
  if (!cityName.trim()) return undefined;
  const picked = coordinatesOf(town);
  return picked.latitude === null || picked.longitude === null
    ? undefined
    : { latitude: picked.latitude, longitude: picked.longitude };
}
