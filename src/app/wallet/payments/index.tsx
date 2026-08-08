// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment history (Frontend Phase 5)
//
// `GET /payment-intents?status&take`. One page, like every list on this
// platform except the statement — the endpoint binds `status` and `take` and
// no cursor. GAP-06.
//
// A payment is not a transaction. A payment is the attempt; a transaction is
// what the ledger recorded when it succeeded. A failed payment appears here and
// leaves no transaction at all, which is why this list exists separately from
// the transactions screen rather than being a filter on it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  AmountDisplay,
  FinancialErrorView,
  StatusBadge,
  TransactionListSkeleton,
} from '@/components/financial';
import { usePaymentHistory } from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { describePaymentMethod, presentPaymentStatus } from '@/lib/financial-status';
import { describeMoney, isZero } from '@/lib/money';
import { useAuthStore } from '@/store/auth';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { PaymentIntent } from '@/types/financial';

const FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'All' },
  { key: 'Captured', label: 'Paid' },
  { key: 'Pending', label: 'In progress' },
  { key: 'Failed', label: 'Failed' },
  { key: 'Refunded', label: 'Refunded' },
];

const TAKE = 50;

export default function PaymentHistoryScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [status, setStatus] = useState<string | undefined>(undefined);
  const [isRefreshing, setRefreshing] = useState(false);

  const query = usePaymentHistory(status, TAKE);

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.PaymentsRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  if (!refusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Payments" showBack />
        <AccessGate refusal={refusal} />
      </SafeAreaView>
    );
  }

  const payments = query.data ?? [];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Payments" showBack />

      <View style={{ borderBottomColor: tokens.color.border.default }} className="border-b">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
          accessibilityRole="tablist"
        >
          {FILTERS.map((option) => {
            const isSelected = status === option.key;
            return (
              <TouchableOpacity
                key={option.label}
                onPress={() => setStatus(option.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${option.label} payments`}
                style={{
                  backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                  borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                }}
                className="rounded-full border px-4 py-2"
              >
                <Text
                  style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.secondary }}
                  className="text-xs font-bold"
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {query.isLoading ? (
        <TransactionListSkeleton rows={7} />
      ) : query.isError && query.error ? (
        <FinancialErrorView error={query.error as FinancialError} onRetry={query.refetch} />
      ) : payments.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="card-outline" size={34} color={tokens.color.text.placeholder} />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black text-center tracking-tight mt-4 mb-2"
          >
            {status ? 'Nothing here' : 'No payments yet'}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-medium text-center leading-relaxed"
          >
            {status
              ? 'Try another filter to see your other payments.'
              : 'Anything you pay for on Diaspora will be listed here, including attempts that did not go through.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.paymentIntentId}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={tokens.color.primary[500]}
            />
          }
          renderItem={({ item }) => <PaymentRow payment={item} />}
          ListFooterComponent={
            payments.length >= TAKE ? (
              <View className="px-5 py-6">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-semibold text-center"
                >
                  Showing your {TAKE} most recent payments.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function PaymentRow({ payment }: { payment: PaymentIntent }) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const status = presentPaymentStatus(payment.status);
  const method = describePaymentMethod(payment.methodKind);
  const partiallyRefunded = !isZero(payment.refunded) && !isZero(payment.refundableRemaining);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/wallet/payments/${payment.paymentIntentId}`)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${payment.description}. ${describeMoney(payment.amount)}. ${status.description} ${formatRelativeTime(payment.createdAt)}.`}
      accessibilityHint="Opens the full details of this payment"
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b px-5 py-3.5"
    >
      <View
        style={{ backgroundColor: isDark ? tokens.color.surface.elevated : tokens.color.neutral[100] }}
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
      >
        <Ionicons name={method.icon as never} size={18} color={tokens.color.text.secondary} />
      </View>

      <View className="flex-1 mr-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-bold tracking-tight"
          numberOfLines={1}
        >
          {payment.description}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-1">
          {method.label} · {formatRelativeTime(payment.createdAt)}
        </Text>
        <View className="mt-1.5 flex-row" style={{ gap: 6 }}>
          <StatusBadge status={status} size="sm" />
          {partiallyRefunded ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-full px-2 py-0.5 self-start justify-center"
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                Part refunded
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <AmountDisplay
        value={payment.amount}
        size="medium"
        tone={status.isSettled ? 'default' : 'muted'}
      />
    </TouchableOpacity>
  );
}
