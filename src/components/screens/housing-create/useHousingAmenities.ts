// List a home: the amenity catalogue, read once, and the amenities chosen from it.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState, useEffect, useMemo } from 'react';
import { type HousingAmenity, fetchHousingAmenities } from '@/lib/api/housing-listings-api';

export function useHousingAmenities() {
  // **Keys the catalogue knows, never text somebody typed.**
  //
  // This was `useState('High-speed Internet, Washing Machine, Heating')`, split
  // on commas and posted as amenity keys. The catalogue's keys are slugs —
  // `air-conditioning`, `parking`, `elevator` — so the server answered
  // `AmenityNotFound`, a 404, and refused the listing. The field was filled by
  // default, so a landlord who never touched it still could not post: on
  // 21 Sep 2026 production held one landlord profile and nought listings.
  const [amenityKeys, setAmenityKeys] = useState<string[]>([]);
  const [amenityCatalog, setAmenityCatalog] = useState<HousingAmenity[]>([]);
  const [amenitiesUnavailable, setAmenitiesUnavailable] = useState(false);

  // The catalogue, read once. Anonymous on the server, so it does not wait on
  // anything else this screen is doing.
  useEffect(() => {
    let cancelled = false;

    fetchHousingAmenities()
      .then((amenities) => {
        if (cancelled) return;
        setAmenityCatalog(amenities);
        setAmenitiesUnavailable(amenities.length === 0);
      })
      .catch(() => {
        // Said out loud rather than swallowed: without the catalogue a landlord
        // cannot choose amenities, and a silent empty list would look like a
        // platform that has none.
        if (!cancelled) setAmenitiesUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** The catalogue in the order the server grouped it, which is how it renders. */
  const amenityGroups = useMemo(() => {
    const groups: { group: string; items: HousingAmenity[] }[] = [];

    for (const amenity of amenityCatalog) {
      const existing = groups.find((entry) => entry.group === amenity.group);
      if (existing) existing.items.push(amenity);
      else groups.push({ group: amenity.group, items: [amenity] });
    }

    return groups;
  }, [amenityCatalog]);

  const toggleAmenity = (key: string) =>
    setAmenityKeys((current) =>
      current.includes(key) ? current.filter((held) => held !== key) : [...current, key]
    );

  return { amenityKeys, setAmenityKeys, amenitiesUnavailable, amenityGroups, toggleAmenity };
}

/** What `useHousingAmenities` holds, as the screen reads it. */
export type HousingAmenities = ReturnType<typeof useHousingAmenities>;
