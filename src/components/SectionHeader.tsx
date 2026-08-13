import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface SectionHeaderProps {
  title: string;
  icon?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}

export function SectionHeader({ title, icon, onSeeAll, seeAllLabel = 'See all' }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-6 mb-3">
      <View className="flex-row items-center">
        {icon && <Text className="text-lg mr-2">{icon}</Text>}
        <Text className="text-lg font-semibold text-content-primary">{title}</Text>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll}>
          <Text className="text-sm text-primary-500 font-medium">{seeAllLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
