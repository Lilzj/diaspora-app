import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { locationLabel, type PlatformLocation } from '@/store/location';

/**
 * The top row of Discover: the place being explored, and the map switch.
 *
 * The place is said once, on one line. It used to read "Explore Grand Baie,
 * Mauritius · Grand Baie ▾", and because neither part could shrink, the Map
 * View pill was squeezed against the screen edge. Now the place gives way
 * (ellipsised) and the pill keeps its width.
 */
export function DiscoverPlaceHeader({
  location,
  isMapView,
  onOpenPlace,
  onToggleMap,
}: {
  location: PlatformLocation;
  isMapView: boolean;
  onOpenPlace: () => void;
  onToggleMap: () => void;
}) {
  const label = locationLabel(location);

  return (
    <View className="flex-row items-center justify-between mb-4">
      <TourSpotlight spotlightKey="neighborhood_pin" style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <TouchableOpacity
          onPress={onOpenPlace}
          className="flex-row items-center"
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Change place: ${label}`}
        >
          <Text numberOfLines={1} className="flex-shrink text-base font-extrabold text-content-primary">
            📍 {label}
          </Text>
          {/* The chevron is what says the place opens the location sheet. */}
          <Text className="text-xs text-content-muted font-bold ml-1">▾</Text>
        </TouchableOpacity>
      </TourSpotlight>

      <TouchableOpacity
        onPress={onToggleMap}
        className="shrink-0 bg-surface-background px-3 py-1.5 rounded-full border border-subtle"
      >
        <Text className="text-xs font-bold text-content-secondary">
          {isMapView ? '🗺️ List View' : '📍 Map View'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
