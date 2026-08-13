import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { SeasonalContent } from '@/types/country';
import type { GuideSummary } from '@/types/guide';
import { router } from 'expo-router';

interface SeasonalSectionProps {
  seasonal: SeasonalContent;
  guides: GuideSummary[];
}

export function SeasonalSection({ seasonal, guides }: SeasonalSectionProps) {
  return (
    <View className="bg-primary-50 rounded-2xl p-4 mx-6 mb-4">
      <View className="flex-row items-center mb-2">
        <Text className="text-lg mr-2">📅</Text>
        <Text className="text-base font-semibold text-content-primary">{seasonal.title}</Text>
      </View>
      <Text className="text-sm text-content-tertiary mb-3">{seasonal.description}</Text>
      {guides.map((guide) => (
        <TouchableOpacity
          key={guide.guideId}
          onPress={() => router.push(`/guide/${guide.guideId}`)}
          className="flex-row items-center py-2 border-b border-primary-100"
        >
          <Text className="text-xs text-primary-600 mr-2">•</Text>
          <Text className="text-sm text-content-strong flex-1" numberOfLines={1}>
            {guide.title}
          </Text>
          <Text className="text-xs text-content-faint">{guide.readingTimeMinutes} min</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
