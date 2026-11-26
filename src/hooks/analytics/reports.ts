// Analytics hooks: reports. ./index.ts is the overview of the whole module.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as reportsApi from '@/lib/api/analytics-reports-api';
import { ANALYTICS_GAPS } from '@/config/analytics-gaps';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import { resolveReportingTimezone } from '@/lib/analytics/time-range';
import type {
  AnalyticsAccess,
  AnalyticsExportFormat,
  AnalyticsMetricKey,
  AnalyticsQuery,
  AnalyticsRangePreset,
  AnalyticsSubject,
} from '@/types/analytics';
import { readOptions } from './shared';
import { useAnalyticsDataset } from './dataset';
import { useAnalyticsAccess } from './access';
import { useAnalyticsControls } from './definitions';

/** Mutations never retry. Same rule and same reason as `hooks/financial`. */
const mutationOptions = { retry: 0 } as const;

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT — GAP-026
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Requests an export and polls it to a terminal state.
 *
 * The polling is bounded — `MAX_POLLS` — and the interval is fixed rather than
 * exponential. An export is a job somebody is waiting on with the screen open;
 * backing off to thirty seconds would make a ten-second job feel like a broken
 * one. Bounded, because a job stuck in `running` for ever must eventually render
 * as a failure rather than as a spinner nobody ever dismisses.
 */
const EXPORT_POLL_MS = 1_500;

const MAX_EXPORT_POLLS = 40;

export function useAnalyticsExport() {
  const [exportId, setExportId] = useState<string | null>(null);
  const pollCount = useRef(0);

  const request = useMutation({
    ...mutationOptions,
    mutationFn: ({ query, format }: { query: AnalyticsQuery; format: AnalyticsExportFormat }) =>
      reportsApi.requestAnalyticsExport(query, format),
    onSuccess: (job) => {
      pollCount.current = 0;
      setExportId(job.exportId);
    },
  });

  const job = useQuery({
    queryKey: exportId ? analyticsKeys.exportJob(exportId) : ['analytics', 'export', 'none'],
    queryFn: ({ signal }) => reportsApi.fetchAnalyticsExport(exportId!, signal),
    enabled: Boolean(exportId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'ready' || status === 'failed' || status === 'expired') return false;
      if (pollCount.current >= MAX_EXPORT_POLLS) return false;
      pollCount.current += 1;
      return EXPORT_POLL_MS;
    },
    ...readOptions,
  });

  const reset = useCallback(() => {
    pollCount.current = 0;
    setExportId(null);
    request.reset();
  }, [request]);

  const hasGivenUp =
    pollCount.current >= MAX_EXPORT_POLLS &&
    job.data?.status !== 'ready' &&
    job.data?.status !== 'failed';

  return {
    request: request.mutate,
    isRequesting: request.isPending,
    requestError: (request.error as FinancialError) ?? null,
    job: job.data ?? null,
    isPolling: Boolean(exportId) && job.data?.status !== 'ready' && job.data?.status !== 'failed',
    /** True where polling gave up. Rendered as a failure, never as a spinner. */
    hasTimedOut: hasGivenUp,
    reset,
    // Real since 20 Oct 2026; whether this caller may export is `canExport`.
    isEnabled: true,
    gapKey: ANALYTICS_GAPS.analyticsExport.key,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORTS — GAP-027
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The caller's saved reports — `GET /analytics/reports`, real since 20 Oct 2026.
 *
 * No `shared` scope: a report can only be private, so the server's shared list
 * is always empty, and a tab that could only say "nothing has been shared with
 * you" would be a claim about other people's actions that nobody can take.
 */
export function useAnalyticsReports(scope: 'mine' | 'favorites' = 'mine') {
  const enabled = true;

  const query = useQuery({
    queryKey: analyticsKeys.reports(scope),
    queryFn: ({ signal }) => reportsApi.fetchAnalyticsReports(scope, signal),
    enabled,
    staleTime: 60_000,
    ...readOptions,
  });

  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isEnabled: enabled,
    refetch: query.refetch,
  };
}

export function useAnalyticsReport(reportId: string | undefined) {
  const enabled = Boolean(reportId);

  const query = useQuery({
    queryKey: reportId ? analyticsKeys.report(reportId) : ['analytics', 'report', 'none'],
    queryFn: ({ signal }) => reportsApi.fetchAnalyticsReport(reportId!, signal),
    enabled,
    staleTime: 60_000,
    ...readOptions,
  });

  return {
    report: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isEnabled: true,
    refetch: query.refetch,
  };
}

/**
 * Report mutations.
 *
 * All three invalidate every report list rather than patching the cache. A
 * report's `updatedAt` and its position in a list are the server's to decide, and
 * an optimistic reorder that disagreed would resolve itself on the next fetch —
 * visibly, as a jump.
 */
export function useReportMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: analyticsKeys.reportsAll() });
  };

  const create = useMutation({
    ...mutationOptions,
    mutationFn: (input: reportsApi.SaveReportInput) => reportsApi.createAnalyticsReport(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    ...mutationOptions,
    mutationFn: ({
      reportId,
      input,
    }: {
      reportId: string;
      input: Partial<reportsApi.SaveReportInput> & { isFavorite?: boolean };
    }) => reportsApi.updateAnalyticsReport(reportId, input),
    onSuccess: (report) => {
      queryClient.setQueryData(analyticsKeys.report(report.reportId), report);
      invalidate();
    },
  });

  const remove = useMutation({
    ...mutationOptions,
    mutationFn: (reportId: string) => reportsApi.deleteAnalyticsReport(reportId),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITION HELPER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The whole of a dashboard's data, in one call.
 *
 * Access, controls and dataset are needed together by every screen, and wiring
 * them separately in twenty screens is twenty chances to forget that the range
 * depends on the capability set's reporting timezone. This composes them in the
 * right order: access first, its timezone feeds the range, the range feeds the
 * query, and the query is not made at all until the capability says it may be.
 */
export function useAnalyticsDashboard(input: {
  subject: AnalyticsSubject;
  metrics?: AnalyticsMetricKey[];
  breakdowns?: AnalyticsQuery['breakdowns'];
  includeSeries?: boolean;
  initialPreset?: AnalyticsRangePreset;
  communityScopeToken?: string | null;
  now?: Date;
}) {
  const access = useAnalyticsAccess(input.subject);

  const controls = useAnalyticsControls({
    initialPreset: input.initialPreset,
    reportingTimezone: access.access.reportingTimezone,
    now: input.now,
  });

  const query = useMemo<AnalyticsQuery>(
    () => ({
      subject: input.subject,
      metrics: input.metrics,
      range: controls.range,
      granularity: controls.granularity,
      comparison: controls.comparison,
      filters: controls.filters,
      breakdowns: input.breakdowns,
      includeSeries: input.includeSeries ?? true,
      communityScopeToken: input.communityScopeToken ?? null,
    }),
    [
      input.subject,
      input.metrics,
      input.breakdowns,
      input.includeSeries,
      input.communityScopeToken,
      controls.range,
      controls.granularity,
      controls.comparison,
      controls.filters,
    ]
  );

  // The request is not made until the server says the caller may see it. §48:
  // a dashboard that fetched first and hid later would have the data on the
  // device, where anybody with a debugger can read it.
  const dataset = useAnalyticsDataset(query, {
    enabled: access.access.canView,
    access: access.access,
  });

  return { access, controls, query, ...dataset };
}

/**
 * Resolves the timezone a dashboard reports in, for screens that need it before
 * they have a range.
 */
export function useReportingTimezone(reportingTimezone?: string | null) {
  return useMemo(() => resolveReportingTimezone(reportingTimezone), [reportingTimezone]);
}

/** Signals that a dashboard should offer to save its query as a report. */
export function useCanBuildReports(access: AnalyticsAccess | null | undefined): boolean {
  return Boolean(access?.canBuildReports);
}

/** Keeps the export polling counter honest across unmounts. */
export function useResetExportOnUnmount(reset: () => void) {
  useEffect(() => reset, [reset]);
}
