// Monetization hooks: billing. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { FinancialError, shouldRetryQuery } from '@/lib/transport/financial-errors';
import { useFinancialAccess, useTransactions } from '../financial';
import { type BillingCharge, type BillingChargeKind } from '@/types/monetization';
import type { Invoice, Transaction, UpcomingCharge } from '@/types/financial';

/**
 * The next charge on each of the caller's subscriptions — MON-GAP-009.
 *
 * A list, because a member may hold more than one and the route does not choose.
 * `willRenew: false` means nothing will be charged: `amount` is zero and
 * `chargeAt` is when access **ends** instead, so a screen must not render that
 * row as a forthcoming payment.
 */
export function useUpcomingCharges(): {
  charges: UpcomingCharge[];
  /** The soonest charge that will actually happen. Null when none will. */
  next: UpcomingCharge | null;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
} {
  const access = useFinancialAccess();

  const query = useQuery({
    queryKey: financialKeys.upcomingCharges(),
    queryFn: api.fetchUpcomingCharges,
    enabled: access.canManageSubscription,
    staleTime: 5 * 60_000,
    retry: shouldRetryQuery,
  });

  const charges = useMemo(() => query.data ?? [], [query.data]);

  return {
    charges,
    next: useMemo(
      () =>
        charges
          .filter((charge) => charge.willRenew)
          .slice()
          .sort((left, right) => Date.parse(left.chargeAt) - Date.parse(right.chargeAt))[0] ?? null,
      [charges]
    ),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
  };
}

/**
 * The caller's invoices — MON-GAP-009, served by the real route in every build.
 *
 * Gated on reading payments, which is the permission the server checks. An
 * empty list is a real answer: nothing the platform kept has been paid yet, or
 * the member has only given (donations and contributions carry receipts).
 */
export function useInvoices(): {
  invoices: Invoice[];
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  /** False when this account cannot read payments at all, so nothing was asked. */
  isEnabled: boolean;
  /** A full page came back, so older invoices may exist. */
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => Promise<unknown>;
} {
  const access = useFinancialAccess();
  const enabled = access.canReadPayments;

  // Pages by invoice **number**: `before` is the cursor the server pages
  // strictly below. A short page is the end; a full one may not be.
  const query = useInfiniteQuery({
    queryKey: financialKeys.invoices(),
    queryFn: ({ pageParam }) =>
      api.fetchMyInvoices({ take: INVOICE_PAGE_SIZE, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length < INVOICE_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.number,
    enabled,
    staleTime: 60_000,
    retry: shouldRetryQuery,
  });

  const invoices = useMemo(() => (query.data?.pages ?? []).flat(), [query.data]);

  return {
    invoices,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isEnabled: enabled,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isLoadingMore: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

const INVOICE_PAGE_SIZE = 25;

/** One invoice, owner only. A 404 is the server saying it is not this member's. */
export function useInvoice(invoiceId: string | undefined): {
  invoice: Invoice | null;
  isLoading: boolean;
  error: FinancialError | null;
  isEnabled: boolean;
} {
  const access = useFinancialAccess();
  const enabled = access.canReadPayments;

  const query = useQuery({
    queryKey: financialKeys.invoice(invoiceId ?? 'none'),
    queryFn: () => api.fetchInvoice(invoiceId!),
    enabled: enabled && Boolean(invoiceId),
    staleTime: 60_000,
    retry: shouldRetryQuery,
  });

  return {
    invoice: query.data ?? null,
    isLoading: enabled && Boolean(invoiceId) && query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isEnabled: enabled,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which monetization product a transaction paid for.
 *
 * Read off `transactionType` and `subjectType`, both of which B15 sends. A
 * transaction this client cannot classify is `other` rather than being dropped:
 * billing history that quietly omits a charge is billing history nobody can
 * reconcile against their bank statement.
 */
export function classifyCharge(transaction: Transaction): BillingChargeKind {
  switch (transaction.transactionType) {
    case 'Subscription':
      return 'subscription';
    case 'Promotion':
      return 'promotion';
    case 'Purchase':
      return transaction.subjectType ? 'promotion' : 'other';
    default:
      return 'other';
  }
}

/**
 * Billing history, from real transactions.
 *
 * Deliberately not called invoices: there is no invoice aggregate and no tax
 * line anywhere in the contract (MON-GAP-009), and naming this an invoice would
 * imply a document the platform cannot produce.
 */
export function useBillingHistory(): {
  charges: BillingCharge[];
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
} {
  const query = useTransactions();

  const charges = useMemo<BillingCharge[]>(
    () =>
      (query.data ?? [])
        .filter((transaction) => classifyCharge(transaction) !== 'other')
        .map((transaction) => ({
          transactionId: transaction.transactionId,
          kind: classifyCharge(transaction),
          description: transaction.description,
          amount: transaction.amount,
          status: transaction.status,
          occurredAt: transaction.occurredAt,
          subjectType: transaction.subjectType ?? null,
          subjectId: transaction.subjectId ?? null,
          transaction,
        })),
    [query.data]
  );

  return {
    charges,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}
