import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface CategoryChipProps {
  label: string;
  icon?: string;
  isSelected?: boolean;
  onPress?: () => void;
}

export function CategoryChip({ label, icon, isSelected, onPress }: CategoryChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-center px-4 py-2 rounded-full mr-2 mb-2 ${
        isSelected ? 'bg-neutral-900' : 'bg-neutral-100'
      }`}
    >
      {icon && <Text className="mr-1.5 text-base">{icon}</Text>}
      <Text
        className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-neutral-700'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface CategoryCircleProps {
  label: string;
  icon: string;
  onPress?: () => void;
}

export function CategoryCircle({ label, icon, onPress }: CategoryCircleProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="items-center w-[72px] mr-3">
      <View className="w-16 h-16 rounded-full bg-primary-50 items-center justify-center mb-2">
        <Text className="text-2xl">{icon}</Text>
      </View>
      <Text className="text-xs text-neutral-700 text-center font-medium" numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
