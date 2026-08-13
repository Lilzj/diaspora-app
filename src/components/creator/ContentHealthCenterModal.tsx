import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContentManagementStore } from '@/store/content-management';
import { UnifiedContentItem } from '@/types/creator';
import Svg, { Circle } from 'react-native-svg';

interface ContentHealthCenterModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectAction: (item: UnifiedContentItem, actionType: string) => void;
}

export const ContentHealthCenterModal: React.FC<ContentHealthCenterModalProps> = ({
  visible,
  onClose,
  onSelectAction,
}) => {
  const insets = useSafeAreaInsets();
  const { items, getHealthStats } = useContentManagementStore();
  const stats = getHealthStats();

  const unhealthyItems = items.filter((i) => i.healthStatus !== 'healthy');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/60 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-surface-card rounded-t-3xl p-6 max-h-[88%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-subtle rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-faint mb-4">
            <View>
              <Text className="text-base font-black text-content-primary tracking-tight">Content Health Center</Text>
              <Text className="text-xs text-content-muted">Intelligent quality & freshness audit</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-surface-muted p-2 rounded-full">
              <Text className="text-xs font-black text-content-tertiary">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Overall Score Banner */}
            <View className="bg-surface-inverse rounded-3xl p-5 mb-6 flex-row items-center justify-between border border-line">
              <View className="flex-1 pr-4">
                <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">Overall Health Score</Text>
                <Text className="text-2xl font-black text-content-inverse mt-1">{stats.overallScore}%</Text>
                <Text className="text-xs text-content-faint leading-relaxed mt-1">
                  {stats.overallScore >= 85
                    ? 'Excellent! Your content is active, verified, and highly trusted.'
                    : 'Attention needed: Resolve flagged items to improve community trust.'}
                </Text>
              </View>

              {/* Gauge */}
              <Svg height="64" width="64" viewBox="0 0 36 36">
                <Circle cx="18" cy="18" r="16" fill="none" stroke="#374151" strokeWidth="3.5" />
                <Circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="#F59300"
                  strokeWidth="3.5"
                  strokeDasharray="100"
                  strokeDashoffset={100 - stats.overallScore}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </Svg>
            </View>

            {/* Health Status Breakdown */}
            <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">Status Categories</Text>
            <View className="flex-row flex-wrap gap-2.5 mb-6">
              <View className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex-1 min-w-[45%]">
                <Text className="text-sm font-black text-emerald-800">🟢 Healthy ({stats.healthy})</Text>
                <Text className="text-[10px] text-emerald-700 mt-0.5">Active & receiving engagement</Text>
              </View>

              <View className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex-1 min-w-[45%]">
                <Text className="text-sm font-black text-amber-800">🟡 Needs Attention ({stats.needsAttention})</Text>
                <Text className="text-[10px] text-amber-700 mt-0.5">No messages in last 10 days</Text>
              </View>

              <View className="bg-orange-50 border border-orange-200 p-3 rounded-2xl flex-1 min-w-[45%]">
                <Text className="text-sm font-black text-orange-800">🟠 Expiring Soon ({stats.expiringSoon})</Text>
                <Text className="text-[10px] text-orange-700 mt-0.5">Event or listing nearing expiry</Text>
              </View>

              <View className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex-1 min-w-[45%]">
                <Text className="text-sm font-black text-rose-800">🔴 Action Required ({stats.actionRequired})</Text>
                <Text className="text-[10px] text-rose-700 mt-0.5">User report / status conflict</Text>
              </View>
            </View>

            {/* Actionable Recommendations List */}
            <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">
              Actionable AI Recommendations ({unhealthyItems.length} Items)
            </Text>

            {unhealthyItems.map((item) => (
              <View key={item.id} className="bg-surface-card border border-subtle rounded-2xl p-4 mb-3.5 shadow-sm">
                <View className="flex-row justify-between items-start mb-2">
                  <Text className="text-xs font-black text-content-primary flex-1 mr-2" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text className="text-[10px] font-black text-primary-500">{item.healthScore}%</Text>
                </View>

                {item.healthRecommendations.map((rec) => (
                  <View key={rec.id} className="bg-surface-background border border-faint rounded-xl p-3 mt-2">
                    <Text className="text-xs font-bold text-content-strong mb-0.5">💡 {rec.title}</Text>
                    <Text className="text-[10px] text-content-tertiary leading-relaxed mb-2">{rec.description}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        onClose();
                        onSelectAction(item, rec.actionType);
                      }}
                      className="bg-primary-500 px-3 py-1.5 rounded-lg self-start"
                    >
                      <Text className="text-[10px] font-black text-white">{rec.actionText} →</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}

            {unhealthyItems.length === 0 && (
              <View className="items-center py-8 bg-surface-background rounded-2xl border border-subtle">
                <Text className="text-3xl mb-2">🎉</Text>
                <Text className="text-xs font-bold text-content-strong">All Content is Healthy!</Text>
                <Text className="text-[10px] text-content-faint mt-1">No action required at this time.</Text>
              </View>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
