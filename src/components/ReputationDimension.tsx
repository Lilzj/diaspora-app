import React from 'react';
import { View, Text } from 'react-native';
import type { ReputationDimension } from '@/types/reputation';
import { DIMENSION_LABELS } from '@/types/reputation';

/** One row of a dimension's breakdown, as the server named and totalled it. */
export interface ReputationBreakdownRow {
  label: string;
  points: number;
  /** How many times it was recorded. Shown when more than once. */
  count?: number;
}

interface ReputationDimensionCardProps {
  dimension: ReputationDimension;
  score: number;
  maxScore: number;
  /**
   * The server's rows, rendered as they arrive. Never computed here: the
   * card used to be handed counters multiplied by figures the server does not
   * pay. Empty when the server sent no breakdown.
   */
  breakdown: ReputationBreakdownRow[];
  /**
   * The score less the sum of the rows. Positive where a penalty went below
   * zero and the score was held there. Shown as its own row so the rows always
   * add up to the score.
   */
  adjustment?: number;
}

/** The adjustment row's wording. The sign says which of the two causes it is. */
function adjustmentLabel(adjustment: number): string {
  return adjustment > 0
    ? 'Held at zero (a penalty was larger than the score)'
    : 'Earlier awards not counted in the score';
}

export function ReputationDimensionCard({
  dimension,
  score,
  maxScore,
  breakdown,
  adjustment = 0,
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
    <View className="bg-surface-card rounded-xl p-4 mb-3" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Text className="text-lg mr-2">{config.icon}</Text>
          <Text className="text-base font-semibold text-content-primary">{config.label}</Text>
        </View>
        <Text className="text-lg font-bold text-content-primary">{score}</Text>
      </View>

      {/* Progress bar */}
      <View className="h-2 bg-surface-muted rounded-full mb-3">
        <View
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${progress * 100}%` }}
        />
      </View>

      {/* Description */}
      <Text className="text-xs text-content-muted mb-3">{config.description}</Text>

      {/* Breakdown */}
      {breakdown.map((item, i) => (
        <View key={i} className="flex-row items-center justify-between py-1.5">
          <Text className="text-sm text-content-secondary">
            {item.label}
            {item.count !== undefined && item.count > 1 ? ` ×${item.count}` : ''}
          </Text>
          <Text
            className={`text-sm font-medium ${
              item.points >= 0 ? 'text-content-primary' : 'text-error-default'
            }`}
          >
            {item.points >= 0 ? '+' : ''}{item.points}
          </Text>
        </View>
      ))}

      {adjustment !== 0 && (
        <View className="flex-row items-center justify-between py-1.5">
          <Text className="text-sm text-content-muted flex-1 mr-3">{adjustmentLabel(adjustment)}</Text>
          <Text className="text-sm font-medium text-content-muted">
            {adjustment > 0 ? '+' : ''}{adjustment}
          </Text>
        </View>
      )}

      {/* Trust warning */}
      {dimension === 'trust' && (
        <View className="mt-2 pt-2 border-t border-faint">
          <Text className="text-[10px] text-content-faint">
            ⚠️ Trust can decrease if content is reported or moderation flags occur.
          </Text>
        </View>
      )}
    </View>
  );
}
