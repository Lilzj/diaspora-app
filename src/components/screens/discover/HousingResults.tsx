// Discover: the Housing tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text } from 'react-native';
import { HousingCard } from '@/components/HousingCard';
import { EmptyStateView, ShowMoreButton } from '@/components/screens/discover/ResultStates';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface HousingResultsProps {
  listings: ListingSearches;
  origin: OriginFilter;
  search: DiscoverSearch;
}

export function HousingResults({ listings, origin, search }: HousingResultsProps) {
  const {
    housingError, housingCursor, housingMore, loadMoreHousing, housingDistanceNote,
  } = listings;
  const { displayedHousingListings, housingRatingNote } = origin;
  const { emptyStatePlace } = search;

  return (
    <View>
      {housingDistanceNote ? (
        <Text className="text-xs text-content-secondary mb-3">{housingDistanceNote}</Text>
      ) : null}
      {housingRatingNote ? (
        <Text className="text-xs text-content-secondary mb-3">{housingRatingNote}</Text>
      ) : null}
      {displayedHousingListings.length > 0 ? (
        displayedHousingListings.map((item) => (
          <HousingCard key={item.id} listing={item} />
        ))
      ) : (
        <EmptyStateView label="homes & housing" place={emptyStatePlace} error={housingError} />
      )}
      {housingCursor ? (
        <ShowMoreButton label="Show more homes" state={housingMore} onPress={loadMoreHousing} />
      ) : null}
    </View>
  );
}
