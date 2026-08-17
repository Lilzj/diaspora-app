// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment detail (Frontend Phase 5)
//
// The target of `billing.payment.failed` and `billing.refund.issued`, whose
// notification templates deep-link to `/wallet/payments/{paymentintentid}`.
// That route name was declared by the backend in PSR-1.1, before this screen
// existed.
//
// It shows the payment's **authoritative** state and keeps reconciling while
// that state is still open. Somebody arriving here from a notification about a
// payment that has since resolved sees the resolution, not the notification's
// snapshot of it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AmountDisplay,
  FinancialErrorView,
  PaymentPendingView,
  RefundEligibilityNote,
  RefundStatusList,
  ReviewDetailRow,
  ReviewRow,
  StatusBanner,
} from '@/components/financial';
import { usePaymentReconciliation } from '@/hooks/financial';
import { describePaymentMethod, describeSubjectType, presentPaymentStatus } from '@/lib/financial-status';
import { formatMoney, isZero } from '@/lib/money';
import { shareReceipt } from '@/lib/receipt-document';
import { Button } from '@/components/Button';
import { formatRelativeTime } from '@/utils/format';
import { useNotification } from '@/providers/notification-provider';

export default function PaymentDetailScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { payment, isReconciling, hasTimedOut, isLoading, error, checkNow } =
    usePaymentReconciliation(id);

  const { showToast } = useNotification();
  const [isSharing, setSharing] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Payment" showBack />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !payment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Payment" showBack />
        <FinancialErrorView
          error={error!}
          action={{ label: 'Back to wallet', onPress: () => router.replace('/wallet') }}
        />
      </SafeAreaView>
    );
  }

  const status = presentPaymentStatus(payment.status);

  // A payment whose outcome is not yet known gets the §22 screen rather than a
  // detail view implying it is settled one way or the other.
  if (isReconciling || hasTimedOut) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Payment" showBack />
        <ScrollEndScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <PaymentPendingView
            payment={payment}
            hasTimedOut={hasTimedOut}
            onCheckNow={checkNow}
            isChecking={isLoading}
          />
        </ScrollEndScrollView>
      </SafeAreaView>
    );
  }

  const partiallyRefunded = !isZero(payment.refunded) && !isZero(payment.refundableRemaining);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Payment" showBack />

      <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        <View className="items-center py-4">
          <AmountDisplay
            value={payment.amount}
            size="hero"
            tone={status.isSettled ? 'default' : 'muted'}
            accessibilityPrefix="Payment"
          />
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-semibold text-center mt-2"
          >
            {payment.description}
          </Text>
        </View>

        <StatusBanner
          status={status}
          detail={
            payment.failureMessage ??
            (partiallyRefunded
              ? 'Part of this payment has been returned. The rest is still with Diaspora.'
              : null)
          }
        />

        {/* What was actually taken, and what came back. Every figure here is the
            backend's — nothing is `amount - refunded`. */}
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-4 mt-4"
        >
          <ReviewRow label="Amount" value={payment.amount} />
          {!isZero(payment.captured) ? <ReviewRow label="Taken" value={payment.captured} /> : null}
          {!isZero(payment.refunded) ? <ReviewRow label="Refunded" value={payment.refunded} /> : null}
        </View>

        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-4 mt-4"
        >
          <ReviewDetailRow
            label="Paid with"
            value={describePaymentMethod(payment.methodKind).label}
            icon={describePaymentMethod(payment.methodKind).icon}
          />
          {payment.subjectType ? (
            <ReviewDetailRow label="For" value={describeSubjectType(payment.subjectType)} />
          ) : null}
          <ReviewDetailRow label="Started" value={formatRelativeTime(payment.createdAt)} />
          {payment.capturedAt ? (
            <ReviewDetailRow label="Paid" value={formatRelativeTime(payment.capturedAt)} />
          ) : null}
          {/* Attempts are shown only when there was more than one — a "1" here
              would be noise, and a "3" is the explanation somebody is looking
              for after two declines. */}
          {payment.attemptCount > 1 ? (
            <ReviewDetailRow label="Attempts" value={String(payment.attemptCount)} />
          ) : null}
          <ReviewDetailRow label="Reference" value={payment.paymentIntentId} />
        </View>

        {/*
          A receipt somebody can actually keep.
          
          `Share` — which this app uses in five other places — carries a string,
          which is right for a listing because the thing being shared is a link.
          A receipt is different: the document *is* the thing. A landlord asking
          for proof of a deposit will not accept a URL to an app they cannot
          open, so this renders a PDF and hands it to the system sheet.
          
          Only offered once there is something to evidence. A pending or failed
          payment has no receipt to give, and a button that produces a document
          saying "Pending" is a way to mislead somebody.
        */}
        {status.isSettled ? (
          <View className="mt-4">
            <Button
              label="Share receipt"
              variant="outline"
              emphasis="compact"
              icon="download-outline"
              isLoading={isSharing}
              loadingLabel="Preparing…"
              accessibilityHint="Creates a PDF receipt and opens the share sheet"
              disabled={isSharing}
              onPress={async () => {
                setSharing(true);
                const outcome = await shareReceipt({
                  title: 'Payment receipt',
                  amount: formatMoney(payment.amount),
                  subtitle: payment.description,
                  status: status.label,
                  reference: payment.paymentIntentId,
                  issuedAt: new Date().toLocaleString(),
                  lines: [
                    { label: 'Amount', value: formatMoney(payment.amount) },
                    ...(!isZero(payment.captured)
                      ? [{ label: 'Taken', value: formatMoney(payment.captured), emphasis: true }]
                      : []),
                    ...(!isZero(payment.refunded)
                      ? [{ label: 'Refunded', value: formatMoney(payment.refunded) }]
                      : []),
                    { label: 'Paid with', value: describePaymentMethod(payment.methodKind).label },
                    ...(payment.subjectType
                      ? [{ label: 'For', value: describeSubjectType(payment.subjectType) }]
                      : []),
                    ...(payment.capturedAt
                      ? [{ label: 'Paid', value: new Date(payment.capturedAt).toLocaleString() }]
                      : []),
                  ],
                });
                setSharing(false);

                if (!outcome.ok) {
                  showToast({
                    type: 'error',
                    title: 'Receipt not shared',
                    message:
                      outcome.reason === 'unavailable'
                        ? 'This device has nothing to share files with.'
                        : 'The receipt could not be prepared. Try again.',
                  });
                }
              }}
            />
          </View>
        ) : null}

        {payment.refunds.length > 0 ? (
          <>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black tracking-tight mt-8 mb-3"
              accessibilityRole="header"
            >
              Refunds
            </Text>
            <RefundStatusList refunds={payment.refunds} />
          </>
        ) : null}

        <View className="mt-6">
          <RefundEligibilityNote payment={payment} />
        </View>

        {payment.status === 'Failed' && payment.failureCode ? (
          <View
            style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
            className="rounded-2xl border p-4 mt-6"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
              Nothing was charged. You can try again with a different payment method from wherever you
              started this.
            </Text>
          </View>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
