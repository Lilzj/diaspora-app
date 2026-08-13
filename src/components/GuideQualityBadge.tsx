import React from 'react';
import { View, Text } from 'react-native';
import type { QualityLabel } from '@/types/guide';

const CONFIG: Record<QualityLabel, { color: string; bg: string; dots: number }> = {
  Excellent: { color: 'text-success-default', bg: 'bg-success-surface', dots: 5 },
  VeryGood: { color: 'text-info-default', bg: 'bg-info-surface', dots: 4 },
  Good: { color: 'text-warning-default', bg: 'bg-warning-surface', dots: 3 },
  NeedsUpdate: { color: 'text-content-muted', bg: 'bg-surface-muted', dots: 2 },
};

const LABEL_TEXT: Record<QualityLabel, string> = {
  Excellent: 'Excellent',
  VeryGood: 'Very Good',
  Good: 'Good',
  NeedsUpdate: 'Needs Update',
};

interface GuideQualityBadgeProps {
  label: QualityLabel;
  size?: 'sm' | 'md';
}

export function GuideQualityBadge({ label, size = 'sm' }: GuideQualityBadgeProps) {
  const config = CONFIG[label];

  return (
    <View className={`flex-row items-center ${config.bg} rounded-full ${size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
      <Text className={`${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium ${config.color}`}>
        {LABEL_TEXT[label]}
      </Text>
      <View className="flex-row ml-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <View
            key={i}
            className={`${size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'} rounded-full mx-px ${
              i < config.dots ? (label === 'Excellent' ? 'bg-success-default' : label === 'VeryGood' ? 'bg-info-default' : label === 'Good' ? 'bg-warning-default' : 'bg-neutral-400') : 'bg-neutral-200'
            }`}
          />
        ))}
      </View>
    </View>
  );
}
