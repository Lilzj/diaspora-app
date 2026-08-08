import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Alert, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExploreStore } from '@/store/explore';
import { mockTutorials } from '@/mocks/explore-data';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';

export default function TutorialReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useExploreStore();
  const { user } = useAuthStore();
  const { showAlert } = useNotification();

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
      <SafeAreaView className="flex-1 bg-neutral-50 justify-center items-center">
        <Text className="text-sm font-semibold text-neutral-400">Loading guide...</Text>
      </SafeAreaView>
    );
  }

  if (!tutorial) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-50 justify-center items-center px-6">
        <Text className="text-4xl mb-4">⚠️</Text>
        <Text className="text-base font-black text-neutral-900 text-center">Tutorial not found</Text>
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

  const handleLaunchTour = () => {
    const isRestricted = !user?.accountState || [
      'DiasporaVerificationPending',
      'VerificationUnderReview',
      'VerificationRejected',
      'RequiresMoreInformation',
      'Suspended',
      'Restricted',
      'AppealPending'
    ].includes(user.accountState);

    if (isRestricted) {
      showAlert({
        type: 'warning',
        title: 'Verification Required',
        message: 'Interactive live walkthroughs are only available for fully verified members. Please wait for safety verification approval.',
      });
      return;
    }

    if (tutorial.relatedTourId) {
      store.startTour(tutorial.relatedTourId);
      router.replace('/'); // Launch in home dashboard where elements reside
    }
  };

  const stepsLength = tutorial.steps.length;
  const activeStepDetail = tutorial.steps[activeStep];

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'bottom']}>
      {/* Top Navbar */}
      <View className="px-6 py-4 border-b border-neutral-100 bg-white flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text className="text-sm font-black text-neutral-900 tracking-tight" numberOfLines={1} style={{ maxWidth: 200 }}>
            {tutorial.title}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          {/* Save/Bookmark button */}
          <TouchableOpacity
            onPress={() => store.toggleSaveTutorial(tutorial.id)}
            className="w-10 h-10 items-center justify-center bg-neutral-50 border border-neutral-200 rounded-xl"
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark tutorial'}
          >
            <Text className="text-sm">{isBookmarked ? '🔖' : '🖤'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-5" showsVerticalScrollIndicator={false}>
        {/* Banner metadata */}
        <View className="bg-white border border-neutral-200 rounded-3xl p-4 mb-5 flex-row justify-between items-center shadow-sm">
          <View>
            <Text className="text-[9px] font-black text-primary-500 uppercase tracking-widest">
              Category: {tutorial.categoryId.replace('-', ' ')}
            </Text>
            <Text className="text-xs font-bold text-neutral-600 mt-1">
              ⏱️ {tutorial.readingTimeMinutes} mins read · {tutorial.difficulty}
            </Text>
          </View>
          
          <View className="bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-1">
            <Text className="text-[10px] font-black text-neutral-500 uppercase">
              {isCompleted ? '✓ Completed' : 'Not finished'}
            </Text>
          </View>
        </View>

        {/* Cover Image */}
        {tutorial.imageUrl && (
          <View style={styles.imageContainer} className="rounded-3xl border border-neutral-200 mb-5 overflow-hidden shadow-sm">
            <Image
              source={{ uri: tutorial.imageUrl }}
              className="w-full h-44 object-cover"
            />
          </View>
        )}

        {/* Description Header */}
        <Text className="text-lg font-black text-neutral-900 leading-snug mb-3">
          {tutorial.title}
        </Text>
        <Text className="text-xs text-neutral-500 leading-relaxed mb-6">
          {tutorial.summary}
        </Text>

        {/* Stepper Interactive Section */}
        {stepsLength > 0 && (
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-md">
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
                      idx === activeStep ? 'w-4 bg-primary-500' : 'w-1.5 bg-neutral-200'
                    }`}
                  />
                ))}
              </View>
            </View>

            {/* Step Content */}
            <View className="min-h-[140px]">
              <Text className="text-sm font-black text-neutral-900 leading-snug mb-2">
                {activeStepDetail.title}
              </Text>
              <Text className="text-xs text-neutral-600 leading-relaxed">
                {activeStepDetail.description}
              </Text>
            </View>

            {/* Stepper Navigation buttons */}
            <View className="flex-row justify-between items-center border-t border-neutral-100 pt-4 mt-2">
              <TouchableOpacity
                onPress={() => setActiveStep(prev => Math.max(0, prev - 1))}
                disabled={activeStep === 0}
                className={`px-4 py-2 rounded-xl border ${
                  activeStep === 0 ? 'opacity-30 border-neutral-100' : 'border-neutral-200 bg-neutral-50'
                }`}
              >
                <Text className="text-xs font-bold text-neutral-600">Previous</Text>
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
            <Text className="text-sm font-black text-neutral-900 text-center">
              Want a live demonstration?
            </Text>
            <Text className="text-xs text-neutral-500 mt-1.5 text-center leading-relaxed max-w-[280px] mb-4">
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
