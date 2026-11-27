// Community Life: the Events tab's search box and list or map toggle.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import { useThemeTokens } from '@/design-system';
import { Ionicons } from '@expo/vector-icons';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';

interface EventSearchBarProps {
  eventSearch: EventSearch;
  place: EventsPlace;
}

export function EventSearchBar({ eventSearch, place }: EventSearchBarProps) {
  const tokens = useThemeTokens();
  const { eventQuery, setEventQuery, setViewMode, viewMode, setSelectedMapEvent } = eventSearch;
  const { placeName } = place;

  return (
    <View className="flex-row gap-3 mb-4">
      <View className="flex-1 flex-row bg-surface-card border border-subtle h-12 rounded-2xl px-4 items-center shadow-sm">
        <Ionicons name="search-outline" size={18} color="#9CA3AF" className="mr-2" />
        <TextInput
          placeholder={`Search events in ${placeName}...`}
          value={eventQuery}
          onChangeText={setEventQuery}
          className="flex-1 text-xs font-semibold text-content-strong"
          placeholderTextColor={tokens.color.text.placeholder}
        />
      </View>
      
      {/* View Toggles */}
      <TouchableOpacity
        onPress={() => {
          setViewMode(viewMode === 'list' ? 'map' : 'list');
          setSelectedMapEvent(null);
        }}
        className="bg-surface-card border border-subtle w-12 h-12 rounded-2xl items-center justify-center shadow-sm"
      >
        <Ionicons name={viewMode === 'list' ? 'map-outline' : 'list-outline'} size={20} color={tokens.color.text.secondary} />
      </TouchableOpacity>
    </View>
  );
}
