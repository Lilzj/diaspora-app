import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { mockGuideVersions, mockGuides, mockAuthors } from '@/mocks/community-data';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function GuideVersionsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = mockGuides.find((g) => g.guideId === id);
  const versions = mockGuideVersions.filter(v => v.guideId === id).sort((a, b) => b.versionNumber - a.versionNumber);

  if (!guide) return null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-content-primary" numberOfLines={1}>{guide.title}</Text>
          <Text className="text-sm text-content-muted">Version History</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-6"
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        {versions.map((version, index) => {
          const isLatest = index === 0;
          const authorName = mockAuthors[version.createdBy]?.name || 'Unknown';
          const date = new Date(version.createdAt).toLocaleDateString('en-GB', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return (
            <View key={version.versionId} className="bg-surface-card rounded-xl p-4 mb-4 border border-subtle">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center">
                  <Text className="text-base font-bold text-content-primary mr-2">Version {version.versionNumber}</Text>
                  {isLatest && (
                    <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                      <Text className="text-xs font-semibold text-primary-700">Current</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-content-muted">{date}</Text>
              </View>

              <Text className="text-sm text-content-tertiary mb-3">by {authorName}</Text>

              {version.changeSummary.length > 0 ? (
                <View className="bg-surface-background p-3 rounded-lg">
                  <Text className="text-xs font-semibold text-content-secondary mb-1.5">What's Changed:</Text>
                  {version.changeSummary.map((change, i) => (
                    <View key={i} className="flex-row items-start mb-1">
                      <Text className="text-xs text-content-faint mr-1.5">•</Text>
                      <Text className="text-sm text-content-tertiary flex-1">{change}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-content-faint italic">No change summary provided.</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
