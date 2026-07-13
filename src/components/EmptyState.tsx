import React from 'react';
import { View, Text } from 'react-native';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="text-6xl mb-6">{icon}</Text>
      <Text className="text-xl font-bold text-neutral-900 text-center mb-2">{title}</Text>
      {description && (
        <Text className="text-base text-neutral-500 text-center mb-6 leading-relaxed">
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}
