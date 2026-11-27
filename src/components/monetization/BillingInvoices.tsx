// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Billing's invoices, as rows of the screen's list
//
// Lifted out of `app/monetization/billing.tsx` on 27 Nov 2026, when the screen
// became one FlashList (FARCH-004). The invoices page ("Show older invoices"),
// so they are the list's rows: the sections above them are its header and the
// payment methods below are its footer. The screen keeps its words and its
// order; what is here is how an invoice row, the section's heading, and what
// the section says in place of rows are drawn.
//
// ── One card, drawn a row at a time ─────────────────────────────────────────
//
// The invoices sat in one bordered, rounded card. A list's rows have no shared
// parent, so each row draws its own part of the card's border: the sides
// always, the rounded top on the first row, and the rounded bottom on whatever
// ends the card, which is the last invoice or, while older ones remain, the
// button that shows them. Where a row sits travels with the row rather than
// being read from its index, because FlashList redraws a row only when its
// item changes: a page arriving moves the card's bottom without changing the
// invoice that used to end it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useTheme } from '@/design-system';
import { ListState } from '@/components/ListState';
import { MonetizationRow } from '@/components/monetization/MonetizationLayout';
import type { useInvoices } from '@/hooks/monetization';
import { describeInvoiceKind, presentInvoiceStatus } from '@/lib/domain/financial-status';
import { usePricing } from '@/providers/pricing-provider';
import type { Invoice } from '@/types/financial';

/** One invoice, and the edges of the card it draws. */
export interface InvoiceRow {
  invoice: Invoice;
  /** The card's rounded top: the first invoice. */
  first: boolean;
  /** The card's rounded bottom: the last invoice, with no older ones to show below it. */
  last: boolean;
}

/** The invoices as the card's rows, made again only when the invoices or the end of them change. */
export function useInvoiceRows(invoices: readonly Invoice[], olderRemain: boolean): InvoiceRow[] {
  return useMemo(
    () =>
      invoices.map((invoice, index) => ({
        invoice,
        first: index === 0,
        last: index === invoices.length - 1 && !olderRemain,
      })),
    [invoices, olderRemain]
  );
}

/** The part of the card's border a row draws; both ends at once is the whole card. */
function cardEdges(top: boolean, bottom: boolean): string {
  if (top && bottom) return 'rounded-2xl border overflow-hidden';
  if (top) return 'rounded-t-2xl border-x border-t overflow-hidden';
  if (bottom) return 'rounded-b-2xl border-x border-b overflow-hidden';
  return 'border-x overflow-hidden';
}

function InvoiceCardRow({ row }: { row: InvoiceRow }) {
  const { tokens } = useTheme();
  const pricing = usePricing();
  const { invoice } = row;
  const status = presentInvoiceStatus(invoice.status);

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className={cardEdges(row.first, row.last)}
    >
      <MonetizationRow
        icon="document-text-outline"
        label={`Invoice ${invoice.number}`}
        hint={`${describeInvoiceKind(invoice.kind)} · ${new Date(
          invoice.issuedAt
        ).toLocaleDateString()} · ${pricing.format(invoice.total)}`}
        marker={invoice.status === 'Paid' ? undefined : status.label}
        onPress={() => router.push(`/monetization/invoices/${invoice.invoiceId}`)}
        isLast={row.last}
      />
    </View>
  );
}

/** One invoice. Module-level, so the list keeps a row until its invoice changes. */
export function renderInvoiceRow({ item }: ListRenderItemInfo<InvoiceRow>) {
  return <InvoiceCardRow row={item} />;
}

export const invoiceRowKey = (row: InvoiceRow) => row.invoice.invoiceId;

/**
 * A section's heading, drawn as `MonetizationSection` draws its own, for a
 * section whose rows belong to the screen's list and so cannot be wrapped by
 * one. Keep the two alike.
 */
export function ListSectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-end justify-between mb-2.5">
      <View className="flex-1 mr-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black tracking-tight"
          accessibilityRole="header"
        >
          {title}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-medium leading-relaxed mt-1"
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/**
 * What the section says in place of rows: that this account cannot see
 * payments, that the invoices are loading, that they could not be read, or that
 * there are none yet. A failed read is never drawn as "no invoices".
 */
export function InvoicesInPlaceOfRows({ invoices }: { invoices: ReturnType<typeof useInvoices> }) {
  const { tokens } = useTheme();

  if (!invoices.isEnabled) {
    return (
      <View
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="rounded-2xl border p-4"
      >
        <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold leading-relaxed">
          Your account cannot see payments yet, so its invoices cannot be shown.
        </Text>
      </View>
    );
  }

  return (
    <ListState
      loading={invoices.isLoading}
      skeleton={
        <View
          accessible
          accessibilityLabel="Loading your invoices."
          style={{ backgroundColor: tokens.color.neutral[100] }}
          className="rounded-2xl h-16"
        />
      }
      error={
        invoices.isError && invoices.invoices.length === 0
          ? {
              title: 'Your invoices could not be loaded.',
              message: `${invoices.error?.message ?? 'Check your connection.'} Tap to try again.`,
            }
          : null
      }
      onRetry={() => void invoices.refetch()}
      isEmpty={invoices.invoices.length === 0}
      empty={{
        icon: 'document-text-outline',
        title: 'No invoices yet',
        message:
          'When you pay for a plan, a purchase or a promotion, its invoice appears here. Donations and contributions have receipts instead.',
      }}
    />
  );
}

/** The card's bottom while older invoices remain: the button that shows them. */
export function ShowOlderInvoices({ isLoadingMore, onPress }: { isLoadingMore: boolean; onPress: () => void }) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className={cardEdges(false, true)}
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={isLoadingMore}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Show older invoices"
        style={{ borderTopColor: tokens.color.border.default, borderTopWidth: 1 }}
        className="px-4 py-3.5 items-center"
      >
        <Text style={{ color: tokens.color.primary[600] }} className="text-sm font-bold">
          {isLoadingMore ? 'Loading…' : 'Show older invoices'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
