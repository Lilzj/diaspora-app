// Discover: the sort chip, as each tab can honour it, and the verified toggle.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import { type DiscoverSort, effectiveSort } from '@/lib/platform/discover-filters';

export function useDiscoverFilters() {
  // Filters state
  const [sortBy, setSortBy] = useState<DiscoverSort>('default');
  // What each tab sorts by: the chip, where that tab can honour it. The chip is
  // shared, so "Distance" picked on Housing is "Recommended" on the items tab.
  const housingSort = effectiveSort('Housing', sortBy);
  const marketSort = effectiveSort('Marketplace', sortBy);
  const providerSort = effectiveSort('Providers', sortBy);
  const [filterVerified, setFilterVerified] = useState(false);

  return {
    sortBy, setSortBy, housingSort, marketSort, providerSort, filterVerified, setFilterVerified,
  };
}

/** What `useDiscoverFilters` holds, as the screen reads it. */
export type DiscoverFilters = ReturnType<typeof useDiscoverFilters>;
