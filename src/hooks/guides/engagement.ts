// Guides hooks: engagement. ./index.ts is the overview of the whole module.

import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  castGuideVote,
  clampGuideLimit,
  fetchBookmarkedGuides,
  guideKeys,
  recordGuideShare,
  recordGuideView,
  removeGuideBookmark,
  reportGuide,
  saveGuideBookmark,
} from '@/lib/api/guides-api';
import type {
  GuideResponse,
  GuideVoteKind,
  RecordGuideViewRequest,
  ReportGuideRequest,
} from '@/types/guides';
import { useGuideCardPages } from './shared';
import type { UseGuideListResult } from './shared';

/** `GET /guides/bookmarked` — `guides.bookmark`. Personal. */
export function useBookmarkedGuides(options: { limit?: number } = {}): UseGuideListResult {
  const limit = clampGuideLimit(options.limit);
  return useGuideCardPages(
    guideKeys.bookmarked(),
    (cursor) => fetchBookmarkedGuides({ limit, cursor: cursor ?? undefined }),
    { staleTime: 0 }
  );
}

/**
 * `PUT`/`DELETE /guides/{guideId}/bookmark`.
 *
 * Both are idempotent, which is why this is one hook with a boolean rather than
 * two: "make sure this is saved" and "make sure this is not" are the two
 * operations a screen actually has.
 */
export function useSetGuideBookmark() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ guideId, saved }: { guideId: string; saved: boolean }) =>
      saved ? saveGuideBookmark(guideId) : removeGuideBookmark(guideId),
    // The guide's `viewer.isSaved` moves at once, so the button says "Saved" on
    // the tap rather than after the refetch, and moves back if the server refuses.
    onMutate: async ({ guideId, saved }) => {
      const key = guideKeys.guide(guideId);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<GuideResponse>(key);
      if (previous) {
        client.setQueryData<GuideResponse>(key, {
          ...previous,
          viewer: { isSaved: saved, vote: previous.viewer?.vote ?? null },
        });
      }
      return { previous };
    },
    onError: (_cause, { guideId }, context) => {
      if (context?.previous) client.setQueryData(guideKeys.guide(guideId), context.previous);
    },
    // Nothing comes back, so the guide and the saved list are asked again.
    onSettled: (_answer, _cause, { guideId }) => {
      void client.invalidateQueries({ queryKey: guideKeys.guide(guideId) });
      void client.invalidateQueries({ queryKey: guideKeys.bookmarked() });
    },
    retry: 1,
  });
}

/**
 * `POST /guides/{guideId}/vote`.
 *
 * Answers `GuideEngagementResponse` — the counters alone, **not** a
 * `GuideResponse`. Writing it into the detail cache would need it nested under
 * `engagement`; invalidating is the honest move.
 */
export function useCastGuideVote() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ guideId, kind }: { guideId: string; kind: GuideVoteKind }) =>
      castGuideVote(guideId, { kind }),
    onSuccess: (_engagement, variables) => {
      void client.invalidateQueries({ queryKey: guideKeys.guide(variables.guideId) });
    },
    retry: false,
  });
}

/** `POST /guides/{guideId}/report` — the reason is **Community's** vocabulary. */
export function useReportGuide() {
  return useMutation({
    mutationFn: ({ guideId, request }: { guideId: string; request: ReportGuideRequest }) =>
      reportGuide(guideId, request),
    retry: false,
  });
}

// ── Analytics the reader generates ───────────────────────────────────────────

/**
 * Records that this device opened the guide, at most once per mount.
 *
 * **Anonymous**, like the route. Uniqueness is the client's claim rather than a
 * server-side fingerprint, so the honest claim a screen can make is "this mount
 * is the first view in this session" — which is what `isUniqueView` carries.
 *
 * The ref is what keeps a re-render, a theme change or a returned focus from
 * counting a second view. A failure is swallowed: a member reading a guide must
 * never see an error because a counter did not increment.
 */
export function useRecordGuideView(): (
  guideId: string,
  request?: RecordGuideViewRequest
) => void {
  const recorded = useRef<Set<string>>(new Set());

  return useCallback((guideId: string, request: RecordGuideViewRequest = {}) => {
    if (!guideId || recorded.current.has(guideId)) return;
    recorded.current.add(guideId);
    void recordGuideView(guideId, { isUniqueView: true, ...request }).catch(() => {
      // Deliberately silent. See the doc above.
    });
  }, []);
}

/** `POST /guides/{guideId}/share` — anonymous. Reports what the platform cannot see. */
export function useRecordGuideShare(): (guideId: string) => void {
  return useCallback((guideId: string) => {
    if (!guideId) return;
    void recordGuideShare(guideId).catch(() => {
      // A share that the counter missed is not worth an error on the member's
      // screen — the share itself already happened in the OS sheet.
    });
  }, []);
}
