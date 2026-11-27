// Discover: the Housing tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it. The
// screen's one virtualised list draws the rows, each a `HousingCard`
// (FARCH-004, 27 Nov 2026); this file gives it the notes above the rows, what
// the list says in place of rows, and the next page below them.

import React from 'react';
import { Text } from 'react-native';
import { ListState } from '@/components/ListState';
import { ShowMoreButton, couldNotLoad, noMatch } from '@/components/screens/discover/ResultStates';
import type { ListingSearches } from '@/components/screens/discover/useListingSearches';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

/** Whether the tab says it could not ask, in place of its rows. */
export function housingFailed({ housingError }: ListingSearches): boolean {
  return Boolean(housingError);
}

/** Above the rows: how far the distances reach, and what the ratings mean. */
export function HousingNotes({ listings, origin }: { listings: ListingSearches; origin: OriginFilter }) {
  const { housingDistanceNote } = listings;
  const { housingRatingNote } = origin;

  return (
    <>
      {housingDistanceNote ? (
        <Text className="text-xs text-content-secondary mb-3">{housingDistanceNote}</Text>
      ) : null}
      {housingRatingNote ? (
        <Text className="text-xs text-content-secondary mb-3">{housingRatingNote}</Text>
      ) : null}
    </>
  );
}

/** In place of the rows. The screen's pull re-runs this read, so its error says so as well as offering the button. */
export function HousingState({ listings, origin, search }: { listings: ListingSearches; origin: OriginFilter; search: DiscoverSearch }) {
  const { housingError, refresh } = listings;
  const { displayedHousingListings } = origin;
  const { emptyStatePlace } = search;

  return (
    <ListState
      error={housingError ? couldNotLoad('homes & housing', housingError, true) : null}
      onRetry={refresh}
      isEmpty={displayedHousingListings.length === 0}
      empty={noMatch('homes & housing', emptyStatePlace)}
    />
  );
}

/** Below the rows: the next page, on request. */
export function HousingMore({ listings }: { listings: ListingSearches }) {
  const { housingCursor, housingMore, loadMoreHousing } = listings;
  return housingCursor ? (
    <ShowMoreButton label="Show more homes" state={housingMore} onPress={loadMoreHousing} />
  ) : null;
}
