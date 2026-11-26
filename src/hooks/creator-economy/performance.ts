// Creator economy hooks: performance. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as gapApi from '@/lib/api/creator-gap-api';
import { fetchCreatorContentPerformance, fetchCreatorSummary } from '@/lib/api/analytics-api';
import { resolveRange } from '@/lib/analytics/time-range';
import type { AnalyticsRangePreset } from '@/types/analytics';
import * as certifiedApi from '@/lib/creator/certified-client';
import { creatorGapKeys } from '@/lib/api/creator-gap-api';
import { areCreatorGapsEnabled } from '@/config/creator-gaps';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import { fingerprintRange, isRangeQueryable } from '@/lib/domain/creator-economy';
import { useAuthStore } from '@/store/auth';
import { useFinancialAccess, useMyPlacements, usePrimaryWallet } from '../financial';
import type { AnalyticsRange } from '@/types/creator-economy';
import { ANALYTICS_STALE_MS, mutationOptions, readOptions } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// CreatorAnalyticsRepository — CREATOR-GAP-007
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator's own figures.
 *
 * ── The certified route comes first now ──────────────────────────────────────
 *
 * This read the **development arm** and returned a hardcoded `isSimulated: true`,
 * gated on `areCreatorGapsEnabled()` — false in a release build. So on a real
 * device the creator analytics screen had nothing behind it at all, and Creator
 * Studio told the member their last thirty days were "not measured yet".
 *
 * `GET /analytics/creators/me/summary` has been answering 200 with fourteen
 * metrics, a comparison range and a three-entry series the whole time. Measured
 * on 22 Aug 2026 the denial was wrong about two of the three things it named:
 * `content_views` and `saves` are served; `reach` is not.
 *
 * The gap arm is kept as a fallback for a deployment that does not serve the
 * certified route, and `isSimulated` is now derived rather than asserted — it is
 * only true when the figures actually came from the development arm.
 *
 * `unavailableMetrics` is the deployment's own list of what it cannot compute,
 * so a screen can name what is missing instead of guessing.
 */
/**
 * Creator periods in the analytics module's vocabulary.
 *
 * The two halves spell the same ranges differently — `'30d'` here, `'last30d'`
 * there — and the first version of this call cast one to the other with `as
 * never`. `resolveRange` then fell through to its default, so the certified
 * request went out describing a period nobody asked for and the figures on
 * screen would have been for the wrong window. Casting between two vocabularies
 * is how a screen ends up confidently wrong.
 */
const CREATOR_PRESET: Record<AnalyticsRange['period'], AnalyticsRangePreset> = {
  today: 'today',
  '7d': 'last7d',
  '30d': 'last30d',
  '90d': 'last90d',
  year: 'thisYear',
  custom: 'custom',
};

export function useCreatorAnalytics(range: AnalyticsRange) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fingerprint = fingerprintRange(range);

  const query = useQuery({
    queryKey: creatorGapKeys.analytics(fingerprint),
    queryFn: async () => {
      try {
        // `range.period` is already the route's vocabulary; `resolveRange` is
        // used only for the shared from/to/timezone. Translating the period was
        // the bug: `last30d` makes the route answer 500.
        const certified = await fetchCreatorSummary(
          resolveRange(CREATOR_PRESET[range.period], {}),
          range.period
        );
        return { ...certified.summary, __unavailable: certified.unavailableMetrics, __simulated: false };
      } catch (cause) {
        // Only fall back where the development arm is actually on. In a release
        // build this rethrows, because a screen that silently degrades to
        // simulated figures is the defect this hook used to have.
        if (!enabled) throw cause;
        const simulated = await gapApi.fetchCreatorAnalytics(range);
        return { ...simulated, __unavailable: [] as string[], __simulated: true };
      }
    },
    // An incomplete custom range is not an error — it is a form the member has
    // not finished filling in, so the query simply does not run.
    // No longer gated on the development flag: the certified route is the
    // primary source and is present in every build.
    enabled: isAuthenticated && isRangeQueryable(range),
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
    // Keeps the previous period's figures on screen while the new ones load,
    // so changing period does not blank the dashboard.
    placeholderData: (previous) => previous,
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    /** The metrics this deployment says it cannot compute. Never invented. */
    unavailableMetrics: query.data?.__unavailable ?? [],
    // Derived, not asserted. §57: simulated execution must never be
    // indistinguishable from real, and the old hardcoded `true` made real
    // figures look simulated as surely as the reverse would have hidden them.
    isSimulated: query.data?.__simulated ?? false,
    isEnabled: true,
  };
}

/**
 * Per-item performance.
 *
 * §39 forbids loading an entire dataset into the client, so this is cursor-paged
 * from the first call rather than "paged later if it turns out to be slow".
 */
export function useContentPerformance(range: AnalyticsRange, contentType?: string) {
  const enabled = areCreatorGapsEnabled();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fingerprint = `${fingerprintRange(range)}:${contentType ?? 'all'}`;

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.contentPerformance(fingerprint),
    queryFn: async ({ pageParam }) => {
      const params = {
        period: range.period,
        from: range.from,
        to: range.to,
        contentType,
        cursor: pageParam ?? undefined,
        take: 15,
      };

      try {
        // `GET /analytics/creators/me/content` is served. The gap called
        // `/creators/me/analytics/content` under the simulated prefix — a
        // different path, never the same route.
        return await fetchCreatorContentPerformance(params);
      } catch (cause) {
        // The same rule `useCreatorAnalytics` follows: fall back only where the
        // development arm is actually on, and rethrow in a release build. A
        // screen that silently degrades to simulated figures is the defect this
        // hook had.
        if (!enabled) throw cause;
        return gapApi.fetchContentPerformance(params);
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // No longer gated on the development flag: the certified route is the
    // primary source and is present in every build.
    enabled: isAuthenticated && isRangeQueryable(range),
    staleTime: ANALYTICS_STALE_MS,
    retry: shouldRetryQuery,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isSimulated: true,
    isEnabled: enabled,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorRevenueRepository — CREATOR-GAP-008, both halves now real
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The revenue dashboard's data.
 *
 * **This hook was two-armed and is no longer.** The wallet — the balance a
 * member can actually withdraw — was always real, read from B15 through
 * `usePrimaryWallet()`. The attribution — which earning came from a sponsorship
 * rather than a referral, and what is pending versus available — was simulated,
 * because B15 records money movements and not their business meaning.
 *
 * `Diaspora.Modules.Creator` now records that meaning as an earning of its own,
 * so the summary comes from `/creators/me/revenue/summary` and the two halves
 * are both real. `isWalletReal` and `isSummarySimulated` stay on the return
 * shape rather than being deleted: the screen reads them, and a hook that
 * quietly stopped answering a question the screen asks would leave the screen
 * rendering `undefined` as falsy and arriving at the right answer by accident.
 *
 * **Gated on access, not on the gap flag.** `areCreatorGapsEnabled()` is false
 * in a release build, and gating a certified read on it would leave the
 * dashboard permanently empty in exactly the builds members use. The gate has
 * to match the arm.
 */
export function useCreatorRevenue(days?: number) {
  const access = useFinancialAccess();

  const walletQuery = usePrimaryWallet();

  const summaryQuery = useQuery({
    queryKey: creatorGapKeys.revenueSummary(days === undefined ? undefined : String(days)),
    queryFn: () => certifiedApi.fetchRevenueSummary(days),
    enabled: access.canReadWallet,
    ...readOptions,
  });

  return {
    /** REAL. B15's wallet, with its authoritative available and pending balances. */
    wallet: walletQuery.wallet,
    isWalletReal: true,
    /** REAL. Source attribution and the per-source breakdown, from the Creator module. */
    summary: summaryQuery.data ?? null,
    isSummarySimulated: false,

    isLoading: walletQuery.isLoading || summaryQuery.isLoading,
    isError: walletQuery.isError || summaryQuery.isError,
    error: ((walletQuery.error ?? summaryQuery.error) as FinancialError) ?? null,
    refetch: () => {
      walletQuery.refetch();
      void summaryQuery.refetch();
    },
    isEnabled: true,
    canRead: access.canReadWallet,
  };
}

/**
 * The caller's own earnings, paged.
 *
 * The cursor is the server's own and is passed back untouched — see
 * `lib/creator-earning-api.ts` on why this client never builds one.
 */
export function useCreatorEarnings(filters: { state?: string; source?: string } = {}) {
  const access = useFinancialAccess();

  const query = useInfiniteQuery({
    queryKey: creatorGapKeys.earnings(filters.state, filters.source),
    queryFn: ({ pageParam }) =>
      certifiedApi.fetchEarnings({ ...filters, cursor: pageParam ?? undefined, take: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: access.canReadWallet,
    ...readOptions,
  });

  const earnings = useMemo(
    () => query.data?.pages.flatMap((page) => page.earnings) ?? [],
    [query.data]
  );

  return {
    earnings,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Recommendations — CREATOR-GAP-013
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatorRecommendations(surface?: string, take?: number) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Real since 20 Oct 2026 (`GET /recommendations/creator`), so not flag-gated.
  const query = useQuery({
    queryKey: creatorGapKeys.recommendations(surface),
    queryFn: () => certifiedApi.fetchCreatorRecommendations(take),
    enabled: isAuthenticated,
    ...readOptions,
  });

  return {
    recommendations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recommendationId: string) => certifiedApi.dismissCreatorRecommendation(recommendationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.recommendationsAll() });
      void queryClient.invalidateQueries({ queryKey: creatorGapKeys.dashboard() });
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CreatorSponsorshipRepository — hybrid: B15 placements are real
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The creator's sponsored content.
 *
 * The placements are **real** — `useMyPlacements()` reads B15, and cancelling
 * one goes through B15. What the gap route adds is the approval state
 * (MON-GAP-006) and the delivery figures (MON-GAP-002), neither of which the
 * certified contract has.
 *
 * The real placements are exposed alongside the enriched list rather than being
 * folded silently into it, so the management screen can show the authoritative
 * B15 status next to the simulated one and a reviewer can see the difference.
 */
export function useCreatorSponsoredContent(state?: string) {
  const access = useFinancialAccess();

  const placementsQuery = useMyPlacements();

  // Real since 20 Oct 2026 (`GET /creators/me/sponsored`).
  const enrichedQuery = useQuery({
    queryKey: creatorGapKeys.sponsored(state),
    queryFn: () => certifiedApi.fetchSponsoredContent(state),
    enabled: access.tier >= 2,
    ...readOptions,
  });

  return {
    /** REAL. B15 placements: what was bought, when it runs, what it cost. */
    placements: placementsQuery.data ?? [],
    isPlacementsReal: true,
    /** REAL. State, amount paid and delivery figures, from the server. */
    items: enrichedQuery.data ?? [],
    isItemsSimulated: false,

    isLoading: placementsQuery.isLoading || enrichedQuery.isLoading,
    isError: placementsQuery.isError || enrichedQuery.isError,
    error: ((placementsQuery.error ?? enrichedQuery.error) as FinancialError) ?? null,
    refetch: () => {
      void placementsQuery.refetch();
      void enrichedQuery.refetch();
    },
    isEnabled: true,
  };
}
