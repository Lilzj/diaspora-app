import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { mockCountryStats, mockGuides, mockAuthors, mockCommunityUpdates } from '@/mocks/community-data';
import { mockCategories } from '@/mocks/data';
import { CountryStats } from '@/components/CountryStats';
import { GuideCard } from '@/components/GuideCard';
import { ContributorRow } from '@/components/ContributorRow';
import { UpdateCard } from '@/components/UpdateCard';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function CountryPageScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { code } = useLocalSearchParams<{ code: string }>();
  const stats = mockCountryStats.find((c) => c.countryCode === code);

  if (!stats) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <Text>Country not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary-500">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const trendingGuides = stats.trendingGuideIds
    .map((id) => mockGuides.find((g) => g.guideId === id))
    .filter(Boolean);

  const topExperts = stats.topContributorIds
    .map((id) => mockAuthors[id])
    .filter(Boolean);

  // Find recent updates from this country
  const recentUpdates = mockCommunityUpdates.filter((up) => {
    const author = mockAuthors[up.authorId];
    return author?.countryVerifications.some((v) => v.countryCode === code);
  });

  return (
    // `edges={['top']}` rather than a bare `View`: this screen draws a full-bleed
    // hero behind its header, so it opted out of the safe area entirely and put
    // the back button at a hardcoded `top-12`. That is the status bar's height
    // on some phones and not others — on the device capture the clock sits on
    // top of the stats cards. The hero still bleeds; only the controls move.
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      {/* Back navigation toggle */}
      <View className="absolute top-4 left-6 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-black/40 rounded-full w-10 h-10 items-center justify-center"
        >
          <Text className="text-xl text-white">←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" bounces={false} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* Full stats header block containing counts */}
        <CountryStats stats={stats} variant="full" />

        <View className="p-6">
          
          {/* Quick Categories Navigation shortcuts */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
            Explore Categories in {stats.countryName}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-6 gap-2">
            {mockCategories.slice(0, 5).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/discover',
                    params: { category: cat.id },
                  })
                }
                className="bg-surface-card border border-subtle rounded-2xl px-4 py-3 flex-row items-center mr-2 shadow-sm"
              >
                <Text className="text-sm mr-1.5">{cat.icon}</Text>
                <Text className="text-xs font-bold text-content-secondary">{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Trending Guides list */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
            🔥 Trending Guides
          </Text>
          {trendingGuides.length > 0 ? (
            trendingGuides.map((guide) => {
              if (!guide) return null;
              const author = mockAuthors[guide.authorId];
              return (
                <GuideCard
                  key={guide.guideId}
                  guide={guide as any}
                  author={author as any}
                  variant="list"
                />
              );
            })
          ) : (
            <View className="bg-surface-card rounded-2xl p-4 border border-faint mb-6">
              <Text className="text-xs text-content-faint text-center font-bold">No trending guides published yet.</Text>
            </View>
          )}

          {/* Recent Updates list */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-4 mb-3">
            📢 Recent Community Alerts
          </Text>
          {recentUpdates.length > 0 ? (
            recentUpdates.map((update) => {
              const author = mockAuthors[update.authorId];
              return (
                <UpdateCard
                  key={update.updateId}
                  update={update}
                  author={author as any}
                />
              );
            })
          ) : (
            <View className="bg-surface-card rounded-2xl p-4 border border-faint mb-6">
              <Text className="text-xs text-content-faint text-center font-bold">No active local updates reported today.</Text>
            </View>
          )}

          {/* Expert Contributors Ranking list */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mt-4 mb-3">
            🏅 Verified Local Experts
          </Text>
          {topExperts.length > 0 ? (
            topExperts.map((expert, idx) => (
              <ContributorRow key={expert.userId} contributor={expert} rank={idx + 1} />
            ))
          ) : (
            <View className="bg-surface-card rounded-2xl p-4 border border-faint">
              <Text className="text-xs text-content-faint text-center font-bold">No local experts verified yet.</Text>
            </View>
          )}
          
        </View>
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
