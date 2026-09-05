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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';

import {
  COMMENT_BODY_MAX_LENGTH,
  commentBodyText,
  isFlaggedContent,
} from '@/lib/community-social-api';
import {
  useCommunityCapabilities,
  useCreateComment,
  useReact,
  type CommentTarget,
  type UseCommentThreadResult,
} from '@/hooks/community-social';
import type { CommentResponse, CommunityReactionKey } from '@/types/community-social';
import { Skeleton } from '@/components/Skeleton';

import { ReactionBar } from './ReactionBar';
import { relativeTime } from './labels';

/** Pixels of indent per level of `renderedDepth`. Six levels, capped by the server. */
const INDENT_STEP = 14;

interface CommentThreadProps {
  target: CommentTarget;
  thread: UseCommentThreadResult;
  /**
   * The content's author, so their own comments can be badged. Optional because
   * only some surfaces know it.
   */
  contentAuthorId?: string | null;
  /** A screen that can resolve display names supplies one. See the header. */
  authorNameFor?: (authorId: string) => string | null;
  onReport?: (commentId: string) => void;
}

export function CommentThread({
  target,
  thread,
  contentAuthorId = null,
  authorNameFor,
  onReport,
}: CommentThreadProps) {
  const { capabilities } = useCommunityCapabilities();
  const composer = useCreateComment(target);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
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

  const submit = useCallback(
    async (body: string, parentCommentId: string | null) => {
      const trimmed = body.trim();
      if (trimmed.length === 0) return;

      // `contentType` and `contentId` are on `CreateCommentRequest` and are
      // ignored by every route that carries the target in its path — which is
      // all three. The client strips them; nothing here populates them.
      await composer.comment({ body: trimmed, parentCommentId });
    },
    [composer]
  );

  const postTopLevel = useCallback(async () => {
    const body = draft;
    setDraft('');
    try {
      await submit(body, null);
    } catch {
      // Put the words back. A failed post that also ate the paragraph is two
      // losses for one failure, and `composer.error` is already saying why.
      setDraft(body);
    }
  }, [draft, submit]);

  const toggleCollapse = useCallback((commentId: string) => {
    setCollapsed((current) => ({ ...current, [commentId]: !current[commentId] }));
  }, []);

  return (
    <View>
      {/* ── Compose ──────────────────────────────────────────────────────── */}
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
            accessibilityState={{ disabled: draft.trim().length === 0 || composer.isPending }}
            disabled={draft.trim().length === 0 || composer.isPending}
            onPress={() => void postTopLevel()}
            className={`px-4 py-2 rounded-xl ${
              draft.trim().length === 0 || composer.isPending ? 'bg-surface-muted' : 'bg-primary-500'
            }`}
          >
            {composer.isPending ? (
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

        {composer.error ? (
          <Text className="text-[10px] font-bold text-error-default mt-2">{composer.error}</Text>
        ) : null}
      </View>

      {/* ── The thread ───────────────────────────────────────────────────── */}
      {thread.isLoading ? (
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
      ) : thread.error ? (
        <View className="bg-surface-background rounded-2xl p-4 border border-faint items-center">
          <Text className="text-xs font-bold text-content-strong">
            We could not load the discussion
          </Text>
          <Text className="text-[11px] text-content-muted text-center mt-1 leading-relaxed">
            {thread.error}
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Try loading the comments again"
            onPress={thread.refresh}
            className="mt-3 bg-primary-500 px-4 py-2 rounded-xl"
          >
            <Text className="text-[10px] font-black text-white">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : thread.isEmpty ? (
        // An empty thread renders as empty. The screen this replaced could not
        // reach this state, because it had fixtures to fall back on.
        <View className="bg-surface-background rounded-2xl p-5 border border-faint items-center">
          <Text className="text-2xl mb-1">💬</Text>
          <Text className="text-xs font-bold text-content-strong">No comments yet</Text>
          <Text className="text-[11px] text-content-muted text-center mt-1 leading-relaxed">
            Be the first to add something.
          </Text>
        </View>
      ) : (
        <>
          {thread.comments.map((comment) => (
            <CommentNode
              key={comment.commentId}
              comment={comment}
              indentFrom={0}
              contentAuthorId={contentAuthorId}
              authorNameFor={authorNameFor}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              replyTo={replyTo}
              onSetReplyTo={setReplyTo}
              onSubmitReply={submit}
              isReplyPending={composer.isPending}
              maxLength={maxLength}
              onReport={onReport}
              onChanged={thread.refresh}
            />
          ))}

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
      )}
    </View>
  );
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
  contentAuthorId: string | null;
  authorNameFor?: (authorId: string) => string | null;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (commentId: string) => void;
  replyTo: string | null;
  onSetReplyTo: (commentId: string | null) => void;
  onSubmitReply: (body: string, parentCommentId: string) => Promise<void>;
  isReplyPending: boolean;
  maxLength: number;
  onReport?: (commentId: string) => void;
  onChanged: () => void;
}

/**
 * One comment, and everything under it.
 *
 * Recursive because the wire is: `replies` is `CommentResponse[]` all the way
 * down and there is no flat list with parent pointers to rebuild.
 */
function CommentNode({
  comment,
  indentFrom,
  contentAuthorId,
  authorNameFor,
  collapsed,
  onToggleCollapse,
  replyTo,
  onSetReplyTo,
  onSubmitReply,
  isReplyPending,
  maxLength,
  onReport,
  onChanged,
}: CommentNodeProps) {
  const [replyDraft, setReplyDraft] = useState('');

  // The reaction routes take the **comment** as their target, so this is the
  // target they get. The thread's own cache entry is a different key, which is
  // why `onChanged` refetches it after a reaction lands.
  const reactions = useReact({ contentType: 'comment', contentId: comment.commentId });

  const isCollapsed = collapsed[comment.commentId] ?? false;
  const isThreadAuthor = contentAuthorId !== null && comment.authorId === contentAuthorId;
  const name = authorNameFor?.(comment.authorId) ?? 'Community member';

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
    setReplyDraft('');
    try {
      await onSubmitReply(body, comment.commentId);
      onSetReplyTo(null);
    } catch {
      setReplyDraft(body);
    }
  }, [replyDraft, onSubmitReply, comment.commentId, onSetReplyTo]);

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

      {/* Only `flagged` earns a notice. `unavailable` means no provider
          answered — nothing looked at this — and `pending` means nothing has
          concluded, so neither may be dressed as a verdict in either direction. */}
      {isFlaggedContent(comment.reviewStatus) ? (
        <Text className="text-[9px] font-black text-warning-default mt-1.5">
          ⚠️ Flagged by automated review
        </Text>
      ) : null}

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

            {onReport ? (
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
            onChangeText={setReplyDraft}
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
              contentAuthorId={contentAuthorId}
              authorNameFor={authorNameFor}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              replyTo={replyTo}
              onSetReplyTo={onSetReplyTo}
              onSubmitReply={onSubmitReply}
              isReplyPending={isReplyPending}
              maxLength={maxLength}
              onReport={onReport}
              onChanged={onChanged}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
