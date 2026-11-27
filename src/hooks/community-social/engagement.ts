// Community social hooks: engagement. ./index.ts is the overview of the whole module.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  communitySocialKeys,
  createBookmark,
  createBookmarkFolder,
  deleteBookmark,
  fetchBookmarkCollections,
  fetchContentEngagement,
  reactToContent,
  reactToPost,
  shareContent,
  sharePost,
  unreactToContent,
  unreactToPost,
} from '@/lib/api/community-social-api';
import type {
  BookmarkCollectionResponse,
  BookmarkResponse,
  CommunityContentType,
  CommunityReactionKey,
  CreateBookmarkFolderRequest,
  CreateBookmarkRequest,
  CreateShareRequest,
} from '@/types/community-social';
import { invalidateFeeds, invalidatePost, messageFor, shouldRetry } from './shared';
import type { CommentTarget } from './comments';

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
      queryKey: communitySocialKeys.commentThread(target.contentType, target.contentId),
    });
    void client.invalidateQueries({
      queryKey: communitySocialKeys.engagement(target.contentType, target.contentId),
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

export function useContentEngagement(contentType: CommunityContentType, contentId: string | null) {
  return useQuery({
    queryKey: communitySocialKeys.engagement(contentType, contentId),
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
