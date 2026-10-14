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
import * as certified from '@/lib/financial-api';
import { financialGapKeys } from '@/lib/financial-gap-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
import { areGapFeaturesEnabled } from '@/config/financial-gaps';
import { acquireIdempotencyKey, releaseIdempotencyKey, type OperationScope } from '@/lib/idempotency';
import { invalidateAfterMoneyMoved, useFinancialAccess, usePrimaryWallet } from './financial';
import { useMemberCurrency } from '@/lib/member-currency';
import type {
  CreateDepositRequest,
  CreateWithdrawalRequest,
  RewardBalance,
  RewardConversion,
  RewardConversionPolicy,
  RewardHistoryPage,
} from '@/types/financial-gaps';

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

/**
 * The member's real points balance.
 *
 * **Remediation Wave C-01 — this is no longer simulated.** `GET /financial/rewards/me`
 * exists and answers regardless of whether *conversion* is enabled on the
 * deployment, so a balance is a real figure even where converting it is refused.
 *
 * `enabled` no longer depends on the gap switch. It never should have: a
 * production build was showing no balance at all rather than the true one.
 *
 * The response is mapped onto the shape the reward screens already render.
 * Two of those fields have no server counterpart and are reported honestly:
 * `pending` is not a concept the platform has (every entry is settled when it
 * is written), and there is no threshold ladder.
 */
export function useRewardBalance() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.rewardBalance(),
    queryFn: async (): Promise<RewardBalance> => {
      const balance = await certified.fetchRewardPointsBalance();
      return {
        available: balance.balance,
        // Not a server concept. Zero is the truthful answer, not a placeholder:
        // the platform writes reward entries settled, so nothing is ever pending.
        pending: 0,
        lifetimeEarned: balance.lifetimeEarned,
        lifetimeConverted: balance.lifetimeConverted,
        nextThreshold: null,
        nextThresholdLabel: null,
        updatedAt: balance.resolvedAt,
      };
    },
    enabled: access.canReadWallet,
    ...gapReadOptions,
  });
}

/** One page of the points history, and what the next request must skip at it. */
interface RewardHistoryCursor {
  before: string;
  excludeIds: string[];
}

const REWARD_HISTORY_PAGE_SIZE = 25;

/**
 * Roughly 4.6KB of query string once every identifier is written out, which
 * leaves comfortable room under the request-line limits a server enforces.
 */
const MAX_CARRIED_BOUNDARY_IDS = 100;

/**
 * How the points were earned.
 *
 * Real, and paged the way the route pages: an **inclusive** `before` on
 * `occurredAt`, with `excludeIds` naming what has already been shown at that
 * instant. This hook's own comment used to say the route took no `excludeIds`,
 * so "a page boundary that lands on two entries sharing a timestamp can repeat
 * one — which is a property of the contract rather than of this hook". It was a
 * property of the contract, and the contract was wrong: every page began with
 * the entry the previous one ended on, and a page whose entries all shared an
 * instant returned itself, which this hook reads as "there is more" and scrolls
 * for ever.
 *
 * **The identifiers accumulate while the boundary stands still.** A tie group
 * wider than one page spans several requests, and sending only the last page's
 * identifiers would hand page one's entries back on page three — the mistake
 * the platform's own cursor primitive exists to prevent.
 */
export function useRewardHistory() {
  const access = useFinancialAccess();

  return useInfiniteQuery({
    queryKey: financialGapKeys.rewardHistory(),
    queryFn: async ({ pageParam }): Promise<RewardHistoryPage> => {
      const entries = await certified.fetchRewardPointsHistory({
        before: pageParam?.before,
        excludeIds: pageParam?.excludeIds,
        take: REWARD_HISTORY_PAGE_SIZE,
      });

      const boundary = entries[entries.length - 1]?.occurredAt;

      // Carried forward only while the boundary has not moved. A new instant
      // makes every earlier identifier irrelevant, and keeping them would grow
      // the query string for nothing.
      const carried =
        boundary !== undefined && pageParam?.before === boundary ? pageParam.excludeIds : [];

      const excludeIds = [
        ...carried,
        ...entries.filter((entry) => entry.occurredAt === boundary).map((entry) => entry.entryId),
      ];

      // A full page means there is probably more. The cap is the other half:
      // past it the identifiers would no longer fit in a query string, so this
      // stops rather than sending a request the server would refuse. A single
      // member holding more than a hundred points entries at one instant is not
      // a case that occurs — it is here so that if it ever does, the history
      // ends instead of looping.
      const hasMore =
        entries.length === REWARD_HISTORY_PAGE_SIZE &&
        boundary !== undefined &&
        excludeIds.length <= MAX_CARRIED_BOUNDARY_IDS;

      return {
        entries: entries.map((entry) => ({
          entryId: entry.entryId,
          // **The wire keeps `points` positive and states the direction in a
          // separate boolean.** This client's convention is a signed number —
          // negative when points were spent or converted — so the sign is
          // applied here. Copying `points` across unchanged would render a
          // conversion as an earning, which is the same figure with the
          // opposite meaning.
          points: entry.isConversion ? -entry.points : entry.points,
          source: entry.source,
          reason: entry.isConversion ? 'Converted to wallet credit' : entry.source,
          // The contract carries no subject reference on a reward entry.
          subjectType: null,
          subjectId: null,
          occurredAt: entry.occurredAt,
        })),
        nextCursor: hasMore ? boundary : null,
        excludeIds,
        hasMore,
      };
    },
    initialPageParam: undefined as RewardHistoryCursor | undefined,
    getNextPageParam: (lastPage): RewardHistoryCursor | undefined =>
      lastPage.nextCursor
        ? { before: lastPage.nextCursor, excludeIds: lastPage.excludeIds ?? [] }
        : undefined,
    enabled: access.canReadWallet,
    ...gapReadOptions,
  });
}

/**
 * The conversion rules. The rate lives on the server; no screen multiplies by a constant.
 *
 * Remediation Wave C-01: real. `isEnabled` is false on a deployment with
 * conversion switched off or with no published rate, and `disabledReason` says
 * which — so the screen can tell a member *why* instead of offering a converter
 * that refuses.
 *
 * **`minorUnitsPerPoint` is inverted here, deliberately.** The screens render
 * `pointsPerMinorUnit` — the reciprocal. Mapping the two by name similarity
 * would misprice every conversion by the rate squared, plausibly enough that
 * nobody would notice on screen.
 */
export function useConversionPolicy() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialGapKeys.conversionPolicy(),
    queryFn: async (): Promise<RewardConversionPolicy> => {
      const [terms, balance] = await Promise.all([
        certified.fetchRewardConversionTerms(),
        certified.fetchRewardPointsBalance(),
      ]);

      return {
        isEligible: terms.isEnabled && balance.canConvert,
        ineligibleReason: terms.disabledReason ?? null,
        // The reciprocal. A rate of 0.5 minor units per point is 2 points per
        // minor unit. Guarded against a zero rate, which the server publishes
        // when conversion has no rate at all.
        pointsPerMinorUnit: terms.minorUnitsPerPoint > 0 ? 1 / terms.minorUnitsPerPoint : 0,
        currency: terms.currency,
        minimumPoints: terms.minimumPoints,
        maximumPoints: terms.maximumPoints ?? terms.dailyRemainingPoints ?? balance.balance,
        // Not a server concept on this contract. Reporting a made-up fee on a
        // conversion screen is the one number that must never be invented.
        feePercentage: 0,
        availablePoints: balance.balance,
      };
    },
    enabled: access.canReadWallet,
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
/**
 * What converting these points would do — priced by the platform.
 *
 * **Repointed off the gap adapter.** `POST /rewards/conversions/preview` is
 * served, and answers `isPermitted: false` with a `refusalCode` on a deployment
 * that has conversion switched off. The simulated preview could not say that,
 * and the screen that wrapped it rendered a header over an empty body instead.
 */
export function usePreviewConversion() {
  const { wallet } = usePrimaryWallet();
  // Before the wallet loads, the member's own currency, never GBP for everyone.
  const memberCurrency = useMemberCurrency();

  return useMutation({
    ...gapMutationOptions,
    mutationFn: (points: number) =>
      certified.previewRewardConversion(points, wallet?.currency ?? memberCurrency.code),
  });
}

export function useCreateConversion() {
  const queryClient = useQueryClient();
  const { wallet } = usePrimaryWallet();
  // Before the wallet loads, the member's own currency, never GBP for everyone.
  const memberCurrency = useMemberCurrency();

  return useMutation({
    ...gapMutationOptions,
    mutationFn: async (points: number) => {
      const scope: OperationScope = {
        operation: 'conversion',
        subject: 'rewards',
        discriminator: String(points),
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      const result = await certified.convertRewardPoints({
        points,
        currency: wallet?.currency ?? memberCurrency.code,
        idempotencyKey,
      });

      // **Completed, because the platform posts the credit inline.**
      // `ConvertRewardPointsCommandHandler` calls `_ledger.PostAsync` before it
      // answers, and `credited` and `convertedAt` are required on the response.
      // There is no pending state to represent — the simulated contract had one
      // and the real one does not.
      const conversion: RewardConversion = {
        conversionId: result.conversionId,
        status: 'Completed',
        points: result.points,
        // No fee on this contract. The platform prices a conversion as one
        // credit; the simulation invented a fee line and set it to zero.
        grossValue: result.credited,
        fee: { ...result.credited, minorUnits: 0, amount: 0 },
        netValue: result.credited,
        transactionId: result.transactionId,
        receiptReference: result.conversionId,
        createdAt: result.convertedAt,
        completedAt: result.convertedAt,
      };

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
