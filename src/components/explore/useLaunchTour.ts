// ─────────────────────────────────────────────────────────────────────────────
// Launching a walkthrough — one implementation, and the bug it closes
//
// ── What "Launch Live Walkthrough" actually did ──────────────────────────────
//
// Both launchers ended with:
//
//     router.replace('/');
//
// `'/'` is ambiguous in this app. Two files resolve to it —
// `app/(auth)/index.tsx` (the Welcome screen, with "Get Started" and "Sign in")
// and `app/(tabs)/index.tsx` (the home dashboard) — because a group directory
// contributes nothing to the path. `(auth)` is declared first in the root
// `Stack`, so that is the one a bare `'/'` reaches.
//
// The member was never signed out: `useAuthStore` still held the session, and
// the root layout's guard let them stay because `(auth)` *is* the auth group.
// They were simply looking at the sign-in screen. And `replace` had discarded
// the stack, so Back could not undo it. Indistinguishable from being logged out,
// which is exactly how it was reported.
//
// Two things follow, and both are load-bearing:
//
//   * **Name the group.** `'/(tabs)'` cannot be mistaken for the auth screen.
//   * **`push`, never `replace`.** A walkthrough is something a member steps
//     into and comes back from. Replacing the history means Close has nowhere
//     to return to — which is the other half of what "logged me out" felt like.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { router } from 'expo-router';

import { useExploreStore } from '@/store/explore';
import { useAuthStore } from '@/store/auth';
import { useNotification } from '@/providers/notification-provider';
import { getTourConfig } from '@/config/featureRegistry';
import type { TourId } from '@/types/explore';

/**
 * Account states that cannot start a walkthrough.
 *
 * A tour drives the member through live product surfaces, and these states
 * cannot reach those surfaces — the root layout sends them to `/access-gateway`
 * instead. Starting a tour would spotlight a screen they are about to be
 * redirected away from.
 */
const RESTRICTED_ACCOUNT_STATES = [
  'DiasporaVerificationPending',
  'VerificationUnderReview',
  'VerificationRejected',
  'RequiresMoreInformation',
  'Suspended',
  'Restricted',
  'AppealPending',
] as const;

export function useLaunchTour() {
  const startTour = useExploreStore((state) => state.startTour);
  const resumeTour = useExploreStore((state) => state.resumeTour);
  const pausedTourId = useExploreStore((state) => state.pausedTourId);
  const user = useAuthStore((state) => state.user);
  const { showAlert } = useNotification();

  return useCallback(
    (tourId: TourId | undefined | null) => {
      if (!tourId) return;

      const accountState = user?.accountState;
      const isRestricted =
        !accountState || (RESTRICTED_ACCOUNT_STATES as readonly string[]).includes(accountState);

      if (isRestricted) {
        showAlert({
          type: 'warning',
          title: 'Verification Required',
          message:
            'Interactive live walkthroughs are only available for fully verified members. Please wait for safety verification approval.',
        });
        return;
      }

      const config = getTourConfig(tourId);
      if (!config) return;

      // ── Resume rather than restart ───────────────────────────────────────
      //
      // `pauseTour` stores the tour and the step it stopped on, and nothing in
      // the app called `resumeTour` — so pausing put a tour into a state it
      // could never leave, and because pausing does not mark a tour completed
      // it also kept re-offering itself. Launching the same tour again is the
      // moment a member is asking for it back, and picking up where they left
      // off is what "pause" promised.
      if (pausedTourId === tourId) {
        resumeTour();
      } else {
        startTour(tourId);
      }

      // `push`, and a route that names its group. See the file header.
      router.push(config.entryRoute as never);
    },
    [startTour, resumeTour, pausedTourId, showAlert, user?.accountState]
  );
}
