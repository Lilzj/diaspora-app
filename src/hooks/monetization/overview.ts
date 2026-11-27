// Monetization hooks: overview. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { FinancialError } from '@/lib/transport/financial-errors';
import { effectiveEntitlements } from '@/lib/domain/entitlements';
import { useMySubscription, usePurchases, useSubscriptionPlans } from '../financial';
import { type MonetizationOverview } from '@/types/monetization';
import { usePromotions } from './promotions';
import { useBillingHistory } from './billing';

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
