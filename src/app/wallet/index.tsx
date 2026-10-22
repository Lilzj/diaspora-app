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
import { router, useLocalSearchParams } from 'expo-router';
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
  useRewardPointsBalance,
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

  // A Stripe Checkout return, opened here by an App Link (lib/app-links.ts). It says
  // only what the member did: the money is settled by Stripe's verified callback,
  // never by this redirect, so a completed return reads "will update", not "received".
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();

  // Above the refusal guard below, and it has to stay there. This used to sit
  // beside the capability reads further down, which put a hook AFTER an early
  // return: a cold start renders once refused while the auth store rehydrates
  // and once allowed after it, so React saw twelve hooks and then thirteen and
  // aborted the whole tree with "Rendered more hooks than during the previous
  // render". The app crashed on opening the wallet.
  //
  // It typechecked, and 4,617 tests passed. Only a cold start on a device with
  // an unsettled session shows it, which is why it survived a release build.
  const rewardBalance = useRewardPointsBalance();

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

  // -- What this deployment can actually do, asked rather than assumed --------
  //
  // These replaced a compile-time `gapsEnabled` flag. The flag was false in
  // every release build, so the wallet told members that adding money,
  // withdrawing and rewards were "not available on Diaspora yet" -- while the
  // backend served all three. The capability report is the platform answering
  // for itself, so the buttons light up when a provider is connected rather than
  // when somebody remembers to ship a new binary. (Rewards, below, is no longer
  // gated at all.)
  //
  // They are still gated, and honestly: `gateways` is empty on this deployment,
  // so there is genuinely nothing to charge a card with. The difference is that
  // the member is now told which of those two things is true.
  const payoutsEnabled = capabilities.data?.payoutsEnabled ?? false;
  const canDeposit = (capabilities.data?.supportedMethods?.length ?? 0) > 0;

  // Rewards is not a capability to gate. `/wallet/rewards` shows the balance and
  // where it came from whatever the deployment does about conversion, and says
  // itself whether, and why not, conversion is open. The action used to be
  // gated on the balance's `canConvert` — false below the minimum, as well as
  // when conversion is off — and explained either case as "this deployment has
  // not published a rate", so a member short of the minimum was told the rate
  // was missing and could not reach their own points.
  const rewardPoints = rewardBalance.data?.balance;

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

        {checkout === 'complete' || checkout === 'cancelled' ? (
          <View
            testID="checkout-return-notice"
            style={{ borderColor: tokens.color.border.default }}
            className="border rounded-2xl p-4 mb-4"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black mb-1">
              {checkout === 'complete' ? 'Payment sent' : 'Payment cancelled'}
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
              {checkout === 'complete'
                ? 'Your balance will update as soon as Diaspora has confirmed it with your bank. Pull down to refresh.'
                : 'Nothing was charged. You can try again whenever you are ready.'}
            </Text>
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
              isPreview={gapsEnabled && !canDeposit}
              disabled={!canDeposit && !gapsEnabled}
              disabledReason={
                canDeposit || gapsEnabled
                  ? undefined
                  : 'No payment method is connected to this deployment.'
              }
              onPress={() =>
                canDeposit || gapsEnabled
                  ? router.push('/wallet/add-money')
                  : explainUnavailable(
                      'No way to take a payment yet',
                      'Diaspora can hold and move money, but this deployment has no card or transfer provider connected, so there is nothing to charge. Your balance still grows from sales, refunds and credit.'
                    )
              }
            />

            <QuickAction
              icon="arrow-up-circle-outline"
              label="Withdraw"
              isPreview={gapsEnabled && !payoutsEnabled}
              disabled={!payoutsEnabled && !gapsEnabled}
              disabledReason={
                payoutsEnabled || gapsEnabled
                  ? undefined
                  : 'No payout rail is connected to this deployment.'
              }
              onPress={() =>
                payoutsEnabled || gapsEnabled
                  ? router.push('/wallet/withdraw')
                  : explainUnavailable(
                      'No way to pay you out yet',
                      'The withdrawal flow is built and this deployment has no settlement provider behind it, so there is nowhere for the money to go. Your balance is safe and can be spent on the platform.'
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
              detail={rewardPoints === undefined ? undefined : `${rewardPoints.toLocaleString()} pts`}
              onPress={() => router.push('/wallet/rewards')}
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
          <WalletLink icon="shield-outline" label="How payments work" onPress={() => router.push('/wallet/protection')} />
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
