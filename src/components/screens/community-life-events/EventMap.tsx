// Community Life: the events on a map.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';

interface EventMapProps {
  eventSearch: EventSearch;
  lists: CommunityLifeLists;
}

export function EventMap({ eventSearch, lists }: EventMapProps) {
  const { selectedMapEvent, setSelectedMapEvent } = eventSearch;
  const { eventsList } = lists;

  return (
    <View className="mb-4">
      <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm relative overflow-hidden h-[340px]">
        {/* Simulated vector map blocks */}
        <View className="absolute inset-0 bg-surface-muted">
          <Svg height="100%" width="100%">
            {/* River */}
            <Path d="M0,150 Q100,120 200,180 T400,160 L400,240 Q300,220 200,240 T0,200 Z" fill="#A5C9EB" />
            {/* Grid Roads */}
            <Rect x="50" y="0" width="10" height="340" fill="#FFFFFF" />
            <Rect x="200" y="0" width="12" height="340" fill="#FFFFFF" />
            <Rect x="320" y="0" width="8" height="340" fill="#FFFFFF" />
            <Rect x="0" y="100" width="400" height="10" fill="#FFFFFF" />
            <Rect x="0" y="260" width="400" height="12" fill="#FFFFFF" />
            
            {/* Park Block */}
            <Rect x="75" y="20" width="100" height="60" rx="10" fill="#C5E8C5" />
            <Text style={{ position: 'absolute', top: 40, left: 95 }} className="text-[10px] font-black text-content-muted uppercase tracking-widest">Green Park</Text>
          </Svg>
        </View>

        {/* Interactive Marker Pins */}
        {eventsList.map((item, idx) => {
          const positions = [
            { top: 50, left: 60 },
            { top: 140, left: 180 },
            { top: 70, left: 280 },
            { top: 220, left: 90 },
            { top: 280, left: 240 }
          ];
          const pos = positions[idx % positions.length];
          const isSelected = selectedMapEvent?.id === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => setSelectedMapEvent(item)}
              className="absolute w-8 h-8 items-center justify-center"
              style={{ top: pos.top, left: pos.left }}
            >
              <Ionicons
                name="pin"
                size={isSelected ? 32 : 24}
                color={isSelected ? '#EF4444' : '#F59300'}
              />
            </TouchableOpacity>
          );
        })}

        {/* Callout Overlay */}
        {selectedMapEvent && (
          <View className="absolute bottom-4 left-4 right-4 bg-surface-card/95 rounded-2xl p-3 border border-subtle shadow-xl flex-row items-center">
            <View className="flex-1 mr-2">
              <Text className="text-[8px] font-black text-primary-500 uppercase tracking-widest">{selectedMapEvent.category}</Text>
              <Text className="text-xs font-black text-content-primary leading-tight mt-0.5" numberOfLines={1}>{selectedMapEvent.title}</Text>
              <Text className="text-[9px] text-content-muted font-bold mt-0.5">📍 {selectedMapEvent.location.areaName} · {selectedMapEvent.date}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/community-life/event/${selectedMapEvent.id}`)}
              className="bg-primary-500 px-3.5 py-2 rounded-xl"
            >
              <Text className="text-white font-black text-[10px]">DETAILS</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text className="text-[10px] text-content-faint font-bold text-center">Tap red markers to view event callouts</Text>
    </View>
  );
}
