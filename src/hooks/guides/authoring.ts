// Guides hooks: authoring. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  attachGuideMedia,
  archiveGuide,
  clampGuideLimit,
  createGuide,
  fetchGuideAnalytics,
  fetchGuideSuggestions,
  fetchGuideVerificationStatus,
  fetchMyDrafts,
  fetchMyGuides,
  guideKeys,
  publishGuide,
  publishNewGuide,
  setGuideTags,
  submitGuideSuggestion,
  submitGuideVerification,
  updateGuide,
  type PublishNewGuideInput,
} from '@/lib/api/guides-api';
import type {
  GuideAnalyticsResponse,
  GuideSuggestionResponse,
  GuideSuggestionsQuery,
  GuideVerificationEvidenceInput,
  GuideVerificationStatusResponse,
  MyGuidesQuery,
  SubmitGuideSuggestionRequest,
  UpdateGuideRequest,
} from '@/types/guides';
import { messageFor, shouldRetry, useGuideCardPages } from './shared';
import type { UseGuideListResult } from './shared';

// ── The author's workspace ───────────────────────────────────────────────────

/** `GET /guides/mine` — `guides.drafts.view`. Every guide they wrote, in any state. */
export function useMyGuides(query: MyGuidesQuery = {}): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.mine({ ...query, limit }),
    (cursor) => fetchMyGuides({ ...query, limit, cursor: cursor ?? undefined }),
    // Zero: an author who just published expects their workspace to say so.
    { staleTime: 0 }
  );
}

/** `GET /guides/mine/drafts` — `guides.drafts.view`. */
export function useMyGuideDrafts(options: { limit?: number } = {}): UseGuideListResult {
  const limit = clampGuideLimit(options.limit);
  return useGuideCardPages(
    guideKeys.myDrafts(),
    (cursor) => fetchMyDrafts({ limit, cursor: cursor ?? undefined }),
    { staleTime: 0 }
  );
}

// ── Author tools ─────────────────────────────────────────────────────────────

/** `GET /guides/{guideId}/analytics` — **`guides.analytics.view`**, its own permission. */
export function useGuideAnalytics(guideId: string | null | undefined): {
  analytics: GuideAnalyticsResponse | null;
  isLoading: boolean;
  /** True when the member may edit the guide but not read its figures. */
  isForbidden: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: guideKeys.analytics(guideId ?? ''),
    queryFn: () => fetchGuideAnalytics(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    analytics: query.data ?? null,
    isLoading: query.isLoading,
    isForbidden: query.isError && status === 403,
    error: messageFor(query),
  };
}

/**
 * `GET /guides/{guideId}/verification` — `guides.verify.submit`.
 *
 * For the author. `reason` is populated for them and **never for readers**, so a
 * reader-facing screen must not treat its absence as "no reason exists".
 */
export function useGuideVerificationStatus(guideId: string | null | undefined): {
  verification: GuideVerificationStatusResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: guideKeys.verification(guideId ?? ''),
    queryFn: () => fetchGuideVerificationStatus(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  return {
    verification: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Suggestions ──────────────────────────────────────────────────────────────

/**
 * `GET /guides/{guideId}/suggestions` — **anonymous**, deliberately.
 *
 * Seeing that somebody already reported the fee as out of date saves the next
 * reader the trouble and the author the tenth identical correction.
 */
export function useGuideSuggestions(
  guideId: string | null | undefined,
  query: GuideSuggestionsQuery = {}
): {
  suggestions: GuideSuggestionResponse[];
  isLoading: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
} {
  const limit = clampGuideLimit(query.limit);

  const infinite = useInfiniteQuery({
    queryKey: guideKeys.suggestions(guideId ?? '', { ...query, limit }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchGuideSuggestions(guideId as string, {
        ...query,
        limit,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: Boolean(guideId),
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  const suggestions = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    suggestions,
    isLoading: infinite.isLoading,
    isEmpty: infinite.isSuccess && suggestions.length === 0,
    hasMore: infinite.hasNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Everything that changes when one guide changes.
 *
 * Named once because the alternative — every mutation naming its own list of
 * keys — is how a screen ends up showing a stale card beside a fresh detail.
 */
function invalidateGuide(client: QueryClient, guideId: string): void {
  void client.invalidateQueries({ queryKey: guideKeys.guide(guideId) });
  void client.invalidateQueries({ queryKey: guideKeys.searchAll() });
  void client.invalidateQueries({ queryKey: guideKeys.shelfAll() });
  void client.invalidateQueries({ queryKey: guideKeys.mineAll() });
}

/**
 * Publish a new guide, end to end.
 *
 * **The hook `guide/create.tsx` calls.** It resolves only when the server has
 * confirmed the publication, and rejects with a `GuidePublishError` naming the
 * step that failed — so a screen can tell a member "your draft is saved" rather
 * than "published" when the last call is the one that did not land.
 */
export function usePublishNewGuide() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: PublishNewGuideInput) => publishNewGuide(input),
    onSuccess: (result) => {
      // The detail cache is seeded from the publish response rather than
      // invalidated: it is a `GuideResponse` for this exact guide, identical in
      // shape to what `GET /guides/{id}` returns, so there is nothing to refetch.
      client.setQueryData(guideKeys.guide(result.guide.guideId), result.guide);
      invalidateGuide(client, result.guide.guideId);
      void client.invalidateQueries({ queryKey: guideKeys.myDrafts() });
    },
    // No retry. `POST /guides` carries **no idempotency mechanism** — not a
    // header, not a body field — so an automatic retry of a create that actually
    // succeeded produces a second draft.
    retry: false,
  });
}

/** `POST /guides` — opens a draft and nothing more. */
export function useCreateGuide() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: createGuide,
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
      void client.invalidateQueries({ queryKey: guideKeys.myDrafts() });
      void client.invalidateQueries({ queryKey: guideKeys.mineAll() });
    },
    retry: false,
  });
}

/** `PUT /guides/{guideId}` — the editor's save. */
export function useUpdateGuide() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ guideId, request }: { guideId: string; request: UpdateGuideRequest }) =>
      updateGuide(guideId, request),
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
      invalidateGuide(client, guide.guideId);
    },
    retry: false,
  });
}

/** `POST /guides/{guideId}/publish`. */
export function usePublishGuide() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      guideId,
      revisionNotes,
      baseRevision,
    }: {
      guideId: string;
      revisionNotes?: string | null;
      baseRevision?: number | null;
    }) => publishGuide(guideId, { revisionNotes, baseRevision }),
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
      invalidateGuide(client, guide.guideId);
      void client.invalidateQueries({ queryKey: guideKeys.versions(guide.guideId) });
    },
    retry: false,
  });
}

/** `POST /guides/{guideId}/archive` — retires stale advice. Versions stay. */
export function useArchiveGuide() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (guideId: string) => archiveGuide(guideId),
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
      invalidateGuide(client, guide.guideId);
    },
    retry: false,
  });
}

/** `PUT /guides/{guideId}/tags` — wholesale replacement. */
export function useSetGuideTags() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      guideId,
      tags,
      baseRevision,
    }: {
      guideId: string;
      tags: string[];
      baseRevision?: number | null;
    }) => setGuideTags(guideId, { tags, baseRevision }),
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
      void client.invalidateQueries({ queryKey: guideKeys.tagsAll() });
    },
    retry: false,
  });
}

/** `POST /guides/{guideId}/media` — by reference. Idempotent on (media, role). */
export function useAttachGuideMedia() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      guideId,
      mediaId,
      role,
      caption,
    }: {
      guideId: string;
      mediaId: string;
      role: Parameters<typeof attachGuideMedia>[1]['role'];
      caption?: string | null;
    }) => attachGuideMedia(guideId, { mediaId, role, caption }),
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
    },
    // Safe to retry — the (media, role) pair is the idempotency key and the
    // handler treats a repeat as the same reference.
    retry: 1,
  });
}

/** `POST /guides/{guideId}/suggestions` — the platform's lightweight merge request. */
export function useSubmitGuideSuggestion() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      guideId,
      request,
    }: {
      guideId: string;
      request: SubmitGuideSuggestionRequest;
    }) => submitGuideSuggestion(guideId, request),
    onSuccess: (suggestion) => {
      void client.invalidateQueries({
        queryKey: guideKeys.suggestionsAll(suggestion.guideId),
      });
    },
    retry: false,
  });
}

/**
 * `POST /guides/{guideId}/verification`.
 *
 * **It asks; it does not grant.** The strongest state this returns is `Pending`.
 */
export function useSubmitGuideVerification() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      guideId,
      notes,
      evidence,
    }: {
      guideId: string;
      notes?: string | null;
      evidence?: GuideVerificationEvidenceInput[];
    }) => submitGuideVerification(guideId, { notes, evidence }),
    onSuccess: (status, variables) => {
      client.setQueryData(guideKeys.verification(variables.guideId), status);
      void client.invalidateQueries({ queryKey: guideKeys.guide(variables.guideId) });
    },
    retry: false,
  });
}
