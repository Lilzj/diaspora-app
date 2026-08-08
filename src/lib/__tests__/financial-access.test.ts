// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Access ladder tests (Frontend Phase 5)
//
// These assert that the client's mirror of B15's permission table has not
// drifted from `FinancialPermissionContributor.cs`. Two properties carry the
// whole design:
//
//   * everything that moves money is Verified, without exception
//   * reading survives restriction, because somebody under review must still
//     be able to see what they hold
// ─────────────────────────────────────────────────────────────────────────────

import {
  AccessTier,
  FinancialPermissions,
  checkAccess,
  holdsPermission,
  isRestricted,
  resolveFinancialAccess,
  toAccessTier,
} from '../financial-access';
import type { AccountState } from '@/types/trust';

const WRITE_PERMISSIONS = [
  FinancialPermissions.PaymentsManage,
  FinancialPermissions.PurchasesCreate,
  FinancialPermissions.SubscriptionsManage,
  FinancialPermissions.PromotionsRedeem,
  FinancialPermissions.GivingCreate,
] as const;

const READ_PERMISSIONS = [
  FinancialPermissions.WalletRead,
  FinancialPermissions.PaymentsRead,
  FinancialPermissions.PurchasesRead,
  FinancialPermissions.SubscriptionsRead,
  FinancialPermissions.GivingRead,
] as const;

describe('tier projection', () => {
  it.each<[AccountState, AccessTier]>([
    ['RegistrationStarted', AccessTier.Onboarding],
    ['PhoneVerified', AccessTier.Onboarding],
    ['LimitedAccess', AccessTier.Limited],
    ['DiasporaVerificationPending', AccessTier.PendingVerification],
    ['VerificationUnderReview', AccessTier.PendingVerification],
    ['RequiresMoreInformation', AccessTier.PendingVerification],
    ['DiasporaVerified', AccessTier.Verified],
    ['FullCommunityAccess', AccessTier.Verified],
  ])('projects %s onto %s', (state, tier) => {
    expect(toAccessTier(state)).toBe(tier);
  });

  it('reports a restricted subject as Limited rather than Anonymous', () => {
    // The backend's reasoning: "signed in but restricted" has to stay
    // distinguishable from "not signed in" anywhere the tier is displayed.
    expect(toAccessTier('Suspended')).toBe(AccessTier.Limited);
    expect(toAccessTier('Restricted')).toBe(AccessTier.Limited);
  });

  it('treats a missing state as Anonymous', () => {
    expect(toAccessTier(undefined)).toBe(AccessTier.Anonymous);
    expect(toAccessTier(null)).toBe(AccessTier.Anonymous);
  });
});

describe('everything that moves money is Verified', () => {
  it.each(WRITE_PERMISSIONS)('%s is refused below Verified', (permission) => {
    expect(holdsPermission(permission, 'LimitedAccess', true)).toBe(false);
    expect(holdsPermission(permission, 'DiasporaVerificationPending', true)).toBe(false);
    expect(holdsPermission(permission, 'PhoneVerified', true)).toBe(false);
  });

  it.each(WRITE_PERMISSIONS)('%s is granted at Verified', (permission) => {
    expect(holdsPermission(permission, 'DiasporaVerified', true)).toBe(true);
    expect(holdsPermission(permission, 'FullCommunityAccess', true)).toBe(true);
  });

  it.each(WRITE_PERMISSIONS)('%s is refused while restricted, even when verified', (permission) => {
    expect(holdsPermission(permission, 'Suspended', true)).toBe(false);
    expect(holdsPermission(permission, 'Restricted', true)).toBe(false);
  });
});

describe('reading survives restriction', () => {
  it.each(READ_PERMISSIONS)('%s is granted while restricted', (permission) => {
    expect(holdsPermission(permission, 'Suspended', true)).toBe(true);
    expect(holdsPermission(permission, 'Restricted', true)).toBe(true);
  });

  it('opens wallet:read one rung lower than every other read', () => {
    // Exactly one permission opens at Onboarding: a welcome bonus can land
    // before verification, and somebody granted money must be able to see it.
    expect(holdsPermission(FinancialPermissions.WalletRead, 'PhoneVerified', true)).toBe(true);
    expect(holdsPermission(FinancialPermissions.PaymentsRead, 'PhoneVerified', true)).toBe(false);
    expect(holdsPermission(FinancialPermissions.GivingRead, 'PhoneVerified', true)).toBe(false);
  });

  it('grants nothing at all to somebody signed out', () => {
    for (const permission of [...READ_PERMISSIONS, ...WRITE_PERMISSIONS]) {
      expect(holdsPermission(permission, 'DiasporaVerified', false)).toBe(false);
    }
  });
});

describe('isRestricted', () => {
  it.each<AccountState>(['Suspended', 'Restricted', 'AppealPending', 'VerificationRejected'])(
    'treats %s as restricted',
    (state) => {
      expect(isRestricted(state)).toBe(true);
    }
  );

  it('does not treat a pending verification as a restriction', () => {
    expect(isRestricted('DiasporaVerificationPending')).toBe(false);
    expect(isRestricted('VerificationUnderReview')).toBe(false);
  });
});

describe('checkAccess reasons', () => {
  it('distinguishes signed out from unverified', () => {
    const signedOut = checkAccess(FinancialPermissions.PaymentsManage, 'DiasporaVerified', false);
    expect(signedOut).toMatchObject({ allowed: false, reason: 'signedOut', action: 'signIn' });
  });

  it('does not tell somebody under review to start verifying', () => {
    // The most important distinction in this table. Telling somebody whose
    // verification is already with the Trust Engine to "start verification" is
    // telling them to do something they have done.
    const pending = checkAccess(FinancialPermissions.PaymentsManage, 'VerificationUnderReview', true);

    expect(pending).toMatchObject({ allowed: false, reason: 'pendingVerification' });
    expect('action' in pending ? pending.action : undefined).toBeUndefined();
    expect(pending.allowed === false && pending.message).toMatch(/being reviewed/i);
  });

  it('sends an unverified member to verification', () => {
    const unverified = checkAccess(FinancialPermissions.PaymentsManage, 'LimitedAccess', true);
    expect(unverified).toMatchObject({ allowed: false, reason: 'unverified', action: 'verify' });
  });

  it('tells a restricted member that reading still works', () => {
    const restricted = checkAccess(FinancialPermissions.PaymentsManage, 'Suspended', true);

    expect(restricted).toMatchObject({ allowed: false, reason: 'restricted', action: 'appeal' });
    expect(restricted.allowed === false && restricted.message).toMatch(/still see your balance/i);
  });

  it('allows a verified member', () => {
    expect(checkAccess(FinancialPermissions.PaymentsManage, 'DiasporaVerified', true)).toEqual({
      allowed: true,
    });
  });
});

describe('resolveFinancialAccess', () => {
  it('describes a verified member', () => {
    const access = resolveFinancialAccess('DiasporaVerified', true);

    expect(access).toMatchObject({
      tier: AccessTier.Verified,
      isRestricted: false,
      canReadWallet: true,
      canPay: true,
      canPurchase: true,
      canGive: true,
    });
  });

  it('describes a restricted member as able to read and unable to pay', () => {
    const access = resolveFinancialAccess('Suspended', true);

    expect(access.canReadWallet).toBe(true);
    expect(access.canReadPayments).toBe(true);
    expect(access.canPay).toBe(false);
    expect(access.canGive).toBe(false);
    expect(access.isRestricted).toBe(true);
  });

  it('describes somebody signed out as holding nothing', () => {
    const access = resolveFinancialAccess('DiasporaVerified', false);

    expect(access.tier).toBe(AccessTier.Anonymous);
    expect(access.canReadWallet).toBe(false);
    expect(access.canPay).toBe(false);
  });
});
