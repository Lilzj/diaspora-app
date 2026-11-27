// Discover: the Housing filters in the sheet, as the requests take them.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useState, useMemo } from 'react';
import type { HousingSheetFilters } from '@/lib/platform/discover-filters';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

export function useHousingSheet(search: DiscoverSearch) {
  const { bedroomsCount, homeTypes } = search;

  const [rentMin, setRentMin] = useState<string>('');
  const [rentMax, setRentMax] = useState<string>('');
  const [bathroomsCount, setBathroomsCount] = useState<number | null>(null);
  const [furnishedStatus, setFurnishedStatus] = useState<string>('All');
  const [filterBillsIncluded, setFilterBillsIncluded] = useState(false);
  const [filterInternetIncluded, setFilterInternetIncluded] = useState(false);
  const [filterParkingAvailable, setFilterParkingAvailable] = useState(false);
  const [filterVerifiedHost, setFilterVerifiedHost] = useState(false);
  const [selectedLifestyleMatches, setSelectedLifestyleMatches] = useState<Record<string, boolean>>({});

  // The sheets' state as the requests take it, so the first page and "Show
  // more" can never be built from different filters.
  const housingFilters = useMemo<HousingSheetFilters>(
    () => ({
      rentMin,
      rentMax,
      bedrooms: bedroomsCount,
      bathrooms: bathroomsCount,
      furnished: furnishedStatus,
      billsIncluded: filterBillsIncluded,
      internetIncluded: filterInternetIncluded,
      parking: filterParkingAvailable,
      verifiedHost: filterVerifiedHost,
      lifestyle: selectedLifestyleMatches,
      homeTypes,
    }),
    [
      rentMin, rentMax, bedroomsCount, bathroomsCount, furnishedStatus, filterBillsIncluded,
      filterInternetIncluded, filterParkingAvailable, filterVerifiedHost, selectedLifestyleMatches,
      homeTypes,
    ]
  );

  return {
    rentMin, setRentMin, rentMax, setRentMax, bathroomsCount, setBathroomsCount, furnishedStatus,
    setFurnishedStatus, filterBillsIncluded, setFilterBillsIncluded, filterInternetIncluded,
    setFilterInternetIncluded, filterParkingAvailable, setFilterParkingAvailable,
    filterVerifiedHost, setFilterVerifiedHost, selectedLifestyleMatches,
    setSelectedLifestyleMatches, housingFilters,
  };
}

/** What `useHousingSheet` holds, as the screen reads it. */
export type HousingSheet = ReturnType<typeof useHousingSheet>;
