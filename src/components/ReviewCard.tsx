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
    <View className="bg-white rounded-xl p-4 mb-3 border border-neutral-100">
      <View className="flex-row items-center mb-3">
        <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center mr-3">
          {reviewerAvatar ? (
            <Image source={{ uri: reviewerAvatar }} className="w-10 h-10 rounded-full" />
          ) : (
            <Text className="text-primary-500 font-bold">{reviewerName.charAt(0)}</Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="font-semibold text-neutral-900">{reviewerName}</Text>
          <Text className="text-xs text-neutral-400">{date}</Text>
        </View>
        <View className="flex-row">
          {[1, 2, 3, 4, 5].map((star) => (
            <Text
              key={star}
              className={`text-sm ${star <= rating ? 'text-warning-default' : 'text-neutral-200'}`}
            >
              ★
            </Text>
          ))}
        </View>
      </View>
      {body && <Text className="text-neutral-700 text-sm leading-relaxed">{body}</Text>}
    </View>
  );
}
