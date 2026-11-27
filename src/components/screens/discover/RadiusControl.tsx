// Discover: how far the search reaches, and the sentence that says so.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { describeDiscoverScope, tabSearchesByDistance } from '@/lib/domain/discover-scope';
import { RadiusSlider } from '@/components/RadiusSlider';
import { TourSpotlight } from '@/components/explore/TourProvider';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';
import type { DiscoverView } from '@/components/screens/discover/useDiscoverView';

interface RadiusControlProps {
  search: DiscoverSearch;
  view: DiscoverView;
}

export function RadiusControl({ search, view }: RadiusControlProps) {
  const { searchRadius, scope, scopeCountryName, activeTab, changeRadius, sentenceRadius } = search;
  const { setIsLocationSelectorOpen } = view;

  return (
    <TourSpotlight spotlightKey="proximity_radius_slider" style={{ width: '100%' }}>
      <View className="bg-surface-card py-3 border-b border-faint mb-2">
        <RadiusSlider
          value={sentenceRadius ?? searchRadius}
          onChange={changeRadius}
        />
        <Text className="px-6 text-xs font-semibold text-content-muted" accessibilityLiveRegion="polite">
          {describeDiscoverScope(scope, activeTab, scopeCountryName)}
        </Text>
        {searchRadius > 0 && scope.kind !== 'distance' && tabSearchesByDistance(activeTab) ? (
          <TouchableOpacity onPress={() => setIsLocationSelectorOpen(true)} className="px-6 mt-1">
            <Text className="text-xs font-bold text-primary-600">
              Set your location to search by distance
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TourSpotlight>
  );
}
