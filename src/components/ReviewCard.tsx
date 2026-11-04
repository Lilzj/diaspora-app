import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';

interface ReviewCardProps {
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  body?: string;
  date: string;
}

export function ReviewCard({ reviewerName, reviewerAvatar, rating, body, date }: ReviewCardProps) {
  return (
    <View className="bg-surface-card rounded-xl p-4 mb-3 border border-faint">
      <View className="flex-row items-center mb-3">
        <View className="w-10 h-10 rounded-full bg-surface-muted items-center justify-center mr-3">
          {reviewerAvatar ? (
            <Image source={{ uri: reviewerAvatar }} className="w-10 h-10 rounded-full" />
          ) : (
            <Text className="text-primary-500 font-bold">{reviewerName.charAt(0)}</Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="font-semibold text-content-primary">{reviewerName}</Text>
          <Text className="text-xs text-content-faint">{date}</Text>
        </View>
        <View className="flex-row">
          {[1, 2, 3, 4, 5].map((star) => (
            <Text
              key={star}
              className={`text-sm ${star <= rating ? 'text-warning-default' : 'text-subtle'}`}
            >
              ★
            </Text>
          ))}
        </View>
      </View>
      {body && <Text className="text-content-secondary text-sm leading-relaxed">{body}</Text>}
    </View>
  );
}
