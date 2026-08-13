import React from 'react';
import { View, Text } from 'react-native';
import type { ReputationLevel } from '@/types/reputation';
import { REPUTATION_LEVEL_ICONS, REPUTATION_LEVEL_LABELS } from '@/types/reputation';

interface ReputationBadgeProps {
  level: ReputationLevel;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ReputationBadge({ level, size = 'sm', showLabel = true }: ReputationBadgeProps) {
  const icon = REPUTATION_LEVEL_ICONS[level];
  const label = REPUTATION_LEVEL_LABELS[level];

  const textSize = size === 'lg' ? 'text-sm' : size === 'md' ? 'text-xs' : 'text-[10px]';
  const iconSize = size === 'lg' ? 'text-base' : size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <View className="flex-row items-center">
      <Text className={iconSize}>{icon}</Text>
      {showLabel && (
        <Text className={`${textSize} font-medium text-content-secondary ml-1`}>
          {label}
        </Text>
      )}
    </View>
  );
}
