// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — where a member lands after signing in
//
// ── Why this is a module and not two copies ─────────────────────────────────
//
// The one-time code screen worked this out inline. When sign-in moved to an
// email address and a password there were suddenly two screens that had to make
// the same decision, and a second copy of a rule about *what a member is allowed
// to see* is exactly the kind of duplicate that drifts silently: one screen
// starts sending unverified members to a gated tab and nothing fails, because
// both branches are plausible.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccessDecision } from '@/types/auth';

/**
 * States that require the gateway rather than the tabs.
 *
 * Used **only** as the fallback when the server sent no `destination`. The
 * server's own answer is preferred in every case where it exists — this list is
 * a client mirroring a server rule, which is exactly the kind of thing that
 * drifts.
 *
 * Lifted verbatim from `app/(auth)/otp.tsx`, where it already was. Note what it
 * contains: `LimitedAccess` gates too. A member who has verified their phone but
 * not their diaspora status has a working session and still must not land on the
 * tabs — a shorter list here would silently walk them into gated screens.
 */
export const GATED_ACCESS_STATES: ReadonlySet<string> = new Set([
  'LimitedAccess',
  'DiasporaVerificationPending',
  'VerificationUnderReview',
  'VerificationRejected',
  'RequiresMoreInformation',
  'Suspended',
  'Restricted',
  'AppealPending',
]);

/**
 * The route to replace with after a successful sign-in.
 *
 * ── The server decides, but only if this build can honour it ────────────────
 *
 * `access.destination` is the platform's own answer and is preferred. It is
 * only usable when it names a route **this build has**: a deployment ahead of
 * the app in the store can name a screen that does not exist yet, and
 * `router.replace` on an unknown path throws. So a destination is taken when it
 * looks like a path, and the access state decides otherwise.
 *
 * Callers should still wrap the navigation in a try/catch — this function
 * cannot know the app's route table, only that a non-path is definitely wrong.
 */
export function routeForAccess(access: AccessDecision | null | undefined): string {
  const destination = access?.destination;

  if (typeof destination === 'string' && destination.startsWith('/')) {
    return destination;
  }

  const accessState = access?.accessState;

  return typeof accessState === 'string' && GATED_ACCESS_STATES.has(accessState)
    ? '/access-gateway'
    : '/(tabs)';
}
