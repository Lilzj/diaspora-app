// ─────────────────────────────────────────────────────────────────────────────
// Finding the place a search sentence names (owner, 5 Nov 2026)
//
// `readSearch` says a sentence names a place ("in Grand Baie") or the member's
// own surroundings ("near me"). This finds it, in this order:
//
//   1. a country by its name ("jobs in Nigeria", "in the UK"): the whole country;
//   2. the world list of towns on the server (`GET /location/towns/match`,
//      GeoNames, about 150,000 towns, the member's own country asked first),
//      for each reading of the name, longest first;
//   3. Google's town search, for the places too small for the list, kept only
//      when Google's town is spelt close to what was typed;
//   4. nothing: the name is searched as words, so "work in construction" still
//      finds construction work.
//
// "Near me" is the member's position. When the app only knows their country
// the phone is asked, because the member just asked for "near me"; when the
// phone will not say, Discover says so and searches as it would have.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { newIdempotencyKey } from './idempotency';
import { resolveAddress } from './maps/address-search';
import { searchWords, type PlaceCandidate, type SearchIntent, type SearchTab } from './search-intent';
import { searchTowns } from './town-search';
import { allCountries } from '@/mocks/countries';
import { hasCoordinate, RADIUS_DEFAULT_KM, type PlatformLocation } from '@/store/location';

export type SentencePlace =
  | {
      kind: 'town';
      name: string;
      countryCode: string;
      latitude: number | null;
      longitude: number | null;
      radiusKm: number;
      source: 'world-list' | 'google';
    }
  | { kind: 'country'; countryCode: string; name: string }
  | { kind: 'near-me'; name: string; countryCode: string; latitude: number; longitude: number; radiusKm: number }
  | { kind: 'near-me-unknown' }
  | { kind: 'not-found'; said: string };

/** A sentence, read and placed: what Discover opens onto. */
export interface SentenceSearch {
  said: string;
  tab: SearchTab;
  words: string;
  minBedrooms: number | null;
  homeTypes: string[];
  jobType: string | null;
  place: SentencePlace | null;
}

export interface SearchContext {
  location: PlatformLocation;
  /** The store's radius: km, or the town and country sentinels. */
  searchRadius: number;
  detectLocation: (options: { prompt: boolean }) => Promise<PlatformLocation | null>;
}

/** As close as the server asks (`TownNames.CloseEnough`). */
export const CLOSE_ENOUGH = 0.8;

export async function resolveSearch(intent: SearchIntent, context: SearchContext): Promise<SentenceSearch> {
  const placed = (words: string, place: SentencePlace | null): SentenceSearch => ({
    said: intent.said,
    tab: intent.tab,
    words,
    minBedrooms: intent.minBedrooms,
    homeTypes: intent.homeTypes,
    jobType: intent.jobType,
    place,
  });

  const place = intent.place;

  if (!place) return placed(intent.words, null);
  if (place.kind === 'near-me') return placed(intent.words, await nearMe(context));

  const homeCountry = (context.location.countryCode ?? '').trim().toUpperCase();

  for (const candidate of place.candidates) {
    const country = countryNamed(candidate.name);
    if (country) return placed(searchWords(intent, candidate), { kind: 'country', ...country });

    const town = await matchTown(candidate.name, homeCountry);
    if (town) {
      return placed(searchWords(intent, candidate), {
        kind: 'town',
        name: town.name,
        countryCode: town.countryCode,
        latitude: town.latitude ?? null,
        longitude: town.longitude ?? null,
        radiusKm: townRadiusKm(town.population),
        source: 'world-list',
      });
    }
  }

  const google = await askGoogle(place.candidates, homeCountry);
  if (google) return placed(searchWords(intent, google.candidate), google.place);

  return placed(searchWords(intent, null), { kind: 'not-found', said: place.said });
}

/**
 * How far round a town to search: a town's point is its centre, and a city
 * spreads further from it. Without a population, a small town's distance. Each
 * is one of `RadiusSlider`'s stops, so the control shows it and can change it.
 */
export function townRadiusKm(population: number | null | undefined): number {
  const people = population ?? 0;
  if (people >= 500_000) return 25;
  if (people >= 50_000) return 10;
  return 5;
}

// ── The world list ───────────────────────────────────────────────────────────

interface TownMatch {
  found: boolean;
  name?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  population?: number | null;
}

async function matchTown(
  text: string,
  countryCode: string
): Promise<(TownMatch & { name: string; countryCode: string }) | null> {
  try {
    const response = await apiClient.get<{ data: TownMatch }>('/location/towns/match', {
      params: { text, countryCode: countryCode || undefined },
    });
    const match = response.data?.data;

    return match?.found && match.name && match.countryCode
      ? { ...match, name: match.name, countryCode: match.countryCode }
      : null;
  } catch {
    // Unreachable is not "no such town" to the member, but it is to this search:
    // Google is asked next, and failing that the words are searched.
    return null;
  }
}

// ── Google ───────────────────────────────────────────────────────────────────

async function askGoogle(
  candidates: readonly PlaceCandidate[],
  homeCountry: string
): Promise<{ candidate: PlaceCandidate; place: SentencePlace } | null> {
  const longest = candidates[0];
  if (!longest) return null;

  // One billing session for the whole lookup, closed by the details call.
  const session = newIdempotencyKey();

  for (const country of homeCountry ? [homeCountry, null] : [null]) {
    const page = await searchTowns(longest.name, country, session);

    for (const town of page.towns) {
      const candidate = candidates.find((reading) => closeness(reading.name, town.cityName) >= CLOSE_ENOUGH);
      if (!candidate) continue;

      const details = town.placeId ? await placeDetails(town.placeId, session) : null;

      return {
        candidate,
        place: {
          kind: 'town',
          name: details?.name || town.cityName,
          countryCode: (details?.countryCode || country || homeCountry).toUpperCase(),
          latitude: details?.latitude ?? null,
          longitude: details?.longitude ?? null,
          radiusKm: townRadiusKm(null),
          source: 'google',
        },
      };
    }
  }

  return null;
}

async function placeDetails(
  placeId: string,
  sessionToken: string
): Promise<{ name: string | null; countryCode: string | null; latitude: number; longitude: number } | null> {
  try {
    const place = (await resolveAddress({ placeId, sessionToken })).place;
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;

    return {
      name: place.locality || place.name || null,
      countryCode: place.countryCode ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
    };
  } catch {
    // The town's name is enough to search its listings; its point is a bonus.
    return null;
  }
}

// ── Countries ────────────────────────────────────────────────────────────────

/** What people call a country, beside the reference list's own name. */
const COUNTRY_SHORT_NAMES: Readonly<Record<string, string>> = {
  uk: 'GB',
  'u k': 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  usa: 'US',
  'u s a': 'US',
  america: 'US',
  'united states of america': 'US',
  uae: 'AE',
  emirates: 'AE',
  'ivory coast': 'CI',
  'cote d ivoire': 'CI',
  drc: 'CD',
  'dr congo': 'CD',
  holland: 'NL',
};

function countryNamed(name: string): { countryCode: string; name: string } | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;

  const code = COUNTRY_SHORT_NAMES[wanted];
  const country = code
    ? allCountries.find((row) => row.code === code)
    : allCountries.find((row) => normalizeName(row.name) === wanted);

  return country ? { countryCode: country.code, name: country.name } : null;
}

// ── Near me ──────────────────────────────────────────────────────────────────

async function nearMe(context: SearchContext): Promise<SentencePlace> {
  let here: PlatformLocation | null = hasPoint(context.location) ? context.location : null;

  if (!here) {
    try {
      here = await context.detectLocation({ prompt: true });
    } catch {
      here = null;
    }
  }

  if (!here || !hasPoint(here)) return { kind: 'near-me-unknown' };

  return {
    kind: 'near-me',
    name: (here.cityName ?? '').trim(),
    countryCode: (here.countryCode ?? '').trim().toUpperCase(),
    latitude: here.latitude,
    longitude: here.longitude,
    radiusKm: context.searchRadius > 0 ? context.searchRadius : RADIUS_DEFAULT_KM,
  };
}

/** A national centroid is a place to centre a map, never a member's position. */
function hasPoint(location: PlatformLocation | null | undefined): location is PlatformLocation {
  return !!location && hasCoordinate(location) && location.precision !== 'country';
}

// ── Comparing names, as the server does (`TownNames`) ────────────────────────

/** Accents off, lower case, anything but a letter or a digit one space. */
export function normalizeName(text: string | null | undefined): string {
  if (!text || !text.trim()) return '';

  let decomposed = text;
  try {
    decomposed = text.normalize('NFD');
  } catch {
    // Without it the accents stay, and a name with one is still close to one without.
  }

  return decomposed
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim();
}

/** 0 to 1: one less the edits between two names over the longer one, with and without spaces. */
export function closeness(typed: string, name: string): number {
  const left = normalizeName(typed);
  const right = normalizeName(name);
  if (!left || !right) return 0;

  return Math.max(ratio(left, right), ratio(left.replace(/ /g, ''), right.replace(/ /g, '')));
}

function ratio(left: string, right: string): number {
  if (left === right) return 1;
  const longer = Math.max(left.length, right.length);
  return longer === 0 ? 1 : 1 - distance(left, right) / longer;
}

/** Levenshtein: the fewest letters added, removed or changed to turn one into the other. */
function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length];
}
