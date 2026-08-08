import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { useExploreStore } from '@/store/explore';
import { router } from 'expo-router';

interface ProgressiveUnlockCardProps {
  featureKey: string;
  title: string;
  description: string;
  tourId?: 'app' | 'marketplace' | 'jobs' | 'housing' | 'creator' | 'trust' | 'neighborhood' | 'community-life';
  tutorialId?: string;
}

export const ProgressiveUnlockCard: React.FC<ProgressiveUnlockCardProps> = ({
  featureKey,
  title,
  description,
  tourId,
  tutorialId,
}) => {
  const dismissUnlock = useExploreStore((state) => state.dismissUnlock);
  const startTour = useExploreStore((state) => state.startTour);

  const slideAnim = useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    // Slide in animation on mount
    Animated.spring(slideAnim, {
      toValue: 24, // Margin top from safe area
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, []);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      dismissUnlock(featureKey);
    });
  };

  const handleAction = () => {
    handleDismiss();
    
    // Redirect context
    if (tourId) {
      startTour(tourId);
    } else if (tutorialId) {
      router.push(`/explore/tutorial/${tutorialId}`);
    } else {
      router.push('/explore');
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
      className="bg-white border border-success-default/30 rounded-3xl p-4 shadow-2xl z-[99999] flex-row items-start justify-between"
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={`Feature Unlocked! ${title}. ${description}`}
    >
      {/* Visual icon representation */}
      <View className="w-10 h-10 bg-success-surface rounded-full items-center justify-center mr-3 mt-0.5">
        <Text className="text-xl">🏆</Text>
      </View>

      {/* Info Column */}
      <View className="flex-1 mr-2">
        <Text className="text-[10px] font-black text-success-default uppercase tracking-widest">
          Congratulations!
        </Text>
        <Text className="text-sm font-black text-neutral-900 leading-snug mt-0.5">
          {title}
        </Text>
        <Text className="text-xs text-neutral-500 mt-1 leading-relaxed">
          {description}
        </Text>

        {/* Dynamic Navigation button */}
        <TouchableOpacity
          onPress={handleAction}
          className="bg-success-default/10 border border-success-default/20 rounded-xl px-4 py-2 mt-3.5 self-start"
        >
          <Text className="text-xs font-bold text-success-default">
            Discover what this unlocks →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Close button */}
      <TouchableOpacity
        onPress={handleDismiss}
        className="p-1"
        accessibilityRole="button"
        accessibilityLabel="Dismiss feature unlock announcement"
      >
        <Text className="text-xs text-neutral-400 font-bold">✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    elevation: 24,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
});
export default ProgressiveUnlockCard;
