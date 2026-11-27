// Discover: the row of tabs.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { ScrollView, TouchableOpacity, Text } from 'react-native';
import { DISCOVER_TABS } from '@/components/screens/discover/tabs';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface DiscoverTabRowProps {
  search: DiscoverSearch;
}

export function DiscoverTabRow({ search }: DiscoverTabRowProps) {
  const { setSelectedCategory, activeTab, setActiveTab } = search;

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      className="bg-surface-card border-b border-faint mb-2 max-h-[50px]"
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      {DISCOVER_TABS.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => {
              setActiveTab(tab);
              setSelectedCategory(null);
            }}
            className={`items-center justify-center py-3 px-4 border-b-2 ${
                  isActive ? 'border-primary-500' : 'border-transparent'
                }`}
          >
            <Text
              className={`text-sm font-extrabold ${
                    isActive ? 'text-primary-500' : 'text-content-muted'
                  }`}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
