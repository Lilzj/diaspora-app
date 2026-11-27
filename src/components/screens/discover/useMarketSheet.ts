// Discover: the Marketplace filters in the sheet, as the requests take them.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useState, useMemo } from 'react';
import type { ListingIntent, ListingCondition } from '@/types/marketplace';
import type { MarketplaceSheetFilters } from '@/lib/platform/discover-filters';

export function useMarketSheet() {
  const [marketIntent, setMarketIntent] = useState<ListingIntent | ''>('');
  const [marketCondition, setMarketCondition] = useState<ListingCondition | ''>('');
  const [marketMinPrice, setMarketMinPrice] = useState('');
  const [marketMaxPrice, setMarketMaxPrice] = useState('');
  const [filterVerifiedSeller, setFilterVerifiedSeller] = useState(false);
  const [filterDeliveryAvailable, setFilterDeliveryAvailable] = useState(false);
  const [filterPickupOnly, setFilterPickupOnly] = useState(false);

  const marketFilters = useMemo<MarketplaceSheetFilters>(
    () => ({
      intent: marketIntent,
      condition: marketCondition,
      minPrice: marketMinPrice,
      maxPrice: marketMaxPrice,
      verifiedSeller: filterVerifiedSeller,
      delivery: filterDeliveryAvailable,
      pickupOnly: filterPickupOnly,
    }),
    [
      marketIntent, marketCondition, marketMinPrice, marketMaxPrice,
      filterVerifiedSeller, filterDeliveryAvailable, filterPickupOnly,
    ]
  );

  return {
    marketIntent, setMarketIntent, marketCondition, setMarketCondition, marketMinPrice,
    setMarketMinPrice, marketMaxPrice, setMarketMaxPrice, filterVerifiedSeller,
    setFilterVerifiedSeller, filterDeliveryAvailable, setFilterDeliveryAvailable, filterPickupOnly,
    setFilterPickupOnly, marketFilters,
  };
}

/** What `useMarketSheet` holds, as the screen reads it. */
export type MarketSheet = ReturnType<typeof useMarketSheet>;
