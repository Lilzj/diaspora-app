// Discover: the Guides tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View } from 'react-native';
import { GuideResultCard } from '@/components/guides/GuideResultCard';
import {
  EmptyStateView,
  ShowMoreButton,
  pagingState,
} from '@/components/screens/discover/ResultStates';
import type { DiscoverCategories } from '@/components/screens/discover/useDiscoverCategories';
import type { GuideTab } from '@/components/screens/discover/useGuideTab';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface GuideResultsProps {
  categories: DiscoverCategories;
  guides: GuideTab;
  search: DiscoverSearch;
}

export function GuideResults({ categories, guides, search }: GuideResultsProps) {
  const { guideCategories } = categories;
  const { guideSearch, filteredGuides } = guides;
  const { emptyStatePlace } = search;

  return (
    <View>
      {/* Only a failed first page is a failed list: a failed
          "Show more" keeps the guides shown and says so on the
          button. */}
      {guideSearch.error && filteredGuides.length === 0 ? (
        <EmptyStateView
          label="guides"
          place={emptyStatePlace}
          error="We could not reach guides just now."
        />
      ) : filteredGuides.length > 0 ? (
        filteredGuides.map((item) => (
          <GuideResultCard
            key={item.guideId}
            /* `GET /guides` answers `GuideCardResponse`. The old
               `GuideCard` reads a fixture shape (`country.flag`)
               and crashed the tab once a real guide existed
               (16 Oct 2026). */
            guide={item}
            categoryName={guideCategories.find((c) => c.key === item.categoryKey)?.name}
          />
        ))
      ) : (
        <EmptyStateView label="guides" place={emptyStatePlace} />
      )}
      {guideSearch.hasMore ? (
        <ShowMoreButton
          label="Show more guides"
          state={pagingState(guideSearch)}
          onPress={guideSearch.loadMore}
        />
      ) : null}
    </View>
  );
}
