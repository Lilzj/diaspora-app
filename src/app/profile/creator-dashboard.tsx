import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useReputationStore } from '@/store/reputation';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import Svg, { Circle, Path, Line, Rect } from 'react-native-svg';

interface CreatorDraft {
  id: string;
  title: string;
  type: 'Guide' | 'Update' | 'Listing';
  lastSaved: string;
}

export default function CreatorDashboardScreen() {
  const { user } = useAuthStore();
  const { reputation } = useReputationStore();

  // Mode Switch Simulator: allows testing the Onboarding Empty State vs Full Creator Studio
  const [isGuestMode, setIsGuestMode] = useState(false);

  // Time duration filtering for metrics
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Drafts local state to support interactive duplicate/delete
  const [drafts, setDrafts] = useState<CreatorDraft[]>([
    { id: 'dr-1', title: 'Immigration steps for moving to London from Côte d\'Ivoire', type: 'Guide', lastSaved: '2 mins ago' },
    { id: 'dr-2', title: 'Power outage alert Brixton central sector', type: 'Update', lastSaved: 'Saved 1 hour ago' },
    { id: 'dr-3', title: 'Mama Africa Grocery & Retail center', type: 'Listing', lastSaved: 'Saved yesterday' },
  ]);

  // Handle draft duplication
  const handleDuplicateDraft = (id: string) => {
    const draftToClone = drafts.find((d) => d.id === id);
    if (!draftToClone) return;
    const cloned = {
      ...draftToClone,
      id: `dr-clone-${Date.now()}`,
      title: `${draftToClone.title} (Copy)`,
      lastSaved: 'Just duplicated',
    };
    setDrafts((prev) => [...prev, cloned]);
    Alert.alert('Draft Duplicated', `Created a copy of: "${draftToClone.title}"`);
  };

  // Handle draft deletion
  const handleDeleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    Alert.alert('Draft Deleted', 'The draft has been permanently removed.');
  };

  // Dynamic statistics mapping based on time duration filter
  const getStatsForFilter = () => {
    switch (timeFilter) {
      case '7d':
        return { views: 320, reads: 245, helpful: 89, rate: '86%', comments: 8, shares: 12, trend: '↑ 12%' };
      case '90d':
        return { views: 4230, reads: 3120, helpful: 840, rate: '78%', comments: 56, shares: 134, trend: '↑ 24%' };
      case 'all':
        return { views: 12450, reads: 9400, helpful: 1450, rate: '82%', comments: 142, shares: 430, trend: '↑ 38%' };
      case '30d':
      default:
        return { views: 1450, reads: 1120, helpful: 234, rate: '80%', comments: 23, shares: 54, trend: '↑ 18%' };
    }
  };

  const currentStats = getStatsForFilter();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      
      {/* Navigation Header */}
      <View className="px-6 py-4 border-b border-neutral-100 bg-white flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-xl text-neutral-600">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-black text-neutral-900 tracking-tight">Creator Studio</Text>
        </View>

        {/* Demo Toggle Control Button */}
        <TouchableOpacity
          onPress={() => setIsGuestMode(!isGuestMode)}
          className="bg-primary-50 border border-primary-100 px-3.5 py-1.5 rounded-xl"
        >
          <Text className="text-[10px] font-black text-primary-500">
            {isGuestMode ? '🔌 SWITCH TO CREATOR VIEW' : '🔌 SWITCH TO ONBOARDING VIEW'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Onboarding Empty State View */}
      {isGuestMode ? (
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          <View className="items-center py-8">
            <View className="w-24 h-24 rounded-full bg-primary-50 items-center justify-center mb-6">
              <Text className="text-5xl">🎨</Text>
            </View>
            
            <Text className="text-xl font-black text-neutral-900 text-center mb-2 tracking-tight">
              Your community is waiting to hear from you
            </Text>
            <Text className="text-xs text-neutral-500 text-center leading-relaxed max-w-[280px] mb-8">
              Share your residency advice, post local safety alerts, or directory listings to help other newcomer diaspora citizens settle in easily.
            </Text>

            {/* CTAs Quick Action buttons */}
            <View className="w-full gap-3 mb-8">
              <TouchableOpacity
                onPress={() => router.push('/guide/create')}
                className="w-full bg-primary-500 py-4 rounded-2xl items-center justify-center shadow-lg shadow-primary-500/10"
              >
                <Text className="text-white font-black text-sm">Write Your First Guide</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => router.push('/update/create')}
                className="w-full bg-white border border-neutral-350 py-4 rounded-2xl items-center justify-center"
              >
                <Text className="text-neutral-750 font-bold text-sm">Post Community Alert</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/(tabs)/post')}
                className="w-full bg-white border border-neutral-350 py-4 rounded-2xl items-center justify-center"
              >
                <Text className="text-neutral-750 font-bold text-sm">Create Provider Listing</Text>
              </TouchableOpacity>
            </View>

            {/* Why contribute details */}
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 w-full">
              <Text className="text-xs font-bold text-neutral-800 uppercase tracking-widest mb-3.5">
                🎁 Benefits of Contributing
              </Text>
              <View className="space-y-3">
                <View className="flex-row items-start">
                  <Text className="text-base mr-2">🏅</Text>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-neutral-800">Earn Reputation & XP</Text>
                    <Text className="text-[10px] text-neutral-500 mt-0.5">Grow from Resident to Community Expert, unlocking advanced platform moderation controls.</Text>
                  </View>
                </View>
                <View className="flex-row items-start mt-3">
                  <Text className="text-base mr-2">🌟</Text>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-neutral-800">Verified Badge Status</Text>
                    <Text className="text-[10px] text-neutral-500 mt-0.5">Get a verified checkmark displaying your years of local residency experience.</Text>
                  </View>
                </View>
              </View>
            </View>

          </View>
        </ScrollView>
      ) : (
        /* Full Creator Dashboard view */
        <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
          
          {/* Welcome Header */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 flex-row items-center mb-5 shadow-sm">
            <Avatar name={user?.name || 'Amara Kone'} size={50} />
            <View className="ml-3.5 flex-1">
              <Text className="text-xs text-neutral-400 font-bold">Good Evening,</Text>
              <Text className="text-base font-black text-neutral-900">{user?.name || 'Amara Kone'}</Text>
              <View className="flex-row items-center mt-1">
                <Text className="text-[9px] font-black text-[#B06000] bg-[#FFF2E0] px-1.5 py-0.5 rounded mr-1.5">
                  🔥 5 DAY STREAK
                </Text>
                <ReputationBadge level={reputation?.level || 'VerifiedResident'} size="sm" />
              </View>
            </View>
          </View>

          {/* New Section: Community Impact outcomes */}
          <View className="bg-[#FFF8F2] border border-[#FFEADA] rounded-3xl p-5 mb-5 shadow-sm">
            <Text className="text-sm font-black text-neutral-900 mb-1 flex-row items-center">
              🌍 Community Impact
            </Text>
            <Text className="text-[10px] text-neutral-500 font-semibold mb-4">
              This month your contributions helped people across the diaspora community.
            </Text>
            
            <View className="space-y-3 gap-2.5">
              <View className="flex-row items-center">
                <Text className="text-xs mr-2">✓</Text>
                <Text className="text-xs text-neutral-700 font-semibold">1,248 people read your guides</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs mr-2">❤️</Text>
                <Text className="text-xs text-neutral-700 font-semibold">89 people marked your advice as helpful</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs mr-2">📢</Text>
                <Text className="text-xs text-neutral-700 font-semibold">Your update reached 432 residents</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs mr-2">👥</Text>
                <Text className="text-xs text-neutral-700 font-semibold">17 newcomers followed your recommendations</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs mr-2">🏠</Text>
                <Text className="text-xs text-neutral-700 font-semibold">Your housing guide helped 12 families find accommodation</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs mr-2">🎉</Text>
                <Text className="text-xs text-neutral-700 font-semibold">Your reputation increased because of your positive impact</Text>
              </View>
            </View>
          </View>

          {/* New Section: Impact Milestones timeline */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-5 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">
              🏆 Impact Milestones
            </Text>
            
            <View className="border-l border-neutral-200 pl-4 py-1 space-y-4 gap-3">
              <View className="relative">
                <View className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary-500" />
                <Text className="text-[10px] font-black text-primary-500 uppercase">🎉 Today</Text>
                <Text className="text-xs font-bold text-neutral-800 mt-0.5">Your guide helped its 1,000th reader.</Text>
              </View>

              <View className="relative">
                <View className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-neutral-350" />
                <Text className="text-[10px] font-black text-neutral-450 uppercase">🏅 Yesterday</Text>
                <Text className="text-xs font-bold text-neutral-800 mt-0.5">You became a Trusted Contributor.</Text>
              </View>

              <View className="relative">
                <View className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-neutral-355" />
                <Text className="text-[10px] font-black text-neutral-450 uppercase">🌍 Last Week</Text>
                <Text className="text-xs font-bold text-neutral-800 mt-0.5">Your community update was confirmed by 50 local residents.</Text>
              </View>

              <View className="relative">
                <View className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-neutral-360" />
                <Text className="text-[10px] font-black text-neutral-450 uppercase">❤️ Last Month</Text>
                <Text className="text-xs font-bold text-neutral-800 mt-0.5">500 people marked your guides as helpful.</Text>
              </View>
            </View>
          </View>

          {/* New Section: Simulated AI impact insights */}
          <View className="bg-gradient-to-r from-primary-50/50 to-orange-50/30 border border-[#FDE8E8] rounded-3xl p-5 mb-5 shadow-sm relative overflow-hidden bg-orange-50/10">
            <Text className="text-xs font-black text-primary-500 mb-2 flex-row items-center">
              ✨ AI Impact Insights (Beta)
            </Text>
            <Text className="text-[11px] text-neutral-600 leading-relaxed font-semibold">
              This month your guides were especially popular with new international students moving to the UK. Your immigration guide has become one of the top 10 most-read guides in London. People spent an average of 8 minutes reading your housing guide, indicating high engagement.
            </Text>
          </View>

          {/* Impact Overview Outcomes (Revamped to translate numbers into meaning) */}
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Community Contributions</Text>
          <View className="space-y-3.5 mb-6 gap-3">
            
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm flex-row items-start">
              <Text className="text-xl mr-3">🌍</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-800 leading-snug">
                  Your guides helped {currentStats.views} people learn about life in the UK.
                </Text>
                <Text className="text-xs font-extrabold text-neutral-500 uppercase mt-1.5">TOTAL GUIDE VIEWS</Text>
              </View>
            </View>

            <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm flex-row items-start">
              <Text className="text-xl mr-3">❤️</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-800 leading-snug">
                  {reputation?.helpfulVotesReceived || 45} people said your advice made their journey easier.
                </Text>
                <Text className="text-xs font-extrabold text-neutral-500 uppercase mt-1.5">HELPFUL VOTES</Text>
              </View>
            </View>

            <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm flex-row items-start">
              <Text className="text-xl mr-3">👥</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-800 leading-snug">
                  120 people trust your knowledge enough to follow your updates.
                </Text>
                <Text className="text-xs font-extrabold text-neutral-500 uppercase mt-1.5">COMMUNITY FOLLOWERS</Text>
              </View>
            </View>

            <View className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm flex-row items-start">
              <Text className="text-xl mr-3">✅</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-800 leading-snug">
                  26 local residents confirmed your update, making it more trustworthy for everyone.
                </Text>
                <Text className="text-xs font-extrabold text-neutral-500 uppercase mt-1.5">VERIFICATION RATINGS</Text>
              </View>
            </View>
            
          </View>

          {/* Time Filter Query Tabs */}
          <View className="flex-row bg-white border border-neutral-200 rounded-2xl p-1.5 mb-4">
            {[
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: '90d', label: '90 Days' },
              { key: 'all', label: 'All Time' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setTimeFilter(tab.key as any)}
                className={`flex-1 py-2 items-center rounded-xl ${
                  timeFilter === tab.key ? 'bg-primary-500' : 'transparent'
                }`}
              >
                <Text className={`text-[10px] font-bold ${timeFilter === tab.key ? 'text-white' : 'text-neutral-500'}`}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Performance chart */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-xs font-bold text-neutral-700">Views Traffic Trend</Text>
              <Text className="text-xs font-black text-success-default">{currentStats.trend}</Text>
            </View>

            {/* Mock Line Graph */}
            <View className="h-28 w-full bg-neutral-50 rounded-2xl overflow-hidden justify-end">
              <Svg height="100%" width="100%">
                <Path
                  d="M0,90 Q40,40 80,70 T160,20 T240,50 T320,10 L320,110 L0,110 Z"
                  fill="#FF6B0015"
                  stroke="#FF6B00"
                  strokeWidth="2.5"
                />
              </Svg>
            </View>
            <View className="flex-row justify-between mt-2 px-1">
              <Text className="text-[8px] text-neutral-400 font-bold">Start Period</Text>
              <Text className="text-[8px] text-neutral-400 font-bold">End Period</Text>
            </View>
          </View>

          {/* Reputation Progression */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">
              Level Milestone Progress
            </Text>
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-xs font-bold text-neutral-700">Level 3: Expert Guide</Text>
              <Text className="text-xs font-black text-primary-500">75%</Text>
            </View>
            <View className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-3">
              <View className="h-full bg-primary-500 rounded-full" style={{ width: '75%' }} />
            </View>
            
            <View className="bg-[#EFF6FF] border border-[#DBEAFE] p-3 rounded-2xl mt-1 flex-row justify-between items-center">
              <View className="flex-1 mr-2">
                <Text className="text-[10px] font-black text-[#1E40AF]">NEXT CAPABILITY UNLOCKS:</Text>
                <Text className="text-[9px] text-[#2563EB] font-bold mt-0.5">Edit guide sections directly & review spam flags</Text>
              </View>
              <Text className="text-lg">🏅</Text>
            </View>
          </View>

          {/* Top content list */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Top Performing Guides</Text>
            
            <View className="border-b border-neutral-50 pb-3 mb-3">
              <Text className="text-xs font-bold text-neutral-800 leading-snug">How to Find Nigerian Food in London</Text>
              <View className="flex-row gap-3 mt-2">
                <Text className="text-[9px] text-neutral-450 font-bold">👁️ {currentStats.views} views</Text>
                <Text className="text-[9px] text-neutral-450 font-bold">👍 154 helpful</Text>
                <Text className="text-[9px] text-neutral-450 font-bold">💬 23 comments</Text>
              </View>
            </View>

            <View className="pb-1">
              <Text className="text-xs font-bold text-neutral-850 leading-snug">Moving to UK checklist & first month tasks</Text>
              <View className="flex-row gap-3 mt-2">
                <Text className="text-[9px] text-neutral-450 font-bold">👁️ {Math.round(currentStats.views / 2)} views</Text>
                <Text className="text-[9px] text-neutral-450 font-bold">👍 82 helpful</Text>
                <Text className="text-[9px] text-neutral-450 font-bold">💬 14 comments</Text>
              </View>
            </View>
          </View>

          {/* Drafts Catalog with actions */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">
              Unfinished Drafts ({drafts.length})
            </Text>
            
            {drafts.map((draft) => (
              <View key={draft.id} className="border-b border-neutral-100 py-3 last:border-b-0 last:pb-0">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-3">
                    <Text className="text-[8px] font-black text-primary-500 uppercase tracking-wider">{draft.type}</Text>
                    <Text className="text-xs font-bold text-neutral-800 leading-snug mt-0.5">{draft.title}</Text>
                    <Text className="text-[9px] text-neutral-400 font-semibold mt-1">✏️ {draft.lastSaved} (Autosaved)</Text>
                  </View>
                  
                  {/* Actions dropdown */}
                  <View className="flex-row gap-1.5">
                    <TouchableOpacity
                      onPress={() => router.push(draft.type === 'Guide' ? '/guide/create' : '/update/create')}
                      className="bg-neutral-50 px-2.5 py-1.5 rounded-lg border border-neutral-200"
                    >
                      <Text className="text-[9px] font-extrabold text-neutral-600">Resume</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={() => handleDuplicateDraft(draft.id)}
                      className="bg-neutral-50 px-2 py-1.5 rounded-lg border border-neutral-200"
                    >
                      <Text className="text-[9px] font-extrabold text-neutral-600">📄</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDeleteDraft(draft.id)}
                      className="bg-neutral-50 px-2 py-1.5 rounded-lg border border-neutral-200"
                    >
                      <Text className="text-[9px] font-black text-error-default">✗</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Profile Health completion */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-xs font-bold text-neutral-850">Profile Completeness: 92%</Text>
              <Text className="text-[10px] text-neutral-500 leading-relaxed mt-1">
                Complete your identity check to receive top residency verification indicators.
              </Text>
              <TouchableOpacity className="mt-3">
                <Text className="text-[10px] font-extrabold text-primary-500">Fix Profile Issues →</Text>
              </TouchableOpacity>
            </View>
            
            <Svg height="60" width="60" viewBox="0 0 36 36">
              <Circle cx="18" cy="18" r="16" fill="none" stroke="#E5E7EB" strokeWidth="3" />
              <Circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="#FF6B00"
                strokeWidth="3"
                strokeDasharray="100"
                strokeDashoffset="8" // 92%
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
            </Svg>
          </View>

          {/* Verification Center */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Verification Center</Text>
            
            <View className="flex-row justify-between py-2 border-b border-neutral-50">
              <Text className="text-xs font-bold text-neutral-700">📱 Mobile Status</Text>
              <Text className="text-xs font-black text-success-default">PASSED</Text>
            </View>
            
            <View className="flex-row justify-between py-2 border-b border-neutral-50">
              <Text className="text-xs font-bold text-neutral-700">🇧🇬 Residence BRP Copy</Text>
              <View className="items-end">
                <Text className="text-xs font-black text-primary-500">UNDER REVIEW</Text>
                <Text className="text-[9px] text-neutral-400 font-semibold mt-0.5">Est: 24h remaining</Text>
              </View>
            </View>
          </View>

          {/* Achievement shelf */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Achievements Badges Shelf</Text>
            <View className="flex-row flex-wrap gap-2.5">
              <View className="items-center bg-neutral-50 p-2.5 rounded-2xl border border-neutral-150 w-[30%]">
                <Text className="text-xl">🏆</Text>
                <Text className="text-[8px] font-black text-neutral-700 text-center mt-1">First Guide</Text>
              </View>
              <View className="items-center bg-neutral-50 p-2.5 rounded-2xl border border-neutral-150 w-[30%]">
                <Text className="text-xl">❤️</Text>
                <Text className="text-[8px] font-black text-neutral-700 text-center mt-1">100 Helpful</Text>
              </View>
              <View className="items-center bg-neutral-50 p-2.5 rounded-2xl border border-neutral-150 w-[30%]">
                <Text className="text-xl">🌍</Text>
                <Text className="text-[8px] font-black text-neutral-700 text-center mt-1">UK Expert</Text>
              </View>
            </View>
          </View>

          {/* Suggestions checklist */}
          <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
            <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Suggestions Actions</Text>
            
            <TouchableOpacity
              onPress={() => router.push('/guide/[id]')}
              className="py-2.5 border-b border-neutral-50 last:border-b-0 flex-row justify-between items-center"
            >
              <View className="flex-1 mr-3">
                <Text className="text-xs font-bold text-neutral-800">💬 Reply to unanswered comments</Text>
                <Text className="text-[9px] text-neutral-450 mt-0.5">3 reader comments await your response</Text>
              </View>
              <Text className="text-neutral-300 text-sm">›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/verification/country')}
              className="py-2.5 border-b border-neutral-50 last:border-b-0 flex-row justify-between items-center"
            >
              <View className="flex-1 mr-3">
                <Text className="text-xs font-bold text-neutral-800">📄 Complete UK verification</Text>
                <Text className="text-[9px] text-neutral-450 mt-0.5">Upload a BRP card scan to get priority tag</Text>
              </View>
              <Text className="text-neutral-300 text-sm">›</Text>
            </TouchableOpacity>
          </View>

          <View className="h-10" />
        </ScrollView>
      )}

    </SafeAreaView>
  );
}
