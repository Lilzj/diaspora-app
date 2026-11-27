// Financial hooks: commerce. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { shouldRetryQuery } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type { ActivateSubscriptionRequest, PurchaseProductRequest } from '@/types/financial';
import { CATALOG_STALE_MS, mutationOptions, readOptions } from './shared';
import { useFinancialAccess } from './wallet';
import { invalidateAfterMoneyMoved, isPaymentSettled } from './payments';

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue, purchases, placements
// ─────────────────────────────────────────────────────────────────────────────

export function useCatalog(params: api.CatalogParams = {}, enabled = true) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.catalog(params),
    queryFn: () => api.fetchCatalog(params),
    // Browsing the catalogue is a Limited-tier read; buying is Verified.
    enabled: enabled && access.tier >= 2,
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function usePurchases(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.purchases(status),
    queryFn: () => api.fetchPurchases({ status }),
    enabled: access.tier >= 2,
    ...readOptions,
  });
}

/**
 * Buys a catalogue product.
 *
 * The response carries the placement it granted and the payment it needs, so a
 * caller can go straight to reconciliation without a second round trip. The
 * idempotency scope defaults to product-plus-subject, which makes a double tap
 * one purchase — the correct reading, because nobody boosts the same listing
 * twice within a minute on purpose.
 */
/**
 * Buys a catalogue product, and takes the payment as far as the gateway.
 *
 * ── Two calls, for the same reason a deposit needs two ───────────────────────
 *
 * `POST /catalog/purchases` answers with an intent in `Draft` and no gateway
 * provider: nothing has been asked of Stripe or Flutterwave yet.
 * `POST /payment-intents/{id}/authorize` is what hands it over.
 *
 * This hook did only the first call. `useCreateDeposit` two hundred lines below
 * has done both since it was written, and says why in its own comment — the
 * purchase path simply never got the second one. The first purchase ever made
 * on the deployment proved it: the campaign reached `PendingPayment`, the
 * purchase reached `Pending`, and the payment intent sat in `Draft` with
 * `GatewayProvider` null while the app showed "Confirming your payment" for as
 * long as anyone cared to watch. Nothing errored, because nothing failed — the
 * gateway was never asked.
 *
 * This is every purchase, not only advertising: marketplace promotions,
 * donations, subscriptions and boosts all buy through here.
 *
 * The idempotency key is released only at a terminal state, so a member who
 * taps twice gets one purchase, and a failed authorise is safe to retry — the
 * create replays to the same intent and the authorise runs again against it.
 */
export function usePurchaseProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<PurchaseProductRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'purchase',
        subject: `${request.productCode}:${request.subjectId ?? 'self'}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const purchase = await api.purchaseProduct({ ...request, idempotencyKey });

      // The gateway call. Without it the member waits on a payment nobody has
      // been asked to take.
      //
      // Only when the purchase actually needs one: a product settled from the
      // wallet, or granted outright, completes without a payment intent, and
      // authorising a settled intent would be a second write for nothing.
      const payment =
        purchase.payment && !isPaymentSettled(purchase.payment.status)
          ? await api.authorizePayment(purchase.payment.paymentIntentId)
          : purchase.payment;

      const settled = { ...purchase, payment: payment ?? null };

      // Terminal purchases release the key so a genuine second purchase later
      // is not refused as a duplicate of this one.
      if (settled.status === 'Completed' || settled.status === 'Failed' || settled.status === 'Cancelled') {
        await releaseIdempotencyKey(scope);
      }
      return settled;
    },
    onSuccess: (purchase) => {
      if (purchase.payment) {
        queryClient.setQueryData(financialKeys.payment(purchase.payment.paymentIntentId), purchase.payment);
      }
      void queryClient.invalidateQueries({ queryKey: financialKeys.purchases() });
      if (purchase.status === 'Completed') invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useMyPlacements(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.myPlacements(status),
    queryFn: () => api.fetchMyPlacements({ status }),
    enabled: access.tier >= 2,
    ...readOptions,
  });
}

/**
 * Is this subject paid for, and until when.
 *
 * The route every other surface actually needs, and the reason a marketplace
 * card can show a "Promoted" chip without Marketplace knowing that money
 * exists.
 */
export function useSubjectPlacements(subjectType: string | undefined, subjectId: string | undefined) {
  return useQuery({
    queryKey: financialKeys.subjectPlacements(subjectType ?? 'none', subjectId ?? 'none'),
    queryFn: () => api.fetchSubjectPlacements(subjectType!, subjectId!),
    enabled: Boolean(subjectType && subjectId),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function useCancelPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ placementId, reason }: { placementId: string; reason?: string }) =>
      api.cancelPlacement(placementId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

/**
 * Quotes a coupon.
 *
 * A mutation rather than a query because the endpoint is a POST and because
 * redeeming a credit bonus through the same route has an effect. Screens use it
 * for the quote and read `isApplicable` — a code that does nothing is refused
 * with a reason rather than silently applied as zero.
 */
export function useRedeemPromotion() {
  return useMutation({
    ...mutationOptions,
    mutationFn: api.redeemPromotion,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export function useSubscriptionPlans(audience?: string, country?: string) {
  return useQuery({
    queryKey: financialKeys.plans(audience, country),
    queryFn: () => api.fetchSubscriptionPlans({ audience, country }),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

/** The caller's subscription, or null for the free plan. Null is not an error. */
export function useMySubscription() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.subscription(),
    queryFn: api.fetchMySubscription,
    enabled: access.tier >= 2,
    ...readOptions,
  });
}

export function useActivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<ActivateSubscriptionRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = { operation: 'subscription', subject: request.planCode };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const subscription = await api.activateSubscription({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return subscription;
    },
    onSuccess: (subscription) => {
      queryClient.setQueryData(financialKeys.subscription(), subscription);
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ subscriptionId, reason }: { subscriptionId: string; reason?: string }) =>
      api.cancelSubscription(subscriptionId, reason),
    onSuccess: (subscription) => {
      queryClient.setQueryData(financialKeys.subscription(), subscription);
    },
  });
}
