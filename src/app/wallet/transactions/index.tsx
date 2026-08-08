// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Transaction history (Frontend Phase 5)
//
// One page of the caller's transactions, filterable by type.
//
// **Why one page.** `GET /wallets/me/transactions` binds `type` and `pageSize`
// and nothing else. `GetTransactionsQuery` itself supports `From`, `To`,
// `Before` and `ExcludeIds` — a full keyset cursor under ADR-017 — but
// `WalletEndpoints.cs:61` does not expose any of them, so there is no second
// page to ask for and no date range to send. GAP-06.
//
// The honest response is not to fake it. Fetching a large page and paginating
// in memory would be a list that silently stops; adding a date filter that
// filters what was already fetched would be a filter that lies. Instead the
// screen fetches one generous page, says so at the bottom, and sends anybody
// who needs to go further back to the statement — which *is* cursor-paged, all
// the way to the first entry.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorView,
  TransactionListSkeleton,
  TransactionRow,
} from '@/components/financial';
import { useTransactions } from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';

/**
 * The filters worth offering.
 *
 * A chip per `TransactionType` would be sixteen chips, most of which a member
 * will never have. These five cover what actually appears on a personal
 * statement; anything else is reachable by scrolling.
 */
const FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'All' },
  { key: 'Payment', label: 'Payments' },
  { key: 'Refund', label: 'Refunds' },
  { key: 'Purchase', label: 'Purchases' },
  { key: 'Donation', label: 'Giving' },
  { key: 'Subscription', label: 'Subscription' },
];

/** What the endpoint will return in one request. Above `FinancialLimits` it is clamped server-side. */
const PAGE_SIZE = 50;

export default function TransactionHistoryScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [isRefreshing, setRefreshing] = useState(false);

  const query = useTransactions(filter, PAGE_SIZE);

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.WalletRead, accountState, isAuthenticated),
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
        <ScreenHeader title="Transactions" showBack />
        <AccessGate refusal={refusal} />
      </SafeAreaView>
    );
  }

  const transactions = query.data ?? [];
  const atPageLimit = transactions.length >= PAGE_SIZE;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Transactions" showBack />

      {/* Filters */}
      <View style={{ borderBottomColor: tokens.color.border.default }} className="border-b">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
          accessibilityRole="tablist"
        >
          {FILTERS.map((option) => {
            const isSelected = filter === option.key;
            return (
              <TouchableOpacity
                key={option.label}
                onPress={() => setFilter(option.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${option.label} transactions`}
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
        <TransactionListSkeleton rows={8} />
      ) : query.isError && query.error ? (
        <FinancialErrorView error={query.error as FinancialError} onRetry={query.refetch} />
      ) : transactions.length === 0 ? (
        <EmptyTransactions filter={filter} onClear={() => setFilter(undefined)} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.transactionId}
          // Virtualised, and the window is deliberately small: a statement row
          // is cheap but there can be fifty of them, and an unbounded render is
          // what §32 forbids.
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
          renderItem={({ item }) => (
            <TransactionRow
              transaction={item}
              onPress={() => router.push(`/wallet/transactions/${item.transactionId}`)}
            />
          )}
          ListFooterComponent={atPageLimit ? <PageLimitFooter /> : null}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * States plainly that this is as far as the list goes, and where to go next.
 *
 * §32 of the brief and the workflow guidance both come down to the same thing:
 * a bounded list that does not say it is bounded reads as "that is everything",
 * and here it is not.
 */
function PageLimitFooter() {
  const { tokens } = useTheme();

  return (
    <View className="px-5 py-6 items-center">
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-semibold text-center leading-relaxed"
      >
        Showing your {PAGE_SIZE} most recent transactions.
      </Text>

      <TouchableOpacity
        onPress={() => router.push('/wallet/statement')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Open your full statement, which goes back further"
        className="mt-3"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={{ color: tokens.color.primary[500] }} className="text-[11px] font-black uppercase tracking-wider">
          Open your full statement
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyTransactions({ filter, onClear }: { filter?: string; onClear: () => void }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Ionicons name="receipt-outline" size={36} color={tokens.color.text.placeholder} />
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black text-center tracking-tight mt-4 mb-2"
      >
        {filter ? 'Nothing of this kind yet' : 'No transactions yet'}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-medium text-center leading-relaxed"
      >
        {filter
          ? 'Try another filter, or clear it to see everything.'
          : 'Payments, refunds and credit will appear here as they happen.'}
      </Text>

      {filter ? (
        <TouchableOpacity
          onPress={onClear}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Clear the filter"
          className="mt-4"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={{ color: tokens.color.primary[500] }} className="text-[11px] font-black uppercase tracking-wider">
            Clear filter
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
