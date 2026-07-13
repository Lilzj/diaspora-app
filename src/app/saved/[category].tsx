import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { SAVED_COLLECTION_CONFIG } from '@/types/saved';
import { useSavedStore } from '@/store/saved';
import { mockListings } from '@/mocks/data';
import { mockGuides, mockAuthors } from '@/mocks/community-data';
import { mockJobs } from '@/mocks/jobs-data';
import { GuideCard } from '@/components/GuideCard';
import { ProviderCard } from '@/components/ProviderCard';
import { JobCard } from '@/components/JobCard';

export default function SavedCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const config = SAVED_COLLECTION_CONFIG[category as keyof typeof SAVED_COLLECTION_CONFIG];
  
  const { savedItems } = useSavedStore();

  // Find bookmarked IDs for this category
  const bookmarkedIds: string[] = [];
  savedItems.forEach((type, id) => {
    if (type === category) {
      bookmarkedIds.push(id);
    }
  });

  // Filter relevant mock data
  const guides = category === 'Guide' ? mockGuides.filter((g) => bookmarkedIds.includes(g.guideId)) : [];
  const listings = category === 'Listing' ? mockListings.filter((l) => bookmarkedIds.includes(l.listingId)) : [];
  const jobs = category === 'Job' ? mockJobs.filter((j) => bookmarkedIds.includes(j.jobId)) : [];

  const totalCount = guides.length + listings.length + jobs.length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-neutral-600">←</Text>
        </TouchableOpacity>
        <Text className="text-xl mr-2">{config?.icon}</Text>
        <Text className="text-xl font-bold text-neutral-900">{config?.label}</Text>
      </View>

      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        {totalCount > 0 ? (
          <View>
            {category === 'Guide' &&
              guides.map((guide) => {
                const author = mockAuthors[guide.authorId];
                return (
                  <GuideCard
                    key={guide.guideId}
                    guide={guide as any}
                    author={author as any}
                    variant="list"
                  />
                );
              })}

            {category === 'Listing' &&
              listings.map((item) => (
                <ProviderCard
                  key={item.listingId}
                  listingId={item.listingId}
                  title={item.title}
                  category={item.category.name}
                  areaName={item.location?.areaName}
                  distanceKm={item.location?.distanceKm}
                  rating={item.rating.average}
                  reviewCount={item.rating.totalReviews}
                  coverImageUrl={item.coverImageUrl}
                  isVerified={item.verificationStatus === 'Verified'}
                  isOpenNow={item.isOpenNow}
                  variant="list"
                />
              ))}

            {category === 'Job' &&
              jobs.map((item) => (
                <JobCard
                  key={item.jobId}
                  job={item}
                  variant="list"
                />
              ))}
          </View>
        ) : (
          <View className="items-center justify-center py-20 bg-white border border-neutral-200 rounded-3xl p-6">
            <Text className="text-4xl mb-3">🔍</Text>
            <Text className="text-neutral-500 font-bold mb-2">No saved {config?.label?.toLowerCase()} yet.</Text>
            <TouchableOpacity onPress={() => router.push('/discover')}>
              <Text className="text-primary-500 font-extrabold text-sm mt-1">Discover {config?.label?.toLowerCase()} →</Text>
            </TouchableOpacity>
          </View>
        )}
        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
