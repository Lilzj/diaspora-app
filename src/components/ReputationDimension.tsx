import React from 'react';
import { View, Text } from 'react-native';
import type { ReputationDimension } from '@/types/reputation';
import { DIMENSION_LABELS } from '@/types/reputation';

interface ReputationDimensionCardProps {
  dimension: ReputationDimension;
  score: number;
  maxScore: number;
  breakdown: Array<{ label: string; points: number }>;
}

export function ReputationDimensionCard({
  dimension,
  score,
  maxScore,
  breakdown,
}: ReputationDimensionCardProps) {
  const config = DIMENSION_LABELS[dimension];
  const progress = Math.min(score / Math.max(maxScore, 1), 1);

  const barColor =
    dimension === 'contribution'
      ? 'bg-primary-500'
      : dimension === 'verification'
      ? 'bg-secondary-500'
      : 'bg-info-default';

  return (
    <View className="bg-white rounded-xl p-4 mb-3" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Text className="text-lg mr-2">{config.icon}</Text>
          <Text className="text-base font-semibold text-neutral-900">{config.label}</Text>
        </View>
        <Text className="text-lg font-bold text-neutral-900">{score}</Text>
      </View>

      {/* Progress bar */}
      <View className="h-2 bg-neutral-100 rounded-full mb-3">
        <View
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${progress * 100}%` }}
        />
      </View>

      {/* Description */}
      <Text className="text-xs text-neutral-500 mb-3">{config.description}</Text>

      {/* Breakdown */}
      {breakdown.map((item, i) => (
        <View key={i} className="flex-row items-center justify-between py-1.5">
          <Text className="text-sm text-neutral-700">{item.label}</Text>
          <Text
            className={`text-sm font-medium ${
              item.points >= 0 ? 'text-neutral-900' : 'text-error-default'
            }`}
          >
            {item.points >= 0 ? '+' : ''}{item.points}
          </Text>
        </View>
      ))}

      {/* Trust warning */}
      {dimension === 'trust' && (
        <View className="mt-2 pt-2 border-t border-neutral-100">
          <Text className="text-[10px] text-neutral-400">
            ⚠️ Trust can decrease if content is reported or moderation flags occur.
          </Text>
        </View>
      )}
    </View>
  );
}
