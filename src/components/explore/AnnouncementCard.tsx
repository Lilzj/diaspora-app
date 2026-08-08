import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ReleaseAnnouncement } from '@/types/explore';
import { useExploreStore } from '@/store/explore';
import { router } from 'expo-router';

interface AnnouncementCardProps {
  announcement: ReleaseAnnouncement;
  onDismiss?: () => void;
}

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({
  announcement,
  onDismiss,
}) => {
  const startTour = useExploreStore((state) => state.startTour);
  const dismissAnnouncement = useExploreStore((state) => state.dismissAnnouncement);

  const handleAction = () => {
    // Dismiss the card
    handleDismiss();
    
    // Trigger relevant tour or go to release notes details
    if (announcement.exploreTourId) {
      startTour(announcement.exploreTourId);
    } else {
      router.push('/explore/release-notes');
    }
  };

  const handleDismiss = () => {
    dismissAnnouncement(announcement.version);
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <View
      className="bg-white border border-neutral-200 rounded-3xl p-5 mb-2 shadow-md"
      accessible={true}
      accessibilityLabel={`What's New in Version ${announcement.version}: ${announcement.title}`}
    >
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Text className="text-[10px] bg-primary-50 text-primary-500 px-2 py-0.5 rounded-full font-black mr-2">
            V{announcement.version}
          </Text>
          <Text className="text-[10px] text-neutral-400 font-bold">
            Released {announcement.releaseDate}
          </Text>
        </View>
        
        {/* Dismiss Button */}
        <TouchableOpacity
          onPress={handleDismiss}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Dismiss release card"
        >
          <Text className="text-xs text-neutral-400 font-bold">✕</Text>
        </TouchableOpacity>
      </View>

      {/* Main Title */}
      <Text className="text-base font-black text-neutral-900 leading-snug mb-1.5">
        {announcement.title}
      </Text>
      
      <Text className="text-xs text-neutral-500 leading-relaxed mb-4">
        {announcement.description}
      </Text>

      {/* Highlights List (Show first 3 items maximum) */}
      <View className="flex-col gap-2 mb-4 border-t border-neutral-50 pt-3">
        {announcement.items.slice(0, 3).map((item, idx) => {
          const typeIcons = {
            feature: '✨',
            improvement: '📈',
            fix: '🔧',
            tip: '💡',
          };
          const typeLabels = {
            feature: 'New Feature',
            improvement: 'Improvement',
            fix: 'Fixed',
            tip: 'Tip',
          };

          return (
            <View key={idx} className="flex-row items-start">
              <Text className="text-sm mr-2 mt-0.5">{typeIcons[item.type]}</Text>
              <View className="flex-1">
                <Text className="text-[10px] font-black text-neutral-700">
                  {typeLabels[item.type]}: {item.title}
                </Text>
                <Text className="text-[11px] text-neutral-400 leading-normal">
                  {item.description}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Action Buttons */}
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={handleAction}
          className="bg-primary-500 px-5 py-3 rounded-2xl flex-1 items-center justify-center shadow-lg shadow-primary-500/10"
        >
          <Text className="text-white text-xs font-black">
            Explore new features now →
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={() => router.push('/explore/release-notes')}
          className="bg-neutral-50 border border-neutral-200 px-4 py-3 rounded-2xl items-center justify-center"
        >
          <Text className="text-neutral-500 text-xs font-bold">All Logs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default AnnouncementCard;
