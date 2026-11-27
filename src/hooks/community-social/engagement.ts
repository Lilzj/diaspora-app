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

  // Each request carries the content it is about, and is invalidated as that
  // content, so a request still in flight when its row is handed other content
  // lands where it was sent.
  const mutation = useMutation({
    mutationFn: ({ about, reactionKey, on }: { about: CommentTarget; reactionKey: CommunityReactionKey; on: boolean }) => {
      if (about.contentType === 'post') {
        return on ? reactToPost(about.contentId, reactionKey) : unreactToPost(about.contentId, reactionKey);
      }
      return on
        ? reactToContent(about.contentType, about.contentId, reactionKey)
        : unreactToContent(about.contentType, about.contentId, reactionKey);
    },
    retry: false,
    onSuccess: (_answer, { about }) => {
      if (about.contentType === 'post') {
        invalidatePost(client, about.contentId);
        return;
      }
      void client.invalidateQueries({
        queryKey: communitySocialKeys.commentThread(about.contentType, about.contentId),
      });
      void client.invalidateQueries({
        queryKey: communitySocialKeys.engagement(about.contentType, about.contentId),
      });
    },
  });

  // ── What it reports belongs to what it was asked about ──────────────────────
  //
  // Posts and comments are drawn by lists that recycle their rows (FlashList,
  // FARCH-004), which hand a row's hook the next post while the last one's
  // reaction may still be pending, or may have failed. Reported for the
  // content in front of the member only, so a row never shows a spinner or an
  // error for something it was not asked to do.
  const mine = isAbout(mutation.variables?.about, target);

  return {
    react: async (reactionKey) => {
      await mutation.mutateAsync({ about: target, reactionKey, on: true });
    },
    unreact: async (reactionKey) => {
      await mutation.mutateAsync({ about: target, reactionKey, on: false });
    },
    isPending: mine && mutation.isPending,
    error: mine ? messageFor(mutation) : null,
  };
}

/** Whether a request was about the content in front of the member. */
function isAbout(asked: CommentTarget | undefined, current: CommentTarget): boolean {
  return asked !== undefined && asked.contentType === current.contentType && asked.contentId === current.contentId;
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
export function useBookmark(about?: CommentTarget): {
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
    // Given the content a row shows, only that content's saving and unsaving are
    // reported, for the reason `useReact` gives: a recycled row is handed the
    // next post while the last one's request may still be pending or failed.
    ...(about
      ? {
          isPending:
            (isAbout(saving.variables, about) && saving.isPending) ||
            (isAbout(unsaving.variables, about) && unsaving.isPending),
          error:
            (isAbout(saving.variables, about) ? messageFor(saving) : null) ??
            (isAbout(unsaving.variables, about) ? messageFor(unsaving) : null),
        }
      : {
          isPending: saving.isPending || unsaving.isPending || foldering.isPending,
          error: messageFor(saving) ?? messageFor(unsaving) ?? messageFor(foldering),
        }),
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
