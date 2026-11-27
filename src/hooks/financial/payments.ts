// Financial hooks: payments. ./index.ts is the overview of the whole module.

import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { FinancialError, shouldRetryQuery } from '@/lib/transport/financial-errors';
import { paymentNeedsReconciliation, presentPaymentStatus } from '@/lib/domain/financial-status';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type { CreatePaymentIntentRequest, PaymentIntent } from '@/types/financial';
import { mutationOptions, readOptions } from './shared';
import { useFinancialAccess } from './wallet';

// ─────────────────────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────────────────────

export function usePaymentIntent(paymentIntentId: string | undefined) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.payment(paymentIntentId ?? 'none'),
    queryFn: () => api.fetchPaymentIntent(paymentIntentId!),
    enabled: Boolean(paymentIntentId) && access.canReadPayments,
    retry: shouldRetryQuery,
    // A payment's status is the one number that must never be served stale.
    staleTime: 0,
  });
}

export function usePaymentHistory(status?: string, take = 50) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.paymentHistory(status),
    queryFn: () => api.fetchPaymentHistory({ status, take }),
    enabled: access.canReadPayments,
    ...readOptions,
  });
}

/**
 * How often to ask again while a payment is in flight.
 *
 * Backing off matters: a gateway that is slow is usually slow for tens of
 * seconds, and a client hammering `GET /payment-intents/{id}` every two seconds
 * for two minutes is sixty requests against a rate limiter B17 configured for
 * ordinary traffic. Two seconds for the first few attempts covers the common
 * case where the simulator answers immediately; then it stretches.
 */
function reconciliationInterval(attempt: number): number {
  if (attempt < 5) return 2_000;
  if (attempt < 12) return 5_000;
  return 15_000;
}

/** Stop asking after five minutes and hand over to the member. */
const RECONCILIATION_CEILING_MS = 5 * 60 * 1000;

export interface ReconciliationState {
  payment: PaymentIntent | undefined;
  /** Still asking. */
  isReconciling: boolean;
  /** Gave up asking while the outcome was still unknown. */
  hasTimedOut: boolean;
  isLoading: boolean;
  error: FinancialError | null;
  /** Ask again now. What the "Check again" button calls. */
  checkNow: () => void;
}

/**
 * Watches a payment until the backend says what happened.
 *
 * This is §22's answer to an uncertain outcome. The rule it enforces is that
 * "Payment successful" is a thing only the server may say: the caller renders
 * success when `presentPaymentStatus(payment.status).isSettled`, and while that
 * is false the screen says the status is being confirmed.
 *
 * Timing out is a state, not an error. After five minutes the polling stops and
 * `hasTimedOut` is set, so the screen can say "this is taking longer than usual,
 * we will notify you" — which is true, because `billing.payment.failed` and the
 * receipt notifications arrive through B13 regardless of whether the app is
 * open.
 */
export function usePaymentReconciliation(paymentIntentId: string | undefined): ReconciliationState {
  const query = usePaymentIntent(paymentIntentId);
  const queryClient = useQueryClient();

  const startedAt = useRef<number | null>(null);
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = query.data?.status;
  const needsMore = status ? paymentNeedsReconciliation(status) : false;

  // Reset the clock whenever the payment being watched changes, so navigating
  // from one pending payment to another does not inherit the first one's
  // exhausted budget.
  useEffect(() => {
    startedAt.current = null;
    attempts.current = 0;
  }, [paymentIntentId]);

  const timedOut =
    startedAt.current !== null && Date.now() - startedAt.current > RECONCILIATION_CEILING_MS;

  useEffect(() => {
    if (!paymentIntentId || !needsMore || timedOut) return;

    if (startedAt.current === null) startedAt.current = Date.now();

    const delay = reconciliationInterval(attempts.current);
    timer.current = setTimeout(() => {
      attempts.current += 1;
      void queryClient.invalidateQueries({ queryKey: financialKeys.payment(paymentIntentId) });
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `query.dataUpdatedAt` re-arms the timer after each answer.
  }, [paymentIntentId, needsMore, timedOut, query.dataUpdatedAt, queryClient]);

  // A payment that reached a settled state has moved money: the balance, the
  // statement and the transaction list are all now wrong in the cache.
  const settled = status ? presentPaymentStatus(status).isSettled : false;
  useEffect(() => {
    if (settled) invalidateAfterMoneyMoved(queryClient);
  }, [settled, queryClient]);

  const checkNow = useCallback(() => {
    if (!paymentIntentId) return;
    startedAt.current = Date.now();
    attempts.current = 0;
    void queryClient.invalidateQueries({ queryKey: financialKeys.payment(paymentIntentId) });
  }, [paymentIntentId, queryClient]);

  return {
    payment: query.data,
    isReconciling: needsMore && !timedOut,
    hasTimedOut: needsMore && timedOut,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    checkNow,
  };
}

/**
 * Everything a completed financial operation invalidates.
 *
 * Called once, from the places that know money moved, rather than spelled out
 * at each mutation — the set is the same every time and a mutation that
 * remembered four of the five would leave a screen showing an old balance.
 */
export function invalidateAfterMoneyMoved(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });
  void queryClient.invalidateQueries({ queryKey: financialKeys.transactions() });
  void queryClient.invalidateQueries({ queryKey: financialKeys.payments() });
  void queryClient.invalidateQueries({ queryKey: financialKeys.purchases() });
  void queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
  void queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
  void queryClient.invalidateQueries({ queryKey: financialKeys.subscription() });
}

/**
 * Starts a payment, carrying an idempotency key that survives a retry.
 *
 * The key is acquired inside the mutation function rather than passed in, so
 * every caller gets the protection without having to remember it, and so a
 * second tap while the first request is still open reuses the same key.
 */
export function useCreatePaymentIntent(scope: OperationScope) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreatePaymentIntentRequest, 'idempotencyKey'>) => {
      const idempotencyKey = await acquireIdempotencyKey(scope);
      return api.createPaymentIntent({ ...request, idempotencyKey });
    },
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      // Deliberately not `invalidateAfterMoneyMoved`: creating an intent moves
      // nothing. The balance is untouched until a capture is reported.
      if (presentPaymentStatus(payment.status).isTerminal) {
        void releaseIdempotencyKey(scope);
      }
    },
  });
}

export function useAuthorizePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ paymentIntentId, clientContext }: { paymentIntentId: string; clientContext?: string }) =>
      api.authorizePayment(paymentIntentId, clientContext),
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
    },
  });
}

export function useCapturePayment(scope?: OperationScope) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ paymentIntentId, amount }: { paymentIntentId: string; amount?: number }) =>
      api.capturePayment(paymentIntentId, amount),
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      if (presentPaymentStatus(payment.status).isSettled) {
        invalidateAfterMoneyMoved(queryClient);
      }
      if (scope && presentPaymentStatus(payment.status).isTerminal) {
        void releaseIdempotencyKey(scope);
      }
    },
  });
}

export function useCancelPayment(scope?: OperationScope) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (paymentIntentId: string) => api.cancelPayment(paymentIntentId),
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      if (scope) void releaseIdempotencyKey(scope);
    },
  });
}

/**
 * Whether a payment has stopped moving.
 *
 * `Authorized` is deliberately NOT settled: with manual capture the money is
 * held and the platform has still to take it, so a screen that stopped watching
 * there would report a held payment as a finished one.
 */
export function isPaymentSettled(status: string): boolean {
  return status === 'Captured'
    || status === 'Settled'
    || status === 'Failed'
    || status === 'Cancelled'
    || status === 'Refunded'
    || status === 'Expired';
}
