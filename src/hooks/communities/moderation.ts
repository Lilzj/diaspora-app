// Communities hooks: moderation. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CommunityId,
  CommunityModerationDecision,
  CommunityReport,
  CommunityReportStatus,
} from '@/types/community-directory';
import { getCommunityFeatureFlags } from '@/config/multi-community-gaps';
import { communityDirectoryGapKeys } from '@/lib/api/community-gap-directory-api';
import { decideCommunityReport, fetchCommunityReportsPage } from '@/lib/api/community-entity-api';
import { trackCommunityEvent } from '@/lib/community/analytics';
import type { CommunityQueryMeta } from './shared';
import { useCommunityCapabilities } from './directory';

/** How many reports one page of the queue asks for. */
const REPORTS_PAGE_SIZE = 20;

export interface CommunityReportsResult extends CommunityQueryMeta {
  /** Every page fetched so far, flattened. */
  data: CommunityReport[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  /** True where the server sent a next-page cursor. */
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
}

/**
 * The community's own moderation queue — GAP-017, real since 21 Oct 2026.
 *
 * Gated on the **server-reported** capability, not on a role. The query does not
 * run without it, so a member without the capability never even issues the
 * request. Pages by the server's `X-Next-Cursor`; a page is never assumed to be
 * the whole queue.
 */
export function useCommunityReports(
  communityId: CommunityId | undefined,
  status?: CommunityReportStatus
): CommunityReportsResult {
  const flags = getCommunityFeatureFlags();
  const capabilities = useCommunityCapabilities(communityId);
  const allowed = capabilities.data?.canViewModerationQueue === true;

  const enabled = Boolean(communityId) && allowed && flags.communityModeratorsEnabled;

  const query = useInfiniteQuery({
    queryKey: communityDirectoryGapKeys.reports(communityId ?? 'none', status),
    queryFn: ({ pageParam, signal }) =>
      fetchCommunityReportsPage(
        communityId!,
        { status, cursor: pageParam, limit: REPORTS_PAGE_SIZE },
        signal
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    // Zero, and refetch on focus. A moderation queue is the one surface where a
    // stale answer means two moderators action the same report.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // The same array until a page arrives: the moderation queue is a FlashList
  // (FARCH-004), which checks its rows again whenever it is handed a new one.
  const data = useMemo(() => query.data?.pages.flatMap((page) => page.items), [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    isSimulated: false,
    unavailable: !flags.communityModeratorsEnabled
      ? 'feature-disabled'
      : !allowed && !capabilities.isLoading
        ? 'forbidden'
        : query.isError
          ? 'error'
          : null,
  };
}

export function useModerationDecision(communityId: CommunityId | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { reportId: string; decision: CommunityModerationDecision; note?: string }) =>
      decideCommunityReport(communityId!, input.reportId, input.decision, input.note),

    // On settle, not on success: a decision whose answer never arrived may still
    // have been applied, and the queue must show what the server now holds.
    onSettled: () => {
      if (communityId) {
        void queryClient.invalidateQueries({
          queryKey: communityDirectoryGapKeys.reportsAll(communityId),
        });
      }
    },
    onSuccess: (_report, input) => {
      trackCommunityEvent('community.moderation.decided', {
        communityId,
        result: input.decision,
      });
    },
  });
}
