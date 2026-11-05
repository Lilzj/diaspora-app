// ─────────────────────────────────────────────────────────────────────────────
// A search sentence, carried from Home to Discover (owner, 5 Nov 2026)
//
// The owner chose "Discover, already filtered": the Home bar reads the sentence
// and finds its place (`search-intent.ts`, `search-place.ts`), then opens
// Discover on the right tab with the words, the filters and the place set.
//
// A route carries strings, so the search goes as named strings and is read back
// here; `at` changes on every search, so the same sentence typed twice still
// applies twice. The place becomes a `DiscoverScope` for this search only:
// the member's saved location is not touched, and clearing the sentence goes
// back to it.
// ─────────────────────────────────────────────────────────────────────────────

import { countryByCode } from './calling-code';
import type { DiscoverScope } from './discover-scope';
import type { SearchTab } from './search-intent';
import type { SentencePlace, SentenceSearch } from './search-place';

const SEARCH_TABS: readonly SearchTab[] = ['Providers', 'Jobs', 'Housing', 'Marketplace'];

type RouteParams = Record<string, string | string[] | undefined>;

export function sentenceParams(search: SentenceSearch, at: string): Record<string, string> {
  const params: Record<string, string> = { at, said: search.said, tab: search.tab, query: search.words };

  if (search.minBedrooms !== null) params.minBedrooms = String(search.minBedrooms);
  if (search.homeTypes.length > 0) params.homeTypes = search.homeTypes.join(',');
  if (search.jobType) params.jobType = search.jobType;

  const place = search.place;
  if (!place) return params;

  params.placeKind = place.kind;

  switch (place.kind) {
    case 'town':
      params.placeName = place.name;
      params.placeCountry = place.countryCode;
      params.placeKm = String(place.radiusKm);
      params.placeSource = place.source;
      if (place.latitude !== null && place.longitude !== null) {
        params.placeLat = String(place.latitude);
        params.placeLng = String(place.longitude);
      }
      break;
    case 'near-me':
      params.placeName = place.name;
      params.placeCountry = place.countryCode;
      params.placeLat = String(place.latitude);
      params.placeLng = String(place.longitude);
      params.placeKm = String(place.radiusKm);
      break;
    case 'country':
      params.placeName = place.name;
      params.placeCountry = place.countryCode;
      break;
    case 'not-found':
      params.placeName = place.said;
      break;
    default:
      break;
  }

  return params;
}

/** The search a Discover route was opened with, or null when it was opened without one. */
export function sentenceFromParams(params: RouteParams): SentenceSearch | null {
  const said = one(params, 'said');
  if (said === undefined) return null;

  const tab = one(params, 'tab');
  const bedrooms = numberOf(one(params, 'minBedrooms'));

  return {
    said,
    tab: SEARCH_TABS.includes(tab as SearchTab) ? (tab as SearchTab) : 'Providers',
    words: one(params, 'query') ?? '',
    minBedrooms: bedrooms,
    homeTypes: (one(params, 'homeTypes') ?? '').split(',').filter(Boolean),
    jobType: one(params, 'jobType') || null,
    place: placeFromParams(params),
  };
}

function placeFromParams(params: RouteParams): SentencePlace | null {
  const name = one(params, 'placeName') ?? '';
  const countryCode = one(params, 'placeCountry') ?? '';
  const latitude = numberOf(one(params, 'placeLat'));
  const longitude = numberOf(one(params, 'placeLng'));
  const radiusKm = numberOf(one(params, 'placeKm')) ?? 5;
  const hasPoint = latitude !== null && longitude !== null;

  switch (one(params, 'placeKind')) {
    case 'town':
      return {
        kind: 'town',
        name,
        countryCode,
        latitude: hasPoint ? latitude : null,
        longitude: hasPoint ? longitude : null,
        radiusKm,
        source: one(params, 'placeSource') === 'google' ? 'google' : 'world-list',
      };
    case 'near-me':
      return hasPoint
        ? { kind: 'near-me', name, countryCode, latitude, longitude, radiusKm }
        : { kind: 'near-me-unknown' };
    case 'near-me-unknown':
      return { kind: 'near-me-unknown' };
    case 'country':
      return countryCode ? { kind: 'country', countryCode, name } : null;
    case 'not-found':
      return { kind: 'not-found', said: name };
    default:
      return null;
  }
}

/**
 * Where this search looks, or null for Discover's own place. A town with a point
 * is a distance round it, so homes and services just over its edge are found;
 * jobs and items, which have no point, search the town's name (`withoutDistance`).
 */
export function sentenceScope(search: SentenceSearch): DiscoverScope | null {
  const place = search.place;

  switch (place?.kind) {
    case 'town':
      return place.latitude !== null && place.longitude !== null
        ? {
            kind: 'distance',
            countryCode: place.countryCode,
            cityName: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            radiusKm: place.radiusKm,
          }
        : { kind: 'town', countryCode: place.countryCode, cityName: place.name };
    case 'near-me':
      return {
        kind: 'distance',
        countryCode: place.countryCode,
        cityName: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        radiusKm: place.radiusKm,
      };
    case 'country':
      return { kind: 'country', countryCode: place.countryCode };
    default:
      return null;
  }
}

const TAB_NOUNS: Readonly<Record<SearchTab, string>> = {
  Providers: 'Services',
  Housing: 'Homes',
  Jobs: 'Jobs',
  Marketplace: 'Items for sale',
};

const HOME_TYPE_LABELS: Readonly<Record<string, string>> = {
  apartment: 'flat',
  house: 'house',
  studio: 'studio',
  villa: 'villa',
  duplex: 'duplex',
  hostel: 'hostel',
  'private-room': 'room',
  'shared-room': 'shared room',
  'roommate-wanted': 'roommate',
};

/** "Homes · 3+ bedrooms · flat · in Grand Baie": what Discover understood. */
export function describeSentence(search: SentenceSearch, homeCountryCode: string | null | undefined): string {
  const parts: string[] = [TAB_NOUNS[search.tab]];

  if (search.words) parts.push(`“${search.words}”`);
  if (search.minBedrooms) parts.push(`${search.minBedrooms}+ bedroom${search.minBedrooms === 1 ? '' : 's'}`);
  if (search.homeTypes.length > 0) {
    parts.push(search.homeTypes.map((key) => HOME_TYPE_LABELS[key] ?? key).join(' or '));
  }
  if (search.jobType) parts.push(search.jobType.toLowerCase());

  const where = describePlace(search.place, (homeCountryCode ?? '').trim().toUpperCase());
  if (where) parts.push(where);

  return parts.join(' · ');
}

function describePlace(place: SentencePlace | null, homeCountry: string): string | null {
  switch (place?.kind) {
    case 'town': {
      const abroad = place.countryCode && place.countryCode.toUpperCase() !== homeCountry;
      const country = abroad ? countryByCode(place.countryCode)?.name ?? place.countryCode : null;
      return country ? `in ${place.name}, ${country}` : `in ${place.name}`;
    }
    case 'near-me':
      return 'near you';
    case 'near-me-unknown':
      return 'near you needs your location';
    case 'country':
      return `across ${place.name || place.countryCode}`;
    case 'not-found':
      return `no place called “${place.said}” was found`;
    default:
      return null;
  }
}

function one(params: RouteParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function numberOf(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
