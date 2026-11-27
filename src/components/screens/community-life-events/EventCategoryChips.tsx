// Community Life: the event categories.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { ScrollView, TouchableOpacity, Text } from 'react-native';
import type { EventCategory } from '@/types/community-life';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';

const EVENT_CATEGORIES: EventCategory[] = [
  'Wedding', 'Naming Ceremony', 'Birthday', 'Graduation', 'Football Match',
  'Basketball', 'Concert', 'Comedy Show', 'Networking', 'Career Fair', 'Job Fair',
  'Business Seminar', 'Conference', 'Training', 'Workshop', 'Church Program',
  'Mosque Event', 'Bible Study', 'Prayer Meeting', 'Youth Program', 'Cultural Festival',
  'Independence Celebration', 'Food Festival', 'Picnic', 'Volunteer Activity',
  'Charity Event', 'Embassy Event', 'Student Orientation', 'Other'
];

interface EventCategoryChipsProps {
  eventSearch: EventSearch;
}

export function EventCategoryChips({ eventSearch }: EventCategoryChipsProps) {
  const { selectedEventCat, setSelectedEventCat } = eventSearch;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 pb-1">
      <TouchableOpacity
        onPress={() => setSelectedEventCat('All')}
        className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                    selectedEventCat === 'All' ? 'bg-surface-muted border border-primary-300' : 'bg-surface-muted'
                  }`}
      >
        <Text className={`text-[11px] font-bold ${selectedEventCat === 'All' ? 'text-primary-500' : 'text-content-tertiary'}`}>
          All Categories
        </Text>
      </TouchableOpacity>
      {EVENT_CATEGORIES.map((cat) => {
        const isSelected = selectedEventCat === cat;
        return (
          <TouchableOpacity
            key={cat}
            onPress={() => setSelectedEventCat(cat)}
            className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                        isSelected ? 'bg-surface-muted border border-primary-300' : 'bg-surface-muted'
                      }`}
          >
            <Text className={`text-[11px] font-bold ${isSelected ? 'text-primary-500' : 'text-content-tertiary'}`}>
              {cat}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
