// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization hooks (Frontend Phase 6)
//
// §26's stable domain interface. The UI calls `usePromotionPackages()` and
// `useEntitlements()` and does not know — or need to know — whether the answer
// came from a certified route or the development adapter. Everything in *this*
// file is backed by a real B15 contract; the gap-backed half lives in
// `hooks/monetization-gaps.ts` behind the same shape of interface.
//
// Nothing here re-implements what Phase 5 already built. `useCatalog`,
// `usePurchaseProduct`, `useMyPlacements`, `useSubscriptionPlans` and the
// payment reconciliation machinery are all imported from `hooks/financial.ts`.
// This file *arranges* them: it joins placements to purchases, groups a flat
// catalogue into packages, and resolves an entitlement question against the plan
// list. Query keys are reused rather than duplicated so a purchase invalidates
// the promotions list without either side knowing about the other.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/financial-api';
import { financialKeys } from '@/lib/financial-api';
import { FinancialError, shouldRetryQuery } from '@/lib/financial-errors';
import { acquireIdempotencyKey, releaseIdempotencyKey, type OperationScope } from '@/lib/idempotency';
import {
  EXPIRY_WINDOW_DAYS,
  daysUntil,
  filterPromotions,
  groupIntoPackages,
  toPromotions,
} from '@/lib/monetization-catalog';
import {
  buildPlanComparison,
  canStartTrial,
  decideEntitlement,
  effectiveEntitlements,
  gainedEntitlements,
  getUsageLimit,
  lostEntitlements,
  planRelation,
} from '@/lib/entitlements';
import {
  useCatalog,
  useFinancialAccess,
  useMyPlacements,
  useMySubscription,
  usePurchases,
  useSubscriptionPlans,
  useTransactions,
} from './financial';
import { useLocationStore } from '@/store/location';
import {
  SUBSCRIPTION_AUDIENCES,
  type BillingCharge,
  type BillingChargeKind,
  type MonetizationOverview,
  type PlanView,
  type Promotion,
  type PromotionFilter,
  type PromotionPackage,
  type PromotionTarget,
  type SubscriptionAudience,
  type SubscriptionAudienceKey,
} from '@/types/monetization';
import type {
  Entitlement,
  MonetizationProduct,
  PlanChangePreview,
  SubscriptionPlan,
  Transaction,
  UpcomingCharge,
} from '@/types/financial';
import type { EntitlementDecision, UsageLimit } from '@/types/monetization';

/** Catalogue-shaped data changes rarely. Matches `CATALOG_STALE_MS` in `hooks/financial.ts`. */
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
      queryClient.invalidateQueries({ queryKey: financialKeys.purchases() });
      queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
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
      queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
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
      queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
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
      queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which audience surface a plan belongs on.
 *
 * `audienceType` is an open string the operator sets. A value matching no
 * declared audience falls to `business`, the general commercial surface, rather
 * than vanishing — a plan nobody can see is worse than a plan on a slightly
 * wrong tab, and this client should not be the reason an operator's new plan is
 * invisible.
 */
export function audienceKeyForPlan(plan: SubscriptionPlan): SubscriptionAudienceKey {
  const wire = (plan.audienceType ?? '').trim().toLowerCase();

  for (const audience of Object.values(SUBSCRIPTION_AUDIENCES)) {
    if (audience.wireValues.some((value) => value.toLowerCase() === wire)) {
      return audience.key;
    }
  }
  return 'business';
}

export interface PlansResult {
  plans: SubscriptionPlan[];
  views: PlanView[];
  comparison: ReturnType<typeof buildPlanComparison>;
  /** Which audiences have at least one plan. Drives the audience picker. */
  availableAudiences: SubscriptionAudience[];
  current: SubscriptionPlan | null;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
}

/**
 * The plan catalogue for one audience, arranged for comparison.
 *
 * §10: one subscription architecture serving business, organisation, creator,
 * recruiter, landlord and seller. The audience is a parameter, not a screen.
 *
 * The `audience` filter is applied on the client rather than passed to the
 * endpoint even though `GET /subscriptions/plans` binds an `audience` parameter:
 * the audience *picker* has to know which audiences have plans at all, which
 * needs the unfiltered list. One request answers both questions.
 */
export function useMonetizationPlans(audienceKey?: SubscriptionAudienceKey): PlansResult {
  const country = useLocationStore((state) => state.currentLocation?.countryCode);
  const query = useSubscriptionPlans(undefined, country ?? undefined);
  const subscriptionQuery = useMySubscription();

  const allPlans = useMemo(
    () => (query.data ?? []).slice().sort((left, right) => left.sortOrder - right.sortOrder),
    [query.data]
  );

  const current = useMemo(
    () =>
      subscriptionQuery.data
        ? (allPlans.find((plan) => plan.code === subscriptionQuery.data!.planCode) ?? null)
        : null,
    [allPlans, subscriptionQuery.data]
  );

  const plans = useMemo(
    () =>
      audienceKey ? allPlans.filter((plan) => audienceKeyForPlan(plan) === audienceKey) : allPlans,
    [allPlans, audienceKey]
  );

  const views = useMemo<PlanView[]>(
    () =>
      plans.map((plan) => {
        const key = audienceKeyForPlan(plan);
        return {
          plan,
          audience: SUBSCRIPTION_AUDIENCES[key],
          isCurrent: subscriptionQuery.data?.planCode === plan.code,
          canStartTrial: canStartTrial(plan, subscriptionQuery.data ?? null),
          relativeToCurrent: planRelation(current, plan),
          gainedEntitlements: gainedEntitlements(current?.entitlements, plan.entitlements),
          lostEntitlements: lostEntitlements(current?.entitlements, plan.entitlements),
        };
      }),
    [plans, subscriptionQuery.data, current]
  );

  const availableAudiences = useMemo(() => {
    const keys = new Set(allPlans.map(audienceKeyForPlan));
    return Object.values(SUBSCRIPTION_AUDIENCES).filter((audience) => keys.has(audience.key));
  }, [allPlans]);

  return {
    plans,
    views,
    comparison: useMemo(() => buildPlanComparison(plans), [plans]),
    availableAudiences,
    current,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

/** The caller's subscription. A thin re-export so screens have one import. */
export function useSubscription() {
  return useMySubscription();
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan change — MON-GAP-003
//
// Preview and commit are two routes and two hooks, and the split is the
// contract's rather than this file's: the preview is a GET that reserves
// nothing, and the change is the only call that moves money. A screen that
// skipped the preview would have to compute proration on the device, which
// disagrees with the server at the first rounding boundary.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanChangeQuote {
  preview: PlanChangePreview | null;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
}

/**
 * What moving to `planCode` would cost and change, priced now by the server.
 *
 * Disabled without a subscription id: the free tier has nothing to change *from*
 * and the route takes a subscription in its path, so a member on free upgrades
 * through `useActivateSubscription` instead.
 *
 * Not cached for long. It is a price quote, and a stale one shown next to a
 * confirm button is a figure the member will be charged and did not agree to.
 */
export function usePlanChangePreview(
  subscriptionId: string | null | undefined,
  planCode: string | null | undefined
): PlanChangeQuote {
  const query = useQuery({
    queryKey: financialKeys.changePreview(subscriptionId ?? 'none', planCode ?? 'none'),
    queryFn: () => api.previewSubscriptionChange(subscriptionId!, planCode!),
    enabled: Boolean(subscriptionId) && Boolean(planCode),
    staleTime: 60_000,
    gcTime: 60_000,
    retry: shouldRetryQuery,
  });

  return {
    preview: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
  };
}

/**
 * Moves a subscription to another plan.
 *
 * An upgrade takes effect now and charges the difference; a downgrade waits for
 * the period boundary. **The server decides which**, and the client renders
 * `effectiveAt` from the preview rather than inferring the kind from a price
 * comparison — an interval change between equally-priced plans is neither.
 *
 * The mutation refuses to send when the preview says `isPermitted: false`, so a
 * confirm button wired straight to this cannot post a change the platform has
 * already said it will reject and then report the rejection as a network error.
 * Idempotency is body-only, which is what this module reads.
 */
export function useChangeSubscriptionPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: async (input: {
      subscriptionId: string;
      planCode: string;
      /** The quote the member was shown. Required, so an unpreviewed change cannot be sent. */
      preview: PlanChangePreview;
      methodKind?: string;
      countryCode?: string;
    }) => {
      if (!input.preview.isPermitted) {
        // Constructed rather than thrown from a response, because nothing was
        // sent: the server already said no during the preview, and posting the
        // change to hear it again would be a charge attempt this client knows
        // will fail. `isIndeterminate: false` is the load-bearing part — no
        // request left the device, so there is nothing to reconcile.
        throw new FinancialError({
          kind: 'refused',
          code: input.preview.refusalCode ?? undefined,
          message:
            input.preview.refusalMessage ??
            'This plan change is not available on your account.',
          hint: 'Nothing has been charged.',
          isRetryable: false,
          isTerminal: true,
          isIndeterminate: false,
        });
      }

      const scope: OperationScope = {
        operation: 'subscription',
        subject: input.subscriptionId,
        discriminator: `change:${input.planCode}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      const subscription = await api.changeSubscriptionPlan(input.subscriptionId, {
        planCode: input.planCode,
        methodKind: input.methodKind as never,
        countryCode: input.countryCode,
        idempotencyKey,
      });

      await releaseIdempotencyKey(scope);
      return subscription;
    },
    onSuccess: (subscription) => {
      queryClient.setQueryData(financialKeys.subscription(), subscription);
      // The whole subtree: entitlements, upcoming charges and every cached
      // preview were all priced against the plan that just stopped being current.
      queryClient.invalidateQueries({ queryKey: ['financial', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: financialKeys.transactions() });
    },
  });
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The resolved entitlement snapshot — MON-GAP-008.
 *
 * Replaces the simulated snapshot that `hooks/monetization-gaps.ts` served. The
 * gap arm stays on disk for the surfaces it still backs, but nothing in the
 * certified path reads it any more, and the meaningful difference is a type: the
 * gap's `UsageCounter.consumed` is `number` and the real one is `number | null`,
 * so the simulated snapshot **could not express "not measured"** and every
 * counter it produced rendered as a real consumption figure.
 */
export function useCertifiedEntitlementSnapshot() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.entitlements(),
    queryFn: api.fetchMyEntitlements,
    // Tier 2 is the same bar the gap arm used: a signed-in member with a
    // financial identity. Anonymous callers have no entitlements to resolve.
    enabled: access.tier >= 2,
    staleTime: 5 * 60_000,
    retry: shouldRetryQuery,
  });
}

export interface EntitlementsResult {
  /** What is in force right now. Empty on the free plan, which is not an error. */
  entitlements: Entitlement[];
  /** Whether the member may start a paid plan at all. From the access ladder. */
  canSubscribe: boolean;
  isLoading: boolean;
  /** Asks whether one capability is available, and what would unlock it. */
  decide: (key: string) => EntitlementDecision;
  has: (key: string) => boolean;
  /** A limit with its consumption, where a counter exists. See MON-GAP-008. */
  usage: (key: string) => UsageLimit;
  /** Every limited entitlement as a meter, for the entitlements screen. */
  limits: UsageLimit[];
  /**
   * True when the consumption half is simulated rather than served.
   *
   * Now always false — `GET /financial/entitlements/me` is wired. Kept on the
   * result so the screens that branch on it keep compiling, and because the
   * honest replacement is per-counter rather than per-screen: a counter with
   * `consumed: null` is one no vertical measured, and that is a property of the
   * counter, not of the deployment.
   */
  isUsageSimulated: boolean;
  /** When the server resolved the snapshot. Null while it is loading. */
  usageResolvedAt: string | null;
}

/**
 * The single entitlement entry point. §11: no plan check anywhere else.
 *
 * Composes three reads, all three now real: the subscription, the plan catalogue
 * (so a refusal can name the plan that would fix it) and the resolved
 * entitlement snapshot. The snapshot supplies consumption against ceilings the
 * subscription already carried, and supplies it as `number | null` — see
 * `useCertifiedEntitlementSnapshot` for why that null is the point.
 *
 * The snapshot never gates loading. A meter with a ceiling and no consumption is
 * a useful, truthful thing to render; blocking the entitlements screen on a
 * second request to show the same ceilings would be a regression.
 */
export function useEntitlements(): EntitlementsResult {
  const subscriptionQuery = useMySubscription();
  const plansQuery = useSubscriptionPlans();
  const snapshot = useCertifiedEntitlementSnapshot();
  const access = useFinancialAccess();

  const entitlements = useMemo(
    () => effectiveEntitlements(subscriptionQuery.data),
    [subscriptionQuery.data]
  );

  const preferredCurrency = plansQuery.data?.find((plan) => !plan.isFree)?.price.currency;

  const decide = useCallback(
    (key: string) =>
      decideEntitlement({
        key,
        entitlements,
        plans: plansQuery.data,
        canSubscribe: access.canManageSubscription,
        preferredCurrency,
      }),
    [entitlements, plansQuery.data, access.canManageSubscription, preferredCurrency]
  );

  const usage = useCallback(
    (key: string) => getUsageLimit(entitlements, key, snapshot.data?.counters),
    [entitlements, snapshot.data]
  );

  const limits = useMemo(
    () =>
      entitlements
        .map((entitlement) => getUsageLimit(entitlements, entitlement.key, snapshot.data?.counters))
        .filter((limit) => limit.limit !== null || limit.isUnlimited),
    [entitlements, snapshot.data]
  );

  return {
    entitlements,
    canSubscribe: access.canManageSubscription,
    isLoading: subscriptionQuery.isLoading || plansQuery.isLoading,
    decide,
    has: useCallback((key: string) => decide(key).isAvailable, [decide]),
    usage,
    limits,
    isUsageSimulated: false,
    usageResolvedAt: snapshot.data?.resolvedAt ?? null,
  };
}

/** One capability, for a screen that gates exactly one thing. */
export function useEntitlement(key: string): EntitlementDecision & { isLoading: boolean } {
  const { decide, isLoading } = useEntitlements();
  return useMemo(() => ({ ...decide(key), isLoading }), [decide, key, isLoading]);
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

// ─────────────────────────────────────────────────────────────────────────────
// The dashboard
// ─────────────────────────────────────────────────────────────────────────────

export interface OverviewResult {
  overview: MonetizationOverview;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
  /** Whether the member has ever bought anything. Decides first-run copy. */
  isFirstRun: boolean;
}

/**
 * Everything the monetization home needs, from five concurrent reads.
 *
 * Concurrent and not sequential: none of the five depends on another's result,
 * and §31 names waterfall queries as a thing to avoid. TanStack Query
 * deduplicates them against the same keys the rest of the app uses, so opening
 * this screen after the wallet costs nothing.
 */
export function useMonetizationOverview(): OverviewResult {
  const subscriptionQuery = useMySubscription();
  const plansQuery = useSubscriptionPlans();
  const promotions = usePromotions('all');
  const purchasesQuery = usePurchases();
  const billing = useBillingHistory();

  const pendingPurchases = useMemo(
    () => (purchasesQuery.data ?? []).filter((purchase) => purchase.status === 'Pending'),
    [purchasesQuery.data]
  );

  const overview = useMemo<MonetizationOverview>(
    () => ({
      subscription: subscriptionQuery.data ?? null,
      plans: plansQuery.data ?? [],
      promotions: promotions.promotions,
      expiring: promotions.expiring,
      pendingPurchases,
      recentCharges: billing.charges.slice(0, 5),
      entitlements: effectiveEntitlements(subscriptionQuery.data),
    }),
    [subscriptionQuery.data, plansQuery.data, promotions.promotions, promotions.expiring, pendingPurchases, billing.charges]
  );

  const refetch = useCallback(() => {
    void subscriptionQuery.refetch();
    void plansQuery.refetch();
    promotions.refetch();
    void purchasesQuery.refetch();
    billing.refetch();
  }, [subscriptionQuery, plansQuery, promotions, purchasesQuery, billing]);

  return {
    overview,
    isLoading: subscriptionQuery.isLoading || promotions.isLoading,
    isError: promotions.isError,
    error: promotions.error,
    refetch,
    isFirstRun:
      !subscriptionQuery.isLoading &&
      !promotions.isLoading &&
      overview.promotions.length === 0 &&
      overview.subscription === null,
  };
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
