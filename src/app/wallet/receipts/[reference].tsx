// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Receipt (Frontend Phase 5)
//
// The target of `billing.donation.receipt` and `billing.contribution.receipt`,
// both deep-linking to `/wallet/receipts/{receiptreference}`.
//
// **There is no `GET /receipts/{reference}`.** B15 issues a
// `receiptReference` on every donation and contribution and exposes no route
// that resolves one. GAP-09. So the reference is matched against
// `GET /giving/me`, which is the only place it appears.
//
// That has a consequence worth stating on the screen rather than hiding: an
// **anonymous** gift is not in `giving/me` either, because no donor identifier
// was stored. Somebody following a receipt notification for an anonymous
// donation will not find it here, and the honest thing is to explain why.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AmountDisplay,
  FinancialErrorView,
  ReviewDetailRow,
  StatusBanner,
} from '@/components/financial';
import { useGivingHistory } from '@/hooks/financial';
import { presentGivingStatus } from '@/lib/financial-status';
import { FinancialError } from '@/lib/financial-errors';
import { formatRelativeTime } from '@/utils/format';

export default function ReceiptScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { reference } = useLocalSearchParams<{ reference: string }>();

  const query = useGivingHistory();

  const record = useMemo(() => {
    const donation = query.data?.donations.find((item) => item.receiptReference === reference);
    if (donation) return { kind: 'donation' as const, donation };

    const contribution = query.data?.contributions.find((item) => item.receiptReference === reference);
    if (contribution) return { kind: 'contribution' as const, contribution };

    return null;
  }, [query.data, reference]);

  if (query.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Receipt" showBack />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (query.isError && query.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Receipt" showBack />
        <FinancialErrorView error={query.error as FinancialError} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  if (!record) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Receipt" showBack />
        <View className="flex-1 items-center justify-center px-8">
          <View
            style={{ backgroundColor: tokens.color.info.surface }}
            className="w-16 h-16 rounded-full items-center justify-center mb-5"
          >
            <Ionicons name="eye-off-outline" size={30} color={tokens.color.info.default} />
          </View>

          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-lg font-black text-center tracking-tight mb-2"
            accessibilityRole="header"
          >
            This receipt is not in your history
          </Text>

          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-medium text-center leading-relaxed"
          >
            If you gave anonymously, Diaspora stored no record of who you are — so the gift cannot appear
            in your own history. Keep the reference{' '}
            <Text style={{ color: tokens.color.text.primary, fontFamily: 'monospace' }}>{reference}</Text>;
            it is the only way to identify it, and support can look it up for you.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isDonation = record.kind === 'donation';
  const status = presentGivingStatus(
    isDonation ? record.donation.status : record.contribution.status
  );
  const createdAt = isDonation ? record.donation.createdAt : record.contribution.createdAt;
  const completedAt = isDonation ? record.donation.completedAt : record.contribution.completedAt;
  const isAnonymous = isDonation ? record.donation.isAnonymous : record.contribution.isAnonymous;
  const message = isDonation ? record.donation.message : record.contribution.message;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Receipt" showBack />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        <View className="items-center py-6">
          <View
            style={{ backgroundColor: tokens.color.success.surface }}
            className="w-16 h-16 rounded-full items-center justify-center mb-5"
          >
            <Ionicons name="heart" size={28} color={tokens.color.success.default} />
          </View>

          {isDonation ? (
            <AmountDisplay value={record.donation.amount} size="hero" accessibilityPrefix="Donation" />
          ) : record.contribution.kind === 'Monetary' && record.contribution.amount ? (
            <AmountDisplay value={record.contribution.amount} size="hero" accessibilityPrefix="Contribution" />
          ) : (
            <View className="items-center">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-4xl font-black tracking-tight"
                accessibilityLabel={`${record.contribution.pledgeQuantity ?? ''} ${record.contribution.pledgeUnit ?? 'pledged'}`}
              >
                {record.contribution.pledgeQuantity}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-black uppercase tracking-widest mt-1"
              >
                {record.contribution.pledgeUnit ?? 'pledged'}
              </Text>
            </View>
          )}

          <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold text-center mt-3">
            {isDonation
              ? `to ${record.donation.causeCode ?? 'the Diaspora community'}`
              : `to ${record.contribution.fundCode}`}
          </Text>
        </View>

        <StatusBanner status={status} detail={null} />

        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-4 mt-4"
        >
          <ReviewDetailRow label="Reference" value={reference} />
          <ReviewDetailRow label="Given" value={formatRelativeTime(createdAt)} />
          {completedAt ? <ReviewDetailRow label="Confirmed" value={formatRelativeTime(completedAt)} /> : null}
          {!isDonation ? (
            <ReviewDetailRow label="Kind" value={record.contribution.kind.replace(/([A-Z])/g, ' $1').trim()} />
          ) : null}
          {isAnonymous ? <ReviewDetailRow label="Visibility" value="Anonymous" icon="eye-off-outline" /> : null}
        </View>

        {message ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-4"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-black uppercase tracking-widest mb-1.5"
            >
              Your message
            </Text>
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-medium leading-relaxed">
              {message}
            </Text>
          </View>
        ) : null}

        {/* The payment behind a monetary gift, when there is one to look at. */}
        {isDonation && record.donation.payment ? (
          <ReceiptPaymentLink paymentIntentId={record.donation.payment.paymentIntentId} />
        ) : !isDonation && record.contribution.payment ? (
          <ReceiptPaymentLink paymentIntentId={record.contribution.payment.paymentIntentId} />
        ) : null}

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium text-center leading-relaxed mt-8"
        >
          Keep this reference. It is how Diaspora identifies this gift.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReceiptPaymentLink({ paymentIntentId }: { paymentIntentId: string }) {
  const { tokens } = useTheme();

  return (
    <View className="mt-4">
      <Text
        onPress={() => router.push(`/wallet/payments/${paymentIntentId}`)}
        accessibilityRole="link"
        accessibilityLabel="See the payment for this gift"
        style={{ color: tokens.color.primary[500] }}
        className="text-xs font-black uppercase tracking-wider text-center py-3"
      >
        See the payment
      </Text>
    </View>
  );
}
