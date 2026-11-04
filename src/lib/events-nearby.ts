// ─────────────────────────────────────────────────────────────────────────────
// Events near the member (UAT, 3 Nov 2026, item 2)
//
// The events route takes a point and a radius, keeps to that circle, says how
// far each event is and sorts nearest first on request (since 4 Nov 2026).
// The point is the member's own place: the phone's position or the area they
// chose. A country's middle is not a place anybody is, so a location known only
// to the country offers no "Nearby".
// ─────────────────────────────────────────────────────────────────────────────

/** The radii the screen offers, in kilometres. */
export const EVENT_RADII_KM = [5, 10, 25, 50] as const;
export const DEFAULT_EVENT_RADIUS_KM = 10;

export function nearbyPointOf(
  location: { latitude?: number | null; longitude?: number | null; precision?: string } | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!location || location.precision === 'country') return null;
  const { latitude, longitude } = location;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** "400 m away", "2.1 km away", "14 km away"; null when the server sent no distance. */
export function eventDistanceLabel(distanceKm: number | null | undefined): string | null {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return `${Math.max(100, Math.round((distanceKm * 1000) / 100) * 100)} m away`;
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`;
  return `${Math.round(distanceKm)} km away`;
}
