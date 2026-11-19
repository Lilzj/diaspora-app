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
//
// ── What was wrong with it until 18 Nov 2026 (FBL-003) ──────────────────────
//
// Avoiding the second copy was the right instinct and it was applied to the
// wrong thing. The decision lived in one module — and that module held a second
// copy of something else: a set of access states, which is the client's
// vocabulary, compared against `access.accessState`, which is the server's.
//
// The server's `AccessState` has nine values; the set held eight, and three of
// them matched only because the two vocabularies happen to spell those three
// the same way. `DiasporaVerificationPending`, `VerificationRejected`,
// `RequiresMoreInformation`, `Restricted` and `AppealPending` are words this
// client invented and no server has ever sent. The five states the server
// *does* send that are not in the set — `RegistrationStarted`,
// `PhoneVerificationPending`, `VerificationPending`, `Locked`, `Disabled` —
// therefore routed to `/(tabs)`.
//
// Nothing failed, for the usual reason: the root layout redirects a member
// whose *translated* state is gated, so `VerificationPending` and `Locked`
// reached the tabs and were pulled back out. The redundancy hid the defect and
// was never declared as load-bearing. `PhoneVerificationPending` is not on the
// layout's list and the backend's `AllowsAuthentication` lets it sign in, so
// that one stayed.
//
// The fix is not a longer set. It is to translate once — `lib/access-state.ts`
// is where the two vocabularies meet, and now it is the only place.
// ─────────────────────────────────────────────────────────────────────────────

import { requiresAccessGateway } from '@/lib/domain/access-state';
import type { AccessDecision } from '@/types/auth';

/**
 * The route to replace with after a successful sign-in.
 *
 * ── The server's own answer, and why it has never been used ─────────────────
 *
 * `access.destination` is the platform's answer and is preferred where this
 * build can honour it: a deployment ahead of the app in the store can name a
 * screen that does not exist yet, and `router.replace` on an unknown path
 * throws. So a destination is taken only when it looks like a path.
 *
 * **Measured, 18 Nov 2026: it never does.** The server's `Destination` is an
 * `AccessDestination` name — `ExploreLimited`, `VerificationDashboard`,
 * `FullApplication`, `AccountRecovery` and five more — serialised with
 * `ToString()`. None of them starts with `/`, so this branch has not run once,
 * and the access state has been making every routing decision on its own.
 *
 * The branch stays, because a server that starts sending paths should be obeyed
 * rather than silently ignored, and because the alternative is a client-side
 * table mapping nine surface names onto routes — a third copy of the server's
 * vocabulary, which is the defect this module was just cured of. Both halves of
 * the condition are covered by tests so the claim above stays honest.
 *
 * Callers should still wrap the navigation in a try/catch — this function
 * cannot know the app's route table, only that a non-path is definitely wrong.
 */
export function routeForAccess(access: AccessDecision | null | undefined): string {
  const destination = access?.destination;

  if (typeof destination === 'string' && destination.startsWith('/')) {
    return destination;
  }

  return requiresAccessGateway(access?.accessState) ? '/access-gateway' : '/(tabs)';
}
