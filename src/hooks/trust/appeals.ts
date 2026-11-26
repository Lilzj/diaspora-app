// Trust hooks: appeals. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  fetchAppeal,
  fetchAppealQueue,
  fetchMyAppeals,
  fetchMyModerationCase,
  reviewAppeal,
  requestModerationReview,
  submitAppeal,
  trustKeys,
  type AppealQueueFilters,
} from '@/lib/api/trust-api';
import type {
  AppealStatus,
  ReviewAppealBody,
  SubmitAppealBody,
  WireAppeal,
  WireAppealDetail,
} from '@/types/trust';
import {
  QUEUE_STALE_MS,
  SELF_STALE_MS,
  invalidateVerifications,
  messageFor,
  shouldRetry,
} from './shared';

/** Every appeal list, the queue, and the account-health counter appeals move. */
function invalidateAppeals(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: trustKeys.appeals() });
  void client.invalidateQueries({ queryKey: trustKeys.profile() });
}

// ── Appeals ──────────────────────────────────────────────────────────────────

export interface UseMyAppealsResult {
  appeals: WireAppeal[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /trust/appeals`. */
export function useMyAppeals(
  filters: { status?: AppealStatus | null; pageSize?: number | null } = {},
  options: { enabled?: boolean } = {}
): UseMyAppealsResult {
  const query = useQuery({
    queryKey: trustKeys.appealList(filters.status, filters.pageSize),
    queryFn: () => fetchMyAppeals(filters),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const appeals = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    appeals,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && appeals.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** A moderation decision about the member's own content, and asking for it to be reviewed. */
export function useMyModerationCase(caseId: string | null | undefined) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: trustKeys.moderationCase(caseId ?? ''),
    queryFn: () => fetchMyModerationCase(caseId as string),
    enabled: Boolean(caseId),
    retry: shouldRetry,
  });

  const review = useMutation({
    mutationFn: () => requestModerationReview(caseId as string),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: trustKeys.moderationCase(caseId ?? '') });
    },
  });

  return {
    decision: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
    requestReview: () => review.mutateAsync(),
    isRequestingReview: review.isPending,
    reviewError: messageFor(review),
  };
}

export interface UseAppealResult {
  detail: WireAppealDetail | null;
  isLoading: boolean;
  error: string | null;
}

/** `GET /trust/appeals/{id}`. */
export function useAppeal(appealId: string | null): UseAppealResult {
  const query = useQuery({
    queryKey: trustKeys.appeal(appealId ?? ''),
    queryFn: () => fetchAppeal(appealId as string),
    enabled: Boolean(appealId),
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

export interface UseSubmitAppealResult {
  submit: (body: SubmitAppealBody) => Promise<WireAppeal>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/appeals`.
 *
 * A verification appeal moves the verification to `Appealed`, so the
 * verification lists are invalidated too — otherwise the member's own
 * verification still reads `Rejected` beside their new open appeal.
 */
export function useSubmitAppeal(): UseSubmitAppealResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: submitAppeal,
    retry: false,
    onSuccess: (created) => {
      client.setQueryData(trustKeys.appeal(created.appealId), undefined);
      invalidateAppeals(client);
      invalidateVerifications(client);
    },
  });

  return {
    submit: (body) => mutation.mutateAsync(body),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

export interface UseAppealQueueResult {
  appeals: WireAppeal[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /trust/appeals/queue`. Staff only. */
export function useAppealQueue(
  filters: AppealQueueFilters = {},
  options: { enabled?: boolean } = {}
): UseAppealQueueResult {
  const query = useQuery({
    queryKey: trustKeys.appealQueue(filters),
    queryFn: () => fetchAppealQueue(filters),
    enabled: options.enabled ?? true,
    staleTime: QUEUE_STALE_MS,
    retry: shouldRetry,
  });

  const appeals = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    appeals,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && appeals.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseAppealReviewResult {
  review: (appealId: string, body: ReviewAppealBody) => Promise<WireAppeal>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/appeals/{id}/review`. Staff only.
 *
 * `lib/trust-api.ts` asserts the decision string before it leaves the device,
 * because the server treats anything it does not recognise as a rejection.
 */
export function useAppealReview(): UseAppealReviewResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: { appealId: string; body: ReviewAppealBody }) =>
      reviewAppeal(input.appealId, input.body),
    retry: false,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: trustKeys.appeal(input.appealId) });
      invalidateAppeals(client);
      invalidateVerifications(client);
    },
  });

  return {
    review: (appealId, body) => mutation.mutateAsync({ appealId, body }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}
