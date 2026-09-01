// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Where is a country, roughly?
//
// ── Why this table exists ────────────────────────────────────────────────────
//
// `store/location.ts` used to seed every member's discovery context with a
// literal: Peckham, London — neighbourhood, street, and a 5 km radius around
// Rye Lane. A member in Port Louis who had never opened a map was told they
// were in Peckham, and every discovery query the app made was scoped to a five
// kilometre circle on the other side of the planet. The empty state that came
// back read "No providers match in London".
//
// The platform already knows something true about where a member is: they gave
// their country of residence at registration, and it is a required field. That
// is a *country*, not a neighbourhood, and this table is what lets the app say
// so without inventing the rest of the address.
//
// ── These are centroids, and the radius is what keeps them honest ────────────
//
// A centroid is not a member's position and must never be presented as one.
// A country-precision location therefore always carries `searchRadius = -2`
// ("entire country"), and every query builder in the app already reads
// `radiusKm: searchRadius > 0 ? searchRadius : undefined` — so no proximity
// filter is sent at all. The coordinate exists to centre a map, never to claim
// a distance.
//
// ── Coverage ────────────────────────────────────────────────────────────────
//
// The platform's supported and featured countries first, then the diaspora
// corridors this product is actually for. A country that is missing is not a
// failure: `countryCentroid` returns `null`, the caller keeps
// `precision: 'country'` with no pin, and the UI names the country instead of
// drawing it.
// ─────────────────────────────────────────────────────────────────────────────

export interface Centroid {
  latitude: number;
  longitude: number;
}

/**
 * Approximate geographic centres, ordered by relevance to this platform rather
 * than alphabetically: the served countries come first.
 */
const CENTROIDS: Readonly<Record<string, Centroid>> = Object.freeze({
  // ── Supported / featured by the platform ──────────────────────────────────
  MU: { latitude: -20.2759, longitude: 57.5703 },
  GB: { latitude: 54.0, longitude: -2.0 },
  NG: { latitude: 9.082, longitude: 8.6753 },
  GH: { latitude: 7.9465, longitude: -1.0232 },
  KE: { latitude: 0.0236, longitude: 37.9062 },
  ZA: { latitude: -30.5595, longitude: 22.9375 },

  // ── Africa ────────────────────────────────────────────────────────────────
  DZ: { latitude: 28.0339, longitude: 1.6596 },
  AO: { latitude: -11.2027, longitude: 17.8739 },
  BJ: { latitude: 9.3077, longitude: 2.3158 },
  BW: { latitude: -22.3285, longitude: 24.6849 },
  BF: { latitude: 12.2383, longitude: -1.5616 },
  BI: { latitude: -3.3731, longitude: 29.9189 },
  CM: { latitude: 7.3697, longitude: 12.3547 },
  CV: { latitude: 16.5388, longitude: -23.0418 },
  TD: { latitude: 15.4542, longitude: 18.7322 },
  KM: { latitude: -11.875, longitude: 43.8722 },
  CD: { latitude: -4.0383, longitude: 21.7587 },
  CG: { latitude: -0.228, longitude: 15.8277 },
  CI: { latitude: 7.54, longitude: -5.5471 },
  DJ: { latitude: 11.8251, longitude: 42.5903 },
  EG: { latitude: 26.8206, longitude: 30.8025 },
  ER: { latitude: 15.1794, longitude: 39.7823 },
  ET: { latitude: 9.145, longitude: 40.4897 },
  GA: { latitude: -0.8037, longitude: 11.6094 },
  GM: { latitude: 13.4432, longitude: -15.3101 },
  GN: { latitude: 9.9456, longitude: -9.6966 },
  LR: { latitude: 6.4281, longitude: -9.4295 },
  LY: { latitude: 26.3351, longitude: 17.2283 },
  MG: { latitude: -18.7669, longitude: 46.8691 },
  MW: { latitude: -13.2543, longitude: 34.3015 },
  ML: { latitude: 17.5707, longitude: -3.9962 },
  MA: { latitude: 31.7917, longitude: -7.0926 },
  MZ: { latitude: -18.6657, longitude: 35.5296 },
  NA: { latitude: -22.9576, longitude: 18.4904 },
  NE: { latitude: 17.6078, longitude: 8.0817 },
  RW: { latitude: -1.9403, longitude: 29.8739 },
  RE: { latitude: -21.1151, longitude: 55.5364 },
  SN: { latitude: 14.4974, longitude: -14.4524 },
  SC: { latitude: -4.6796, longitude: 55.492 },
  SL: { latitude: 8.4606, longitude: -11.7799 },
  SO: { latitude: 5.1521, longitude: 46.1996 },
  SS: { latitude: 6.877, longitude: 31.307 },
  SD: { latitude: 12.8628, longitude: 30.2176 },
  TZ: { latitude: -6.369, longitude: 34.8888 },
  TG: { latitude: 8.6195, longitude: 0.8248 },
  TN: { latitude: 33.8869, longitude: 9.5375 },
  UG: { latitude: 1.3733, longitude: 32.2903 },
  ZM: { latitude: -13.1339, longitude: 27.8493 },
  ZW: { latitude: -19.0154, longitude: 29.1549 },

  // ── Europe ────────────────────────────────────────────────────────────────
  IE: { latitude: 53.4129, longitude: -8.2439 },
  FR: { latitude: 46.2276, longitude: 2.2137 },
  DE: { latitude: 51.1657, longitude: 10.4515 },
  NL: { latitude: 52.1326, longitude: 5.2913 },
  BE: { latitude: 50.5039, longitude: 4.4699 },
  IT: { latitude: 41.8719, longitude: 12.5674 },
  ES: { latitude: 40.4637, longitude: -3.7492 },
  PT: { latitude: 39.3999, longitude: -8.2245 },
  SE: { latitude: 60.1282, longitude: 18.6435 },
  NO: { latitude: 60.472, longitude: 8.4689 },
  DK: { latitude: 56.2639, longitude: 9.5018 },
  FI: { latitude: 61.9241, longitude: 25.7482 },
  CH: { latitude: 46.8182, longitude: 8.2275 },
  AT: { latitude: 47.5162, longitude: 14.5501 },
  PL: { latitude: 51.9194, longitude: 19.1451 },
  GR: { latitude: 39.0742, longitude: 21.8243 },

  // ── Americas ──────────────────────────────────────────────────────────────
  US: { latitude: 37.0902, longitude: -95.7129 },
  CA: { latitude: 56.1304, longitude: -106.3468 },
  MX: { latitude: 23.6345, longitude: -102.5528 },
  BR: { latitude: -14.235, longitude: -51.9253 },
  AR: { latitude: -38.4161, longitude: -63.6167 },
  CO: { latitude: 4.5709, longitude: -74.2973 },
  JM: { latitude: 18.1096, longitude: -77.2975 },
  TT: { latitude: 10.6918, longitude: -61.2225 },
  BB: { latitude: 13.1939, longitude: -59.5432 },
  HT: { latitude: 18.9712, longitude: -72.2852 },
  DO: { latitude: 18.7357, longitude: -70.1627 },
  GY: { latitude: 4.8604, longitude: -58.9302 },

  // ── Middle East and Asia-Pacific ──────────────────────────────────────────
  AE: { latitude: 23.4241, longitude: 53.8478 },
  SA: { latitude: 23.8859, longitude: 45.0792 },
  QA: { latitude: 25.3548, longitude: 51.1839 },
  KW: { latitude: 29.3117, longitude: 47.4818 },
  OM: { latitude: 21.5126, longitude: 55.9233 },
  BH: { latitude: 25.9304, longitude: 50.6378 },
  TR: { latitude: 38.9637, longitude: 35.2433 },
  IN: { latitude: 20.5937, longitude: 78.9629 },
  PK: { latitude: 30.3753, longitude: 69.3451 },
  BD: { latitude: 23.685, longitude: 90.3563 },
  LK: { latitude: 7.8731, longitude: 80.7718 },
  CN: { latitude: 35.8617, longitude: 104.1954 },
  JP: { latitude: 36.2048, longitude: 138.2529 },
  KR: { latitude: 35.9078, longitude: 127.7669 },
  SG: { latitude: 1.3521, longitude: 103.8198 },
  MY: { latitude: 4.2105, longitude: 101.9758 },
  PH: { latitude: 12.8797, longitude: 121.774 },
  ID: { latitude: -0.7893, longitude: 113.9213 },
  TH: { latitude: 15.87, longitude: 100.9925 },
  VN: { latitude: 14.0583, longitude: 108.2772 },
  AU: { latitude: -25.2744, longitude: 133.7751 },
  NZ: { latitude: -40.9006, longitude: 174.886 },
});

/**
 * The approximate centre of a country, or `null` when this table has no entry.
 *
 * `null` is a real answer and callers must keep it: it means "the country is
 * known, the point is not". Substituting `0, 0` would put every unlisted
 * member in the Gulf of Guinea, which is the class of invention this module
 * exists to remove.
 */
export function countryCentroid(countryCode: string | null | undefined): Centroid | null {
  if (!countryCode) return null;

  return CENTROIDS[countryCode.trim().toUpperCase()] ?? null;
}

/** Exposed for the test that keeps this table and the served-country list in step. */
export const KNOWN_CENTROID_CODES: readonly string[] = Object.keys(CENTROIDS);
