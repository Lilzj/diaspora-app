// ─────────────────────────────────────────────────────────────────────────────
// One community post — Remediation Wave D-2b
//
// **This screen used to be fixtures**, and it was the most inventive of them.
// It found the update in `mocks/community-data.ts`, then computed a distance
// from a hardcoded pair of coordinates in Elephant & Castle, drew a stylised
// SVG street map with an "ACCURACY RADIUS: 150m" caption over a point that was
// not the post's, and assembled a "Community Confidence Score" out of a
// proximity bonus, a confirmation bonus, a resident bonus and a recency decay.
// Every one of those numbers was arithmetic on fixtures presented as a platform
// measurement, and none of the four inputs exists on `CommunityPostResponse`.
//
// It now renders `GET /community/posts/{postId}` and its comment thread, and it
// renders **only what the wire carries**.
//
// ── What went, and why it could not stay ─────────────────────────────────────
//
//   * **The confidence score.** Not on the contract, not derivable from it, and
//     there is no confirmation route in `Diaspora.Modules.Community` at all —
//     the "I can confirm this" button posted to nothing and incremented a local
//     `useState`.
//   * **The distance and the map.** `latitude`/`longitude` are on the post and
//     are null on every seeded row; there is no user position on this contract
//     and nothing to measure one against. A map drawn at a fixed point with an
//     accuracy caption is a claim, not a graphic.
//   * **"Nearby Alert Feeds".** It filtered the fixture array by city name.
//     `GET /community/posts` does not exist — listing is feed-only — so a
//     "nearby" rail here would be a second feed request per post opened, keyed
//     on a city string the post may not carry. The `nearby` feed key exists and
//     belongs on a feed screen.
//   * **The author block.** `CommunityPostResponse` carries `authorId` and no
//     display name, and no route in this module resolves one. A name is not
//     invented; the block links to the contributor page by id.
//
// ── What arrived ─────────────────────────────────────────────────────────────
//
//   * Reactions, from `capabilities` rather than from a hardcoded list.
//   * The poll, whose counts are **null and not zero** while results are hidden.
//   * The comment thread, cursor-paged, with tombstones rendered rather than
//     filtered out.
//   * A report flow built on `GET /community/reports/reasons`.
//   * A share that records a share. **Not a quote-share**: `quotePostId` is
//     always null, so there is no post to send anybody to.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { Avatar } from '@/components/Avatar';
import {
  CommentThread,
  CommunityPostCard,
  ReportContentSheet,
} from '@/components/community-social';
import { usePost, usePostComments, useShare, useVotePoll } from '@/hooks/community-social';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import type { CommunityContentType } from '@/types/community-social';

export default function UpdateDetailScreen() {
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = typeof id === 'string' && id.length > 0 ? id : null;

  const { user } = useAuthStore();

  const { post, isLoading, error, refresh } = usePost(postId);
  // Genuinely cursor-paged, so genuinely an infinite query. The thread names its
  // rows `comments` and its count `totalCount` — neither of which is what the
  // platform's paged envelope uses — which is why this goes through the hook and
  // never through `readPage`.
  const thread = usePostComments(postId);

  const polling = useVotePoll();
  const sharing = useShare();

  const [reportTarget, setReportTarget] = useState<{
    contentType: CommunityContentType;
    contentId: string;
  } | null>(null);

  const vote = useCallback(
    async (optionIds: string[]) => {
      if (!postId) return;
      try {
        await polling.vote(postId, optionIds);
      } catch {
        // `polling.error` is rendered under the poll.
      }
    },
    [polling, postId]
  );

  const share = useCallback(async () => {
    if (!post) return;

    try {
      // The device sheet first, because that is what the member asked for.
      const result = await Share.share({
        message: `${post.title ?? 'On Diaspora'}: ${post.body}`,
      });
      if (result.action === Share.dismissedAction) return;

      // Then the record, so `shareCount` reflects it. `kind: 'link'` rather than
      // `'quote'`: a quote share records a share and creates no post — its
      // `quotePostId` is always null — so offering "quote this" would promise
      // the member something with nowhere to go.
      await sharing.share({ contentType: 'post', contentId: post.postId }, { kind: 'link' });
      refresh();
    } catch {
      showAlert({
        type: 'error',
        title: 'Could not share',
        message: 'We shared the link but could not record it. Nothing else has changed.',
      });
    }
  }, [post, sharing, refresh, showAlert]);

  const isSignedOut = error === 'Sign in to take part in the community.';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row justify-between items-center">
        <View className="flex-row items-center flex-1 mr-3">
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="mr-4"
          >
            <Text className="text-xl text-content-tertiary">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-black text-content-primary tracking-tight">
            Community post
          </Text>
        </View>

        {post ? (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Share this post"
            accessibilityState={{ disabled: sharing.isPending }}
            disabled={sharing.isPending}
            onPress={() => void share()}
          >
            <Text className="text-xs font-bold text-primary-500">SHARE</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollEndScrollView className="flex-1" showsVerticalScrollIndicator={false} activeTab="discover">
        {isLoading ? (
          <DetailSkeleton />
        ) : error ? (
          <EmptyState
            icon={isSignedOut ? '🔑' : '📡'}
            title={isSignedOut ? 'Sign in to read this' : 'We could not load this post'}
            description={error}
            action={
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel={isSignedOut ? 'Sign in' : 'Try again'}
                onPress={() => (isSignedOut ? router.push('/login') : refresh())}
                className="bg-primary-500 px-5 py-3 rounded-xl active:bg-primary-600"
              >
                <Text className="text-white font-extrabold text-sm">
                  {isSignedOut ? 'Sign in' : 'Try again'}
                </Text>
              </TouchableOpacity>
            }
          />
        ) : !post ? (
          <EmptyState
            icon="🕳️"
            title="This post is gone"
            description="It was removed, or the link is wrong."
            action={
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                className="bg-primary-500 px-5 py-3 rounded-xl active:bg-primary-600"
              >
                <Text className="text-white font-extrabold text-sm">Go back</Text>
              </TouchableOpacity>
            }
          />
        ) : (
          <View className="p-6">
            <CommunityPostCard
              post={post}
              expanded
              onVotePoll={(optionIds) => void vote(optionIds)}
              isVotingPoll={polling.isPending}
              pollError={polling.error}
              viewerId={user?.userId ?? null}
            />

            {/* The author, by id. `CommunityPostResponse` carries no display
                name and no route in this module resolves one, so the row is an
                honest link rather than an invented person. */}
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Open this contributor's profile"
              onPress={() => router.push(`/contributor/${post.authorId}`)}
              className="flex-row items-center bg-surface-card border border-subtle rounded-2xl p-4 mt-4"
            >
              <Avatar name="Community member" size={40} />
              <View className="flex-1 ml-3">
                <Text className="text-[10px] font-black text-content-faint uppercase tracking-wider">
                  Posted by
                </Text>
                <Text className="text-sm font-bold text-content-primary mt-0.5">
                  {post.organizationId ? 'An organisation' : 'A community member'}
                </Text>
              </View>
              <Text className="text-content-faint">›</Text>
            </TouchableOpacity>

            {sharing.error ? (
              <Text className="text-[11px] font-bold text-error-default mt-2">{sharing.error}</Text>
            ) : null}

            <View className="mt-8">
              <Text className="text-lg font-black text-content-primary mb-4">💬 Discussion</Text>
              <CommentThread
                target={{ contentType: 'post', contentId: post.postId }}
                thread={thread}
                contentAuthorId={post.authorId}
                onReport={(commentId) =>
                  setReportTarget({ contentType: 'comment', contentId: commentId })
                }
              />
            </View>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Report this post"
              onPress={() => setReportTarget({ contentType: 'post', contentId: post.postId })}
              className="items-center py-8"
            >
              <Text className="text-xs text-content-faint font-extrabold uppercase">
                Report this post
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="h-8" />
      </ScrollEndScrollView>

      <ReportContentSheet
        visible={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        contentType={reportTarget?.contentType ?? 'post'}
        contentId={reportTarget?.contentId ?? null}
        onReported={() =>
          showAlert({
            type: 'success',
            title: 'Report sent',
            message: 'A moderator will look at it. Thank you.',
          })
        }
      />
    </SafeAreaView>
  );
}

function DetailSkeleton() {
  return (
    <View
      className="p-6"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading this post"
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View className="bg-surface-card rounded-2xl p-4 border border-subtle">
          <Skeleton width="35%" height={12} className="mb-3" />
          <Skeleton width="85%" height={20} className="mb-3" />
          <Skeleton width="100%" height={14} className="mb-1.5" />
          <Skeleton width="95%" height={14} className="mb-1.5" />
          <Skeleton width="55%" height={14} className="mb-4" />
          <Skeleton width="40%" height={12} />
        </View>
        <View className="mt-6">
          <Skeleton width="30%" height={18} className="mb-4" />
          {[0, 1].map((row) => (
            <View key={row} className="bg-surface-background rounded-2xl p-4 mb-3 border border-faint">
              <Skeleton width="30%" height={12} className="mb-2" />
              <Skeleton width="90%" height={14} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
