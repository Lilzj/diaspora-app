import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useReputationStore } from '@/store/reputation';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import { useTrustStore } from '@/store/trust';
import Svg, { Circle } from 'react-native-svg';
import { mockGuides, mockAuthors } from '@/mocks/community-data';
import { GuideCard } from '@/components/GuideCard';
import { useExploreStore } from '@/store/explore';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { reputation, loadReputation } = useReputationStore();
  const trustStore = useTrustStore();
  const insets = useSafeAreaInsets();
  const [activeSubTab, setActiveSubTab] = useState<'Timeline' | 'Saved' | 'Drafts'>('Timeline');

  // Explore state progress
  const completedTutorials = useExploreStore((state) => state.completedTutorials);
  const totalTutorials = 10;
  const completionPercentage = Math.round((completedTutorials.length / totalTutorials) * 100);

  useEffect(() => {
    loadReputation();
    useExploreStore.getState().loadPersistedState(); // Load state
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
        <TouchableOpacity onPress={() => { logout(); router.replace('/(auth)/login'); }} className="bg-neutral-50 p-2 rounded-xl border border-neutral-200">
          <Text className="text-xs font-bold text-error-default">Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Core Identity Panel */}
        <View className="bg-white p-6 border-b border-neutral-100 items-center">
          <Avatar name={user?.fullName || 'Amara Kone'} size={84} />
          
          <View className="flex-row items-center mt-3.5">
            <Text className="text-xl font-black text-neutral-900 mr-2">{user?.fullName || 'Amara Kone'}</Text>
            <Text className="text-xs bg-[#E6F4EA] text-success-default px-2 py-0.5 rounded font-extrabold">✓ VERIFIED</Text>
          </View>
          <Text className="text-xs text-neutral-500 font-semibold mb-3">{(user as any)?.email || 'amara@diaspora.com'}</Text>

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

          {/* Wallet Card — B15's financial surface. Placed above Creator Studio
              because money is the thing people come looking for, and because
              B13's billing notifications deep-link to /wallet, which has to be
              reachable without one. */}
          <TouchableOpacity
            onPress={() => router.push('/wallet')}
            className="w-full bg-secondary-50 border border-secondary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Wallet. See your balance, transactions and payments."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">👛</Text>
              <View>
                <Text className="text-sm font-bold text-neutral-850">Wallet</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">Balance, transactions and payments</Text>
              </View>
            </View>
            <Text className="text-secondary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Grow Card — Phase 6's business surface. Sits below the wallet
              because it is the layer above it: the wallet is your money, this is
              what you sell and promote with it. One entry point rather than
              scattering promotion, plan and billing rows through the profile. */}
          <TouchableOpacity
            onPress={() => router.push('/monetization')}
            className="w-full bg-primary-50 border border-primary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Grow. Promotions, plans, advertising and billing for what you sell on Diaspora."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📈</Text>
              <View>
                <Text className="text-sm font-bold text-neutral-850">Grow</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">Promotions, plans and advertising</Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Analytics Card — Frontend Phase 15. The one entry point into the
              analytics tree, and the hub behind it decides what this member is
              actually offered: a creator sees their reach, a seller sees listing
              performance, a platform administrator sees the platform. A dashboard
              they have no capability for is not rendered there at all. */}
          <TouchableOpacity
            onPress={() => router.push('/analytics')}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Analytics. What Diaspora can tell you about your content, your money and your community."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📊</Text>
              <View>
                <Text className="text-sm font-bold text-neutral-850">Analytics</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">
                  Your content, your money, your community
                </Text>
              </View>
            </View>
            <Text className="text-neutral-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Creator Card — Phase 7's creator programme surface. Above Creator
              Studio because it is the layer above it: the Studio manages what
              you have published, this is your standing, your learning, your
              rewards and what your work has earned. */}
          <TouchableOpacity
            onPress={() => router.push('/creator')}
            className="w-full bg-secondary-50 border border-secondary-500/20 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
            accessibilityRole="button"
            accessibilityLabel="Creator. Your standing, rewards, learning, analytics and what your work has earned."
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">✨</Text>
              <View>
                <Text className="text-sm font-bold text-neutral-850">Creator</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">Standing, rewards, learning and earnings</Text>
              </View>
            </View>
            <Text className="text-secondary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Creator Studio Card */}
          <TouchableOpacity
            onPress={() => router.push('/profile/creator-dashboard')}
            className="w-full bg-primary-50/20 border border-primary-100 rounded-3xl p-4 flex-row items-center justify-between mb-3 mt-2"
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

          {/* Trust & Safety Center Card */}
          <TouchableOpacity
            onPress={() => router.push('/profile/trust-center')}
            className="w-full bg-success-surface border border-[#CEEAD6] rounded-3xl p-4 flex-row items-center justify-between mb-3"
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">🛡️</Text>
              <View>
                <Text className="text-sm font-bold text-neutral-850">Trust & Safety Center</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">Manage verifications, sessions & privacy</Text>
              </View>
            </View>
            <Text className="text-success-default font-extrabold text-xs font-black">VIEW →</Text>
          </TouchableOpacity>

          {/* Explore Diaspora Hub Card */}
          <TouchableOpacity
            onPress={() => router.push('/explore')}
            className="w-full bg-info-surface border border-info-default/20 rounded-3xl p-4 flex-row items-center justify-between mb-4"
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">🚀</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-850">Explore Diaspora Hub</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">
                  Interactive education ({completedTutorials.length}/{totalTutorials} Guides Completed)
                </Text>
                {/* Micro Progress Bar */}
                <View className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden mt-1.5">
                  <View
                    className="h-full bg-info-default rounded-full"
                    style={{ width: `${Math.min(100, completionPercentage)}%` }}
                  />
                </View>
              </View>
            </View>
            <Text className="text-info-default font-extrabold text-xs font-black">ENTER →</Text>
          </TouchableOpacity>

          {/* Frontend Phase 18 — Automations. §6 asks for one Automation Center
              rather than a management screen per module, and this is the single
              entry point into it. Placed here rather than under Settings
              because an automation is something a member *has*, like their
              saved items, not something they configure once. */}
          <TouchableOpacity
            onPress={() => router.push('/automation')}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-3xl p-4 flex-row items-center justify-between mb-3"
            accessibilityRole="button"
            accessibilityLabel="Automations. Set things up once and let Diaspora watch for you."
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Text className="text-2xl mr-3">⚡</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-850">Automations</Text>
                <Text className="text-xs text-neutral-500 mt-0.5">
                  Set it up once and Diaspora watches for you
                </Text>
              </View>
            </View>
            <Text className="text-primary-500 font-extrabold text-xs">OPEN →</Text>
          </TouchableOpacity>

          {/* Profile Completion Circular progress block (75%) */}
          <TouchableOpacity
            onPress={() => router.push('/profile/trust-center')}
            activeOpacity={0.7}
            className="bg-neutral-50 border border-neutral-200 rounded-3xl p-4 w-full flex-row items-center justify-between mb-2"
          >
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
          </TouchableOpacity>

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
          <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-3">Country-Specific Reputation</Text>
          <View className="flex-row flex-wrap justify-center gap-2.5">
            {trustStore.countryReputations.map((r) => (
              <View key={r.countryCode} className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 flex-row items-center min-w-[140px] flex-1 max-w-[200px]">
                <Text className="text-2xl mr-2">{r.flag}</Text>
                <View>
                  <Text className="text-xs font-black text-neutral-850">{r.countryName}</Text>
                  <Text className="text-[9px] text-neutral-500 mt-0.5">
                    {r.points} pts
                  </Text>
                  <Text className="text-[9px] text-amber-500 mt-0.5">{'★'.repeat(r.stars)}</Text>
                </View>
              </View>
            ))}
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
