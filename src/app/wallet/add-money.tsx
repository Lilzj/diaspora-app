// ═════════════════════════════════════════════════════════════════════════════
//   ⚠ BACKEND GAP — SIMULATED. See src/config/financial-gaps.ts → deposit. ⚠
//
//   The certified B15 platform has no member-facing deposit route. A payment
//   intent can be created for any amount, but nothing in B15 credits the
//   payer's own wallet on capture, so calling `POST /payment-intents` and then
//   showing a higher balance would be the client inventing a ledger posting.
//
//   The full flow is built here — amount, limits, method, review, processing,
//   result — against `/financial-gap/v0`, per §4-C. It is unreachable in a
//   release build and labelled on the screen in a development one.
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
  MethodPicker,
  PaymentConfirmButton,
  ReviewDetailRow,
  ReviewRow,
  StatusBanner,
  useParsedAmount,
} from '@/components/financial';
import { useCanTransact, useCurrencies, usePrimaryWallet } from '@/hooks/financial';
import {
  useCreateDeposit,
  useDepositLimits,
  useDepositReconciliation,
  useGapFeaturesEnabled,
} from '@/hooks/financial-gaps';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { formatMoney, isGreaterThan, isLessThan, toRequestAmount } from '@/lib/money';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useAuthStore } from '@/store/auth';
import type { PaymentMethodKind } from '@/types/financial';
import type { StatusPresentation } from '@/lib/financial-status';

/** Presentation for the simulated deposit statuses. Shaped like the real ones. */
function presentDepositStatus(status: string): StatusPresentation {
  switch (status) {
    case 'Completed':
      return {
        label: 'Added', tone: 'positive', icon: 'checkmark-circle-outline',
        description: 'Added. The money is in your wallet.',
        isTerminal: true, isSettled: true, needsReconciliation: false,
      };
    case 'Failed':
      return {
        label: 'Failed', tone: 'negative', icon: 'close-circle-outline',
        description: 'Failed. Nothing was charged.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    case 'Cancelled':
      return {
        label: 'Cancelled', tone: 'neutral', icon: 'ban-outline',
        description: 'Cancelled. Nothing was charged.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    default:
      return {
        label: 'Processing', tone: 'pending', icon: 'time-outline',
        description: 'Processing. We are confirming this with the payment provider.',
        isTerminal: false, isSettled: false, needsReconciliation: true,
      };
  }
}

export default function AddMoneyScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const gapsEnabled = useGapFeaturesEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { wallet } = usePrimaryWallet();
  const { data: currencies } = useCurrencies();
  const { canTransact, blockedBy } = useCanTransact();

  const currency = wallet?.currency ?? 'GBP';
  const limitsQuery = useDepositLimits(currency);
  const createDeposit = useCreateDeposit();

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethodKind | null>(null);
  const [depositId, setDepositId] = useState<string | undefined>();
  const [error, setError] = useState<FinancialError | null>(null);

  const reconciliation = useDepositReconciliation(depositId);
  const amount = useParsedAmount(amountText, currency, currencies);
  const limits = limitsQuery.data;

  const payRefusal = useMemo(
    () => checkAccess(FinancialPermissions.PaymentsManage, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  /**
   * Validation against the *server's* limits, not constants in this file.
   *
   * A minimum hard-coded here would disagree with the backend the first time
   * somebody changed it — which is why `DepositLimits` is a contract rather
   * than a comment.
   */
  const amountError = useMemo(() => {
    if (amountText.length === 0 || !amount || !limits) return null;
    if (amount.minorUnits <= 0) return 'Enter an amount greater than zero.';
    if (isLessThan(amount, limits.minimum)) return `The smallest top-up is ${formatMoney(limits.minimum)}.`;
    if (isGreaterThan(amount, limits.maximum)) return `The largest single top-up is ${formatMoney(limits.maximum)}.`;
    if (limits.remainingToday && isGreaterThan(amount, limits.remainingToday)) {
      return `You can add ${formatMoney(limits.remainingToday)} more today.`;
    }
    return null;
  }, [amountText, amount, limits]);

  const canSubmit = Boolean(amount && amount.minorUnits > 0 && !amountError && method && canTransact);

  const handleSubmit = useCallback(async () => {
    if (!amount || !method) return;

    setError(null);
    try {
      const deposit = await createDeposit.mutateAsync({
        amount: toRequestAmount(amount),
        currency: amount.currency,
        methodKind: method,
      });
      setDepositId(deposit.depositId);
    } catch (cause) {
      setError(toFinancialError(cause, 'mutating'));
    }
  }, [amount, method, createDeposit]);

  // Release build: the flow does not exist at all.
  if (!gapsEnabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Add money" showBack />
        <GapUnavailableView gapId="deposit" />
      </SafeAreaView>
    );
  }

  if (!payRefusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Add money" showBack />
        <AccessGate refusal={payRefusal} />
      </SafeAreaView>
    );
  }

  // ── Result / in-flight ──────────────────────────────────────────────────
  if (reconciliation.deposit) {
    const deposit = reconciliation.deposit;
    const status = presentDepositStatus(deposit.status);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Add money" showBack />

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <GapNotice gapId="deposit" compact />

          <View className="items-center py-8">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-3xl font-black tracking-tight"
              accessibilityLabel={formatMoney(deposit.amount)}
            >
              {deposit.amount.symbol}{deposit.amount.amount.toFixed(deposit.amount.exponent)}
            </Text>
          </View>

          <StatusBanner
            status={status}
            detail={
              status.needsReconciliation
                ? 'We are confirming this with the payment provider. Do not try again.'
                : deposit.failureMessage
            }
          />

          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-4"
          >
            <ReviewRow label="Amount" value={deposit.amount} />
            {deposit.fee.minorUnits > 0 ? <ReviewRow label="Fee" value={deposit.fee} /> : null}
            <ReviewRow label="Added to your wallet" value={deposit.credited} emphasis />
            <ReviewDetailRow label="Reference" value={deposit.receiptReference} />
          </View>

          <View className="mt-8" style={{ gap: 10 }}>
            {status.needsReconciliation ? (
              <TouchableOpacity
                onPress={reconciliation.checkNow}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Check the status again"
                style={{ borderColor: tokens.color.border.default }}
                className="h-12 rounded-full border items-center justify-center"
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider">
                  Check again
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={() => router.replace('/wallet')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Back to your wallet"
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="h-12 rounded-full items-center justify-center"
            >
              <Text className="text-white text-xs font-black uppercase tracking-wider">Back to wallet</Text>
            </TouchableOpacity>
          </View>
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
      <ScreenHeader title="Add money" showBack />

            {/* The amount is in the scroll body and the confirm control is in a
          pinned footer, so both lift together. `padding` rather than the
          platform default: on Android 15+ the window does not resize, so there
          is nothing for the default to react to. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <GapNotice gapId="deposit" />

        <View className="mt-6">
          <AmountInput
            value={amountText}
            onChangeText={setAmountText}
            currency={currency}
            currencies={currencies}
            label="How much would you like to add?"
            error={amountError}
            suggestions={[10, 25, 50, 100]}
            autoFocus
          />
        </View>

        {limits ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold mt-2.5 leading-relaxed"
          >
            Between {formatMoney(limits.minimum)} and {formatMoney(limits.maximum)} at a time
            {limits.remainingToday ? ` · ${formatMoney(limits.remainingToday)} left today` : ''}.
          </Text>
        ) : null}

        <View className="mt-8">
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black uppercase tracking-widest mb-2.5"
          >
            How would you like to pay?
          </Text>
          <MethodPicker
            methods={limits?.supportedMethods}
            selected={method}
            onSelect={setMethod}
            isLoading={limitsQuery.isLoading}
          />
        </View>

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
          label="Add money"
          amount={amount}
          onPress={handleSubmit}
          isSubmitting={createDeposit.isPending}
          disabled={!canSubmit}
          disabledReason={
            blockedBy?.hint ?? (!method ? 'Choose how you would like to pay.' : amountError)
          }
        />
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
