// Financial hooks: payouts. ./index.ts is the overview of the whole module.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { FinancialError, shouldRetryQuery } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type {
  CreateWithdrawalRequest,
  RegisterPayoutDestinationRequest,
  RegisterPayoutIdentityRequest,
  StartPayoutOnboardingRequest,
  Withdrawal,
} from '@/types/financial';
import { mutationOptions, readOptions } from './shared';
import { useFinancialAccess, useFinancialCapabilities } from './wallet';
import { invalidateAfterMoneyMoved } from './payments';

// ── Withdrawals and payout destinations ──────────────────────────────────────
//
// Real routes, replacing the simulated flow that stood in while no settlement
// provider existed. The shapes changed with them — `gross`/`net` rather than
// `amount`/`netAmount`, `Reversed` in the status union, `isCancellable` decided
// by the server rather than inferred — and `types/financial.ts` notes each one.

/**
 * Whether the deployment can pay this member out at all, and where to.
 *
 * Reads `payoutsEnabled` rather than "is a provider registered": a settlement
 * adapter with an empty capability matrix can pay nobody, and offering a
 * withdraw button on the strength of registration alone produces a screen that
 * refuses every amount.
 */
/**
 * The member's contribution points. The wallet shows the balance on its
 * Rewards action.
 *
 * Not whether they can be converted. `canConvert` here is only "not held and
 * not empty" — it knows nothing of the rate, the deployment switch, the
 * account or the minimum — and the server documents it as superseded. Whether
 * a member may convert, and why not, is `terms.member`, read by
 * `useConversionPolicy`. The wallet used to gate its Rewards action on this
 * flag and explain every refusal as a missing rate.
 */
export function useRewardPointsBalance() {
  return useQuery({
    queryKey: financialKeys.rewardPoints(),
    queryFn: api.fetchRewardPointsBalance,
    retry: shouldRetryQuery,
  });
}

export function usePayoutAvailability() {
  const capabilities = useFinancialCapabilities();

  return useMemo(
    () => ({
      isAvailable: capabilities.data?.payoutsEnabled ?? false,
      countries: capabilities.data?.payoutCountries ?? [],
      isLoading: capabilities.isLoading,
    }),
    [capabilities.data, capabilities.isLoading]
  );
}

/** Everywhere this member can send money. Masked labels and server-issued ids only. */
export function usePayoutDestinations() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.payoutDestinations(),
    queryFn: api.fetchPayoutDestinations,
    enabled: access.canPay,
    ...readOptions,
  });
}

export function useRegisterPayoutDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: RegisterPayoutDestinationRequest) =>
      api.registerPayoutDestination(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/**
 * Starts the provider — setup for a payout account.
 *
 * **Invalidates the destination list on success even though the member has not
 * finished.** The account exists at the provider from the moment onboarding
 * opens and the server records it right then, so a list that did not refresh
 * would show nothing while the member was half-way through setting it up.
 */
export function useStartPayoutOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: StartPayoutOnboardingRequest) => api.startPayoutOnboarding(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/** Records an address a provider knows the member by. See `registerPayoutIdentity`. */
export function useRegisterPayoutIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: RegisterPayoutIdentityRequest) => api.registerPayoutIdentity(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/** Asks the provider whether a destination is payable yet. Only ever verifies. */
export function useRefreshPayoutDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (destinationId: string) => api.refreshPayoutDestination(destinationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

export function useRemovePayoutDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (destinationId: string) => api.removePayoutDestination(destinationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

export function useWithdrawalLimits(currency: string, country?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.withdrawalLimits(currency, country),
    queryFn: () => api.fetchWithdrawalLimits(currency, country),
    enabled: access.canPay && Boolean(currency),
    ...readOptions,
  });
}

export function useWithdrawals(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: [...financialKeys.withdrawals(), status ?? 'all'],
    queryFn: () => api.fetchWithdrawals(status),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

/**
 * Raises a withdrawal.
 *
 * The idempotency key is acquired before the call and released only once the
 * withdrawal reaches a terminal state, so a member who taps twice — or whose
 * first response was lost — gets one withdrawal rather than two. `retry: 0`
 * still applies: the client re-sending this is the client deciding to pay
 * twice, and the key exists to make the *member's* retry safe.
 */
export function useCreateWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateWithdrawalRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'withdrawal',
        subject: request.destinationId,
        discriminator: `${request.amount}${request.currency}`,
      };

      const idempotencyKey = await acquireIdempotencyKey(scope);
      const withdrawal = await api.createWithdrawal({ ...request, idempotencyKey });

      if (isWithdrawalSettled(withdrawal.status)) {
        await releaseIdempotencyKey(scope);
      }

      return withdrawal;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.withdrawals() });

      // A withdrawal holds the money the moment it is raised — the balance is
      // stale before anything settles.
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useCancelWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (withdrawalId: string) => api.cancelWithdrawal(withdrawalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.withdrawals() });
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

/**
 * Whether a withdrawal has stopped moving.
 *
 * `Reversed` is terminal and is money that went out and came back — the client
 * could not express it at all while the status union was the simulated one.
 */
export function isWithdrawalSettled(status: string): boolean {
  return status === 'Completed'
    || status === 'Failed'
    || status === 'Cancelled'
    || status === 'Reversed';
}

/**
 * Polls one withdrawal while its outcome is still moving, and stops when it is
 * not.
 *
 * **`Processing` is polled, not treated as done.** It means a settlement
 * provider has the instruction and the outcome is unknown — which is exactly
 * the state a member is staring at the screen for. A withdrawal can sit there
 * for a while: if the provider's answer was lost, the platform holds the money
 * until something establishes what happened, so this backs off rather than
 * hammering, and gives up after a bounded number of attempts rather than
 * polling for ever.
 */
export function useWithdrawalReconciliation(withdrawalId: string | undefined) {
  const queryClient = useQueryClient();
  const attempts = useRef(0);

  const query = useQuery({
    queryKey: financialKeys.withdrawal(withdrawalId ?? 'none'),
    queryFn: () => api.fetchWithdrawal(withdrawalId!),
    enabled: Boolean(withdrawalId),
    retry: shouldRetryQuery,
    staleTime: 0,
  });

  const status = query.data?.status;
  const pending = Boolean(status) && !isWithdrawalSettled(status!);

  useEffect(() => {
    if (!withdrawalId || !pending || attempts.current > 30) {
      return;
    }

    const timer = setTimeout(
      () => {
        attempts.current += 1;
        void queryClient.invalidateQueries({ queryKey: financialKeys.withdrawal(withdrawalId) });
      },
      attempts.current < 5 ? 2_000 : 5_000
    );

    return () => clearTimeout(timer);
  }, [withdrawalId, pending, query.dataUpdatedAt, queryClient]);

  const checkNow = useCallback(() => {
    if (!withdrawalId) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: financialKeys.withdrawal(withdrawalId) });
  }, [withdrawalId, queryClient]);

  return {
    withdrawal: query.data as Withdrawal | undefined,
    isReconciling: pending,
    isLoading: query.isLoading,
    error: query.error as FinancialError | null,
    checkNow,
  };
}
