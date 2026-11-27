// Discover: the filter and sort sheet, with the filters of the tab in view.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Sheet } from '@/components/overlays/AppModal';
import { sortOptionsFor } from '@/lib/platform/discover-filters';
import { SortOptions } from '@/components/screens/discover/SortOptions';
import { OriginCountryFilter } from '@/components/screens/discover/OriginCountryFilter';
import { MarketplaceFilters } from '@/components/screens/discover/MarketplaceFilters';
import { JobFilters } from '@/components/screens/discover/JobFilters';
import { HousingFilters } from '@/components/screens/discover/HousingFilters';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';
import type { HousingSheet } from '@/components/screens/discover/useHousingSheet';
import type { MarketSheet } from '@/components/screens/discover/useMarketSheet';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

interface DiscoverFilterSheetProps {
  filters: DiscoverFilters;
  housingSheet: HousingSheet;
  marketSheet: MarketSheet;
  origin: OriginFilter;
  search: DiscoverSearch;
  view: DiscoverView;
}

export function DiscoverFilterSheet({
  filters,
  housingSheet,
  marketSheet,
  origin,
  search,
  view,
}: DiscoverFilterSheetProps) {
  const { filterVerified, setFilterVerified } = filters;
  const { availableCountries } = origin;
  const { activeTab } = search;
  const { isFilterModalOpen, setIsFilterModalOpen } = view;

  return (
    <Sheet
      visible={isFilterModalOpen}
      onClose={() => setIsFilterModalOpen(false)}
      title="Filters & Sort"
      testID="discover-filter-sheet"
    >
          <View>

          {/* Sort Options — only the orders this tab's server applies across
              every page. Jobs and guides have none, and their chips used to
              change nothing. */}
          {sortOptionsFor(activeTab).length > 0 ? (
            <SortOptions filters={filters} search={search} />
          ) : null}

          {/* Lister's Origin Country Filter */}
          {availableCountries.length > 0 && (
            <OriginCountryFilter origin={origin} />
          )}

          {activeTab === 'Marketplace' ? (
            <MarketplaceFilters marketSheet={marketSheet} search={search} />
          ) : activeTab === 'Jobs' ? (
            <JobFilters filters={filters} search={search} />
            ) : activeTab === 'Housing' ? (
              <HousingFilters housingSheet={housingSheet} search={search} />
          ) : (
            <View>
              {/* Verified toggle */}
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Trust Level</Text>
              <TouchableOpacity
                onPress={() => setFilterVerified(!filterVerified)}
                className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                  filterVerified ? 'bg-surface-muted border border-subtle' : 'bg-surface-background'
                }`}
              >
                <Text className="text-sm font-semibold text-content-primary">
                  Show only Community Verified providers
                </Text>
                <Text className="text-lg">{filterVerified ? '✅' : '⬜'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
    </Sheet>
  );
}
