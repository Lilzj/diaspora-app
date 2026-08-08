// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment status and result (Frontend Phase 5)
//
// The screen that says what happened, and the strictest rule in this phase:
//
//   **"Paid" is a word only the backend may cause to appear.**
//
// `PaymentResultView` decides which of four things to render from the payment's
// own `status` — never from whether a request returned 200, never from a local
// flag set when the member tapped:
//
//   settled       → success
//   still open    → "we are confirming this"      (§22, verbatim)
//   timed out     → "taking longer than usual"    (still not a failure)
//   terminal-fail → failure, with the reason
//
// The third state is the one that is easy to get wrong. A payment that has not
// answered within five minutes has not failed; the client has simply stopped
// asking. Telling somebody it failed would be inventing an outcome, and telling
// them it succeeded would be worse.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from './AmountDisplay';
import { StatusBadge, useStatusColours } from './StatusBadge';
import { presentPaymentStatus, presentRefundStatus, describeRefundReason } from '@/lib/financial-status';
import { describeMoney, isZero } from '@/lib/money';
import { formatRelativeTime } from '@/utils/format';
import type { PaymentIntent, Refund } from '@/types/financial';

// ── The in-flight state ──────────────────────────────────────────────────────

/**
 * "Payment status is being confirmed."
 *
 * The §22 screen. It shows the amount, says plainly that nothing is decided,
 * and offers a check-again button — because the one thing a member must not do
 * while a payment is unresolved is start a second one.
 */
export function PaymentPendingView({
  payment,
  hasTimedOut,
  onCheckNow,
  isChecking,
}: {
  payment: PaymentIntent;
  hasTimedOut: boolean;
  onCheckNow: () => void;
  isChecking?: boolean;
}) {
  const { tokens } = useTheme();
  const { fg, bg } = { fg: tokens.color.info.default, bg: tokens.color.info.surface };

  return (
    <View
      className="items-center px-6 py-10"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        hasTimedOut
          ? `This is taking longer than usual. Your payment of ${describeMoney(payment.amount)} has not been confirmed yet. We will notify you when it is.`
          : `Confirming your payment of ${describeMoney(payment.amount)}. Please do not pay again.`
      }
    >
      <View style={{ backgroundColor: bg }} className="w-20 h-20 rounded-full items-center justify-center mb-6">
        {hasTimedOut ? (
          <Ionicons name="hourglass-outline" size={34} color={fg} />
        ) : (
          <ActivityIndicator size="large" color={fg} />
        )}
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xl font-black text-center tracking-tight mb-2"
        accessibilityRole="header"
      >
        {hasTimedOut ? 'This is taking longer than usual' : 'Confirming your payment'}
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-medium text-center leading-relaxed mb-6"
      >
        {hasTimedOut
          ? 'Your payment has not been confirmed yet. We will send you a notification the moment it is — you do not need to stay on this screen, and you should not pay again.'
          : 'We are checking with the payment provider. This usually takes a few seconds. Please do not pay again.'}
      </Text>

      <View
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="w-full rounded-2xl border p-4 mb-6"
      >
        <View className="flex-row items-center justify-between">
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
            {payment.description}
          </Text>
          <AmountDisplay value={payment.amount} size="medium" />
        </View>
      </View>

      <TouchableOpacity
        onPress={onCheckNow}
        disabled={isChecking}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Check the payment status again"
        accessibilityState={{ busy: isChecking }}
        style={{ borderColor: tokens.color.border.default }}
        className="h-12 px-6 rounded-full border items-center justify-center"
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black uppercase tracking-wider">
          {isChecking ? 'Checking…' : 'Check again'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── The outcome ──────────────────────────────────────────────────────────────

interface PaymentResultProps {
  payment: PaymentIntent;
  /** What the payment bought, for the success line. */
  subjectLabel?: string;
  primaryAction?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
}

export function PaymentResultView({
  payment,
  subjectLabel,
  primaryAction,
  secondaryAction,
}: PaymentResultProps) {
  const { tokens } = useTheme();
  const status = presentPaymentStatus(payment.status);
  const { foreground, background } = useStatusColours(status.tone);

  const succeeded = status.isSettled && payment.status !== 'Refunded';

  const headline = succeeded
    ? 'Payment complete'
    : payment.status === 'Refunded'
      ? 'Refunded'
      : payment.status === 'Cancelled'
        ? 'Payment cancelled'
        : payment.status === 'Expired'
          ? 'Payment expired'
          : 'Payment could not be completed';

  const body = succeeded
    ? subjectLabel
      ? `You paid for ${subjectLabel}. A record of this is in your wallet.`
      : 'A record of this is in your wallet.'
    : payment.failureMessage
      ? payment.failureMessage
      : payment.status === 'Cancelled'
        ? 'Nothing was charged.'
        : payment.status === 'Expired'
          ? 'This payment took too long and nothing was charged. You can start again.'
          : 'Nothing was charged.';

  return (
    <View
      className="items-center px-6 py-10"
      accessible
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${headline}. ${describeMoney(payment.amount)}. ${body}`}
    >
      <View style={{ backgroundColor: background }} className="w-20 h-20 rounded-full items-center justify-center mb-6">
        <Ionicons name={status.icon as never} size={36} color={foreground} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xl font-black text-center tracking-tight mb-2"
        accessibilityRole="header"
      >
        {headline}
      </Text>

      <AmountDisplay value={payment.amount} size="large" tone={succeeded ? 'default' : 'muted'} />

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-medium text-center leading-relaxed mt-3 mb-6"
      >
        {body}
      </Text>

      {/* The reference. Shown for a completed payment because it is what
          support will ask for, and because a member's only handle on a payment
          is the one the platform gave them. */}
      {succeeded ? (
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="w-full rounded-2xl border p-4 mb-6"
        >
          <ResultDetailRow label="Reference" value={payment.paymentIntentId} mono />
          {payment.capturedAt ? (
            <ResultDetailRow label="Paid" value={formatRelativeTime(payment.capturedAt)} />
          ) : null}
        </View>
      ) : null}

      <View className="w-full" style={{ gap: 10 }}>
        {primaryAction ? (
          <TouchableOpacity
            onPress={primaryAction.onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={primaryAction.label}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="h-13 py-4 rounded-full items-center justify-center"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">
              {primaryAction.label}
            </Text>
          </TouchableOpacity>
        ) : null}

        {secondaryAction ? (
          <TouchableOpacity
            onPress={secondaryAction.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={secondaryAction.label}
            className="py-3 items-center justify-center"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-black uppercase tracking-wider"
            >
              {secondaryAction.label}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function ResultDetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { tokens } = useTheme();

  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} className="flex-row items-center justify-between py-1.5">
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary, fontFamily: mono ? 'monospace' : undefined }}
        className="text-xs font-bold"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Refunds ──────────────────────────────────────────────────────────────────

/**
 * A refund against a payment.
 *
 * Read-only, and it has to be: `POST /payment-intents/{id}/refunds` is
 * `financial:payments:manage:any`, Admin role, so a member cannot request one
 * through the API at all. The UI therefore shows what has happened and points
 * at support, rather than offering a button that returns 403. GAP-05.
 */
export function RefundStatusList({ refunds }: { refunds: Refund[] }) {
  const { tokens } = useTheme();

  if (refunds.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {refunds.map((refund) => {
        const status = presentRefundStatus(refund.status);

        return (
          <View
            key={refund.refundId}
            accessible
            accessibilityLabel={`${status.description} ${describeMoney(refund.amount)}. ${describeRefundReason(refund.reason)}. ${formatRelativeTime(refund.issuedAt)}.`}
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4"
          >
            <View className="flex-row items-center justify-between mb-2">
              <StatusBadge status={status} size="sm" />
              <AmountDisplay value={refund.amount} size="medium" tone="credit" signed />
            </View>

            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold">
              {describeRefundReason(refund.reason)}
            </Text>

            {refund.note ? (
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-medium mt-1 leading-relaxed"
              >
                {refund.note}
              </Text>
            ) : null}

            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold mt-2">
              {formatRelativeTime(refund.issuedAt)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * How much of a payment is still refundable, and how somebody asks.
 *
 * Rendered only where there is something to say. The "contact support" line is
 * not a fudge: it is the accurate description of the only route a member has,
 * because B15 gives refund authority to staff alone.
 */
export function RefundEligibilityNote({ payment }: { payment: PaymentIntent }) {
  const { tokens } = useTheme();

  const status = presentPaymentStatus(payment.status);
  if (!status.isSettled || isZero(payment.refundableRemaining)) return null;

  const partial = !isZero(payment.refunded);

  return (
    <View
      accessible
      accessibilityLabel={`${describeMoney(payment.refundableRemaining)} of this payment can still be refunded. Refunds are issued by Diaspora staff — contact support to ask for one.`}
      style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
      className="rounded-2xl border p-4"
    >
      <Text style={{ color: tokens.color.info.default }} className="text-[10px] font-black uppercase tracking-widest mb-1.5">
        {partial ? 'Partially refunded' : 'Refunds'}
      </Text>
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
        {describeMoney(payment.refundableRemaining)} of this payment can still be refunded. Refunds are
        issued by the Diaspora team — contact support if you think one is due.
      </Text>
    </View>
  );
}
