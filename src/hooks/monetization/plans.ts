// Monetization hooks: plans. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
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
  buildPlanComparison,
  canStartTrial,
  gainedEntitlements,
  lostEntitlements,
  planRelation,
} from '@/lib/domain/entitlements';
import { useMySubscription, useSubscriptionPlans } from '../financial';
import { useLocationStore } from '@/store/location';
import {
  SUBSCRIPTION_AUDIENCES,
  type PlanView,
  type SubscriptionAudience,
  type SubscriptionAudienceKey,
} from '@/types/monetization';
import type { PlanChangePreview, SubscriptionPlan } from '@/types/financial';

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
      void queryClient.invalidateQueries({ queryKey: financialKeys.subscription() });
      void queryClient.invalidateQueries({ queryKey: financialKeys.transactions() });
    },
  });
}
