// Community social hooks: moderation. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  communitySocialKeys,
  fetchModerationHistory,
  fetchModerationQueue,
  fetchReportReasons,
  reportContent,
} from '@/lib/api/community-social-api';
import type {
  CommunityContentType,
  CreateReportRequest,
  ModerationDecisionResponse,
  ModerationQueueItemResponse,
  ModerationQueueQuery,
  ReportReasonResponse,
} from '@/types/community-social';
import { messageFor, shouldRetry } from './shared';

// ── Moderation ───────────────────────────────────────────────────────────────

export function useReportReasons(): {
  reasons: ReportReasonResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: communitySocialKeys.reportReasons(),
    queryFn: fetchReportReasons,
    // Server configuration. Same reasoning as the capabilities query.
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    reasons: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/**
 * Report something.
 *
 * The field is `reason` going out and **`reasonCode`** coming back. A
 * confirmation screen that echoed `response.reason` would echo `undefined`.
 */
export function useReportContent(): {
  report: (request: CreateReportRequest) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (request: CreateReportRequest) => reportContent(request),
    retry: false,
    onSuccess: (_report, request) => {
      void client.invalidateQueries({ queryKey: communitySocialKeys.moderationQueue() });
      void client.invalidateQueries({
        queryKey: communitySocialKeys.moderationHistory(request.contentType, request.contentId),
      });
    },
  });

  return {
    report: async (request) => {
      await mutation.mutateAsync(request);
    },
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/**
 * The moderation queue.
 *
 * **A plain query, with no `loadMore`, on purpose.** The route accepts `cursor`
 * and `limit` and answers with a bare array carrying no cursor, so there is
 * nothing to send as the next page and no signal that a next page exists.
 * Building an infinite query over it would produce a control that appears to
 * work and re-serves the first page for ever.
 *
 * `limit` is not exposed here at all. It bounds the number of **reports** read
 * before they are grouped by content, so the row count it produces is
 * unpredictable and "fewer rows than the limit" does not mean "that is all there
 * is" — which is the only inference a caller would want it for.
 */
export function useModerationQueue(
  query: Omit<ModerationQueueQuery, 'cursor' | 'limit'> = {}
): {
  items: ModerationQueueItemResponse[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
  /**
   * Always false, and present so a list component does not have to special-case
   * this hook. See above: the route cannot report another page.
   */
  hasMore: false;
} {
  const result = useQuery({
    queryKey: communitySocialKeys.moderationQueue(query),
    queryFn: () => fetchModerationQueue(query),
    staleTime: 15 * 1000,
    retry: shouldRetry,
  });

  const items = result.data ?? [];

  return {
    items,
    isLoading: result.isLoading,
    isEmpty: result.isSuccess && items.length === 0,
    error: messageFor(result),
    refresh: () => void result.refetch(),
    hasMore: false,
  };
}

/**
 * What has already been decided about one piece of content.
 *
 * A bare array. `moderatorName` on every entry is **hardcoded null** — the
 * server never populates it — so a history list identifies decisions by
 * `actionType`, `source` and time, or not at all.
 */
export function useModerationHistory(
  contentType: CommunityContentType,
  contentId: string | null
): {
  decisions: ModerationDecisionResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: communitySocialKeys.moderationHistory(contentType, contentId ?? ''),
    queryFn: () => fetchModerationHistory(contentType, contentId as string),
    enabled: Boolean(contentId),
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });

  return {
    decisions: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}
