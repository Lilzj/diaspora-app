// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment sheet (Frontend Phase 5)
//
// One checkout for the whole platform. Marketplace, events, housing, featured
// listings, donations and contributions all open this; none of them contains a
// payment flow of its own.
//
// §13 of the brief asks for reusable financial components rather than isolated
// payment implementations, and §14 says why: *"the Marketplace owns the
// listing/order context; Financial owns the financial transaction; the frontend
// composes the two."* So this component knows nothing about listings, events or
// causes. A caller hands it a description and an `execute` function that
// returns a `PaymentIntent`; the sheet handles method selection, confirmation,
// the in-flight state, reconciliation and the result.
//
// The state machine is deliberately small and one-directional:
//
//   review → submitting → reconciling → result
//                ↓
//              error (back to review, if the failure is recoverable)
//
// There is no path from `submitting` back to `review` that does not go through
// an answer, which is what stops a second tap turning into a second payment.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design-system';
import { MethodPicker } from './PaymentInputs';
import { PaymentConfirmButton, PaymentDisclosure, PaymentReview } from './PaymentReview';
import { PaymentPendingView, PaymentResultView } from './PaymentResult';
import { FinancialErrorInline } from './FinancialError';
import {
  useCanTransact,
  useFinancialCapabilities,
  usePaymentReconciliation,
  usePrimaryWallet,
} from '@/hooks/financial';
import { FinancialError, toFinancialError } from '@/lib/financial-errors';
import { presentPaymentStatus } from '@/lib/financial-status';
import type { Money, PaymentIntent, PaymentMethodKind } from '@/types/financial';
import { parseNextAction } from '@/lib/integrations/payments';

type SheetPhase = 'review' | 'submitting' | 'watching' | 'done';

export interface PaymentSheetProps {
  visible: boolean;
  onClose: () => void;

  title: string;
  description: string;
  /** What the payment is for, in the member's words — used on the success screen. */
  subjectLabel?: string;

  listPrice: Money;
  discount?: Money | null;
  /** What will be charged. Comes from the backend's quote, never computed here. */
  payable: Money;

  details?: { label: string; value: string; icon?: string }[];

  /**
   * Starts the payment and returns the backend's `PaymentIntent`.
   *
   * The sheet awaits this once and never calls it again for the same open — a
   * retry means closing and reopening, which re-acquires the same idempotency
   * key from storage and is therefore safe.
   */
  execute: (methodKind: PaymentMethodKind) => Promise<PaymentIntent | null>;

  /** Where "Done" goes. Defaults to closing the sheet. */
  onCompleted?: (payment: PaymentIntent) => void;

  confirmLabel?: string;
}

export function PaymentSheet({
  visible,
  onClose,
  title,
  description,
  subjectLabel,
  listPrice,
  discount,
  payable,
  details,
  execute,
  onCompleted,
  confirmLabel = 'Confirm and pay',
}: PaymentSheetProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const capabilities = useFinancialCapabilities();
  const { wallet } = usePrimaryWallet(payable.currency);
  const { canTransact, blockedBy } = useCanTransact();

  const [phase, setPhase] = useState<SheetPhase>('review');
  const [method, setMethod] = useState<PaymentMethodKind | null>(null);
  const [paymentId, setPaymentId] = useState<string | undefined>();
  const [error, setError] = useState<FinancialError | null>(null);

  const reconciliation = usePaymentReconciliation(paymentId);

  // Reset whenever the sheet opens, so a previous payment's result is never the
  // first thing somebody sees on a new one.
  useEffect(() => {
    if (visible) {
      setPhase('review');
      setPaymentId(undefined);
      setError(null);
    }
  }, [visible]);

  const methods = capabilities.data?.supportedMethods;

  // Default to the first supported method, preferring the wallet when it can
  // actually cover the payment — the fastest path for somebody who has a
  // balance, and silently skipped for somebody who does not.
  useEffect(() => {
    if (method || !methods || methods.length === 0) return;

    const walletCovers =
      wallet != null &&
      wallet.status === 'Active' &&
      wallet.currency === payable.currency &&
      wallet.available.minorUnits >= payable.minorUnits;

    setMethod(walletCovers && methods.includes('Wallet') ? 'Wallet' : methods[0]);
  }, [methods, method, wallet, payable]);

  const paymentStatus = reconciliation.payment
    ? presentPaymentStatus(reconciliation.payment.status)
    : null;

  // The transition out of `watching` is driven entirely by the backend's status.
  useEffect(() => {
    if (phase !== 'watching' || !paymentStatus) return;
    if (paymentStatus.isSettled || paymentStatus.isTerminal) setPhase('done');
  }, [phase, paymentStatus]);

  const handleConfirm = useCallback(async () => {
    if (!method || phase !== 'review') return;

    setPhase('submitting');
    setError(null);

    try {
      const payment = await execute(method);

      if (!payment) {
        setPhase('review');
        return;
      }

      setPaymentId(payment.paymentIntentId);

      // ── Where the member actually pays ────────────────────────────────────
      //
      // The gateway answers an authorised card payment with a hosted Checkout
      // URL on `nextAction`. This sheet went straight to `watching` and polled
      // it — a payment nobody had been given the chance to make. The first real
      // purchase sat on "Confirming your payment. We are checking with the
      // payment provider" while a valid `checkout.stripe.com` session, returned
      // seconds earlier, went unopened.
      //
      // `add-money` has done this since it was written and its comment says why:
      // reading `nextAction` and not opening it leaves the member on a screen
      // with no way to pay. Same failure, one screen over.
      //
      // `parseNextAction` returns a URL only when it is plain HTTPS. A payment
      // flow is the highest-value phishing surface in the app — the member has
      // already decided to pay and expects to be sent somewhere — so anything
      // else is left unopened and the sheet keeps watching, which is what it did
      // before and is correct when there is nothing to open.
      const action = parseNextAction(payment.nextAction);

      if (action?.url) {
        await Linking.openURL(action.url.trim());
      }

      // A payment that came back already terminal skips straight to the result;
      // anything else is watched until the backend says what happened.
      setPhase(presentPaymentStatus(payment.status).isTerminal ? 'done' : 'watching');
    } catch (cause) {
      const failure = toFinancialError(cause, 'mutating');

      // An indeterminate failure is *not* an error screen. The request may have
      // reached the server; saying it failed would be inventing an outcome.
      // Without a payment id there is nothing to poll, so the member is told the
      // truth: we do not know yet, and they must not pay again.
      if (failure.isIndeterminate) {
        setError(failure);
        setPhase('review');
      } else {
        setError(failure);
        setPhase('review');
      }
    }
  }, [method, phase, execute]);

  const disabledReason = useMemo(() => {
    // ── An unknown outcome outranks a pre-flight refusal ─────────────────────
    //
    // `blockedBy` is the check made *before* sending, and its offline hint ends
    // "Nothing has been sent." That is true when the app knew it was offline and
    // never tried — and false the moment a request has gone unanswered.
    //
    // Both were shown at once. A member who lost connection mid-payment read
    // "We are checking whether it went through. Do not try again yet." directly
    // above "Paying needs a connection. Nothing has been sent." — one sentence
    // telling them the outcome is unknown, the next telling them there is no
    // outcome to know. On this screen the second reading invites exactly the
    // retry the first one forbids, and a purchase intent had in fact been
    // opened.
    //
    // When the outcome is indeterminate the banner above says everything true
    // that can be said, so nothing is added under the button.
    if (error?.isIndeterminate) return null;

    if (blockedBy) return blockedBy.hint ?? blockedBy.message;
    if (!canTransact) return 'Diaspora verification is needed before money can move.';
    if (!methods || methods.length === 0) return 'No payment provider is set up at the moment.';
    if (!method) return 'Choose how you would like to pay.';
    return null;
  }, [error, blockedBy, canTransact, methods, method]);

  const handleDone = useCallback(() => {
    if (reconciliation.payment && onCompleted) onCompleted(reconciliation.payment);
    onClose();
  }, [reconciliation.payment, onCompleted, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      // Closing mid-flight is refused: `onRequestClose` is ignored while a
      // payment is being sent, because a member who swipes the sheet away
      // during submission would have no way back to the outcome.
      onRequestClose={phase === 'submitting' ? () => undefined : onClose}
    
      statusBarTranslucent
      navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: tokens.color.surface.background }}>
        {/* Header */}
        <View
          style={{ paddingTop: insets.top || 12, borderBottomColor: tokens.color.border.default }}
          className="flex-row items-center justify-between px-5 pb-3 border-b"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black tracking-tight"
            accessibilityRole="header"
          >
            {phase === 'done' ? 'Payment' : 'Review and pay'}
          </Text>

          <TouchableOpacity
            onPress={phase === 'submitting' ? undefined : onClose}
            disabled={phase === 'submitting'}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityState={{ disabled: phase === 'submitting' }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="w-10 h-10 items-center justify-center"
          >
            <Ionicons
              name="close"
              size={22}
              color={phase === 'submitting' ? tokens.color.text.disabled : tokens.color.text.secondary}
            />
          </TouchableOpacity>
        </View>

        {phase === 'done' && reconciliation.payment ? (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <PaymentResultView
              payment={reconciliation.payment}
              subjectLabel={subjectLabel}
              primaryAction={{ label: 'Done', onPress: handleDone }}
            />
          </ScrollView>
        ) : phase === 'watching' && reconciliation.payment ? (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <PaymentPendingView
              payment={reconciliation.payment}
              hasTimedOut={reconciliation.hasTimedOut}
              onCheckNow={reconciliation.checkNow}
              isChecking={reconciliation.isLoading}
            />
          </ScrollView>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <PaymentReview
                title={title}
                description={description}
                listPrice={listPrice}
                discount={discount}
                payable={payable}
                methodKind={method}
                details={details}
              />

              <View className="h-5" />

              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-black uppercase tracking-widest mb-2.5"
              >
                How would you like to pay?
              </Text>

              <MethodPicker
                methods={methods}
                selected={method}
                onSelect={setMethod}
                wallet={wallet}
                payable={payable}
                isLoading={capabilities.isLoading}
              />

              {error ? (
                <View className="mt-5">
                  <FinancialErrorInline error={error} />
                </View>
              ) : null}
            </ScrollView>

            {/* Confirmation stays pinned: a pay button that scrolls out of view
                is a pay button somebody taps twice looking for it. */}
            <View
              style={{
                paddingBottom: insets.bottom + 12,
                borderTopColor: tokens.color.border.default,
                backgroundColor: tokens.color.surface.card,
              }}
              className="px-5 pt-4 border-t"
            >
              <PaymentConfirmButton
                label={confirmLabel}
                amount={payable}
                onPress={handleConfirm}
                isSubmitting={phase === 'submitting'}
                disabled={Boolean(disabledReason)}
                disabledReason={disabledReason}
              />
              <View className="h-2.5" />
              <PaymentDisclosure methodKind={method} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
