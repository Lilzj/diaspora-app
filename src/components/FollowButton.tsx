// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Follow / Following (Remediation Wave D-2b)
//
// **This button used to write to `store/follows.ts`.** A zustand `Set<string>`
// seeded with `new Set(['user-202'])` — one hardcoded follow, with the comment
// "Amara follows Fatima by default" — that lived for the lifetime of the
// process, was never sent anywhere, and disagreed with the `isFollowedByUser`
// prop the moment either changed. That store is gone, and this button is now the
// only thing in the application that follows anybody.
//
// The server owns follow state: `POST /community/follows/{targetId}` and
// `DELETE /community/follows/{targetId}?targetType=`.
//
// ── The three traps this component is shaped around ──────────────────────────
//
// **1. `targetType` travels differently on each verb.** It is a **body field**
// on the POST and a **query parameter** on the DELETE. Same fact, two
// transports, and each route ignores the other's — sending it the wrong way is
// not an error, it is a follow on the wrong kind of target. `followTarget` and
// `unfollowTarget` each put it where its own route reads it, so this component
// states it once, as `member`, and the client places it.
//
// **2. A follow POST applies `SetMuted(request.Muted)` unconditionally.** An
// absent body deserialises to `muted: false`, so pressing "Follow" on something
// already followed-and-muted **turns the mute off**. This button therefore never
// POSTs as a refresh, a retry or a re-affirmation: it POSTs only when its state
// says the member is not following, which is the only moment `muted: false` is
// the truth rather than a side effect. There is no mute control here, and adding
// one would need the same care.
//
// **3. Unfollowing something you do not follow is a 404, not a no-op.**
// `FollowNotFound`. Unfollow is the one non-idempotent removal in this module —
// un-reacting to something you never reacted to is a 200 — and the hook's
// `unfollow` goes through `ensureNotFollowing`, which swallows **that one
// failure and nothing else**. So the button lands on "Follow", which is the true
// state either way. Every other failure reverts the button and says why: a
// control that stayed flipped after the write was refused is a control that
// lies about what the server holds.
//
// ── The read this module does not offer ──────────────────────────────────────
//
// **There is no `GET /community/follows`.** Thirty-six routes, and not one of
// them answers "am I following this member?". `FollowResponse.isFollowing`
// arrives only as the result of a write. So the initial state is whatever the
// surrounding screen was given — today, on the contributor surfaces, still a
// fixture's `isFollowedByUser` — and after that this button shows what the
// server last confirmed. Replacing that seed needs a route that does not exist;
// it is recorded as a gap rather than papered over with a local store, which is
// exactly what was there before.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

import { useFollow } from '@/hooks/community-social';

interface FollowButtonProps {
  userId: string;
  /**
   * What the surrounding screen believes, at mount.
   *
   * The seed, not the truth — see the header. Once the member acts, the server's
   * answer wins and this prop is not consulted again for that target.
   */
  isFollowing: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FollowButton({
  userId,
  isFollowing: initialFollowing,
  size = 'sm',
  className = '',
}: FollowButtonProps) {
  const { follow, unfollow, isPending, error } = useFollow();

  const [isFollowing, setIsFollowing] = useState(initialFollowing);

  // A row recycled onto a different member starts from that member's seed
  // rather than carrying the previous one's answer across.
  useEffect(() => {
    setIsFollowing(initialFollowing);
  }, [userId, initialFollowing]);

  const handlePress = async () => {
    if (isPending) return;

    const wasFollowing = isFollowing;

    // Optimistic, and reverted on failure. The revert is the point: leaving the
    // button on "Following" after the server refused would be the control
    // asserting something the platform does not hold.
    setIsFollowing(!wasFollowing);

    try {
      if (wasFollowing) {
        // `targetType` goes in the query string on this verb. The client places
        // it; stating it here is what stops a member follow being removed as an
        // organisation follow.
        await unfollow(userId, 'member');
      } else {
        // Trap 2. `muted` is stated rather than defaulted, and this branch only
        // runs when we believe there is no follow to un-mute.
        await follow(userId, { targetType: 'member', muted: false });
      }
    } catch {
      setIsFollowing(wasFollowing);
    }
  };

  let paddingClass = 'px-3 py-1.5';
  let textSize = 'text-xs font-semibold';

  if (size === 'md') {
    paddingClass = 'px-4 py-2';
    textSize = 'text-sm font-semibold';
  } else if (size === 'lg') {
    paddingClass = 'h-12 px-6 justify-center items-center';
    textSize = 'text-xs font-black uppercase tracking-wider';
  }

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected: isFollowing, disabled: isPending }}
      accessibilityLabel={
        error
          ? `${isFollowing ? 'Following' : 'Follow'}. ${error}`
          : isFollowing
            ? 'Following. Tap to unfollow.'
            : 'Follow this member.'
      }
      onPress={() => void handlePress()}
      disabled={isPending}
      className={`rounded-full ${paddingClass} ${
        isFollowing ? 'bg-surface-muted border border-line' : 'bg-primary-500'
      } ${className}`}
      activeOpacity={0.7}
      style={size === 'lg' ? { height: 48, justifyContent: 'center', alignItems: 'center' } : undefined}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={isFollowing ? '#6B7280' : '#FFFFFF'} />
      ) : (
        <Text
          className={`${textSize} ${isFollowing ? 'text-content-secondary' : 'text-white'}`}
          style={size === 'lg' ? { textAlign: 'center', includeFontPadding: false } : undefined}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      )}
    </TouchableOpacity>
  );
}
