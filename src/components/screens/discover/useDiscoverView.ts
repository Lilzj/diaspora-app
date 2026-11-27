// Discover: what is open, and how results are shown.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';

export function useDiscoverView() {
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isMapView, setIsMapView] = useState(false);
  const [isGridView, setIsGridView] = useState(false);

  return {
    isLocationSelectorOpen, setIsLocationSelectorOpen, isFilterModalOpen, setIsFilterModalOpen,
    isMapView, setIsMapView, isGridView, setIsGridView,
  };
}

/** What `useDiscoverView` holds, as the screen reads it. */
export type DiscoverView = ReturnType<typeof useDiscoverView>;
