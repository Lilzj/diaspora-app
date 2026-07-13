import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useReputationStore } from '@/store/reputation';
import { ReputationDimensionCard } from '@/components/ReputationDimension';
import { ReputationBadge } from '@/components/ReputationBadge';

export default function ReputationDashboard() {
  const { reputation } = useReputationStore();

  if (!reputation) return null;

  const combinedProgress = reputation.nextLevel
    ? Math.min(reputation.combinedScore / reputation.nextLevel.minScore, 1)
    : 1;

  // Unlocked vs upcoming capabilities checklist
  const benefits = [
    { title: 'Post updates & review local listings', levelRequired: 1, unlocked: true },
    { title: 'Create custom saved collection folders', levelRequired: 2, unlocked: true },
    { title: 'Publish detailed community guides', levelRequired: 3, unlocked: true },
    { title: 'Directly edit outdated sections in public guides', levelRequired: 4, unlocked: false },
    { title: 'Moderate local flags & verify alerts', levelRequired: 5, unlocked: false },
  ];

  // Points changes ledger history
  const pointsLedger = [
    { id: '1', reason: 'Guide published on "Nigerian Food in London"', points: 50, date: 'Today' },
    { id: '2', reason: 'Confirmed alert on "Peckham High Street"', points: 15, date: 'Yesterday' },
    { id: '3', reason: 'Helpful feedback vote received from Amara', points: 10, date: '2 days ago' },
    { id: '4', reason: 'Residency Verification approved for UK', points: 100, date: 'Last week' },
    { id: '5', reason: 'Phone verification completion bonus', points: 30, date: 'Last month' },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-neutral-600">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-neutral-900 tracking-tight">Reputation Progression</Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {/* Core Progress Level Panel */}
        <View className="bg-white rounded-3xl p-6 mb-6 items-center border border-neutral-200 shadow-sm">
          <ReputationBadge level={reputation.level} size="lg" />
          <Text className="text-xl font-black text-neutral-900 mt-3.5">Level 3: Expert Guide</Text>
          <Text className="text-[10px] text-neutral-400 font-extrabold uppercase mt-1 mb-5">XP SCORE: {reputation.combinedScore} POINTS</Text>

          {reputation.nextLevel && (
            <View className="w-full">
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-xs text-neutral-600 font-bold">Progress to Level 4 (Master Guide)</Text>
                <Text className="text-xs text-primary-500 font-extrabold">{Math.floor(combinedProgress * 100)}%</Text>
              </View>
              <View className="h-2.5 bg-neutral-100 rounded-full overflow-hidden mb-1.5">
                <View className="h-full bg-primary-500 rounded-full" style={{ width: `${combinedProgress * 100}%` }} />
              </View>
              <Text className="text-[10px] text-neutral-400 font-semibold text-center">
                {reputation.nextLevel.pointsNeeded} XP points needed to level up
              </Text>
            </View>
          )}
        </View>

        {/* Explain how to level up */}
        <View className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-3xl p-4 mb-6">
          <Text className="text-xs font-black text-[#1E40AF] mb-1">💡 How to earn XP & leveling up</Text>
          <Text className="text-[11px] text-[#2563EB] leading-relaxed font-semibold">
            Contribute local guides (+50 XP), confirm alerts (+15 XP), upload residency documents (+100 XP), and receive helpful community votes (+10 XP).
          </Text>
        </View>

        {/* Capabilities Benefits Checklist */}
        <View className="bg-white rounded-3xl p-5 mb-6 border border-neutral-200 shadow-sm">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Capabilities progression</Text>
          {benefits.map((b, idx) => (
            <View key={idx} className="flex-row items-center justify-between py-2 border-b border-neutral-50 last:border-b-0">
              <View className="flex-1 mr-3 flex-row items-center">
                <Text className={`text-xs ${b.unlocked ? 'text-neutral-800 font-bold' : 'text-neutral-400 font-medium'}`}>
                  {b.title}
                </Text>
              </View>
              <View className={`px-2 py-0.5 rounded ${b.unlocked ? 'bg-[#E6F4EA]' : 'bg-neutral-100'}`}>
                <Text className={`text-[8px] font-black uppercase ${b.unlocked ? 'text-success-default' : 'text-neutral-400'}`}>
                  {b.unlocked ? 'UNLOCKED' : `Lvl ${b.levelRequired}`}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Point Statement / History ledger */}
        <View className="bg-white rounded-3xl p-5 mb-6 border border-neutral-200 shadow-sm">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">Recent XP Statement</Text>
          {pointsLedger.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between py-2.5 border-b border-neutral-50 last:border-b-0">
              <View className="flex-1 mr-3">
                <Text className="text-xs font-bold text-neutral-800 leading-snug">{item.reason}</Text>
                <Text className="text-[9px] text-neutral-400 font-semibold mt-0.5">{item.date}</Text>
              </View>
              <Text className="text-xs font-black text-success-default">+{item.points} XP</Text>
            </View>
          ))}
        </View>

        {/* Dimension breakdowns (Original 3D charts card preserved but styled cleanly) */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Dimensional breakdown metrics</Text>
        <ReputationDimensionCard
          dimension="contribution"
          score={reputation.contributionScore}
          maxScore={1000}
          breakdown={[
            { label: 'Published Guides', points: reputation.guidesPublished * 30 },
            { label: 'Guides Approved', points: reputation.guidesApproved * 20 },
            { label: 'Updates Published', points: reputation.updatesPublished * 10 },
            { label: 'Updates Verified', points: reputation.updatesVerified * 15 },
          ]}
        />
        <View className="h-4" />
        <ReputationDimensionCard
          dimension="verification"
          score={reputation.verificationScore}
          maxScore={500}
          breakdown={[
            { label: 'Phone Verified', points: reputation.phoneVerified ? 30 : 0 },
            { label: 'Email Verified', points: reputation.emailVerified ? 20 : 0 },
            { label: 'Profile Completed', points: reputation.profileCompleted ? 20 : 0 },
            { label: 'Country Verifications', points: reputation.countryVerificationsCount * 40 },
          ]}
        />
        <View className="h-4" />
        <ReputationDimensionCard
          dimension="trust"
          score={reputation.trustScore}
          maxScore={1000}
          breakdown={[
            { label: 'Helpful Votes Received', points: reputation.helpfulVotesReceived * 2 },
            { label: 'Community Confirmations', points: reputation.communityConfirmationsReceived * 3 },
            { label: 'Violations', points: reputation.violationCount * -20 },
          ]}
        />

        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
