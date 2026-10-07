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
 * `FeatureGate` — which opens only for `'DiasporaVerified'` or
 * `'FullCommunityAccess'` — never matched.
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
 * * **`FullCommunityAccess` is unreachable.** Nothing in the backend maps to it.
 *   It is left in the union rather than removed because other screens branch on
 *   it, and deleting a member of a shared union is a wider change than this
 *   defect warrants — but nothing will ever produce it.
 *
 * An unrecognised value falls back to `LimitedAccess`: the least-privileged
 * state. A new backend state must not silently grant anything, and this is the
 * direction to be wrong in.
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

/** Whether a state grants the contributor surface `FeatureGate` protects. */
export function grantsCommunityAccess(state: AccountState): boolean {
  return state === 'DiasporaVerified' || state === 'FullCommunityAccess';
}
