// Analytics hooks: insights. ./index.ts is the overview of the whole module.

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as certifiedApi from '@/lib/api/analytics-api';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import { apiClient } from '@/lib/transport/apiClient';
import {
  holdingsFromFailure,
  holdsAnything,
  OWNER_HOLDINGS_ROUTE,
  type OwnerRole,
} from '@/lib/analytics/owner-holdings';
import type {
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsSubject,
  AnalyticsTimeRange,
} from '@/types/analytics';
import { DATASET_STALE_MS, readOptions } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// FUNNEL, RETENTION, LEADERBOARD
// ═════════════════════════════════════════════════════════════════════════════

export function useAnalyticsFunnel(
  funnelKey: string | undefined,
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  options: { enabled?: boolean } = {}
) {
  // Real since 20 Oct 2026 (`GET /analytics/funnels/{key}`), so never gated on
  // the simulation switch: that is false in every production build.
  const enabled = Boolean(funnelKey) && (options.enabled ?? true);

  const query = useQuery({
    queryKey: funnelKey
      ? analyticsKeys.funnel(funnelKey, subject, range)
      : ['analytics', 'funnel', 'none'],
    queryFn: ({ signal }) => certifiedApi.fetchAnalyticsFunnel(funnelKey!, subject, range, signal),
    enabled,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  return {
    funnel: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isSimulated: query.data?.source === 'simulated',
    isEnabled: true,
    refetch: query.refetch,
  };
}

export function useAnalyticsRetention(
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  options: { granularity?: 'day' | 'week' | 'month'; cohortCount?: number; enabled?: boolean } = {}
) {
  const granularity = options.granularity ?? 'week';
  const cohortCount = options.cohortCount ?? 8;
  // Real since 20 Oct 2026 (`GET /analytics/retention`), so never gated on the
  // simulation switch: that is false in every production build.
  const enabled = options.enabled ?? true;

  const query = useQuery({
    queryKey: analyticsKeys.retention(subject, range, granularity, cohortCount),
    queryFn: ({ signal }) =>
      certifiedApi.fetchAnalyticsRetention(subject, range, granularity, cohortCount, signal),
    enabled,
    // A cohort table changes once a day at most.
    staleTime: 30 * 60_000,
    ...readOptions,
  });

  return {
    retention: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isSimulated: query.data?.source === 'simulated',
    isEnabled: true,
    refetch: query.refetch,
  };
}

export function useAnalyticsLeaderboard(
  leaderboardKey: string,
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  metricKey: AnalyticsMetricKey,
  options: { enabled?: boolean; take?: number; cursor?: string | null } = {}
) {
  // Real since 20 Oct 2026 (`GET /analytics/leaderboards/{key}`). Only additive
  // counts can rank — the server refuses distinct viewers and rates — so a
  // metric outside `LEADERBOARD_METRICS` is never asked for.
  const enabled = (options.enabled ?? true) && certifiedApi.isLeaderboardMetric(metricKey);

  const query = useQuery({
    queryKey: [
      ...analyticsKeys.leaderboard(leaderboardKey, subject, range, metricKey),
      options.take ?? null,
      options.cursor ?? null,
    ],
    queryFn: ({ signal }) =>
      certifiedApi.fetchAnalyticsLeaderboard(leaderboardKey, subject, range, metricKey, {
        take: options.take,
        cursor: options.cursor,
        signal,
      }),
    enabled,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  return {
    leaderboard: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// WALLET — the certified arm, and §5's `client-derived` case
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Real wallet activity for a period.
 *
 * Reads B15's real ledger through the certified financial client and sums it on
 * the device. Every metric it produces is `backend`-sourced and `client-derived`
 * — the records are the platform's, the arithmetic is this phone's — and the UI
 * says both. There is no gap notice on this data because it is not simulated.
 *
 * `walletId` is required rather than resolved here, so a member with two wallets
 * gets two calls and two clearly-labelled sections rather than one figure that
 * silently covers a third of their activity.
 */
export function useWalletAnalytics(
  walletId: string | undefined,
  range: AnalyticsTimeRange,
  options: { enabled?: boolean } = {}
) {
  const enabled = Boolean(walletId) && (options.enabled ?? true);

  const query = useQuery({
    queryKey: analyticsKeys.wallet(walletId, range.from, range.to, range.timezone),
    queryFn: () => certifiedApi.fetchWalletActivity(walletId!, range),
    enabled,
    // The ledger is live. A minute is enough to stop a tab switch re-paging it.
    staleTime: 60_000,
    ...readOptions,
  });

  const metricsFor = useCallback(
    (currency: string): AnalyticsMetric[] =>
      query.data ? certifiedApi.walletMetricsFor(query.data, currency) : [],
    [query.data]
  );

  return {
    aggregate: query.data ?? null,
    /** Currencies the member actually transacted in. Never assumed — §57. */
    // The trailing `?? []` covers a missing response; this one covers a response
    // whose `totals` is absent, which the type says cannot happen and which took
    // the Home screen down after sign-in. See `lib/community/scope.ts`.
    currencies: (query.data?.totals ?? []).map((entry) => entry.currency),
    metricsFor,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    /** True where the page cap stopped the walk. §51, and GAP-018. */
    isTruncated: Boolean(query.data?.isTruncated),
    refetch: query.refetch,
  };
}

/**
 * Whether the member holds anything this owner dashboard is about.
 *
 * Asked of the module that owns the thing — Housing, Marketplace, Providers,
 * Jobs — because analytics cannot tell "you have no homes" from "your homes had
 * a quiet month"; both sum to nought. See `lib/analytics/owner-holdings.ts`.
 *
 * `hasAny` is `null` while it is being asked **and** when the asking failed, and
 * the dashboard shows its figures unchanged in both cases. Only a definite
 * "none" replaces them.
 */
export function useOwnerHoldings(
  role: OwnerRole | null,
  options: { enabled?: boolean } = {}
): { hasAny: boolean | null; isLoading: boolean } {
  const query = useQuery({
    queryKey: analyticsKeys.ownerHoldings(role),
    queryFn: async () => {
      const response = await apiClient.get(OWNER_HOLDINGS_ROUTE[role as OwnerRole]);
      return holdsAnything(role as OwnerRole, response.data);
    },
    enabled: Boolean(role) && options.enabled !== false,
    // A profile is not created or deleted between two glances at a dashboard.
    staleTime: 5 * 60_000,
    // The refusals that answer the question are 403 and 404, and retrying one
    // changes nothing; a transport failure is worth one more go.
    retry: (failureCount, cause) => holdingsFromFailure(cause) === null && failureCount < 1,
  });

  return {
    hasAny: query.isSuccess ? query.data : query.isError ? holdingsFromFailure(query.error) : null,
    isLoading: query.isLoading,
  };
}
