import React, { useEffect } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useReputationStore } from '@/store/reputation';
import { ReputationDimensionCard } from '@/components/ReputationDimension';
import { ReputationBadge } from '@/components/ReputationBadge';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';

export default function ReputationDashboard() {
  const { reputation, loadReputation } = useReputationStore();

  // ── This screen used to render nothing at all ────────────────────────────
  //
  // It read `reputation` from the store and returned `null` when it was empty,
  // and the only caller of `loadReputation()` in the app was the Profile tab.
  // So the screen worked when a member tapped through from there, and was a
  // blank white page from any other route — a deep link, a back-navigation
  // that had dropped the tab, or a cold start.
  //
  // Found by a Maestro flow opening `diaspora://profile/reputation` directly,
  // which is the one way nobody reaches it by hand and therefore the one way
  // nobody had tried.
  //
  // A screen loads what it needs. And an empty store is a *loading* state, not
  // an absence — returning `null` for it is what made the failure invisible.
  useEffect(() => {
    if (!reputation) loadReputation();
  }, [reputation, loadReputation]);

  if (!reputation) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
        <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-content-tertiary">←</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-black text-content-primary tracking-tight">
            Reputation Progression
          </Text>
        </View>
        <View className="flex-1 items-center justify-center" accessibilityLabel="Loading your reputation">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

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
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-content-primary tracking-tight">Reputation Progression</Text>
      </View>

      <ScrollEndScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {/* Core Progress Level Panel */}
        <View className="bg-surface-card rounded-3xl p-6 mb-6 items-center border border-subtle shadow-sm">
          <ReputationBadge level={reputation.level} size="lg" />
          <Text className="text-xl font-black text-content-primary mt-3.5">Level 3: Expert Guide</Text>
          <Text className="text-[10px] text-content-faint font-extrabold uppercase mt-1 mb-5">XP SCORE: {reputation.combinedScore} POINTS</Text>

          {reputation.nextLevel && (
            <View className="w-full">
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-xs text-content-tertiary font-bold">Progress to Level 4 (Master Guide)</Text>
                <Text className="text-xs text-primary-500 font-extrabold">{Math.floor(combinedProgress * 100)}%</Text>
              </View>
              <View className="h-2.5 bg-surface-muted rounded-full overflow-hidden mb-1.5">
                <View className="h-full bg-primary-500 rounded-full" style={{ width: `${combinedProgress * 100}%` }} />
              </View>
              <Text className="text-[10px] text-content-faint font-semibold text-center">
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
        <View className="bg-surface-card rounded-3xl p-5 mb-6 border border-subtle shadow-sm">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">Capabilities progression</Text>
          {benefits.map((b, idx) => (
            <View key={idx} className="flex-row items-center justify-between py-2 border-b border-faint last:border-b-0">
              <View className="flex-1 mr-3 flex-row items-center">
                <Text className={`text-xs ${b.unlocked ? 'text-content-strong font-bold' : 'text-content-faint font-medium'}`}>
                  {b.title}
                </Text>
              </View>
              <View className={`px-2 py-0.5 rounded ${b.unlocked ? 'bg-[#E6F4EA]' : 'bg-surface-muted'}`}>
                <Text className={`text-[8px] font-black uppercase ${b.unlocked ? 'text-success-default' : 'text-content-faint'}`}>
                  {b.unlocked ? 'UNLOCKED' : `Lvl ${b.levelRequired}`}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Point Statement / History ledger */}
        <View className="bg-surface-card rounded-3xl p-5 mb-6 border border-subtle shadow-sm">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">Recent XP Statement</Text>
          {pointsLedger.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between py-2.5 border-b border-faint last:border-b-0">
              <View className="flex-1 mr-3">
                <Text className="text-xs font-bold text-content-strong leading-snug">{item.reason}</Text>
                <Text className="text-[9px] text-content-faint font-semibold mt-0.5">{item.date}</Text>
              </View>
              <Text className="text-xs font-black text-success-default">+{item.points} XP</Text>
            </View>
          ))}
        </View>

        {/* Dimension breakdowns (Original 3D charts card preserved but styled cleanly) */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Dimensional breakdown metrics</Text>
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
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
