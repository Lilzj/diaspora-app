import { create } from 'zustand';

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
  detectLocation: () => Promise<PlatformLocation>;
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

  detectLocation: () => {
    set({ permissionStatus: 'granted' });
    return new Promise((resolve) => {
      // Simulate GPS coordinates calculation after a tiny delay
      setTimeout(() => {
        // ── What this detects, and why it is not Mauritius ─────────────────
        //
        // This returned Rose Hill, Mauritius — chosen to show off the diaspora
        // angle. It also emptied a third of the app.
        //
        // Every seeded donation cause, contribution fund and subscription plan
        // carries `countryCode: 'GB'`, and the screens that list them filter on
        // the member's country. So granting location permission — the first
        // thing a new member does — moved them to a country the catalogue does
        // not cover, and Give, Plans and the funds list all went empty with
        // messages like "Diaspora does not offer a plan for this in your
        // country at the moment". Correct sentences about a state the app had
        // put them in for no reason.
        //
        // Detection returns the seeded city. A mock that detects somewhere the
        // mock data cannot serve is not demonstrating anything except an empty
        // screen.
        //
        // The real fix for the general case is a catalogue that spans
        // countries, or a fallback when a country filter finds nothing. Both
        // are real work; this is the one line that stops the demo build
        // contradicting itself.
        const detected = {
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
        set({ currentLocation: detected });
        resolve(detected);
      }, 800);
    });
  },
}));
export const getActiveLocation = (state: {
  currentLocation: PlatformLocation;
  travelMode: boolean;
  travelLocation: PlatformLocation | null;
}) => {
  return state.travelMode && state.travelLocation ? state.travelLocation : state.currentLocation;
};
