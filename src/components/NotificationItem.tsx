import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface NotificationItemProps {
  title: string;
  body: string;
  category: string;
  isRead: boolean;
  createdAt: string;
  onPress?: () => void;
}

const categoryIcons: Record<string, string> = {
  Review: '⭐',
  Verification: '✓',
  Listing: '📋',
  Announcement: '📢',
  AccountAlert: '🔒',
  Promotion: '🎁',
};

export function NotificationItem({ title, body, category, isRead, createdAt, onPress }: NotificationItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row p-4 border-b border-neutral-100 ${!isRead ? 'bg-primary-50' : 'bg-white'}`}
    >
      <View className="w-10 h-10 rounded-full bg-neutral-100 items-center justify-center mr-3 mt-0.5">
        <Text className="text-lg">{categoryIcons[category] ?? '🔔'}</Text>
      </View>
      <View className="flex-1">
        <Text className={`text-sm ${!isRead ? 'font-semibold' : 'font-medium'} text-neutral-900`}>
          {title}
        </Text>
        <Text className="text-sm text-neutral-500 mt-0.5" numberOfLines={2}>
          {body}
        </Text>
        <Text className="text-xs text-neutral-400 mt-1">{createdAt}</Text>
      </View>
      {!isRead && <View className="w-2.5 h-2.5 rounded-full bg-primary-500 mt-1.5" />}
    </TouchableOpacity>
  );
}
