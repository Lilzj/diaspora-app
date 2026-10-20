// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator rewards and points (Frontend Phase 7, §10 · §11)
//
// **This screen deliberately does not own a points ledger.** Phase 5 already
// built one — balance, history, conversion policy, conversion — against
// `/financial-gap/v0/rewards`, and §10 says "Do not create a second wallet. Do
// not create a second payment system." So:
//
//   the balance          → Phase 5's `useRewardBalance`, adapted
//   the history          → `/wallet/rewards`, linked to rather than duplicated
//   converting to money  → `/wallet/rewards/convert`, Phase 5's flow, untouched
//
// What is new here is the two things Phase 5 had no contract for and did not
// build: the **catalogue of how points are earned** (CREATOR-GAP-011) and the
// **catalogue of what they can be spent on**. Spending points on a reward is
// not the same operation as converting them to wallet credit, and keeping them
// on separate routes keeps the money path unambiguous.
//
// The redemption flow never decrements a balance on the device. §12 of the
// success criteria: points are never awarded — or spent — by the frontend. It
// posts, then re-reads.
// ─────────────────────────────────────────────────────────────────────────────

import { conversionReasonText } from '@/lib/reward-conversion-text';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  PointsBalanceCard,
  RewardCard,
} from '@/components/creator-economy';
import { FinancialErrorInline } from '@/components/financial';
import {
  useCreatorAccess,
  useCreatorConversionPolicy,
  useCreatorPoints,
  usePointRules,
  useRedeemReward,
  useRewardCatalogue,
  useRewardRedemptions,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatPoints } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { CreatorPointRule, CreatorReward } from '@/types/creator-economy';

type Tab = 'spend' | 'earn' | 'history';

export default function CreatorRewardsScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const points = useCreatorPoints();
  const catalogue = useRewardCatalogue();
  const rules = usePointRules();
  const redemptions = useRewardRedemptions();
  const policy = useCreatorConversionPolicy();
  const redeem = useRedeemReward();
  const access = useCreatorAccess();

  const [tab, setTab] = useState<Tab>('spend');
  const [isRefreshing, setRefreshing] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  useEffect(() => {
    trackCreatorEvent('creator.rewards.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const claimRefusal = checkCreatorAccess(CreatorCapabilities.ClaimReward, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const convertRefusal = checkCreatorAccess(CreatorCapabilities.ConvertPoints, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([points.refetch(), catalogue.refetch(), redemptions.refetch()]);
    setRefreshing(false);
  }, [points, catalogue, redemptions]);

  const onRedeem = useCallback(
    (reward: CreatorReward) => {
      setRedeemingId(reward.rewardId);
      trackCreatorEvent('creator.reward.redeemed', {
        rewardId: reward.rewardId,
        category: reward.category ?? undefined,
        ...(reward.pointsCost
          ? { pointsBucket: reward.pointsCost >= 5_000 ? '5k+' : reward.pointsCost >= 1_000 ? '1k-5k' : '<1k' }
          : {}),
      });
      redeem.mutate(reward.rewardId, { onSettled: () => setRedeemingId(null) });
    },
    [redeem]
  );

  const available = points.data?.available ?? 0;

  const canConvert = useMemo(
    () =>
      Boolean(
        convertRefusal.allowed &&
          policy.data?.isEligible &&
          available >= (policy.data?.minimumPoints ?? 0)
      ),
    [available, convertRefusal.allowed, policy.data]
  );

  const convertBlockedReason = useMemo(() => {
    if (!convertRefusal.allowed) return convertRefusal.message;
    if (!policy.data) return undefined;
    if (!policy.data.isEligible) {
      // The server's reason is a code, not a sentence (20 Oct 2026): it was
      // shown as "financial.rewards.conversion_not_supported".
      return conversionReasonText(policy.data.ineligibleReason);
    }
    if (available < policy.data.minimumPoints) {
      return `You need at least ${policy.data.minimumPoints.toLocaleString()} points to convert.`;
    }
    return undefined;
  }, [available, convertRefusal, policy.data]);

  return (
    <CreatorScreen
      title="Rewards"
      subtitle="What you have earned, and what it is worth"
      gapKey="pointRules"
      gapDetail="Your points balance and history come from Phase 5's rewards adapter. The catalogue of how points are earned and what they can be spent on is simulated — Diaspora serves neither yet."
      isEnabled={catalogue.isEnabled}
      refusal={refusal}
      isLoading={points.isLoading}
      error={points.error}
      onRetry={points.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    >
      <View className="px-5 pt-5">
        {points.data ? (
          <PointsBalanceCard
            points={points.data}
            canConvert={canConvert}
            convertBlockedReason={convertBlockedReason}
            onConvert={() => {
              trackCreatorEvent('creator.points.conversion_started');
              // Phase 5's flow, unchanged. This screen does not price points.
              router.push('/wallet/rewards/convert');
            }}
            onViewHistory={() => router.push('/wallet/rewards')}
          />
        ) : null}

        {redeem.isError ? (
          <View className="mt-4">
            <FinancialErrorInline error={redeem.error as FinancialError} />
          </View>
        ) : null}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="flex-row rounded-2xl border p-1 mt-5 mb-5"
          accessibilityRole="tablist"
        >
          {(
            [
              { key: 'spend', label: 'Spend' },
              { key: 'earn', label: 'How to earn' },
              { key: 'history', label: 'Redeemed' },
            ] as { key: Tab; label: string }[]
          ).map((item) => {
            const isActive = tab === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={item.label}
                onPress={() => {
                  setTab(item.key);
                  if (item.key === 'earn') trackCreatorEvent('creator.points.rules_viewed');
                }}
                style={{
                  backgroundColor: isActive ? tokens.color.primary[500] : 'transparent',
                }}
                className="flex-1 rounded-xl py-2.5 items-center"
              >
                <Text
                  style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                  className="text-[11px] font-black"
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Spend ────────────────────────────────────────────────────── */}
        {tab === 'spend' ? (
          catalogue.isLoading ? (
            <CreatorCardSkeleton rows={3} />
          ) : catalogue.rewards.length === 0 ? (
            <CreatorEmptyState
              icon="gift-outline"
              title="Nothing to spend points on yet"
              body="Diaspora adds rewards as the programme grows. Your points keep their value in the meantime."
            />
          ) : (
            <>
              {catalogue.rewards.map((reward) => (
                <RewardCard
                  key={reward.rewardId}
                  reward={reward}
                  availablePoints={available}
                  canRedeem={claimRefusal.allowed}
                  redeemBlockedReason={claimRefusal.allowed ? undefined : claimRefusal.message}
                  isRedeeming={redeemingId === reward.rewardId}
                  onRedeem={onRedeem}
                />
              ))}
            </>
          )
        ) : null}

        {/* ── Earn ─────────────────────────────────────────────────────── */}
        {tab === 'earn' ? (
          rules.isLoading ? (
            <CreatorCardSkeleton rows={4} />
          ) : (
            <PointRulesList rules={rules.rules} />
          )
        ) : null}

        {/* ── History ──────────────────────────────────────────────────── */}
        {tab === 'history' ? (
          redemptions.isLoading ? (
            <CreatorCardSkeleton rows={2} />
          ) : redemptions.redemptions.length === 0 ? (
            <CreatorEmptyState
              icon="receipt-outline"
              title="Nothing redeemed yet"
              body="Rewards you spend points on will appear here with what Diaspora issued."
              actionLabel="See what is available"
              onAction={() => setTab('spend')}
            />
          ) : (
            <CreatorCard padded={false}>
              {redemptions.redemptions.map((redemption, index) => (
                <View
                  key={redemption.redemptionId}
                  accessible
                  accessibilityLabel={`${redemption.rewardTitle}. ${formatPoints(redemption.pointsSpent)} spent. ${redemption.state}. ${formatRelativeTime(redemption.createdAt)}.`}
                  style={{
                    borderBottomColor: tokens.color.border.default,
                    borderBottomWidth: index === redemptions.redemptions.length - 1 ? 0 : 1,
                  }}
                  className="px-4 py-3.5"
                >
                  <View className="flex-row items-start justify-between">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[13px] font-bold flex-1 mr-2"
                      numberOfLines={2}
                    >
                      {redemption.rewardTitle}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.secondary, fontVariant: ['tabular-nums'] }}
                      className="text-[13px] font-black"
                    >
                      −{redemption.pointsSpent.toLocaleString()}
                    </Text>
                  </View>

                  <View className="flex-row items-center mt-1">
                    <Text
                      style={{
                        color:
                          redemption.state === 'Redeemed'
                            ? tokens.color.success.default
                            : redemption.state === 'Rejected'
                              ? tokens.color.error.default
                              : tokens.color.warning.default,
                      }}
                      className="text-[10px] font-black uppercase tracking-wider"
                    >
                      {String(redemption.state)}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[10px] font-bold ml-2"
                    >
                      {formatRelativeTime(redemption.createdAt)}
                    </Text>
                  </View>

                  {redemption.grantReference ? (
                    <Text
                      selectable
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[10px] font-bold mt-1"
                    >
                      Reference {redemption.grantReference}
                    </Text>
                  ) : null}

                  {redemption.rejectionReason ? (
                    <Text
                      style={{ color: tokens.color.error.default }}
                      className="text-[11px] font-semibold mt-1 leading-relaxed"
                    >
                      {redemption.rejectionReason}
                    </Text>
                  ) : null}
                </View>
              ))}
            </CreatorCard>
          )
        ) : null}
      </View>
    </CreatorScreen>
  );
}

/**
 * How points are earned.
 *
 * Grouped by the category the *server* put on each rule, not by a grouping this
 * component invented — §11 forbids hard-coding award amounts, and hard-coding
 * the taxonomy around them would be the same mistake one level up.
 */
function PointRulesList({ rules }: { rules: CreatorPointRule[] }) {
  const { tokens } = useTheme();

  const grouped = useMemo(() => {
    const map = new Map<string, CreatorPointRule[]>();
    for (const rule of rules.filter((item) => item.isActive)) {
      const key = rule.category ?? 'Other';
      map.set(key, [...(map.get(key) ?? []), rule]);
    }
    return Array.from(map.entries());
  }, [rules]);

  if (grouped.length === 0) {
    return (
      <CreatorEmptyState
        icon="list-outline"
        title="No earning rules published"
        body="Diaspora has not published the point rules yet."
      />
    );
  }

  return (
    <View>
      {grouped.map(([category, categoryRules]) => (
        <CreatorSection key={category} title={category}>
          <CreatorCard padded={false}>
            {categoryRules.map((rule, index) => (
              <Pressable
                key={rule.ruleKey}
                accessibilityRole={rule.actionRoute ? 'button' : 'text'}
                accessibilityLabel={[
                  rule.label,
                  rule.description,
                  rule.points > 0 ? `Earns ${formatPoints(rule.points)}.` : null,
                  rule.limitLabel,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onPress={rule.actionRoute ? () => router.push(rule.actionRoute as never) : undefined}
                disabled={!rule.actionRoute}
                style={{
                  borderBottomColor: tokens.color.border.default,
                  borderBottomWidth: index === categoryRules.length - 1 ? 0 : 1,
                }}
                className="flex-row items-center px-4 py-3.5"
              >
                <View className="flex-1 mr-3">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-bold"
                  >
                    {rule.label}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-medium mt-0.5 leading-relaxed"
                  >
                    {rule.description}
                  </Text>
                  {rule.limitLabel ? (
                    <Text
                      style={{ color: tokens.color.text.disabled }}
                      className="text-[10px] font-bold mt-1"
                    >
                      {rule.limitLabel}
                    </Text>
                  ) : null}
                </View>

                <View className="items-end">
                  {rule.points > 0 ? (
                    <Text
                      style={{ color: tokens.color.primary[500], fontVariant: ['tabular-nums'] }}
                      className="text-[13px] font-black"
                    >
                      +{rule.points}
                    </Text>
                  ) : (
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-bold"
                    >
                      varies
                    </Text>
                  )}
                  {rule.actionRoute ? (
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={tokens.color.text.placeholder}
                    />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </CreatorCard>
        </CreatorSection>
      ))}
    </View>
  );
}
