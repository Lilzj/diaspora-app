import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface BadgeItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  status: 'unlocked' | 'verified' | 'level' | 'in_progress' | 'locked';
  statusText: string;
  progress?: string;
}

export const ALL_CREATOR_BADGES: BadgeItem[] = [
  {
    id: 'b-1',
    icon: '🏆',
    title: 'First Guide Created',
    description: 'Published your first verified community relocation guide.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-2',
    icon: '❤️',
    title: '100 Helpful Votes',
    description: 'Received 100+ helpful votes from London diaspora members.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-3',
    icon: '🌍',
    title: 'UK Residency Verified',
    description: 'Identity and proof of UK residency verified by Diaspora compliance.',
    status: 'verified',
    statusText: 'VERIFIED',
  },
  {
    id: 'b-4',
    icon: '🌟',
    title: 'Expert Contributor',
    description: 'Maintained a 90%+ community satisfaction score across 20+ posts.',
    status: 'level',
    statusText: 'LEVEL 3',
  },
  {
    id: 'b-5',
    icon: '💬',
    title: 'Active Moderator',
    description: 'Participated in community moderation reviews to protect trust.',
    status: 'in_progress',
    statusText: 'IN PROGRESS',
    progress: '14 / 20 reviews',
  },
  {
    id: 'b-6',
    icon: '🏠',
    title: 'Housing Host',
    description: 'Listed verified diaspora housing accommodation.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-7',
    icon: '💼',
    title: 'Career Pioneer',
    description: 'Posted job openings with visa sponsorship for diaspora members.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-8',
    icon: '🛒',
    title: 'Trusted Seller',
    description: 'Completed 10+ verified marketplace transactions with 5-star ratings.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-9',
    icon: '🔥',
    title: '5-Day Creator Streak',
    description: 'Active on Creator Studio for 5 consecutive days.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-10',
    icon: '🛡️',
    title: 'Community Guardian',
    description: 'Flagged 5 inaccurate or duplicate listings to protect community.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-11',
    icon: '🚀',
    title: 'Early Expat Pioneer',
    description: 'Joined Diaspora during early beta launch phase.',
    status: 'unlocked',
    statusText: 'UNLOCKED',
  },
  {
    id: 'b-12',
    icon: '🤝',
    title: 'Community Mentor',
    description: 'Directly mentored 10 newcomers through GP & BRP setup.',
    status: 'locked',
    statusText: 'LOCKED',
    progress: '3 / 10 mentees',
  },
];

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
        return { container: 'bg-neutral-100 border-neutral-200', text: 'text-neutral-500 font-bold' };
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/60 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-white rounded-t-3xl p-6 max-h-[88%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-neutral-200 rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-neutral-100 mb-4">
            <View className="flex-1 mr-2">
              <Text className="text-base font-black text-neutral-900 tracking-tight">
                🎖️ Creator Achievements ({ALL_CREATOR_BADGES.length})
              </Text>
              <Text className="text-xs text-neutral-500">
                Earn badges by contributing, helping newcomers, and building trust.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-neutral-100 p-2 rounded-full">
              <Text className="text-xs font-black text-neutral-600">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <View className="space-y-3 gap-3">
              {ALL_CREATOR_BADGES.map((badge) => {
                const style = getStatusBadgeStyle(badge.status);
                return (
                  <View
                    key={badge.id}
                    className="flex-row items-center bg-neutral-50 border border-neutral-150 p-4 rounded-2xl"
                  >
                    <View className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 items-center justify-center mr-3.5 shadow-sm">
                      <Text className="text-2xl">{badge.icon}</Text>
                    </View>

                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center justify-between mb-0.5">
                        <Text className="text-xs font-black text-neutral-900 flex-1 mr-2" numberOfLines={1}>
                          {badge.title}
                        </Text>
                        <View className={`px-2 py-0.5 rounded-full border ${style.container}`}>
                          <Text className={`text-[9px] ${style.text}`}>{badge.statusText}</Text>
                        </View>
                      </View>

                      <Text className="text-[10px] text-neutral-500 leading-relaxed">
                        {badge.description}
                      </Text>

                      {badge.progress && (
                        <Text className="text-[9px] font-black text-neutral-400 mt-1">
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
