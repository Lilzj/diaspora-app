// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community social-graph hooks (Remediation Wave D-2)
//
// The stable interface over `lib/community-social-api.ts`. A screen calls
// `useCommunityFeed('home')` and receives posts; it never builds a query key,
// never decodes a cursor and never decides what a mutation invalidates.
//
// **No screen is wired to these yet.** That is deliberate and is the next task:
// this wave delivers the API layer a screen can adopt, tested against a
// development handler written from the backend's contract rather than from this
// client's expectations.
//
// ── Where an infinite query is honest, and where it is not ───────────────────
//
// **Two routes are genuinely cursor-paged** and get `useInfiniteQuery`:
// `GET /community/feeds/{feedKey}` and the two comment-thread routes. Both
// return a `nextCursor` and a `hasMore`, and both accept the cursor back.
//
// **The moderation queue is not**, despite accepting `cursor` and `limit`. It
// answers with a bare array and no cursor in it, beside it or in `meta`, so
// there is nothing to send as the next page and no signal that a next page
// exists. `useModerationQueue` is therefore a plain query with no `loadMore`,
// and the absence is a finding rather than an oversight — see
// `fetchModerationQueue` for what its `limit` actually bounds.
//
// ── Why paging stops on `hasMore` and never on an empty page ─────────────────
//
// **A malformed cursor comes back as page one at HTTP 200.** Not a 400. So a
// stale, truncated or hand-edited cursor silently re-serves the first page, and
// an infinite query that decided "keep going until a page is empty" would append
// the first page to itself for ever. `getNextPageParam` below returns
// `undefined` — TanStack's "there is no next page" — the moment `hasMore` is
// false, and never inspects the row count.
//
// ── Why nothing here is optimistic ───────────────────────────────────────────
//
// Three of the write paths in this module answer with **`data: null`**: delete a
// post, pin a post, pin a comment. There is no returned record to write into the
// cache, so those are invalidations by necessity.
//
// The reaction routes *do* answer with the new tally, and they are still
// invalidated rather than written: the tally hangs off a post under the name
// `reactions` and off the reaction response under the name `summary`, and a
// cache write that reached for the wrong one would blank a card's reactions
// until the next refetch. `readReactionSummary` exists so that a screen doing
// its own optimistic update can do it correctly; the hooks take the safe route.
//
// Deleting a comment is the sharpest case: the comment is **not removed** from
// the thread. It comes back tombstoned with an empty body so its replies keep
// their parent. A hook that spliced it out of the cached tree would take its
// replies with it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  clampLimit,
  communityErrorMessage,
  communitySocialKeys,
  createBookmark,
  createBookmarkFolder,
  createContentComment,
  createPost,
  createPostComment,
  deleteBookmark,
  deleteComment,
  cancelPost,
  deletePost,
  ensureNotFollowing,
  fetchAlertCapabilities,
  fetchBookmarkCollections,
  fetchCommunityCapabilities,
  fetchContentComments,
  fetchContentEngagement,
  fetchPostCategories,
  fetchFeed,
  fetchModerationHistory,
  fetchModerationQueue,
  fetchPost,
  fetchPostComments,
  fetchPostRevisions,
  fetchReportReasons,
  fetchTrendingHashtags,
  followTarget,
  reactToContent,
  reactToPost,
  reactionKeysFor,
  replyToComment,
  reportContent,
  setCommentPinned,
  setPostPinned,
  shareContent,
  sharePost,
  submitModerationDecision,
  suggestHashtags,
  unreactToContent,
  unreactToPost,
  updateComment,
  updatePost,
  votePoll,
  withdrawPost,
  fetchFollowState,
} from '@/lib/community-social-api';
import { useAuthStore } from '@/store/auth';
import type {
  AlertCapabilitiesResponse,
  BookmarkCollectionResponse,
  BookmarkResponse,
  CommentResponse,
  CommunityCapabilitiesResponse,
  CommunityContentType,
  CommunityFeedKey,
  CommunityPostResponse,
  CommunityReactionKey,
  CreateBookmarkFolderRequest,
  CreateBookmarkRequest,
  CreateCommentRequest,
  CreateModerationDecisionRequest,
  CreatePostRequest,
  CreateReportRequest,
  CreateShareRequest,
  FeedQuery,
  FollowTargetType,
  HashtagSuggestionResponse,
  ModerationDecisionResponse,
  ModerationQueueItemResponse,
  ModerationQueueQuery,
  PollResponse,
  PostRevisionResponse,
  ReportReasonResponse,
  TrendingHashtagResponse,
  UpdatePostRequest,
} from '@/types/community-social';

/**
 * A 401 from this module is "sign in", not "try again".
 *
 * Three attempts to be told the same thing is three round trips and a spinner
 * that resolves into an error for a member whose actual problem is that they are
 * signed out. A 404 is equally final — the post is gone.
 */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const httpStatus = (cause as { response?: { status?: number } })?.response?.status;
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) return false;
  return failureCount < 1;
}

/** A sentence for the member, or null. */
function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? communityErrorMessage(query.error) : null;
}

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
  posts: CommunityPostResponse[];
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
  post: CommunityPostResponse | null;
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

// ── Comment threads ──────────────────────────────────────────────────────────

export interface UseCommentThreadResult {
  /**
   * The top-level comments, as a tree.
   *
   * Replies hang off each node under `replies`, all the way down; nothing here
   * flattens them, because the indent a screen draws comes from `renderedDepth`
   * and the tree is what a "collapse" control needs. `flattenComments` in the
   * client is the flattener when a list needs one.
   *
   * **Deleted comments are in here**, with `isTombstoned: true` and an empty
   * `body`. They are delivered rather than omitted so their replies keep a
   * parent; `commentBodyText` is what renders one.
   */
  comments: CommentResponse[];
  /** Top-level comments the server says exist. Not the number of replies. */
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * The shared body of the two comment-thread hooks.
 *
 * One implementation because the two routes are one contract: the post route is
 * a convenience over `content/post/{id}`, and they answer the identical
 * `CommentThreadResponse`.
 */
function useCommentThread(
  contentType: CommunityContentType,
  contentId: string | null,
  fetchPage: (cursor: string | null, limit: number) => Promise<import('@/types/community-social').CommentThreadResponse>,
  limitInput: number | null | undefined,
  enabled: boolean
): UseCommentThreadResult {
  const limit = clampLimit(limitInput);

  const infinite = useInfiniteQuery({
    queryKey: communitySocialKeys.commentsFor(contentType, contentId ?? '', limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage(pageParam, limit),
    // Same rule as the feed. A malformed cursor is page one at 200, so an empty
    // page is not the stop condition and a full one is not a promise.
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
    enabled: enabled && Boolean(contentId),
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });

  const comments = useMemo(
    // `comments`, not `items`. This response is not a `CursorPagedResult` and
    // `readPage` would have found no rows on it at all.
    () => infinite.data?.pages.flatMap((page) => page.comments) ?? [],
    [infinite.data]
  );

  return {
    comments,
    totalCount: infinite.data?.pages[0]?.totalCount ?? null,
    isLoading: infinite.isLoading,
    isEmpty: infinite.isSuccess && comments.length === 0,
    hasMore: infinite.hasNextPage,
    isFetchingMore: infinite.isFetchingNextPage,
    error: messageFor(infinite),
    loadMore: () => {
      if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
    },
    refresh: () => void infinite.refetch(),
  };
}

/** The comments on a post. */
export function usePostComments(
  postId: string | null,
  options: { limit?: number | null; enabled?: boolean } = {}
): UseCommentThreadResult {
  const fetchPage = useCallback(
    (cursor: string | null, limit: number) =>
      fetchPostComments(postId as string, { cursor, limit }),
    [postId]
  );

  return useCommentThread('post', postId, fetchPage, options.limit, options.enabled ?? true);
}

/** The comments on anything else — a guide, an event, a listing. */
export function useContentComments(
  contentType: CommunityContentType,
  contentId: string | null,
  options: { limit?: number | null; enabled?: boolean } = {}
): UseCommentThreadResult {
  const fetchPage = useCallback(
    (cursor: string | null, limit: number) =>
      fetchContentComments(contentType, contentId as string, { cursor, limit }),
    [contentType, contentId]
  );

  return useCommentThread(contentType, contentId, fetchPage, options.limit, options.enabled ?? true);
}

// ── Invalidation ─────────────────────────────────────────────────────────────
//
// Two helpers rather than a hand-written list at each mutation, because getting
// this wrong is invisible: a member's own new post that does not appear in the
// feed they posted it from looks like the post failed.

/** Every feed, whatever its key or filters. A new or removed post changes all of them. */
function invalidateFeeds(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: communitySocialKeys.feeds() });
}

/** One post, its revisions, and every feed that could be showing it. */
function invalidatePost(client: QueryClient, postId: string): void {
  void client.invalidateQueries({ queryKey: communitySocialKeys.post(postId) });
  invalidateFeeds(client);
}

// ── Post mutations ───────────────────────────────────────────────────────────

export function useCreatePost(): {
  createPost: (request: CreatePostRequest) => Promise<CommunityPostResponse>;
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
  updatePost: (postId: string, request: UpdatePostRequest) => Promise<CommunityPostResponse>;
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
  withdraw: (postId: string) => Promise<CommunityPostResponse>;
  cancel: (postId: string) => Promise<CommunityPostResponse>;
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
      void client.invalidateQueries({ queryKey: ['maps', 'alerts'] });
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

// ── Comment mutations ────────────────────────────────────────────────────────

export interface CommentTarget {
  contentType: CommunityContentType;
  contentId: string;
}

/**
 * Post a comment, a reply to content, or a reply to a comment.
 *
 * Three routes, one hook, because a screen has one compose box. Which route is
 * used is decided by whether `parentCommentId` is set — the replies route takes
 * the parent from its path, so the body's `parentCommentId` is stripped by the
 * client rather than sent twice.
 */
export function useCreateComment(target: CommentTarget): {
  comment: (request: CreateCommentRequest) => Promise<CommentResponse>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (request: CreateCommentRequest) => {
      if (request.parentCommentId) {
        return replyToComment(request.parentCommentId, request);
      }
      if (target.contentType === 'post') {
        return createPostComment(target.contentId, request);
      }
      return createContentComment(target.contentType, target.contentId, request);
    },
    retry: false,
    onSuccess: () => {
      // The thread is a tree with counts at every level, so splicing a new node
      // into the cache correctly means knowing where it goes and what it changed
      // — `totalCount`, the parent's `replyCount`, the post's `commentCount`.
      // Refetching one page is cheaper than getting three counters wrong.
      void client.invalidateQueries({
        queryKey: ['community-social', 'comments', target.contentType, target.contentId],
      });
      if (target.contentType === 'post') {
        invalidatePost(client, target.contentId);
      }
    },
  });

  return {
    comment: (request) => mutation.mutateAsync(request),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

export function useUpdateComment(target: CommentTarget): {
  update: (commentId: string, body: string) => Promise<CommentResponse>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateComment(commentId, body),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ['community-social', 'comments', target.contentType, target.contentId],
      });
    },
  });

  return {
    update: (commentId, body) => mutation.mutateAsync({ commentId, body }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/**
 * Delete a comment.
 *
 * **The comment does not leave the thread.** It comes back on the next read with
 * `isTombstoned: true` and an empty `body`, because removing it would orphan its
 * replies — so this invalidates and never splices. A hook that removed the node
 * from the cached tree would take every reply under it off the screen, and they
 * would reappear on the next refetch, which is worse than not removing it at
 * all.
 */
export function useDeleteComment(target: CommentTarget): {
  remove: (commentId: string) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ['community-social', 'comments', target.contentType, target.contentId],
      });
    },
  });

  return {
    remove: (commentId) => mutation.mutateAsync(commentId),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

/** Pin or unpin a comment. Answers `data: null`, so this invalidates. */
export function usePinComment(target: CommentTarget): {
  setPinned: (commentId: string, pinned: boolean) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ commentId, pinned }: { commentId: string; pinned: boolean }) =>
      setCommentPinned(commentId, pinned),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ['community-social', 'comments', target.contentType, target.contentId],
      });
    },
  });

  return {
    setPinned: (commentId, pinned) => mutation.mutateAsync({ commentId, pinned }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

// ── Reactions ────────────────────────────────────────────────────────────────

/**
 * React to, or un-react from, a piece of content.
 *
 * All four routes answer **200** with the new tally — including the two that
 * create a reaction, because a reaction is set membership rather than a
 * resource. Un-reacting to something you never reacted to is a 200, not a 404.
 * That is the opposite of `useFollow`'s unfollow, which **is** a 404, and the
 * two are deliberately not written as one helper.
 *
 * The post routes are used when the target is a post: they and the generic
 * content routes are equivalent, and using the specific one keeps the request in
 * the server's own logs under the shape the module expects.
 */
export function useReact(target: CommentTarget): {
  react: (reactionKey: CommunityReactionKey) => Promise<void>;
  unreact: (reactionKey: CommunityReactionKey) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const invalidate = useCallback(() => {
    if (target.contentType === 'post') {
      invalidatePost(client, target.contentId);
      return;
    }
    void client.invalidateQueries({
      queryKey: ['community-social', 'comments', target.contentType, target.contentId],
    });
    void client.invalidateQueries({
      queryKey: ['community-social', 'engagement', target.contentType, target.contentId],
    });
  }, [client, target.contentType, target.contentId]);

  const mutation = useMutation({
    mutationFn: ({ reactionKey, on }: { reactionKey: CommunityReactionKey; on: boolean }) => {
      if (target.contentType === 'post') {
        return on ? reactToPost(target.contentId, reactionKey) : unreactToPost(target.contentId, reactionKey);
      }
      return on
        ? reactToContent(target.contentType, target.contentId, reactionKey)
        : unreactToContent(target.contentType, target.contentId, reactionKey);
    },
    retry: false,
    onSuccess: invalidate,
  });

  return {
    react: async (reactionKey) => {
      await mutation.mutateAsync({ reactionKey, on: true });
    },
    unreact: async (reactionKey) => {
      await mutation.mutateAsync({ reactionKey, on: false });
    },
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
    queryKey: ['community-social', 'post-categories'],
    queryFn: fetchPostCategories,
    staleTime: 60 * 60 * 1000,
  });
}

export function useContentEngagement(contentType: CommunityContentType, contentId: string | null) {
  return useQuery({
    queryKey: ['community-social', 'engagement', contentType, contentId],
    queryFn: () => fetchContentEngagement(contentType, contentId as string),
    enabled: Boolean(contentId),
    staleTime: 30 * 1000,
  });
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export function useBookmarkCollections(): {
  collections: BookmarkCollectionResponse[];
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
} {
  const query = useQuery({
    queryKey: communitySocialKeys.bookmarkCollections(),
    queryFn: fetchBookmarkCollections,
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });

  const collections = query.data ?? [];

  return {
    collections,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && collections.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/**
 * Save and un-save.
 *
 * **These are not `/api/v1/bookmarks`.** That prefix is a separate Bookmarks
 * module with its own folders and identifiers, and nothing saved here appears
 * there. Both surfaces exist; a screen has to choose one and say which.
 *
 * There is no route that moves a bookmark between folders, so the folder is
 * chosen at save time and is not editable afterwards.
 */
export function useBookmark(): {
  save: (request: CreateBookmarkRequest) => Promise<BookmarkResponse>;
  unsave: (contentType: CommunityContentType, contentId: string) => Promise<void>;
  createFolder: (request: CreateBookmarkFolderRequest) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const invalidate = useCallback(() => {
    void client.invalidateQueries({ queryKey: communitySocialKeys.bookmarkCollections() });
    // `isBookmarked` and `bookmarkCount` live on the post.
    invalidateFeeds(client);
  }, [client]);

  const saving = useMutation({
    mutationFn: (request: CreateBookmarkRequest) => createBookmark(request),
    retry: false,
    onSuccess: invalidate,
  });

  const unsaving = useMutation({
    mutationFn: ({ contentType, contentId }: CommentTarget) =>
      deleteBookmark(contentType, contentId),
    retry: false,
    onSuccess: invalidate,
  });

  const foldering = useMutation({
    mutationFn: (request: CreateBookmarkFolderRequest) => createBookmarkFolder(request),
    retry: false,
    onSuccess: invalidate,
  });

  return {
    save: (request) => saving.mutateAsync(request),
    unsave: async (contentType, contentId) => {
      await unsaving.mutateAsync({ contentType, contentId });
    },
    createFolder: async (request) => {
      await foldering.mutateAsync(request);
    },
    isPending: saving.isPending || unsaving.isPending || foldering.isPending,
    error: messageFor(saving) ?? messageFor(unsaving) ?? messageFor(foldering),
  };
}

// ── Shares ───────────────────────────────────────────────────────────────────

/**
 * Record a share.
 *
 * **`quotePostId` on the answer is always null.** `kind: 'quote'` records the
 * share and creates no post, on every deployment, despite both contracts
 * documenting one. This hook does not expose the field, so a screen cannot
 * accidentally navigate to it.
 */
export function useShare(): {
  share: (target: CommentTarget, request: CreateShareRequest) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ target, request }: { target: CommentTarget; request: CreateShareRequest }) =>
      target.contentType === 'post'
        ? sharePost(target.contentId, request)
        : shareContent(target.contentType, target.contentId, request),
    retry: false,
    onSuccess: (_share, { target }) => {
      if (target.contentType === 'post') invalidatePost(client, target.contentId);
    },
  });

  return {
    share: async (target, request) => {
      await mutation.mutateAsync({ target, request });
    },
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

// ── Follows ──────────────────────────────────────────────────────────────────

/**
 * Follow, unfollow and mute.
 *
 * Two traps, both surfaced in the signature:
 *
 *   * **`muted` is required on `follow`.** The server applies
 *     `SetMuted(request.Muted)` unconditionally and an absent body deserialises
 *     to `false`, so "follow" on something already followed-and-muted un-mutes
 *     it. There is no safe default for this hook to supply, so the caller says.
 *   * **`unfollow` uses the idempotent form.** The raw route answers **404**
 *     when there was no follow to remove, which would surface to a member as an
 *     error for an action that achieved exactly what they asked for.
 *     `ensureNotFollowing` swallows that one failure and nothing else.
 */
/**
 * Whether the signed-in member follows `userId`, from the server
 * (`GET /community/follows/{id}`). Since 20 Oct 2026; every Follow button was
 * seeded from a guess before.
 */
export function useFollowState(userId: string | undefined) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return useQuery({
    queryKey: ['community-social', 'follow-state', userId ?? ''],
    queryFn: () => fetchFollowState(userId!),
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 30_000,
  });
}

export function useFollow(): {
  follow: (
    targetId: string,
    options?: { targetType?: FollowTargetType | null; muted?: boolean }
  ) => Promise<void>;
  unfollow: (targetId: string, targetType?: FollowTargetType | null) => Promise<void>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const following = useMutation({
    mutationFn: ({
      targetId,
      targetType,
      muted,
    }: {
      targetId: string;
      targetType?: FollowTargetType | null;
      muted: boolean;
    }) => followTarget(targetId, { targetType, muted }),
    retry: false,
    onSuccess: () => {
      invalidateFeeds(client);
      void client.invalidateQueries({ queryKey: ['community-social', 'follow-state'] });
    },
  });

  const unfollowing = useMutation({
    mutationFn: ({
      targetId,
      targetType,
    }: {
      targetId: string;
      targetType?: FollowTargetType | null;
    }) => ensureNotFollowing(targetId, targetType),
    retry: false,
    onSuccess: () => {
      invalidateFeeds(client);
      void client.invalidateQueries({ queryKey: ['community-social', 'follow-state'] });
    },
  });

  return {
    follow: async (targetId, options = {}) => {
      await following.mutateAsync({
        targetId,
        targetType: options.targetType,
        // Explicit. `muted: false` is what the server would have applied anyway
        // for an absent body — stating it here is what makes that visible at the
        // call site rather than a surprise in the handler.
        muted: options.muted ?? false,
      });
    },
    unfollow: async (targetId, targetType) => {
      await unfollowing.mutateAsync({ targetId, targetType });
    },
    isPending: following.isPending || unfollowing.isPending,
    error: messageFor(following) ?? messageFor(unfollowing),
  };
}

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
 * server never populates it — so a history list identifies decisions by action
 * and time, or not at all.
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

export function useModerationDecision(): {
  decide: (request: CreateModerationDecisionRequest) => Promise<ModerationDecisionResponse>;
  isPending: boolean;
  error: string | null;
} {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (request: CreateModerationDecisionRequest) => submitModerationDecision(request),
    retry: false,
    onSuccess: (_decision, request) => {
      void client.invalidateQueries({ queryKey: communitySocialKeys.moderationQueue() });
      void client.invalidateQueries({
        queryKey: communitySocialKeys.moderationHistory(request.contentType, request.contentId),
      });
      // A removal or a restore changes what the feeds contain.
      invalidateFeeds(client);
    },
  });

  return {
    decide: (request) => mutation.mutateAsync(request),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
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
  suggestions: HashtagSuggestionResponse[];
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
  hashtags: TrendingHashtagResponse[];
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
