// Community Life hooks: series. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { communityGapKeys } from '@/lib/api/community-gap-api';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import type { CreateEventSeriesRequest } from '@/types/community-advanced';
import {
  DISCOVERY_STALE_MS,
  LIVE_STALE_MS,
  fingerprint,
  mutationOptions,
  readOptions,
} from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// RecurringEventsRepository — GAP-004 BACKEND CONNECTED, GAP-005 still a gap
//
// The series half moved to B12's real `/community-life/events/series*` routes
// in Wave C-04. Series expansion is genuinely the server's: nothing in these
// hooks, and nothing downstream, evaluates a recurrence rule — the rule is
// carried so the *editor* can render it, and B12 writes the dates.
//
// **The registration half below is still simulated**, and stays on `gapApi`.
// B12 has RSVP on a single event; an occurrence registration with a waitlist
// position, a guest count and a check-in is COMMUNITY-LIFE-GAP-005 and no route
// serves it. Those hooks keep `isSimulated: true` and their screens keep the
// notice.
// ═════════════════════════════════════════════════════════════════════════════

export function useSeriesList(params: b18.SeriesQueryParams = {}, isActive = true) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.seriesList(fingerprint(params)),
    queryFn: ({ pageParam }) =>
      b18.fetchSeriesList({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isActive,
    retry: shouldRetryQuery,
    staleTime: DISCOVERY_STALE_MS,
  });

  const series = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    series,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useSeries(seriesId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.series(seriesId ?? ''),
    queryFn: () => b18.fetchSeries(seriesId as string),
    enabled: Boolean(seriesId),
    ...readOptions,
  });

  return {
    series: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * A series' occurrences in a window.
 *
 * §10: expansion is the server's. Nothing in this hook, and nothing downstream
 * of it, computes a date from a recurrence rule — the rule is carried for the
 * *editor* to render, not for the client to evaluate.
 */
export function useOccurrences(
  seriesId: string | undefined,
  params: { from?: string; to?: string } = {}
) {
  const query = useInfiniteQuery({
    queryKey: communityProgrammeKeys.occurrences(seriesId ?? '', params.from, params.to),
    queryFn: ({ pageParam }) =>
      b18.fetchOccurrences(seriesId as string, {
        ...params,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: Boolean(seriesId),
    retry: shouldRetryQuery,
    staleTime: LIVE_STALE_MS,
  });

  const occurrences = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    occurrences,
    upcoming: occurrences.filter((o) => o.status === 'Scheduled' || o.status === 'Rescheduled'),
    past: occurrences.filter((o) => o.status === 'Completed'),
    cancelled: occurrences.filter((o) => o.status === 'Cancelled'),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useOccurrence(occurrenceId: string | undefined) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.occurrence(occurrenceId ?? ''),
    queryFn: () => b18.fetchOccurrence(occurrenceId as string),
    enabled: Boolean(occurrenceId),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return {
    occurrence: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    isEnabled: true,
  };
}

export function useCreateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateEventSeriesRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'event-series',
        subject: `${request.title}:${request.startDate}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const series = await b18.createEventSeries({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return series;
    },
    onSuccess: (series) => {
      queryClient.setQueryData(communityProgrammeKeys.series(series.seriesId), series);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.seriesAll() });
      void queryClient.invalidateQueries({ queryKey: communityGapKeys.hubAll() });
    },
  });
}

export function useUpdateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      seriesId,
      request,
    }: {
      seriesId: string;
      request: Parameters<typeof b18.updateEventSeries>[1];
    }) => b18.updateEventSeries(seriesId, request),
    onSuccess: (series) => {
      queryClient.setQueryData(communityProgrammeKeys.series(series.seriesId), series);
      // An edit at any scope can move or remove occurrences, so the expansion
      // is invalidated wholesale rather than patched.
      void queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.seriesOccurrences(series.seriesId),
      });
    },
  });
}

export function useUpdateOccurrence() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      occurrenceId,
      request,
    }: {
      occurrenceId: string;
      request: Parameters<typeof b18.updateOccurrence>[1];
    }) => b18.updateOccurrence(occurrenceId, request),
    onSuccess: (occurrence) => {
      queryClient.setQueryData(communityProgrammeKeys.occurrence(occurrence.occurrenceId), occurrence);
      void queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.seriesOccurrences(occurrence.seriesId),
      });
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.series(occurrence.seriesId) });
    },
  });
}

export function useCancelSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ seriesId, reason }: { seriesId: string; reason?: string }) =>
      b18.cancelEventSeries(seriesId, reason),
    onSuccess: (series) => {
      queryClient.setQueryData(communityProgrammeKeys.series(series.seriesId), series);
      void queryClient.invalidateQueries({ queryKey: communityProgrammeKeys.seriesAll() });
    },
  });
}
