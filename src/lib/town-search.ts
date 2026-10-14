// ─────────────────────────────────────────────────────────────────────────────
// Towns in the member's country, from Google
//
// Added 14 Oct 2026 as the one way every form finds a town. Forms had their own
// answers: a typed country code, a typed town, and in the home wizard four
// hard-coded city chips (London, Port Louis, Lagos, Accra) whatever country the
// member lived in.
//
// Google only (`POST /location/places/autocomplete` with `townsOnly`, limited to
// the member's country): this is a global app, and the platform's own place
// catalogue only ever covered the countries it was loaded with. When Google
// cannot answer (not configured, the month's free allowance spent, unreachable)
// the picker says so and the member uses the town as they typed it; nothing
// falls back to a list that would only work in one country.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveAddress, suggestAddresses } from './maps/address-search';

export interface TownChoice {
  /** The town's own name. */
  cityName: string;
  /** Its region or country, for telling two of the same name apart. */
  context?: string | null;
  /** The Google place, resolved to coordinates only when picked. */
  placeId?: string | null;
  areaId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface TownSearchPage {
  towns: TownChoice[];
  /** Credit the provider requires beside its results ("Google Maps"). */
  attribution: string | null;
  /** Set when Google could not search: the member can still type the town. */
  unavailable: boolean;
}

/** Towns matching what the member typed, in their country. */
export async function searchTowns(
  term: string,
  countryCode: string | null | undefined,
  sessionToken: string
): Promise<TownSearchPage> {
  const query = term.trim();
  if (query.length < 2) return { towns: [], attribution: null, unavailable: false };

  try {
    const page = await suggestAddresses({
      text: query,
      sessionToken,
      countryCodes: countryCode ? [countryCode] : undefined,
      townsOnly: true,
    });
    if (page.status !== 'Success') return { towns: [], attribution: null, unavailable: true };
    return {
      unavailable: false,
      attribution: page.attribution,
      towns: page.suggestions.map((suggestion) => ({
        cityName: suggestion.mainText || suggestion.text,
        context: suggestion.secondaryText,
        placeId: suggestion.placeId,
      })),
    };
  } catch {
    return { towns: [], attribution: null, unavailable: true };
  }
}

/**
 * A town as the form should store it: a Google suggestion is looked up for its
 * coordinates and locality name, which also closes the billing session.
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
