// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the places a member saves
//
// **"Home" did not survive closing the app.** The location selector's Home,
// Work and School rows were written into a zustand store with no persistence
// middleware of any kind — not even AsyncStorage — so a saved place lasted
// exactly as long as the process. Nothing was ever sent anywhere, and the maps
// register recorded server-side saved places as a gap.
//
// It is not a gap. `/api/v1/location/me/saved-locations/{label}` has been
// served since the Location module shipped:
//
//     GET    /location/me/profile                 the profile, with `savedLocations`
//     PUT    /location/me/saved-locations/{label} save, or move an existing label
//     DELETE /location/me/saved-locations/{label} forget one
//
// The label is in the path because it is the place's identity within the
// profile — saving "Home" twice is a move, not a duplicate — and the body is
// optional: omitted, the server saves wherever the member currently is, which
// is what the selector's "SAVE ACTIVE" means.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';
import { unwrapEnvelope } from '@/lib/platform-envelope';
import { toFinancialError } from '@/lib/financial-errors';
import type { PlatformLocation } from '@/store/location';

const ROOT = '/location/me';

/** `LocationReferenceResponse`, loosely — every member optional but the country. */
export interface LocationReferenceWire {
  countryCode?: string | null;
  countryName?: string | null;
  flag?: string | null;
  state?: string | null;
  cityName?: string | null;
  neighborhood?: string | null;
  areaName?: string | null;
  street?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  displayName?: string | null;
}

/** `SavedLocationResponse`. */
export interface SavedPlaceWire {
  id?: string | null;
  label?: string | null;
  location?: LocationReferenceWire | null;
  savedAt?: string | null;
}

export interface SavedPlace {
  id: string;
  label: string;
  location: PlatformLocation;
  savedAt: string | null;
}

/**
 * A place as the store speaks it.
 *
 * A saved place without coordinates is still a place — a member who saved a
 * town has a town — so the numbers fall back to zero rather than the row being
 * dropped, exactly as `PlatformLocation` requires them.
 */
export function toPlatformLocation(wire: LocationReferenceWire | null | undefined): PlatformLocation {
  return {
    countryCode: wire?.countryCode?.trim() ?? '',
    countryName: wire?.countryName?.trim() ?? '',
    flag: wire?.flag?.trim() ?? '',
    state: wire?.state?.trim() || undefined,
    cityName: wire?.cityName?.trim() ?? '',
    neighborhood: wire?.neighborhood?.trim() ?? wire?.areaName?.trim() ?? '',
    street: wire?.street?.trim() || undefined,
    latitude: typeof wire?.latitude === 'number' ? wire.latitude : 0,
    longitude: typeof wire?.longitude === 'number' ? wire.longitude : 0,
    displayName: wire?.displayName?.trim() || undefined,
  };
}

/** What `PUT` and `SetCurrentLocationRequest` bind. `countryCode` is the one required field. */
export function toLocationBody(location: PlatformLocation): Record<string, unknown> {
  return {
    countryCode: location.countryCode,
    countryName: location.countryName || undefined,
    state: location.state || undefined,
    cityName: location.cityName || undefined,
    neighborhood: location.neighborhood || undefined,
    street: location.street || undefined,
    latitude: location.latitude || undefined,
    longitude: location.longitude || undefined,
    displayName: location.displayName || undefined,
  };
}

function toSavedPlace(wire: SavedPlaceWire | null | undefined): SavedPlace | null {
  const label = wire?.label?.trim();

  if (!label) return null;

  return {
    id: wire?.id?.trim() ?? label,
    label,
    location: toPlatformLocation(wire?.location),
    savedAt: wire?.savedAt ?? null,
  };
}

/**
 * Every place this member has saved.
 *
 * Read from the profile, which is the one route that holds them; there is no
 * list endpoint of its own and asking for one would be inventing a route.
 */
export async function fetchSavedPlaces(signal?: AbortSignal): Promise<SavedPlace[]> {
  try {
    const response = await apiClient.get(`${ROOT}/profile`, { signal });
    const profile = unwrapEnvelope<{ savedLocations?: SavedPlaceWire[] }>(response.data);

    return (profile?.savedLocations ?? [])
      .map(toSavedPlace)
      .filter((place): place is SavedPlace => place !== null);
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Saves a place under a label, or moves the one already there.
 *
 * `location` omitted saves wherever the member is, which is the server's own
 * behaviour rather than this client resolving a position and sending it.
 */
export async function saveSavedPlace(
  label: string,
  location?: PlatformLocation | null
): Promise<SavedPlace | null> {
  try {
    const response = await apiClient.put(
      `${ROOT}/saved-locations/${encodeURIComponent(label)}`,
      location ? { location: toLocationBody(location) } : undefined
    );

    return toSavedPlace(unwrapEnvelope<SavedPlaceWire>(response.data));
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

/** Forgets a labelled place. */
export async function removeSavedPlace(label: string): Promise<void> {
  try {
    await apiClient.delete(`${ROOT}/saved-locations/${encodeURIComponent(label)}`);
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

/** The labels the selector offers, in the order it shows them. */
export const DEFAULT_SAVED_LABELS = ['Home', 'Work', 'School'] as const;

/**
 * The saved places keyed by label, for a screen that renders fixed rows.
 *
 * Case-insensitive, because the server treats a label that way — saving "home"
 * over "Home" is a move — and a screen keyed by its own spelling would render
 * the row as empty beside a place the member can see in the list.
 */
export function byLabel(places: readonly SavedPlace[]): Record<string, SavedPlace> {
  const index: Record<string, SavedPlace> = {};

  for (const place of places) {
    index[place.label.toLowerCase()] = place;
  }

  return index;
}
