import React from 'react';
import { FlatList, View, Text } from 'react-native';
import { mockGuides, mockAuthors } from '@/mocks/community-data';
import { GuideCard } from '@/components/GuideCard';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function KnowledgeGuidesScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { searchQuery, selectedCountry, selectedCategory, sortBy } = useKnowledgeSearchStore();

  const filteredGuides = mockGuides
    .filter((item) => {
      const matchesSearch = searchQuery
        ? item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.content.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesCountry = selectedCountry
        ? item.country.name.toLowerCase() === selectedCountry.toLowerCase()
        : true;
      const matchesCategory = selectedCategory
        ? item.category.toLowerCase() === selectedCategory.toLowerCase()
        : true;
      return matchesSearch && matchesCountry && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
      }
      if (sortBy === 'helpful') {
        return (b.helpfulCount + b.confirmedCount) - (a.helpfulCount + a.confirmedCount);
      }
      if (sortBy === 'updated') {
        return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
      }
      // trending
      return (b.helpfulCount + b.viewCount / 10) - (a.helpfulCount + a.viewCount / 10);
    });

  return (
    <View className="flex-1 bg-surface-background">
      {filteredGuides.length > 0 ? (
        <FlatList
          data={filteredGuides}
          keyExtractor={(item) => item.guideId}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          renderItem={({ item }) => {
            const author = mockAuthors[item.authorId];
            return (
              <GuideCard
                guide={{
                  ...item,
                  authorId: item.authorId,
                  country: item.country,
                }}
                author={{
                  userId: author.userId,
                  name: author.name,
                  avatarUrl: author.avatarUrl,
                  reputationLevel: author.reputationLevel,
                  isCountryVerified: author.countryVerifications.some((v) => v.isVerified),
                  primaryCountry: author.countryVerifications.find((v) => v.isVerified) || null,
                  expertiseCategories: author.expertiseCategories,
                  followerCount: author.followerCount,
                  isFollowedByUser: author.isFollowedByUser,
                }}
                variant="list"
              />
            );
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-4xl mb-2">📖</Text>
          <Text className="text-sm font-bold text-content-strong">No community guides found</Text>
          <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[240px]">
            Try relaxing your filters or searching for other items in our Knowledge Hub.
          </Text>
        </View>
      )}
    </View>
  );
}
