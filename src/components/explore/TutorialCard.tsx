import React from 'react';
import { View, Text, TouchableOpacity, Image, Pressable, StyleSheet } from 'react-native';
import { useExploreStore } from '@/store/explore';
import { Tutorial } from '@/types/explore';
import { router } from 'expo-router';

interface TutorialCardProps {
  tutorial: Tutorial;
  variant?: 'grid' | 'list';
}

export const TutorialCard: React.FC<TutorialCardProps> = ({
  tutorial,
  variant = 'list',
}) => {
  const completedTutorials = useExploreStore((state) => state.completedTutorials);
  const bookmarks = useExploreStore((state) => state.bookmarks);
  const toggleSaveTutorial = useExploreStore((state) => state.toggleSaveTutorial);
  const viewTutorial = useExploreStore((state) => state.viewTutorial);

  const isCompleted = completedTutorials.includes(tutorial.id);
  const isBookmarked = bookmarks.includes(tutorial.id);

  const handlePress = () => {
    // Record view in recentlyViewed queue
    viewTutorial(tutorial.id);
    router.push(`/explore/tutorial/${tutorial.id}`);
  };

  const handleBookmark = (e: any) => {
    e.stopPropagation();
    toggleSaveTutorial(tutorial.id);
  };

  const difficultyColors = {
    Beginner: 'text-success-default bg-success-surface border-success-default/10',
    Intermediate: 'text-warning-default bg-warning-surface border-warning-default/10',
    Advanced: 'text-info-default bg-info-surface border-info-default/10',
  };

  if (variant === 'grid') {
    return (
      <View
        className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm flex-col w-[170px] m-1.5 relative"
      >
        {/* Sibling 1: Absolute fill pressable for the whole card click */}
        <Pressable
          onPress={handlePress}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${tutorial.title}, ${tutorial.difficulty} tutorial, ${tutorial.readingTimeMinutes} minutes. ${isCompleted ? 'Completed' : 'Not completed'}`}
        />

        {/* Card Visual Contents */}
        <View className="flex-1 flex-col">
          {/* Cover image if available */}
          <View className="relative h-24 bg-neutral-100">
            {tutorial.imageUrl ? (
              <Image
                source={{ uri: tutorial.imageUrl }}
                className="w-full h-full object-cover"
              />
            ) : (
              <View className="w-full h-full items-center justify-center bg-neutral-100">
                <Text className="text-2xl">📖</Text>
              </View>
            )}

            {/* Completion checkmark overlay */}
            {isCompleted && (
              <View className="absolute top-2 left-2 bg-success-default rounded-full w-5 h-5 items-center justify-center border border-white shadow-sm">
                <Text className="text-[10px] text-white font-black">✓</Text>
              </View>
            )}
          </View>

          {/* Text Details */}
          <View className="p-3.5 flex-1 justify-between">
            <Text
              className="text-xs font-black text-neutral-900 leading-snug mb-2"
              numberOfLines={2}
            >
              {tutorial.title}
            </Text>

            <View className="flex-row items-center justify-between">
              <Text className="text-[9px] text-neutral-450 font-bold">
                ⏱️ {tutorial.readingTimeMinutes} min
              </Text>
              <View className={`px-1.5 py-0.5 rounded border ${difficultyColors[tutorial.difficulty]}`}>
                <Text className="text-[8px] font-extrabold">{tutorial.difficulty}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sibling 2: High-layered absolute positioned bookmark overlay */}
        <TouchableOpacity
          onPress={handleBookmark}
          className="absolute top-2 right-2 bg-white/80 rounded-full w-7 h-7 items-center justify-center border border-neutral-100"
          style={{ zIndex: 10 }}
          accessibilityRole="button"
          accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark tutorial'}
        >
          <Text className="text-xs">{isBookmarked ? '🔖' : '🖤'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // List Layout variant
  return (
    <View
      className="bg-white border border-neutral-200 rounded-3xl p-4 mb-3 flex-row items-center justify-between shadow-sm relative"
    >
      {/* Sibling 1: Absolute fill pressable for the whole card click */}
      <Pressable
        onPress={handlePress}
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${tutorial.title}, ${tutorial.difficulty} tutorial, ${tutorial.readingTimeMinutes} minutes. ${isCompleted ? 'Completed' : 'Not completed'}`}
      />

      <View className="flex-1 mr-4">
        {/* Top Badging row */}
        <View className="flex-row items-center gap-1.5 mb-1.5">
          {isCompleted && (
            <Text className="text-[10px] bg-success-surface text-success-default px-2 py-0.5 rounded font-extrabold">
              ✓ COMPLETED
            </Text>
          )}
          <View className={`px-1.5 py-0.5 rounded border ${difficultyColors[tutorial.difficulty]}`}>
            <Text className="text-[8px] font-extrabold">{tutorial.difficulty}</Text>
          </View>
          <Text className="text-[9px] text-neutral-400 font-semibold">
            · ⏱️ {tutorial.readingTimeMinutes} min read
          </Text>
        </View>

        {/* Title & Summary */}
        <Text className="text-sm font-black text-neutral-900 leading-snug mb-1">
          {tutorial.title}
        </Text>
        <Text className="text-xs text-neutral-400 leading-relaxed" numberOfLines={2}>
          {tutorial.summary}
        </Text>
      </View>

      {/* Sibling 2: High-layered bookmark Action button */}
      <TouchableOpacity
        onPress={handleBookmark}
        className="w-10 h-10 items-center justify-center bg-neutral-50 rounded-xl border border-neutral-200"
        style={{ zIndex: 10 }}
        accessibilityRole="button"
        accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark tutorial'}
      >
        <Text className="text-sm">{isBookmarked ? '🔖' : '🖤'}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default TutorialCard;
