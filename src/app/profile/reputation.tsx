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
import { useMyReputation, useMyReputationEvents, useReputationRules } from '@/hooks/trust';
import { HOW_TO_EARN_WITHOUT_RULES, waysToEarn, waysToLose } from '@/lib/reputation-rules';
import { XP_IS_NOT_MONEY } from '@/lib/reward-copy';
import { ReputationDimensionCard, type ReputationBreakdownRow } from '@/components/ReputationDimension';
import { ReputationBadge } from '@/components/ReputationBadge';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { REPUTATION_LEVEL_LABELS, type ReputationLevel } from '@/types/reputation';
import type { WireReputationDimension, WireReputationProfile } from '@/types/trust';
import { backOr } from '@/lib/navigation';

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

/**
 * One dimension card's rows, exactly as the server totalled and named them.
 *
 * These were the profile's counters multiplied by figures written here —
 * thirty a phone where the server pays twenty, forty a country where it pays
 * thirty, minus twenty a violation where it costs seventy-five — and content
 * removed by moderation, which has no counter, moved the trust score with no
 * row at all. A server that sends no breakdown gets no rows, not invented ones.
 */
function breakdownOf(
  reputation: WireReputationProfile,
  dimension: WireReputationDimension
): { breakdown: ReputationBreakdownRow[]; adjustment: number } {
  const served = reputation.breakdown?.find((entry) => entry.dimension === dimension);

  return {
    breakdown: (served?.lines ?? []).map((line) => ({
      label: line.label,
      points: line.points,
      count: line.count,
    })),
    adjustment: served?.adjustment ?? 0,
  };
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
  const { rules } = useReputationRules();
  const earning = waysToEarn(rules);
  const losing = waysToLose(rules);

  if (!reputation) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
        <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
          <TouchableOpacity onPress={() => backOr()} className="mr-4">
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
   *
   * "Take part in community rewards" is not listed. It rendered
   * `isRewardsEligible`, which nothing on the server reads (gap matrix REP-18),
   * so "unlocked" promised nothing and "locked" withheld nothing. It comes
   * back if reputation is ever made to gate rewards (decision D-2).
   */
  const benefits = [
    { title: 'Publish without waiting for review', unlocked: reputation.levelBenefits.canPublishImmediately },
    { title: 'Moderate local flags and verify alerts', unlocked: reputation.levelBenefits.canModerate },
    { title: 'Be featured in community discovery', unlocked: reputation.levelBenefits.isFeaturedEligible },
    { title: 'Early access to new features', unlocked: reputation.levelBenefits.hasBetaAccess },
    { title: 'Exclusive profile badge', unlocked: reputation.levelBenefits.hasExclusiveBadge },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => backOr()} className="mr-4">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-content-primary tracking-tight">Reputation Progression</Text>
      </View>

      <ScrollEndScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {/* Core Progress Level Panel */}
        <View className="bg-surface-card rounded-3xl p-6 mb-6 items-center border border-subtle shadow-sm">
          <ReputationBadge level={reputation.level} size="lg" />
          <Text className="text-xl font-black text-content-primary mt-3.5">{levelLabel}</Text>
          {/*
            `combinedScore` is the sum of the three dimensions: every award less
            every penalty, ever. "XP SCORE: N POINTS" called it points, the
            word the wallet uses for something that can become money.
          */}
          <Text className="text-[10px] text-content-faint font-extrabold uppercase mt-1 mb-5">Lifetime XP: {reputation.combinedScore}</Text>

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
                {reputation.nextLevel.pointsNeeded} XP needed to level up
              </Text>
            </View>
          )}
        </View>

        {/* How to earn XP — from `GET /trust/reputation/rules`; see lib/reputation-rules.ts */}
        <View className="bg-surface-muted border border-subtle rounded-3xl p-4 mb-6">
          <Text className="text-xs font-black text-info-default mb-1">💡 How to earn XP & leveling up</Text>
          {earning.length === 0 ? (
            <Text className="text-[11px] text-info-default leading-relaxed font-semibold">
              {HOW_TO_EARN_WITHOUT_RULES}
            </Text>
          ) : (
            earning.map((row) => (
              <View key={row.actionType} className="flex-row items-center justify-between py-0.5">
                <Text className="text-[11px] text-info-default font-semibold flex-1 mr-3">
                  {row.label}
                  {row.limit ? ` (${row.limit})` : ''}
                </Text>
                <Text className="text-[11px] text-info-default font-black">{row.amount}</Text>
              </View>
            ))
          )}
          {losing.length > 0 && (
            <>
              <Text className="text-xs font-black text-info-default mt-3 mb-1">What lowers it</Text>
              {losing.map((row) => (
                <View key={row.actionType} className="flex-row items-center justify-between py-0.5">
                  <Text className="text-[11px] text-info-default font-semibold flex-1 mr-3">{row.label}</Text>
                  <Text className="text-[11px] text-error-default font-black">{row.amount}</Text>
                </View>
              ))}
            </>
          )}
          <Text className="text-[11px] text-info-default leading-relaxed font-semibold mt-3">{XP_IS_NOT_MONEY}</Text>
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
              <View className={`px-2 py-0.5 rounded ${b.unlocked ? 'bg-surface-muted' : 'bg-surface-muted'}`}>
                <Text className={`text-[8px] font-black uppercase ${b.unlocked ? 'text-success-default' : 'text-content-faint'}`}>
                  {b.unlocked ? 'UNLOCKED' : 'LOCKED'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Point Statement / History ledger — `GET /trust/reputation/me/events` */}
        <View className="bg-surface-card rounded-3xl p-5 mb-6 border border-subtle shadow-sm">
          {/*
            The newest first, from the whole history — not a period, which
            "Recent XP Statement" implied.
          */}
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">Latest XP activity</Text>

          {ledger.isLoading && (
            <View className="py-6 items-center" accessibilityLabel="Loading your XP activity">
              <ActivityIndicator />
            </View>
          )}

          {/*
            It said confirming a neighbour's update starts this off. Confirming
            pays the neighbour who wrote it, not the member who confirms.
          */}
          {ledger.isEmpty && (
            <Text className="text-xs text-content-muted leading-relaxed">
              Nothing scored yet. Publishing a guide or verifying where you live starts this off.
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
          {...breakdownOf(reputation, 'contribution')}
        />
        <View className="h-4" />
        <ReputationDimensionCard
          dimension="verification"
          score={reputation.verificationScore}
          {...breakdownOf(reputation, 'verification')}
        />
        <View className="h-4" />
        <ReputationDimensionCard
          dimension="trust"
          score={reputation.trustScore}
          {...breakdownOf(reputation, 'trust')}
        />

        <View className="h-10" />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
