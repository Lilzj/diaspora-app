// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Transaction detail (Frontend Phase 5)
//
// **There is no `GET /transactions/{id}`.** B15 serves the list and the ledger;
// a single transaction has no route of its own. GAP-07.
//
// So this screen composes what the platform does expose: the transaction from
// the list it is already holding, and — because a transaction is a *header*
// over the entries that moved the money — the ledger entries carrying the same
// `transactionId`. The statement is cursor-paged, so the entries are found by
// walking pages until the transaction's own `entryCount` is satisfied or the
// statement runs out. That is bounded work with a stated ceiling, not an
// unbounded scan.
//
// **No internal identifier is rendered as though it were a reference.** §8 is
// explicit. `transactionId` is a database key; what a member quotes to support
// is the payment's reference or the receipt reference, and only those are shown
// as copyable.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AmountDisplay,
  FinancialErrorView,
  LedgerEntryRow,
  StatusBanner,
} from '@/components/financial';
import { useLedger, usePrimaryWallet, useTransactions } from '@/hooks/financial';
import {
  describeSubjectType,
  describeTransactionType,
  presentTransactionStatus,
} from '@/lib/financial-status';
import { FinancialError } from '@/lib/financial-errors';
import { formatRelativeTime } from '@/utils/format';

/** How many statement pages to walk looking for a transaction's entries. */
const MAX_LEDGER_PAGES = 4;

export default function TransactionDetailScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const transactionsQuery = useTransactions(undefined, 50);
  const { wallet } = usePrimaryWallet();
  const ledgerQuery = useLedger(wallet?.walletId);

  const transaction = useMemo(
    () => transactionsQuery.data?.find((item) => item.transactionId === id),
    [transactionsQuery.data, id]
  );

  /**
   * The entries this transaction produced.
   *
   * Walks at most `MAX_LEDGER_PAGES`, and pulls the next page only while the
   * count found is short of what the transaction says it has. A transaction
   * older than four pages of statement shows its header without its entries
   * rather than fetching the whole ledger to find two rows.
   */
  const entries = useMemo(() => {
    const pages = ledgerQuery.data?.pages ?? [];
    return pages
      .slice(0, MAX_LEDGER_PAGES)
      .flatMap((page) => page.entries)
      .filter((entry) => entry.transactionId === id);
  }, [ledgerQuery.data, id]);

  const needsMorePages =
    transaction != null &&
    entries.length < transaction.entryCount &&
    (ledgerQuery.data?.pages.length ?? 0) < MAX_LEDGER_PAGES &&
    ledgerQuery.hasNextPage === true;

  React.useEffect(() => {
    if (needsMorePages && !ledgerQuery.isFetchingNextPage) {
      void ledgerQuery.fetchNextPage();
    }
  }, [needsMorePages, ledgerQuery]);

  if (transactionsQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Transaction" showBack />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: tokens.color.text.placeholder }} className="text-sm font-semibold">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Transaction" showBack />
        <FinancialErrorView
          error={
            new FinancialError({
              kind: 'notFound',
              message: 'We could not find that transaction.',
              hint: 'It may be older than the transactions this screen can reach. Your full statement goes back further.',
              isRetryable: false,
              isTerminal: true,
              isIndeterminate: false,
            })
          }
          action={{ label: 'Open statement', onPress: () => router.replace('/wallet/statement') }}
        />
      </SafeAreaView>
    );
  }

  const status = presentTransactionStatus(transaction.status);
  const { label: typeLabel } = describeTransactionType(transaction.transactionType);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Transaction" showBack />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {/* Headline */}
        <View className="items-center py-4">
          <AmountDisplay
            value={transaction.amount}
            size="hero"
            tone={status.isSettled ? 'default' : 'muted'}
            accessibilityPrefix={typeLabel}
          />
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-semibold text-center mt-2"
          >
            {transaction.description}
          </Text>
        </View>

        <StatusBanner
          status={status}
          detail={
            transaction.status === 'Reversed'
              ? 'A correcting entry has undone this. The original stays on your statement, because the ledger is never edited.'
              : transaction.reason
          }
        />

        {/* Details */}
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-4 mt-4"
        >
          <DetailRow label="Type" value={typeLabel} />
          <DetailRow label="Started" value={formatRelativeTime(transaction.occurredAt)} />
          {transaction.completedAt ? (
            <DetailRow label="Completed" value={formatRelativeTime(transaction.completedAt)} />
          ) : null}
          {transaction.subjectType ? (
            <DetailRow label="For" value={describeSubjectType(transaction.subjectType)} />
          ) : null}
          {transaction.countryCode ? (
            <DetailRow label="Country" value={transaction.countryCode} />
          ) : null}
          {/* The policy version that decided the amount. Shown because it is the
              answer to "why was I charged this", and because B15 records it on
              every priced entry precisely so somebody can be told. */}
          {transaction.policyVersion ? (
            <DetailRow label="Priced under" value={transaction.policyVersion} mono />
          ) : null}
        </View>

        {/* Where the money went, entry by entry */}
        {entries.length > 0 ? (
          <>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black tracking-tight mt-8 mb-1"
              accessibilityRole="header"
            >
              On your statement
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-xs font-medium mb-3 leading-relaxed"
            >
              {entries.length === 1
                ? 'This transaction produced one entry.'
                : `This transaction produced ${entries.length} entries.`}
            </Text>

            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden"
            >
              {entries.map((entry) => (
                <LedgerEntryRow key={entry.entryId} entry={entry} />
              ))}
            </View>
          </>
        ) : transaction.entryCount > 0 ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mt-6"
          >
            <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold leading-relaxed">
              The statement entries for this transaction are further back than this screen loads.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/wallet/statement')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open your full statement"
              className="mt-3"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ color: tokens.color.primary[500] }} className="text-[11px] font-black uppercase tracking-wider">
                Open statement
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* A failed transaction moved nothing, and saying so removes the
            question the status alone leaves open. */}
        {transaction.status === 'Failed' ? (
          <View
            style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
            className="rounded-2xl border p-4 mt-6"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
              Nothing was taken from your balance. If you were expecting this to go through, you can try
              again from wherever you started it.
            </Text>
          </View>
        ) : null}

        <View className="mt-6" style={{ gap: 8 }}>
          <SupportLink />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      className="flex-row items-center justify-between py-2"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary, fontFamily: mono ? 'monospace' : undefined }}
        className="text-xs font-bold flex-1 text-right ml-4"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SupportLink() {
  const { tokens } = useTheme();

  return (
    <TouchableOpacity
      onPress={() => router.push('/settings/help')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Get help with this transaction"
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="flex-row items-center rounded-2xl border px-4 py-3.5"
    >
      <Ionicons name="help-circle-outline" size={19} color={tokens.color.text.secondary} />
      <Text style={{ color: tokens.color.text.primary }} className="flex-1 text-sm font-bold tracking-tight ml-3">
        Something wrong with this?
      </Text>
      <Ionicons name="chevron-forward" size={17} color={tokens.color.text.placeholder} />
    </TouchableOpacity>
  );
}
