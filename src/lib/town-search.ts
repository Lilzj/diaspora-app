// ─────────────────────────────────────────────────────────────────────────────
// Towns in the member's country: Google first, the place catalogue second
//
// Added 14 Oct 2026 as the one way every form finds a town. Forms had their own
// answers: a typed country code, a typed town, and in the home wizard four
// hard-coded city chips (London, Port Louis, Lagos, Accra) whatever country the
// member lived in.
//
// **Google answers first** (`POST /location/places/autocomplete` with
// `townsOnly`, limited to the member's country), because it knows every town in
// every country; the platform's own catalogue only knows the countries it has
// been loaded with. A first version searched only the catalogue, which would
// have left a member in any other country with nothing to choose.
//
// **The catalogue answers when Google cannot**: not configured, this month's
// free allowance spent, or unreachable. It is also what the server files a
// listing under, by the town's name, so a town from either source is found by
// search the same way.
//
// `GET /location/search` answers `{ term, results: [...] }`; an older client
// read that as a bare list and found nothing. This reads both shapes.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { resolveAddress, suggestAddresses } from './maps/address-search';

export interface TownChoice {
  /** The town's own name. */
  cityName: string;
  /** Its region or district, for telling two of the same name apart. */
  context?: string | null;
  /** A Google place, resolved to coordinates only when picked. */
  placeId?: string | null;
  /** A catalogue node. */
  areaId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface TownSearchPage {
  towns: TownChoice[];
  /** Credit the provider requires beside its results ("Google Maps"). */
  attribution: string | null;
  source: 'google' | 'catalogue';
}

interface CatalogueRow {
  cityName?: string | null;
  displayName?: string | null;
  areaId?: string | null;
  cityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Towns matching what the member typed, in their country. */
export async function searchTowns(
  term: string,
  countryCode: string | null | undefined,
  sessionToken: string
): Promise<TownSearchPage> {
  const query = term.trim();
  if (query.length < 2) return { towns: [], attribution: null, source: 'google' };

  try {
    const page = await suggestAddresses({
      text: query,
      sessionToken,
      countryCodes: countryCode ? [countryCode] : undefined,
      townsOnly: true,
    });
    if (page.status === 'Success') {
      return {
        source: 'google',
        attribution: page.attribution,
        towns: page.suggestions.map((suggestion) => ({
          cityName: suggestion.mainText || suggestion.text,
          context: suggestion.secondaryText,
          placeId: suggestion.placeId,
        })),
      };
    }
  } catch {
    // Unreachable: fall through to the catalogue, which is on our own server.
  }

  return { source: 'catalogue', attribution: null, towns: await searchCatalogue(query, countryCode) };
}

/**
 * A town as the form should store it. A Google suggestion is looked up for its
 * coordinates and its locality name; that lookup also closes the billing session.
 */
export async function resolveTown(town: TownChoice, sessionToken: string): Promise<TownChoice> {
  if (!town.placeId) return town;
  try {
    const answer = await resolveAddress({ placeId: town.placeId, sessionToken });
    const place = answer.place;
    if (!place) return town;
    return {
      ...town,
      cityName: place.locality || place.name || town.cityName,
      latitude: place.latitude,
      longitude: place.longitude,
    };
  } catch {
    // The name is enough to file a listing; coordinates are a bonus.
    return town;
  }
}

async function searchCatalogue(query: string, countryCode: string | null | undefined): Promise<TownChoice[]> {
  const response = await apiClient.get('/location/search', {
    params: { q: query, countryCode: countryCode || undefined, levels: 'City', limit: 8 },
  });
  const payload = (response.data?.data ?? response.data) as { results?: CatalogueRow[] } | CatalogueRow[] | null;
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
