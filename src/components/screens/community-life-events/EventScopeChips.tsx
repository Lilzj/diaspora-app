// Community Life: whose events, and which ones, the tab shows.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { useNotification } from '@/providers/notification-provider';
import { ScrollView, TouchableOpacity, Text } from 'react-native';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';

interface EventScopeChipsProps {
  eventSearch: EventSearch;
  place: EventsPlace;
}

export function EventScopeChips({ eventSearch, place }: EventScopeChipsProps) {
  const { showAlert } = useNotification();
  const {
    eventScope, setEventScope, eventFree, setEventFree, eventSortBy, setEventSortBy,
  } = eventSearch;
  const { nearbyPoint, isSignedIn } = place;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
      {[
        { key: 'all' as const, label: 'All Events', available: true },
        { key: 'nearby' as const, label: '📍 Nearby', available: nearbyPoint !== null },
        { key: 'communities' as const, label: '👥 My communities', available: isSignedIn },
      ]
        .filter((chip) => chip.key !== 'communities' || chip.available)
        .map((chip) => {
          const isSelected = eventScope === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              testID={`events-scope-${chip.key}`}
              onPress={() => {
                if (!chip.available) {
                  showAlert({
                    type: 'info',
                    title: 'Nearby needs your location',
                    message:
                      'Choose your area or allow location for Diaspora, and events near you will show here.',
                  });
                  return;
                }
                setEventScope(chip.key);
                if (chip.key !== 'nearby' && eventSortBy === 'nearest') setEventSortBy('date');
              }}
              accessibilityRole="button"
              // Not `disabled`: TouchableOpacity takes that as its own
              // `disabled`, and the tap that says why would never run.
              accessibilityState={{ selected: isSelected }}
              accessibilityHint={chip.available ? undefined : 'Needs your location'}
              className={`px-4 py-2 rounded-full mr-2 border ${
                          isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
                        }`}
            >
              <Text
                className={`text-xs font-bold ${
                            isSelected ? 'text-white' : chip.available ? 'text-content-secondary' : 'text-content-faint'
                          }`}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      <TouchableOpacity
        testID="events-free"
        onPress={() => setEventFree((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ selected: eventFree }}
        className={`px-4 py-2 rounded-full mr-2 border ${
                    eventFree ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
                  }`}
      >
        <Text className={`text-xs font-bold ${eventFree ? 'text-white' : 'text-content-secondary'}`}>
          💰 Free
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
