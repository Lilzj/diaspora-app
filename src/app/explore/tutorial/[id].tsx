import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Alert, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExploreStore } from '@/store/explore';
import { mockTutorials } from '@/mocks/explore-data';
import { apiClient } from '@/lib/apiClient';
import { useLaunchTour } from '@/components/explore/useLaunchTour';
import { useThemeTokens } from '@/design-system';

export default function TutorialReaderScreen() {
  const tokens = useThemeTokens();
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useExploreStore();
  const launchTour = useLaunchTour();

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tutorial, setTutorial] = useState<any | null>(null);

  useEffect(() => {
    const fetchTutorial = async () => {
      try {
        setLoading(true);
        // Call mocked API endpoint
        const res = await apiClient.get(`/explore/tutorials/${id}`);
        setTutorial(res.data.data);
      } catch (err) {
        console.error('Failed to load tutorial from server', err);
        // Local fallback
        const local = mockTutorials.find(t => t.id === id);
        setTutorial(local || null);
      } finally {
        setLoading(false);
      }
    };
    fetchTutorial();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background justify-center items-center">
        <Text className="text-sm font-semibold text-content-faint">Loading guide...</Text>
      </SafeAreaView>
    );
  }

  if (!tutorial) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background justify-center items-center px-6">
        <Text className="text-4xl mb-4">⚠️</Text>
        <Text className="text-base font-black text-content-primary text-center">Tutorial not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-primary-500 px-6 py-3 rounded-2xl mt-5 shadow-md shadow-primary-500/20"
        >
          <Text className="text-white font-bold text-xs">Back to Explore Hub</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isCompleted = store.completedTutorials.includes(tutorial.id);
  const isBookmarked = store.bookmarks.includes(tutorial.id);

  const handleMarkComplete = async () => {
    if (!isCompleted) {
      // Persist locally
      await store.completeTutorial(tutorial.id);
      // Synchronize with API mock
      try {
        await apiClient.post('/explore/progress/complete', { tutorialId: tutorial.id });
      } catch (err) {
        console.error('Failed to sync progress to mock server', err);
      }
    }
  };

  const handleLaunchTour = () => launchTour(tutorial.relatedTourId);

  const stepsLength = tutorial.steps.length;
  const activeStepDetail = tutorial.steps[activeStep];

  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top', 'bottom']}>
      {/* Top Navbar */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <Text className="text-sm font-black text-content-primary tracking-tight" numberOfLines={1} style={{ maxWidth: 200 }}>
            {tutorial.title}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          {/* Save/Bookmark button */}
          <TouchableOpacity
            onPress={() => store.toggleSaveTutorial(tutorial.id)}
            className="w-10 h-10 items-center justify-center bg-surface-background border border-subtle rounded-xl"
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark tutorial'}
          >
            <Text className="text-sm">{isBookmarked ? '🔖' : '🖤'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-5" showsVerticalScrollIndicator={false}>
        {/* Banner metadata */}
        <View className="bg-surface-card border border-subtle rounded-3xl p-4 mb-5 flex-row justify-between items-center shadow-sm">
          <View>
            <Text className="text-[9px] font-black text-primary-500 uppercase tracking-widest">
              Category: {tutorial.categoryId.replace('-', ' ')}
            </Text>
            <Text className="text-xs font-bold text-content-tertiary mt-1">
              ⏱️ {tutorial.readingTimeMinutes} mins read · {tutorial.difficulty}
            </Text>
          </View>
          
          <View className="bg-surface-background border border-subtle rounded-xl px-3 py-1">
            <Text className="text-[10px] font-black text-content-muted uppercase">
              {isCompleted ? '✓ Completed' : 'Not finished'}
            </Text>
          </View>
        </View>

        {/* Cover Image */}
        {tutorial.imageUrl && (
          <View style={styles.imageContainer} className="rounded-3xl border border-subtle mb-5 overflow-hidden shadow-sm">
            <Image
              source={{ uri: tutorial.imageUrl }}
              className="w-full h-44 object-cover"
            />
          </View>
        )}

        {/* Description Header */}
        <Text className="text-lg font-black text-content-primary leading-snug mb-3">
          {tutorial.title}
        </Text>
        <Text className="text-xs text-content-muted leading-relaxed mb-6">
          {tutorial.summary}
        </Text>

        {/* Stepper Interactive Section */}
        {stepsLength > 0 && (
          <View className="bg-surface-card border border-subtle rounded-3xl p-5 mb-6 shadow-md">
            {/* Step Counter */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest">
                Step {activeStep + 1} of {stepsLength}
              </Text>
              
              {/* Progress dots */}
              <View className="flex-row gap-1">
                {Array.from({ length: stepsLength }).map((_, idx) => (
                  <View
                    key={idx}
                    className={`h-1.5 rounded-full ${
                      idx === activeStep ? 'w-4 bg-primary-500' : 'w-1.5 bg-subtle'
                    }`}
                  />
                ))}
              </View>
            </View>

            {/* Step Content */}
            <View className="min-h-[140px]">
              <Text className="text-sm font-black text-content-primary leading-snug mb-2">
                {activeStepDetail.title}
              </Text>
              <Text className="text-xs text-content-tertiary leading-relaxed">
                {activeStepDetail.description}
              </Text>
            </View>

            {/* Stepper Navigation buttons */}
            <View className="flex-row justify-between items-center border-t border-faint pt-4 mt-2">
              <TouchableOpacity
                onPress={() => setActiveStep(prev => Math.max(0, prev - 1))}
                disabled={activeStep === 0}
                className={`px-4 py-2 rounded-xl border ${
                  activeStep === 0 ? 'opacity-30 border-faint' : 'border-subtle bg-surface-background'
                }`}
              >
                <Text className="text-xs font-bold text-content-tertiary">Previous</Text>
              </TouchableOpacity>

              {activeStep + 1 === stepsLength ? (
                <TouchableOpacity
                  onPress={handleMarkComplete}
                  className={`px-5 py-2.5 rounded-xl flex-row items-center gap-1.5 ${
                    isCompleted ? 'bg-success-surface border border-success-default/20' : 'bg-primary-500'
                  }`}
                >
                  <Text className={`text-xs font-black ${isCompleted ? 'text-success-default' : 'text-white'}`}>
                    {isCompleted ? '✓ Completed' : 'Mark as Done'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setActiveStep(prev => Math.min(stepsLength - 1, prev + 1))}
                  className="bg-primary-500 px-5 py-2 rounded-xl"
                >
                  <Text className="text-xs font-bold text-white">Next Step</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Launch Guided Tour (Callout) */}
        {tutorial.relatedTourId && (
          <View className="bg-primary-50/20 border border-primary-100 rounded-3xl p-5 mb-10 flex-col items-center shadow-sm">
            <Text className="text-3xl mb-2">💡</Text>
            <Text className="text-sm font-black text-content-primary text-center">
              Want a live demonstration?
            </Text>
            <Text className="text-xs text-content-muted mt-1.5 text-center leading-relaxed max-w-[280px] mb-4">
              We can guide you directly inside the app with highlighted overlays and interactive coach marks.
            </Text>
            
            <TouchableOpacity
              onPress={handleLaunchTour}
              className="bg-primary-500 px-6 py-3 rounded-2xl shadow-md shadow-primary-500/10"
            >
              <Text className="text-white text-xs font-black">
                Launch Live Walkthrough
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    height: 180,
  },
});
