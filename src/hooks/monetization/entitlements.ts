// Monetization hooks: entitlements. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { shouldRetryQuery } from '@/lib/transport/financial-errors';
import { decideEntitlement, effectiveEntitlements, getUsageLimit } from '@/lib/domain/entitlements';
import { useFinancialAccess, useMySubscription, useSubscriptionPlans } from '../financial';
import type { Entitlement } from '@/types/financial';
import type { EntitlementDecision, UsageLimit } from '@/types/monetization';

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
