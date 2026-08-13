import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistance, getCommuteTimeEstimate } from '@/utils/geo';

interface DistanceBadgeProps {
  distanceKm?: number | null;
  showCommuteTime?: boolean;
  commuteMode?: 'walk' | 'drive' | 'transit';
  className?: string;
}

export function DistanceBadge({
  distanceKm,
  showCommuteTime = false,
  commuteMode = 'drive',
  className = '',
}: DistanceBadgeProps) {
  if (distanceKm === undefined || distanceKm === null || isNaN(distanceKm)) {
    return null;
  }

  const formattedDistance = formatDistance(distanceKm);
  const isClose = distanceKm < 1.0;
  const isVeryClose = distanceKm < 0.3;

  const getBadgeColor = () => {
    if (isVeryClose) return 'bg-success-surface text-success-default border-success-default/20';
    if (isClose) return 'bg-primary-50 text-primary-600 border-primary-100';
    return 'bg-surface-background text-content-muted border-subtle';
  };

  const badgeStyles = getBadgeColor();

  return (
    <View className={`flex-row items-center flex-wrap gap-1.5 ${className}`}>
      <View
        className={`flex-row items-center px-2 py-0.5 rounded border ${badgeStyles}`}
      >
        <Text className="text-[10px] font-black tracking-wide uppercase">
          📍 {formattedDistance}
        </Text>
      </View>
      {showCommuteTime && distanceKm > 0 && (
        <View className="flex-row items-center bg-surface-background px-2 py-0.5 rounded border border-neutral-250">
          <Ionicons
            name={commuteMode === 'walk' ? 'walk' : commuteMode === 'transit' ? 'bus' : 'car'}
            size={10}
            color="#6B7280"
          />
          <Text className="text-[9px] font-bold text-content-muted ml-1">
            {getCommuteTimeEstimate(distanceKm, commuteMode)}
          </Text>
        </View>
      )}
    </View>
  );
}
