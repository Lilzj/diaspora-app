// Trust hooks: moderation. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignModerationItem,
  fetchModerationQueue,
  trustKeys,
  type ModerationQueueFilters,
} from '@/lib/api/trust-api';
import type { WireModerationQueueItem } from '@/types/trust';
import { QUEUE_STALE_MS, messageFor, shouldRetry } from './shared';

// ── Moderation ───────────────────────────────────────────────────────────────

export interface UseTrustModerationQueueResult {
  items: WireModerationQueueItem[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/moderation/queue`.
 *
 * Trust's queue, not Community's. `app/moderation/queue.tsx` renders
 * `GET /community/moderation/queue`, which is a different module with different
 * items and different identifiers. Both are real; neither is the other.
 */
export function useTrustModerationQueue(
  filters: ModerationQueueFilters = {},
  options: { enabled?: boolean } = {}
): UseTrustModerationQueueResult {
  const query = useQuery({
    queryKey: trustKeys.moderationQueue(filters),
    queryFn: () => fetchModerationQueue(filters),
    enabled: options.enabled ?? true,
    staleTime: QUEUE_STALE_MS,
    retry: shouldRetry,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    items,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && items.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseTrustModerationActionsResult {
  assign: (itemId: string, release?: boolean) => Promise<WireModerationQueueItem>;
  isPending: boolean;
  error: string | null;
}

/**
 * Assigning a Trust moderation queue item to oneself, or releasing it.
 *
 * Deciding one is not here (RMD-009): staff decide a case in the staff console,
 * and the `decide` this offered sent a body the route refuses. See
 * `trust-api.ts`.
 */
export function useTrustModerationActions(): UseTrustModerationActionsResult {
  const client = useQueryClient();

  const assignment = useMutation({
    mutationFn: (input: { itemId: string; release: boolean }) =>
      assignModerationItem(input.itemId, { release: input.release }),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: trustKeys.moderation() });
    },
  });

  return {
    assign: (itemId, release = false) => assignment.mutateAsync({ itemId, release }),
    isPending: assignment.isPending,
    error: messageFor(assignment),
  };
}
