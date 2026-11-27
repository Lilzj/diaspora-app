// Discover: the Guides tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it. The
// screen's one virtualised list draws the rows, each a `GuideResultCard`
// (FARCH-004, 27 Nov 2026); this file says what the list says in place of
// rows, and gives it the next page below them.

import React from 'react';
import { ListState } from '@/components/ListState';
import {
  ShowMoreButton,
  couldNotLoad,
  noMatch,
  pagingState,
} from '@/components/screens/discover/ResultStates';
import type { GuideTab } from '@/components/screens/discover/useGuideTab';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

/**
 * Whether the tab says it could not ask, in place of its rows. Only a failed
 * first page is a failed list: a failed "Show more" keeps the guides shown and
 * says so on the button.
 */
export function guidesFailed({ guideSearch, filteredGuides }: GuideTab): boolean {
  return Boolean(guideSearch.error) && filteredGuides.length === 0;
}

/** In place of the rows. */
export function GuideState({ guides, search }: { guides: GuideTab; search: DiscoverSearch }) {
  const { guideSearch, filteredGuides } = guides;
  const { emptyStatePlace } = search;

  return (
    <ListState
      error={guidesFailed(guides) ? couldNotLoad('guides', 'We could not reach guides just now.', false) : null}
      onRetry={guideSearch.refresh}
      isEmpty={filteredGuides.length === 0}
      empty={noMatch('guides', emptyStatePlace)}
    />
  );
}

/** Below the rows: the next page, on request. */
export function GuideMore({ guides }: { guides: GuideTab }) {
  const { guideSearch } = guides;
  return guideSearch.hasMore ? (
    <ShowMoreButton
      label="Show more guides"
      state={pagingState(guideSearch)}
      onPress={guideSearch.loadMore}
    />
  ) : null;
}
