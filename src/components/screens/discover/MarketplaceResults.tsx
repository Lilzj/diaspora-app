// Discover: the Marketplace tab's results, as a list or a grid.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it. The
// screen's one virtualised list draws the rows, each a `MarketplaceCard` or a
// pair of them in the grid (FARCH-004, 27 Nov 2026); this file gives it the
// count and the grid switch above the rows, what the list says in place of
// rows, and the next page below them.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ListState } from '@/components/ListState';
import { ShowMoreButton, couldNotLoad, noMatch } from '@/components/screens/discover/ResultStates';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

/** Whether the tab says it could not ask, in place of its rows. */
export function marketplaceFailed({ marketplaceError }: ListingSearches): boolean {
  return Boolean(marketplaceError);
}

/** Above the rows: how many have loaded, the switch between list and grid, and what the ratings mean. */
export function MarketplaceNotes({ listings, origin, view }: { listings: ListingSearches; origin: OriginFilter; view: DiscoverView }) {
  const { marketCursor } = listings;
  const { displayedMarketplaceListings, marketRatingNote } = origin;
  const { isGridView, setIsGridView } = view;

  return (
    <>
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
    </>
  );
}

/** In place of the rows. The screen's pull re-runs this read, so its error says so as well as offering the button. */
export function MarketplaceState({ listings, origin, search }: { listings: ListingSearches; origin: OriginFilter; search: DiscoverSearch }) {
  const { marketplaceError, refresh } = listings;
  const { displayedMarketplaceListings } = origin;
  const { emptyStatePlace } = search;

  return (
    <ListState
      error={marketplaceError ? couldNotLoad('marketplace listings', marketplaceError, true) : null}
      onRetry={refresh}
      isEmpty={displayedMarketplaceListings.length === 0}
      empty={noMatch('marketplace listings', emptyStatePlace)}
    />
  );
}

/** Below the rows: the next page, on request. */
export function MarketplaceMore({ listings }: { listings: ListingSearches }) {
  const { marketCursor, marketMore, loadMoreMarketplace } = listings;
  return marketCursor ? (
    <ShowMoreButton label="Show more items" state={marketMore} onPress={loadMoreMarketplace} />
  ) : null;
}
