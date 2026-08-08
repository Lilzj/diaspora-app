// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Statement (Frontend Phase 5)
//
// The ledger, cursor-paged by sequence. The only financial surface B15
// paginates on the wire, and therefore the only one that can reach the first
// entry a member ever had.
//
// `afterSequence` is treated as opaque: it comes from `nextCursor` and goes
// back unmodified. Constructing one from a row's `sequence` would work today
// and break the moment the backend changes what a cursor means.
//
// Every row shows `balanceAfter`, which B15 *stores* rather than recomputing —
// so what is rendered is what was true when the entry was appended, not what a
// running total would produce now. That distinction is the difference between a
// statement and a spreadsheet.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorView,
  LedgerEntryRow,
  TransactionListSkeleton,
} from '@/components/financial';
import { useLedger, usePrimaryWallet } from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';
import type { Wallet } from '@/types/financial';

const ENTRY_FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'Everything' },
  { key: 'Payment', label: 'Payments' },
  { key: 'Refund', label: 'Refunds' },
  { key: 'Hold', label: 'Holds' },
  { key: 'Commission', label: 'Commission' },
  { key: 'Fee', label: 'Fees' },
];

export default function StatementScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { wallet, wallets, isLoading: walletLoading } = usePrimaryWallet();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<string | undefined>(undefined);

  const activeWallet: Wallet | null =
    wallets.find((item) => item.walletId === selectedWalletId) ?? wallet;

  const ledger = useLedger(activeWallet?.walletId, entryType);

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.WalletRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const entries = useMemo(
    () => ledger.data?.pages.flatMap((page) => page.entries) ?? [],
    [ledger.data]
  );

  const handleEndReached = useCallback(() => {
    if (ledger.hasNextPage && !ledger.isFetchingNextPage) {
      void ledger.fetchNextPage();
    }
  }, [ledger]);

  if (!refusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Statement" showBack />
        <AccessGate refusal={refusal} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Statement" showBack />

      <View style={{ borderBottomColor: tokens.color.border.default }} className="border-b">
        {/* Wallet picker — only when there is more than one to pick. A tab bar
            with one tab is a tab bar nobody needs. */}
        {wallets.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}
            accessibilityRole="tablist"
          >
            {wallets.map((item) => {
              const isSelected = activeWallet?.walletId === item.walletId;
              return (
                <TouchableOpacity
                  key={item.walletId}
                  onPress={() => setSelectedWalletId(item.walletId)}
                  activeOpacity={0.7}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${item.walletType === 'Promotional' ? 'Diaspora credit' : 'Main wallet'} in ${item.currency}`}
                  style={{
                    backgroundColor: isSelected ? tokens.color.secondary[500] : tokens.color.surface.card,
                    borderColor: isSelected ? tokens.color.secondary[500] : tokens.color.border.default,
                  }}
                  className="rounded-full border px-4 py-2"
                >
                  <Text
                    style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-xs font-bold"
                  >
                    {item.walletType === 'Promotional' ? 'Credit' : 'Main'} · {item.currency}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
          accessibilityRole="tablist"
        >
          {ENTRY_FILTERS.map((option) => {
            const isSelected = entryType === option.key;
            return (
              <TouchableOpacity
                key={option.label}
                onPress={() => setEntryType(option.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${option.label} entries`}
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

      {walletLoading || ledger.isLoading ? (
        <TransactionListSkeleton rows={9} />
      ) : ledger.isError && ledger.error ? (
        <FinancialErrorView error={ledger.error as FinancialError} onRetry={ledger.refetch} />
      ) : !activeWallet ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="wallet-outline" size={34} color={tokens.color.text.placeholder} />
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-bold text-center mt-4"
          >
            You do not have a wallet yet
          </Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="document-text-outline" size={34} color={tokens.color.text.placeholder} />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black text-center tracking-tight mt-4 mb-2"
          >
            {entryType ? 'Nothing of this kind' : 'Your statement is empty'}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-medium text-center leading-relaxed"
          >
            {entryType
              ? 'Try another filter.'
              : 'Every movement of money in or out of your wallet will be listed here, permanently.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.entryId}
          renderItem={({ item }) => <LedgerEntryRow entry={item} />}
          // Virtualisation matters here more than anywhere: a long-standing
          // member's statement is unbounded by construction.
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListFooterComponent={
            ledger.isFetchingNextPage ? (
              <View className="py-6 items-center" accessibilityLabel="Loading more of your statement">
                <ActivityIndicator size="small" color={tokens.color.primary[500]} />
              </View>
            ) : !ledger.hasNextPage ? (
              <View className="py-8 items-center">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-semibold text-center"
                >
                  That is the beginning of your statement.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
