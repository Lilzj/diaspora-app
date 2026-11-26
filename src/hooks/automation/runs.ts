// Automation hooks: runs. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as automationApi from '@/lib/automation/certified-client';
import { automationKeys } from '@/lib/automation/query-keys';
import { AutomationError, shouldRetryAutomation } from '@/lib/automation/errors';
import { type AutomationAuditEntry, type AutomationRun } from '@/types/automation';
import { useMemberId } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION HISTORY — §36 · §37 · §67
// ═════════════════════════════════════════════════════════════════════════════

export function useAutomationRuns(
  automationId: string | null,
  status: string | null = null
): {
  runs: AutomationRun[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  /**
   * Refetches the pages already loaded, for pull-to-refresh.
   *
   * TanStack replaces each loaded page rather than discarding them, so a member
   * who had paged three deep still has three pages afterwards — refreshing does
   * not cost them their place, and no page can arrive twice.
   */
  refetch: () => Promise<unknown>;
  error: AutomationError | null;
} {
  const userId = useMemberId();

  const query = useInfiniteQuery({
    queryKey: automationKeys.runs(userId, automationId, status, null),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      automationApi.listRuns({ automationId, status }, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: shouldRetryAutomation,
    staleTime: 30 * 1000,
  });

  const runs = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return {
    runs,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: () => query.refetch(),
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

export function useAutomationRun(
  automationId: string | null,
  runId: string | null
): { run: AutomationRun | null; isLoading: boolean; error: AutomationError | null } {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.run(userId, runId ?? 'none'),
    enabled: !!automationId && !!runId,
    queryFn: () => automationApi.fetchRun(automationId!, runId!),
    retry: shouldRetryAutomation,
    // A terminal run never changes. Five minutes rather than thirty seconds so
    // a member reading a failure and scrolling back does not refetch it.
    staleTime: 5 * 60 * 1000,
  });

  return {
    run: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

export function useAutomationAudit(automationId: string | null): {
  audit: AutomationAuditEntry[];
  isLoading: boolean;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.audit(userId, automationId ?? 'none'),
    enabled: !!automationId,
    queryFn: () => automationApi.fetchAudit(automationId!),
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  return { audit: query.data ?? [], isLoading: query.isLoading };
}
