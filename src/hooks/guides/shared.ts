// Guides hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { guideErrorMessage } from '@/lib/api/guides-api';
import type { Page } from '@/lib/transport/platform-envelope';
import type { GuideCardResponse } from '@/types/guides';

/**
 * A 401, 403 or 404 from this module is final.
 *
 * Retrying a 403 is three round trips to be told the same thing, and a 404 on a
 * detail read means "not visible to you" — which a retry cannot change either,
 * because visibility is decided inside the handler rather than by load.
 */
export function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 1;
}

/** A sentence for the member, or null. */
export function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? guideErrorMessage(query.error) : null;
}

/** What every paged list hook hands a screen. */
export interface UseGuideListResult {
  guides: GuideCardResponse[];
  /**
   * What the server declared, or null.
   *
   * `CursorPagedResult.TotalCount` is `int?` — counting is expensive and these
   * routes decline — so **null is not zero**, and `guides.length` is the number
   * received rather than the number that exist.
   */
  totalCount: number | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  /**
   * True when the last "Show more" failed. `error` is set then too, with the
   * pages already loaded still in `guides` — so a screen that swaps the list
   * for an error panel on `error` alone throws away what the member was reading.
   */
  loadMoreFailed: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * The one place a cursor-paged card list becomes a `UseGuideListResult`.
 *
 * Written once rather than eleven times because eleven copies of
 * `getNextPageParam` is eleven chances to write "stop when the page is empty",
 * which is the bug this shape exists to prevent.
 */
export function useGuideCardPages(
  queryKey: readonly unknown[],
  fetchPage: (cursor: string | null) => Promise<Page<GuideCardResponse>>,
  options: { enabled?: boolean; staleTime?: number } = {}
): UseGuideListResult {
  const infinite = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: options.enabled ?? true,
    // Two minutes. Published knowledge changes in days, not seconds, and a
    // knowledge base refetched on every tab focus is a request per glance.
    staleTime: options.staleTime ?? 2 * 60 * 1000,
    retry: shouldRetry,
  });

  const guides = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    guides,
    // The first page's figure. Later pages restate it, and the first one is what
    // the member's scroll position was established against.
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isRefreshing: infinite.isRefetching,
    // Settled, successful and genuinely empty. An empty shelf and a failed
    // request need different words on the screen.
    isEmpty: infinite.isSuccess && guides.length === 0,
    hasMore: infinite.hasNextPage,
    isFetchingMore: infinite.isFetchingNextPage,
    loadMoreFailed: infinite.isFetchNextPageError,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}
