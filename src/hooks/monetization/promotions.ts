// Monetization hooks: promotions. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { FinancialError, shouldRetryQuery } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import {
  EXPIRY_WINDOW_DAYS,
  daysUntil,
  filterPromotions,
  groupIntoPackages,
  toPromotions,
} from '@/lib/domain/monetization-catalog';
import { useCatalog, useMyPlacements, usePurchases } from '../financial';
import { useLocationStore } from '@/store/location';
import {
  type Promotion,
  type PromotionFilter,
  type PromotionPackage,
  type PromotionTarget,
} from '@/types/monetization';
import type { MonetizationProduct } from '@/types/financial';

/** Catalogue-shaped data changes rarely. Matches `CATALOG_STALE_MS` in `hooks/financial`. */
const CATALOG_STALE_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Promotion packages
// ─────────────────────────────────────────────────────────────────────────────

export interface PromotionPackagesResult {
  packages: PromotionPackage[];
  /** The raw catalogue, for a screen that needs a product the grouping hid. */
  products: MonetizationProduct[];
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
  /** True when the catalogue answered and had nothing for this subject. */
  isEmpty: boolean;
}

/**
 * What can be bought to promote one subject.
 *
 * `GET /catalog?subjectType&subjectId&country`, grouped. The country comes from
 * the member's current location because B15 prices per country and a member in
 * Lagos should not be quoted the London catalogue.
 *
 * An empty result is a legitimate answer — a vertical with no products
 * configured for a deployment — and the caller renders it as "nothing to buy
 * here yet" rather than as an error.
 */
export function usePromotionPackages(
  target: PromotionTarget | null,
  subjectId?: string
): PromotionPackagesResult {
  const country = useLocationStore((state) => state.currentLocation?.countryCode);

  const query = useCatalog(
    {
      subjectType: target?.subjectType as string | undefined,
      subjectId,
      country: country ?? undefined,
    },
    Boolean(target)
  );

  const products = useMemo(() => query.data ?? [], [query.data]);
  const packages = useMemo(() => groupIntoPackages(products), [products]);

  return {
    packages,
    products,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isEmpty: !query.isLoading && !query.isError && products.length === 0,
  };
}

/**
 * The whole catalogue, across every subject type.
 *
 * Used by the monetization dashboard to say what is on offer at all. Passing no
 * `subjectType` is a legitimate call — the endpoint's parameters are all
 * optional — and the response is every product the caller could buy for
 * anything.
 */
export function useMonetizationCatalog() {
  const country = useLocationStore((state) => state.currentLocation?.countryCode);
  return useCatalog({ country: country ?? undefined });
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotions
// ─────────────────────────────────────────────────────────────────────────────

export interface PromotionsResult {
  promotions: Promotion[];
  /** Those lapsing inside `EXPIRY_WINDOW_DAYS`. */
  expiring: Promotion[];
  counts: Record<PromotionFilter, number>;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
}

/**
 * The caller's promotions, joined to the purchases that paid for them.
 *
 * Two reads rather than one because B15 keeps placements and purchases apart —
 * a placement is financial state, a purchase is a payment record, and only
 * `MonetizationPurchase` knows about both. They run concurrently under TanStack
 * Query rather than in sequence: neither depends on the other's result, and a
 * waterfall here would double the time to first paint on the management screen.
 *
 * A promotion whose purchase is not in the list still renders, with no price
 * line — see `toPromotion`.
 */
export function usePromotions(filter: PromotionFilter = 'all'): PromotionsResult {
  const placementsQuery = useMyPlacements();
  const purchasesQuery = usePurchases();
  const catalogQuery = useMonetizationCatalog();

  const all = useMemo(
    () => toPromotions(placementsQuery.data ?? [], purchasesQuery.data ?? [], catalogQuery.data ?? []),
    [placementsQuery.data, purchasesQuery.data, catalogQuery.data]
  );

  const promotions = useMemo(() => filterPromotions(all, filter), [all, filter]);

  const counts = useMemo(
    () => ({
      all: all.length,
      active: filterPromotions(all, 'active').length,
      scheduled: filterPromotions(all, 'scheduled').length,
      ended: filterPromotions(all, 'ended').length,
    }),
    [all]
  );

  const refetch = useCallback(() => {
    void placementsQuery.refetch();
    void purchasesQuery.refetch();
  }, [placementsQuery, purchasesQuery]);

  return {
    promotions,
    expiring: useMemo(() => all.filter((promotion) => promotion.isExpiringSoon), [all]),
    counts,
    // The catalogue only enriches — a missing one costs a renewability flag, not
    // the list — so it deliberately does not hold up the loading state.
    isLoading: placementsQuery.isLoading || purchasesQuery.isLoading,
    isError: placementsQuery.isError,
    error: (placementsQuery.error as FinancialError) ?? null,
    refetch,
  };
}

/** One promotion, from the same joined list. Null while loading or when not found. */
export function usePromotion(placementId: string | undefined): {
  promotion: Promotion | null;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
} {
  const { promotions, isLoading, isError, error, refetch } = usePromotions('all');

  return {
    promotion: placementId
      ? (promotions.find((candidate) => candidate.placementId === placementId) ?? null)
      : null,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * Renews a promotion by extending the placement that already exists.
 *
 * ── What changed, and why it is not cosmetic ─────────────────────────────────
 *
 * This used to buy the product again with `startsAt` set to the current end
 * date, because `POST /placements/{id}/renew` did not exist (MON-GAP-004). It
 * does now, and the difference is one the member's money notices: re-purchasing
 * produced a *second* placement queued behind the first — two purchase records,
 * two placements, two things to cancel — where renewing moves the end of the one
 * they already have.
 *
 * ── What the response does and does not say ──────────────────────────────────
 *
 * `RenewPlacementCommand` answers a `MonetizationPurchaseResponse`, not a
 * placement: it records the purchase, creates a `PaymentIntent` and saves. The
 * intent is created and **not captured**, so when this resolves the renewal has
 * been *started*, not completed. Nothing here reports success; the caller shows
 * the payment's own status and reconciles, exactly as the first purchase does.
 *
 * The idempotency key is released only on a terminal purchase status, so a
 * retry after an indeterminate transport failure reuses the key rather than
 * charging twice.
 */
export function useRenewPromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: async (input: {
      promotion: Promotion;
      productCode?: string;
      methodKind?: string;
      countryCode?: string;
    }) => {
      const scope: OperationScope = {
        operation: 'purchase',
        subject: `${input.promotion.productCode}:${input.promotion.subjectId}`,
        discriminator: `renew:${input.promotion.placementId}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      const purchase = await api.renewPlacement(input.promotion.placementId, {
        // Omitted means "the same product again", which is what renewing usually
        // means and what the server does with a null. Sending the promotion's own
        // code unasked would pin the renewal to a product that may have been
        // withdrawn from sale, turning a renewal into a 404 on a code the member
        // never chose.
        productCode: input.productCode,
        methodKind: input.methodKind as never,
        countryCode: input.countryCode,
        idempotencyKey,
      });

      if (
        purchase.status === 'Completed' ||
        purchase.status === 'Failed' ||
        purchase.status === 'Cancelled'
      ) {
        await releaseIdempotencyKey(scope);
      }
      return purchase;
    },
    onSuccess: (purchase) => {
      if (purchase.payment) {
        queryClient.setQueryData(
          financialKeys.payment(purchase.payment.paymentIntentId),
          purchase.payment
        );
      }
      void queryClient.invalidateQueries({ queryKey: financialKeys.purchases() });
      void queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

// ── Placement lifecycle — MON-GAP-004 and MON-GAP-005 ────────────────────────
//
// Three mutations that move no money, so unlike the renewal above their result
// is authoritative the moment it arrives and the new placement can be written
// straight into the cache. Each still invalidates the list, because a status
// change reorders the buckets on the management screen.

/** Records whether a placement should renew itself when its window closes. */
export function useSetPromotionAutoRenew() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: { placementId: string; enabled: boolean }) =>
      api.setPlacementAutoRenew(input.placementId, input.enabled),
    onSuccess: (placement) => {
      queryClient.setQueryData(financialKeys.placement(placement.placementId), placement);
      void queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

/**
 * Stops delivery and stops the clock. The paused days are banked.
 *
 * Deliberately a different operation from cancelling: cancelling and re-buying
 * loses the remaining paid time, and offering that as a pause would misdescribe
 * what the member's money just did.
 */
export function usePausePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (placementId: string) => api.pausePlacement(placementId),
    onSuccess: (placement) => {
      queryClient.setQueryData(financialKeys.placement(placement.placementId), placement);
      void queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

/** Starts it again and extends the window by exactly the paused duration. */
export function useResumePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (placementId: string) => api.resumePlacement(placementId),
    onSuccess: (placement) => {
      queryClient.setQueryData(financialKeys.placement(placement.placementId), placement);
      void queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

/**
 * Placements on one subject, so a listing screen can say "already promoted"
 * without knowing what a placement is.
 *
 * A thin wrapper over the certified `GET /placements/{subjectType}/{subjectId}`,
 * kept here so a vertical screen imports from `hooks/monetization` rather than
 * reaching into the financial layer.
 */
export function useSubjectPromotion(
  target: PromotionTarget | null,
  subjectId: string | undefined
) {
  const query = useQuery({
    queryKey: financialKeys.subjectPlacements(target?.subjectType ?? 'none', subjectId ?? 'none'),
    queryFn: () => api.fetchSubjectPlacements(target!.subjectType as string, subjectId!),
    enabled: Boolean(target && subjectId),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });

  const active = useMemo(
    () => (query.data ?? []).find((placement) => placement.isActive) ?? null,
    [query.data]
  );

  return {
    placements: query.data ?? [],
    active,
    isPromoted: active !== null,
    daysRemaining: daysUntil(active?.endsAt),
    isExpiringSoon:
      active !== null &&
      (daysUntil(active.endsAt) ?? Number.MAX_SAFE_INTEGER) <= EXPIRY_WINDOW_DAYS,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
