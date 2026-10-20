// ─────────────────────────────────────────────────────────────────────────────
// Rewards: the member's points, where they came from, and converting them.
//
// Real reads throughout (`GET /financial/rewards/me`, `/me/history`,
// `/conversion`). Until 20 Oct 2026 the screen still refused to render unless
// the simulation flag was on, so a release build showed "not available" over
// working routes.
// ─────────────────────────────────────────────────────────────────────────────

import { conversionReasonText } from '@/lib/reward-conversion-text';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndFlatList } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorView,
  TransactionListSkeleton,
} from '@/components/financial';
import {
  useConversionPolicy,
  useRewardBalance,
  useRewardHistory,
} from '@/hooks/financial-gaps';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { useAuthStore } from '@/store/auth';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { RewardHistoryEntry } from '@/types/financial-gaps';

/** Where points came from, in words a contributor recognises. */
function describeRewardSource(source: string): { label: string; icon: string } {
  switch (source) {
    case 'GuidePublished': return { label: 'Guide published', icon: 'document-text-outline' };
    case 'GuideHelpfulVote': return { label: 'Marked helpful', icon: 'thumbs-up-outline' };
    case 'UpdatePublished': return { label: 'Update posted', icon: 'megaphone-outline' };
    case 'ReviewWritten': return { label: 'Review written', icon: 'star-outline' };
    case 'VerificationCompleted': return { label: 'Verification completed', icon: 'shield-checkmark-outline' };
    case 'ReferralJoined': return { label: 'Someone you invited joined', icon: 'person-add-outline' };
    case 'CommunityContribution': return { label: 'Community contribution', icon: 'people-outline' };
    case 'ModeratorAction': return { label: 'Helpful report', icon: 'flag-outline' };
    case 'SeasonalBonus': return { label: 'Seasonal bonus', icon: 'gift-outline' };
    default: return { label: source.replace(/([A-Z])/g, ' $1').trim(), icon: 'ellipse-outline' };
  }
}


/** How many entries the default view shows before a range is chosen. */
const RECENT_COUNT = 10;

type RewardRange = 'recent' | '30d' | '90d' | 'all';

const REWARD_RANGES: { key: RewardRange; label: string; accessibilityLabel: string }[] = [
  { key: 'recent', label: 'Latest 10', accessibilityLabel: 'Show the ten most recent entries' },
  { key: '30d', label: '30 days', accessibilityLabel: 'Show the last thirty days' },
  { key: '90d', label: '90 days', accessibilityLabel: 'Show the last ninety days' },
  { key: 'all', label: 'All', accessibilityLabel: 'Show every entry' },
];
export default function RewardsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const balanceQuery = useRewardBalance();
  const historyQuery = useRewardHistory();
  const policyQuery = useConversionPolicy();

  const [isRefreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RewardRange>('recent');

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.WalletRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const allEntries = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.entries) ?? [],
    [historyQuery.data]
  );

  // ── The ledger, filtered ──────────────────────────────────────────────────
  //
  // This was an unbounded infinite list. Every point a member has ever earned,
  // newest first, with nothing to hold on to — which is fine for ten entries
  // and unusable for four hundred.
  //
  // `recent` is the default and shows ten. It answers the question somebody
  // opens this screen with: what did I just earn?
  //
  // **The ranges filter what has been loaded, not the server.** The endpoint
  // takes a cursor and a limit and no dates, so a "last 90 days" that promised
  // completeness would be lying whenever the ninetieth day sat beyond the pages
  // fetched so far. Infinite scroll keeps running underneath, so the range
  // fills in as the member scrolls, and the count beside each chip is the
  // honest one: how many of the loaded entries fall inside it.
  const entries = useMemo(() => {
    if (range === 'recent') return allEntries.slice(0, RECENT_COUNT);
    if (range === 'all') return allEntries;

    const days = range === '30d' ? 30 : 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return allEntries.filter((entry) => new Date(entry.occurredAt).getTime() >= cutoff);
  }, [allEntries, range]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([balanceQuery.refetch(), historyQuery.refetch(), policyQuery.refetch()]);
    setRefreshing(false);
  }, [balanceQuery, historyQuery, policyQuery]);

  if (!refusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Rewards" showBack />
        <AccessGate refusal={refusal} />
      </SafeAreaView>
    );
  }

  if (balanceQuery.isError && balanceQuery.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Rewards" showBack />
        <FinancialErrorView error={balanceQuery.error as FinancialError} onRetry={balanceQuery.refetch} />
      </SafeAreaView>
    );
  }

  const balance = balanceQuery.data;
  const policy = policyQuery.data;
  const canConvert = Boolean(policy?.isEligible && balance && balance.available >= (policy?.minimumPoints ?? 0));

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Rewards" showBack />

      <ScrollEndFlatList
        data={entries}
        keyExtractor={(item) => item.entryId}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={tokens.color.primary[500]} />
        }
        onEndReached={() => {
          if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
            void historyQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View className="p-5">

            {balanceQuery.isLoading || !balance ? (
              <View className="py-10 items-center">
                <ActivityIndicator size="small" color={tokens.color.primary[500]} />
              </View>
            ) : (
              <>
                {/* The balance. A count with a unit — never a currency. */}
                <View
                  style={{ backgroundColor: tokens.color.secondary[500] }}
                  className="rounded-3xl p-5 mt-5"
                  accessible
                  accessibilityLabel={`${balance.available.toLocaleString()} points available${balance.pending > 0 ? `, ${balance.pending.toLocaleString()} still pending` : ''}.`}
                >
                  <Text className="text-white/75 text-[11px] font-black uppercase tracking-widest mb-2">
                    Contribution points
                  </Text>
                  <Text
                    className="text-white text-5xl font-black tracking-tight"
                    style={{ fontVariant: ['tabular-nums'] }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {balance.available.toLocaleString()}
                  </Text>

                  {balance.pending > 0 ? (
                    <Text className="text-white/70 text-[11px] font-bold mt-2">
                      {balance.pending.toLocaleString()} more still being confirmed
                    </Text>
                  ) : null}

                  <View className="flex-row mt-5 pt-4 border-t border-white/20">
                    <View className="flex-1">
                      <Text className="text-white/65 text-[10px] font-black uppercase tracking-widest mb-1">
                        Earned in total
                      </Text>
                      <Text className="text-white text-sm font-bold">
                        {balance.lifetimeEarned.toLocaleString()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-white/65 text-[10px] font-black uppercase tracking-widest mb-1">
                        Converted
                      </Text>
                      <Text className="text-white text-sm font-bold">
                        {balance.lifetimeConverted.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Progress toward the next threshold, when there is one. */}
                {balance.nextThreshold && balance.nextThresholdLabel ? (
                  <View
                    style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                    className="rounded-2xl border p-4 mt-4"
                    accessible
                    accessibilityLabel={`${balance.nextThreshold - balance.available} points until ${balance.nextThresholdLabel}.`}
                  >
                    <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold mb-2">
                      {Math.max(0, balance.nextThreshold - balance.available).toLocaleString()} points until{' '}
                      {balance.nextThresholdLabel}
                    </Text>
                    <View
                      style={{ backgroundColor: tokens.color.neutral[200] }}
                      className="h-1.5 rounded-full overflow-hidden"
                      accessibilityRole="progressbar"
                    >
                      <View
                        style={{
                          backgroundColor: tokens.color.primary[500],
                          width: `${Math.min(100, (balance.available / balance.nextThreshold) * 100)}%`,
                        }}
                        className="h-full rounded-full"
                      />
                    </View>
                  </View>
                ) : null}

                {/* Conversion. The rate is displayed from the policy; the value
                    of any specific conversion comes from the preview. */}
                <TouchableOpacity
                  onPress={() => router.push('/wallet/rewards/convert')}
                  disabled={!canConvert}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={
                    canConvert
                      ? 'Convert points into wallet credit'
                      : policy
                        ? `You need at least ${policy.minimumPoints.toLocaleString()} points to convert.`
                        : 'Conversion unavailable'
                  }
                  accessibilityState={{ disabled: !canConvert }}
                  style={{
                    backgroundColor: canConvert ? tokens.color.primary[500] : tokens.color.neutral[200],
                  }}
                  className="h-13 py-4 rounded-full items-center justify-center mt-4"
                >
                  <Text
                    style={{ color: canConvert ? '#FFFFFF' : tokens.color.text.disabled }}
                    className="text-xs font-black uppercase tracking-wider"
                  >
                    Convert to wallet credit
                  </Text>
                </TouchableOpacity>

                {policy && !canConvert ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-semibold text-center mt-2.5 leading-relaxed"
                  >
                    {policy.isEligible
                      ? `You need at least ${policy.minimumPoints.toLocaleString()} points to convert.`
                      : conversionReasonText(policy.ineligibleReason)}
                  </Text>
                ) : null}

                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-base font-black tracking-tight mt-8 mb-1"
                  accessibilityRole="header"
                >
                  How you earned them
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
                  className="mt-3 mb-1"
                  accessibilityRole="tablist"
                >
                  {REWARD_RANGES.map((option) => {
                    const isActive = range === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => setRange(option.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={option.accessibilityLabel}
                        style={{
                          backgroundColor: isActive
                            ? tokens.color.primary[500]
                            : tokens.color.surface.card,
                          borderColor: isActive
                            ? tokens.color.primary[500]
                            : tokens.color.border.default,
                        }}
                        className="rounded-xl border px-3 py-1.5 mr-2"
                      >
                        <Text
                          style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                          className="text-[11px] font-bold"
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {range !== 'recent' && allEntries.length > entries.length ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-medium leading-relaxed mb-1"
                  >
                    {entries.length} of {allEntries.length} loaded entries fall in this period.
                    Scroll to load more.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => <RewardRow entry={item} />}
        ListEmptyComponent={
          historyQuery.isLoading ? (
            <TransactionListSkeleton rows={5} />
          ) : (
            <View className="px-8 py-10 items-center">
              <Ionicons name="sparkles-outline" size={30} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-sm font-bold text-center mt-3"
              >
                No points yet
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-xs font-medium text-center mt-1 leading-relaxed"
              >
                Publishing guides, writing reviews and helping others all earn points.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          historyQuery.isFetchingNextPage ? (
            <View className="py-6 items-center">
              <ActivityIndicator size="small" color={tokens.color.primary[500]} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function RewardRow({ entry }: { entry: RewardHistoryEntry }) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const { label, icon } = describeRewardSource(entry.source);
  const isNegative = entry.points < 0;

  return (
    <View
      accessible
      accessibilityLabel={`${entry.reason}. ${isNegative ? 'minus ' : 'plus '}${Math.abs(entry.points)} points. ${formatRelativeTime(entry.occurredAt)}.`}
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b px-5 py-3.5"
    >
      <View
        style={{ backgroundColor: isDark ? tokens.color.surface.elevated : tokens.color.neutral[100] }}
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
      >
        <Ionicons name={icon as never} size={18} color={tokens.color.text.secondary} />
      </View>

      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight" numberOfLines={2}>
          {entry.reason}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
          {label} · {formatRelativeTime(entry.occurredAt)}
        </Text>
      </View>

      <Text
        style={{
          color: isNegative ? tokens.color.text.secondary : tokens.color.success.default,
          fontVariant: ['tabular-nums'],
        }}
        className="text-base font-black tracking-tight"
      >
        {isNegative ? '−' : '+'}
        {Math.abs(entry.points).toLocaleString()}
      </Text>
    </View>
  );
}
