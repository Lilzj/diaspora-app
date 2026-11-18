// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — where a member lands after signing in (FBL-003)
//
// This module had no tests. It decides, for every member, whether they reach
// the tabs or the access gateway, and it had been making that decision by
// comparing the **server's** access state against a set written in the
// **client's** vocabulary.
//
// Three of the set's eight entries matched, by coincidence of spelling. Five
// states the server actually sends matched nothing and routed to `/(tabs)`.
// The root layout's own redirect pulled most of them back out, which is why
// nothing was ever reported — a second mechanism quietly covering for the
// first, with nobody aware it was load-bearing.
//
// The cases below are written against the **server's** nine values, because
// that is what the function is given.
// ─────────────────────────────────────────────────────────────────────────────

import { routeForAccess } from '@/lib/auth-destination';
import { KNOWN_ACCESS_STATES, grantsCommunityAccess, toAccountState } from '@/lib/access-state';
import type { AccessDecision } from '@/types/auth';

const GATEWAY = '/access-gateway';
const TABS = '/(tabs)';

/** An access decision carrying only the two fields this module reads. */
function decision(accessState: string, destination = 'ExploreLimited'): AccessDecision {
  return { accessState, destination } as AccessDecision;
}

describe('the destination the server sends', () => {
  it('is obeyed when it is a route this app could have', () => {
    expect(routeForAccess(decision('LimitedAccess', '/verification/diaspora'))).toBe(
      '/verification/diaspora'
    );
  });

  it.each([
    'RegistrationCompletion',
    'PhoneVerification',
    'ExploreLimited',
    'VerificationDashboard',
    'VerificationUnderReview',
    'FullApplication',
    'SuspensionScreen',
    'AccountRecovery',
    'AccountDisabled',
  ])('is not a route, and does not decide: %s', (surface) => {
    // These nine are `AccessDestination` in full, serialised with `ToString()`.
    // **None of them starts with a slash**, so the branch this module's own
    // comment described as "the platform's own answer and preferred" has never
    // once executed, and the access state has been deciding alone.
    //
    // The branch stays — a server that starts sending paths should be obeyed
    // rather than ignored — and this is what keeps the claim honest.
    expect(routeForAccess(decision('Verified', surface))).toBe(TABS);
    expect(routeForAccess(decision('Suspended', surface))).toBe(GATEWAY);
  });
});

describe('where each of the server access states lands', () => {
  it('sends a verified member to the tabs', () => {
    expect(routeForAccess(decision('Verified'))).toBe(TABS);
  });

  it.each([
    // The three that happened to work: the two vocabularies spell these alike.
    'LimitedAccess',
    'VerificationUnderReview',
    'Suspended',
  ])('sends %s to the gateway, as it always did', (state) => {
    expect(routeForAccess(decision(state))).toBe(GATEWAY);
  });

  it.each([
    // The regression. Each of these routed to `/(tabs)`, because the set held
    // this client's word for it: `DiasporaVerificationPending` for the
    // server's `VerificationPending`, `Restricted` for `Locked` and
    // `Disabled`, and nothing at all for the two registration states.
    ['RegistrationStarted', 'the set had no entry for it'],
    ['PhoneVerificationPending', 'the set had no entry for it, and this state can sign in'],
    ['VerificationPending', 'the set spelled it DiasporaVerificationPending'],
    ['Locked', 'the set spelled it Restricted'],
    ['Disabled', 'the set spelled it Restricted'],
  ])('sends %s to the gateway — %s', (state) => {
    expect(routeForAccess(decision(state))).toBe(GATEWAY);
  });

  it('agrees with the feature gate on every state the server can send', () => {
    // One question, two readings: the gateway is for exactly the members the
    // feature gate refuses. Asserted across the whole enumeration rather than
    // case by case, so a state added to the mapping is covered the day it is.
    for (const state of KNOWN_ACCESS_STATES) {
      const expected = grantsCommunityAccess(toAccountState(state)) ? TABS : GATEWAY;
      expect(routeForAccess(decision(state))).toBe(expected);
    }
  });
});

describe('what it does with an answer it does not understand', () => {
  it.each([
    ['a state no build has heard of', 'PaymentHold'],
    ['a state spelled in the words of this client', 'DiasporaVerified'],
    ['an empty string', ''],
  ])('gates on %s', (_why, state) => {
    // Fail-closed, which the set was not: an unrecognised state was simply
    // absent from it and therefore routed to the tabs. A server that grows a
    // state now sends members to the gateway instead, which is the direction
    // to be wrong in — and the same reasoning `toAccountState` already applies
    // to the translation itself.
    expect(routeForAccess(decision(state))).toBe(GATEWAY);
  });

  it('gates when there is no access decision at all', () => {
    expect(routeForAccess(null)).toBe(GATEWAY);
    expect(routeForAccess(undefined)).toBe(GATEWAY);
    expect(routeForAccess({} as AccessDecision)).toBe(GATEWAY);
  });
});
