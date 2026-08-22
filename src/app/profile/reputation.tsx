// ── Where this screen's data comes from, after Wave D-4 ──────────────────────
//
// `GET /trust/reputation/me` and `GET /trust/reputation/me/events`, replacing
// `mockUserReputation` — a fixture the store loaded behind a 300 ms timer that
// made it look like a request — and a five-row `pointsLedger` array declared
// inside this component.
//
// Three pieces of hard-coded copy went with them, and they are worth naming
// because each was a statement about the member that the data contradicted:
//
//   * `"Level 3: Expert Guide"` was rendered under the level badge regardless
//     of the member's actual level.
//   * `"Progress to Level 4 (Master Guide)"` labelled the progress bar. There
//     is no Master Guide. The ladder ends at Community Ambassador.
//   * The capabilities checklist hard-coded which five things were unlocked,
//     with the first three always true.
//
// All three now read the server's `level`, `nextLevel.name` and
// `levelBenefits`.

import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMyReputation, useMyReputationEvents } from '@/hooks/trust';
import { ReputationDimensionCard } from '@/components/ReputationDimension';
import { ReputationBadge } from '@/components/ReputationBadge';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { REPUTATION_LEVEL_LABELS, type ReputationLevel } from '@/types/reputation';

/** A relative date for the ledger, without dragging in a formatting library. */
function relativeDay(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(then).toISOString().slice(0, 10);
}

export default function ReputationDashboard() {
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
  // The hook owns the fetch now, so the screen cannot be reached without it.
  const { reputation, error } = useMyReputation();
  const ledger = useMyReputationEvents();

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
        {error === null ? (
          <View className="flex-1 items-center justify-center" accessibilityLabel="Loading your reputation">
            <ActivityIndicator />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-3xl mb-2">📉</Text>
            <Text className="text-sm font-extrabold text-content-strong text-center">
              We could not load your reputation
            </Text>
            <Text className="text-xs text-content-muted mt-1 text-center leading-relaxed">{error}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const combinedProgress = reputation.nextLevel
    ? Math.min(reputation.combinedScore / reputation.nextLevel.minScore, 1)
    : 1;

  const levelLabel =
    REPUTATION_LEVEL_LABELS[reputation.level as ReputationLevel] ?? reputation.level;
  const nextLevelLabel = reputation.nextLevel
    ? (REPUTATION_LEVEL_LABELS[reputation.nextLevel.name as ReputationLevel] ??
      reputation.nextLevel.name)
    : null;

  /**
   * The capabilities checklist, from `levelBenefits`.
   *
   * The server computes these from the member's level; the previous version
   * hard-coded five rows with the first three permanently unlocked, which told
   * a brand-new member they could publish guides.
   */
  const benefits = [
    { title: 'Publish without waiting for review', unlocked: reputation.levelBenefits.canPublishImmediately },
    { title: 'Moderate local flags and verify alerts', unlocked: reputation.levelBenefits.canModerate },
    { title: 'Be featured in community discovery', unlocked: reputation.levelBenefits.isFeaturedEligible },
    { title: 'Take part in community rewards', unlocked: reputation.levelBenefits.isRewardsEligible },
    { title: 'Early access to new features', unlocked: reputation.levelBenefits.hasBetaAccess },
    { title: 'Exclusive profile badge', unlocked: reputation.levelBenefits.hasExclusiveBadge },
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
          <Text className="text-xl font-black text-content-primary mt-3.5">{levelLabel}</Text>
          <Text className="text-[10px] text-content-faint font-extrabold uppercase mt-1 mb-5">XP SCORE: {reputation.combinedScore} POINTS</Text>

          {reputation.nextLevel && (
            <View className="w-full">
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-xs text-content-tertiary font-bold">Progress to {nextLevelLabel}</Text>
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
                  {b.unlocked ? 'UNLOCKED' : 'LOCKED'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Point Statement / History ledger — `GET /trust/reputation/me/events` */}
        <View className="bg-surface-card rounded-3xl p-5 mb-6 border border-subtle shadow-sm">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">Recent XP Statement</Text>

          {ledger.isLoading && (
            <View className="py-6 items-center" accessibilityLabel="Loading your points history">
              <ActivityIndicator />
            </View>
          )}

          {ledger.isEmpty && (
            <Text className="text-xs text-content-muted leading-relaxed">
              Nothing scored yet. Publishing a guide or confirming a neighbour’s update starts this off.
            </Text>
          )}

          {ledger.error !== null && (
            <Text className="text-xs text-error-default leading-relaxed">{ledger.error}</Text>
          )}

          {ledger.events.map((item) => (
            <View key={item.eventId} className="flex-row items-center justify-between py-2.5 border-b border-faint last:border-b-0">
              <View className="flex-1 mr-3">
                <Text className="text-xs font-bold text-content-strong leading-snug">
                  {item.description ?? item.eventType}
                </Text>
                <Text className="text-[9px] text-content-faint font-semibold mt-0.5">
                  {relativeDay(item.createdAt)}
                </Text>
              </View>
              {/*
                `points` is signed, and a violation is negative. The old ledger
                rendered `+{points}` unconditionally over a fixture that had no
                negative rows; against the real feed that prints "+-20".
              */}
              <Text
                className={`text-xs font-black ${item.points < 0 ? 'text-error-default' : 'text-success-default'}`}
              >
                {item.points < 0 ? '' : '+'}
                {item.points} XP
              </Text>
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
