// Community Life: the four tabs.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import type { EventsTabs } from '@/components/screens/community-life-events/useEventsTabs';

interface EventsTabBarProps {
  tabs: EventsTabs;
}

export function EventsTabBar({ tabs }: EventsTabBarProps) {
  const { activeTab, setActiveTab } = tabs;

  return (
    <View className="bg-surface-card border-b border-faint flex-row px-4 justify-between">
      {([
        { key: 'events', label: 'Events', icon: '🎉' },
        { key: 'directory', label: 'Directory', icon: '🏛' },
        { key: 'calendar', label: 'Calendar', icon: '📅' },
        { key: 'saved', label: 'Saved', icon: '⭐' },
      ] as const).map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`flex-row items-center py-3.5 px-3 border-b-2 ${
                isActive ? 'border-primary-500' : 'border-transparent'
              }`}
          >
            <Text className="text-sm mr-1.5">{tab.icon}</Text>
            <Text
              className={`text-xs font-black ${
                  isActive ? 'text-primary-500' : 'text-content-muted'
                }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
