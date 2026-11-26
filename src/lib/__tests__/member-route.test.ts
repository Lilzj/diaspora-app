/**
 * The rule a member-only route group applies to the session in front of it
 * (FARCH-006). It is the root layout's own rule, so each case says what the root
 * layout does in the same situation: a group withholds itself exactly when the
 * root layout is about to move the member, or does not yet know who they are.
 */
import { memberRouteDecision, type MemberSession } from '@/lib/platform/member-route';
import type { AccountState } from '@/types/trust';

const MEMBER: MemberSession = {
  status: 'authenticated',
  isAuthenticated: true,
  isExploringLimited: false,
  accountState: 'DiasporaVerified',
};

const HELD: AccountState[] = [
  'DiasporaVerificationPending',
  'VerificationUnderReview',
  'VerificationRejected',
  'RequiresMoreInformation',
  'Suspended',
  'Restricted',
  'AppealPending',
];

const NOT_HELD: AccountState[] = ['DiasporaVerified', 'LimitedAccess', 'PhoneVerified', 'RegistrationStarted'];

describe('what a member-only group does with the session in front of it', () => {
  it.each(['unknown', 'restoring'] as const)(
    'waits while the session is %s, whoever it turns out to be',
    (status) => {
      // The root layout does nothing until the keystore has been read: acting
      // on `isAuthenticated` before then sent signed-in members to sign in.
      expect(memberRouteDecision({ ...MEMBER, status })).toBe('wait');
      expect(memberRouteDecision({ ...MEMBER, status, isAuthenticated: false, accountState: null })).toBe('wait');
    }
  );

  it('waits through a cold-start refresh that has not set the session yet', () => {
    expect(
      memberRouteDecision({ ...MEMBER, status: 'refreshing', isAuthenticated: false, accountState: undefined })
    ).toBe('wait');
  });

  it('stays on screen through a refresh in the middle of a session', () => {
    expect(memberRouteDecision({ ...MEMBER, status: 'refreshing' })).toBe('enter');
  });

  it('withholds the group from a caller with no session', () => {
    expect(
      memberRouteDecision({
        status: 'unauthenticated',
        isAuthenticated: false,
        isExploringLimited: false,
        accountState: null,
      })
    ).toBe('sign-in');
  });

  it.each(HELD)('withholds the group from a member held as %s', (accountState) => {
    expect(memberRouteDecision({ ...MEMBER, accountState })).toBe('gateway');
  });

  it.each(HELD)('lets a member held as %s through while they explore, as the root layout does', (accountState) => {
    expect(memberRouteDecision({ ...MEMBER, accountState, isExploringLimited: true })).toBe('enter');
  });

  it.each(NOT_HELD)('lets a member in %s in', (accountState) => {
    expect(memberRouteDecision({ ...MEMBER, accountState })).toBe('enter');
  });

  it('lets in a session whose profile has not loaded, as the root layout does', () => {
    expect(memberRouteDecision({ ...MEMBER, accountState: undefined })).toBe('enter');
  });
});
