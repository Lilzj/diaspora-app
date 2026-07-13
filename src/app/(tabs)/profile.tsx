import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useReputationStore } from '@/store/reputation';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import Svg, { Circle } from 'react-native-svg';
import { mockGuides, mockAuthors } from '@/mocks/community-data';
import { GuideCard } from '@/components/GuideCard';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { reputation, loadReputation } = useReputationStore();
  const [activeSubTab, setActiveSubTab] = useState<'Timeline' | 'Saved' | 'Drafts'>('Timeline');

  useEffect(() => {
    loadReputation();
  }, []);

  const publishedGuides = mockGuides.filter((g) => g.authorId === 'user-123');

  // Mock drafts for layout
  const mockDrafts = [
    { id: 'draft-1', title: 'Immigration steps for moving to London from Côte d\'Ivoire', category: 'Immigration', progress: '40% complete' },
    { id: 'draft-2', title: 'Best African retail and cosmetics stores in PECKHAM', category: 'Retail', progress: '85% complete' },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-neutral-100 bg-white flex-row items-center justify-between">
        <Text className="text-2xl font-black text-neutral-900 tracking-tight">My Profile</Text>
        <TouchableOpacity onPress={() => logout()} className="bg-neutral-50 p-2 rounded-xl border border-neutral-200">
          <Text className="text-xs font-bold text-error-default">Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Core Identity Panel */}
        <View className="bg-white p-6 border-b border-neutral-100 items-center">
          <Avatar name={user?.name || 'Amara Kone'} size={84} />
          
          <View className="flex-row items-center mt-3.5">
            <Text className="text-xl font-black text-neutral-900 mr-2">{user?.name || 'Amara Kone'}</Text>
            <Text className="text-xs bg-[#E6F4EA] text-success-default px-2 py-0.5 rounded font-extrabold">✓ VERIFIED</Text>
          </View>
          <Text className="text-xs text-neutral-500 font-semibold mb-3">{user?.email || 'amara@diaspora.com'}</Text>

          {/* Reputation Badge */}
          {reputation && (
            <TouchableOpacity
              onPress={() => router.push('/profile/reputation')}
              className="bg-neutral-50 px-4 py-2.5 rounded-full flex-row items-center border border-neutral-200 mb-6"
            >
              <ReputationBadge level={reputation.level} />
              <Text className="text-[10px] text-primary-500 font-extrabold ml-2 border-l border-neutral-200 pl-2">
                REPUTATION DASHBOARD →
              </Text>
            </TouchableOpacity>
          )}

          {/* Creator Studio Card */}
          <TouchableOpacity
            onPress={() => router.push('/profile/creator-dashboard')}
            className="w-full bg-primary-50/20 border border-primary-100 rounded-3xl p-4 flex-row items-center justify-between mb-4 mt-2"
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">🎨</Text>
              <View>
                <Text className="text-sm font-bold text-neutral-850">Creator Studio</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">Manage guides & view community impact</Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">GO →</Text>
          </TouchableOpacity>

          {/* Profile Completion Circular progress block (75%) */}
          <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-4 w-full flex-row items-center justify-between mb-2">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-bold text-neutral-800">Profile 75% Complete</Text>
              <Text className="text-xs text-neutral-500 leading-relaxed mt-0.5">
                Add your local address and phone status to unlock premium directories.
              </Text>
            </View>
            <Svg height="50" width="50" viewBox="0 0 36 36">
              <Circle cx="18" cy="18" r="16" fill="none" stroke="#E5E7EB" strokeWidth="3.5" />
              <Circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="#FF6B00"
                strokeWidth="3.5"
                strokeDasharray="100"
                strokeDashoffset="25" // 75%
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
              <Text style={{ position: 'absolute', top: 16, left: 13 }} className="text-[10px] font-black text-neutral-800">75%</Text>
            </Svg>
          </View>

          {/* Verification statistics */}
          <View className="flex-row justify-between w-full mt-4 border-t border-neutral-100 pt-5">
            <View className="items-center flex-1 border-r border-neutral-100">
              <Text className="text-lg font-black text-neutral-900">2 yrs</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase">UK Resident</Text>
            </View>
            <View className="items-center flex-1 border-r border-neutral-100">
              <Text className="text-lg font-black text-neutral-900">{reputation?.helpfulVotesReceived || 45}</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase">Helpful Votes</Text>
            </View>
            <View className="items-center flex-1">
              <Text className="text-lg font-black text-neutral-900">#14</Text>
              <Text className="text-[10px] text-neutral-400 font-bold uppercase">London Rank</Text>
            </View>
          </View>
        </View>

        {/* Badge & Achievement chips */}
        <View className="bg-white px-6 py-4 border-b border-neutral-100">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Earned Badges</Text>
          <View className="flex-row flex-wrap gap-2">
            <Text className="text-[10px] font-bold text-success-default bg-[#E6F4EA] border border-[#CEEAD6] px-2.5 py-1 rounded-lg">🇨🇮 Côte d'Ivoire Resident</Text>
            <Text className="text-[10px] font-bold text-success-default bg-[#E6F4EA] border border-[#CEEAD6] px-2.5 py-1 rounded-lg">🇬🇧 London Verified</Text>
            <Text className="text-[10px] font-bold text-neutral-700 bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg">📱 Phone Verified</Text>
          </View>
        </View>

        {/* Profile Details sub-tabs selectors */}
        <View className="flex-row bg-white border-b border-neutral-100 mt-3">
          {['Timeline', 'Saved', 'Drafts'].map((tab) => {
            const isActive = activeSubTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveSubTab(tab as any)}
                className={`flex-1 items-center py-3.5 border-b-2 ${
                  isActive ? 'border-primary-500' : 'border-transparent'
                }`}
              >
                <Text className={`text-xs font-bold ${isActive ? 'text-primary-500' : 'text-neutral-500'}`}>
                  {tab === 'Timeline' ? '📝 My Contributions' : tab === 'Saved' ? '🔖 Saved Collections' : '✏️ My Drafts'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sub-tab view layouts */}
        <View className="p-6">
          
          {/* Timeline Tab */}
          {activeSubTab === 'Timeline' && (
            <View>
              {publishedGuides.length > 0 ? (
                publishedGuides.map((guide) => {
                  const author = mockAuthors['user-123'];
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
                <View className="items-center py-10 bg-white border border-neutral-200 rounded-3xl p-6">
                  <Text className="text-3xl mb-2">📝</Text>
                  <Text className="text-xs font-bold text-neutral-800">No guides published yet</Text>
                  <Text className="text-[10px] text-neutral-400 mt-1 leading-relaxed text-center">
                    Share your local expertise by creating a guide for other diaspora newcomers.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Saved Tab */}
          {activeSubTab === 'Saved' && (
            <View className="flex-col gap-3">
              <TouchableOpacity
                onPress={() => router.push('/saved')}
                className="bg-white border border-neutral-200 rounded-2xl p-4 flex-row items-center justify-between"
              >
                <View className="flex-row items-center">
                  <Text className="text-2xl mr-3">📖</Text>
                  <View>
                    <Text className="text-sm font-bold text-neutral-800">Saved Guides</Text>
                    <Text className="text-xs text-neutral-500 mt-0.5">8 articles bookmarked</Text>
                  </View>
                </View>
                <Text className="text-neutral-300 text-lg">›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/saved')}
                className="bg-white border border-neutral-200 rounded-2xl p-4 flex-row items-center justify-between"
              >
                <View className="flex-row items-center">
                  <Text className="text-2xl mr-3">📍</Text>
                  <View>
                    <Text className="text-sm font-bold text-neutral-800">Saved Providers</Text>
                    <Text className="text-xs text-neutral-500 mt-0.5">12 service listings</Text>
                  </View>
                </View>
                <Text className="text-neutral-300 text-lg">›</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Drafts Tab */}
          {activeSubTab === 'Drafts' && (
            <View>
              {mockDrafts.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => router.push('/guide/create')}
                  className="bg-white border border-neutral-200 rounded-2xl p-4 mb-3 flex-row justify-between items-center"
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">{d.category}</Text>
                    <Text className="text-sm font-bold text-neutral-800 mt-1 leading-snug">{d.title}</Text>
                    <Text className="text-[10px] text-neutral-400 font-semibold mt-1.5">✏️ Unfinished · {d.progress}</Text>
                  </View>
                  <Text className="text-neutral-300 text-lg">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
