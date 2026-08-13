import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlatformLocation } from '@/store/location';

interface LocationChipProps {
  location: PlatformLocation;
  onPress: () => void;
  variant?: 'header' | 'inline' | 'filled';
}

export function LocationChip({
  location,
  onPress,
  variant = 'filled',
}: LocationChipProps) {
  const isFilled = variant === 'filled';
  const isHeader = variant === 'header';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`flex-row items-center rounded-full px-4 py-2 border ${
        isFilled
          ? 'bg-surface-muted border-subtle'
          : isHeader
          ? 'bg-surface-card border-faint shadow-sm shadow-neutral-100/50'
          : 'bg-transparent border-subtle'
      }`}
    >
      <Text className="text-base mr-1.5">{location.flag}</Text>
      <View className="flex-row items-center">
        <Text className="text-xs font-black text-content-primary">
          {location.neighborhood}
        </Text>
        <Text className="text-[10px] font-bold text-content-faint ml-1">
          · {location.cityName}
        </Text>
      </View>
      <Ionicons
        name="chevron-down"
        size={12}
        color="#9CA3AF"
        className="ml-2 mt-0.5"
      />
    </TouchableOpacity>
  );
}
