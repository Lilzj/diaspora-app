import { create } from 'zustand';

import { countryByCode } from '@/lib/calling-code';
import { countryCentroid } from '@/lib/location/country-centroids';
import { detectCountry } from '@/lib/location/detect-country';

/**
 * How much of this location the app actually knows.
 *
 * ── Why a location needs to say where it came from ───────────────────────────
 *
 * Every field below is a string or a number, so a fabricated neighbourhood and
 * a measured one are indistinguishable once they are in the store. They were
 * not distinguished, and the consequence shipped: a member in Port Louis was
 * shown "Peckham, London" with a 5 km discovery radius around Rye Lane,
 * because the store's initial value was a literal London address.
 *
 * `precision` is what makes the difference legible to a renderer:
 *
 *   - `country` — the country is known (the member gave it at registration).
 *     Nothing below the country is known. The coordinate, when present, is a
 *     national centroid for centring a map and is **never** a member position,
 *     which is why a country-precision location forces `searchRadius` to
 *     "entire country". A renderer must not print a neighbourhood.
 *   - `area`   — the member picked a place from the catalogue. City and
 *     neighbourhood are theirs and may be printed.
 *   - `device` — a real fix from the handset, reverse-geocoded. City may be
 *     printed; neighbourhood is only present when the geocoder gave one.
 */
export type LocationPrecision = 'country' | 'area' | 'device';

export interface PlatformLocation {
  countryCode: string; // e.g. "GB" or "MU"
  countryName: string;
  flag: string;
  state?: string;      // e.g. "Greater London" or "Plaines Wilhems"
  cityName: string;    // e.g. "London" or "Port Louis"
  neighborhood: string; // e.g. "Peckham" or "Rose Hill"
  street?: string;
  latitude: number;
  longitude: number;
  displayName?: string;
  /** See {@link LocationPrecision}. Absent is read as `area` for older stored values. */
  precision?: LocationPrecision;
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface LocationState {
  currentLocation: PlatformLocation;
  searchRadius: number; // in kilometers. -1 means "Entire City", -2 means "Entire Country"
  savedLocations: Record<string, PlatformLocation | null>; // Home, Work, School, etc.
  recentLocations: PlatformLocation[];
  travelMode: boolean;
  travelLocation: PlatformLocation | null;
  permissionStatus: PermissionStatus;
  
  // Actions
  setCurrentLocation: (location: PlatformLocation) => void;
  setSearchRadius: (radius: number) => void;
  toggleTravelMode: (enabled: boolean) => void;
  setTravelLocation: (location: PlatformLocation | null) => void;
  saveLocation: (key: string, location: PlatformLocation) => void;
  removeSavedLocation: (key: string) => void;
  addRecentLocation: (location: PlatformLocation) => void;
  clearRecentLocations: () => void;
  setPermissionStatus: (status: PermissionStatus) => void;
  /**
   * Seeds the discovery context from the member's country of residence.
   *
   * Called once per session, from the auth store. It only ever *upgrades* from
   * knowing nothing: a member who has since picked a place or been located by
   * the handset keeps that, because a country is the coarsest of the three and
   * overwriting a real fix with it would lose information.
   */
  adoptCountry: (countryCode: string | null | undefined) => void;
  /**
   * The device's own answer, or `null` when it could not give one.
   *
   * Null covers a declined permission and a failed fix alike, and callers must
   * not read it as "somewhere else" — see the implementation.
   */
  detectLocation: () => Promise<PlatformLocation | null>;
}

/**
 * "Entire country" — the sentinel every query builder already understands.
 *
 * Each one reads `radiusKm: searchRadius > 0 ? searchRadius : undefined`, so a
 * non-positive radius sends no proximity filter at all. That is exactly the
 * behaviour a country-precision location needs, and it is why a national
 * centroid can be stored without any screen turning it into a distance.
 */
export const RADIUS_ENTIRE_COUNTRY = -2;

/** The radius a member gets once they have told the app where they actually are. */
export const RADIUS_DEFAULT_KM = 5;

/**
 * A location that says only what registration told us: the country.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * `DEFAULT_LOCATION`, a literal Peckham, London — neighbourhood *and* street —
 * used as the initial `currentLocation`, as the member's saved "Home", and as
 * the seed for `recentLocations`. None of it was ever given by a member. A
 * member in Mauritius opened the app to "📍 Peckham, London", a discovery
 * radius of 5 km around Rye Lane, a saved Home in Peckham and a saved Work in
 * Brixton, and every query they made came back "No providers match in London".
 *
 * A country is the one thing the platform genuinely knows before the device
 * says anything: `countryOfResidence` is required at registration. So that is
 * what this builds, and it builds nothing else — `cityName` and `neighborhood`
 * are empty because they are unknown, not because they are pending.
 */
export function countryLocation(countryCode: string | null | undefined): PlatformLocation | null {
  const known = countryByCode(countryCode);
  if (!known) return null;

  const centre = countryCentroid(known.code);

  return {
    countryCode: known.code,
    countryName: known.name,
    flag: known.flag,
    cityName: '',
    neighborhood: '',
    // No entry in the centroid table means no pin. `0, 0` is a real place in
    // the Gulf of Guinea and would be a different invention, so an unlisted
    // country gets `NaN`, which `hasCoordinate` rejects and no map centres on.
    latitude: centre?.latitude ?? Number.NaN,
    longitude: centre?.longitude ?? Number.NaN,
    displayName: known.name,
    precision: 'country',
  };
}

/** True when this location carries a usable point. See {@link countryLocation}. */
export function hasCoordinate(location: PlatformLocation | null | undefined): boolean {
  return (
    !!location &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  );
}

/**
 * The proximity fields for a request, or nothing when there is no point.
 *
 * ── Why every query builder has to go through this ──────────────────────────
 *
 * Six screens spread `latitude: activeLocation.latitude` straight into a
 * request body. While the store always held a literal London address that was
 * merely wrong; now that a location can legitimately have no coordinate — a
 * country with no centroid on file, or a session that has not adopted one yet —
 * it would put `NaN` on the wire, and `NaN` serialises to a string the API
 * rejects with a 400 that reads like a platform fault.
 *
 * Omitting the pair is the correct request: it asks for the unfiltered set,
 * which is exactly what "we do not know where you are" should return.
 */
export function coordinatesOf(
  location: PlatformLocation | null | undefined
): { latitude: number; longitude: number } | Record<string, never> {
  return hasCoordinate(location)
    ? { latitude: location!.latitude, longitude: location!.longitude }
    : {};
}

/**
 * The one place that turns a location into the string a member reads.
 *
 * Four screens built this label inline as `` `${neighborhood}, ${cityName}` ``.
 * With an honest country-precision location — or with the empty `neighborhood`
 * that `detectLocation` has always produced, because a reverse geocode returns
 * a locality and not a neighbourhood — that template renders a leading comma:
 * ", Port Louis". Every one of them now calls this instead.
 */
export function locationLabel(location: PlatformLocation | null | undefined): string {
  if (!location) return 'Set your location';

  const parts = [location.neighborhood, location.cityName, location.countryName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);

  // De-duplicate the city-is-also-the-country case ("Singapore, Singapore").
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);

  return unique.slice(0, 2).join(', ') || 'Set your location';
}

/**
 * The value the store holds before anything is known about the member.
 *
 * Not `null`, because `currentLocation` is read without a guard in about thirty
 * screens and making it nullable would change every one of them. Not a place
 * either: no country, no city, no neighbourhood, and a deliberately non-finite
 * coordinate so `hasCoordinate` is false and nothing centres a map or sends a
 * proximity filter built from it.
 *
 * `locationLabel` renders it as "Set your location", which is what it is.
 */
export const UNKNOWN_LOCATION: PlatformLocation = {
  countryCode: '',
  countryName: '',
  flag: '🌍',
  cityName: '',
  neighborhood: '',
  latitude: Number.NaN,
  longitude: Number.NaN,
  precision: 'country',
};

export const useLocationStore = create<LocationState>((set, get) => ({
  // ── Why there is no default place ─────────────────────────────────────────
  //
  // This used to be a literal Peckham, London. Until the session says which
  // country the member lives in, the app knows nothing about where they are and
  // says so. `adoptCountry` fills it in the moment a session carries a
  // `countryOfResidence`, which registration makes mandatory.
  currentLocation: UNKNOWN_LOCATION,
  searchRadius: RADIUS_ENTIRE_COUNTRY,
  // Nothing is saved until a member saves it. These held Peckham and Brixton.
  savedLocations: {
    Home: null,
    Work: null,
    School: null,
  },
  recentLocations: [],
  travelMode: false,
  travelLocation: null,
  permissionStatus: 'undetermined',

  setCurrentLocation: (location) => {
    set((state) => {
      const updatedState: Partial<LocationState> = {};
      if (state.travelMode) {
        updatedState.travelLocation = location;
      } else {
        updatedState.currentLocation = location;
      }
      return updatedState;
    });
    get().addRecentLocation(location);
  },

  setSearchRadius: (radius) => set({ searchRadius: radius }),

  toggleTravelMode: (enabled) => {
    set((state) => {
      if (enabled) {
        // ── Travel mode starts empty, not in Mauritius ──────────────────────
        //
        // This used to fall back to a literal Rose Hill, Mauritius. Switching
        // travel mode on is a member saying "I am somewhere else"; it is not
        // them saying where, and answering it with a specific town nobody chose
        // is the same invention as the Peckham default it sat beside.
        //
        // `travelLocation` stays null until the member picks a place, and the
        // selector's search field is right there. `getActiveLocation` already
        // falls back to `currentLocation` while it is null.
        return {
          travelMode: true,
          travelLocation: state.travelLocation,
        };
      } else {
        // Toggle off: fall back to current permanent location
        return {
          travelMode: false,
        };
      }
    });
  },

  setTravelLocation: (location) => {
    set({ travelLocation: location });
    if (location) {
      get().addRecentLocation(location);
    }
  },

  saveLocation: (key, location) =>
    set((state) => ({
      savedLocations: {
        ...state.savedLocations,
        [key]: location,
      },
    })),

  removeSavedLocation: (key) =>
    set((state) => ({
      savedLocations: {
        ...state.savedLocations,
        [key]: null,
      },
    })),

  addRecentLocation: (location) => {
    set((state) => {
      // `GET /location/search` answers `LocationReferenceResponse`, whose
      // `neighborhood` and `cityName` are null for a town or a country result.
      // Lower-casing a null threw the moment a member picked one.
      const same = (value: string | null | undefined) => (value ?? '').toLowerCase();
      const filtered = state.recentLocations.filter(
        (loc) =>
          same(loc.neighborhood) !== same(location.neighborhood) ||
          same(loc.cityName) !== same(location.cityName)
      );
      return {
        recentLocations: [location, ...filtered].slice(0, 5), // Keep last 5 recent selections
      };
    });
  },

  clearRecentLocations: () => set({ recentLocations: [] }),

  setPermissionStatus: (status) => set({ permissionStatus: status }),

  adoptCountry: (countryCode) => {
    const seeded = countryLocation(countryCode);
    if (!seeded) return;

    const existing = get().currentLocation;

    // An `area` or `device` location is strictly better than a country, and a
    // country we already adopted is the same thing again. Either way, leave it.
    if (existing.precision !== 'country' || existing.countryCode) return;

    set({
      currentLocation: seeded,
      // A national centroid is not a member position, so the radius has to say
      // "the whole country" — otherwise the app would be filtering to within
      // 5 km of a point in the middle of nowhere.
      searchRadius: RADIUS_ENTIRE_COUNTRY,
    });
  },

  /**
   * Asks the device where it is.
   *
   * ── What this used to be ──────────────────────────────────────────────────
   *
   * A `setTimeout(800)` that resolved to a literal — Peckham, London — and set
   * `permissionStatus: 'granted'` without ever asking anybody. The comment it
   * carried was honest about being a mock; what it did not say is that
   * `choose-country.tsx` compares a member's stated country of residence
   * against this value and refuses registration on a mismatch, under a heading
   * that promises "matching physical GPS telemetry".
   *
   * ── Three answers, and only one of them moves the member ──────────────────
   *
   * `null` means the device could not say. That is deliberately *not* the same
   * as a mismatch, and it must never be treated as one: a member who declines
   * the permission has told us nothing about where they are, and answering that
   * with "your residency could not be verified" would be an accusation built on
   * no evidence.
   *
   * On a refusal or a failure the stored location is left exactly as it was.
   * Overwriting it with a default is how the old code ended up asserting London.
   */
  detectLocation: async () => {
    const detection = await detectCountry();

    if (detection.status === 'permission-denied') {
      set({ permissionStatus: 'denied' });
      return null;
    }

    if (detection.status === 'unavailable') {
      // Permission may well have been granted; the fix or the lookup is what
      // failed. Saying 'granted' here would be as false as the old code's
      // unconditional claim, so the previous status stands.
      return null;
    }

    const known = countryByCode(detection.countryCode);

    const located: PlatformLocation = {
      countryCode: detection.countryCode,
      // The reference list first: it is stable and in one language. The
      // device's own name is the fallback, and the ISO code is the last resort
      // — never blank, because this string is rendered.
      countryName: known?.name ?? detection.countryName ?? detection.countryCode,
      flag: known?.flag ?? '🌍',
      state: detection.region,
      cityName: detection.cityName ?? '',
      // Not invented. A reverse geocode gives a locality, not a neighbourhood,
      // and filling this with the city would put a wrong word on the header.
      neighborhood: '',
      latitude: detection.latitude,
      longitude: detection.longitude,
      displayName: [detection.cityName, known?.name ?? detection.countryName]
        .filter(Boolean)
        .join(', '),
      precision: 'device',
    };

    set((state) => ({
      currentLocation: located,
      permissionStatus: 'granted',
      // A measured fix is a member position, so a proximity radius is finally
      // meaningful. Only lift the country-wide sentinel — a radius the member
      // chose themselves is theirs to keep.
      searchRadius:
        state.searchRadius > 0 ? state.searchRadius : RADIUS_DEFAULT_KM,
    }));

    return located;
  },
}));
export const getActiveLocation = (state: {
  currentLocation: PlatformLocation;
  travelMode: boolean;
  travelLocation: PlatformLocation | null;
}) => {
  return state.travelMode && state.travelLocation ? state.travelLocation : state.currentLocation;
};
