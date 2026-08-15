import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_CREATOR_BADGES, BADGE_GROUP_ORDER, BADGE_GROUP_LABELS, type BadgeItem } from '@/config/badges';

// The catalogue moved to `config/badges.ts`. It was a literal in this file, and
// the creator profile could not read it from here without importing a modal —
// so it grew its own six-badge list instead, and the two disagreed. Re-exported
// so existing imports keep working.
export type { BadgeItem, BadgeStatus, BadgeGroup } from '@/config/badges';
export {
  ALL_CREATOR_BADGES,
  BADGE_GROUP_ORDER,
  BADGE_GROUP_LABELS,
  isBadgeEarned,
} from '@/config/badges';

interface AchievementsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();

  const getStatusBadgeStyle = (status: BadgeItem['status']) => {
    switch (status) {
      case 'unlocked':
      case 'verified':
        return { container: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700 font-extrabold' };
      case 'level':
        return { container: 'bg-primary-50 border-primary-200', text: 'text-primary-600 font-black' };
      case 'in_progress':
        return { container: 'bg-amber-50 border-amber-200', text: 'text-amber-700 font-bold' };
      case 'locked':
      default:
        return { container: 'bg-surface-muted border-subtle', text: 'text-content-muted font-bold' };
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
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
            <View className="flex-1 mr-2">
              <Text className="text-base font-black text-content-primary tracking-tight">
                🎖️ Creator Achievements ({ALL_CREATOR_BADGES.length})
              </Text>
              <Text className="text-xs text-content-muted">
                Earn badges by contributing, helping newcomers, and building trust.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-surface-muted p-2 rounded-full">
              <Text className="text-xs font-black text-content-tertiary">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <View className="space-y-3 gap-3">
              {ALL_CREATOR_BADGES.map((badge) => {
                const style = getStatusBadgeStyle(badge.status);
                return (
                  <View
                    key={badge.id}
                    className="flex-row items-center bg-surface-background border border-faint p-4 rounded-2xl"
                  >
                    <View className="w-12 h-12 rounded-2xl bg-surface-card border border-subtle items-center justify-center mr-3.5 shadow-sm">
                      <Text className="text-2xl">{badge.icon}</Text>
                    </View>

                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center justify-between mb-0.5">
                        <Text className="text-xs font-black text-content-primary flex-1 mr-2" numberOfLines={1}>
                          {badge.title}
                        </Text>
                        <View className={`px-2 py-0.5 rounded-full border ${style.container}`}>
                          <Text className={`text-[9px] ${style.text}`}>{badge.statusText}</Text>
                        </View>
                      </View>

                      <Text className="text-[10px] text-content-muted leading-relaxed">
                        {badge.description}
                      </Text>

                      {badge.progress && (
                        <Text className="text-[9px] font-black text-content-faint mt-1">
                          Progress: {badge.progress}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
