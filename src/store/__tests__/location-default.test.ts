/**
 * The store must not invent a place.
 *
 * ── What this is guarding ───────────────────────────────────────────────────
 *
 * `store/location.ts` shipped with `currentLocation` initialised to a literal
 * Peckham, London — neighbourhood *and* street — a saved "Home" in Peckham, a
 * saved "Work" in Brixton, two seeded "recent" locations, and a 5 km search
 * radius. None of it came from a member.
 *
 * On a release APK, a member registered in Mauritius signed in and was shown
 * "📍 Peckham, London 🇬🇧" on the Home header, "Explore Peckham · London" on
 * Discover, a discovery radius of 5 km around Rye Lane, and the empty state
 * "No providers match in London". Their saved-locations list already contained
 * two London addresses they had never entered.
 *
 * Each `it` below is one of those symptoms.
 */
import { act } from 'react-test-renderer';

import {
  useLocationStore,
  countryLocation,
  locationLabel,
  hasCoordinate,
  coordinatesOf,
  UNKNOWN_LOCATION,
  RADIUS_ENTIRE_COUNTRY,
  getActiveLocation,
  type PlatformLocation,
} from '@/store/location';

const initial = useLocationStore.getState();

beforeEach(() => {
  act(() => {
    useLocationStore.setState({
      currentLocation: UNKNOWN_LOCATION,
      searchRadius: RADIUS_ENTIRE_COUNTRY,
      recentLocations: [],
      travelMode: false,
      travelLocation: null,
      permissionStatus: 'undetermined',
    });
  });
});

afterAll(() => {
  act(() => useLocationStore.setState(initial));
});

describe('the store ships no default place', () => {
  it('does not claim the member is anywhere before a session', () => {
    const { currentLocation } = useLocationStore.getState();

    expect(currentLocation.countryCode).toBe('');
    expect(currentLocation.cityName).toBe('');
    expect(currentLocation.neighborhood).toBe('');
    expect(hasCoordinate(currentLocation)).toBe(false);
  });

  it('saves no location the member did not save', () => {
    const { recentLocations } = useLocationStore.getState();

    expect(recentLocations).toEqual([]);
  });

  it('keeps no saved places of its own, because the platform holds them', () => {
    // Home, Work and School used to live here, in memory, with no persistence of
    // any kind — a saved Home did not survive closing the app, and had never
    // existed on another device. They are the profile's now.
    expect(useLocationStore.getState()).not.toHaveProperty('savedLocations');
    expect(useLocationStore.getState()).not.toHaveProperty('saveLocation');
  });

  it('names no city, in any field, anywhere in the initial state', () => {
    // The specific regression: "Peckham", "Rye Lane", "Brixton", "London".
    const serialised = JSON.stringify(useLocationStore.getState());

    for (const invented of ['Peckham', 'Rye Lane', 'Brixton', 'London', 'Rose Hill']) {
      expect(serialised).not.toContain(invented);
    }
  });

  it('asks for the whole country rather than 5 km around an unknown point', () => {
    expect(useLocationStore.getState().searchRadius).toBe(RADIUS_ENTIRE_COUNTRY);
    expect(RADIUS_ENTIRE_COUNTRY).toBeLessThanOrEqual(0);
  });
});

describe('adoptCountry seeds from the member, not from a constant', () => {
  it('puts a Mauritius member in Mauritius', () => {
    act(() => useLocationStore.getState().adoptCountry('MU'));

    const location = useLocationStore.getState().currentLocation;

    expect(location.countryCode).toBe('MU');
    expect(location.countryName).toBe('Mauritius');
    expect(location.precision).toBe('country');
    // Somewhere in the Indian Ocean, not in Europe.
    expect(location.latitude).toBeLessThan(0);
    expect(location.longitude).toBeGreaterThan(50);
  });

  it('still claims no neighbourhood — a country is not an address', () => {
    act(() => useLocationStore.getState().adoptCountry('MU'));

    const location = useLocationStore.getState().currentLocation;

    expect(location.neighborhood).toBe('');
    expect(location.cityName).toBe('');
    expect(locationLabel(location)).toBe('Mauritius');
  });

  it('keeps the country-wide radius, because a centroid is not a position', () => {
    act(() => useLocationStore.getState().adoptCountry('MU'));

    expect(useLocationStore.getState().searchRadius).toBe(RADIUS_ENTIRE_COUNTRY);
  });

  it('does not downgrade a location the member has already improved', () => {
    const chosen: PlatformLocation = {
      countryCode: 'MU',
      countryName: 'Mauritius',
      flag: '🇲🇺',
      cityName: 'Port Louis',
      neighborhood: 'Waterfront',
      latitude: -20.1608,
      longitude: 57.5012,
      precision: 'area',
    };

    act(() => useLocationStore.getState().setCurrentLocation(chosen));
    act(() => useLocationStore.getState().adoptCountry('MU'));

    expect(useLocationStore.getState().currentLocation.neighborhood).toBe('Waterfront');
  });

  it('ignores a country it does not recognise rather than guessing one', () => {
    act(() => useLocationStore.getState().adoptCountry('ZZ'));

    expect(useLocationStore.getState().currentLocation.countryCode).toBe('');
  });
});

describe('locationLabel', () => {
  it('never renders a leading comma when the neighbourhood is unknown', () => {
    // This is what a real reverse geocode produces: a locality and no
    // neighbourhood. The four screens that built `${neighborhood}, ${cityName}`
    // inline rendered ", Port Louis".
    const geocoded = countryLocation('MU')!;
    const label = locationLabel({ ...geocoded, cityName: 'Port Louis', precision: 'device' });

    expect(label).toBe('Port Louis, Mauritius');
    expect(label.startsWith(',')).toBe(false);
  });

  it('tells an unlocated member what to do instead of naming a city', () => {
    expect(locationLabel(UNKNOWN_LOCATION)).toBe('Set your location');
    expect(locationLabel(null)).toBe('Set your location');
  });
});

describe('coordinatesOf keeps NaN off the wire', () => {
  it('omits the pair entirely when there is no point', () => {
    expect(coordinatesOf(UNKNOWN_LOCATION)).toEqual({});
  });

  it('sends the pair when there is one', () => {
    expect(coordinatesOf(countryLocation('MU'))).toEqual({
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });
  });

  it('never emits a non-finite number', () => {
    for (const code of ['MU', 'GB', 'NG', 'GH', 'KE', 'ZA']) {
      const coords = coordinatesOf(countryLocation(code)) as Record<string, number>;
      expect(Number.isFinite(coords.latitude)).toBe(true);
      expect(Number.isFinite(coords.longitude)).toBe(true);
    }
  });
});

describe('travel mode', () => {
  it('does not drop the member in Mauritius when they switch it on', () => {
    // It used to default `travelLocation` to a literal Rose Hill, Mauritius.
    act(() => useLocationStore.getState().toggleTravelMode(true));

    const state = useLocationStore.getState();

    expect(state.travelMode).toBe(true);
    expect(state.travelLocation).toBeNull();
    // With no travel location chosen, discovery stays where the member was.
    expect(getActiveLocation(state)).toBe(state.currentLocation);
  });
});
