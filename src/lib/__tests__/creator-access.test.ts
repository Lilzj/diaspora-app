// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator access tests (Frontend Phase 7, §37)
//
// The access ladder decides what to *draw*, never what to allow, and these
// tests hold it to three properties:
//
//   Reading survives restriction. Somebody under review must still be able to
//   see their work and what they are owed.
//
//   Anything of value needs verification. A claim, a redemption, a grant
//   application and a sponsorship all clear the same bar as a payment.
//
//   A creator-programme suspension is reported as itself. Telling a suspended
//   creator to "verify your identity" — which they already did — is worse than
//   telling them nothing.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CreatorCapabilities,
  checkCreatorAccess,
  resolveCreatorAccess,
  type CreatorCapability,
} from '../creator-access';
import { AccessTier } from '../financial-access';
import type { AccountState } from '@/types/trust';

const verified: AccountState = 'DiasporaVerified';
const limited: AccountState = 'LimitedAccess';
const pending: AccountState = 'VerificationUnderReview';
const suspended: AccountState = 'Suspended';

const READ_CAPABILITIES: CreatorCapability[] = [
  CreatorCapabilities.ViewDashboard,
  CreatorCapabilities.ViewRevenue,
];

const VALUE_CAPABILITIES: CreatorCapability[] = [
  CreatorCapabilities.ClaimReward,
  CreatorCapabilities.ConvertPoints,
  CreatorCapabilities.ApplyGrant,
  CreatorCapabilities.SponsorContent,
];

describe('signing out refuses everything', () => {
  it.each(Object.values(CreatorCapabilities))('refuses %s to a signed-out visitor', (capability) => {
    const refusal = checkCreatorAccess(capability, {
      accountState: undefined,
      isAuthenticated: false,
    });

    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed && refusal.reason === 'signedOut') {
      expect(refusal.action).toBe('signIn');
    } else {
      throw new Error(`Expected a signedOut refusal for ${capability}.`);
    }
  });
});

describe('reading survives restriction', () => {
  it.each(READ_CAPABILITIES)('allows %s to a suspended account', (capability) => {
    // The member can still see their work and what they are owed. This is the
    // same rule `financial-access.ts` applies to the wallet, deliberately.
    const refusal = checkCreatorAccess(capability, {
      accountState: suspended,
      isAuthenticated: true,
    });

    expect(refusal.allowed).toBe(true);
  });

  it('allows the revenue dashboard to somebody still verifying', () => {
    const refusal = checkCreatorAccess(CreatorCapabilities.ViewRevenue, {
      accountState: pending,
      isAuthenticated: true,
    });

    expect(refusal.allowed).toBe(true);
  });
});

describe('anything of value needs verification', () => {
  it.each(VALUE_CAPABILITIES)('refuses %s to a merely limited account', (capability) => {
    const refusal = checkCreatorAccess(capability, {
      accountState: limited,
      isAuthenticated: true,
    });

    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed && refusal.reason === 'unverified') {
      expect(refusal.action).toBe('verify');
    } else {
      throw new Error(`Expected an unverified refusal for ${capability}.`);
    }
  });

  it.each(VALUE_CAPABILITIES)('allows %s once verified', (capability) => {
    const refusal = checkCreatorAccess(capability, {
      accountState: verified,
      isAuthenticated: true,
    });

    expect(refusal.allowed).toBe(true);
  });

  it('tells somebody mid-verification to wait rather than to verify again', () => {
    const refusal = checkCreatorAccess(CreatorCapabilities.ClaimReward, {
      accountState: pending,
      isAuthenticated: true,
    });

    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed) {
      expect(refusal.reason).toBe('pendingVerification');
      expect(refusal.message).toMatch(/being reviewed/i);
    }
  });
});

describe('a creator-programme suspension is reported as itself', () => {
  it('reports a suspended creator rather than an unverified one', () => {
    // The member is fully verified at platform level and suspended at creator
    // level. Telling them to verify would be wrong and infuriating.
    const refusal = checkCreatorAccess(CreatorCapabilities.ClaimReward, {
      accountState: verified,
      isAuthenticated: true,
      creatorStatus: 'Suspended',
    });

    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed && refusal.reason === 'creatorSuspended') {
      expect(refusal.action).toBe('appeal');
    } else {
      throw new Error('Expected a creatorSuspended refusal.');
    }
  });

  it('distinguishes a restricted creator from a suspended one', () => {
    const refusal = checkCreatorAccess(CreatorCapabilities.JoinChallenge, {
      accountState: verified,
      isAuthenticated: true,
      creatorStatus: 'Restricted',
    });

    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed) {
      expect(refusal.reason).toBe('creatorRestricted');
    }
  });

  it('still lets a suspended creator read their revenue', () => {
    const refusal = checkCreatorAccess(CreatorCapabilities.ViewRevenue, {
      accountState: verified,
      isAuthenticated: true,
      creatorStatus: 'Suspended',
    });

    expect(refusal.allowed).toBe(true);
  });

  it('lets a restricted creator edit their profile but not apply for verification', () => {
    const options = {
      accountState: verified,
      isAuthenticated: true,
      creatorStatus: 'Restricted' as const,
    };

    expect(checkCreatorAccess(CreatorCapabilities.ManageProfile, options).allowed).toBe(true);
    expect(checkCreatorAccess(CreatorCapabilities.ApplyVerification, options).allowed).toBe(false);
  });
});

describe('every refusal is something somebody can act on', () => {
  it.each(Object.values(CreatorCapabilities))('gives %s a full sentence when refused', (capability) => {
    const refusal = checkCreatorAccess(capability, {
      accountState: undefined,
      isAuthenticated: false,
    });

    if (!refusal.allowed) {
      expect(refusal.message.length).toBeGreaterThan(15);
      expect(refusal.message.endsWith('.')).toBe(true);
    }
  });
});

describe('the resolved capability set', () => {
  it('reports the platform tier alongside the creator status', () => {
    const access = resolveCreatorAccess({
      accountState: verified,
      isAuthenticated: true,
      creatorStatus: 'VerifiedCreator',
    });

    expect(access.tier).toBe(AccessTier.Verified);
    expect(access.creatorStatus).toBe('VerifiedCreator');
    expect(access.canClaimReward).toBe(true);
    expect(access.canSponsorContent).toBe(true);
  });

  it('reports Anonymous for a signed-out visitor whatever state is passed', () => {
    const access = resolveCreatorAccess({
      accountState: verified,
      isAuthenticated: false,
    });

    expect(access.tier).toBe(AccessTier.Anonymous);
    expect(access.canViewDashboard).toBe(false);
  });

  it('closes everything of value for a suspended creator and nothing that reads', () => {
    const access = resolveCreatorAccess({
      accountState: verified,
      isAuthenticated: true,
      creatorStatus: 'Suspended',
    });

    expect(access.canViewDashboard).toBe(true);
    expect(access.canViewRevenue).toBe(true);

    expect(access.canClaimReward).toBe(false);
    expect(access.canConvertPoints).toBe(false);
    expect(access.canApplyGrant).toBe(false);
    expect(access.canSponsorContent).toBe(false);
    expect(access.canJoinChallenge).toBe(false);
    expect(access.canShareReferral).toBe(false);
  });

  it('is conservative before the creator status has resolved', () => {
    // The profile query has not answered yet. The platform ladder alone is the
    // stricter of the two for everything that spends, so nothing dangerous
    // opens by default.
    const access = resolveCreatorAccess({
      accountState: limited,
      isAuthenticated: true,
      creatorStatus: null,
    });

    expect(access.canViewDashboard).toBe(true);
    expect(access.canConvertPoints).toBe(false);
    expect(access.canSponsorContent).toBe(false);
  });
});
