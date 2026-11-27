// Community Life: the header, with the place the screen is looking at.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useThemeTokens } from '@/design-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { backOr } from '@/lib/platform/navigation';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';

interface EventsHeaderProps {
  place: EventsPlace;
}

export function EventsHeader({ place }: EventsHeaderProps) {
  const tokens = useThemeTokens();
  const { selectedLocation, placeName, setIsLocationModalOpen } = place;

  return (
    <View className="bg-surface-card border-b border-faint px-6 py-4 flex-row items-center justify-between shadow-sm z-10">
      <View className="flex-row items-center">
        <TouchableOpacity onPress={() => backOr()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-black text-content-primary tracking-tight">Community Life</Text>
          {/* Location Switcher */}
          <TouchableOpacity
            onPress={() => setIsLocationModalOpen(true)}
            className="flex-row items-center mt-0.5"
            activeOpacity={0.7}
          >
            <Text className="text-xs font-bold text-primary-500 mr-1">
              📍 {placeName} {selectedLocation.flag}
            </Text>
            <Ionicons name="chevron-down" size={12} color="#F59300" />
          </TouchableOpacity>
        </View>
      </View>

      {/*
        The offline simulator that used to sit here is gone.

        It was a header button reading "🔌 OFFLINE" / "⚡ ONLINE" that flipped
        a local boolean, and it shipped to members. Pressing it did not
        disconnect anything — it swapped three live fetches for fixture arrays
        and raised a banner claiming the fixtures were the member's cached
        data. A control that fakes the one condition a member most needs
        reported accurately has no member-facing purpose; offline is now
        observed rather than chosen.
      */}
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => router.push('/create')}
          className="bg-primary-500 p-2.5 rounded-full items-center justify-center shadow-md"
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
