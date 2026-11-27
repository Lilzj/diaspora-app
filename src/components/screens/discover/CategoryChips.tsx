// Discover: the category chips for the tab in view.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { ScrollView, TouchableOpacity, Text } from 'react-native';
import type { DiscoverCategories } from '@/components/screens/discover/useDiscoverCategories';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface CategoryChipsProps {
  categories: DiscoverCategories;
  search: DiscoverSearch;
}

export function CategoryChips({ categories, search }: CategoryChipsProps) {
  const { categoryOptions } = categories;
  const { selectedCategory, setSelectedCategory } = search;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center' }}
      className="bg-surface-card border-b border-faint mb-2"
    >
      <TouchableOpacity
        onPress={() => setSelectedCategory(null)}
        className={`px-4 py-2 rounded-full mr-2.5 ${
                selectedCategory === null ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
              }`}
      >
        <Text className={`text-xs font-bold ${selectedCategory === null ? 'text-white' : 'text-content-secondary'}`}>
          All
        </Text>
      </TouchableOpacity>
      {/* ── Only the taxonomies that exist ─────────────────────────────
          Each of the four fixture taxonomies had ids that matched nothing
          on any route, so a chip filtered fabricated rows and would have
          been dropped silently against a real one. Providers and Guides
          have real catalogue routes and use them. Jobs and Marketplace
          have real routes with no client yet; Housing has no category
          route at all — its taxonomy is `accommodation-types` plus
          `amenities`, which are not a category list. Those three render no
          chips rather than dead ones. */}
      {categoryOptions.map((cat) => {
        const isSelected = selectedCategory === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategory(isSelected ? null : cat.id)}
            className={`flex-row items-center px-4 py-2 rounded-full mr-2.5 ${
                    isSelected ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                  }`}
          >
            {cat.icon ? <Text className="text-xs mr-1.5">{cat.icon}</Text> : null}
            <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
