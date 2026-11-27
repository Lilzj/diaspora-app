// Discover: the lister's origin country filter.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';

interface OriginCountryFilterProps {
  origin: OriginFilter;
}

export function OriginCountryFilter({ origin }: OriginCountryFilterProps) {
  const { selectedCountryCode, setSelectedCountryCode, availableCountries } = origin;

  return (
    <View className="mb-6">
      <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-3">
        Lister's Origin Country
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-row"
      >
        <TouchableOpacity
          onPress={() => setSelectedCountryCode(null)}
          className={`px-4 py-2.5 rounded-full mr-2 flex-row items-center border ${
                      selectedCountryCode === null
                        ? 'bg-primary-500 border-primary-500'
                        : 'bg-surface-background border-subtle'
                    }`}
        >
          <Text className={`text-xs font-bold ${selectedCountryCode === null ? 'text-white' : 'text-content-secondary'}`}>
            All Countries
          </Text>
        </TouchableOpacity>
        {availableCountries.map((c) => {
          const isSelected = selectedCountryCode === c.code;
          return (
            <TouchableOpacity
              key={c.code}
              onPress={() => setSelectedCountryCode(isSelected ? null : c.code)}
              className={`px-4 py-2.5 rounded-full mr-2 flex-row items-center border ${
                          isSelected
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-surface-background border-subtle'
                        }`}
            >
              <Text className="text-sm mr-1.5">{c.flag}</Text>
              <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                {c.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
