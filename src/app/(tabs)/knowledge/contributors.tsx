import React from 'react';
import { FlatList, View, Text } from 'react-native';
import { mockAuthors, mockCountryStats } from '@/mocks/community-data';
import { ContributorRow } from '@/components/ContributorRow';
import { CountryStats } from '@/components/CountryStats';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';

export default function KnowledgeContributorsScreen() {
  const { searchQuery, selectedCountry, selectedCategory } = useKnowledgeSearchStore();

  const filteredAuthors = Object.values(mockAuthors).filter((author) => {
    const matchesSearch = searchQuery
      ? author.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        author.expertiseCategories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;

    const matchesCountry = selectedCountry
      ? author.countryVerifications.some((v) => v.countryName.toLowerCase() === selectedCountry.toLowerCase())
      : true;

    const matchesCategory = selectedCategory
      ? author.expertiseCategories.some((c) => c.toLowerCase() === selectedCategory.toLowerCase())
      : true;

    return matchesSearch && matchesCountry && matchesCategory;
  });

  const sortedContributors = filteredAuthors.sort((a, b) => b.totalHelpfulVotes - a.totalHelpfulVotes);

  return (
    <View className="flex-1 bg-neutral-50/40">
      <FlatList
        data={sortedContributors}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={() => (
          <View className="mb-4">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
              🏆 Top Verified Contributors ({sortedContributors.length})
            </Text>
          </View>
        )}
        renderItem={({ item, index }) => (
          <ContributorRow contributor={item} rank={index + 1} />
        )}
        ListFooterComponent={() => (
          <View className="mt-6 mb-8">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
              🌍 Country Pages & Experts
            </Text>
            {mockCountryStats.map((stats) => (
              <CountryStats key={stats.countryCode} stats={stats} variant="card" />
            ))}
          </View>
        )}
        ListEmptyComponent={() => (
          <View className="items-center justify-center py-12 bg-white rounded-3xl border border-neutral-100 p-6">
            <Text className="text-4xl mb-2">⭐</Text>
            <Text className="text-sm font-bold text-neutral-800">No contributors found</Text>
            <Text className="text-xs text-neutral-400 text-center mt-1 leading-relaxed max-w-[240px]">
              Try relaxing your filters or search terms to discover other community experts.
            </Text>
          </View>
        )}
      />
    </View>
  );
}
