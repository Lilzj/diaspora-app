// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Hooks for UNSUPPORTED monetization capabilities
//
// ⚠ EVERY HOOK IN THIS FILE IS BACKED BY SIMULATED DATA IN DEVELOPMENT AND BY
//   NOTHING AT ALL IN A RELEASE BUILD. See `src/config/monetization-gaps.ts`. ⚠
//
// The other half of §26's split. These hooks have the same *shape* as the ones
// in `hooks/monetization.ts` — same loading and error surface, same query-key
// discipline, same "mutations never retry" rule — so a screen written against
// them does not change when a backend phase makes them real. What changes is the
// import path and the disappearance of the notice component.
//
// Two behaviours are specific to gap-backed data and are implemented here rather
// than in each screen:
//
//   **`isSimulated` travels with the data.** Every result carries it, so a
//   screen cannot render a campaign's impression count without having had the
//   opportunity to mark it. A screen that ignores the flag is a review comment;
//   a screen that never received one is a bug nobody can see.
//
//   **A disabled build is not an error state.** `areMonetizationGapsEnabled()`
//   is false in release, and the queries are disabled rather than left to fail —
//   so a production binary shows "not available yet" rather than a spinner
//   resolving into a network error.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as gapApi from '@/lib/monetization-gap-api';
import * as adApi from '@/lib/advertising-api';
import { monetizationGapKeys } from '@/lib/monetization-gap-api';
import { areMonetizationGapsEnabled, isGapServedByBackend } from '@/config/monetization-gaps';
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
import { acquireIdempotencyKey, releaseIdempotencyKey, type OperationScope } from '@/lib/idempotency';
import { financialKeys } from '@/lib/financial-api';
import { useFinancialAccess } from './financial';
import type {
  CampaignAudience,
  CreateCampaignRequest,
  UpdateCampaignRequest,
} from '@/types/monetization-gaps';

/** Simulated reference data is as stable as real reference data. */
const REFERENCE_STALE_MS = 60 * 60 * 1000;
/** A performance report is recomputed on a schedule, never live. */
const PERFORMANCE_STALE_MS = 5 * 60 * 1000;

const readOptions = {
  retry: shouldRetryQuery,
  staleTime: 30_000,
} as const;

/** Mutations never retry. Same rule and same reason as `hooks/financial.ts`. */
const mutationOptions = { retry: 0 } as const;

/** Whether this build can reach the development adapter at all. */
export function useMonetizationGapsEnabled(): boolean {
  return areMonetizationGapsEnabled();
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns — MON-GAP-001
// ─────────────────────────────────────────────────────────────────────────────

export function useCampaigns(status?: string) {
  const enabled = isGapServedByBackend('campaigns');
  const access = useFinancialAccess();

  const query = useQuery({
    queryKey: monetizationGapKeys.campaignList(status),
    queryFn: () => adApi.fetchCampaigns({ status }),
    enabled: enabled && access.tier >= 2,
    ...readOptions,
  });

  return {
    campaigns: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: enabled,
  };
}

export function useCampaign(campaignId: string | undefined) {
  const enabled = isGapServedByBackend('campaigns');

  const query = useQuery({
    queryKey: monetizationGapKeys.campaign(campaignId ?? 'none'),
    queryFn: () => adApi.fetchCampaign(campaignId!),
    enabled: enabled && Boolean(campaignId),
    retry: shouldRetryQuery,
    // A campaign's status changes under review and while it runs. Never stale.
    staleTime: 0,
  });

  return {
    campaign: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: enabled,
  };
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateCampaignRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'campaign',
        subject: request.name,
        discriminator: `${request.budgetAmount}${request.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const campaign = await adApi.createCampaign({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return campaign;
    },
    onSuccess: (campaign) => {
      queryClient.setQueryData(monetizationGapKeys.campaign(campaign.campaignId), campaign);
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.campaigns() });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ campaignId, changes }: { campaignId: string; changes: UpdateCampaignRequest }) =>
      adApi.updateCampaign(campaignId, changes),
    onSuccess: (campaign) => {
      queryClient.setQueryData(monetizationGapKeys.campaign(campaign.campaignId), campaign);
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.campaigns() });
    },
  });
}

/**
 * Submits a campaign for review and funding.
 *
 * The payment it returns is watched by `usePaymentReconciliation` exactly as a
 * real one is — the simulation produces a payment intent with the same status
 * machine, so the success screen is driven by a reported status rather than by
 * this call returning. A flow that skipped reconciliation here would be a flow
 * that has never been exercised the way the real one will behave.
 */
// ────────────────────────────────────────────────────────────────────────────
// Review — MON-GAP-006
// ────────────────────────────────────────────────────────────────────────────

/** Campaigns waiting on a decision. Staff only; a member gets a 403. */
export function useCampaignReviewQueue(take?: number) {
  const enabled = isGapServedByBackend('approval');

  const query = useQuery({
    queryKey: monetizationGapKeys.reviewQueue(take ?? 0),
    queryFn: () => adApi.fetchReviewQueue(take),
    enabled,
    // A queue is only useful while it is current, and a reviewer holding a stale
    // one decides twice on the same campaign.
    staleTime: 0,
    retry: shouldRetryQuery,
  });

  return {
    campaigns: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: enabled,
  };
}

/**
 * Approves or rejects a campaign.
 *
 * No idempotency key: a decision is not a payment, and the server refuses a
 * second decision on a campaign that already has one. Acquiring a key here would
 * make a reviewer's retry after a dropped connection fail as a duplicate rather
 * than replay onto the same outcome.
 */
export function useDecideCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      campaignId,
      decision,
      note,
    }: {
      campaignId: string;
      decision: 'approve' | 'reject';
      note?: string;
    }) => adApi.decideCampaign(campaignId, decision, note),
    onSuccess: (campaign) => {
      queryClient.setQueryData(monetizationGapKeys.campaign(campaign.campaignId), campaign);
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.reviewQueue(0) });
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.campaigns() });
    },
  });
}

/**
 * Contests a rejection.
 *
 * The detail screen has told a rejected advertiser "you can ask us to look again
 * until …" since the day it shipped, as plain text with no control behind it:
 * `appealCampaign` existed in the certified arm and had no caller anywhere. This
 * is what makes that sentence true.
 *
 * **The status does not move.** An appeal is a note on the review, not a return
 * to the queue, so nothing here optimistically re-opens the campaign.
 */
export function useAppealCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ campaignId, note }: { campaignId: string; note: string }) =>
      adApi.appealCampaign(campaignId, note),
    onSuccess: (_review, variables) => {
      queryClient.invalidateQueries({
        queryKey: monetizationGapKeys.campaign(variables.campaignId),
      });
    },
  });
}

export function useSubmitCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async ({
      campaignId,
      methodKind,
    }: {
      campaignId: string;
      methodKind?: string;
    }) => {
      const scope: OperationScope = { operation: 'campaign-submit', subject: campaignId };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const submission = await adApi.submitCampaign(campaignId, { methodKind, idempotencyKey });

      // The campaign froze but nothing was charged: B16 answers *what to buy*
      // rather than opening a payment, so the key is released here and the
      // caller spends it on the purchase route instead. Holding it would burn a
      // key on a call that took no money.
      await releaseIdempotencyKey(scope);

      return submission;
    },
    onSuccess: (submission) => {
      queryClient.setQueryData(
        monetizationGapKeys.campaign(submission.campaign.campaignId),
        submission.campaign
      );
      // No payment to cache. B16 answers what to buy; the purchase route is what
      // opens an intent, and it caches its own.
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.campaigns() });
    },
  });
}

/** Pause, resume and cancel. One hook because they share every cache concern. */
export function useCampaignLifecycle() {
  const queryClient = useQueryClient();

  const settle = useCallback(
    (campaign: { campaignId: string }) => {
      queryClient.setQueryData(monetizationGapKeys.campaign(campaign.campaignId), campaign);
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.campaigns() });
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.performance() });
    },
    [queryClient]
  );

  const pause = useMutation({
    ...mutationOptions,
    mutationFn: (campaignId: string) => adApi.pauseCampaign(campaignId),
    onSuccess: settle,
  });

  const resume = useMutation({
    ...mutationOptions,
    mutationFn: (campaignId: string) => adApi.resumeCampaign(campaignId),
    onSuccess: settle,
  });

  const cancel = useMutation({
    ...mutationOptions,
    mutationFn: ({ campaignId, reason }: { campaignId: string; reason?: string }) =>
      adApi.cancelCampaign(campaignId, reason),
    onSuccess: settle,
  });

  return { pause, resume, cancel };
}

// ─────────────────────────────────────────────────────────────────────────────
// Targeting — MON-GAP-007
// ─────────────────────────────────────────────────────────────────────────────

/** One dimension's values out of the per-dimension results B16 returns. */
function byDimension(
  results: { dimension: string; options: { value: string; label: string }[] }[],
  dimension: string
) {
  return results.find((result) => result.dimension === dimension)?.options ?? [];
}

export function useTargetingOptions(countryCode?: string) {
  const enabled = isGapServedByBackend('targeting');

  const query = useQuery({
    queryKey: [...monetizationGapKeys.targetingOptions(), countryCode ?? 'all'],

    // Every dimension the platform can enumerate, in one call. `countryCode` is
    // ignored: country is an ISO list the app already holds, and B16 says so
    // rather than serving a second copy — see fetchAllTargetingOptions.
    queryFn: () => adApi.fetchAllTargetingOptions(),
    enabled,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    // Reshaped into the builder's six arrays.
    //
    // `countries` stays empty on purpose: B16 does not serve a country
    // catalogue because the app already holds the ISO list in full, and a second
    // copy would be a second thing to keep in step. `audienceTypes` stays empty
    // because the delivery engine does not honour that dimension at all — see
    // the certified arm, which does not send it either.
    options: query.data
      ? {
          countries: [],
          audienceTypes: [],
          communities: byDimension(query.data, 'Community'),
          neighbourhoods: byDimension(query.data, 'Neighbourhood'),
          interests: byDimension(query.data, 'Interest'),
          categories: byDimension(query.data, 'Category'),
        }
      : null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: enabled,
  };
}

/**
 * What a selection reaches.
 *
 * Keyed on a stable fingerprint of the selection so that toggling a country off
 * and back on hits the cache rather than re-asking. The fingerprint sorts each
 * dimension, because `['GB','NG']` and `['NG','GB']` are the same audience and
 * caching them separately would double the requests for no benefit.
 */
export function useAudienceEstimate(audience: CampaignAudience | null) {
  const enabled = isGapServedByBackend('targeting');

  const fingerprint = useMemo(() => (audience ? fingerprintAudience(audience) : 'none'), [audience]);

  const query = useQuery({
    queryKey: monetizationGapKeys.audienceEstimate(fingerprint),
    queryFn: () => adApi.estimateAudience(audience!),
    enabled: enabled && Boolean(audience),
    staleTime: PERFORMANCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    estimate: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: enabled,
  };
}

/** A stable key for an audience selection. Order-insensitive within each dimension. */
export function fingerprintAudience(audience: CampaignAudience): string {
  const parts = [
    audience.countries,
    audience.communities,
    audience.neighbourhoods,
    audience.audienceTypes,
    audience.interests,
    audience.categories,
  ].map((values) => values.slice().sort().join(','));

  return [...parts, String(audience.minMonthsInCountry ?? '')].join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance — MON-GAP-002
// ─────────────────────────────────────────────────────────────────────────────

export function usePlacementPerformance(placementId: string | undefined) {
  const enabled = isGapServedByBackend('performance');

  const query = useQuery({
    queryKey: monetizationGapKeys.placementPerformance(placementId ?? 'none'),
    queryFn: () => adApi.fetchPlacementPerformance(placementId!),
    enabled: enabled && Boolean(placementId),
    staleTime: PERFORMANCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    report: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: enabled,
  };
}

export function useCampaignPerformance(campaignId: string | undefined) {
  const enabled = isGapServedByBackend('performance');

  const query = useQuery({
    queryKey: monetizationGapKeys.campaignPerformance(campaignId ?? 'none'),
    queryFn: () => adApi.fetchCampaignPerformance(campaignId!),
    enabled: enabled && Boolean(campaignId),
    staleTime: PERFORMANCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    report: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: enabled,
  };
}

export function usePerformanceSummary() {
  const enabled = isGapServedByBackend('performance');

  const query = useQuery({
    queryKey: monetizationGapKeys.performanceSummary(),
    queryFn: () => adApi.fetchPerformanceSummary(),
    enabled,
    staleTime: PERFORMANCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: false,
    isEnabled: enabled,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entitlement usage — MON-GAP-008
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Billing — MON-GAP-009: connected. Invoices and the next charge read the real
// `/financial` routes through `useInvoices`, `useInvoice` and
// `useUpcomingCharges` in `hooks/monetization.ts`, in every build.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Plan changes — MON-GAP-003
// ─────────────────────────────────────────────────────────────────────────────

export function usePlanChangePreview(subscriptionId: string | undefined, planCode: string | null) {
  const enabled = areMonetizationGapsEnabled();

  const query = useQuery({
    queryKey: monetizationGapKeys.planChangePreview(planCode ?? 'none'),
    queryFn: () => gapApi.previewPlanChange(subscriptionId!, planCode!),
    enabled: enabled && Boolean(subscriptionId && planCode),
    // What a change costs today depends on how much of the period is left.
    // Never served from a cache that could be an hour old.
    staleTime: 0,
    retry: shouldRetryQuery,
  });

  return {
    preview: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}

export function useChangePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async ({
      subscriptionId,
      planCode,
      methodKind,
    }: {
      subscriptionId: string;
      planCode: string;
      methodKind?: string;
    }) => {
      const scope: OperationScope = { operation: 'plan-change', subject: planCode };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const subscription = await gapApi.changePlan(subscriptionId, {
        planCode,
        methodKind: methodKind as never,
        idempotencyKey,
      });
      await releaseIdempotencyKey(scope);
      return subscription;
    },
    onSuccess: (subscription) => {
      // The simulated change still writes through to the real subscription key,
      // because the entitlement layer reads from there and a screen that showed
      // the new plan while `useEntitlements()` still reported the old one would
      // be internally inconsistent in a way that hides real bugs.
      queryClient.setQueryData(financialKeys.subscription(), subscription);
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.planChange() });
      queryClient.invalidateQueries({ queryKey: monetizationGapKeys.entitlements() });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Premium analytics — MON-GAP-010
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The advanced dataset, fetched only when the entitlement resolves true.
 *
 * `hasEntitlement` is passed in rather than read here, so the decision is made
 * once by `useEntitlements()` and this hook cannot accidentally disagree with
 * the lock the screen drew. §12: premium data is never fetched to be obscured.
 */
export function usePremiumAnalytics(hasEntitlement: boolean, period?: string) {
  const enabled = areMonetizationGapsEnabled();

  const query = useQuery({
    queryKey: monetizationGapKeys.premiumAnalytics(period),
    queryFn: () => gapApi.fetchPremiumAnalytics(period),
    enabled: enabled && hasEntitlement,
    staleTime: PERFORMANCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    analytics: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations — MON-GAP-011
// ─────────────────────────────────────────────────────────────────────────────

export function useMonetizationRecommendations(surface?: string) {
  const enabled = areMonetizationGapsEnabled();
  const access = useFinancialAccess();

  const query = useQuery({
    queryKey: monetizationGapKeys.recommendations(surface),
    queryFn: () => gapApi.fetchMonetizationRecommendations(surface),
    enabled: enabled && access.tier >= 2,
    staleTime: PERFORMANCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    recommendations: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    isSimulated: true,
    isEnabled: enabled,
  };
}
