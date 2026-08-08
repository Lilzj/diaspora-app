// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Transaction and ledger rows (Frontend Phase 5)
//
// Two rows, because a transaction and a ledger entry are different things and
// conflating them is how a statement stops balancing:
//
//   A **transaction** is what happened — "you paid £45 for an armchair". It has
//   a status, and it may still be pending.
//
//   A **ledger entry** is one side of the money moving, with the balance it
//   left behind. It has no status: it happened, and if it was wrong the
//   correction is another entry.
//
// The direction of an entry comes from the backend's `direction` field, never
// from the sign of the amount — B15 sends every amount as a positive magnitude
// and says separately whether it was a debit or a credit.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from './AmountDisplay';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from '@/components/Skeleton';
import {
  describeBucket,
  describeLedgerEntryType,
  describeTransactionType,
  presentTransactionStatus,
} from '@/lib/financial-status';
import { describeMoney } from '@/lib/money';
import { formatRelativeTime } from '@/utils/format';
import type { LedgerEntry, Transaction } from '@/types/financial';

/** Which transaction types take money out of the member's wallet. */
const OUTGOING = new Set([
  'Payment', 'Withdrawal', 'Subscription', 'Donation', 'CommunityContribution',
  'Fee', 'Commission', 'Purchase', 'Payout',
]);

interface TransactionRowProps {
  transaction: Transaction;
  onPress?: () => void;
}

export function TransactionRow({ transaction, onPress }: TransactionRowProps) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const status = presentTransactionStatus(transaction.status);
  const { label: typeLabel, icon } = describeTransactionType(transaction.transactionType);
  const outgoing = OUTGOING.has(transaction.transactionType);

  // A failed transaction moved nothing. Showing its amount in the same weight
  // as a completed one implies a balance change that did not occur, so it is
  // dimmed and struck by tone rather than by a line through the number.
  const settled = status.isSettled;

  const spokenAmount = `${outgoing ? 'minus ' : ''}${describeMoney(transaction.amount)}`;
  const spoken = [
    transaction.description,
    typeLabel,
    spokenAmount,
    status.description,
    formatRelativeTime(transaction.occurredAt),
  ].join('. ');

  const Body = (
    <View className="flex-row items-center py-3.5">
      <View
        style={{
          backgroundColor: isDark ? tokens.color.surface.elevated : tokens.color.neutral[100],
        }}
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
      >
        <Ionicons name={icon as never} size={18} color={tokens.color.text.secondary} />
      </View>

      <View className="flex-1 mr-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-bold tracking-tight"
          numberOfLines={1}
        >
          {transaction.description}
        </Text>

        <View className="flex-row items-center mt-1">
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold"
          >
            {typeLabel} · {formatRelativeTime(transaction.occurredAt)}
          </Text>
        </View>

        {/* The badge only appears when the state is worth interrupting for.
            A completed transaction in a list of completed transactions is
            noise; a pending or failed one is the reason somebody opened the
            screen. */}
        {transaction.status !== 'Completed' ? (
          <View className="mt-1.5">
            <StatusBadge status={status} size="sm" />
          </View>
        ) : null}
      </View>

      <View className="items-end">
        <AmountDisplay
          value={transaction.amount}
          size="medium"
          tone={!settled ? 'muted' : outgoing ? 'default' : 'credit'}
          signed={settled && !outgoing}
        />
        {outgoing && settled ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
          >
            Out
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken} style={{ borderBottomColor: tokens.color.border.default }} className="border-b px-5">
        {Body}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the full details of this transaction"
      style={{ borderBottomColor: tokens.color.border.default }}
      className="border-b px-5"
    >
      {Body}
    </TouchableOpacity>
  );
}

/**
 * One row of the statement.
 *
 * `balanceAfter` is shown because it is the reason a statement is a statement:
 * B15 stores it rather than recomputing it, so what is rendered here is what
 * was true at the moment the entry was appended — not what a running total
 * would produce today.
 */
export function LedgerEntryRow({ entry }: { entry: LedgerEntry }) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const isCredit = entry.direction === 'Credit';
  const typeLabel = describeLedgerEntryType(entry.entryType);

  const spoken = [
    entry.reason,
    `${isCredit ? 'credit of' : 'debit of'} ${describeMoney(entry.amount)}`,
    entry.bucket !== 'Available' ? describeBucket(entry.bucket) : null,
    `balance after, ${describeMoney(entry.balanceAfter)}`,
    formatRelativeTime(entry.occurredAt),
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={{ borderBottomColor: tokens.color.border.default }}
      className="border-b px-5 py-3.5"
    >
      <View className="flex-row items-start">
        <View
          style={{
            backgroundColor: isCredit ? tokens.color.success.surface : isDark ? tokens.color.surface.elevated : tokens.color.neutral[100],
          }}
          className="w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5"
        >
          <Ionicons
            name={isCredit ? 'arrow-down' : 'arrow-up'}
            size={14}
            color={isCredit ? tokens.color.success.default : tokens.color.text.secondary}
          />
        </View>

        <View className="flex-1 mr-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-semibold tracking-tight"
            numberOfLines={2}
          >
            {entry.reason}
          </Text>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold mt-1"
          >
            {typeLabel} · {formatRelativeTime(entry.occurredAt)}
            {entry.bucket !== 'Available' ? ` · ${describeBucket(entry.bucket)}` : ''}
          </Text>

          {/* The policy version that priced it. Shown because B15 records it on
              every entry and because "why was I charged this" is the single
              most common financial support question. */}
          {entry.policyVersion ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-mono mt-0.5"
            >
              {entry.policyVersion}
            </Text>
          ) : null}
        </View>

        <View className="items-end">
          <AmountDisplay
            value={entry.amount}
            size="small"
            tone={isCredit ? 'credit' : 'default'}
            signed={isCredit}
          />
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-semibold mt-1"
          >
            {/* Not "balance" — this is the balance *after this entry*, which is
                a different and more useful number. */}
            → {describeMoney(entry.balanceAfter).replace(/^minus /, '−')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A placeholder row, sized to the real one so the list does not jump. */
export function TransactionRowSkeleton() {
  const { tokens } = useTheme();

  return (
    <View
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b px-5 py-3.5"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Skeleton width={40} height={40} borderRadius={20} />
      <View className="flex-1 ml-3">
        <Skeleton width={160} height={14} borderRadius={7} />
        <View className="h-2" />
        <Skeleton width={100} height={11} borderRadius={5} />
      </View>
      <Skeleton width={64} height={17} borderRadius={8} />
    </View>
  );
}

export function TransactionListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Loading transactions" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, index) => (
        <TransactionRowSkeleton key={index} />
      ))}
    </View>
  );
}
