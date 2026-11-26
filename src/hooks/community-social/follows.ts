// Community social hooks: follows. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ensureNotFollowing,
  followTarget,
  fetchFollowState,
  type FollowState,
} from '@/lib/api/community-social-api';
import { useAuthStore } from '@/store/auth';
import type { FollowResponse, FollowTargetType } from '@/types/community-social';
import { creatorGapKeys } from '@/lib/api/creator-gap-api';
import { invalidateFeeds, messageFor } from './shared';

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
    queryKey: followStateKey(userId ?? ''),
    queryFn: () => fetchFollowState(userId!),
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 30_000,
  });
}

/**
 * The one cache entry for whether the member follows `userId` and how many do.
 * The contributor header, the directory rows, the author card and the Follow
 * button all read it, so a follow moves every count on screen at once.
 */
export function followStateKey(userId: string) {
  return ['community-social', 'follow-state', userId] as const;
}

/**
 * The follower count a row should show: the follow-state entry when one exists,
 * the row's own count otherwise. It subscribes without fetching (`enabled:
 * false`), so a directory of fifty rows makes no fifty requests, yet a row
 * moves the moment a follow writes the entry (Android UAT, 3 Nov 2026).
 */
export function useLiveFollowerCount(userId: string | undefined, seed: number): number {
  const cached = useQuery({
    queryKey: followStateKey(userId ?? ''),
    queryFn: () => fetchFollowState(userId!),
    enabled: false,
  });

  return cached.data?.followerCount ?? seed;
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

  // The count moves on the tap. The follow call answers with the new count,
  // which is what replaces the guess; a refusal puts the old entry back. The
  // count used to wait for a second request, and stayed at 0 on the screen the
  // member was looking at (Android UAT, 3 Nov 2026).
  const guess = (targetId: string, nowFollowing: boolean) => {
    const key = followStateKey(targetId);
    const previous = client.getQueryData<FollowState>(key);

    if (previous && previous.isFollowing !== nowFollowing) {
      client.setQueryData<FollowState>(key, {
        isFollowing: nowFollowing,
        followerCount: Math.max(0, previous.followerCount + (nowFollowing ? 1 : -1)),
      });
    }

    return { key, previous };
  };

  const undo = (context: { key: readonly unknown[]; previous: FollowState | undefined } | undefined) => {
    if (context?.previous) client.setQueryData(context.key, context.previous);
  };

  // The answer is the follow edge, not the follow state: it carries the new
  // count and no `isFollowing`. Which route answered is the state — a follow
  // that succeeded is a follow. Until RMD-009 this read `answer.isFollowing`,
  // which the server never sends, so the entry held `undefined` and the
  // contributor page's button, seeded from it, went back to "Follow" the moment
  // the server confirmed the follow.
  const settle = (targetId: string, nowFollowing: boolean, answer: FollowResponse | null) => {
    if (answer) {
      client.setQueryData<FollowState>(followStateKey(targetId), {
        isFollowing: nowFollowing,
        followerCount: answer.followerCount,
      });
    } else {
      // "Already not following": nothing was removed and the answer carries no
      // count, so ask again rather than keep a guess.
      void client.invalidateQueries({ queryKey: followStateKey(targetId) });
    }

    invalidateFeeds(client);
    // The Creator module keeps its own copy of the count (directory rows, public
    // profiles), updated in the background from the follow event.
    void client.invalidateQueries({ queryKey: creatorGapKeys.directoryAll() });
    void client.invalidateQueries({ queryKey: creatorGapKeys.publicProfileAll() });
  };

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
    onMutate: ({ targetId }) => guess(targetId, true),
    onError: (_cause, _variables, context) => undo(context),
    onSuccess: (answer, { targetId }) => settle(targetId, true, answer),
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
    onMutate: ({ targetId }) => guess(targetId, false),
    onError: (_cause, _variables, context) => undo(context),
    onSuccess: (answer, { targetId }) => settle(targetId, false, answer),
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
