// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Guides hooks (Remediation Wave D-3)
//
// The stable interface over `lib/guides-api.ts`. A screen calls
// `useGuideSearch({ country: 'GB' })` and receives cards; it never builds a
// query key, never decodes a cursor and never decides what a mutation
// invalidates.
//
// ── Where an infinite query is honest, and where it is not ───────────────────
//
// **Every discovery and browse route in this module is genuinely cursor-paged.**
// `SearchGuidesQuery`, the three shelves, nearby, the two browses, the author
// list, `/mine`, `/mine/drafts`, `/bookmarked`, suggestions and the moderation
// queue all answer `CursorPagedResult<T>` with a real `nextCursor` and a real
// `hasMore`. That is a materially better position than Community's, where the
// moderation queue accepted a cursor and returned a bare array.
//
// **Three routes are bare arrays and are plain queries**: `GET /guides/categories`,
// `GET /guides/tags` and `GET /guides/{id}/translations`. They take no cursor,
// so a `loadMore` on them would be a control with nothing behind it.
//
// **`GET /guides/{id}/versions` is a bare array with a `limit`.** The limit
// bounds the answer at `GuideLimits.MaxVersionsListed` (50) and there is no
// cursor — a guide with more than fifty published versions shows its newest
// fifty, and nothing in the contract offers the rest.
//
// ── Why paging stops on `hasMore` ────────────────────────────────────────────
//
// Same rule as every other wave: `getNextPageParam` returns `undefined` the
// moment `hasMore` is false and never inspects the row count. A page that came
// back short is not the last page, and a page that came back full is not proof
// of another.
//
// ── Why nothing here is optimistic ───────────────────────────────────────────
//
// Almost every write in this module answers with the **whole** `GuideResponse`,
// which is tempting to write straight into the cache. The hooks invalidate
// instead, for one reason: `engagement`, `trustMark` and `isFeatured` are
// server-computed rollups, and a vote's response carries
// `GuideEngagementResponse` while a bookmark's carries a `GuideResponse` whose
// engagement is nested one level deeper. A cache write that reached for the
// wrong one would blank a guide's counters until the next refetch — the exact
// class of silent wrongness this remediation exists to remove.
//
// The one exception is `useGuide`, which seeds the detail cache from a
// mutation's own return value where the shapes are identical. It is marked.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef } from 'react';
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
  castGuideVote,
  clampGuideLimit,
  compareGuideVersions,
  createGuide,
  fetchBookmarkedGuides,
  fetchFeaturedGuides,
  fetchGuide,
  fetchGuideAnalytics,
  fetchGuideBySlug,
  fetchGuideCapabilities,
  fetchGuideCategories,
  fetchGuidePreview,
  fetchGuideSuggestions,
  fetchGuideTags,
  fetchGuideTranslations,
  fetchGuideVerificationStatus,
  fetchGuideVersion,
  fetchGuideVersions,
  fetchGuidesByAuthor,
  fetchGuidesByCategory,
  fetchGuidesByCountry,
  fetchLatestGuides,
  fetchMyDrafts,
  fetchMyGuides,
  fetchNearbyGuides,
  fetchTrendingGuides,
  guideErrorMessage,
  guideKeys,
  publishGuide,
  publishNewGuide,
  recordGuideShare,
  recordGuideView,
  removeGuideBookmark,
  reportGuide,
  saveGuideBookmark,
  searchGuides,
  setGuideTags,
  submitGuideSuggestion,
  submitGuideVerification,
  updateGuide,
  type PublishNewGuideInput,
} from '@/lib/guides-api';
import type { Page } from '@/lib/platform-envelope';
import type {
  GuideAnalyticsResponse,
  GuideCapabilitiesResponse,
  GuideCardResponse,
  GuideCategoryResponse,
  GuideResponse,
  GuideSortKey,
  GuideSuggestionResponse,
  GuideSuggestionsQuery,
  GuideTagResponse,
  GuideVerificationEvidenceInput,
  GuideVerificationStatusResponse,
  GuideVersionDiffResponse,
  GuideVersionResponse,
  GuideVersionSummaryResponse,
  GuideVoteKind,
  GuidesByCategoryQuery,
  GuidesByCountryQuery,
  MyGuidesQuery,
  NearbyGuidesQuery,
  RecordGuideViewRequest,
  ReportGuideRequest,
  SearchGuidesQuery,
  SubmitGuideSuggestionRequest,
  UpdateGuideRequest,
} from '@/types/guides';

/**
 * A 401, 403 or 404 from this module is final.
 *
 * Retrying a 403 is three round trips to be told the same thing, and a 404 on a
 * detail read means "not visible to you" — which a retry cannot change either,
 * because visibility is decided inside the handler rather than by load.
 */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 1;
}

/** A sentence for the member, or null. */
function messageFor(query: { isError: boolean; error: unknown }): string | null {
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
function useGuideCardPages(
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
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

// ── Capabilities ─────────────────────────────────────────────────────────────

export interface UseGuideCapabilitiesResult {
  capabilities: GuideCapabilitiesResponse | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * What this deployment's knowledge base can do.
 *
 * An hour's `staleTime`: block kinds, sort orders and ceilings are deployment
 * configuration and do not change while a member is holding the phone. The
 * editor should build its toolbar from `capabilities.blockKinds` rather than
 * from a constant, so a block kind a deployment adds appears without a release.
 */
export function useGuideCapabilities(): UseGuideCapabilitiesResult {
  const query = useQuery({
    queryKey: guideKeys.capabilities(),
    queryFn: fetchGuideCapabilities,
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    capabilities: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface UseGuideCategoriesResult {
  categories: GuideCategoryResponse[];
  /** Only the ones a **new** guide may be filed under. */
  selectable: GuideCategoryResponse[];
  isLoading: boolean;
  error: string | null;
}

/**
 * The guide catalogue, flat and ordered.
 *
 * `selectable` exists because `isActive: false` means "new guides may not choose
 * it", not "hide it": existing guides keep an inactive category and a filter row
 * that dropped it would hide those guides from browse. A picker uses
 * `selectable`; a filter row uses `categories`.
 */
export function useGuideCategories(
  options: { parentKey?: string; includeInactive?: boolean } = {}
): UseGuideCategoriesResult {
  const query = useQuery({
    queryKey: guideKeys.categories(options.parentKey, options.includeInactive),
    queryFn: () => fetchGuideCategories(options),
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  const categories = query.data?.items ?? [];

  return {
    categories,
    selectable: categories.filter((category) => category.isActive),
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/** `GET /guides/tags` — a bare array, built from what authors actually wrote about. */
export function useGuideTags(
  options: { countryCode?: string; categoryKey?: string; limit?: number } = {}
): { tags: GuideTagResponse[]; isLoading: boolean; error: string | null } {
  const query = useQuery({
    queryKey: guideKeys.tags(options.countryCode, options.categoryKey),
    queryFn: () => fetchGuideTags(options),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    tags: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Discovery ────────────────────────────────────────────────────────────────

/** `GET /guides` — every discovery filter, cursor-paged. */
export function useGuideSearch(
  query: SearchGuidesQuery = {},
  options: { enabled?: boolean } = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.search({ ...query, limit }),
    (cursor) => searchGuides({ ...query, limit, cursor: cursor ?? undefined }),
    options
  );
}

/** `GET /guides/featured` — what staff chose. */
export function useFeaturedGuides(
  options: { countryCode?: string; limit?: number; enabled?: boolean } = {}
): UseGuideListResult {
  const { enabled, ...query } = options;
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.shelf('featured', { ...query, limit }),
    (cursor) => fetchFeaturedGuides({ ...query, limit, cursor: cursor ?? undefined }),
    { enabled }
  );
}

/** `GET /guides/latest` — the only ordering with no judgement in it. */
export function useLatestGuides(
  options: { countryCode?: string; language?: string; limit?: number; enabled?: boolean } = {}
): UseGuideListResult {
  const { enabled, ...query } = options;
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.shelf('latest', { ...query, limit }),
    (cursor) => fetchLatestGuides({ ...query, limit, cursor: cursor ?? undefined }),
    { enabled }
  );
}

/** `GET /guides/trending` — what is earning attention now. */
export function useTrendingGuides(
  options: { countryCode?: string; categoryKey?: string; limit?: number; enabled?: boolean } = {}
): UseGuideListResult {
  const { enabled, ...query } = options;
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.shelf('trending', { ...query, limit }),
    (cursor) => fetchTrendingGuides({ ...query, limit, cursor: cursor ?? undefined }),
    { enabled }
  );
}

/** `GET /guides/nearby` — resolved entirely by Location's scope resolver. */
export function useNearbyGuides(
  query: NearbyGuidesQuery = {},
  options: { enabled?: boolean } = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.nearby({ ...query, limit }),
    (cursor) => fetchNearbyGuides({ ...query, limit, cursor: cursor ?? undefined }),
    options
  );
}

/** `GET /guides/countries/{countryCode}`. */
export function useGuidesByCountry(
  countryCode: string | null | undefined,
  query: GuidesByCountryQuery = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.byCountry(countryCode ?? '', { ...query, limit }),
    (cursor) =>
      fetchGuidesByCountry(countryCode as string, { ...query, limit, cursor: cursor ?? undefined }),
    { enabled: Boolean(countryCode) }
  );
}

/** `GET /guides/categories/{categoryKey}/guides` — by **key**, never by name. */
export function useGuidesByCategory(
  categoryKey: string | null | undefined,
  query: GuidesByCategoryQuery = {}
): UseGuideListResult {
  const limit = clampGuideLimit(query.limit);
  return useGuideCardPages(
    guideKeys.byCategory(categoryKey ?? '', { ...query, limit }),
    (cursor) =>
      fetchGuidesByCategory(categoryKey as string, {
        ...query,
        limit,
        cursor: cursor ?? undefined,
      }),
    { enabled: Boolean(categoryKey) }
  );
}

/** `GET /guides/authors/{authorId}` — the byline a grateful reader clicks. */
export function useGuidesByAuthor(
  authorId: string | null | undefined,
  options: { sort?: GuideSortKey; limit?: number } = {}
): UseGuideListResult {
  const limit = clampGuideLimit(options.limit);
  return useGuideCardPages(
    guideKeys.byAuthor(authorId ?? '', options.sort),
    (cursor) =>
      fetchGuidesByAuthor(authorId as string, {
        sort: options.sort,
        limit,
        cursor: cursor ?? undefined,
      }),
    { enabled: Boolean(authorId) }
  );
}

// ── One guide ────────────────────────────────────────────────────────────────

export interface UseGuideResult {
  guide: GuideResponse | null;
  isLoading: boolean;
  /**
   * True when the server answered 404.
   *
   * Distinguished from a general error because visibility is applied inside the
   * handler: a draft, a hidden guide and a deleted one are all 404 to everybody
   * but their author, so this is "not available to you" rather than "gone".
   */
  isNotFound: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /guides/{guideId}` — anonymous. */
export function useGuide(guideId: string | null | undefined): UseGuideResult {
  const query = useQuery({
    queryKey: guideKeys.guide(guideId ?? ''),
    queryFn: () => fetchGuide(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    guide: query.data ?? null,
    isLoading: query.isLoading,
    isNotFound: query.isError && status === 404,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/slug/{slug}` — the handle a deep link carries. */
export function useGuideBySlug(slug: string | null | undefined): UseGuideResult {
  const query = useQuery({
    queryKey: guideKeys.guideBySlug(slug ?? ''),
    queryFn: () => fetchGuideBySlug(slug as string),
    enabled: Boolean(slug),
    staleTime: 2 * 60 * 1000,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    guide: query.data ?? null,
    isLoading: query.isLoading,
    isNotFound: query.isError && status === 404,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/{guideId}/preview` — `guides.drafts.view`. The author's own draft. */
export function useGuidePreview(guideId: string | null | undefined): UseGuideResult {
  const query = useQuery({
    queryKey: guideKeys.preview(guideId ?? ''),
    queryFn: () => fetchGuidePreview(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 0,
    retry: shouldRetry,
  });

  const status = (query.error as { response?: { status?: number } } | null)?.response?.status;

  return {
    guide: query.data ?? null,
    isLoading: query.isLoading,
    isNotFound: query.isError && status === 404,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/{guideId}/translations` — a bare array; the language switcher. */
export function useGuideTranslations(guideId: string | null | undefined): {
  translations: GuideCardResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: guideKeys.translations(guideId ?? ''),
    queryFn: () => fetchGuideTranslations(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    translations: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Versions ─────────────────────────────────────────────────────────────────

/**
 * `GET /guides/{guideId}/versions` — **anonymous**.
 *
 * A bare array, newest first, capped at fifty by the server. The read is public
 * on purpose: a reader who acted on a fee or a deadline should be able to see
 * that it changed, and a history visible only to its author is a record kept by
 * the one person it could exonerate.
 */
export function useGuideVersions(guideId: string | null | undefined): {
  versions: GuideVersionSummaryResponse[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const query = useQuery({
    queryKey: guideKeys.versions(guideId ?? ''),
    queryFn: () => fetchGuideVersions(guideId as string),
    enabled: Boolean(guideId),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    versions: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** `GET /guides/{guideId}/versions/{versionNumber}` — what readers were actually shown. */
export function useGuideVersion(
  guideId: string | null | undefined,
  versionNumber: number | null | undefined
): { version: GuideVersionResponse | null; isLoading: boolean; error: string | null } {
  const query = useQuery({
    queryKey: guideKeys.version(guideId ?? '', versionNumber ?? 0),
    queryFn: () => fetchGuideVersion(guideId as string, versionNumber as number),
    enabled: Boolean(guideId) && typeof versionNumber === 'number',
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    version: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/**
 * `GET /guides/{guideId}/versions/compare`.
 *
 * **Unchanged sections are omitted from the answer.** A screen that rendered
 * "3 of 12 sections changed" needs the version detail for the denominator; this
 * response only carries the numerator.
 */
export function useGuideVersionDiff(
  guideId: string | null | undefined,
  fromVersion: number | null | undefined,
  toVersion: number | null | undefined
): { diff: GuideVersionDiffResponse | null; isLoading: boolean; error: string | null } {
  const enabled =
    Boolean(guideId) && typeof fromVersion === 'number' && typeof toVersion === 'number';

  const query = useQuery({
    queryKey: guideKeys.versionDiff(guideId ?? '', fromVersion ?? 0, toVersion ?? 0),
    queryFn: () =>
      compareGuideVersions(guideId as string, fromVersion as number, toVersion as number),
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    diff: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

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

/** `GET /guides/bookmarked` — `guides.bookmark`. Personal. */
export function useBookmarkedGuides(options: { limit?: number } = {}): UseGuideListResult {
  const limit = clampGuideLimit(options.limit);
  return useGuideCardPages(
    guideKeys.bookmarked(),
    (cursor) => fetchBookmarkedGuides({ limit, cursor: cursor ?? undefined }),
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
  void client.invalidateQueries({ queryKey: ['guides', 'search'] });
  void client.invalidateQueries({ queryKey: ['guides', 'shelf'] });
  void client.invalidateQueries({ queryKey: ['guides', 'mine'] });
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
      void client.invalidateQueries({ queryKey: ['guides', 'mine'] });
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
      void client.invalidateQueries({ queryKey: ['guides', 'tags'] });
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
    onSuccess: (guide) => {
      client.setQueryData(guideKeys.guide(guide.guideId), guide);
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
        queryKey: ['guides', 'guide', suggestion.guideId, 'suggestions'],
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
