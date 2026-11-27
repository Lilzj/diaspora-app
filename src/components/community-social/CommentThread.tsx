// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The comment thread (Wave D-2b)
//
// One component for every comment thread in the application, because the two
// routes behind it are one contract: `/posts/{id}/comments` is a convenience
// over `/content/{contentType}/{id}/comments` and both answer the identical
// `CommentThreadResponse`.
//
// ── The four properties this component exists to honour ─────────────────────
//
// **1. A deleted comment is delivered, not omitted.** It arrives with
// `isTombstoned: true` and an **empty `body`** — the empty string, not a
// sentence — because removing it would orphan its replies. So nothing here
// filters on `isTombstoned`, and the words in the tombstone's place come from
// `commentBodyText` rather than from the wire. A thread that dropped tombstones
// would renumber every reply beneath them and lose whole sub-arguments.
//
// **2. Indent by `renderedDepth`, never by `depth`.** `depth` is the true depth
// and is unbounded; `renderedDepth` is `min(depth, 6)`. A hundred-reply
// argument indented by `depth` walks off the side of the phone at about the
// fifth reply and never comes back.
//
// **3. The rows are `comments`, not `items`.** `CommentThreadResponse` is not a
// `CursorPagedResult` — `platform-envelope.ts`'s `readPage` would find no rows
// on it at all and return an empty page **with no error**, so every thread in
// the application would say "no comments yet". The hook is what reads the right
// field; this component never touches the envelope.
//
// **4. Paging stops on `hasMore`.** A malformed cursor comes back as page one
// at HTTP 200, so "keep going until a page is empty" would append the first
// page to itself for ever. `loadMore` is the hook's, and it already knows.
//
// ── What this component cannot do ────────────────────────────────────────────
//
// **It cannot name an author.** `CommentResponse` carries `authorId` and no
// display name, and there is no route in `Diaspora.Modules.Community` that
// resolves one. Rather than print a GUID or invent a name, the default is the
// honest "Community member" and a screen that *can* resolve names passes
// `authorNameFor`. There is also no mentions route, so `@` in a body is text.
//
// ── The rows of the screen's own list (FARCH-004, 27 Nov 2026) ───────────────
//
// The thread drew its comments with `.map()` inside the screen's ScrollView, so
// nothing was virtualised: every comment of every page a member loaded stayed
// mounted, each with its avatar and its reaction bar. A list inside a ScrollView
// cannot be virtualised, so the screen's scroll view is a FlashList now. The
// screen's content is its header, the top-level comments are its rows, and
// `useCommentThreadList` hands the screen what the thread draws around them:
// the compose box above the rows (`CommentThreadComposer`), what it says in
// their place (loading, could not load, no comments, through `ListState`), and
// "Load more comments" with the count below them. A row is a top-level comment
// with its replies inside it, as before: a reply sits inside its parent's card,
// which one row per reply could not draw.
//
// FlashList hands a row that scrolls away the next comment instead of mounting
// another, so nothing a row shows may belong to the comment it drew before:
//
//   * which reply box is open, what has been typed into each, and which threads
//     are collapsed belong to the thread, keyed by comment;
//   * a reaction request's pending and error show only on the comment it was
//     sent for;
//   * the avatar is keyed to its photograph, so a recycled row never shows the
//     last author's face while the next one's loads.
//
// The row with an open reply box is an item type of its own, so its cell is
// never handed to another comment: a member who scrolls while writing a reply
// is still typing into it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { FlashListRef, ListRenderItemInfo } from '@shopify/flash-list';

import { COMMENT_BODY_MAX_LENGTH, commentBodyText } from '@/lib/api/community-social-api';
import {
  useCommunityCapabilities,
  useCreateComment,
  useReact,
  type CommentTarget,
  type UseCommentThreadResult,
} from '@/hooks/community-social';
import type { CommentResponse, CommunityReactionKey } from '@/types/community-social';
import { Skeleton } from '@/components/Skeleton';
import { Avatar } from '@/components/Avatar';

import { ReactionBar } from './ReactionBar';
import { relativeTime } from './labels';
import { useAuthStore } from '@/store/auth';

/** Pixels of indent per level of `renderedDepth`. Six levels, capped by the server. */
const INDENT_STEP = 14;

/** Stable, so a thread drawing no rows hands the list the same empty array every render. */
const NO_COMMENTS: CommentResponse[] = [];

const commentKey = (comment: CommentResponse) => comment.commentId;

/** The top-level comment whose row holds `commentId`: the comment itself, or the one its reply chain hangs from. */
function rowHolding(comments: readonly CommentResponse[], commentId: string | null): string | null {
  if (commentId === null) return null;
  const holds = (node: CommentResponse): boolean => node.commentId === commentId || node.replies.some(holds);
  return comments.find(holds)?.commentId ?? null;
}

interface CommentThreadListOptions {
  target: CommentTarget;
  thread: UseCommentThreadResult;
  /**
   * The content's author, so their own comments can be badged. Optional because
   * only some surfaces know it.
   */
  contentAuthorId?: string | null;
  /** A screen that can resolve display names supplies one, stable between renders. See the header. */
  authorNameFor?: (authorId: string) => string | null;
  onReport?: (commentId: string) => void;
  /** The screen's side margin. The rows are the list's, outside the screen's padded views, so each keeps it. */
  inset?: number;
  /** True while the screen has nothing to discuss, as an update whose post has not loaded: no rows, no states. */
  hidden?: boolean;
}

/** The ref of a screen's list whose rows are a thread's comments, for a screen that scrolls it. */
export type CommentListRef = FlashListRef<CommentResponse>;

/** What a screen's list takes from its thread. */
export interface CommentThreadList {
  /** Spread onto the screen's FlashList: the top-level comments are its rows. */
  list: {
    data: readonly CommentResponse[];
    keyExtractor: (comment: CommentResponse) => string;
    renderItem: (info: ListRenderItemInfo<CommentResponse>) => React.ReactElement;
    getItemType: (comment: CommentResponse) => string;
  };
  /** For `CommentThreadComposer`, at the foot of the list's header. */
  composer: CommentThreadComposerProps;
  /** For a `ListState` in the list's empty slot: loading, could not load, or no comments, in the thread's own look. */
  states: {
    loading: boolean;
    skeleton: React.ReactElement;
    error: React.ReactElement | null;
    children: React.ReactElement | null;
  };
  /** For the list's footer: "Load more comments" and the count, under the rows. */
  footer: React.ReactElement | null;
}

/**
 * The thread, for a screen that draws it as the rows of its own FlashList.
 *
 * Everything a row reads from the thread is one memoised object, so the row
 * renderer changes only when one of those things does. Scrolling, and typing in
 * the compose box, leave the rows alone.
 */
/**
 * What has been typed under each comment, by comment.
 *
 * Held outside React state and read per comment, so a keystroke redraws only
 * the comment being replied to. As state on the thread it redrew every row in
 * view on every keystroke; as state on the row, a recycled row would have
 * shown the last comment's draft. Keyed by comment, a draft also survives its
 * row scrolling away.
 */
interface ReplyDrafts {
  read: (commentId: string) => string;
  write: (commentId: string, text: string) => void;
  subscribe: (listener: () => void) => () => void;
}

function createReplyDrafts(): ReplyDrafts {
  const drafts = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    read: (commentId) => drafts.get(commentId) ?? '',
    write: (commentId, text) => {
      drafts.set(commentId, text);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useCommentThreadList({
  target,
  thread,
  contentAuthorId = null,
  authorNameFor,
  onReport,
  inset = 0,
  hidden = false,
}: CommentThreadListOptions): CommentThreadList {
  const { capabilities } = useCommunityCapabilities();
  const composer = useCreateComment(target);

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDrafts] = useState(createReplyDrafts);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // The live figure when capabilities have resolved, and the constant until
  // then. A compose box with no counter for the first second is a compose box a
  // member types four hundred characters into before it appears.
  //
  // This read `capabilities?.limits.commentBodyMaxLength` and threw. The optional
  // chain guarded `capabilities` and not `limits`, and the server has never sent
  // a `limits` object -- the client invented it -- so the moment the query
  // resolved, every guide and every update crashed on reading a property of
  // `undefined`. The `?.` made it look guarded, which is why it survived review.
  const maxLength = capabilities?.maxCommentLength ?? COMMENT_BODY_MAX_LENGTH;

  // The post call, the refetch and the screen's report handler are new functions
  // on every render. Read from here, they leave the rows' renderer as it was: a
  // member acts after the render that set them, so this is always the latest.
  const latest = useRef({ comment: composer.comment, refresh: thread.refresh, onReport });
  useLayoutEffect(() => {
    latest.current = { comment: composer.comment, refresh: thread.refresh, onReport };
  });

  const submit = useCallback(async (body: string, parentCommentId: string | null) => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;

    // `contentType` and `contentId` are on `CreateCommentRequest` and are
    // ignored by every route that carries the target in its path — which is
    // all three. The client strips them; nothing here populates them.
    await latest.current.comment({ body: trimmed, parentCommentId });
  }, []);

  const postComment = useCallback((body: string) => submit(body, null), [submit]);
  const refresh = useCallback(() => latest.current.refresh(), []);
  const report = useCallback((commentId: string) => latest.current.onReport?.(commentId), []);
  const canReport = onReport !== undefined;

  const toggleCollapse = useCallback((commentId: string) => {
    setCollapsed((current) => ({ ...current, [commentId]: !current[commentId] }));
  }, []);


  const shared = useMemo<CommentNodeShared>(
    () => ({
      contentAuthorId,
      authorNameFor,
      collapsed,
      onToggleCollapse: toggleCollapse,
      replyTo,
      onSetReplyTo: setReplyTo,
      replyDrafts,
      onSubmitReply: submit,
      isReplyPending: composer.isPending,
      maxLength,
      onReport: canReport ? report : undefined,
      onChanged: refresh,
    }),
    [
      contentAuthorId,
      authorNameFor,
      collapsed,
      toggleCollapse,
      replyTo,
      replyDrafts,
      submit,
      composer.isPending,
      maxLength,
      canReport,
      report,
      refresh,
    ]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CommentResponse>) => (
      <View style={{ paddingHorizontal: inset }}>
        <CommentNode comment={item} indentFrom={0} shared={shared} />
      </View>
    ),
    [inset, shared]
  );

  // The row with the open reply box keeps its cell: no other comment has its
  // item type, so FlashList never recycles it into one.
  const replyRow = useMemo(() => rowHolding(thread.comments, replyTo), [thread.comments, replyTo]);
  const getItemType = useCallback(
    (comment: CommentResponse) => (comment.commentId === replyRow ? 'replying' : 'comment'),
    [replyRow]
  );

  // Loading, the error and the empty thread are each drawn *instead of* the
  // rows, as they always were: a failed refetch or next page says so in their
  // place.
  const drawsRows = !hidden && !thread.isLoading && !thread.error && !thread.isEmpty;

  return {
    list: { data: drawsRows ? thread.comments : NO_COMMENTS, keyExtractor: commentKey, renderItem, getItemType },
    composer: { maxLength, isPending: composer.isPending, error: composer.error, onPost: postComment },
    states: {
      loading: !hidden && thread.isLoading,
      skeleton: <ThreadLoading />,
      error: !hidden && thread.error ? <ThreadError message={thread.error} onRetry={thread.refresh} /> : null,
      children: !hidden && thread.isEmpty ? <ThreadEmpty /> : null,
    },
    footer: drawsRows ? <ThreadFooter thread={thread} /> : null,
  };
}

export interface CommentThreadComposerProps {
  maxLength: number;
  isPending: boolean;
  error: string | null;
  /** Posts a top-level comment, and rejects when the post fails. */
  onPost: (body: string) => Promise<void>;
}

/**
 * The compose box the thread draws above its comments.
 *
 * A screen draws it at the foot of its list's header, outside the recycled
 * rows, so the box is never handed to a comment and keeps its focus. The words
 * are its own state: a keystroke redraws this box and nothing else.
 */
export function CommentThreadComposer({ maxLength, isPending, error, onPost }: CommentThreadComposerProps) {
  const [draft, setDraft] = useState('');

  const postTopLevel = useCallback(async () => {
    const body = draft;
    setDraft('');
    try {
      await onPost(body);
    } catch {
      // Put the words back. A failed post that also ate the paragraph is two
      // losses for one failure, and `error` is already saying why.
      setDraft(body);
    }
  }, [draft, onPost]);

  return (
    <View className="bg-surface-card p-3.5 rounded-2xl border border-subtle mb-4">
      <TextInput
        accessible
        accessibilityLabel="Write a comment"
        placeholder="Share your thoughts or ask a question…"
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={maxLength}
        className="text-xs p-2 bg-surface-background rounded-xl border border-faint min-h-[50px] text-content-strong font-semibold"
      />
      <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-faint">
        <Text className="text-[10px] text-content-faint font-semibold">
          {draft.length}/{maxLength}
        </Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          accessibilityState={{ disabled: draft.trim().length === 0 || isPending }}
          disabled={draft.trim().length === 0 || isPending}
          onPress={() => void postTopLevel()}
          className={`px-4 py-2 rounded-xl ${
            draft.trim().length === 0 || isPending ? 'bg-surface-muted' : 'bg-primary-500'
          }`}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Text
              className={`text-[10px] font-black ${
                draft.trim().length === 0 ? 'text-content-faint' : 'text-white'
              }`}
            >
              Post comment
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <Text className="text-[10px] font-bold text-error-default mt-2">{error}</Text>
      ) : null}
    </View>
  );
}

/** Three cards where the comments will be, read out as one "Loading comments". */
function ThreadLoading() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading comments">
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[0, 1, 2].map((row) => (
          <View key={row} className="bg-surface-background rounded-2xl p-4 mb-3 border border-faint">
            <Skeleton width="35%" height={12} className="mb-2" />
            <Skeleton width="90%" height={14} className="mb-1.5" />
            <Skeleton width="60%" height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

function ThreadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="bg-surface-background rounded-2xl p-4 border border-faint items-center">
      <Text className="text-xs font-bold text-content-strong">
        We could not load the discussion
      </Text>
      <Text className="text-[11px] text-content-muted text-center mt-1 leading-relaxed">
        {message}
      </Text>
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel="Try loading the comments again"
        onPress={onRetry}
        className="mt-3 bg-primary-500 px-4 py-2 rounded-xl"
      >
        <Text className="text-[10px] font-black text-white">Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * An empty thread renders as empty. The screen this replaced could not reach
 * this state, because it had fixtures to fall back on.
 */
function ThreadEmpty() {
  return (
    <View className="bg-surface-background rounded-2xl p-5 border border-faint items-center">
      <Text className="text-2xl mb-1">💬</Text>
      <Text className="text-xs font-bold text-content-strong">No comments yet</Text>
      <Text className="text-[11px] text-content-muted text-center mt-1 leading-relaxed">
        Be the first to add something.
      </Text>
    </View>
  );
}

/** Under the rows: the next page, asked for with a button, and how many comments there are. */
function ThreadFooter({ thread }: { thread: UseCommentThreadResult }) {
  return (
    <>
      {thread.hasMore ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Load more comments"
          accessibilityState={{ disabled: thread.isFetchingMore }}
          disabled={thread.isFetchingMore}
          onPress={thread.loadMore}
          className="bg-surface-card border border-subtle rounded-2xl py-3 items-center mt-1"
        >
          {thread.isFetchingMore ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Text className="text-[11px] font-black text-content-secondary">
              Load more comments
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* `totalCount` counts **top-level** comments, not replies — a page of
          twenty can carry a hundred rows. Saying which is what stops the
          figure reading as a contradiction of what is on screen. */}
      {thread.totalCount !== null ? (
        <Text className="text-[10px] font-bold text-content-faint mt-3 text-center">
          {thread.totalCount} {thread.totalCount === 1 ? 'comment' : 'comments'} on this thread
        </Text>
      ) : null}
    </>
  );
}

/**
 * What every comment reads from its thread, as one object: `useCommentThreadList`
 * memoises it, and a change to any of it redraws the rows.
 */
interface CommentNodeShared {
  contentAuthorId: string | null;
  authorNameFor?: (authorId: string) => string | null;
  collapsed: Readonly<Record<string, boolean>>;
  onToggleCollapse: (commentId: string) => void;
  replyTo: string | null;
  onSetReplyTo: (commentId: string | null) => void;
  /** What has been typed under each comment, by comment: a recycled row must not show the last one's. */
  replyDrafts: ReplyDrafts;
  onSubmitReply: (body: string, parentCommentId: string) => Promise<void>;
  isReplyPending: boolean;
  maxLength: number;
  /** Absent where the screen offers no report. */
  onReport?: (commentId: string) => void;
  onChanged: () => void;
}

interface CommentNodeProps {
  comment: CommentResponse;
  /**
   * The `renderedDepth` of the node this one is drawn inside.
   *
   * The indent is the **difference**, not the absolute depth, because replies
   * are nested inside their parent's view and an absolute margin would compound
   * at every level. It also makes the server's cap do exactly what it is for:
   * once `renderedDepth` has stopped at 6, the difference is 0 and the eleventh
   * reply in a chain sits level with the seventh instead of off the screen.
   */
  indentFrom: number;
  shared: CommentNodeShared;
}

/**
 * One comment, and everything under it.
 *
 * Recursive because the wire is: `replies` is `CommentResponse[]` all the way
 * down and there is no flat list with parent pointers to rebuild.
 *
 * At the top of the tree this is a list row, which FlashList hands the next
 * comment when it scrolls away, so its own state is keyed to the comment it
 * belongs to. The replies inside it are keyed by comment and mount afresh.
 */
function CommentNode({ comment, indentFrom, shared }: CommentNodeProps) {
  const {
    contentAuthorId,
    authorNameFor,
    collapsed,
    onToggleCollapse,
    replyTo,
    onSetReplyTo,
    replyDrafts,
    onSubmitReply,
    isReplyPending,
    maxLength,
    onReport,
    onChanged,
  } = shared;
  const replyDraft = useSyncExternalStore(replyDrafts.subscribe, () => replyDrafts.read(comment.commentId));

  // The reaction routes take the **comment** as their target, so this is the
  // target they get. The thread's own cache entry is a different key, which is
  // why `onChanged` refetches it after a reaction lands.
  // It reports pending and errors for the comment it was asked about only, so a
  // recycled row shows nothing of the last comment's reaction (FARCH-004).
  const reactions = useReact({ contentType: 'comment', contentId: comment.commentId });

  const isCollapsed = collapsed[comment.commentId] ?? false;
  const isThreadAuthor = contentAuthorId !== null && comment.authorId === contentAuthorId;
  // Nobody reports their own comment (13 Oct 2026). `authorId` here is a real
  // user id — `CommentResponse` carries it on the wire, unlike a post's.
  const viewerId = useAuthStore((state) => state.user?.userId ?? null);
  const isOwnComment = viewerId !== null && comment.authorId === viewerId;
  // The comment's own name first (14 Oct 2026): `CommentResponse` carries
  // `authorName` and `author`, and this read only an optional lookup no screen
  // passed, so every comment said "Community member", the viewer's own included.
  const wire = comment as unknown as {
    authorName?: string | null;
    author?: { name?: string | null; avatarUrl?: string | null } | null;
  };
  // The author's photo, which the server sends since 4 Nov 2026.
  const avatarUrl = comment.isTombstoned ? null : wire.author?.avatarUrl ?? null;
  const name =
    wire.author?.name?.trim() || wire.authorName?.trim() || authorNameFor?.(comment.authorId) || 'Community member';

  const react = useCallback(
    async (key: CommunityReactionKey, on: boolean) => {
      try {
        if (on) await reactions.react(key);
        else await reactions.unreact(key);
        onChanged();
      } catch {
        // `reactions.error` carries the sentence. Swallowed here so an
        // unhandled rejection does not take the screen with it.
      }
    },
    [reactions, onChanged]
  );

  const sendReply = useCallback(async () => {
    const body = replyDraft;
    replyDrafts.write(comment.commentId, '');
    try {
      await onSubmitReply(body, comment.commentId);
      onSetReplyTo(null);
    } catch {
      replyDrafts.write(comment.commentId, body);
    }
  }, [replyDraft, replyDrafts, onSubmitReply, comment.commentId, onSetReplyTo]);

  return (
    <View
      // Named so the indent is assertable. It is the one thing on this component
      // that a styling change can silently get wrong, and `depth` sitting right
      // next to `renderedDepth` on the same record is an easy swap to make.
      testID={`comment-${comment.commentId}`}
      // Property 2. `renderedDepth`, which the server clamped at six, minus the
      // depth already applied by the view this one sits inside. `depth` is the
      // true depth and is what a "collapse" control counts, not what an indent
      // multiplies.
      style={{ marginLeft: Math.max(0, comment.renderedDepth - indentFrom) * INDENT_STEP }}
      className={`mb-3 rounded-2xl border p-3.5 ${
        comment.renderedDepth === 0
          ? 'bg-surface-background border-faint'
          : 'bg-surface-card border-subtle'
      }`}
    >
      {comment.isPinned ? (
        <Text className="text-[9px] font-black text-primary-500 mb-1.5">📌 PINNED</Text>
      ) : null}

      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center flex-1 mr-2">
          {!comment.isTombstoned ? (
            <View className="mr-1.5">
              <Avatar uri={avatarUrl} name={name} size={20} />
            </View>
          ) : null}
          <Text className="text-[11px] font-black text-content-primary mr-1.5" numberOfLines={1}>
            {comment.isTombstoned ? 'Removed' : name}
          </Text>
          {isThreadAuthor && !comment.isTombstoned ? (
            <Text className="text-[8px] font-black text-white bg-primary-500 px-1 py-0.5 rounded">
              AUTHOR
            </Text>
          ) : null}
        </View>
        <Text className="text-[9px] text-content-faint font-bold">
          {relativeTime(comment.createdAt)}
          {comment.isEdited ? ' · edited' : ''}
        </Text>
      </View>

      {/* Property 1. The body is the empty string on a tombstone, so the words
          come from `commentBodyText`. Rendering `body` unconditionally would
          draw a blank bubble with a reply count under it. */}
      <Text
        className={`text-xs leading-relaxed ${
          comment.isTombstoned ? 'text-content-faint italic' : 'text-content-secondary'
        }`}
      >
        {commentBodyText(comment)}
      </Text>

      {/* A tombstone gets no controls. There is nothing to react to, reply to or
          report, and offering them would be offering to act on nothing. */}
      {!comment.isTombstoned ? (
        <View className="flex-row items-center justify-between mt-2.5 border-t border-faint pt-2">
          <View className="flex-row items-center flex-1 mr-2">
            <ReactionBar
              content={comment}
              contentType="comment"
              onReact={(key) => void react(key, true)}
              onUnreact={(key) => void react(key, false)}
              isPending={reactions.isPending}
              compact
            />
          </View>

          <View className="flex-row items-center">
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Reply to this comment"
              onPress={() => onSetReplyTo(replyTo === comment.commentId ? null : comment.commentId)}
            >
              <Text className="text-[10px] font-black text-primary-500 mr-3">Reply</Text>
            </TouchableOpacity>

            {onReport && !isOwnComment ? (
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Report this comment"
                onPress={() => onReport(comment.commentId)}
              >
                <Text className="text-[10px] font-bold text-content-faint">Report</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {reactions.error ? (
        <Text className="text-[9px] font-bold text-error-default mt-1.5">{reactions.error}</Text>
      ) : null}

      {replyTo === comment.commentId ? (
        <View className="mt-2.5 bg-surface-card p-2.5 rounded-xl border border-subtle">
          <TextInput
            accessible
            accessibilityLabel="Write a reply"
            placeholder="Write a reply…"
            value={replyDraft}
            onChangeText={(text) => replyDrafts.write(comment.commentId, text)}
            multiline
            maxLength={maxLength}
            className="text-xs p-1 text-content-strong"
          />
          <View className="flex-row justify-end items-center mt-2">
            <Text className="text-[9px] text-content-faint font-semibold mr-3">
              {replyDraft.length}/{maxLength}
            </Text>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Post reply"
              accessibilityState={{ disabled: replyDraft.trim().length === 0 || isReplyPending }}
              disabled={replyDraft.trim().length === 0 || isReplyPending}
              onPress={() => void sendReply()}
              className={`px-3 py-1.5 rounded-lg ${
                replyDraft.trim().length === 0 || isReplyPending
                  ? 'bg-surface-muted'
                  : 'bg-primary-500'
              }`}
            >
              <Text
                className={`text-[9px] font-black ${
                  replyDraft.trim().length === 0 ? 'text-content-faint' : 'text-white'
                }`}
              >
                Post reply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {comment.replies.length > 0 ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={
            isCollapsed
              ? `Show ${comment.replyCount} replies`
              : `Collapse ${comment.replyCount} replies`
          }
          onPress={() => onToggleCollapse(comment.commentId)}
          className="mt-2"
        >
          <Text className="text-[10px] font-bold text-content-faint">
            {isCollapsed ? `Show replies (${comment.replyCount})` : 'Collapse thread'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {!isCollapsed && comment.replies.length > 0 ? (
        <View className="mt-2.5">
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.commentId}
              comment={reply}
              indentFrom={comment.renderedDepth}
              shared={shared}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
