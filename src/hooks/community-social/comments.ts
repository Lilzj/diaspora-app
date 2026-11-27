// Community social hooks: comments. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  clampLimit,
  communitySocialKeys,
  createContentComment,
  createPostComment,
  deleteComment,
  fetchContentComments,
  fetchPostComments,
  replyToComment,
  setCommentPinned,
  updateComment,
} from '@/lib/api/community-social-api';
import type {
  CommentResponse,
  CommunityContentType,
  CreateCommentRequest,
} from '@/types/community-social';
import { invalidatePost, messageFor, shouldRetry } from './shared';

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
        queryKey: communitySocialKeys.commentThread(target.contentType, target.contentId),
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
        queryKey: communitySocialKeys.commentThread(target.contentType, target.contentId),
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
        queryKey: communitySocialKeys.commentThread(target.contentType, target.contentId),
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
        queryKey: communitySocialKeys.commentThread(target.contentType, target.contentId),
      });
    },
  });

  return {
    setPinned: (commentId, pinned) => mutation.mutateAsync({ commentId, pinned }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}
