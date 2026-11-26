// Financial hooks: deposits. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type { CreateDepositRequest } from '@/types/financial';
import { mutationOptions, readOptions } from './shared';
import { useFinancialAccess } from './wallet';
import { isPaymentSettled } from './payments';

/**
 * Limits and fees. `country` changes the answer — policy resolves
 * most-specific-first — so it is part of the key rather than a detail.
 */
// ── Deposits ─────────────────────────────────────────────────────────────────
//
// The real routes, replacing `financial-gaps`' simulated deposit. See the note
// on `createDeposit` in `financial-api` for why the gap that guarded these is
// no longer true.

export function useDepositLimits(currency: string, country?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.depositLimits(currency, country),
    queryFn: () => api.fetchDepositLimits(currency, country),
    enabled: access.canPay && Boolean(currency),
    ...readOptions,
  });
}

export function useDeposits(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: [...financialKeys.deposits(), status ?? 'all'],
    queryFn: () => api.fetchDeposits(status),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

/**
 * Starts a top-up, and takes it as far as the payment page.
 *
 * **Two calls, because creating a deposit does not reach the gateway.** `POST
 * /wallets/me/deposits` answers with an intent in `Draft` and `nextAction:
 * null` — no provider has been asked for anything yet. `POST
 * /payment-intents/{id}/authorize` is what hands it to the adapter and comes
 * back `Pending` carrying the hosted Checkout URL. Reading `nextAction` off the
 * create would find nothing, every time, and leave the member on a screen with
 * no way to pay. Proven against the live deployment rather than inferred.
 *
 * The idempotency key is acquired before the create and released only once the
 * intent reaches a terminal state, so a member who taps twice — or whose first
 * response was lost — gets one deposit rather than two. A failed authorise is
 * therefore safe to retry: the create replays to the same intent and the
 * authorise runs again against it.
 *
 * **Nothing here credits a balance.** The wallet moves when the capture lands.
 * Invalidating the balance on success would show money that has not arrived,
 * which is the one thing a wallet must never do.
 */
export function useCreateDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateDepositRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'deposit',
        subject: request.currency,
        discriminator: `${request.amount}:${request.methodKind}`,
      };

      const idempotencyKey = await acquireIdempotencyKey(scope);
      const created = await api.createDeposit({ ...request, idempotencyKey });

      // The gateway call. Without it there is no payment page.
      const intent = await api.authorizePayment(created.paymentIntentId);

      if (isPaymentSettled(intent.status)) {
        await releaseIdempotencyKey(scope);
      }

      return intent;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.deposits() });
    },
  });
}

/**
 * Watches one deposit until it stops moving.
 *
 * A member comes back from a hosted Checkout with nothing to say whether the
 * callback has landed yet, so the authoritative answer is a read. It stops on a
 * terminal status rather than polling for ever.
 */
export function useDepositReconciliation(paymentIntentId: string | undefined) {
  return useQuery({
    queryKey: [...financialKeys.deposits(), paymentIntentId ?? 'none'],
    queryFn: () => api.fetchPaymentIntent(paymentIntentId!),
    enabled: Boolean(paymentIntentId),
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isPaymentSettled(status) ? false : 3_000;
    },
  });
}
