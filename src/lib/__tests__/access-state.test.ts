import {
  DEFAULT_ACCOUNT_STATE,
  KNOWN_ACCESS_STATES,
  grantsCommunityAccess,
  toAccountState,
} from '@/lib/access-state';
import type { AccountState } from '@/types/trust';

/**
 * DEFECT-007. The client and the backend hold two different vocabularies for the
 * same idea, and the store used to bridge them with `as AccountState`.
 *
 * A cast asserts rather than checks, so the backend's `"Verified"` was stored as
 * though it were a valid `AccountState`, the compiler had nothing to object to,
 * and `FeatureGate` — which opens only for `'DiasporaVerified'` — never matched.
 * **The gate never opened for any member, however verified**, and every screen it
 * wraps was permanently locked.
 *
 * The regression these tests guard is not "Verified maps to DiasporaVerified".
 * It is that **the mapping covers the backend's enumeration exactly**. A state
 * added on the server and not taught here is the same defect returning, and the
 * first test below is the one that catches it.
 */
describe('access state translation', () => {
  /**
   * `Diaspora.Domain/Identity/AccessStates/AccessState.cs`, in declaration order.
   *
   * Written out rather than imported because there is nothing to import from —
   * the backend is a separate repository and a separate language. That is
   * precisely why the drift went unnoticed, and why this list exists: it is the
   * one place the two vocabularies are asserted against each other.
   */
  const BACKEND_ACCESS_STATES = [
    'RegistrationStarted',
    'PhoneVerificationPending',
    'LimitedAccess',
    'VerificationPending',
    'VerificationUnderReview',
    'Verified',
    'Suspended',
    'Locked',
    'Disabled',
  ] as const;

  it('translates every state the backend can send', () => {
    // The assertion that matters. If the backend gains a state and this list is
    // updated without teaching the mapping, this fails; if the mapping is
    // updated without the list, the next test fails.
    for (const state of BACKEND_ACCESS_STATES) {
      expect(KNOWN_ACCESS_STATES).toContain(state);
    }
  });

  it('does not claim to translate states the backend cannot send', () => {
    for (const known of KNOWN_ACCESS_STATES) {
      expect(BACKEND_ACCESS_STATES).toContain(known as (typeof BACKEND_ACCESS_STATES)[number]);
    }
  });

  it('opens the gate for a verified member — the defect itself', () => {
    // `AccessState.Verified` is documented server-side as "Trust Engine granted
    // verification. Full contributor access." If this ever stops opening the
    // gate, the whole contributor surface is locked again.
    expect(grantsCommunityAccess(toAccountState('Verified'))).toBe(true);
  });

  it.each([
    ['RegistrationStarted', 'RegistrationStarted'],
    ['PhoneVerificationPending', 'PhoneVerified'],
    ['LimitedAccess', 'LimitedAccess'],
    ['VerificationPending', 'DiasporaVerificationPending'],
    ['VerificationUnderReview', 'VerificationUnderReview'],
    ['Verified', 'DiasporaVerified'],
    ['Suspended', 'Suspended'],
    ['Locked', 'Restricted'],
    ['Disabled', 'Restricted'],
  ])('maps %s to %s', (backend, expected) => {
    expect(toAccountState(backend)).toBe(expected as AccountState);
  });

  it.each([
    'LimitedAccess',
    'PhoneVerificationPending',
    'VerificationPending',
    'VerificationUnderReview',
    'Suspended',
    'Locked',
    'Disabled',
  ])('does not open the gate for %s', (backend) => {
    expect(grantsCommunityAccess(toAccountState(backend))).toBe(false);
  });

  it.each([[null], [undefined], [''], ['NotAState'], ['DiasporaVerified']])(
    'falls back to the least-privileged state for %p',
    (value) => {
      // Note `'DiasporaVerified'` is in this list on purpose: it is a *client*
      // value, not something the backend sends, so receiving it would mean
      // something upstream is echoing our vocabulary back at us. Falling back
      // is the safe reading — an unknown state must never grant.
      expect(toAccountState(value as string | null | undefined)).toBe(DEFAULT_ACCOUNT_STATE);
      expect(grantsCommunityAccess(toAccountState(value as string | null | undefined))).toBe(false);
    }
  );

  it('never grants access by accident', () => {
    // Whatever arrives, the only route to an open gate is an explicit mapping.
    const granting = BACKEND_ACCESS_STATES.filter((s) => grantsCommunityAccess(toAccountState(s)));
    expect(granting).toEqual(['Verified']);
  });
});
