import React from 'react';
import { View, Text } from 'react-native';

interface NearbyIndicatorProps {
  distanceKm?: number | null;
  className?: string;
}

export function NearbyIndicator({ distanceKm, className = '' }: NearbyIndicatorProps) {
  if (distanceKm === undefined || distanceKm === null || isNaN(distanceKm)) {
    return null;
  }

  // Only render if within 2.0 km
  if (distanceKm > 2.0) {
    return null;
  }

  const isNeighborhood = distanceKm <= 0.6;

  return (
    <View
      className={`flex-row items-center bg-surface-muted px-2 py-0.5 rounded border border-success-default/20 ${className}`}
    >
      <View className="w-1.5 h-1.5 bg-success-default rounded-full mr-1.5 animate-pulse" />
      <Text className="text-[9px] font-black text-success-default uppercase tracking-wider">
        {isNeighborhood ? 'In Your Neighborhood' : 'Nearby'}
      </Text>
    </View>
  );
}
export default NearbyIndicator;
