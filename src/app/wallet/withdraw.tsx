// ═════════════════════════════════════════════════════════════════════════════
//   ⚠ BACKEND GAP — SIMULATED. See src/config/financial-gaps.ts → withdrawal. ⚠
//
//   B15 states the position in its own error catalogue: `PayoutNotSupported`
//   — "Returned by the payout surface. The seams exist; no settlement engine
//   ships in this phase." `GET /capabilities` reports `payoutsEnabled: false`.
//   There is no route.
//
//   The full flow is built here against `/financial-gap/v0`, per §4-C:
//   amount, destination, limits, review, confirmation, processing, result.
//
//   **No payout credential is held anywhere in this client.** §10 forbids
//   storing them in Zustand, AsyncStorage or any unencrypted client
//   persistence, and the way this satisfies it is stronger than compliance:
//   the contract never returns one. A destination is a server-issued id and a
//   masked label the server produced. There is no account number to leak.
// ═════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  AmountInput,
  FinancialErrorInline,
  GapNotice,
  GapUnavailableView,
  PaymentConfirmButton,
  ReviewDetailRow,
  ReviewRow,
  StatusBanner,
  WalletBalanceInline,
  useParsedAmount,
} from '@/components/financial';
import { useCanTransact, useCurrencies, usePrimaryWallet } from '@/hooks/financial';
import {
  useCreateWithdrawal,
  useGapFeaturesEnabled,
  usePayoutDestinations,
  useWithdrawalLimits,
  useWithdrawalReconciliation,
} from '@/hooks/financial-gaps';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { formatMoney, isGreaterThan, isLessThan, subtract, toRequestAmount } from '@/lib/money';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import { formatRelativeTime } from '@/utils/format';
import type { StatusPresentation } from '@/lib/financial-status';
import type { PayoutDestination } from '@/types/financial-gaps';

function presentWithdrawalStatus(status: string): StatusPresentation {
  switch (status) {
    case 'Completed':
      return {
        label: 'Sent', tone: 'positive', icon: 'checkmark-circle-outline',
        description: 'Sent. The money is on its way to your account.',
        isTerminal: true, isSettled: true, needsReconciliation: false,
      };
    case 'Failed':
      return {
        label: 'Failed', tone: 'negative', icon: 'close-circle-outline',
        description: 'Failed. The money is back in your wallet.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    case 'Rejected':
      return {
        label: 'Refused', tone: 'negative', icon: 'close-circle-outline',
        description: 'Refused after review. The money is back in your wallet.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    case 'Cancelled':
      return {
        label: 'Cancelled', tone: 'neutral', icon: 'ban-outline',
        description: 'Cancelled. The money is back in your wallet.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    default:
      return {
        label: 'On its way', tone: 'pending', icon: 'time-outline',
        description: 'On its way. Bank transfers usually take one to two working days.',
        isTerminal: false, isSettled: false, needsReconciliation: true,
      };
  }
}

export default function WithdrawScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert } = useNotification();

  const gapsEnabled = useGapFeaturesEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { wallet } = usePrimaryWallet();
  const { data: currencies } = useCurrencies();
  const { canTransact, blockedBy } = useCanTransact();

  const currency = wallet?.currency ?? 'GBP';
  const limitsQuery = useWithdrawalLimits(currency);
  const destinationsQuery = usePayoutDestinations();
  const createWithdrawal = useCreateWithdrawal();

  const [amountText, setAmountText] = useState('');
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [withdrawalId, setWithdrawalId] = useState<string | undefined>();
  const [error, setError] = useState<FinancialError | null>(null);

  const reconciliation = useWithdrawalReconciliation(withdrawalId);
  const amount = useParsedAmount(amountText, currency, currencies);
  const limits = limitsQuery.data;
  const destinations = destinationsQuery.data ?? [];
  const destination = destinations.find((item) => item.destinationId === destinationId) ?? null;

  const payRefusal = useMemo(
    () => checkAccess(FinancialPermissions.PaymentsManage, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const amountError = useMemo(() => {
    if (amountText.length === 0 || !amount) return null;
    if (amount.minorUnits <= 0) return 'Enter an amount greater than zero.';

    // Insufficient funds is checked here as well as by the server, because the
    // client can see the balance and telling somebody after they confirm is a
    // worse experience than telling them as they type.
    if (wallet && wallet.currency === amount.currency && isGreaterThan(amount, wallet.available)) {
      return `You have ${formatMoney(wallet.available)} available.`;
    }
    if (limits && isLessThan(amount, limits.minimum)) {
      return `The smallest withdrawal is ${formatMoney(limits.minimum)}.`;
    }
    if (limits && isGreaterThan(amount, limits.maximum)) {
      return `The largest single withdrawal is ${formatMoney(limits.maximum)}.`;
    }
    return null;
  }, [amountText, amount, wallet, limits]);

  /** What actually arrives: the amount less the platform's fee. Integer maths. */
  const netAmount = useMemo(() => {
    if (!amount || !limits) return null;
    try {
      return subtract(amount, limits.fee);
    } catch {
      return null;
    }
  }, [amount, limits]);

  const unverifiedDestination = destination != null && !destination.isVerified;
  const hasOutstanding = (limits?.outstandingRequirements.length ?? 0) > 0;

  const canSubmit = Boolean(
    amount && amount.minorUnits > 0 && !amountError && destination && !unverifiedDestination && !hasOutstanding && canTransact
  );

  const handleSubmit = useCallback(() => {
    if (!amount || !destination || !netAmount) return;

    // Withdrawing is irreversible from the member's side once it is processing,
    // so it gets an explicit confirmation naming the destination and the net —
    // §28's confirmation-dialog requirement, and the fee is the part people
    // most often do not notice until afterwards.
    showAlert({
      type: 'question',
      title: 'Withdraw to your account?',
      message: `${formatMoney(netAmount)} will arrive at ${destination.maskedLabel} after a ${formatMoney(limits!.fee)} fee. This usually takes one to two working days.`,
      buttons: [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: async () => {
            setError(null);
            try {
              const withdrawal = await createWithdrawal.mutateAsync({
                amount: toRequestAmount(amount),
                currency: amount.currency,
                destinationId: destination.destinationId,
              });
              setWithdrawalId(withdrawal.withdrawalId);
            } catch (cause) {
              setError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [amount, destination, netAmount, limits, createWithdrawal, showAlert]);

  if (!gapsEnabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Withdraw" showBack />
        <GapUnavailableView gapId="withdrawal" />
      </SafeAreaView>
    );
  }

  if (!payRefusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Withdraw" showBack />
        <AccessGate refusal={payRefusal} />
      </SafeAreaView>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────
  if (reconciliation.withdrawal) {
    const withdrawal = reconciliation.withdrawal;
    const status = presentWithdrawalStatus(withdrawal.status);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Withdraw" showBack />

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <GapNotice gapId="withdrawal" compact />

          <View className="items-center py-8">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-3xl font-black tracking-tight"
              accessibilityLabel={formatMoney(withdrawal.netAmount)}
            >
              {withdrawal.netAmount.symbol}
              {withdrawal.netAmount.amount.toFixed(withdrawal.netAmount.exponent)}
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold mt-2">
              to {withdrawal.destinationLabel}
            </Text>
          </View>

          <StatusBanner
            status={status}
            detail={
              withdrawal.expectedArrivalAt && status.needsReconciliation
                ? `Expected ${formatRelativeTime(withdrawal.expectedArrivalAt)}. This is an estimate, not a guarantee.`
                : (withdrawal.failureMessage ?? withdrawal.rejectionReason)
            }
          />

          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-4"
          >
            <ReviewRow label="Taken from your wallet" value={withdrawal.amount} />
            <ReviewRow label="Fee" value={withdrawal.fee} />
            <ReviewRow label="Arriving" value={withdrawal.netAmount} emphasis />
            <ReviewDetailRow label="Reference" value={withdrawal.receiptReference} />
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/wallet')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Back to your wallet"
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="h-12 rounded-full items-center justify-center mt-8"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">Back to wallet</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Withdraw" showBack />

            {/* The amount is in the scroll body and the confirm control is in a
          pinned footer, so both lift together. `padding` rather than the
          platform default: on Android 15+ the window does not resize, so there
          is nothing for the default to react to. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <GapNotice gapId="withdrawal" />

        {wallet ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-5"
          >
            <WalletBalanceInline wallet={wallet} />
          </View>
        ) : null}

        <View className="mt-6">
          <AmountInput
            value={amountText}
            onChangeText={setAmountText}
            currency={currency}
            currencies={currencies}
            label="How much would you like to withdraw?"
            error={amountError}
          />
        </View>

        {limits ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold mt-2.5 leading-relaxed"
          >
            Between {formatMoney(limits.minimum)} and {formatMoney(limits.maximum)} at a time. A{' '}
            {formatMoney(limits.fee)} fee applies.
          </Text>
        ) : null}

        {/* Verification requirements the member still has to clear. Shown before
            they fill the form in, not after they submit it. */}
        {hasOutstanding ? (
          <View
            style={{ backgroundColor: tokens.color.warning.surface, borderColor: `${tokens.color.warning.default}44` }}
            className="rounded-2xl border p-4 mt-5"
            accessible
            accessibilityLabel={`Before you can withdraw: ${limits!.outstandingRequirements.join('. ')}`}
          >
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[10px] font-black uppercase tracking-widest mb-1.5"
            >
              Before you can withdraw
            </Text>
            {limits!.outstandingRequirements.map((requirement) => (
              <Text
                key={requirement}
                style={{ color: tokens.color.text.primary }}
                className="text-xs font-semibold leading-relaxed"
              >
                · {requirement}
              </Text>
            ))}
          </View>
        ) : null}

        <View className="mt-8">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black uppercase tracking-widest mb-2.5"
          >
            Where should it go?
          </Text>

          {destinationsQuery.isLoading ? (
            <Text style={{ color: tokens.color.text.placeholder }} className="text-xs font-semibold">
              Loading your accounts…
            </Text>
          ) : destinations.length === 0 ? (
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
            >
              <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
                You have not added an account to withdraw to yet.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {destinations.map((item) => (
                <DestinationRow
                  key={item.destinationId}
                  destination={item}
                  isSelected={destinationId === item.destinationId}
                  onSelect={() => setDestinationId(item.destinationId)}
                />
              ))}
            </View>
          )}
        </View>

        {/* The arithmetic, shown before confirmation rather than discovered on
            the receipt. Computed on integer minor units, never on floats. */}
        {amount && netAmount && limits && !amountError ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-6"
          >
            <ReviewRow label="You withdraw" value={amount} />
            <ReviewRow label="Fee" value={limits.fee} />
            <View style={{ borderTopColor: tokens.color.border.default }} className="border-t mt-1 pt-1">
              <ReviewRow label="Arriving in your account" value={netAmount} emphasis />
            </View>
          </View>
        ) : null}

        {error ? (
          <View className="mt-5">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingBottom: insets.bottom + 12,
          borderTopColor: tokens.color.border.default,
          backgroundColor: tokens.color.surface.card,
        }}
        className="px-5 pt-4 border-t"
      >
        <PaymentConfirmButton
          label="Withdraw"
          amount={netAmount}
          onPress={handleSubmit}
          isSubmitting={createWithdrawal.isPending}
          disabled={!canSubmit}
          disabledReason={
            blockedBy?.hint ??
            (hasOutstanding
              ? 'Complete the requirements above first.'
              : unverifiedDestination
                ? 'This account has not been verified yet.'
                : !destination
                  ? 'Choose where the money should go.'
                  : amountError)
          }
        />
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DestinationRow({
  destination,
  isSelected,
  onSelect,
}: {
  destination: PayoutDestination;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${destination.maskedLabel}. ${destination.isVerified ? 'Verified' : 'Not verified yet'}.`}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
        opacity: destination.isVerified ? 1 : 0.6,
      }}
      className="flex-row items-center rounded-2xl px-4 py-3.5"
    >
      <Ionicons
        name={destination.kind === 'MobileMoney' ? 'phone-portrait-outline' : 'business-outline'}
        size={19}
        color={isSelected ? tokens.color.primary[500] : tokens.color.text.secondary}
      />

      <View className="flex-1 ml-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
          {destination.maskedLabel}
        </Text>
        <Text
          style={{
            color: destination.isVerified ? tokens.color.text.placeholder : tokens.color.warning.default,
          }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {destination.currency}
          {destination.isVerified ? '' : ' · not verified yet'}
        </Text>
      </View>

      {isSelected ? <Ionicons name="checkmark-circle" size={19} color={tokens.color.primary[500]} /> : null}
    </TouchableOpacity>
  );
}
