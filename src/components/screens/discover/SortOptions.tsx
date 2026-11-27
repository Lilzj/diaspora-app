// Discover: the sort chips, only for the orders the tab's server applies.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { sortOptionsFor, effectiveSort, SORT_LABELS } from '@/lib/platform/discover-filters';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface SortOptionsProps {
  filters: DiscoverFilters;
  search: DiscoverSearch;
}

export function SortOptions({ filters, search }: SortOptionsProps) {
  const { setSortBy, sortBy } = filters;
  const { activeTab } = search;

  return (
    <>
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Sort By</Text>
      <View className="flex-row mb-6">
        {sortOptionsFor(activeTab).map((option) => {
          const selected = effectiveSort(activeTab, sortBy) === option;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => setSortBy(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`px-4 py-2.5 rounded-full mr-2.5 ${
                          selected ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
            >
              <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-content-secondary'}`}>
                {SORT_LABELS[option]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}
