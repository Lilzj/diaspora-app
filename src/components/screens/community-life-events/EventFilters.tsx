// Community Life: how far, how soon, and in what order.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { EVENT_RADII_KM } from '@/lib/domain/events-nearby';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';

interface EventFiltersProps {
  eventSearch: EventSearch;
}

export function EventFilters({ eventSearch }: EventFiltersProps) {
  const {
    eventScope, eventRadiusKm, setEventRadiusKm, eventTimeFilter, setEventTimeFilter, eventSortBy,
    setEventSortBy,
  } = eventSearch;

  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3 gap-3">
      {/* How far, when the list is the circle around the member */}
      {eventScope === 'nearby' ? (
        <View className="flex-row justify-between items-center border-b border-faint pb-2.5">
          <Text className="text-[10px] font-black text-content-muted uppercase">Within</Text>
          <View className="flex-row gap-1.5">
            {EVENT_RADII_KM.map((radius) => (
              <TouchableOpacity
                key={radius}
                onPress={() => setEventRadiusKm(radius)}
                accessibilityRole="button"
                accessibilityState={{ selected: eventRadiusKm === radius }}
                className={`px-2 py-1 rounded-lg border ${
                            eventRadiusKm === radius ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
                          }`}
              >
                <Text className={`text-[9px] font-black ${
                            eventRadiusKm === radius ? 'text-primary-500' : 'text-content-tertiary'
                          }`}>{radius} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Sort — Nearest only when there is a point to measure from */}
      <View className="flex-row justify-between items-center">
        <Text className="text-[10px] font-black text-content-muted uppercase">Sort</Text>
        <View className="flex-row gap-1.5">
          {[
            { key: 'date' as const, label: 'Soonest' },
            ...(eventScope === 'nearby' ? [{ key: 'nearest' as const, label: 'Nearest' }] : []),
            { key: 'popular' as const, label: 'Popular' },
            { key: 'recently_added' as const, label: 'Newest' },
          ].map(s => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setEventSortBy(s.key)}
              className={`px-2 py-1 rounded-lg border ${
                          eventSortBy === s.key ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
            >
              <Text className={`text-[9px] font-black ${
                          eventSortBy === s.key ? 'text-primary-500' : 'text-content-tertiary'
                        }`}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Time filter — sent as an explicit start window, not a bucket */}
      <View className="flex-row justify-between items-center border-t border-faint pt-2.5">
        <Text className="text-[10px] font-black text-content-muted uppercase">Timing</Text>
        <View className="flex-row gap-1.5">
          {[
            { key: 'all' as const, label: 'Anytime' },
            { key: 'today' as const, label: 'Today' },
            { key: 'tomorrow' as const, label: 'Tomorrow' },
            { key: 'weekend' as const, label: 'Weekend' }
          ].map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setEventTimeFilter(t.key)}
              className={`px-2 py-1 rounded-lg border ${
                          eventTimeFilter === t.key ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
            >
              <Text className={`text-[9px] font-black ${
                          eventTimeFilter === t.key ? 'text-primary-500' : 'text-content-tertiary'
                        }`}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
