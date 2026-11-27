// Discover: the Marketplace tab's results, as a list or a grid.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { EmptyStateView, ShowMoreButton } from '@/components/screens/discover/ResultStates';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

interface MarketplaceResultsProps {
  listings: ListingSearches;
  origin: OriginFilter;
  search: DiscoverSearch;
  view: DiscoverView;
}

export function MarketplaceResults({ listings, origin, search, view }: MarketplaceResultsProps) {
  const { marketplaceError, marketCursor, marketMore, loadMoreMarketplace } = listings;
  const { displayedMarketplaceListings, marketRatingNote } = origin;
  const { emptyStatePlace } = search;
  const { isGridView, setIsGridView } = view;

  return (
    <View>
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
          {/* "20+" while more pages remain: twenty is what has loaded, not what exists. */}
          {`${displayedMarketplaceListings.length}${marketCursor ? '+' : ''} ${
                           displayedMarketplaceListings.length === 1 && !marketCursor ? 'item' : 'items'
                         } nearby`}
        </Text>
        <TouchableOpacity
          onPress={() => setIsGridView(!isGridView)}
          className="bg-surface-muted px-3 py-1.5 rounded-full border border-subtle"
        >
          <Text className="text-xs font-bold text-content-secondary">
            {isGridView ? '☰ List View' : '⊞ Grid View'}
          </Text>
        </TouchableOpacity>
      </View>

      {marketRatingNote ? (
        <Text className="text-xs text-content-secondary mb-3">{marketRatingNote}</Text>
      ) : null}

      {displayedMarketplaceListings.length > 0 ? (
        isGridView ? (
          <View className="flex-row flex-wrap justify-between">
            {displayedMarketplaceListings.map((item) => (
              <MarketplaceCard key={item.id} listing={item} variant="grid" />
            ))}
          </View>
        ) : (
          <View>
            {displayedMarketplaceListings.map((item) => (
              <MarketplaceCard key={item.id} listing={item} variant="list" />
            ))}
          </View>
        )
      ) : (
        <EmptyStateView label="marketplace listings" place={emptyStatePlace} error={marketplaceError} />
      )}
      {marketCursor ? (
        <ShowMoreButton label="Show more items" state={marketMore} onPress={loadMoreMarketplace} />
      ) : null}
    </View>
  );
}
