// ─────────────────────────────────────────────────────────────────────────────
// Towns in the member's country, from the platform's place catalogue
//
// Added 14 Oct 2026 as the one way every form finds a town. Forms had their own
// answers: a typed country code, a typed town, and in the home wizard four
// hard-coded city chips (London, Port Louis, Lagos, Accra) whatever country the
// member lived in. The catalogue now holds every Mauritian district and its main
// towns, and this search is limited to the member's own country.
//
// The catalogue rather than Google: it is what the server files listings
// against, so a town chosen here is one search will find the listing under. It
// needs no maps key, which this deployment does not have yet.
//
// `GET /location/search` answers `{ term, results: [...] }`. The older geocoding
// client read that as a bare list and found nothing; this reads both.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';

export interface TownChoice {
  /** The town's own name, as the catalogue spells it. */
  cityName: string;
  /** The French or local spelling, when there is one. */
  localName?: string | null;
  /** Its parent place, for telling two of the same name apart. */
  context?: string | null;
  areaId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface SearchRow {
  cityName?: string | null;
  areaName?: string | null;
  displayName?: string | null;
  areaId?: string | null;
  cityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  level?: string | null;
}

export async function searchTowns(term: string, countryCode: string | null | undefined): Promise<TownChoice[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const response = await apiClient.get('/location/search', {
    params: { q: query, countryCode: countryCode || undefined, levels: 'City', limit: 8 },
  });
  const payload = (response.data?.data ?? response.data) as { results?: SearchRow[] } | SearchRow[] | null;
  const rows = Array.isArray(payload) ? payload : payload?.results ?? [];

  const seen = new Set<string>();
  return rows
    .filter((row) => !!row.cityName)
    .map((row) => ({
      cityName: row.cityName as string,
      context: row.displayName?.split(',').slice(1).join(',').trim() || null,
      areaId: row.cityId ?? row.areaId ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
    }))
    .filter((town) => (seen.has(town.cityName) ? false : (seen.add(town.cityName), true)));
}
