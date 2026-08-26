import { create } from 'zustand';

import { countryByCode } from '@/lib/calling-code';
import { detectCountry } from '@/lib/location/detect-country';

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
   * The device's own answer, or `null` when it could not give one.
   *
   * Null covers a declined permission and a failed fix alike, and callers must
   * not read it as "somewhere else" — see the implementation.
   */
  detectLocation: () => Promise<PlatformLocation | null>;
}

// Default Peckham, London location
export const DEFAULT_LOCATION: PlatformLocation = {
  countryCode: 'GB',
  countryName: 'United Kingdom',
  flag: '🇬🇧',
  state: 'Greater London',
  cityName: 'London',
  neighborhood: 'Peckham',
  street: 'Rye Lane',
  latitude: 51.4742,
  longitude: -0.0691,
  displayName: 'Peckham, London',
};

// Default Rose Hill, Mauritius location
export const MAURITIUS_DEFAULT: PlatformLocation = {
  countryCode: 'MU',
  countryName: 'Mauritius',
  flag: '🇲🇺',
  state: 'Plaines Wilhems',
  cityName: 'Rose Hill',
  neighborhood: 'Rose Hill Central',
  latitude: -20.2417,
  longitude: 57.4806,
  displayName: 'Rose Hill, Mauritius',
};

export const useLocationStore = create<LocationState>((set, get) => ({
  currentLocation: DEFAULT_LOCATION,
  searchRadius: 5, // Default 5 km
  savedLocations: {
    Home: DEFAULT_LOCATION,
    Work: {
      countryCode: 'GB',
      countryName: 'United Kingdom',
      flag: '🇬🇧',
      state: 'Greater London',
      cityName: 'London',
      neighborhood: 'Brixton',
      latitude: 51.4624,
      longitude: -0.1149,
      displayName: 'Brixton, London',
    },
    School: null,
  },
  recentLocations: [DEFAULT_LOCATION, MAURITIUS_DEFAULT],
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
        // Toggle on: use the travel location if it exists, otherwise default to Mauritius
        const newLocation = state.travelLocation || MAURITIUS_DEFAULT;
        return {
          travelMode: true,
          travelLocation: newLocation,
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
      const filtered = state.recentLocations.filter(
        (loc) =>
          loc.neighborhood.toLowerCase() !== location.neighborhood.toLowerCase() ||
          loc.cityName.toLowerCase() !== location.cityName.toLowerCase()
      );
      return {
        recentLocations: [location, ...filtered].slice(0, 5), // Keep last 5 recent selections
      };
    });
  },

  clearRecentLocations: () => set({ recentLocations: [] }),

  setPermissionStatus: (status) => set({ permissionStatus: status }),

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
    };

    set({ currentLocation: located, permissionStatus: 'granted' });

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
