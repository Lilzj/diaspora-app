import type { AccountState } from '@/types/trust';

/**
 * Translates the backend's `AccessState` into this client's `AccountState`.
 *
 * ── Why a translation and not a cast ─────────────────────────────────────────
 *
 * These are two different vocabularies that were never reconciled, and the store
 * used to bridge them with `as AccountState` — a cast, which asserts a claim
 * rather than checking one. The backend's `"Verified"` was therefore stored as
 * though it were a valid `AccountState`, TypeScript could not object, and
 * `FeatureGate` — which opened only for `'DiasporaVerified'` — never matched.
 *
 * **The gate never opened, for any member, however verified.** Everything it
 * wraps was permanently locked: the home feed, Discover, Create, Knowledge,
 * event creation, organisation creation, update creation. A member whose
 * Diaspora verification was `Approved` and whose `AccessState` was `Verified`
 * still saw "Community access is available after Diaspora Verification".
 *
 * That is what a cast buys: the compiler stops asking, and the mismatch moves
 * from build time to a lock screen nobody can get past.
 *
 * ── The mapping ──────────────────────────────────────────────────────────────
 *
 * Every value the backend's `AccessState` enumeration can hold is listed. The
 * two vocabularies genuinely differ in shape, so the interesting rows are the
 * ones that are not a rename:
 *
 * * **`Verified` → `DiasporaVerified`.** The backend's `Verified` is documented
 *   as *"Trust Engine granted verification. Full contributor access."*, which is
 *   what this client calls `DiasporaVerified`. This row is the one that unlocks
 *   the gate.
 * * **`Locked` and `Disabled` → `Restricted`.** The client union has no member
 *   for either. `Restricted` is the nearest thing it has that denies access, and
 *   collapsing them is safe in the direction that matters: it never grants.
 *
 * An unrecognised value falls back to `LimitedAccess`: the least-privileged
 * state. A new backend state must not silently grant anything, and this is the
 * direction to be wrong in.
 *
 * ── Every place the two vocabularies meet is in this file ────────────────────
 *
 * That was the point of the module and it was not true until 18 Nov 2026.
 * `auth-destination.ts` held a second, independent bridge — a set of states
 * that send a member to the gateway, compared against the **server's** raw
 * `accessState` and written in the **client's** words. Three of its eight
 * entries matched by coincidence of spelling and five could never match at all.
 * It now calls {@link toAccountState} like everything else, and
 * {@link GATED_ACCOUNT_STATES} below is the list it consults.
 *
 * A second bridge is how the original defect returns, so if a third is ever
 * needed, it belongs here.
 */
const ACCESS_STATE_TO_ACCOUNT_STATE: Readonly<Record<string, AccountState>> = {
  RegistrationStarted: 'RegistrationStarted',
  PhoneVerificationPending: 'PhoneVerified',
  LimitedAccess: 'LimitedAccess',
  VerificationPending: 'DiasporaVerificationPending',
  VerificationUnderReview: 'VerificationUnderReview',
  Verified: 'DiasporaVerified',
  Suspended: 'Suspended',
  Locked: 'Restricted',
  Disabled: 'Restricted',
};

/** The least-privileged state. What an unknown value becomes. */
export const DEFAULT_ACCOUNT_STATE: AccountState = 'LimitedAccess';

/**
 * Maps a backend `AccessState` string onto the client's `AccountState`.
 *
 * Returns {@link DEFAULT_ACCOUNT_STATE} for anything unrecognised, including
 * `null` and `undefined`, so a backend that grows a state cannot accidentally
 * unlock a screen in a client that has not been taught what the state means.
 */
export function toAccountState(accessState: string | null | undefined): AccountState {
  if (!accessState) return DEFAULT_ACCOUNT_STATE;
  return ACCESS_STATE_TO_ACCOUNT_STATE[accessState] ?? DEFAULT_ACCOUNT_STATE;
}

/**
 * Every backend `AccessState` this client knows how to translate.
 *
 * Exported for the regression test, which asserts this covers the backend's
 * enumeration exactly. That assertion is the thing that stops the two
 * vocabularies drifting apart again in silence.
 */
export const KNOWN_ACCESS_STATES: readonly string[] = Object.keys(ACCESS_STATE_TO_ACCOUNT_STATE);

/**
 * Whether the member is waiting on a decision somebody else makes — a reviewer
 * or an appeal. These are the states worth re-reading from the server while the
 * app is open, because nothing on the device will change them.
 */
export function isAwaitingDecision(state: AccountState | null | undefined): boolean {
  return (
    state === 'DiasporaVerificationPending' ||
    state === 'VerificationUnderReview' ||
    state === 'RequiresMoreInformation' ||
    state === 'AppealPending'
  );
}

/**
 * Whether a member in this state is held at the access gateway: their account
 * needs a decision or an action before the rest of the app opens to them.
 *
 * The root layout sends a held member to `/access-gateway` from wherever they
 * are, unless they chose to explore with limited access, and every member-only
 * route group withholds itself on the same terms (`memberRouteDecision`). One
 * predicate, so the two cannot disagree about who is held. It was a seven-line
 * list written out in the root layout.
 *
 * Narrower than {@link requiresAccessGateway} on purpose. That one decides where
 * a member lands on signing in, and sends everyone not yet verified to the
 * gateway, where a member with limited access can choose to explore. This one
 * decides who may not leave it.
 */
export function confinesToGateway(state: AccountState | null | undefined): boolean {
  return (
    isAwaitingDecision(state) ||
    state === 'VerificationRejected' ||
    state === 'Suspended' ||
    state === 'Restricted'
  );
}

/** Whether a state grants the contributor surface `FeatureGate` protects. */
export function grantsCommunityAccess(state: AccountState): boolean {
  return state === 'DiasporaVerified';
}

/**
 * Whether a member in this **server** access state must be sent to the gateway
 * rather than to the tabs.
 *
 * ── Why this is one line and not a list ─────────────────────────────────────
 *
 * It was a list: a `Set<string>` in `auth-destination.ts` holding eight states,
 * compared against the server's raw `accessState` and written in this client's
 * words. Three entries matched by coincidence of spelling. Five could not match
 * anything the server can send, and five states the server does send matched
 * nothing — so a member in `VerificationPending`, `Locked` or `Disabled` was
 * routed to the tabs, and only the root layout's own redirect pulled them back.
 *
 * A second list of which states are gated is a second answer to a question that
 * already has one: the gateway exists for exactly the members the feature gate
 * refuses. Deriving it from {@link grantsCommunityAccess} means there is nothing
 * to keep in step.
 *
 * Unknown states become {@link DEFAULT_ACCOUNT_STATE} and are therefore gated.
 * A server that grows a state sends members to the gateway rather than into the
 * tabs, which is the direction to be wrong in — the same reasoning as the
 * mapping's own fallback, now applied to routing as well.
 */
export function requiresAccessGateway(accessState: string | null | undefined): boolean {
  return !grantsCommunityAccess(toAccountState(accessState));
}
