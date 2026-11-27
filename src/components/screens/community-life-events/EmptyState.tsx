// Community Life: what a tab shows when it has nothing to list.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Reusable Empty State helper
export function EmptyState({ title, desc, actionText, onPressAction }: { title: string; desc: string; actionText: string; onPressAction: () => void }) {
  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-10 shadow-sm mt-2">
      <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
      <Text className="text-base font-extrabold text-content-strong mt-3">{title}</Text>
      <Text className="text-xs text-content-muted mt-1 text-center leading-relaxed max-w-[220px]">
        {desc}
      </Text>
      <TouchableOpacity
        onPress={onPressAction}
        className="bg-primary-500 px-5 py-2.5 rounded-full mt-5"
      >
        <Text className="text-white font-bold text-xs">{actionText}</Text>
      </TouchableOpacity>
    </View>
  );
}
