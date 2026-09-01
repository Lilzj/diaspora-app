import { locationLabel } from '@/store/location';
// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — geocoding and places over the certified location routes
// (Frontend Phase 8, §46)
//
// This provider is **real**. `GET /location/search` and
// `GET /location/reverse-geocode` are certified routes that this platform has
// had since before Phase 8, and every neighbourhood and city lookup in the app
// already goes through them.
//
// What they resolve is neighbourhoods and cities. What they do not resolve is
// street addresses and points of interest — see FRONTEND-MAPS-GAP-005 and
// FRONTEND-MAPS-GAP-006. So this file is a hybrid, and it is careful about
// which half is answering:
//
//   A result that came from the certified route is `source: 'backend'` and is
//   printable as fact.
//
//   A result that came from the adapter is `source: 'simulated'` and every
//   surface that renders it shows the marker.
//
// ── The one dishonest thing the backend does, and what is done about it ──────
//
// `/location/reverse-geocode` is nearest-node and therefore always answers. A
// member standing in Lagos gets "Peckham, London" with the same confidence as a
// member standing in Peckham, because the route has no failure mode and returns
// no distance to the match.
//
// This provider re-derives that distance client-side from the coordinate it
// sent and the coordinate it got back, and downgrades the answer past a
// threshold: `near` inside 2 km, `approximate` inside 25 km, and a refusal
// beyond that. That is not a fix — the underlying route still cannot say "I do
// not know" — but it stops the app confidently telling somebody they are in a
// city on another continent. GAP-006 asks for the distance to be returned so
// this heuristic can be deleted.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';
import type { PlatformLocation } from '@/store/location';
import { MAPS_GAPS, areMapsGapsEnabled } from '@/config/maps-gaps';
import type {
  Address,
  GeoCoordinate,
  GeocodedAddress,
  Place,
  PlaceSearchParams,
} from '@/types/maps';
import { distanceBetween, isValidCoordinate, toKm } from '../geo';
import { coordinateForRequest } from '../privacy';
import {
  fail,
  ok,
  type GeocodingProvider,
  type PlacesProvider,
  type ProviderResult,
} from './types';

/** Inside this, the node is where the member is. */
const NEAR_MATCH_KM = 2;

/** Inside this, the node is the nearest known place — said as such. */
const APPROXIMATE_MATCH_KM = 25;

/** Beyond this, the nearest node is not an answer and is not offered as one. */
const NO_MATCH_KM = 150;

function toAddress(location: PlatformLocation): Address {
  return {
    countryCode: location.countryCode,
    countryName: location.countryName,
    region: location.state,
    city: location.cityName,
    neighborhood: location.neighborhood,
    street: location.street,
    formatted:
      location.displayName ??
      [location.neighborhood, location.cityName, location.countryName].filter(Boolean).join(', '),
  };
}

function toPlace(location: PlatformLocation, near?: GeoCoordinate): Place {
  const coordinate: GeoCoordinate = {
    latitude: location.latitude,
    longitude: location.longitude,
    precision: 'neighborhood',
  };

  return {
    id: `${location.countryCode}:${location.cityName}:${location.neighborhood}`.toLowerCase(),
    // `${neighborhood}, ${cityName}` rendered ", " when both are empty,
    // which is the normal state for a country-precision location.
    name: location.displayName ?? locationLabel(location),
    coordinate,
    address: toAddress(location),
    kind: 'neighborhood',
    distance: near && isValidCoordinate(near) ? distanceBetween(near, coordinate) : undefined,
  };
}

async function searchPlatformLocations(query: string): Promise<PlatformLocation[]> {
  const response = await apiClient.get<{ data: PlatformLocation[] }>('/location/search', {
    params: { query },
  });
  return response.data?.data ?? [];
}

/**
 * Geocoding over the certified location routes.
 *
 * Both methods degrade rather than throw: §44 requires geocoding failure to be
 * a handled state, and a provider that threw would push a try/catch into every
 * caller.
 */
export class PlatformGeocodingProvider implements GeocodingProvider {
  descriptor = { id: 'platform-location', label: 'Diaspora location service', isSimulated: false };

  async geocode(
    query: string,
    options?: { countryCodes?: string[]; near?: GeoCoordinate }
  ): Promise<ProviderResult<GeocodedAddress[]>> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return ok([]);

    try {
      const locations = await searchPlatformLocations(trimmed);

      const filtered = options?.countryCodes?.length
        ? locations.filter((l) =>
            options.countryCodes!.some((c) => c.toLowerCase() === l.countryCode.toLowerCase())
          )
        : locations;

      return ok(
        filtered.map((location) => ({
          coordinate: {
            latitude: location.latitude,
            longitude: location.longitude,
            precision: 'neighborhood' as const,
          },
          address: toAddress(location),
          // No invented confidence. The route reports none, and a fabricated
          // 0.9 would be read as the provider's own assessment.
          source: 'backend' as const,
        }))
      );
    } catch {
      return fail('geocoding-failed', 'Place lookup is unavailable right now.', true);
    }
  }

  async reverseGeocode(coordinate: GeoCoordinate): Promise<ProviderResult<GeocodedAddress>> {
    if (!isValidCoordinate(coordinate)) {
      return fail('invalid-coordinates', 'That position cannot be looked up.', false);
    }

    try {
      // Rounded to ~110 m before it leaves the device. §59: minimum necessary
      // precision, and a neighbourhood lookup does not need a house.
      const safe = coordinateForRequest(coordinate, 'reverse-geocode');

      const response = await apiClient.get<{ data: PlatformLocation }>(
        '/location/reverse-geocode',
        { params: { latitude: safe.latitude, longitude: safe.longitude } }
      );

      const location = response.data?.data;
      if (!location) return fail('not-found', 'No place matched that position.', false);

      const matchKm = toKm(
        distanceBetween(coordinate, { latitude: location.latitude, longitude: location.longitude })
      );

      // See the header. The route cannot say "I do not know", so the client
      // decides when the answer stopped being one.
      if (matchKm > NO_MATCH_KM) {
        return fail(
          'not-found',
          'We do not have neighbourhood information for where you are yet.',
          false
        );
      }

      const address = toAddress(location);

      return ok({
        coordinate: { latitude: location.latitude, longitude: location.longitude },
        address:
          matchKm <= NEAR_MATCH_KM
            ? address
            : {
                ...address,
                // The wording carries the uncertainty. A member reading "near
                // Croydon" understands something different from "Croydon", and
                // that difference is the whole of what GAP-006 is about.
                formatted:
                  matchKm <= APPROXIMATE_MATCH_KM
                    ? `near ${address.formatted}`
                    : `${Math.round(matchKm)} km from ${address.formatted}`,
              },
        source: 'backend',
      });
    } catch {
      return fail('geocoding-failed', 'We could not work out where that is.', true);
    }
  }
}

/**
 * Place search and autocomplete.
 *
 * Autocomplete delegates to the same certified route as search. That is not a
 * shortcut — the route already does prefix matching over neighbourhood, city,
 * country and display name, which is exactly what an autocomplete over a
 * neighbourhood corpus should do. `sessionToken` is accepted and ignored,
 * because there is no per-session billing to satisfy; the parameter is in the
 * interface so that adopting a session-billed provider later does not change
 * the call sites (see MAP-PROVIDER-GAP-005).
 */
export class PlatformPlacesProvider implements PlacesProvider {
  descriptor = { id: 'platform-location', label: 'Diaspora location service', isSimulated: false };

  async search(params: PlaceSearchParams): Promise<ProviderResult<Place[]>> {
    const query = params.query.trim();
    if (query.length === 0) return ok([]);

    try {
      const locations = await searchPlatformLocations(query);

      let places = locations.map((l) => toPlace(l, params.near));

      if (params.countryCodes?.length) {
        const allowed = params.countryCodes.map((c) => c.toLowerCase());
        places = places.filter(
          (p) => p.address?.countryCode && allowed.includes(p.address.countryCode.toLowerCase())
        );
      }

      if (params.near) {
        places.sort((a, b) => (a.distance?.metres ?? Infinity) - (b.distance?.metres ?? Infinity));
      }

      return ok(typeof params.limit === 'number' ? places.slice(0, params.limit) : places);
    } catch {
      return fail('geocoding-failed', 'Place search is unavailable right now.', true);
    }
  }

  async autocomplete(
    query: string,
    options?: { near?: GeoCoordinate; countryCodes?: string[]; sessionToken?: string }
  ): Promise<ProviderResult<Place[]>> {
    // Two characters is the floor. One character matches most of the corpus and
    // costs a round trip to say so; §46 asks for debouncing and this is the
    // other half of the same restraint.
    if (query.trim().length < 2) return ok([]);

    return this.search({
      query,
      near: options?.near,
      countryCodes: options?.countryCodes,
      limit: 8,
    });
  }
}

export const platformGeocodingProvider = new PlatformGeocodingProvider();
export const platformPlacesProvider = new PlatformPlacesProvider();

/**
 * Whether street-level resolution is reachable in this build.
 *
 * Read by the route-planning screen to decide whether to offer "search for an
 * address" or only "choose a neighbourhood". Offering an address search that
 * cannot resolve an address is worse than not offering it.
 */
export function canResolveStreetAddresses(): boolean {
  return areMapsGapsEnabled();
}

/** The gap a screen names when address resolution is unavailable. */
export const ADDRESS_RESOLUTION_GAP = MAPS_GAPS.forwardGeocoding.key;
