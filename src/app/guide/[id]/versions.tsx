import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { mockGuideVersions, mockGuides, mockAuthors } from '@/mocks/community-data';

export default function GuideVersionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = mockGuides.find((g) => g.guideId === id);
  const versions = mockGuideVersions.filter(v => v.guideId === id).sort((a, b) => b.versionNumber - a.versionNumber);

  if (!guide) return null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-neutral-600">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-neutral-900" numberOfLines={1}>{guide.title}</Text>
          <Text className="text-sm text-neutral-500">Version History</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-6">
        {versions.map((version, index) => {
          const isLatest = index === 0;
          const authorName = mockAuthors[version.createdBy]?.name || 'Unknown';
          const date = new Date(version.createdAt).toLocaleDateString('en-GB', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return (
            <View key={version.versionId} className="bg-white rounded-xl p-4 mb-4 border border-neutral-200">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center">
                  <Text className="text-base font-bold text-neutral-900 mr-2">Version {version.versionNumber}</Text>
                  {isLatest && (
                    <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                      <Text className="text-xs font-semibold text-primary-700">Current</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-neutral-500">{date}</Text>
              </View>

              <Text className="text-sm text-neutral-600 mb-3">by {authorName}</Text>

              {version.changeSummary.length > 0 ? (
                <View className="bg-neutral-50 p-3 rounded-lg">
                  <Text className="text-xs font-semibold text-neutral-700 mb-1.5">What's Changed:</Text>
                  {version.changeSummary.map((change, i) => (
                    <View key={i} className="flex-row items-start mb-1">
                      <Text className="text-xs text-neutral-400 mr-1.5">•</Text>
                      <Text className="text-sm text-neutral-600 flex-1">{change}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-neutral-400 italic">No change summary provided.</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
