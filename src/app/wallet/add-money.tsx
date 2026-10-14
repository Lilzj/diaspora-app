// ═════════════════════════════════════════════════════════════════════════════
//   Adding money to your own wallet. Against the real platform.
//
//   This screen used to run entirely on `/financial-gap/v0` and was unreachable
//   in a release build. The reason it gave was:
//
//     "The certified B15 platform has no member-facing deposit route. A payment
//      intent can be created for any amount, but nothing in B15 credits the
//      payer's own wallet on capture."
//
//   That was true when it was written and is not any more. `POST
//   /financial/wallets/me/deposits` is served, and its own summary is "Starts a
//   top-up. The wallet is credited when the payment captures, never before."
//
//   ── The two things this screen must never do ──────────────────────────────
//
//   **It must not show money that has not arrived.** Creating a deposit answers
//   with a PaymentIntent carrying `nextAction` — the hosted Checkout URL the
//   member still has to complete. The balance moves when the capture lands, so
//   nothing here invalidates the wallet on submit.
//
//   **It must not invent a limit.** Minimum, maximum and the daily allowance all
//   come from `/wallets/me/deposits/limits`, which is a versioned policy row. A
//   constant in this file would disagree with the server the first time somebody
//   changed it.
// ═════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  AmountInput,
  FinancialErrorInline,
  MethodPicker,
  PaymentConfirmButton,
  ReviewDetailRow,
  ReviewRow,
  StatusBanner,
  useParsedAmount,
} from '@/components/financial';
import {
  useCanTransact,
  useCreateDeposit,
  useCurrencies,
  useDepositLimits,
  useDepositReconciliation,
  useFinancialCapabilities,
  usePrimaryWallet,
} from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { formatMoney, isGreaterThan, isLessThan, toRequestAmount } from '@/lib/money';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useAuthStore } from '@/store/auth';
import { useMemberCurrency } from '@/lib/member-currency';
import type { PaymentMethodKind, PaymentStatus } from '@/types/financial';
import type { StatusPresentation } from '@/lib/financial-status';

/**
 * How a payment intent reads to somebody adding money.
 *
 * **`Authorized` is not "added".** With manual capture the money is held and the
 * platform has still to take it; wording that as done would have a member close
 * the app believing their balance had moved.
 */
function presentDepositStatus(status: PaymentStatus): StatusPresentation {
  switch (status) {
    case 'Captured':
    case 'Settled':
      return {
        label: 'Added', tone: 'positive', icon: 'checkmark-circle-outline',
        description: 'Added. The money is in your wallet.',
        isTerminal: true, isSettled: true, needsReconciliation: false,
      };
    case 'Authorized':
      return {
        label: 'Held', tone: 'pending', icon: 'lock-closed-outline',
        description: 'Your bank has approved it. Diaspora is finishing the transfer.',
        isTerminal: false, isSettled: false, needsReconciliation: true,
      };
    case 'Failed':
      return {
        label: 'Failed', tone: 'negative', icon: 'close-circle-outline',
        description: 'Failed. Nothing was charged.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    case 'Cancelled':
    case 'Expired':
      return {
        label: 'Cancelled', tone: 'neutral', icon: 'ban-outline',
        description: 'Cancelled. Nothing was charged.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    case 'Refunded':
      return {
        label: 'Refunded', tone: 'neutral', icon: 'return-down-back-outline',
        description: 'Refunded. The money went back the way it came.',
        isTerminal: true, isSettled: false, needsReconciliation: false,
      };
    default:
      return {
        label: 'Waiting for you', tone: 'pending', icon: 'time-outline',
        description: 'Finish the payment in the page that opened. This updates on its own.',
        isTerminal: false, isSettled: false, needsReconciliation: true,
      };
  }
}

/**
 * Whether a challenge URL is safe to open.
 *
 * HTTPS only. A payment flow is the highest-value phishing surface the app has —
 * a member has already decided to pay and is expecting to be sent somewhere — so
 * an `http://` or custom-scheme URL arriving in `nextAction` is either a
 * misconfiguration or an attack. Neither is worth opening.
 */
function isSafeChallengeUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim());
}

export default function AddMoneyScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { wallet } = usePrimaryWallet();
  // Before the wallet loads, the member's own currency, never GBP for everyone.
  const memberCurrency = useMemberCurrency();
  const { data: currencies } = useCurrencies();
  const { canTransact, blockedBy } = useCanTransact();
  const capabilities = useFinancialCapabilities();

  const currency = wallet?.currency ?? memberCurrency.code;
  const limitsQuery = useDepositLimits(currency);
  const createDeposit = useCreateDeposit();

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethodKind | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | undefined>();
  const [error, setError] = useState<FinancialError | null>(null);
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);

  const reconciliation = useDepositReconciliation(paymentIntentId);
  const amount = useParsedAmount(amountText, currency, currencies);
  const limits = limitsQuery.data;

  // Two independent facts, and a member needs both to be true.
  //
  // `supportedMethods` empty means no provider is connected to charge with.
  // `limits.isEnabled` is the deposit feature itself: `Financial:EnableDeposits`
  // is a plain bool with no initializer, so it is FALSE unless a deployment sets
  // it, and the handler then refuses every top-up with
  // `financial.deposit.not_supported`. A screen that read only the provider list
  // would offer a button that always 503s.
  //
  // Neither is a build flag. Both come from the deployment, so this lights up
  // when the platform is actually ready rather than when somebody ships a binary.
  /**
   * **Wallet is filtered out here and nowhere else.**
   *
   * Paying from a balance is a real method everywhere something is bought, and
   * `MethodPicker` has been ready for it since it was written — it shows the
   * balance, and greys the option out with "Not enough" or "Your wallet is
   * frozen". This one screen is the exception: topping a wallet up *from* that
   * same wallet would debit and credit one account by the same amount, balance
   * perfectly, move nothing, and read on a statement as though money arrived.
   *
   * The server refuses it too — `PaymentProcessor.AuthorizeAsync` will not open a
   * `Deposit` on `MethodKind.Wallet` — so this is the option not being offered
   * rather than the rule. Offering a control the platform then refuses is the
   * defect this codebase keeps finding.
   */
  const supportedMethods = (capabilities.data?.supportedMethods ?? []).filter(
    (method) => method !== 'Wallet'
  );
  const depositsEnabled = limits?.isEnabled ?? false;
  const canDeposit = supportedMethods.length > 0 && depositsEnabled;

  const payRefusal = useMemo(
    () => checkAccess(FinancialPermissions.PaymentsManage, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  /**
   * Validation against the *server's* limits, not constants in this file.
   */
  const amountError = useMemo(() => {
    if (amountText.length === 0 || !amount || !limits) return null;
    if (amount.minorUnits <= 0) return 'Enter an amount greater than zero.';

    // Each bound is optional on the wire: a deployment may publish a minimum and
    // no maximum, or neither. Comparing against one that is absent would either
    // throw or invent a ceiling nobody configured, so each is checked only where
    // the server actually sent it.
    if (limits.minimum && isLessThan(amount, limits.minimum)) {
      return `The smallest top-up is ${formatMoney(limits.minimum)}.`;
    }
    if (limits.maximum && isGreaterThan(amount, limits.maximum)) {
      return `The largest single top-up is ${formatMoney(limits.maximum)}.`;
    }
    if (limits.dailyRemaining && isGreaterThan(amount, limits.dailyRemaining)) {
      return `You can add ${formatMoney(limits.dailyRemaining)} more today.`;
    }
    return null;
  }, [amountText, amount, limits]);

  /**
   * The limits, worded from whatever was actually published.
   *
   * A deployment may send a minimum and no maximum. Printing "Between X and
   * undefined" is worse than printing nothing, and asserting a ceiling nobody
   * configured is worse than both.
   */
  const limitsSentence = useMemo(() => {
    if (!limits) return null;

    const parts: string[] = [];

    if (limits.minimum && limits.maximum) {
      parts.push(`Between ${formatMoney(limits.minimum)} and ${formatMoney(limits.maximum)} at a time`);
    } else if (limits.minimum) {
      parts.push(`At least ${formatMoney(limits.minimum)} at a time`);
    } else if (limits.maximum) {
      parts.push(`Up to ${formatMoney(limits.maximum)} at a time`);
    }

    if (limits.dailyRemaining) {
      parts.push(`${formatMoney(limits.dailyRemaining)} left today`);
    }

    return parts.length > 0 ? `${parts.join(' · ')}.` : null;
  }, [limits]);

  const canSubmit = Boolean(
    amount && amount.minorUnits > 0 && !amountError && method && canTransact && canDeposit
  );

  const handleSubmit = useCallback(async () => {
    if (!amount || !method) return;

    setError(null);
    try {
      const intent = await createDeposit.mutateAsync({
        amount: toRequestAmount(amount),
        currency: amount.currency,
        methodKind: method,
      });

      setPaymentIntentId(intent.paymentIntentId);

      // `nextAction` is where the member actually pays. The adapter puts the
      // hosted Checkout URL there; anything that is not plain HTTPS is not
      // opened, and the screen falls back to saying so rather than guessing.
      if (isSafeChallengeUrl(intent.nextAction)) {
        setChallengeUrl(intent.nextAction);
        await Linking.openURL(intent.nextAction.trim());
      }
    } catch (cause) {
      setError(toFinancialError(cause, 'mutating'));
    }
  }, [amount, method, createDeposit]);

  if (!payRefusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Add money" showBack />
        <AccessGate refusal={payRefusal} />
      </SafeAreaView>
    );
  }

  // ── Result / in-flight ──────────────────────────────────────────────────
  const intent = reconciliation.data;

  if (intent) {
    const status = presentDepositStatus(intent.status);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Add money" showBack />

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <View className="items-center py-8">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-3xl font-black tracking-tight"
              accessibilityLabel={formatMoney(intent.amount)}
            >
              {intent.amount.symbol}{intent.amount.amount.toFixed(intent.amount.exponent)}
            </Text>
          </View>

          <StatusBanner
            status={status}
            detail={status.needsReconciliation ? undefined : intent.failureMessage}
          />

          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-4"
          >
            <ReviewRow label="Amount" value={intent.amount} />
            {/* What has actually reached the wallet, which is not the same as
                what was authorised until the capture lands. */}
            <ReviewRow label="Added to your wallet" value={intent.captured} emphasis />
            <ReviewDetailRow label="Reference" value={intent.paymentIntentId} />
          </View>

          <View className="mt-8" style={{ gap: 10 }}>
            {status.needsReconciliation && isSafeChallengeUrl(challengeUrl) ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(challengeUrl)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Open the payment page again"
                style={{ backgroundColor: tokens.color.primary[500] }}
                className="h-12 rounded-full items-center justify-center"
              >
                <Text className="text-white text-xs font-black uppercase tracking-wider">
                  Open payment page
                </Text>
              </TouchableOpacity>
            ) : null}

            {status.needsReconciliation ? (
              <TouchableOpacity
                onPress={() => reconciliation.refetch()}
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
              style={{ borderColor: tokens.color.border.default }}
              className="h-12 rounded-full border items-center justify-center"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider">
                Back to wallet
              </Text>
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
        {!canDeposit && !capabilities.isLoading && !limitsQuery.isLoading ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mb-2"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold mb-1">
              {depositsEnabled ? 'No way to take a payment yet' : 'Adding money is switched off here'}
            </Text>
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
              {depositsEnabled
                ? 'Diaspora can hold and move money, but this deployment has no card or transfer '
                  + 'provider connected, so there is nothing to charge. Your balance still grows '
                  + 'from sales, refunds and credit.'
                : 'This deployment does not take top-ups at the moment. Your balance still grows '
                  + 'from sales, refunds and credit.'}
            </Text>
          </View>
        ) : null}

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

        {limitsSentence ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold mt-2.5 leading-relaxed"
          >
            {limitsSentence}
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
            methods={supportedMethods}
            selected={method}
            onSelect={setMethod}
            isLoading={capabilities.isLoading}
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
            blockedBy?.hint
            ?? (!depositsEnabled
              ? 'Adding money is switched off on this deployment.'
              : !canDeposit
                ? 'No payment method is connected to this deployment.'
                : undefined)
            ?? (!method ? 'Choose how you would like to pay.' : amountError)
          }
        />
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
