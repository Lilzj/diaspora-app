import React from 'react';
import { View, Text } from 'react-native';
import { UnifiedContentItem } from '@/types/creator';

interface ContentMetricsProps {
  item: UnifiedContentItem;
}

export const ContentMetrics: React.FC<ContentMetricsProps> = ({ item }) => {
  return (
    <View className="flex-row flex-wrap items-center gap-3 mt-2">
      <View className="flex-row items-center">
        <Text className="text-[10px] text-neutral-400 mr-1">👁️</Text>
        <Text className="text-[10px] font-bold text-neutral-600">{item.views}</Text>
      </View>

      <View className="flex-row items-center">
        <Text className="text-[10px] text-neutral-400 mr-1">🔖</Text>
        <Text className="text-[10px] font-bold text-neutral-600">{item.bookmarks}</Text>
      </View>

      <View className="flex-row items-center">
        <Text className="text-[10px] text-neutral-400 mr-1">💬</Text>
        <Text className="text-[10px] font-bold text-neutral-600">{item.commentsCount}</Text>
      </View>

      <View className="flex-row items-center">
        <Text className="text-[10px] text-neutral-400 mr-1">✉️</Text>
        <Text className="text-[10px] font-bold text-neutral-600">
          {item.messagesCount} {item.unreadMessagesCount > 0 && `(${item.unreadMessagesCount} unread)`}
        </Text>
      </View>

      {item.offersCount !== undefined && (
        <View className="flex-row items-center">
          <Text className="text-[10px] text-neutral-400 mr-1">🏷️</Text>
          <Text className="text-[10px] font-black text-amber-600">{item.offersCount} offers</Text>
        </View>
      )}

      {item.applicantsCount !== undefined && (
        <View className="flex-row items-center">
          <Text className="text-[10px] text-neutral-400 mr-1">👤</Text>
          <Text className="text-[10px] font-black text-blue-600">{item.applicantsCount} applicants</Text>
        </View>
      )}

      {item.applicationsCount !== undefined && (
        <View className="flex-row items-center">
          <Text className="text-[10px] text-neutral-400 mr-1">📄</Text>
          <Text className="text-[10px] font-black text-teal-600">{item.applicationsCount} applications</Text>
        </View>
      )}
    </View>
  );
};
