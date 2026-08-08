// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Challenge detail (Frontend Phase 7, §23)
//
// The rules are rendered as a list of strings the platform authored. There is
// no parsing, no interpretation and no client-side evaluation of whether a rule
// has been satisfied — `task.isComplete` and the overall `progress` are both
// served, and the join and claim actions are refused server-side when they
// should be.
//
// The leaderboard loads only when the challenge has one, and only when the
// member opens that tab: a challenge with 200 participants should not cost a
// ranked page of 25 to look at its task list.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  ChallengeTaskRow,
  CreatorCard,
  CreatorProgressBar,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  LeaderboardHeader,
  LeaderboardRow,
  RewardPill,
} from '@/components/creator-economy';
import { FinancialErrorInline } from '@/components/financial';
import {
  useChallengeActions,
  useChallengeLeaderboard,
  useCreatorAccess,
  useCreatorChallenge,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { presentChallengeState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';

export default function ChallengeDetailScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const query = useCreatorChallenge(id);
  const actions = useChallengeActions();
  const access = useCreatorAccess();

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const leaderboard = useChallengeLeaderboard(showLeaderboard ? id : undefined);

  const challenge = query.challenge;

  useEffect(() => {
    if (challenge) {
      trackCreatorEvent('creator.challenge.viewed', {
        challengeId: challenge.challengeId,
        state: String(challenge.state),
      });
    }
  }, [challenge?.challengeId]);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const joinRefusal = checkCreatorAccess(CreatorCapabilities.JoinChallenge, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const claimRefusal = checkCreatorAccess(CreatorCapabilities.ClaimReward, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const join = useCallback(() => {
    if (!challenge) return;
    actions.join.mutate(challenge.challengeId, {
      onSuccess: () =>
        trackCreatorEvent('creator.challenge.started', { challengeId: challenge.challengeId }),
    });
  }, [actions.join, challenge]);

  const claim = useCallback(() => {
    if (!challenge) return;
    actions.claim.mutate(challenge.challengeId, {
      onSuccess: () =>
        trackCreatorEvent('creator.challenge.completed', { challengeId: challenge.challengeId }),
    });
  }, [actions.claim, challenge]);

  const canJoin =
    challenge?.state === 'Open' && challenge.isEligible && joinRefusal.allowed;
  const canClaim = challenge?.state === 'Completed' && claimRefusal.allowed;

  const presentation = challenge ? presentChallengeState(challenge.state) : null;

  return (
    <CreatorScreen
      title={challenge?.title ?? 'Challenge'}
      subtitle={challenge?.category ?? undefined}
      gapKey="challenges"
      isEnabled={query.isEnabled}
      refusal={refusal}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      footer={
        canJoin || canClaim ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                canClaim
                  ? `Claim ${challenge?.reward?.label ?? 'your reward'}`
                  : `Join ${challenge?.title}`
              }
              accessibilityState={{
                busy: actions.join.isPending || actions.claim.isPending,
              }}
              disabled={actions.join.isPending || actions.claim.isPending}
              onPress={canClaim ? claim : join}
              style={{
                backgroundColor: canClaim ? tokens.color.success.default : tokens.color.primary[500],
              }}
              className="rounded-full py-4 items-center"
            >
              <Text className="text-white text-xs font-black uppercase tracking-wider">
                {actions.join.isPending || actions.claim.isPending
                  ? 'Just a moment…'
                  : canClaim
                    ? 'Claim your reward'
                    : 'Join this challenge'}
              </Text>
            </Pressable>

            {actions.join.isError || actions.claim.isError ? (
              <View className="mt-2.5">
                <FinancialErrorInline
                  error={(actions.join.error ?? actions.claim.error) as FinancialError}
                />
              </View>
            ) : null}
          </>
        ) : undefined
      }
    >
      {challenge && presentation ? (
        <View className="px-5 pt-5">
          {/* ── Headline ─────────────────────────────────────────────────── */}
          <CreatorCard style={{ marginBottom: 20 }}>
            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: tokens.color.surface.elevated }}
                className="w-12 h-12 rounded-2xl items-center justify-center mr-3"
              >
                <Text className="text-2xl">{challenge.icon ?? '🏁'}</Text>
              </View>

              <View className="flex-1">
                <CreatorStatusChip presentation={presentation} size="small" />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[13px] font-semibold mt-2 leading-relaxed"
                >
                  {challenge.description}
                </Text>
              </View>
            </View>

            {challenge.state !== 'Open' && challenge.state !== 'Upcoming' ? (
              <View className="mt-4">
                <CreatorProgressBar
                  progress={challenge.progress}
                  subject={challenge.title}
                  tone={
                    challenge.state === 'Completed' || challenge.state === 'Claimed'
                      ? 'success'
                      : 'brand'
                  }
                />
              </View>
            ) : null}

            <View
              style={{ borderTopColor: tokens.color.border.default }}
              className="flex-row items-center justify-between border-t mt-4 pt-3.5"
            >
              {challenge.reward ? <RewardPill reward={challenge.reward} /> : <View />}

              {challenge.endsAt ? (
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-black"
                >
                  {challenge.state === 'Upcoming' ? 'Starts' : 'Ends'}{' '}
                  {formatRelativeTime(
                    challenge.state === 'Upcoming' ? (challenge.startsAt ?? challenge.endsAt) : challenge.endsAt
                  )}
                </Text>
              ) : null}
            </View>
          </CreatorCard>

          {/* ── Not eligible ─────────────────────────────────────────────── */}
          {!challenge.isEligible && challenge.ineligibleReason ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-2xl p-4 mb-5 flex-row items-start"
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={tokens.color.warning.default}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold ml-2 flex-1 leading-relaxed"
              >
                {challenge.ineligibleReason}
              </Text>
            </View>
          ) : null}

          {/* ── Tasks ────────────────────────────────────────────────────── */}
          <CreatorSection
            title="What you have to do"
            subtitle={`${challenge.tasks.filter((task) => task.isComplete).length} of ${challenge.tasks.length} done`}
          >
            <CreatorCard padded={false}>
              <View className="px-4">
                {challenge.tasks.map((task) => (
                  <ChallengeTaskRow
                    key={task.taskId}
                    task={task}
                    onAction={(route) => router.push(route as never)}
                  />
                ))}
              </View>
            </CreatorCard>
          </CreatorSection>

          {/* ── Rules ────────────────────────────────────────────────────── */}
          {challenge.rules.length > 0 ? (
            <CreatorSection title="The rules" subtitle="Diaspora's words, not the app's">
              <CreatorCard>
                {challenge.rules.map((rule, index) => (
                  <View key={index} className="flex-row items-start mb-2 last:mb-0">
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[12px] font-bold mr-2"
                    >
                      •
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-[12px] font-medium flex-1 leading-relaxed"
                    >
                      {rule}
                    </Text>
                  </View>
                ))}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Leaderboard ──────────────────────────────────────────────── */}
          {challenge.hasLeaderboard ? (
            <CreatorSection
              title="Standings"
              subtitle={
                challenge.participantCount
                  ? `${challenge.participantCount.toLocaleString()} taking part`
                  : undefined
              }
              actionLabel={showLeaderboard ? 'Hide' : 'Show'}
              onAction={() => {
                const next = !showLeaderboard;
                setShowLeaderboard(next);
                if (next) {
                  trackCreatorEvent('creator.challenge.leaderboard_viewed', {
                    challengeId: challenge.challengeId,
                  });
                }
              }}
            >
              {showLeaderboard ? (
                leaderboard.isLoading ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                  </View>
                ) : leaderboard.leaderboard ? (
                  <CreatorCard padded={false}>
                    <View className="px-3 pt-3">
                      <LeaderboardHeader leaderboard={leaderboard.leaderboard} />
                      {leaderboard.leaderboard.entries.slice(0, 10).map((entry) => (
                        <LeaderboardRow
                          key={entry.creatorId}
                          entry={entry}
                          scoreLabel={leaderboard.leaderboard!.scoreLabel}
                          isViewer={
                            entry.creatorId === leaderboard.leaderboard?.viewerEntry?.creatorId
                          }
                        />
                      ))}
                    </View>
                  </CreatorCard>
                ) : (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-xs font-semibold text-center py-4"
                  >
                    Standings are not available for this challenge.
                  </Text>
                )
              ) : null}
            </CreatorSection>
          ) : null}

          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mb-4 leading-relaxed"
          >
            Diaspora counts your progress. Nothing here is worked out on your phone.
          </Text>
        </View>
      ) : null}
    </CreatorScreen>
  );
}
