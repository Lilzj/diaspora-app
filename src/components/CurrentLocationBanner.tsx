import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlatformLocation, locationLabel } from '@/store/location';

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
              Showing resources near {locationLabel(location)}.
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
      <View className="mx-6 my-2 bg-surface-muted/40 border border-subtle rounded-2xl p-4 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-3">
          <View className="bg-surface-muted p-2 rounded-xl mr-3">
            <Ionicons name="location-outline" size={18} color="#6B7280" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-black text-content-strong uppercase tracking-wider">
              GPS Access Disabled
            </Text>
            {/* ── Both strings were built inline ──────────────────────────
                This read `{neighborhood}, {cityName}`, and with a
                country-precision location — the state a member is in before
                they have chosen a place or been located — both are empty. The
                banner rendered the literal ", ." after "Using manual fallback:".

                "Manual fallback" was also the wrong words for what is showing:
                nobody entered it manually. It is the country of residence the
                member gave at registration, which is why the sentence now names
                it. ── */}
            <Text className="text-xs font-bold text-content-muted mt-0.5 leading-snug">
              {location.countryCode
                ? `Showing results across ${locationLabel(location)}. Set a place for closer matches.`
                : 'Set your location to see what is near you.'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onActionPress}
          className="bg-surface-inverse px-3.5 py-2 rounded-xl active:bg-surface-inverse"
        >
          <Text className="text-content-inverse font-extrabold text-[10px] uppercase">
            Enable
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}
export default CurrentLocationBanner;
