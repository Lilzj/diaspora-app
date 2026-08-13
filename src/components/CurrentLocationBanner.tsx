import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlatformLocation } from '@/store/location';

interface CurrentLocationBannerProps {
  location: PlatformLocation;
  travelMode: boolean;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
  onActionPress: () => void;
}

export function CurrentLocationBanner({
  location,
  travelMode,
  permissionStatus,
  onActionPress,
}: CurrentLocationBannerProps) {
  if (travelMode) {
    return (
      <View className="mx-6 my-2 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-3">
          <View className="bg-amber-100 p-2 rounded-xl mr-3">
            <Ionicons name="airplane" size={18} color="#D97706" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-black text-amber-800 uppercase tracking-wider">
              Travel Mode Enabled
            </Text>
            <Text className="text-xs font-bold text-amber-600 mt-0.5 leading-snug">
              Showing resources near {location.neighborhood}, {location.cityName}.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onActionPress}
          className="bg-amber-600 px-3.5 py-2 rounded-xl active:bg-amber-700"
        >
          <Text className="text-white font-extrabold text-[10px] uppercase">
            Change
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <View className="mx-6 my-2 bg-neutral-150/40 border border-neutral-250 rounded-2xl p-4 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-3">
          <View className="bg-surface-muted p-2 rounded-xl mr-3">
            <Ionicons name="location-outline" size={18} color="#6B7280" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-black text-content-strong uppercase tracking-wider">
              GPS Access Disabled
            </Text>
            <Text className="text-xs font-bold text-content-muted mt-0.5 leading-snug">
              Using manual fallback: {location.neighborhood}, {location.cityName}.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onActionPress}
          className="bg-neutral-800 px-3.5 py-2 rounded-xl active:bg-neutral-900"
        >
          <Text className="text-white font-extrabold text-[10px] uppercase">
            Enable
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}
export default CurrentLocationBanner;
