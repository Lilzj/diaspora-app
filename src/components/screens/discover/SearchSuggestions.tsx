// Discover: recent and popular searches, shown only when there are some.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface SearchSuggestionsProps {
  search: DiscoverSearch;
}

export function SearchSuggestions({ search }: SearchSuggestionsProps) {
  const { recentSearches, suggestions, handleSuggestionPress, clearRecent } = search;

  return (
    <View className="bg-surface-card p-6 border-b border-faint mb-3">
      {recentSearches.length > 0 && (
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Recent Searches</Text>
            <TouchableOpacity onPress={clearRecent}>
              <Text className="text-xs font-semibold text-content-faint">Clear</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row flex-wrap">
            {recentSearches.map((term, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => handleSuggestionPress(term)}
                className="bg-surface-background border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
              >
                <Text className="text-xs text-content-tertiary font-semibold">🕒 {term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {suggestions.length > 0 && (
        <>
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Popular Searches</Text>
          <View className="flex-row flex-wrap">
            {suggestions.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSuggestionPress(item)}
                className="bg-surface-background border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
              >
                <Text className="text-xs text-content-secondary font-semibold">{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
