// Discover: the header. The place and map toggle, the search box, and what a search sentence
// from Home was read as. Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { describeSentence } from '@/lib/platform/search-sentence';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { DiscoverPlaceHeader } from '@/components/explore/DiscoverPlaceHeader';
import { useThemeTokens } from '@/design-system';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

interface DiscoverHeaderProps {
  search: DiscoverSearch;
  view: DiscoverView;
}

export function DiscoverHeader({ search, view }: DiscoverHeaderProps) {
  const tokens = useThemeTokens();
  const {
    activeLocation, sentence, searchQuery, setSearchQuery, activeTab, clearSentence,
  } = search;
  const { setIsLocationSelectorOpen, setIsFilterModalOpen, isMapView, setIsMapView } = view;

  return (
    <View className="bg-surface-card border-b border-faint px-6 py-4 shadow-sm shadow-neutral-100">
      
      {/* Top Header Location & Toggle */}
      <DiscoverPlaceHeader
        location={activeLocation}
        isMapView={isMapView}
        onOpenPlace={() => setIsLocationSelectorOpen(true)}
        onToggleMap={() => setIsMapView(!isMapView)}
      />

      {/* Universal Search Input */}
      {/* Spotlight target for the jobs, housing and marketplace tours. The
          three of them run on this screen with a different `?tab=`, so the
          anchors are the screen's own controls rather than one per vertical. */}
      <TourSpotlight spotlightKey="discover_search">
      <View className="flex-row items-center h-14 bg-surface-background border border-subtle rounded-2xl px-4">
        <Text className="text-lg mr-3 text-content-faint">🔍</Text>
        <TextInput
          placeholder={`Search ${activeTab.toLowerCase()} near you...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          className="flex-1 text-sm font-semibold text-content-strong h-full"
          placeholderTextColor={tokens.color.text.placeholder}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1 mr-1">
            <Text className="text-xs text-content-muted">✕</Text>
          </TouchableOpacity>
        ) : null}
        <TourSpotlight spotlightKey="discover_filters">
          <TouchableOpacity
            onPress={() => setIsFilterModalOpen(true)}
            className="border-l border-subtle pl-3 py-1"
          >
            <Text className="text-lg">🎛️</Text>
          </TouchableOpacity>
        </TourSpotlight>
      </View>
      </TourSpotlight>

      {/* What a search sentence from Home was understood as (5 Nov 2026), so a
          wrong reading can be seen and cleared. */}
      {sentence ? (
        <View
          testID="discover-sentence"
          className="flex-row items-center mt-3 px-3 py-2 rounded-xl bg-surface-muted border border-subtle"
          accessibilityLiveRegion="polite"
        >
          <View className="flex-1">
            <Text className="text-[11px] text-content-muted" numberOfLines={1}>
              You searched “{sentence.said}”
            </Text>
            <Text className="text-xs font-bold text-content-strong" numberOfLines={2}>
              {describeSentence(sentence, activeLocation.countryCode)}
            </Text>
            {sentence.place?.kind === 'town' && sentence.place.source === 'google' ? (
              <Text className="text-[10px] text-content-faint mt-0.5">Place found with Google Maps</Text>
            ) : null}
          </View>
          {sentence.place?.kind === 'near-me-unknown' ? (
            <TouchableOpacity
              onPress={() => setIsLocationSelectorOpen(true)}
              accessibilityRole="button"
              className="pl-3 py-1"
            >
              <Text className="text-xs font-bold text-primary-600">Set location</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={clearSentence}
            accessibilityRole="button"
            accessibilityLabel="Clear this search"
            className="pl-3 py-1"
          >
            <Text className="text-xs font-bold text-primary-600">Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
