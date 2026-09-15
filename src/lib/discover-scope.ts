// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — how far a Discover search reaches, per tab
//
// **"Country-wide" searched one town, and "5 km" searched nothing.** Every tab
// sent the member's point and a radius the same way, whatever the route could
// do with them:
//
//   * a country-precision member (everyone who has not shared a location) has a
//     national centroid, and the tabs sent it as a point. The server snapped the
//     point to the nearest catalogued town — Curepipe, for Mauritius — and
//     searched there;
//   * homes and services then applied that town's area on top of the radius,
//     so "within 5 km" found only listings filed under the nearest town, which
//     no home is;
//   * jobs and marketplace items have no position at all, so a radius could
//     never mean anything to them.
//
// Decided with the product owner on 15 Sep 2026:
//
//   Whole country  every tab shows everything in the member's country
//   Town           every tab searches the member's town
//   N km           homes and services search by distance (the server measures
//                  it since 15 Sep 2026); items and jobs, which have no position,
//                  search the member's town and say so
//
// This module is the one place that turns the location store into the
// parameters each route actually binds. Every name below was read off the
// route's own request type.
// ─────────────────────────────────────────────────────────────────────────────

import { hasCoordinate, type PlatformLocation } from '@/store/location';

/** The store's sentinels. `RADIUS_ENTIRE_COUNTRY` lives beside the store. */
export const RADIUS_TOWN = -1;
export const RADIUS_COUNTRY = -2;

export type DiscoverScope =
  | { kind: 'country'; countryCode: string }
  | { kind: 'town'; countryCode: string; cityName: string }
  | { kind: 'distance'; countryCode: string; cityName: string; latitude: number; longitude: number; radiusKm: number };

/** The tabs whose rows have a position the server can measure from. */
export type DistanceTab = 'Housing' | 'Providers';

export function tabSearchesByDistance(tab: string): tab is DistanceTab {
  return tab === 'Housing' || tab === 'Providers';
}

/**
 * What the member asked for, from where the app knows them to be.
 *
 * A distance needs a real point: a national centroid is a place to centre a
 * map, never a member position, so a country-precision location searches the
 * whole country whatever radius is stored. A town needs a town; without one it
 * is the country too.
 */
export function resolveDiscoverScope(location: PlatformLocation, radiusKm: number): DiscoverScope {
  const countryCode = (location.countryCode ?? '').trim().toUpperCase();
  const cityName = (location.cityName ?? '').trim();
  const hasPoint = hasCoordinate(location) && location.precision !== 'country';

  if (radiusKm > 0 && hasPoint) {
    return {
      kind: 'distance',
      countryCode,
      cityName,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusKm,
    };
  }

  if ((radiusKm > 0 || radiusKm === RADIUS_TOWN) && cityName) {
    return { kind: 'town', countryCode, cityName };
  }

  return { kind: 'country', countryCode };
}

/** For tabs whose rows have no position, a distance is the member's town. */
export function withoutDistance(scope: DiscoverScope): Exclude<DiscoverScope, { kind: 'distance' }> {
  if (scope.kind !== 'distance') return scope;
  return scope.cityName
    ? { kind: 'town', countryCode: scope.countryCode, cityName: scope.cityName }
    : { kind: 'country', countryCode: scope.countryCode };
}

function orUndefined(value: string): string | undefined {
  return value ? value : undefined;
}

/** `GET /housing/search` — `SearchHousingRequest`: `countryCode`, `city`, `latitude`, `longitude`, `radiusKm`. */
export function housingScopeParams(scope: DiscoverScope): Record<string, string | number | undefined> {
  switch (scope.kind) {
    case 'distance':
      return {
        countryCode: orUndefined(scope.countryCode),
        latitude: scope.latitude,
        longitude: scope.longitude,
        radiusKm: scope.radiusKm,
      };
    case 'town':
      return { countryCode: orUndefined(scope.countryCode), city: scope.cityName };
    default:
      return { countryCode: orUndefined(scope.countryCode) };
  }
}

/** `GET /providers` — `ProviderSearchRequest`: `countryCode`, `cityName`, `latitude`, `longitude`, `radiusKm`. */
export function providerScopeParams(scope: DiscoverScope): {
  countryCode?: string;
  cityName?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
} {
  switch (scope.kind) {
    case 'distance':
      return {
        countryCode: orUndefined(scope.countryCode),
        latitude: scope.latitude,
        longitude: scope.longitude,
        radiusKm: scope.radiusKm,
      };
    case 'town':
      return { countryCode: orUndefined(scope.countryCode), cityName: scope.cityName };
    default:
      return { countryCode: orUndefined(scope.countryCode) };
  }
}

/**
 * `POST /marketplace/search` — `SearchListingsRequest`: `countryCode`, `city`.
 * Items have no position, so a distance searches the town.
 */
export function marketplaceScopeParams(scope: DiscoverScope): { countryCode?: string; city?: string } {
  const place = withoutDistance(scope);
  return place.kind === 'town'
    ? { countryCode: orUndefined(place.countryCode), city: place.cityName }
    : { countryCode: orUndefined(place.countryCode) };
}

/**
 * `GET /jobs` — `JobBrowseParameters`: `country`, `city`. A job has no position,
 * so a distance searches the town.
 */
export function jobScopeParams(scope: DiscoverScope): { country?: string; city?: string } {
  const place = withoutDistance(scope);
  return place.kind === 'town'
    ? { country: orUndefined(place.countryCode), city: place.cityName }
    : { country: orUndefined(place.countryCode) };
}

/** `GET /guides` — `SearchGuidesQuery`: `country`. A guide is about a country. */
export function guideScopeParams(scope: DiscoverScope): { country?: string } {
  return { country: orUndefined(scope.countryCode) };
}

/**
 * One line under the radius control saying what this tab is actually searching,
 * so a member who chose "5 km" on the items tab is not left believing it applied.
 */
export function describeDiscoverScope(
  scope: DiscoverScope,
  tab: string,
  countryName: string
): string {
  const country = countryName.trim() || scope.countryCode || 'your country';

  if (scope.kind === 'distance') {
    if (tabSearchesByDistance(tab)) {
      const place = scope.cityName ? ` of ${scope.cityName}` : ' of you';
      return `Within ${formatKm(scope.radiusKm)}${place}`;
    }
    return scope.cityName
      ? `In ${scope.cityName} · ${tabNoun(tab)} are found by town, not distance`
      : `Across ${country} · ${tabNoun(tab)} are found by town, not distance`;
  }

  if (scope.kind === 'town') return `In ${scope.cityName}`;

  return `Across ${country}`;
}

function tabNoun(tab: string): string {
  switch (tab) {
    case 'Marketplace':
      return 'items';
    case 'Jobs':
      return 'jobs';
    case 'Guides':
      return 'guides';
    default:
      return 'results';
  }
}

function formatKm(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value} km`;
}
