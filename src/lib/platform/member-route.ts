import { confinesToGateway } from '@/lib/domain/access-state';
import type { AuthStatus } from '@/types/auth';
import type { AccountState } from '@/types/trust';

/**
 * What a member-only route group does with the session in front of it (FARCH-006).
 *
 * - `wait`: the session is not known yet. A cold start reads the keystore, and
 *   may refresh an expired access token, before it knows who this is.
 * - `sign-in`: the root layout is sending this caller to the login screen.
 * - `gateway`: the root layout is sending this member to the access gateway.
 * - `enter`: the group is theirs to see.
 *
 * A group shows nothing of itself for the first three: no frame of a balance or
 * a message after a session ends, and none before a session is restored.
 */
export type MemberRouteDecision = 'wait' | 'sign-in' | 'gateway' | 'enter';

export interface MemberSession {
  readonly status: AuthStatus;
  readonly isAuthenticated: boolean;
  readonly isExploringLimited: boolean;
  readonly accountState: AccountState | null | undefined;
}

/**
 * The root layout's own rule for a route outside `(auth)`, as a decision rather
 * than a redirect.
 *
 * Each line is one of the root layout's two effects. Its sign-in redirect does
 * nothing while the status is `unknown`, `restoring` or `refreshing`, and
 * otherwise sends a caller with no session to the login screen. Its gateway
 * redirect sends a held member to the access gateway unless they chose to
 * explore. Keeping the two in step is what lets a group withhold itself without
 * navigating: whenever a group would not render, the root layout is already
 * moving the member somewhere else.
 *
 * A member whose profile has not loaded has no account state, and is let in, as
 * the root layout lets them in. That is the session a failed profile read leaves
 * behind, and its tokens are good.
 */
export function memberRouteDecision(session: MemberSession): MemberRouteDecision {
  if (session.status === 'unknown' || session.status === 'restoring') return 'wait';

  if (!session.isAuthenticated) {
    // A cold start can be refreshing an expired access token before it has set
    // the session, and that is still not known. A refresh in the middle of a
    // session keeps `isAuthenticated`, so the group stays on screen through it.
    return session.status === 'refreshing' ? 'wait' : 'sign-in';
  }

  if (!session.isExploringLimited && confinesToGateway(session.accountState)) return 'gateway';

  return 'enter';
}
