// Community Life: the banner that says the screen is not refreshing while offline.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';

interface OfflineBannerProps {
  lists: CommunityLifeLists;
}

export function OfflineBanner({ lists }: OfflineBannerProps) {
  const { isRetrying, handleRetryConnection } = lists;

  return (
    <View className="bg-amber-500 px-6 py-2 flex-row justify-between items-center z-20">
      <View className="flex-row items-center">
        <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" className="mr-2" />
        {/*
          Was "Offline Mode (Using Cached Data)". There is no cache: the
          lists live in `useState` and are empty on a cold start. The banner
          now says what is actually true — the screen is not refreshing —
          rather than vouching for data that may not exist.
        */}
        <Text className="text-white text-xs font-bold">Offline — this screen is not refreshing</Text>
      </View>
      <TouchableOpacity
        onPress={handleRetryConnection}
        className="bg-surface-card/20 px-3 py-1 rounded-lg"
        disabled={isRetrying}
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text className="text-white text-[10px] font-black uppercase">Retry</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
