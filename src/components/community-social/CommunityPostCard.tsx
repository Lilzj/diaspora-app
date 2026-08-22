// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — One community post (Wave D-2b)
//
// The card every community feed draws. It renders a `CommunityPostResponse` and
// nothing else — no author name, no distance, no confidence score, because the
// wire carries none of those and the card it replaces invented all three.
//
// ── What this card will not draw, and why ────────────────────────────────────
//
// **`reportCount`.** It is **0 for anyone who is not the author** — the server
// suppresses the figure rather than the field. Rendered as a public signal it
// would tell every member on the platform that nothing has ever been reported.
// The author's own copy is honest, and that is the only place it is shown.
//
// **A "checked and safe" badge for anything but `clean`.**
// `ContentReviewStatus` can be `unavailable`, which means **no provider
// answered** — the review did not happen. It is the value a deployment with no
// configured provider returns for everything, so a badge that treated
// "not flagged" as "safe" would be the application vouching for content nothing
// looked at. `shouldRenderSafetyBadge` is the guard and it only passes `clean`.
//
// **A quote-share.** `ShareResponse.quotePostId` is **always null** — `kind:
// 'quote'` records a share and creates no post, on every deployment, despite
// both contracts documenting one. A "quote this" affordance would promise a
// member a post and then have nowhere to send them.
//
// **A confidence score.** The screen this card replaces computed one from
// proximity, confirmation counts and a recency decay, none of which exist on
// this contract. There is no confirmation route in this module at all.
//
// ── The two names for one value ──────────────────────────────────────────────
//
// `postId` is also `updateId` and `body` is also `description` — the same values
// emitted twice so an older consumer and a newer one both bind. This card reads
// `postId` and `body`, once each, and never both spellings of either.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { shouldRenderSafetyBadge, isFlaggedContent } from '@/lib/community-social-api';
import { useBookmark, useReact } from '@/hooks/community-social';
import type { CommunityPostResponse, CommunityReactionKey } from '@/types/community-social';

import { PollBlock } from './PollBlock';
import { ReactionBar } from './ReactionBar';
import {
  categoryGlyph,
  categoryLabel,
  isUrgencyWorthBadging,
  relativeTime,
  urgencyStyle,
  visibilityLabel,
  humanise,
} from './labels';

interface CommunityPostCardProps {
  post: CommunityPostResponse;
  /** Defaults to opening the post's own screen. */
  onPress?: (post: CommunityPostResponse) => void;
  /** True on the detail screen, where the poll is votable and the body is whole. */
  expanded?: boolean;
  onVotePoll?: (optionIds: string[]) => void;
  isVotingPoll?: boolean;
  pollError?: string | null;
  /**
   * The signed-in member's id, when the screen knows it. Only used to decide
   * whether `reportCount` is theirs to see.
   */
  viewerId?: string | null;
}

export function CommunityPostCard({
  post,
  onPress,
  expanded = false,
  onVotePoll,
  isVotingPoll = false,
  pollError = null,
  viewerId = null,
}: CommunityPostCardProps) {
  const reactions = useReact({ contentType: 'post', contentId: post.postId });
  const bookmarks = useBookmark();

  const urgency = urgencyStyle(post.urgency);

  const react = useCallback(
    async (key: CommunityReactionKey, on: boolean) => {
      try {
        if (on) await reactions.react(key);
        else await reactions.unreact(key);
      } catch {
        // `reactions.error` already carries the sentence for the member.
      }
    },
    [reactions]
  );

  const toggleBookmark = useCallback(async () => {
    try {
      if (post.isBookmarked) {
        await bookmarks.unsave('post', post.postId);
      } else {
        // These are `/community/bookmarks`, **not** `/api/v1/bookmarks` — a
        // separate module with its own folders and identifiers. Nothing saved
        // here appears on the other surface, and the folder is chosen at save
        // time because there is no route that moves a bookmark afterwards.
        await bookmarks.save({ contentType: 'post', contentId: post.postId });
      }
    } catch {
      // `bookmarks.error` says why.
    }
  }, [bookmarks, post.isBookmarked, post.postId]);

  const open = useCallback(() => {
    if (onPress) {
      onPress(post);
      return;
    }
    router.push(`/update/${post.postId}`);
  }, [onPress, post]);

  const body = (
    <>
      {/* Category, urgency, time. `normal` gets no badge: it is the
          overwhelming majority and badging it makes the two that matter
          harder to see. */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Text className="text-sm mr-1.5">{categoryGlyph(post.category)}</Text>
          <Text className="text-[10px] font-black text-content-faint uppercase tracking-wider">
            {categoryLabel(post.category)}
          </Text>
          {post.isPinned ? (
            <Text className="text-[9px] font-black text-primary-500 ml-2">📌 PINNED</Text>
          ) : null}
        </View>

        {isUrgencyWorthBadging(post.urgency) ? (
          <View
            className="px-2 py-0.5 rounded-full border"
            style={{ backgroundColor: urgency.background, borderColor: urgency.border }}
          >
            <Text className="text-[9px] font-black tracking-wider" style={{ color: urgency.text }}>
              {humanise(post.urgency ?? '').toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      {post.title ? (
        <Text
          className="text-base font-extrabold text-content-primary leading-snug mb-1"
          numberOfLines={expanded ? undefined : 2}
        >
          {post.title}
        </Text>
      ) : null}

      {/* `body`, once. `description` is the same string under an older name. */}
      <Text
        className="text-sm text-content-secondary leading-relaxed"
        numberOfLines={expanded ? undefined : 3}
      >
        {post.body}
      </Text>

      {post.poll ? (
        <PollBlock
          poll={post.poll}
          onVote={onVotePoll}
          isVoting={isVotingPoll}
          error={pollError}
        />
      ) : null}

      {/* Only `flagged` earns words. `unavailable` means nothing looked at this
          and `pending` means nothing has concluded — neither is a verdict in
          either direction, and `shouldRenderSafetyBadge` refuses both. */}
      {isFlaggedContent(post.reviewStatus) ? (
        <View className="mt-2.5 bg-warning-surface border border-warning-default/30 rounded-xl px-3 py-2">
          <Text className="text-[10px] font-black text-warning-default">
            ⚠️ Flagged by automated review
          </Text>
        </View>
      ) : shouldRenderSafetyBadge(post.reviewStatus) ? (
        <Text className="text-[10px] font-bold text-success-default mt-2">
          ✓ Passed automated review
        </Text>
      ) : null}

      {/* Where and when. Nothing is computed — there is no distance on this
          contract and no user position to measure one from. */}
      <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-faint">
        <Text className="text-[10px] font-bold text-content-faint flex-1 mr-2" numberOfLines={1}>
          {post.cityName ? `📍 ${post.areaName ? `${post.areaName}, ` : ''}${post.cityName}` : ''}
        </Text>
        <Text className="text-[10px] font-bold text-content-muted">
          {relativeTime(post.publishedAt ?? post.createdAt)}
          {post.isEdited ? ' · edited' : ''}
        </Text>
      </View>

      {/* The audience, when it is not everyone. A member who posted to
          followers should be able to see that they did. */}
      {post.visibility !== 'public' ? (
        <Text className="text-[9px] font-bold text-content-faint mt-1">
          👥 {visibilityLabel(post.visibility)} only
        </Text>
      ) : null}

      {/* The author's own copy of `reportCount`, and only theirs. Zero here for
          anybody else is "not your business", not "no reports". */}
      {viewerId !== null && post.authorId === viewerId && post.reportCount > 0 ? (
        <Text className="text-[9px] font-bold text-error-default mt-1">
          {post.reportCount} {post.reportCount === 1 ? 'report' : 'reports'} on your post
        </Text>
      ) : null}

      {/* Actions. No quote-share: `quotePostId` is always null. */}
      <View className="flex-row items-center justify-between mt-2.5">
        <View className="flex-1 mr-2">
          <ReactionBar
            content={post}
            contentType="post"
            onReact={(key) => void react(key, true)}
            onUnreact={(key) => void react(key, false)}
            isPending={reactions.isPending}
            compact
          />
        </View>

        <View className="flex-row items-center">
          <Text className="text-[10px] font-bold text-content-muted mr-3">
            💬 {post.commentCount}
          </Text>

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityState={{ selected: post.isBookmarked, disabled: bookmarks.isPending }}
            accessibilityLabel={post.isBookmarked ? 'Remove from saved' : 'Save this post'}
            disabled={bookmarks.isPending}
            onPress={() => void toggleBookmark()}
          >
            <Text className="text-sm">{post.isBookmarked ? '🔖' : '📑'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {reactions.error ?? bookmarks.error ? (
        <Text className="text-[9px] font-bold text-error-default mt-1.5">
          {reactions.error ?? bookmarks.error}
        </Text>
      ) : null}
    </>
  );

  // On the detail screen the card *is* the screen, so wrapping it in a button
  // that navigates to itself would be a tap target that does nothing.
  if (expanded) {
    return (
      <View className="bg-surface-card rounded-2xl p-4 border border-subtle">{body}</View>
    );
  }

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${post.title ?? post.body}. Open this post.`}
      onPress={open}
      activeOpacity={0.9}
      className="bg-surface-card rounded-2xl p-4 mb-3 border border-subtle"
    >
      {body}
    </TouchableOpacity>
  );
}
