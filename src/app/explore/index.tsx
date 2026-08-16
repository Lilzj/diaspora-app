import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, FlatList, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useExploreStore } from '@/store/explore';
import { mockTutorialCategories, mockTutorials, mockReleaseAnnouncements } from '@/mocks/explore-data';
import { FEATURE_TOURS } from '@/config/featureRegistry';
import { TUTORIAL_GROUP_ORDER, TUTORIAL_GROUP_LABELS } from '@/types/explore';
import { CategoryCard } from '@/components/explore/CategoryCard';
import { TutorialCard } from '@/components/explore/TutorialCard';
import { AnnouncementCard } from '@/components/explore/AnnouncementCard';
import { WelcomeModal } from '@/components/explore/WelcomeModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/apiClient';
import { useLaunchTour } from '@/components/explore/useLaunchTour';
import { useThemeTokens } from '@/design-system';

export default function ExploreDashboardScreen() {
  const tokens = useThemeTokens();
  const { user } = useAuthStore();
  const launchTour = useLaunchTour();
  const store = useExploreStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [recommendedTutorials, setRecommendedTutorials] = useState<any[]>([]);

  // Load persistent progress on mount
  useEffect(() => {
    store.loadPersistedState();
    
    // Fetch smart recommendations based on user verifications
    const fetchRecommendations = async () => {
      try {
        const res = await apiClient.get('/explore/recommendations', {
          params: {
            isVerified: user ? 'true' : 'false',
          },
        });
        setRecommendedTutorials(res.data.data);
      } catch (err) {
        console.error('Failed to load recommended tutorials', err);
        // Fallback to local filtering
        setRecommendedTutorials(mockTutorials.slice(0, 3));
      }
    };
    fetchRecommendations();
  }, [user]);

  // Compute overall learning metrics
  const totalTutorials = mockTutorials.length;
  const completedCount = store.completedTutorials.length;
  const completionPercentage = totalTutorials > 0 ? Math.round((completedCount / totalTutorials) * 100) : 0;
  const toursCompleted = store.completedTours.length;
  const totalTours = FEATURE_TOURS.length;

  // Fuzzy Search + Category Filters
  const searchResults = useMemo(() => {
    return mockTutorials.filter((tut) => {
      const matchesCategory = selectedCategoryId ? tut.categoryId === selectedCategoryId : true;
      
      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchesCategory;

      const titleMatch = tut.title.toLowerCase().includes(q);
      const summaryMatch = tut.summary.toLowerCase().includes(q);
      const stepMatch = tut.steps.some(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));

      return matchesCategory && (titleMatch || summaryMatch || stepMatch);
    });
  }, [searchQuery, selectedCategoryId]);

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      store.addSearchTerm(searchQuery.trim());
    }
  };

  // Gating, tour start and the route all live in `useLaunchTour` — this screen
  // and the tutorial reader had copied the same twenty lines, including the
  // `router.replace('/')` that landed the member on the auth Welcome screen.
  const handleReplayTour = (tourId: any) => launchTour(tourId);

  // Split tutorials for specialized Academy sections
  const creatorAcademyTutorials = useMemo(() => {
    return mockTutorials.filter(t => t.categoryId === 'creator-academy');
  }, []);

  const safetyAcademyTutorials = useMemo(() => {
    return mockTutorials.filter(t => t.categoryId === 'safety-academy');
  }, []);

  // Filter bookmarked tutorials
  const bookmarkedList = useMemo(() => {
    return mockTutorials.filter(t => store.bookmarks.includes(t.id));
  }, [store.bookmarks]);

  // Filter recently viewed
  const recentlyViewedList = useMemo(() => {
    return store.recentlyViewed
      .map(id => mockTutorials.find(t => t.id === id))
      .filter((t): t is any => !!t);
  }, [store.recentlyViewed]);

  return (
    <SafeAreaView className="flex-1 bg-surface-background" edges={['top']}>
      {/* Page Header */}
      <View className="px-6 py-4 border-b border-faint bg-surface-card flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-black text-content-primary tracking-tight">Explore Diaspora</Text>
            <Text className="text-[10px] text-content-faint font-bold uppercase tracking-wider">Product Education Hub</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setShowWelcome(true)}
          className="bg-surface-background px-3 py-2 rounded-xl border border-subtle"
        >
          <Text className="text-[10px] font-bold text-content-tertiary">Onboarding Tour</Text>
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Learning Progress Panel */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3">
            Learning Progress
          </Text>
          
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-bold text-content-strong">
              {completionPercentage}% of Academy Completed
            </Text>
            <Text className="text-xs font-semibold text-content-faint">
              {completedCount}/{totalTutorials} Guides read
            </Text>
          </View>

          {/* Progress Bar */}
          <View className="h-2.5 w-full bg-surface-muted rounded-full overflow-hidden mb-4">
            <View
              className="h-full bg-primary-500 rounded-full"
              style={{ width: `${completionPercentage}%` }}
            />
          </View>

          <View className="flex-row justify-between items-center bg-surface-background border border-subtle rounded-2xl p-3">
            <View className="flex-row items-center">
              <Text className="text-lg mr-2.5">🔍</Text>
              <View>
                <Text className="text-xs font-bold text-content-secondary">Features Discovered</Text>
                <Text className="text-[10px] text-content-faint">
                  {toursCompleted} of {totalTours} platform guides completed
                </Text>
              </View>
            </View>
            <View className="bg-primary-50 px-2.5 py-1 rounded-lg">
              <Text className="text-[10px] font-black text-primary-500">
                {toursCompleted}/{totalTours} Tours
              </Text>
            </View>
          </View>
        </View>

        {/* Unified Knowledge Search Bar */}
        <View className="px-6 py-4 bg-surface-card border-b border-faint mb-3">
          <View className="flex-row items-center h-12 bg-surface-background border border-subtle rounded-2xl px-3.5">
            <Text className="text-lg mr-2.5 text-content-faint">🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              placeholder="Search help topics naturally..."
              className="flex-1 text-xs font-semibold text-content-strong h-full"
              placeholderTextColor={tokens.color.text.placeholder}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                <Text className="text-xs text-content-muted">✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* SEARCH MODE OR CATEGORY VIEW */}
        {searchQuery || selectedCategoryId ? (
          <View className="bg-surface-card px-6 py-5 border-b border-faint flex-1">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm font-black text-content-primary">
                Search Results ({searchResults.length})
              </Text>
              
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategoryId(null);
                }}
                className="bg-surface-background border border-subtle px-3 py-1 rounded-full"
              >
                <Text className="text-[10px] font-bold text-content-muted">Clear filters</Text>
              </TouchableOpacity>
            </View>

            {searchResults.length > 0 ? (
              searchResults.map((tut) => (
                <TutorialCard key={tut.id} tutorial={tut} />
              ))
            ) : (
              <View className="items-center py-12">
                <Text className="text-4xl mb-3">🧐</Text>
                <Text className="text-sm font-bold text-content-strong">No tutorials found</Text>
                <Text className="text-xs text-content-muted mt-1 text-center leading-relaxed">
                  Try searching for "verification", "guide", "scam" or "reputation"
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* STANDARD HUB DASHBOARD VIEW */
          <View>
            {/*
              §11: "Do not turn the page into an enormous list of disconnected
              feature cards."

              Thirteen categories in one horizontal rail is that list — the
              member scrolls sideways past things with no relation to each
              other, and whatever is at the far end is never seen. One rail per
              shelf instead, in the order of the journey: arrive, find your
              people, earn, live, make, get paid, grow, measure, stay safe,
              learn more. A shelf with nothing on it does not render.
            */}
            <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
              <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-1">
                Learning Centre
              </Text>
              <Text className="text-[11px] text-content-faint font-semibold mb-4">
                Everything Diaspora does, grouped by what you came here to do
              </Text>

              {TUTORIAL_GROUP_ORDER.map((group) => {
                const inGroup = mockTutorialCategories.filter((cat) => cat.group === group);
                if (inGroup.length === 0) return null;

                return (
                  <View key={group} className="mb-4">
                    <Text className="text-[11px] font-black text-content-secondary tracking-tight mb-2">
                      {TUTORIAL_GROUP_LABELS[group]}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingRight: 16 }}
                      accessibilityRole="list"
                      accessibilityLabel={TUTORIAL_GROUP_LABELS[group]}
                    >
                      {inGroup.map((cat) => (
                        <CategoryCard
                          key={cat.id}
                          category={cat}
                          onPress={() => setSelectedCategoryId(cat.id)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
            </View>

            {/* Smart Recommendations Carousel */}
            {recommendedTutorials.length > 0 && (
              <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
                <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3">
                  Recommended For You
                </Text>
                
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 16 }}
                >
                  {recommendedTutorials.map((tut) => (
                    <TutorialCard key={tut.id} tutorial={tut} variant="grid" />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Recently Viewed Carousel */}
            {recentlyViewedList.length > 0 && (
              <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
                <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3">
                  Recently Viewed
                </Text>
                
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 16 }}
                >
                  {recentlyViewedList.map((tut) => (
                    <TutorialCard key={tut.id} tutorial={tut} variant="grid" />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Bookmarks Section */}
            {bookmarkedList.length > 0 && (
              <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
                <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3">
                  Bookmarks & Saved Tutorials ({bookmarkedList.length})
                </Text>
                {bookmarkedList.map((tut) => (
                  <TutorialCard key={tut.id} tutorial={tut} />
                ))}
              </View>
            )}

            {/* Academy Modules */}
            <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs font-black text-content-muted uppercase tracking-widest">
                  🎨 Creator Academy
                </Text>
                <Text className="text-[10px] text-primary-500 font-bold">Writing Better Guides</Text>
              </View>
              {creatorAcademyTutorials.slice(0, 3).map((tut) => (
                <TutorialCard key={tut.id} tutorial={tut} />
              ))}
            </View>

            <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs font-black text-content-muted uppercase tracking-widest">
                  🛡️ Safety Academy
                </Text>
                <Text className="text-[10px] text-success-default font-bold">Avoiding Scams</Text>
              </View>
              {safetyAcademyTutorials.slice(0, 3).map((tut) => (
                <TutorialCard key={tut.id} tutorial={tut} />
              ))}
            </View>

            {/* Replay Tours Directory */}
            <View className="bg-surface-card py-5 px-6 border-b border-faint mb-3">
              <Text className="text-xs font-black text-content-muted uppercase tracking-widest mb-3.5">
                Replay Product Tours
              </Text>
              
              <View className="flex-col gap-2.5">
                {FEATURE_TOURS.map((tour) => {
                  const isCompletedTour = store.completedTours.includes(tour.id);
                  return (
                    <TouchableOpacity
                      key={tour.id}
                      onPress={() => handleReplayTour(tour.id)}
                      className="bg-surface-background border border-subtle rounded-2xl p-4 flex-row items-center justify-between"
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel={`Replay ${tour.title}. ${isCompletedTour ? 'Completed before' : 'Not completed yet'}`}
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-xs font-black text-content-primary">
                          {tour.title}
                        </Text>
                        <Text className="text-[10px] text-content-faint mt-0.5" numberOfLines={1}>
                          {tour.description}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        {isCompletedTour && (
                          <Text className="text-[9px] bg-success-surface text-success-default px-1.5 py-0.5 rounded font-bold">
                            ✓ COMPLETED
                          </Text>
                        )}
                        <Text className="text-xs text-primary-500 font-extrabold">REPLAY →</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Release Announcements / Release Notes */}
            <View className="bg-surface-card pt-5 pb-1 px-6 border-b border-faint">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xs font-black text-content-muted uppercase tracking-widest">
                  What's New in Diaspora
                </Text>
                <TouchableOpacity onPress={() => router.push('/explore/release-notes')}>
                  <Text className="text-xs text-primary-500 font-bold">All release logs →</Text>
                </TouchableOpacity>
              </View>

              {mockReleaseAnnouncements.slice(0, 1).map((ann) => (
                <AnnouncementCard key={ann.version} announcement={ann} />
              ))}
            </View>
          </View>
        )}
        <View className="h-2" />
      </ScrollEndScrollView>

      {/* Welcome Onboarding Modal */}
      <WelcomeModal visible={showWelcome} onClose={() => setShowWelcome(false)} />
    </SafeAreaView>
  );
}
