// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Wallet dashboard (Frontend Phase 5)
//
// The financial home. Everything on it comes from the backend: five balances
// from `GET /wallets/me`, recent activity from `GET /wallets/me/transactions`,
// and what this deployment can do from `GET /capabilities`.
//
// **Nothing here is totalled by the client.** §5 and §6 of the brief both say
// so, and the reason is `WalletResponse.lifetimeCredits` — the backend already
// knows the number, computed from the whole ledger, and a client that summed a
// page of history would produce a smaller one and be confidently wrong.
//
// The empty state is not "£0.00". A member whose verification is not yet
// approved has no financial identity at all, and B15 answers with an empty
// array rather than a zero balance. Rendering "£0.00" would tell them they have
// a wallet with nothing in it; they have no wallet.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorInline,
  QuickAction,
  QuickActionRow,
  StatusBanner,
  TransactionListSkeleton,
  TransactionRow,
  WalletBalanceCard,
  WalletBalanceSkeleton,
  WalletLifetimeTotals,
} from '@/components/financial';
import {
  useFinancialAccess,
  useFinancialCapabilities,
  useMySubscription,
  usePrimaryWallet,
  useTransactions,
} from '@/hooks/financial';
import { useGapFeaturesEnabled } from '@/hooks/financial-gaps';
import { useConnectivityStore } from '@/lib/connectivity';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { presentSubscriptionStatus, presentWalletStatus } from '@/lib/financial-status';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import type { FinancialError } from '@/lib/financial-errors';

export default function WalletScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert } = useNotification();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const isOnline = useConnectivityStore((state) => state.isOnline);

  const access = useFinancialAccess();
  const gapsEnabled = useGapFeaturesEnabled();

  const walletQuery = usePrimaryWallet();
  const transactionsQuery = useTransactions(undefined, 8);
  const subscriptionQuery = useMySubscription();
  const capabilities = useFinancialCapabilities();

  const [isRefreshing, setRefreshing] = useState(false);

  const readRefusal = useMemo(
    () => checkAccess(FinancialPermissions.WalletRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      walletQuery.refetch(),
      transactionsQuery.refetch(),
      subscriptionQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [walletQuery, transactionsQuery, subscriptionQuery]);

  /**
   * What happens when somebody taps an action the platform cannot perform.
   *
   * An explanation, not a dead button and not a silent no-op. Withdrawals do
   * not exist on this platform and the honest answer is to say so.
   */
  const explainUnavailable = useCallback(
    (title: string, message: string) => {
      showAlert({ type: 'info', title, message, buttons: [{ text: 'I see' }] });
    },
    [showAlert]
  );

  if (!readRefusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Wallet" showBack />
        <AccessGate refusal={readRefusal} />
      </SafeAreaView>
    );
  }

  const wallet = walletQuery.wallet;
  const transactions = transactionsQuery.data ?? [];
  const subscription = subscriptionQuery.data;

  const payoutsEnabled = capabilities.data?.payoutsEnabled ?? false;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader
        title="Wallet"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/wallet/statement')}
            className="w-12 h-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Statement"
          >
            <Ionicons name="receipt-outline" size={21} color={tokens.color.text.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.color.primary[500]}
          />
        }
      >
        {/* Offline is stated once, at the top, rather than as a failure on each
            section. Read-only data below is cached and still worth showing. */}
        {!isOnline ? (
          <View className="mb-4">
            <FinancialErrorInline
              error={
                {
                  kind: 'offline',
                  message: 'You are offline.',
                  hint: 'Balances may be out of date, and payments are unavailable until you reconnect.',
                  isRetryable: false,
                  isTerminal: false,
                  isIndeterminate: false,
                } as FinancialError
              }
            />
          </View>
        ) : null}

        {/* ── Balance ─────────────────────────────────────────────────── */}

        {walletQuery.isLoading ? (
          <WalletBalanceSkeleton />
        ) : walletQuery.isError && walletQuery.error ? (
          <FinancialErrorInline error={walletQuery.error} onRetry={walletQuery.refetch} />
        ) : !wallet ? (
          <NoWalletYet />
        ) : (
          <WalletBalanceCard
            wallet={wallet}
            isStale={!isOnline}
            onPressStatement={() => router.push('/wallet/statement')}
          />
        )}

        {/* A frozen or pending wallet gets a full banner, not just the chip on
            the card: it changes what every action below will do. */}
        {wallet && wallet.status !== 'Active' ? (
          <View className="mt-4">
            <StatusBanner
              status={presentWalletStatus(wallet.status)}
              detail={wallet.statusReason}
            />
          </View>
        ) : null}

        {/* ── Quick actions ───────────────────────────────────────────── */}

        <View className="mt-6">
          <QuickActionRow>
            <QuickAction
              icon="add-circle-outline"
              label="Add money"
              isPreview={gapsEnabled}
              disabled={!gapsEnabled}
              disabledReason={
                gapsEnabled ? undefined : 'Adding money is not available on Diaspora yet.'
              }
              onPress={() =>
                gapsEnabled
                  ? router.push('/wallet/add-money')
                  : explainUnavailable(
                      'Not available yet',
                      'Adding money to your Diaspora wallet is not something the platform can do yet. Your balance grows from sales, refunds and credit.'
                    )
              }
            />

            <QuickAction
              icon="arrow-up-circle-outline"
              label="Withdraw"
              isPreview={gapsEnabled}
              disabled={!gapsEnabled || payoutsEnabled === false ? !gapsEnabled : false}
              disabledReason={
                gapsEnabled ? undefined : 'Withdrawals are not available on Diaspora yet.'
              }
              onPress={() =>
                gapsEnabled
                  ? router.push('/wallet/withdraw')
                  : explainUnavailable(
                      'Withdrawals are not available yet',
                      'Diaspora cannot send money to a bank account yet. Money in your wallet can be spent on the platform, and we will tell you when withdrawals arrive.'
                    )
              }
            />

            <QuickAction
              icon="heart-outline"
              label="Donate"
              disabled={!access.canGive}
              disabledReason={access.canGive ? undefined : 'Verification is needed before you can give.'}
              onPress={() =>
                access.canGive
                  ? router.push('/wallet/donate')
                  : explainUnavailable(
                      'Verification needed',
                      'Diaspora verification has to be approved before money can move. You can browse causes in the meantime.'
                    )
              }
            />

            <QuickAction
              icon="sparkles-outline"
              label="Rewards"
              isPreview={gapsEnabled}
              disabled={!gapsEnabled}
              disabledReason={gapsEnabled ? undefined : 'Creator rewards are not available yet.'}
              onPress={() =>
                gapsEnabled
                  ? router.push('/wallet/rewards')
                  : explainUnavailable(
                      'Rewards are not available yet',
                      'Contribution points and reward conversion are not part of Diaspora yet. Your reputation still grows from everything you contribute.'
                    )
              }
            />
          </QuickActionRow>
        </View>

        {/* ── Grow ─────────────────────────────────────────────────────
            The bridge to Phase 6's business surface. The wallet is the member's
            own money; `/monetization` is what they sell and promote with it.
            One entry point rather than a second copy of the promotion, plan and
            billing rows, which is §23's "do not duplicate the same feature in
            multiple navigation trees". */}

        <TouchableOpacity
          onPress={() => router.push('/monetization')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Grow. Promotions, plans, advertising and billing for what you sell on Diaspora."
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="flex-row items-center rounded-2xl border p-4 mt-6"
        >
          <View
            style={{ backgroundColor: tokens.color.secondary[50] }}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
          >
            <Ionicons name="trending-up-outline" size={19} color={tokens.color.secondary[500]} />
          </View>

          <View className="flex-1">
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
              Grow
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold mt-0.5">
              Promotions, plans and advertising
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={tokens.color.text.placeholder} />
        </TouchableOpacity>

        {/* ── Subscription ────────────────────────────────────────────── */}

        {subscription ? (
          <TouchableOpacity
            onPress={() => router.push('/wallet/subscription')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Your plan. ${presentSubscriptionStatus(subscription.status).description}`}
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="flex-row items-center rounded-2xl border p-4 mt-6"
          >
            <View
              style={{ backgroundColor: tokens.color.primary[50] }}
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
            >
              <Ionicons name="star-outline" size={19} color={tokens.color.primary[600]} />
            </View>

            <View className="flex-1">
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
                Your plan
              </Text>
              <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold mt-0.5">
                {presentSubscriptionStatus(subscription.status).label}
                {subscription.cancelAtPeriodEnd ? ' · ends this period' : ''}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={tokens.color.text.placeholder} />
          </TouchableOpacity>
        ) : null}

        {/* ── Lifetime totals ─────────────────────────────────────────── */}

        {wallet ? (
          <View className="mt-4">
            <WalletLifetimeTotals wallet={wallet} />
          </View>
        ) : null}

        {/* ── Recent activity ─────────────────────────────────────────── */}

        <View className="flex-row items-center justify-between mt-8 mb-1">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black tracking-tight"
            accessibilityRole="header"
          >
            Recent activity
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/wallet/transactions')}
            accessibilityRole="button"
            accessibilityLabel="See all transactions"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={{ color: tokens.color.primary[500] }} className="text-[11px] font-black uppercase tracking-wider">
              See all
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border overflow-hidden mt-2"
        >
          {transactionsQuery.isLoading ? (
            <TransactionListSkeleton rows={4} />
          ) : transactionsQuery.isError && transactionsQuery.error ? (
            <View className="p-4">
              <FinancialErrorInline
                error={transactionsQuery.error as FinancialError}
                onRetry={transactionsQuery.refetch}
              />
            </View>
          ) : transactions.length === 0 ? (
            <View className="px-5 py-10 items-center">
              <Ionicons name="receipt-outline" size={28} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-sm font-bold mt-3 text-center"
              >
                Nothing has happened yet
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-xs font-medium mt-1 text-center leading-relaxed"
              >
                Payments, refunds and credit will appear here as they happen.
              </Text>
            </View>
          ) : (
            transactions.map((transaction) => (
              <TransactionRow
                key={transaction.transactionId}
                transaction={transaction}
                onPress={() => router.push(`/wallet/transactions/${transaction.transactionId}`)}
              />
            ))
          )}
        </View>

        {/* ── Everything else ─────────────────────────────────────────── */}

        <View className="mt-6" style={{ gap: 8 }}>
          <WalletLink icon="bag-handle-outline" label="Purchases and promotions" onPress={() => router.push('/wallet/purchases')} />
          <WalletLink icon="heart-outline" label="Your giving" onPress={() => router.push('/wallet/giving')} />
          <WalletLink icon="card-outline" label="Payment history" onPress={() => router.push('/wallet/payments')} />
          <WalletLink icon="shield-outline" label="Buyer and seller protection" onPress={() => router.push('/wallet/protection')} />
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function WalletLink({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { tokens } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="flex-row items-center rounded-2xl border px-4 py-3.5"
    >
      <Ionicons name={icon as never} size={19} color={tokens.color.text.secondary} />
      <Text style={{ color: tokens.color.text.primary }} className="flex-1 text-sm font-bold tracking-tight ml-3">
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={17} color={tokens.color.text.placeholder} />
    </TouchableOpacity>
  );
}

/**
 * No wallet — which is not the same as an empty one.
 *
 * B15 opens a financial identity when Trust approves a verification. Before
 * that, `GET /wallets/me` answers with an empty array, and the honest rendering
 * says the wallet does not exist yet rather than showing a zero balance.
 */
function NoWalletYet() {
  const { tokens } = useTheme();

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-3xl border p-6 items-center"
      accessible
      accessibilityLabel="You do not have a Diaspora wallet yet. One opens automatically once your verification is approved."
    >
      <View
        style={{ backgroundColor: tokens.color.info.surface }}
        className="w-14 h-14 rounded-full items-center justify-center mb-4"
      >
        <Ionicons name="wallet-outline" size={26} color={tokens.color.info.default} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black text-center tracking-tight mb-2"
      >
        Your wallet opens after verification
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-medium text-center leading-relaxed"
      >
        Once your Diaspora verification is approved, a wallet is created for you automatically. There is
        nothing to set up.
      </Text>

      <TouchableOpacity
        onPress={() => router.push('/verification/diaspora')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Start verification"
        style={{ backgroundColor: tokens.color.primary[500] }}
        className="h-11 px-6 rounded-full items-center justify-center mt-5"
      >
        <Text className="text-white text-[11px] font-black uppercase tracking-wider">
          Start verification
        </Text>
      </TouchableOpacity>
    </View>
  );
}
