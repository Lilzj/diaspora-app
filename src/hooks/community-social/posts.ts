// Community social hooks: posts. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clampLimit,
  communitySocialKeys,
  createPost,
  cancelPost,
  deletePost,
  fetchAlertCapabilities,
  fetchCommunityCapabilities,
  fetchPostCategories,
  fetchFeed,
  fetchPost,
  fetchPostRevisions,
  fetchTrendingHashtags,
  reactionKeysFor,
  setPostPinned,
  suggestHashtags,
  updatePost,
  votePoll,
  withdrawPost,
} from '@/lib/api/community-social-api';
import type {
  AlertCapabilitiesResponse,
  CommunityCapabilitiesResponse,
  CommunityContentType,
  CommunityFeedKey,
  CommunityPost,
  CommunityReactionKey,
  CreatePostRequest,
  FeedQuery,
  HashtagResponse,
  PollResponse,
  PostRevisionResponse,
  UpdatePostRequest,
} from '@/types/community-social';
import { mapKeys } from '@/lib/api/maps-api';
import { invalidateFeeds, invalidatePost, messageFor, shouldRetry } from './shared';

// ── Capabilities ─────────────────────────────────────────────────────────────

export interface UseCommunityCapabilitiesResult {
  capabilities: CommunityCapabilitiesResponse | null;
  isLoading: boolean;
  error: string | null;
  /** The reaction keys this deployment offers for a given content type. */
  reactionsFor: (contentType: CommunityContentType) => CommunityReactionKey[];
}

/**
 * What this deployment actually offers.
 *
 * Long-lived on purpose: reaction keys, feed keys and report reasons are
 * deployment configuration and do not change while a member is holding the
 * phone. An hour's `staleTime` is the difference between one request per session
 * and one per screen.
 *
 * Every picker in this module should be built from this rather than from a
 * constant, so that a reaction the platform adds appears without a release and a
 * reason it removes stops being offered.
 */
export function useCommunityCapabilities(): UseCommunityCapabilitiesResult {
  const query = useQuery({
    queryKey: communitySocialKeys.capabilities(),
    queryFn: fetchCommunityCapabilities,
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });

  const capabilities = query.data ?? null;

  const reactionsFor = useCallback(
    (contentType: CommunityContentType) => reactionKeysFor(capabilities, contentType),
    [capabilities]
  );

  return {
    capabilities,
    isLoading: query.isLoading,
    error: messageFor(query),
    reactionsFor,
  };
}

// ── Feeds ────────────────────────────────────────────────────────────────────

export interface UseCommunityFeedResult {
  posts: CommunityPost[];
  /**
   * What the server said the population is, or null.
   *
   * From `totalAvailable`, which is the feed's own spelling of the count. Null
   * means the server declined to count — it does **not** mean zero, and
   * `posts.length` is the number received rather than the number that exist.
   */
  totalAvailable: number | null;
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
 * One community feed, paged.
 *
 * `getNextPageParam` stops on `hasMore` and never on an empty page — see the
 * header. A feed that answered a bad cursor with page one would otherwise be
 * appended to itself for ever, and the duplicate keys would be the only symptom.
 */
export function useCommunityFeed(
  feedKey: CommunityFeedKey,
  query: FeedQuery = {},
  options: { enabled?: boolean } = {}
): UseCommunityFeedResult {
  const limit = clampLimit(query.limit);

  const infinite = useInfiniteQuery({
    queryKey: communitySocialKeys.feed(feedKey, { ...query, limit }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchFeed(feedKey, { ...query, limit, cursor: pageParam }),
    // `hasMore` and nothing else. A page that came back short is not the last
    // page, and a page that came back full is not proof of another.
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    enabled: options.enabled ?? true,
    // Thirty seconds. A community feed moves in minutes; refetching on every tab
    // focus would be a request per glance.
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });

  const posts = useMemo(
    () => infinite.data?.pages.flatMap((page) => page.items) ?? [],
    [infinite.data]
  );

  return {
    posts,
    // The first page's figure. Later pages restate it and the first one is the
    // one the member's scroll position was established against.
    totalAvailable: infinite.data?.pages[0]?.totalAvailable ?? null,
    isLoading: infinite.isLoading,
    isRefreshing: infinite.isRefetching,
    // Settled, successful and genuinely empty. Not true while loading and not
    // true on failure: an empty feed and a failed feed need different words.
    isEmpty: infinite.isSuccess && posts.length === 0,
    hasMore: infinite.hasNextPage,
    isFetchingMore: infinite.isFetchingNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

// ── One post ─────────────────────────────────────────────────────────────────

export interface UsePostResult {
  post: CommunityPost | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePost(postId: string | null): UsePostResult {
  const query = useQuery({
    queryKey: communitySocialKeys.post(postId ?? ''),
    queryFn: () => fetchPost(postId as string),
    enabled: Boolean(postId),
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });

  return {
    post: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/**
 * A post's edit history.
 *
 * A bare array with no paging, and `changeSummary` on each entry is a
 * **`string[]`** where the edit that produced it sent a `string`. Rendering it
 * as text would print a comma-joined array or, worse, iterate a sentence.
 */
export function usePostRevisions(postId: string | null): {
  revisions: PostRevisionResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: communitySocialKeys.revisions(postId ?? ''),
    queryFn: () => fetchPostRevisions(postId as string),
    enabled: Boolean(postId),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    revisions: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Post mutations ───────────────────────────────────────────────────────────

export function useCreatePost(): {
  createPost: (request: CreatePostRequest) => Promise<CommunityPost>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (request: CreatePostRequest) => createPost(request),
    // Not retried. A post is not idempotent and there is no idempotency key on
    // this route, so a retry after a successful-but-unacknowledged call is a
    // second post the member did not write.
    retry: false,
    onSuccess: (created) => {
      client.setQueryData(communitySocialKeys.post(created.postId), created);
      invalidateFeeds(client);
    },
  });

  return {
    createPost: (request) => mutation.mutateAsync(request),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

export function useUpdatePost(): {
  updatePost: (postId: string, request: UpdatePostRequest) => Promise<CommunityPost>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ postId, request }: { postId: string; request: UpdatePostRequest }) =>
      updatePost(postId, request),
    retry: false,
    onSuccess: (updated) => {
      client.setQueryData(communitySocialKeys.post(updated.postId), updated);
      // The edit created a revision, so the history is stale even though the
      // post itself was returned.
      void client.invalidateQueries({ queryKey: communitySocialKeys.revisions(updated.postId) });
      invalidateFeeds(client);
    },
  });

  return {
    updatePost: (postId, request) => mutation.mutateAsync({ postId, request }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

export function useDeletePost(): {
  deletePost: (postId: string) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    retry: false,
    onSuccess: (_result, postId) => {
      // `data: null` came back, so there is nothing to write. The cached post is
      // removed outright rather than invalidated: refetching it would be a
      // request for something that is gone.
      client.removeQueries({ queryKey: communitySocialKeys.post(postId) });
      invalidateFeeds(client);
    },
  });

  return {
    deletePost: (postId) => mutation.mutateAsync(postId),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/**
 * Withdraw or cancel an alert you wrote — 16 Sep 2026.
 *
 * The post comes back marked, and is cached as it came back: the detail screen
 * must say "withdrawn" straight away rather than after a refetch. Feeds and the
 * map's alerts are invalidated because it has just left both.
 */
export function useClosePost(): {
  withdraw: (postId: string) => Promise<CommunityPost>;
  cancel: (postId: string) => Promise<CommunityPost>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ postId, closure }: { postId: string; closure: 'withdraw' | 'cancel' }) =>
      closure === 'withdraw' ? withdrawPost(postId) : cancelPost(postId),
    retry: false,
    onSuccess: (closed, { postId }) => {
      client.setQueryData(communitySocialKeys.post(postId), closed);
      invalidateFeeds(client);
      void client.invalidateQueries({ queryKey: mapKeys.alertsAll() });
    },
  });

  return {
    withdraw: (postId) => mutation.mutateAsync({ postId, closure: 'withdraw' }),
    cancel: (postId) => mutation.mutateAsync({ postId, closure: 'cancel' }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/**
 * What the signed-in member may publish on the alert map.
 *
 * The composer renders the urgencies this lists and hides the rest — the
 * Emergency option is not shown disabled to somebody who may not choose it,
 * because a control the server will refuse is worse than no control.
 */
export function useAlertCapabilities(enabled = true): {
  capabilities: AlertCapabilitiesResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: communitySocialKeys.alertCapabilities(),
    queryFn: () => fetchAlertCapabilities(),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    capabilities: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/**
 * Pin or unpin a post.
 *
 * Answers **`data: null`**, so there is no updated post to cache and the only
 * correct response is to invalidate. A hook that flipped `isPinned` locally
 * would also have to re-sort the feed, which is the server's decision.
 */
export function usePinPost(): {
  setPinned: (postId: string, pinned: boolean) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ postId, pinned }: { postId: string; pinned: boolean }) =>
      setPostPinned(postId, pinned),
    retry: false,
    onSuccess: (_result, { postId }) => invalidatePost(client, postId),
  });

  return {
    setPinned: (postId, pinned) => mutation.mutateAsync({ postId, pinned }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/**
 * Vote in a post's poll.
 *
 * The answer is the poll's new state, which **may still be entirely null**: a
 * poll with `resultVisibility: 'afterClose'` hides its counts from the member
 * who just voted. `arePollResultsHidden` is what a screen asks before rendering
 * a number, and a 0 rendered from a null here is the defect that check exists
 * to prevent.
 */
export function useVotePoll(): {
  vote: (postId: string, optionIds: string[]) => Promise<PollResponse>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ postId, optionIds }: { postId: string; optionIds: string[] }) =>
      votePoll(postId, optionIds),
    retry: false,
    onSuccess: (_poll, { postId }) => invalidatePost(client, postId),
  });

  return {
    vote: (postId, optionIds) => mutation.mutateAsync({ postId, optionIds }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/**
 * Reactions and comment count on content that does not carry them itself — an
 * official notice. Refreshed by `useReact` after every reaction.
 */
/** The update categories, from the server. They change with deployments, not sessions. */
export function usePostCategories() {
  return useQuery({
    queryKey: communitySocialKeys.postCategories(),
    queryFn: fetchPostCategories,
    staleTime: 60 * 60 * 1000,
  });
}

// ── Discovery ────────────────────────────────────────────────────────────────

/**
 * Hashtag autocomplete.
 *
 * **Disabled until there is a prefix.** `prefix` is *required* on this route —
 * unlike every other filter in this module, absent does not mean "everything",
 * it means **400**. The obvious autocomplete — mount, fetch, then filter as the
 * member types — therefore fails on its first call and shows an error under an
 * empty field.
 */
export function useHashtagSuggestions(
  prefix: string,
  limit?: number | null
): {
  suggestions: HashtagResponse[];
  isLoading: boolean;
  error: string | null;
} {
  const trimmed = prefix.trim();

  const query = useQuery({
    queryKey: communitySocialKeys.hashtagSuggestions(trimmed, limit),
    queryFn: () => suggestHashtags(trimmed, limit),
    // The guard. Not a nicety — a blank prefix is a refusal, not an empty list.
    enabled: trimmed.length > 0,
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  return {
    suggestions: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

/** What is trending, optionally narrowed to one country. No prefix required here. */
export function useTrendingHashtags(
  countryCode?: string | null,
  limit?: number | null
): {
  hashtags: HashtagResponse[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const query = useQuery({
    queryKey: communitySocialKeys.trendingHashtags(countryCode, limit),
    queryFn: () => fetchTrendingHashtags(countryCode, limit),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    hashtags: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}
