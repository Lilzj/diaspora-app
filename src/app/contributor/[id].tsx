import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { mockAuthors, mockGuides } from '@/mocks/community-data';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import { FollowButton } from '@/components/FollowButton';
import { GuideCard } from '@/components/GuideCard';
import { ProviderNotificationModal } from '@/components/ProviderNotificationModal';
import { useProviderNotificationStore, DEFAULT_PROVIDER_SETTINGS } from '@/store/provider-notifications';

export default function ContributorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const author = mockAuthors[id];

  if (!author) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text>Contributor not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary-500">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const authorGuides = mockGuides.filter((g) => g.authorId === id);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const settings = useProviderNotificationStore(
    (s) => s.settings[author.userId] || DEFAULT_PROVIDER_SETTINGS
  );

  // Generate reputation dimensions based on votes and contributions
  const contributionScore = author.guidesPublished * 20 + author.updatesPublished * 5;
  const verificationScore = Math.min(author.totalHelpfulVotes / 6 + 100, 500);
  const trustScore = 95; // base score

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      {/* Navigation Header */}
      <View className="px-6 py-4 border-b border-neutral-100 bg-white flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-xl text-neutral-600">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-black text-neutral-900 tracking-tight">Expert Contributor</Text>
        </View>
        
        {/* Notification preferences modal trigger */}
        <TouchableOpacity
          onPress={() => setNotifModalVisible(true)}
          className="bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-bold text-neutral-600">
            🔔 Alerts: {settings.enabled ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        

        {/* Hero Card Identity */}
        <View className="bg-white p-6 border-b border-neutral-100 items-center">
          <Avatar name={author.name} size={84} />
          
          <Text className="text-xl font-black text-neutral-900 mt-4 text-center">{author.name}</Text>
          <View className="flex-row items-center mt-2.5 mb-4">
            <ReputationBadge level={author.reputationLevel} />
            {author.isTopContributor && (
              <Text className="text-[9px] font-black text-success-default bg-[#E6F4EA] border border-[#CEEAD6] px-2 py-0.5 rounded-md ml-2">
                🏅 MONTHLY TOP CONTRIBUTOR
              </Text>
            )}
          </View>

          {/* Follow toggle button */}
          <FollowButton userId={author.userId} isFollowing={author.isFollowedByUser} size="lg" className="w-full" />

          {/* Followers metrics */}
          <View className="flex-row justify-between w-full mt-6 border-t border-neutral-100 pt-5">
            <View className="items-center flex-1 border-r border-neutral-100">
              <Text className="text-lg font-black text-neutral-900">{author.totalHelpfulVotes}</Text>
              <Text className="text-[9px] text-neutral-400 font-bold uppercase">Helpful Votes</Text>
            </View>
            <View className="items-center flex-1 border-r border-neutral-100">
              <Text className="text-lg font-black text-neutral-900">{author.followerCount}</Text>
              <Text className="text-[9px] text-neutral-400 font-bold uppercase">Followers</Text>
            </View>
            <View className="items-center flex-1">
              <Text className="text-lg font-black text-neutral-900">#{author.guidesPublished + author.updatesPublished}</Text>
              <Text className="text-[9px] text-neutral-400 font-bold uppercase">Publications</Text>
            </View>
          </View>
        </View>

        {/* Trust Verification metrics detail */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mt-3">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Verified Resident Badges</Text>
          {author.countryVerifications.map((v) => (
            <View key={v.countryCode} className="flex-row items-center justify-between py-2 border-b border-neutral-50 last:border-0">
              <View className="flex-row items-center">
                <Text className="text-xl mr-2">{v.flag}</Text>
                <View>
                  <Text className="text-xs font-bold text-neutral-800">{v.countryName} Verified Resident</Text>
                  <Text className="text-[10px] text-neutral-500 mt-0.5">Resident since {v.arrivalYear} · {v.yearsOfResidence} yrs of advice</Text>
                </View>
              </View>
              <Text className="text-[9px] font-black text-success-default bg-[#E6F4EA] px-2 py-0.5 rounded">PASSED</Text>
            </View>
          ))}
        </View>

        {/* Three dimensional Reputation Score breakdown */}
        <View className="bg-white px-6 py-5 border-b border-neutral-100 mt-3">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Reputation Scorecard Dimensions</Text>
          
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 bg-neutral-50 p-3 rounded-2xl border border-neutral-100 mr-2">
              <Text className="text-lg font-black text-neutral-800">{contributionScore}</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Contribution</Text>
            </View>
            <View className="flex-1 bg-neutral-50 p-3 rounded-2xl border border-neutral-100 mr-2">
              <Text className="text-lg font-black text-neutral-800">{Math.round(verificationScore)}</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Verification</Text>
            </View>
            <View className="flex-1 bg-neutral-50 p-3 rounded-2xl border border-neutral-100">
              <Text className="text-lg font-black text-neutral-800">{trustScore}%</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Trust Weight</Text>
            </View>
          </View>
        </View>

        {/* List of Published Guides by this author */}
        <View className="p-6">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
            Guides by {author.name.split(' ')[0]} ({authorGuides.length})
          </Text>
          {authorGuides.length > 0 ? (
            authorGuides.map((guide) => (
              <GuideCard
                key={guide.guideId}
                guide={guide as any}
                author={author as any}
                variant="list"
              />
            ))
          ) : (
            <View className="bg-white rounded-3xl p-6 border border-neutral-200 items-center justify-center">
              <Text className="text-3xl mb-1">📖</Text>
              <Text className="text-xs font-bold text-neutral-400">No guides published yet.</Text>
            </View>
          )}
        </View>

        <View className="h-8" />
      </ScrollEndScrollView>
      <ProviderNotificationModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        providerId={author.userId}
        providerName={author.name}
      />
    </SafeAreaView>
  );
}
