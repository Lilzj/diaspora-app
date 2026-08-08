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
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
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
import { useEntitlementSnapshot } from './monetization-gaps';
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
  PurchaseProductRequest,
  SubscriptionPlan,
  Transaction,
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
 * Renews a promotion by buying its product again, scheduled to begin when the
 * current placement ends.
 *
 * There is no renew route — MON-GAP-004 — and this is the honest fallback rather
 * than a simulation of one. It produces a *second* placement rather than
 * extending the first, and `startsAt` is set to the current end date because
 * B15 refuses overlapping placements with `financial.placement.overlaps`. The
 * confirmation screen says exactly that.
 *
 * Everything else is real: real product, real price, real payment, real
 * placement.
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
      const productCode = input.productCode ?? input.promotion.productCode;

      const scope: OperationScope = {
        operation: 'purchase',
        subject: `${productCode}:${input.promotion.subjectId}`,
        discriminator: `renew:${input.promotion.placementId}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      const request: PurchaseProductRequest = {
        productCode,
        subjectType: input.promotion.subjectType,
        subjectId: input.promotion.subjectId,
        methodKind: input.methodKind as never,
        countryCode: input.countryCode,
        idempotencyKey,
        // Start when the current one ends, so the two never overlap. Omitted on
        // an open-ended placement, where the backend starts it on capture.
        startsAt: input.promotion.endsAt ?? undefined,
      };

      const purchase = await api.purchaseProduct(request);

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
// Entitlements
// ─────────────────────────────────────────────────────────────────────────────

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
  /** True when the consumption half is simulated rather than served. */
  isUsageSimulated: boolean;
}

/**
 * The single entitlement entry point. §11: no plan check anywhere else.
 *
 * Composes three reads — the subscription (real), the plan catalogue (real, so a
 * refusal can name the plan that would fix it) and the usage snapshot (simulated,
 * MON-GAP-008). The first two are authoritative; the third only ever adds a
 * consumption figure to a ceiling that came from the first.
 */
export function useEntitlements(): EntitlementsResult {
  const subscriptionQuery = useMySubscription();
  const plansQuery = useSubscriptionPlans();
  const snapshot = useEntitlementSnapshot();
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
    isUsageSimulated: true,
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
