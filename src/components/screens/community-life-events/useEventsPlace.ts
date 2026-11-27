// Community Life: where the screen is looking. The member's place, or one they chose here, and the
// point a nearby search measures from when there is one. Lifted out of
// `app/community-life/events.tsx` (FSOLID-001), which composes it.

import { useState, useMemo } from 'react';
import { nearbyPointOf } from '@/lib/domain/events-nearby';
import { useAuthStore } from '@/store/auth';
import { type PlatformLocation, countryLocation, useLocationStore } from '@/store/location';

interface LocationOption {
  /** Empty when only the country is known: the whole country is browsed. */
  city: string;
  country: string;
  /**
   * ISO-3166 alpha-2. The calendar route filters by country and has no city
   * parameter at all, so this is the only thing it can be narrowed by.
   */
  countryCode: string;
  flag: string;
}

/**
 * Where the screen opens: the town the member is browsing, else their country
 * of residence alone (14 Oct 2026). It was a fixed list of London, Lagos and
 * Accra that opened on London for everybody, Mauritius included.
 */
function startingEventsLocation(
  current: PlatformLocation | null | undefined,
  residenceCountry: string | null | undefined
): LocationOption {
  if (current?.cityName) {
    return {
      city: current.cityName,
      country: current.countryName,
      countryCode: current.countryCode,
      flag: current.flag,
    };
  }
  const home = countryLocation(residenceCountry) ?? (current?.countryCode ? current : null);
  return {
    city: '',
    country: home?.countryName ?? '',
    countryCode: home?.countryCode ?? '',
    flag: home?.flag ?? '🌍',
  };
}

/** What the header and empty states call the place. */
function placeLabel(location: LocationOption): string {
  return location.city || location.country || 'your area';
}

export function useEventsPlace() {
  const currentLocation = useLocationStore((state) => state.currentLocation);
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry ?? null);
  // A town the member picked here; until then, where they are browsing.
  const [chosenLocation, setChosenLocation] = useState<LocationOption | null>(null);
  const selectedLocation = useMemo(
    () => chosenLocation ?? startingEventsLocation(currentLocation, residenceCountry),
    [chosenLocation, currentLocation, residenceCountry]
  );
  const placeName = placeLabel(selectedLocation);
  // Near the member: the phone's position or the area they chose, never a
  // country's middle. Without one, "Nearby" says why it cannot be used.
  const nearbyPoint = useMemo(() => nearbyPointOf(currentLocation), [currentLocation]);
  const isSignedIn = useAuthStore((state) => state.isAuthenticated);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  return {
    setChosenLocation, selectedLocation, placeName, nearbyPoint, isSignedIn, isLocationModalOpen,
    setIsLocationModalOpen,
  };
}

/** What `useEventsPlace` holds, as the screen reads it. */
export type EventsPlace = ReturnType<typeof useEventsPlace>;
