import React from 'react';
import { View, Text } from 'react-native';

interface RatingDisplayProps {
  average: number;
  totalReviews: number;
  distribution?: Record<string, number>;
  size?: 'sm' | 'lg';
}

export function RatingDisplay({ average, totalReviews, distribution, size = 'sm' }: RatingDisplayProps) {
  if (size === 'lg' && distribution) {
    return (
      <View className="flex-row items-start">
        <View className="items-center mr-6">
          <Text className="text-5xl font-bold text-content-primary">{average.toFixed(1)}</Text>
          <View className="flex-row mt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Text
                key={star}
                className={`text-lg ${star <= Math.round(average) ? 'text-warning-default' : 'text-subtle'}`}
              >
                ★
              </Text>
            ))}
          </View>
          <Text className="text-sm text-content-muted mt-1">{totalReviews} reviews</Text>
        </View>
        <View className="flex-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distribution[String(star)] ?? 0;
            const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
            return (
              <View key={star} className="flex-row items-center mb-1.5">
                <Text className="text-xs text-content-muted w-3 text-right mr-2">{star}</Text>
                <View className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                  <View
                    className="h-full bg-warning-default rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center">
      <Text className="text-warning-default mr-1">★</Text>
      <Text className="text-sm font-medium text-content-primary">{average.toFixed(1)}</Text>
      <Text className="text-sm text-content-faint ml-1">({totalReviews})</Text>
    </View>
  );
}
