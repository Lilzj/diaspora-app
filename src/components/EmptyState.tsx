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
      {/* The emoji restates the title, so a screen reader that announced it
          would read the same idea twice — once as an emoji name. */}
      <Text className="text-6xl mb-6" accessibilityElementsHidden importantForAccessibility="no">
        {icon}
      </Text>
      <Text className="text-xl font-bold text-content-primary text-center mb-2" accessibilityRole="header">
        {title}
      </Text>
      {description && (
        <Text className="text-base text-content-muted text-center mb-6 leading-relaxed">
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}
