import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { UnifiedContentItem } from '@/types/creator';

interface InsightCardProps {
  item: UnifiedContentItem | null;
  visible: boolean;
  onClose: () => void;
}

export const InsightCard: React.FC<InsightCardProps> = ({ item, visible, onClose }) => {
  if (!item) return null;

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-surface-card rounded-t-3xl p-6 max-h-[85%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-subtle rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-faint mb-4">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-black text-primary-500 uppercase tracking-wider">{item.contentType} Analytics</Text>
              <Text className="text-base font-black text-content-primary leading-snug" numberOfLines={1}>{item.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-surface-muted p-2 rounded-full">
              <Text className="text-xs font-black text-content-tertiary">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Key Performance Indicators Grid */}
            <View className="flex-row flex-wrap gap-2.5 mb-6">
              <View className="bg-surface-background border border-subtle p-3.5 rounded-2xl w-[48%]">
                <Text className="text-xs font-bold text-content-muted uppercase">Total Views</Text>
                <Text className="text-xl font-black text-content-primary mt-1">{item.views}</Text>
                <Text className="text-[9px] text-emerald-600 font-extrabold mt-0.5">↑ 18% vs last week</Text>
              </View>

              <View className="bg-surface-background border border-subtle p-3.5 rounded-2xl w-[48%]">
                <Text className="text-xs font-bold text-content-muted uppercase">Bookmarks / Saves</Text>
                <Text className="text-xl font-black text-content-primary mt-1">{item.bookmarks}</Text>
                <Text className="text-[9px] text-content-faint font-semibold mt-0.5">Saved by diaspora users</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: '/(tabs)/messages',
                    params: { category: item.contentType },
                  });
                }}
                className="bg-primary-50/60 border border-primary-200 p-3.5 rounded-2xl w-[48%]"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-[10px] font-black text-primary-600 uppercase">Inquiries & Messages</Text>
                  <Text className="text-xs text-primary-500 font-black">→</Text>
                </View>
                <Text className="text-xl font-black text-content-primary mt-1">{item.messagesCount}</Text>
                <Text className="text-[9px] text-primary-600 font-extrabold mt-0.5">
                  {item.unreadMessagesCount} unread · Tap for inbox →
                </Text>
              </TouchableOpacity>

              <View className="bg-surface-background border border-subtle p-3.5 rounded-2xl w-[48%]">
                <Text className="text-xs font-bold text-content-muted uppercase">Conversion Rate</Text>
                <Text className="text-xl font-black text-success-default mt-1">{item.conversionRate || '84%'}</Text>
                <Text className="text-[9px] text-content-faint font-semibold mt-0.5">High audience intent</Text>
              </View>
            </View>

            {/* Type Specific Insights */}
            {item.contentType === 'Guide' && (
              <View className="bg-orange-50/40 border border-orange-200 p-4 rounded-2xl mb-6">
                <Text className="text-xs font-black text-orange-800 uppercase mb-2">📖 Reading Engagement</Text>
                <Text className="text-xs text-content-secondary font-semibold">Average Reading Time: <Text className="font-black text-content-primary">{item.readingTime || '6 min read'}</Text></Text>
                <Text className="text-xs text-content-secondary font-semibold mt-1">Helpful Votes: <Text className="font-black text-content-primary">{item.helpfulVotes || 89}</Text></Text>
              </View>
            )}

            {item.contentType === 'Marketplace' && (
              <View className="bg-amber-50/40 border border-amber-200 p-4 rounded-2xl mb-6">
                <Text className="text-xs font-black text-amber-800 uppercase mb-2">🛍️ Buyer Interest</Text>
                <Text className="text-xs text-content-secondary font-semibold">Total Offers Received: <Text className="font-black text-content-primary">{item.offersCount || 6} offers</Text></Text>
                <Text className="text-xs text-content-secondary font-semibold mt-1">Asking Price: <Text className="font-black text-primary-500">{item.price}</Text></Text>
              </View>
            )}

            {item.contentType === 'Housing' && (
              <View className="bg-teal-50/40 border border-teal-200 p-4 rounded-2xl mb-6">
                <Text className="text-xs font-black text-teal-800 uppercase mb-2">🏠 Tenant Inquiries</Text>
                <Text className="text-xs text-content-secondary font-semibold">Rental Applications: <Text className="font-black text-content-primary">{item.applicationsCount || 7} submitted</Text></Text>
                <Text className="text-xs text-content-secondary font-semibold mt-1">Listed Rent: <Text className="font-black text-primary-500">{item.price}</Text></Text>
              </View>
            )}

            {item.contentType === 'Job' && (
              <View className="bg-blue-50/40 border border-blue-200 p-4 rounded-2xl mb-6">
                <Text className="text-xs font-black text-blue-800 uppercase mb-2">💼 Applicants Breakdown</Text>
                <Text className="text-xs text-content-secondary font-semibold">Total Applicants: <Text className="font-black text-content-primary">{item.applicantsCount || 19} candidates</Text></Text>
                <Text className="text-xs text-content-secondary font-semibold mt-1">Salary Range: <Text className="font-black text-content-primary">{item.salaryRange}</Text></Text>
              </View>
            )}

            {/* Health Score Panel */}
            <View className="bg-surface-inverse rounded-2xl p-4 mb-4">
              <Text className="text-xs font-black text-content-inverse uppercase tracking-wider mb-1">Content Health Rating</Text>
              <Text className="text-xs text-content-faint">
                Health Score: <Text className="font-black text-success-default">{item.healthScore}% ({item.healthStatus})</Text>
              </Text>
              {(item.healthRecommendations ?? []).map((rec) => (
                <View key={rec.id} className="bg-surface-inverse p-2.5 rounded-xl mt-2">
                  <Text className="text-xs font-bold text-amber-300">💡 {rec.title}</Text>
                  <Text className="text-[10px] text-content-faint mt-0.5">{rec.description}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
