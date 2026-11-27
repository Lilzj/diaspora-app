// Discover: the inline map preview and the way into the full map.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { router } from 'expo-router';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import type { DiscoveryCategory } from '@/types/maps';
import type { DiscoverTab } from '@/components/screens/discover/tabs';
import type { MapPins } from '@/components/screens/discover/useMapPins';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

/**
 * Frontend Phase 8. Which map category each Discover tab opens onto.
 *
 * Guides and Updates map to `guide` and `alert` respectively — a community
 * update *is* a community alert on the map, translated rather than duplicated
 * (§27). `Community` opens on events, which is what that tab is mostly about.
 */
const DISCOVER_TAB_TO_MAP_CATEGORY: Record<DiscoverTab, DiscoveryCategory> = {
  Providers: 'provider',
  Jobs: 'job',
  Housing: 'housing',
  Marketplace: 'marketplace',
  Guides: 'guide',
  Updates: 'alert',
  Community: 'event',
};

interface MapPreviewProps {
  map: MapPins;
  search: DiscoverSearch;
}

export function MapPreview({ map, search }: MapPreviewProps) {
  const { mapPins } = map;
  const { activeLocation, searchRadius, activeTab } = search;

  return (
    <View className="px-6 my-4">
      <MapPreviewCard
        center={activeLocation}
        pins={mapPins}
        radiusKm={searchRadius}
      />

      {/*
        Frontend Phase 8. The inline preview above stays as it is — it is
        a glanceable summary of the results already on this screen, and
        replacing it would be a regression for the common case.

        This is the entry into the full map: pan, zoom, clustering,
        viewport search, layers, alerts and directions. It carries the
        active tab across so the map opens on what the member was already
        looking at, rather than resetting their filters.
      */}
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: '/map',
            params: { category: DISCOVER_TAB_TO_MAP_CATEGORY[activeTab] ?? 'housing' },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Open the full map, with pan, zoom, filters and directions"
        className="flex-row items-center justify-center bg-primary-500 py-3.5 rounded-2xl active:bg-primary-600"
      >
        <Text className="text-white text-[11px] font-black uppercase tracking-wider">
          Open the full map
        </Text>
      </TouchableOpacity>
    </View>
  );
}
