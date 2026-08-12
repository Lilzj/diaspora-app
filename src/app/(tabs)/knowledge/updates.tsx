import React from 'react';
import { FlatList, View, Text, Switch } from 'react-native';
import { mockCommunityUpdates, mockAuthors } from '@/mocks/community-data';
import { UpdateCard } from '@/components/UpdateCard';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';

export default function KnowledgeUpdatesScreen() {
  const {
    searchQuery,
    selectedCategory,
    selectedCountry,
    sortBy,
    showExpiredUpdates,
    toggleShowExpiredUpdates,
  } = useKnowledgeSearchStore();

  const filteredUpdates = mockCommunityUpdates
    .filter((item) => {
      // Exclude expired by default
      if (item.isExpired && !showExpiredUpdates) return false;

      const matchesSearch = searchQuery
        ? item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      // Filter by Category
      const matchesCategory = selectedCategory
        ? item.category.toLowerCase().includes(selectedCategory.toLowerCase())
        : true;

      // Filter by Country (match author's country certifications)
      const author = mockAuthors[item.authorId];
      const matchesCountry = selectedCountry && author
        ? author.countryVerifications.some((v) => v.countryName.toLowerCase() === selectedCountry.toLowerCase())
        : true;

      return matchesSearch && matchesCategory && matchesCountry;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      // default / trending: sort by confirmation count & urgency
      const aScore = a.confirmationCount + (a.urgency === 'Emergency' ? 20 : a.urgency === 'Urgent' ? 10 : 0);
      const bScore = b.confirmationCount + (b.urgency === 'Emergency' ? 20 : b.urgency === 'Urgent' ? 10 : 0);
      return bScore - aScore;
    });

  return (
    <View className="flex-1 bg-neutral-50/40">
      {/* Archive / Expired Toggle */}
      <View className="flex-row items-center justify-between px-6 py-3 bg-white border-b border-neutral-100">
        <View className="flex-1 pr-4">
          <Text className="text-xs font-bold text-neutral-800">Show Expired Alerts</Text>
          <Text className="text-[10px] text-neutral-400 mt-0.5">
            Display outdated warnings or expired community listings.
          </Text>
        </View>
        <Switch
          value={showExpiredUpdates}
          onValueChange={toggleShowExpiredUpdates}
          trackColor={{ false: '#E5E7EB', true: '#F59300' }}
          thumbColor={showExpiredUpdates ? '#FFF' : '#FFF'}
        />
      </View>

      {filteredUpdates.length > 0 ? (
        <FlatList
          data={filteredUpdates}
          keyExtractor={(item) => item.updateId}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const author = mockAuthors[item.authorId];
            return (
              <UpdateCard
                update={{
                  ...item,
                  location: {
                    areaName: item.location.areaName,
                    cityName: item.location.cityName,
                    distanceKm: 1.8,
                  },
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
              />
            );
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-4xl mb-2">📢</Text>
          <Text className="text-sm font-bold text-neutral-800">No community alerts found</Text>
          <Text className="text-xs text-neutral-400 text-center mt-1 leading-relaxed max-w-[240px]">
            There are no active alerts in this location. Turn on "Show Expired Alerts" to review archived messages.
          </Text>
        </View>
      )}
    </View>
  );
}
