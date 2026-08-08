// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Hooks for UNSUPPORTED financial capabilities
//
// ⚠ Every hook here talks to `/financial-gap/v0`, which no certified backend
//   serves. See `src/config/financial-gaps.ts`. ⚠
//
// Written to the same standard as the certified hooks — idempotency keys,
// no mutation retries, reconciliation rather than optimism — precisely because
// the point of building a gap flow now is that closing the gap should be a
// change of import and nothing else. A simulated flow that cut corners the real
// one could not would have to be rewritten rather than rewired.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as gapApi from '@/lib/financial-gap-api';
import { financialGapKeys } from '@/lib/financial-gap-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
import { areGapFeaturesEnabled } from '@/config/financial-gaps';
import { acquireIdempotencyKey, releaseIdempotencyKey, type OperationScope } from '@/lib/idempotency';
import { invalidateAfterMoneyMoved, useFinancialAccess } from './financial';
import type { CreateDepositRequest, CreateWithdrawalRequest } from '@/types/financial-gaps';

const gapReadOptions = {
  retry: shouldRetryQuery,
  staleTime: 30_000,
} as const;

const gapMutationOptions = { retry: 0 } as const;

/** Whether a gap-backed screen should render its flow or its "not available" state. */
export function useGapFeaturesEnabled(): boolean {
  return areGapFeaturesEnabled();
}

// ── Deposits ─────────────────────────────────────────────────────────────────

export function useDepositLimits(currency: string) {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.depositLimits(currency),
    queryFn: () => gapApi.fetchDepositLimits(currency),
    enabled: enabled && access.canPay && Boolean(currency),
    ...gapReadOptions,
  });
}

export function useDeposits() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.deposits(),
    queryFn: gapApi.fetchDeposits,
    enabled: enabled && access.canReadWallet,
    ...gapReadOptions,
  });
}

export function useCreateDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    ...gapMutationOptions,
    mutationFn: async (request: Omit<CreateDepositRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'deposit',
        subject: request.currency,
        discriminator: `${request.amount}:${request.methodKind}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const deposit = await gapApi.createDeposit({ ...request, idempotencyKey });
      if (deposit.status !== 'Pending' && deposit.status !== 'Processing') {
        await releaseIdempotencyKey(scope);
      }
      return deposit;
    },
    onSuccess: (deposit) => {
      queryClient.invalidateQueries({ queryKey: financialGapKeys.deposits() });
      if (deposit.status === 'Completed') invalidateAfterMoneyMoved(queryClient);
    },
  });
}

/**
 * Watches a deposit until it settles.
 *
 * Deliberately the same shape as `usePaymentReconciliation`: when the backend
 * grows a real deposit route, this hook is deleted and the screen calls the
 * certified one, and the screen's own code does not change.
 */
export function useDepositReconciliation(depositId: string | undefined) {
  const enabled = useGapFeaturesEnabled();
  const queryClient = useQueryClient();
  const attempts = useRef(0);

  const query = useQuery({
    queryKey: [...financialGapKeys.deposits(), depositId ?? 'none'],
    queryFn: () => gapApi.fetchDeposit(depositId!),
    enabled: enabled && Boolean(depositId),
    retry: shouldRetryQuery,
    staleTime: 0,
  });

  const status = query.data?.status;
  const pending = status === 'Pending' || status === 'Processing';

  useEffect(() => {
    if (!depositId || !pending || attempts.current > 30) return;

    const timer = setTimeout(() => {
      attempts.current += 1;
      queryClient.invalidateQueries({ queryKey: [...financialGapKeys.deposits(), depositId] });
    }, attempts.current < 5 ? 2_000 : 5_000);

    return () => clearTimeout(timer);
  }, [depositId, pending, query.dataUpdatedAt, queryClient]);

  useEffect(() => {
    if (status === 'Completed') invalidateAfterMoneyMoved(queryClient);
  }, [status, queryClient]);

  const checkNow = useCallback(() => {
    if (!depositId) return;
    attempts.current = 0;
    queryClient.invalidateQueries({ queryKey: [...financialGapKeys.deposits(), depositId] });
  }, [depositId, queryClient]);

  return {
    deposit: query.data,
    isReconciling: pending && attempts.current <= 30,
    hasTimedOut: pending && attempts.current > 30,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    checkNow,
  };
}

// ── Withdrawals ──────────────────────────────────────────────────────────────

export function useWithdrawalLimits(currency: string) {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.withdrawalLimits(currency),
    queryFn: () => gapApi.fetchWithdrawalLimits(currency),
    enabled: enabled && access.canPay && Boolean(currency),
    ...gapReadOptions,
  });
}

/**
 * The member's payout destinations.
 *
 * The response holds masked labels and server-issued ids and nothing else. No
 * account number is cached here, because none is ever sent — which is how §10's
 * prohibition on client-side payout credentials is met structurally rather than
 * by discipline.
 */
export function usePayoutDestinations() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.destinations(),
    queryFn: gapApi.fetchPayoutDestinations,
    enabled: enabled && access.canPay,
    ...gapReadOptions,
  });
}

export function useWithdrawals() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.withdrawals(),
    queryFn: gapApi.fetchWithdrawals,
    enabled: enabled && access.canReadWallet,
    ...gapReadOptions,
  });
}

export function useCreateWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    ...gapMutationOptions,
    mutationFn: async (request: Omit<CreateWithdrawalRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'withdrawal',
        subject: request.destinationId,
        discriminator: `${request.amount}${request.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const withdrawal = await gapApi.createWithdrawal({ ...request, idempotencyKey });
      if (withdrawal.status === 'Completed' || withdrawal.status === 'Failed' || withdrawal.status === 'Rejected') {
        await releaseIdempotencyKey(scope);
      }
      return withdrawal;
    },
    onSuccess: (withdrawal) => {
      queryClient.invalidateQueries({ queryKey: financialGapKeys.withdrawals() });
      // A withdrawal debits the moment it is requested — the money is reserved
      // even before it lands — so the balance is stale immediately.
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useWithdrawalReconciliation(withdrawalId: string | undefined) {
  const enabled = useGapFeaturesEnabled();
  const queryClient = useQueryClient();
  const attempts = useRef(0);

  const query = useQuery({
    queryKey: [...financialGapKeys.withdrawals(), withdrawalId ?? 'none'],
    queryFn: () => gapApi.fetchWithdrawal(withdrawalId!),
    enabled: enabled && Boolean(withdrawalId),
    retry: shouldRetryQuery,
    staleTime: 0,
  });

  const status = query.data?.status;
  const pending = status === 'Requested' || status === 'Pending' || status === 'Processing';

  useEffect(() => {
    if (!withdrawalId || !pending || attempts.current > 30) return;

    const timer = setTimeout(() => {
      attempts.current += 1;
      queryClient.invalidateQueries({ queryKey: [...financialGapKeys.withdrawals(), withdrawalId] });
    }, attempts.current < 5 ? 2_000 : 5_000);

    return () => clearTimeout(timer);
  }, [withdrawalId, pending, query.dataUpdatedAt, queryClient]);

  const checkNow = useCallback(() => {
    if (!withdrawalId) return;
    attempts.current = 0;
    queryClient.invalidateQueries({ queryKey: [...financialGapKeys.withdrawals(), withdrawalId] });
  }, [withdrawalId, queryClient]);

  return {
    withdrawal: query.data,
    isReconciling: pending && attempts.current <= 30,
    hasTimedOut: pending && attempts.current > 30,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    checkNow,
  };
}

export function useCancelWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    ...gapMutationOptions,
    mutationFn: (withdrawalId: string) => gapApi.cancelWithdrawal(withdrawalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialGapKeys.withdrawals() });
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

// ── Creator rewards ──────────────────────────────────────────────────────────

export function useRewardBalance() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.rewardBalance(),
    queryFn: gapApi.fetchRewardBalance,
    enabled: enabled && access.canReadWallet,
    ...gapReadOptions,
  });
}

export function useRewardHistory() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useInfiniteQuery({
    queryKey: financialGapKeys.rewardHistory(),
    queryFn: ({ pageParam }) => gapApi.fetchRewardHistory({ cursor: pageParam ?? undefined, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && access.canReadWallet,
    ...gapReadOptions,
  });
}

/** The conversion rules. The rate lives on the server; no screen multiplies by a constant. */
export function useConversionPolicy() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.conversionPolicy(),
    queryFn: gapApi.fetchConversionPolicy,
    enabled: enabled && access.canReadWallet,
    ...gapReadOptions,
  });
}

/**
 * What converting a number of points would produce.
 *
 * A mutation because the endpoint is a POST, and asked for on every change of
 * the slider rather than computed — the confirmation screen must show the same
 * arithmetic the receipt will.
 */
export function usePreviewConversion() {
  return useMutation({
    ...gapMutationOptions,
    mutationFn: (points: number) => gapApi.previewConversion(points),
  });
}

export function useCreateConversion() {
  const queryClient = useQueryClient();

  return useMutation({
    ...gapMutationOptions,
    mutationFn: async (points: number) => {
      const scope: OperationScope = {
        operation: 'conversion',
        subject: 'rewards',
        discriminator: String(points),
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const conversion = await gapApi.createConversion({ points, idempotencyKey });
      if (conversion.status !== 'Pending') await releaseIdempotencyKey(scope);
      return conversion;
    },
    onSuccess: (conversion) => {
      queryClient.invalidateQueries({ queryKey: financialGapKeys.rewards() });
      if (conversion.status === 'Completed') invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useConversions() {
  const enabled = useGapFeaturesEnabled();
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.conversions(),
    queryFn: gapApi.fetchConversions,
    enabled: enabled && access.canReadWallet,
    ...gapReadOptions,
  });
}
