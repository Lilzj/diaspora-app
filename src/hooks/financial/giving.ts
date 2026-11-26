// Financial hooks: giving. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { shouldRetryQuery } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type { CreateContributionRequest, CreateDonationRequest } from '@/types/financial';
import { CATALOG_STALE_MS, mutationOptions, readOptions } from './shared';
import { useFinancialAccess } from './wallet';
import { invalidateAfterMoneyMoved, isPaymentSettled } from './payments';

// ─────────────────────────────────────────────────────────────────────────────
// Giving
// ─────────────────────────────────────────────────────────────────────────────

export function useDonationCauses(country?: string, supportKind?: string) {
  return useQuery({
    queryKey: financialKeys.causes(country, supportKind),
    queryFn: () => api.fetchDonationCauses({ country, supportKind }),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function useContributionFunds(country?: string) {
  return useQuery({
    queryKey: financialKeys.funds(country),
    queryFn: () => api.fetchContributionFunds({ country }),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function useGivingHistory(take = 50) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.giving(),
    queryFn: () => api.fetchGivingHistory({ take }),
    enabled: access.canReadGiving,
    ...readOptions,
  });
}

/**
 * Gives money.
 *
 * The idempotency scope carries the amount as its discriminator, because giving
 * £10 twice to the same cause is something people do on purpose and refusing
 * the second as a duplicate would be wrong. Two identical amounts within the
 * key's ten-minute window still collapse — which is the double-tap case, and
 * the one worth protecting.
 */
export function useCreateDonation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateDonationRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'donation',
        subject: request.causeCode ?? `${request.beneficiaryType}:${request.beneficiaryId ?? 'platform'}`,
        discriminator: `${request.amount}${request.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const donation = await api.createDonation({ ...request, idempotencyKey });

      // **The gateway call.** Creating a donation opens a payment intent in
      // `Draft` and hands it to nobody. Without this the intent has no gateway
      // reference, no `nextAction` for `PaymentSheet` to open, and no provider
      // has been asked for the money — while the screen says "we are confirming
      // this with the payment provider", which is a sentence about a request
      // that was never made. The donation then sits `Pending` for ever, no
      // capture fires, and nothing downstream of it happens: no ledger
      // transaction, and no creator earning.
      //
      // Same omission the purchase path had, and the deposit path never did.
      // Guarded the same way: a donation settled from the wallet needs no
      // authorisation, and authorising a settled intent is a write for nothing.
      const payment =
        donation.payment && !isPaymentSettled(donation.payment.status)
          ? await api.authorizePayment(donation.payment.paymentIntentId)
          : donation.payment;

      const settled = { ...donation, payment: payment ?? null };

      if (settled.status !== 'Pending') await releaseIdempotencyKey(scope);
      return settled;
    },
    onSuccess: (donation) => {
      if (donation.payment) {
        queryClient.setQueryData(financialKeys.payment(donation.payment.paymentIntentId), donation.payment);
      }
      void queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
      if (donation.status === 'Completed') invalidateAfterMoneyMoved(queryClient);
    },
  });
}

/**
 * Contributes money, goods, time or skills.
 *
 * Four of the five kinds move no money at all, so a completed non-monetary
 * contribution invalidates the giving history and nothing else — invalidating a
 * balance because somebody pledged six Saturdays would be refetching for a
 * number that cannot have changed.
 */
export function useCreateContribution() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateContributionRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'contribution',
        subject: request.fundCode,
        discriminator: `${request.kind}:${request.amount ?? request.pledgeQuantity ?? 0}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const contribution = await api.createContribution({ ...request, idempotencyKey });

      // The same gateway call, and the same omission. A contribution of goods,
      // time or skills opens no payment intent at all, so the guard below is
      // what keeps this correct for the three quarters of this form that never
      // involve money.
      const payment =
        contribution.payment && !isPaymentSettled(contribution.payment.status)
          ? await api.authorizePayment(contribution.payment.paymentIntentId)
          : contribution.payment;

      const settled = { ...contribution, payment: payment ?? null };

      if (settled.status !== 'Pending') await releaseIdempotencyKey(scope);
      return settled;
    },
    onSuccess: (contribution) => {
      if (contribution.payment) {
        queryClient.setQueryData(
          financialKeys.payment(contribution.payment.paymentIntentId),
          contribution.payment
        );
      }
      void queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
      void queryClient.invalidateQueries({ queryKey: financialKeys.funds() });
      if (contribution.kind === 'Monetary' && contribution.status === 'Completed') {
        invalidateAfterMoneyMoved(queryClient);
      }
    },
  });
}
