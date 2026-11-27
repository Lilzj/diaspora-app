// List a home: the server's lists (property types, furnishing, lease lengths) and the property type
// chosen from them, cleared when it is not one the listing type offers. Lifted out of
// `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState, useEffect, useMemo } from 'react';
import {
  type AccommodationType,
  type HousingChoice,
  fetchAccommodationTypes,
  fetchHousingListingOptions,
} from '@/lib/api/housing-listings-api';

export function useHousingCatalogue() {
  // STEP 1: Listing & Property Type
  const [listingType, setListingType] = useState<'Rent' | 'Share'>('Rent');
  const [propertyType, setPropertyType] = useState<string | null>(null);

  // Property types, furnishing and lease length: the server's lists, not ours.
  const [accommodationTypes, setAccommodationTypes] = useState<AccommodationType[]>([]);
  const [furnishingOptions, setFurnishingOptions] = useState<HousingChoice[]>([]);
  const [leaseOptions, setLeaseOptions] = useState<HousingChoice[]>([]);
  const [choicesUnavailable, setChoicesUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchAccommodationTypes(), fetchHousingListingOptions()])
      .then(([types, options]) => {
        if (cancelled) return;
        setAccommodationTypes(types);
        setFurnishingOptions(options.furnishing);
        setLeaseOptions(options.leaseTypes);
        setChoicesUnavailable(types.length === 0);
      })
      .catch(() => {
        if (!cancelled) setChoicesUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Rent shows the whole-place types, Share the shared ones, as the server marks them.
  const visibleTypes = useMemo(
    () => accommodationTypes.filter((type) => type.isShared === (listingType === 'Share')),
    [accommodationTypes, listingType]
  );
  const propertyTypeName = accommodationTypes.find((type) => type.key === propertyType)?.name ?? null;

  // A choice made under Rent is not one of the Share types, and vice versa.
  useEffect(() => {
    if (propertyType && accommodationTypes.length > 0 && !visibleTypes.some((type) => type.key === propertyType)) {
      setPropertyType(null);
    }
  }, [visibleTypes, accommodationTypes.length, propertyType]);

  return {
    listingType, setListingType, propertyType, setPropertyType, accommodationTypes,
    furnishingOptions, leaseOptions, choicesUnavailable, visibleTypes, propertyTypeName,
  };
}

/** What `useHousingCatalogue` holds, as the screen reads it. */
export type HousingCatalogue = ReturnType<typeof useHousingCatalogue>;
