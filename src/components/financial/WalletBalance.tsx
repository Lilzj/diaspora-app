// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Wallet balance card (Frontend Phase 5)
//
// The dashboard's headline. It renders three of B15's five balances, and the
// choice of which three is the whole design:
//
//   **Available** is what somebody can spend, and is the hero figure.
//   **Pending**   is money on its way in that they cannot spend yet.
//   **Reserved**  is their money, committed against something outstanding.
//
// Adding them into one number would be the single most tempting thing to do
// here and the most dishonest: "you have £169.50" and "£147.50, of which £22 is
// still clearing and £45 is held against a pending payment" are different
// statements, and only the second survives somebody trying to spend it.
//
// Lifetime credits and debits are on the statement rather than the card. They
// are history, not balance, and putting five numbers on a card is how people
// stop reading any of them.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay, LabelledAmount } from './AmountDisplay';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from '@/components/Skeleton';
import { presentWalletStatus } from '@/lib/financial-status';
import { describeMoney, isZero } from '@/lib/money';
import type { Wallet } from '@/types/financial';

interface WalletBalanceProps {
  wallet: Wallet;
  /** Shown when the data may be out of date — offline, or a failed refresh. */
  isStale?: boolean;
  onPressStatement?: () => void;
}

export function WalletBalanceCard({ wallet, isStale, onPressStatement }: WalletBalanceProps) {
  const { tokens, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const status = presentWalletStatus(wallet.status);
  const showSecondary = !isZero(wallet.pending) || !isZero(wallet.reserved);

  return (
    <View
      style={{
        backgroundColor: isDark ? tokens.color.surface.elevated : tokens.color.secondary[500],
        borderColor: isDark ? tokens.color.border.default : 'transparent',
      }}
      className="rounded-3xl border p-5"
    >
      {/* Header: which wallet, and whether it can be used at all */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <Ionicons
            name="wallet-outline"
            size={16}
            color={isDark ? tokens.color.text.secondary : 'rgba(255,255,255,0.75)'}
          />
          <Text
            style={{ color: isDark ? tokens.color.text.secondary : 'rgba(255,255,255,0.75)' }}
            className="text-[11px] font-black uppercase tracking-widest ml-1.5"
          >
            {wallet.walletType === 'Promotional' ? 'Diaspora credit' : 'Available balance'}
          </Text>
        </View>

        {wallet.status !== 'Active' ? <StatusBadge status={status} size="sm" /> : null}
      </View>

      {/* The hero figure */}
      <AmountDisplay
        value={wallet.available}
        size="hero"
        tone="default"
        accessibilityPrefix={
          wallet.walletType === 'Promotional' ? 'Diaspora credit' : 'Available balance'
        }
        className={isDark ? '' : 'text-white'}
      />

      <Text
        style={{ color: isDark ? tokens.color.text.placeholder : 'rgba(255,255,255,0.65)' }}
        className="text-[11px] font-bold uppercase tracking-wider mt-1"
      >
        {wallet.currency}
        {isStale ? ' · may be out of date' : ''}
      </Text>

      {/* Pending and reserved, only when they are not zero. A row of zeroes
          teaches people to stop reading the row. */}
      {showSecondary ? (
        <View
          style={{ borderTopColor: isDark ? tokens.color.border.default : 'rgba(255,255,255,0.18)' }}
          className="flex-row mt-5 pt-4 border-t"
        >
          {!isZero(wallet.pending) ? (
            <View className="flex-1">
              <Text
                style={{ color: isDark ? tokens.color.text.placeholder : 'rgba(255,255,255,0.65)' }}
                className="text-[10px] font-black uppercase tracking-widest mb-1"
              >
                Still clearing
              </Text>
              <AmountDisplay
                value={wallet.pending}
                size="small"
                tone="default"
                accessibilityPrefix="Still clearing"
                className={isDark ? '' : 'text-white'}
              />
            </View>
          ) : null}

          {!isZero(wallet.reserved) ? (
            <View className="flex-1">
              <Text
                style={{ color: isDark ? tokens.color.text.placeholder : 'rgba(255,255,255,0.65)' }}
                className="text-[10px] font-black uppercase tracking-widest mb-1"
              >
                Held
              </Text>
              <AmountDisplay
                value={wallet.reserved}
                size="small"
                tone="default"
                accessibilityPrefix="Held against something outstanding"
                className={isDark ? '' : 'text-white'}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* A frozen wallet says why, in the member's words, on the card itself */}
      {wallet.statusReason ? (
        <View
          style={{ backgroundColor: isDark ? tokens.color.warning.surface : 'rgba(0,0,0,0.18)' }}
          className="rounded-xl px-3 py-2 mt-4"
        >
          <Text
            style={{ color: isDark ? tokens.color.warning.default : '#FFFFFF' }}
            className="text-[11px] font-semibold leading-relaxed"
          >
            {wallet.statusReason}
          </Text>
        </View>
      ) : null}

      {onPressStatement ? (
        <TouchableOpacity
          onPress={onPressStatement}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`View statement. ${wallet.entryCount} entries.`}
          className="flex-row items-center mt-4"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={{ color: isDark ? tokens.color.primary[400] : '#FFFFFF' }}
            className="text-[11px] font-black uppercase tracking-wider"
          >
            View statement
          </Text>
          <Ionicons
            name="chevron-forward"
            size={13}
            color={isDark ? tokens.color.primary[400] : '#FFFFFF'}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Lifetime totals, which the backend computes and this client never sums.
 *
 * §5 of the brief: "Do not calculate financial totals from incomplete paginated
 * history when the backend already provides authoritative totals." These two
 * numbers are on `WalletResponse` for exactly that reason.
 */
export function WalletLifetimeTotals({ wallet }: { wallet: Wallet }) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="flex-row rounded-2xl border p-4"
    >
      <View className="flex-1">
        <LabelledAmount label="Received in total" value={wallet.lifetimeCredits} tone="credit" size="medium" />
      </View>
      <View
        style={{ backgroundColor: tokens.color.border.default }}
        className="w-px mx-4"
      />
      <View className="flex-1">
        <LabelledAmount label="Spent in total" value={wallet.lifetimeDebits} tone="default" size="medium" />
      </View>
    </View>
  );
}

/** What the dashboard shows while the first balance is on its way. */
export function WalletBalanceSkeleton() {
  const { tokens } = useTheme();

  return (
    <View
      accessibilityLabel="Loading your balance"
      accessibilityRole="progressbar"
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-3xl border p-5"
    >
      <Skeleton width={120} height={12} borderRadius={6} />
      <View className="h-4" />
      <Skeleton width={180} height={40} borderRadius={10} />
      <View className="h-3" />
      <Skeleton width={60} height={11} borderRadius={5} />
      <View className="h-6" />
      <View className="flex-row">
        <View className="flex-1 pr-3">
          <Skeleton width={80} height={10} borderRadius={5} />
          <View className="h-2" />
          <Skeleton width={70} height={16} borderRadius={6} />
        </View>
        <View className="flex-1 pl-3">
          <Skeleton width={80} height={10} borderRadius={5} />
          <View className="h-2" />
          <Skeleton width={70} height={16} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

/**
 * A compact balance for a payment sheet, where the question is only ever "can
 * this be paid from the wallet".
 */
export function WalletBalanceInline({ wallet }: { wallet: Wallet }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`Wallet balance, ${describeMoney(wallet.available)}`}
      className="flex-row items-center justify-between"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
        Wallet balance
      </Text>
      <AmountDisplay value={wallet.available} size="small" />
    </View>
  );
}
