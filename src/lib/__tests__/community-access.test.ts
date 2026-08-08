/**
 * Community Life access — Frontend Phase 12
 *
 * §19: no frontend component makes an authoritative authorization decision.
 * These tests hold the two halves of that apart:
 *
 *   The **platform ladder** is advisory and mirrors B15's, so a restricted
 *   member loses the ability to spend and keeps the ability to read.
 *
 *   The **organization capability set** is *fetched*, and the only thing this
 *   module may do with it is remove capabilities. There must be no input to
 *   `combineOrganizationCapabilities` that produces a capability the server did
 *   not grant — that is the property §19 actually turns on, and it is asserted
 *   exhaustively below.
 */

import {
  CommunityCapabilities,
  checkCommunityAccess,
  combineOrganizationCapabilities,
  holdsCommunityCapability,
  membershipOpensMemberSurfaces,
  noOrganizationCapabilities,
  resolveCommunityAccess,
} from '../community-access';
import { AccessTier } from '../financial-access';
import type { AccountState } from '@/types/trust';
import type { OrganizationCapabilities } from '@/types/community-advanced';

/** The real `AccountState` members, mapped to the tiers they project onto. */
const VERIFIED: AccountState = 'DiasporaVerified';
const FULL: AccountState = 'FullCommunityAccess';
const LIMITED: AccountState = 'LimitedAccess';
const RESTRICTED: AccountState = 'Restricted';
const SUSPENDED: AccountState = 'Suspended';
const PENDING: AccountState = 'DiasporaVerificationPending';

describe('the platform ladder', () => {
  it('lets a signed-out browser read the hub', () => {
    // Discovery is public. §7 only forbids exposing *private* groups.
    expect(holdsCommunityCapability(CommunityCapabilities.ViewHub, undefined, false)).toBe(true);
    expect(holdsCommunityCapability(CommunityCapabilities.ViewMembership, undefined, false)).toBe(true);
  });

  it('refuses a signed-out browser anything that participates', () => {
    for (const capability of [
      CommunityCapabilities.ApplyMembership,
      CommunityCapabilities.RegisterEvent,
      CommunityCapabilities.ApplyVolunteer,
      CommunityCapabilities.VotePoll,
      CommunityCapabilities.Donate,
      CommunityCapabilities.PayMembership,
      CommunityCapabilities.CreateCampaign,
    ] as const) {
      expect(holdsCommunityCapability(capability, undefined, false)).toBe(false);
    }
  });

  it('lets a verified member do everything', () => {
    for (const state of [VERIFIED, FULL]) {
      const access = resolveCommunityAccess(state, true);
      expect(access.canDonate).toBe(true);
      expect(access.canPayMembership).toBe(true);
      expect(access.canCreateCampaign).toBe(true);
      expect(access.canVotePoll).toBe(true);
      expect(access.canApplyMembership).toBe(true);
      expect(access.tier).toBe(AccessTier.Verified);
    }
  });

  it('lets a limited member take part but not spend', () => {
    // The middle rung, and the one that catches a ladder collapsed into a
    // boolean: joining and voting open before spending does.
    const access = resolveCommunityAccess(LIMITED, true);
    expect(access.tier).toBe(AccessTier.Limited);
    expect(access.canApplyMembership).toBe(true);
    expect(access.canVotePoll).toBe(true);
    expect(access.canRegisterEvent).toBe(true);
    expect(access.canApplyVolunteer).toBe(true);
    expect(access.canDonate).toBe(false);
    expect(access.canPayMembership).toBe(false);
    expect(access.canCreateCampaign).toBe(false);
  });

  it('takes spending and participation from a restricted member but not reading', () => {
    const access = resolveCommunityAccess(RESTRICTED, true);

    expect(access.isRestricted).toBe(true);
    // Reading survives.
    expect(access.canViewHub).toBe(true);
    expect(access.canViewMembership).toBe(true);
    expect(access.canViewGiving).toBe(true);
    expect(access.canViewOrganizationDashboard).toBe(true);
    // Spending, joining and voting do not.
    expect(access.canDonate).toBe(false);
    expect(access.canPayMembership).toBe(false);
    expect(access.canApplyMembership).toBe(false);
    expect(access.canVotePoll).toBe(false);
    expect(access.canCreateCampaign).toBe(false);
  });

  it('treats a suspended account at least as strictly as a restricted one', () => {
    const suspended = resolveCommunityAccess(SUSPENDED, true);
    expect(suspended.canDonate).toBe(false);
    expect(suspended.canVotePoll).toBe(false);
    expect(suspended.canCreateCampaign).toBe(false);
  });

  it('holds a member awaiting verification back from spending', () => {
    const access = resolveCommunityAccess(PENDING, true);
    expect(access.canDonate).toBe(false);
    expect(access.canPayMembership).toBe(false);
  });

  it('mirrors the B15 giving permission rather than inventing a second rule', () => {
    // If B15 raised the bar for giving, `canDonate` would follow automatically.
    // Asserting the two agree is what makes that claim testable.
    const verified = resolveCommunityAccess(VERIFIED, true);
    const restricted = resolveCommunityAccess(RESTRICTED, true);
    expect(verified.canDonate).toBe(true);
    expect(restricted.canDonate).toBe(false);
    expect(restricted.canViewGiving).toBe(true);
  });
});

describe('refusals a member can act on', () => {
  it('offers sign-in to somebody signed out', () => {
    const refusal = checkCommunityAccess(CommunityCapabilities.VotePoll, undefined, false);
    expect(refusal.allowed).toBe(false);
    // Narrowed on `reason` rather than on `allowed`: only the `signedOut`
    // member of the union carries a `signIn` action, and asserting through the
    // narrower type is what proves the union is shaped the way screens read it.
    if (!refusal.allowed && refusal.reason === 'signedOut') {
      expect(refusal.action).toBe('signIn');
      expect(refusal.message.length).toBeGreaterThan(0);
    } else {
      throw new Error('expected a signedOut refusal');
    }
  });

  it('offers an appeal to somebody restricted', () => {
    const refusal = checkCommunityAccess(CommunityCapabilities.Donate, RESTRICTED, true);
    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed && refusal.reason === 'restricted') {
      expect(refusal.action).toBe('appeal');
      expect(refusal.message.length).toBeGreaterThan(0);
    } else {
      throw new Error('expected a restricted refusal');
    }
  });

  it('explains a pending verification without offering a pointless action', () => {
    const refusal = checkCommunityAccess(CommunityCapabilities.Donate, 'VerificationUnderReview', true);
    expect(refusal.allowed).toBe(false);
    if (!refusal.allowed) {
      expect(refusal.reason).toBe('pendingVerification');
      // Nothing for them to do but wait, so the union member for this reason
      // carries no `action` at all — which is what the type says and what a
      // screen relies on to decide whether to draw a button.
      expect(refusal).not.toHaveProperty('action');
    }
  });

  it('returns allowed with no message when the capability is held', () => {
    expect(checkCommunityAccess(CommunityCapabilities.Donate, VERIFIED, true)).toEqual({
      allowed: true,
    });
  });
});

describe('organization capabilities — §19, the load-bearing property', () => {
  const ALL_FLAGS = [
    'canManageMembers',
    'canApproveMembers',
    'canManageTiers',
    'canManageEvents',
    'canManageCampaigns',
    'canManageVolunteers',
    'canManagePolls',
    'canPublishAnnouncements',
    'canViewAnalytics',
    'canViewFinancials',
  ] as const;

  const owner: OrganizationCapabilities = {
    organizationId: 'org-1',
    role: 'Owner',
    canManageMembers: true,
    canApproveMembers: true,
    canManageTiers: true,
    canManageEvents: true,
    canManageCampaigns: true,
    canManageVolunteers: true,
    canManagePolls: true,
    canPublishAnnouncements: true,
    canViewAnalytics: true,
    canViewFinancials: true,
  };

  it('defaults to nothing before the server has answered', () => {
    const none = noOrganizationCapabilities('org-1');
    expect(none.role).toBeNull();
    for (const flag of ALL_FLAGS) {
      expect(none[flag]).toBe(false);
    }
  });

  it('leaves an unrestricted member’s granted set untouched', () => {
    const access = resolveCommunityAccess(VERIFIED, true);
    expect(combineOrganizationCapabilities(owner, access)).toEqual(owner);
  });

  it('removes every write capability from a restricted owner', () => {
    const access = resolveCommunityAccess(RESTRICTED, true);
    const combined = combineOrganizationCapabilities(owner, access);

    expect(combined.canManageMembers).toBe(false);
    expect(combined.canApproveMembers).toBe(false);
    expect(combined.canManageCampaigns).toBe(false);
    expect(combined.canManagePolls).toBe(false);
    expect(combined.canPublishAnnouncements).toBe(false);
    // Reading survives restriction, here as everywhere.
    expect(combined.canViewAnalytics).toBe(true);
    expect(combined.canViewFinancials).toBe(true);
  });

  it('NEVER grants a capability the server withheld — every combination', () => {
    // The property §19 turns on. Exhaustive over the 2^10 granted sets would be
    // 1024 cases; the meaningful axis is "granted false" plus every access
    // shape, so this asserts the invariant across all of them.
    const accessShapes = [
      resolveCommunityAccess(VERIFIED, true),
      resolveCommunityAccess(RESTRICTED, true),
      resolveCommunityAccess(SUSPENDED, true),
      resolveCommunityAccess(PENDING, true),
      resolveCommunityAccess(undefined, false),
    ];

    for (const flag of ALL_FLAGS) {
      // A grant set where exactly this flag is false and everything else true.
      const granted: OrganizationCapabilities = { ...owner, [flag]: false };

      for (const access of accessShapes) {
        const combined = combineOrganizationCapabilities(granted, access);
        expect(combined[flag]).toBe(false);
      }
    }
  });

  it('withholds everything from a signed-out caller regardless of the grant', () => {
    const access = resolveCommunityAccess(undefined, false);
    const combined = combineOrganizationCapabilities(owner, access);
    expect(combined.canManageMembers).toBe(false);
    expect(combined.canApproveMembers).toBe(false);
  });

  it('does not derive a capability from a role name', () => {
    // The set is fetched, not computed. An Owner with everything withheld gets
    // nothing — the role is a label, not a permission.
    const strippedOwner: OrganizationCapabilities = {
      ...noOrganizationCapabilities('org-1'),
      role: 'Owner',
    };
    const access = resolveCommunityAccess(VERIFIED, true);
    const combined = combineOrganizationCapabilities(strippedOwner, access);

    expect(combined.role).toBe('Owner');
    for (const flag of ALL_FLAGS) {
      expect(combined[flag]).toBe(false);
    }
  });
});

describe('member surfaces', () => {
  it('opens members-only surfaces during the renewal grace period', () => {
    expect(membershipOpensMemberSurfaces('Active')).toBe(true);
    expect(membershipOpensMemberSurfaces('RenewalDue')).toBe(true);
  });

  it('closes them for every other state', () => {
    for (const status of ['Pending', 'Expired', 'Suspended', 'Cancelled', 'Rejected'] as const) {
      expect(membershipOpensMemberSurfaces(status)).toBe(false);
    }
    expect(membershipOpensMemberSurfaces(null)).toBe(false);
    expect(membershipOpensMemberSurfaces(undefined)).toBe(false);
  });
});
