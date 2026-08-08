// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator revenue dashboard (Frontend Phase 7, §16 · §17)
//
// The most carefully hedged screen in the phase, because it is the one where
// getting it wrong means telling somebody they have money they do not.
//
// **Half of this screen is real.** The available balance is B15's — the actual
// wallet, the actual figure a withdrawal would draw on. It is marked as real,
// it links to the real wallet, and no arithmetic is performed on it anywhere.
//
// **Half of it is simulated.** Which earning came from a sponsorship rather
// than a referral, what is pending versus cleared, and the per-source
// breakdown: B15 records money movements and not their business meaning, so the
// attribution is CREATOR-GAP-008. `<PartiallyRealNotice>` says which is which
// in as many words.
//
// §17's rule — "Do not represent pending revenue as available money" — is
// enforced three times over: separate fields on the DTO, separate cells with
// separate tones in `<RevenueHeadline>`, and no addition anywhere in this file.
// The screen never computes a total; the only totals shown are the server's.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  EarningRow,
  PartiallyRealNotice,
  RevenueBreakdown,
  RevenueHeadline,
  SimulatedFigure,
} from '@/components/creator-economy';
import { AmountDisplay, LabelledAmount } from '@/components/financial';
import { useCreatorAccess, useCreatorEarnings, useCreatorRevenue } from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { presentEarningState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { CREATOR_EARNING_STATES } from '@/types/creator-economy';
import type { CreatorEarning } from '@/types/creator-economy';

export default function CreatorRevenueScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);
  const [isRefreshing, setRefreshing] = useState(false);

  const revenue = useCreatorRevenue();
  const earnings = useCreatorEarnings({ state: stateFilter, source: sourceFilter });
  const access = useCreatorAccess();

  useEffect(() => {
    trackCreatorEvent('creator.revenue.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewRevenue, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    revenue.refetch();
    await earnings.refetch();
    setRefreshing(false);
  }, [earnings, revenue]);

  const openEarning = useCallback((earning: CreatorEarning) => {
    trackCreatorEvent('creator.revenue.transaction_opened', { source: String(earning.source) });
    // Every earning that settled did so through a real B15 transaction. Where
    // there is one, this opens the real transaction detail rather than a
    // creator-specific copy of it — §16: reuse Phase 5 financial infrastructure.
    if (earning.transactionId) {
      router.push(`/wallet/transactions/${earning.transactionId}` as never);
    }
  }, []);

  const summary = revenue.summary;
  const wallet = revenue.wallet;

  return (
    <CreatorScreen
      title="Revenue"
      subtitle="What you have earned, and what has cleared"
      isEnabled={revenue.isEnabled}
      refusal={refusal}
      isLoading={revenue.isLoading}
      error={revenue.error}
      onRetry={revenue.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    >
      <View className="px-5 pt-5">
        <PartiallyRealNotice
          gapKey="revenue"
          realPart="Your wallet balance, every transaction and every payment. These come from Diaspora's financial platform and are what a withdrawal would draw on."
          simulatedPart="Which source each earning came from, what is pending versus cleared, and the breakdown below. Diaspora does not attribute earnings yet."
        />

        {/* ── Headline ─────────────────────────────────────────────────── */}
        <View className="mt-5">
          {wallet ? (
            <RevenueHeadline
              available={wallet.available}
              pending={summary?.pending ?? null}
              isAvailableReal
              onOpenWallet={() => {
                trackCreatorEvent('creator.revenue.wallet_opened');
                router.push('/wallet');
              }}
            />
          ) : (
            <CreatorCard>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[13px] font-semibold leading-relaxed"
              >
                You do not have a wallet yet. One is created when your Diaspora verification is
                approved.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the Trust Centre to verify"
                onPress={() => router.push('/profile/trust-center')}
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="self-start rounded-full px-4 py-2.5 mt-3"
              >
                <Text className="text-white text-[11px] font-black uppercase tracking-wider">
                  Verify
                </Text>
              </Pressable>
            </CreatorCard>
          )}
        </View>

        {/* ── The four figures ─────────────────────────────────────────── */}
        {summary ? (
          <CreatorSection
            title="Where you stand"
            subtitle={`${summary.currentPeriodLabel.toLowerCase()} and lifetime`}
          >
            <CreatorCard>
              <View className="flex-row items-center justify-between mb-4">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-widest"
                >
                  Attribution
                </Text>
                <SimulatedFigure />
              </View>

              <View className="flex-row flex-wrap -mx-2">
                <View className="w-1/2 px-2 mb-4">
                  <LabelledAmount
                    label={summary.currentPeriodLabel}
                    value={summary.currentPeriod}
                    size="medium"
                  />
                </View>
                <View className="w-1/2 px-2 mb-4">
                  <LabelledAmount
                    label="Lifetime"
                    value={summary.lifetimeEarned}
                    size="medium"
                  />
                </View>
                <View className="w-1/2 px-2">
                  <LabelledAmount
                    label="Pending"
                    value={summary.pending}
                    size="small"
                    tone="muted"
                    hint="Not yours to withdraw yet"
                  />
                </View>
                <View className="w-1/2 px-2">
                  <LabelledAmount
                    label="Paid out"
                    value={summary.paidOut}
                    size="small"
                    tone="muted"
                  />
                </View>
              </View>

              {summary.processing.minorUnits > 0 ? (
                <View
                  style={{ backgroundColor: tokens.color.info.surface }}
                  className="flex-row items-center rounded-xl p-3 mt-4"
                >
                  <Ionicons name="sync-outline" size={15} color={tokens.color.info.default} />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[11px] font-semibold ml-2 flex-1"
                  >
                    On its way to your payout destination
                  </Text>
                  <AmountDisplay value={summary.processing} size="small" />
                </View>
              ) : null}
            </CreatorCard>
          </CreatorSection>
        ) : null}

        {/* ── Breakdown ────────────────────────────────────────────────── */}
        {summary ? (
          <CreatorSection
            title="Where it came from"
            subtitle="Percentages are Diaspora's, not worked out on your phone"
          >
            <CreatorCard>
              <RevenueBreakdown
                summary={summary}
                onSelectSource={(source) => {
                  trackCreatorEvent('creator.revenue.source_viewed', { source });
                  setSourceFilter((current) => (current === source ? undefined : source));
                }}
              />
            </CreatorCard>
          </CreatorSection>
        ) : null}

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <CreatorSection
          title="Every earning"
          subtitle={
            sourceFilter
              ? `Filtered to ${sourceFilter}. Tap the source again to clear.`
              : 'Newest first'
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16, paddingBottom: 12 }}
          >
            <FilterChip
              label="All"
              isActive={!stateFilter}
              onPress={() => setStateFilter(undefined)}
            />
            {CREATOR_EARNING_STATES.map((state) => (
              <FilterChip
                key={state}
                label={presentEarningState(state).label}
                isActive={stateFilter === state}
                onPress={() => setStateFilter((current) => (current === state ? undefined : state))}
              />
            ))}
          </ScrollView>

          {earnings.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="small" color={tokens.color.primary[500]} />
            </View>
          ) : earnings.earnings.length === 0 ? (
            <CreatorEmptyState
              icon="cash-outline"
              title="Nothing here"
              body={
                stateFilter || sourceFilter
                  ? 'No earnings match that filter.'
                  : 'Sponsorships, grants, donations and converted points will appear here as you earn them.'
              }
              actionLabel={stateFilter || sourceFilter ? 'Clear filters' : undefined}
              onAction={
                stateFilter || sourceFilter
                  ? () => {
                      setStateFilter(undefined);
                      setSourceFilter(undefined);
                    }
                  : undefined
              }
            />
          ) : (
            <CreatorCard padded={false}>
              <View className="px-4">
                {earnings.earnings.map((earning) => (
                  <EarningRow
                    key={earning.earningId}
                    earning={earning}
                    onPress={earning.transactionId ? openEarning : undefined}
                  />
                ))}
              </View>

              {earnings.hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load more earnings"
                  accessibilityState={{ busy: earnings.isFetchingNextPage }}
                  disabled={earnings.isFetchingNextPage}
                  onPress={() => earnings.fetchNextPage()}
                  className="py-4 items-center"
                >
                  <Text
                    style={{ color: tokens.color.primary[500] }}
                    className="text-[11px] font-black uppercase tracking-wider"
                  >
                    {earnings.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Text>
                </Pressable>
              ) : null}
            </CreatorCard>
          )}
        </CreatorSection>

        {/* ── Money lives in the wallet ────────────────────────────────── */}
        <CreatorSection title="Your money">
          <CreatorCard padded={false}>
            <WalletLink
              icon="wallet-outline"
              label="Wallet"
              hint="Balance, statement and receipts"
              onPress={() => router.push('/wallet')}
            />
            <WalletLink
              icon="swap-horizontal-outline"
              label="Transactions"
              hint="Every movement, from Diaspora"
              onPress={() => router.push('/wallet/transactions')}
            />
            <WalletLink
              icon="arrow-up-circle-outline"
              label="Withdraw"
              hint="Move money out of your wallet"
              onPress={() => router.push('/wallet/withdraw')}
            />
            <WalletLink
              icon="receipt-outline"
              label="Billing"
              hint="What you have paid Diaspora"
              onPress={() => router.push('/monetization/billing')}
              isLast
            />
          </CreatorCard>
        </CreatorSection>

        {summary ? (
          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mb-4 leading-relaxed"
          >
            Attribution generated {new Date(summary.generatedAt).toLocaleTimeString()}. Your wallet
            balance is live.
          </Text>
        ) : null}
      </View>
    </CreatorScreen>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`Filter by ${label}`}
      onPress={onPress}
      style={{
        backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
        borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
      }}
      className="rounded-full border px-3 py-1.5 mr-2"
    >
      <Text
        style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
        className="text-[11px] font-black"
      >
        {label}
      </Text>
    </Pressable>
  );
}

function WalletLink({
  icon,
  label,
  hint,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
      onPress={onPress}
      style={{
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      <View className="flex-1 mx-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
