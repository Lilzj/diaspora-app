// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community authorization and membership actions (Frontend
// Phase 13, §33, §34, §35, §37, §62, §74, §75)
//
// The security-oriented tests. §62's rule is the one under test throughout:
//
//     NEVER TRUST FRONTEND COMMUNITY STATE FOR MEMBERSHIP, ROLES, MODERATION,
//     AMBASSADOR STATUS, COMMUNITY PERMISSIONS, CONTENT ACCESS OR PRIVATE
//     STATISTICS. THE BACKEND REMAINS AUTHORITATIVE.
//
// Which in practice means: a role must never grant anything. So the first block
// below takes a member who is a Moderator, an Ambassador *and* an Administrator by
// role and gives them a capability set with everything false — and asserts that
// every single gated action is refused. If any of them passed, the role would be
// doing the deciding somewhere.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Community,
  CommunityCapabilities,
  CommunityMembership,
} from '@/types/community-directory';
import { noCommunityCapabilities } from '@/types/community-directory';
// `CommunityAction` belongs to the access module rather than to the domain model:
// it names a thing the *UI* gates, not a thing the platform has.
import type { CommunityAction } from '@/lib/community/access';
import {
  canPerform,
  capabilitiesOrNone,
  communityUnavailableReason,
  evaluateCommunityAction,
  hasRoleBadge,
  offerableMembershipActions,
} from '@/lib/community/access';

const ALL_ACTIONS: CommunityAction[] = [
  'view-members',
  'view-private-statistics',
  'post-to-community',
  'moderate-content',
  'review-reports',
  'publish-notice',
  'manage-rules',
  'manage-roles',
  'view-moderation-queue',
  'view-ambassador-directory',
  'manage-initiatives',
];

function community(overrides: Partial<Community> = {}): Community {
  return {
    id: 'ng',
    slug: 'nigerian',
    name: 'Nigerian',
    type: 'NationalDiaspora',
    origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬' },
    identity: { logoUrl: null, iconName: null, accentColor: null },
    status: 'Active',
    visibility: 'Public',
    ...overrides,
  } as Community;
}

function membership(overrides: Partial<CommunityMembership> = {}): CommunityMembership {
  const state = overrides.state ?? 'Member';

  return {
    communityId: 'ng',
    state,
    isPrimary: false,
    roles: [],
    // What the platform reports for this standing: a current member may leave.
    capabilities: {
      ...noCommunityCapabilities('ng'),
      canLeave: state === 'Member' || state === 'VerifiedMember',
    },
    visibility: 'Private',
    ...overrides,
  };
}

function allCapabilities(): CommunityCapabilities {
  const base = noCommunityCapabilities('ng');
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, typeof value === 'boolean' ? true : value])
  ) as CommunityCapabilities;
}

// ═════════════════════════════════════════════════════════════════════════════
// §62 — a role grants nothing
// ═════════════════════════════════════════════════════════════════════════════

describe('a role grants nothing (§37, §62)', () => {
  const impressiveRoles = membership({
    state: 'VerifiedMember',
    roles: ['Member', 'Moderator', 'Ambassador', 'Administrator'],
    // …and a capability set where the server said no to everything.
    capabilities: noCommunityCapabilities('ng'),
  });

  it.each(ALL_ACTIONS)('refuses %s despite every role being held', (action) => {
    const verdict = evaluateCommunityAction({
      action,
      capabilities: impressiveRoles.capabilities,
      community: community(),
      membership: impressiveRoles,
    });

    expect(verdict.kind).toBe('hidden');
    expect(canPerform(action, impressiveRoles.capabilities)).toBe(false);
  });

  it.each(ALL_ACTIONS)('hides %s when no capability set was reported at all', (action) => {
    // Absence is refusal. A screen whose capability query has not resolved must not
    // draw the affordance optimistically.
    expect(evaluateCommunityAction({ action, capabilities: null }).kind).toBe('hidden');
    expect(evaluateCommunityAction({ action, capabilities: undefined }).kind).toBe('hidden');
    expect(canPerform(action, null)).toBe(false);
  });

  it.each(ALL_ACTIONS)('allows %s when — and only when — the server said so', (action) => {
    expect(evaluateCommunityAction({ action, capabilities: allCapabilities() }).kind).toBe(
      'allowed'
    );
  });

  it('maps each action to its own capability, so one does not imply another', () => {
    const onlyViewQueue: CommunityCapabilities = {
      ...noCommunityCapabilities('ng'),
      canViewModerationQueue: true,
    };

    // Viewing a queue and deciding on it are different permissions. A deployment
    // will eventually grant one without the other, and the UI must handle it.
    expect(canPerform('view-moderation-queue', onlyViewQueue)).toBe(true);
    expect(canPerform('review-reports', onlyViewQueue)).toBe(false);
    expect(canPerform('moderate-content', onlyViewQueue)).toBe(false);
  });

  it('renders a role badge from the server’s own echo, and nothing more', () => {
    const holder = membership({ roles: ['Moderator'] });

    expect(hasRoleBadge('Moderator', holder)).toBe(true);
    expect(hasRoleBadge('Ambassador', holder)).toBe(false);
    expect(hasRoleBadge('Moderator', null)).toBe(false);
    expect(hasRoleBadge('Moderator', membership({ roles: [] }))).toBe(false);
  });

  it('falls back to an all-false capability set rather than to null', () => {
    const fallback = capabilitiesOrNone('ng', null);

    expect(fallback.communityId).toBe('ng');
    for (const action of ALL_ACTIONS) {
      expect(canPerform(action, fallback)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §74 / §75 — lifecycle beats capability
// ═════════════════════════════════════════════════════════════════════════════

describe('lifecycle blocks before capability is consulted (§74, §75)', () => {
  it('blocks everything in a suspended community, with the server’s reason', () => {
    const suspended = community({
      status: 'Suspended',
      statusReason: 'Paused while reports are reviewed.',
    });

    const verdict = evaluateCommunityAction({
      action: 'post-to-community',
      capabilities: allCapabilities(),
      community: suspended,
    });

    expect(verdict).toEqual({
      kind: 'blocked',
      reason: 'community-suspended',
      detail: 'Paused while reports are reviewed.',
    });
  });

  it('blocks everything in an archived community', () => {
    const verdict = evaluateCommunityAction({
      action: 'post-to-community',
      capabilities: allCapabilities(),
      community: community({ status: 'Archived' }),
    });

    expect(verdict.kind).toBe('blocked');
    expect(verdict.kind === 'blocked' && verdict.reason).toBe('community-archived');
  });

  it('blocks a revoked member even where the capability set still says yes', () => {
    // A stale capability set is exactly the case this ordering exists for.
    const verdict = evaluateCommunityAction({
      action: 'view-members',
      capabilities: allCapabilities(),
      community: community(),
      membership: membership({ state: 'Revoked', stateReason: 'Repeated reports.' }),
    });

    expect(verdict).toEqual({
      kind: 'blocked',
      reason: 'membership-revoked',
      detail: 'Repeated reports.',
    });
  });

  it('leaves a pending community readable', () => {
    // `Pending` is not blocked: the profile renders, and only joining is refused.
    expect(communityUnavailableReason(community({ status: 'Pending' }))).toBeNull();
    expect(communityUnavailableReason(community({ status: 'Active' }))).toBeNull();
  });

  it('names each unavailable lifecycle distinctly', () => {
    expect(communityUnavailableReason(community({ status: 'Suspended' }))).toBe(
      'community-suspended'
    );
    expect(communityUnavailableReason(community({ status: 'Archived' }))).toBe('community-archived');
    expect(communityUnavailableReason(community({ status: 'Unavailable' }))).toBe('not-found');
    expect(communityUnavailableReason(null)).toBe('not-found');
    expect(communityUnavailableReason(undefined)).toBe('not-found');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §33 — which membership actions are coherent to offer
// ═════════════════════════════════════════════════════════════════════════════

describe('offerableMembershipActions (§33, §74)', () => {
  it('offers join, follow and interest to somebody with no relationship', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: null,
      hasPrimary: false,
    });

    expect([...offers].sort()).toEqual(['express-interest', 'follow', 'join']);
  });

  it('offers leave and set-primary to a member who is not primary', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Member' }),
      hasPrimary: true,
    });

    expect(offers.has('leave')).toBe(true);
    expect(offers.has('set-primary')).toBe(true);
    expect(offers.has('join')).toBe(false);
  });

  it('does not offer the owner a way to leave — 11 Sep 2026', () => {
    // The founder's own page offered "Leave" beside the owner badge. Leaving
    // clears every role, so one tap left a community with nobody who could
    // appoint anyone. The platform refuses it, and says so in `canLeave`.
    const owner = membership({
      state: 'Member',
      roles: ['Owner', 'Administrator'],
      capabilities: { ...noCommunityCapabilities('ng'), roles: ['Owner', 'Administrator'], canLeave: false },
    });

    const offers = offerableMembershipActions({
      community: community(),
      membership: owner,
      hasPrimary: false,
    });

    expect(offers.has('leave')).toBe(false);
    // Everything else a member may do is still there.
    expect(offers.has('set-primary')).toBe(true);
  });

  it('follows the platform, not the roles list', () => {
    // An Owner entry in `roles` with `canLeave: true` is offered Leave: the
    // capability decides, and `roles` is for display.
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Member', roles: ['Owner'] }),
      hasPrimary: false,
    });

    expect(offers.has('leave')).toBe(true);
  });

  it('offers clear-primary rather than set-primary to the primary community', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'VerifiedMember', isPrimary: true }),
      hasPrimary: true,
    });

    expect(offers.has('clear-primary')).toBe(true);
    expect(offers.has('set-primary')).toBe(false);
  });

  it('offers only a cancellation while an application is pending', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'PendingApproval' }),
      hasPrimary: false,
    });

    expect([...offers]).toEqual(['cancel-application']);
  });

  it('offers NOTHING to a revoked member — §74’s reason for the distinct state', () => {
    // Offering "Join" to somebody a community removed an hour ago is worse than
    // offering nothing, which is why `Revoked` is not collapsed into `None`.
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Revoked' }),
      hasPrimary: false,
    });

    expect(offers.size).toBe(0);
  });

  it('offers nothing to a declined applicant either', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Declined' }),
      hasPrimary: false,
    });

    expect(offers.size).toBe(0);
  });

  it('lets somebody who left rejoin', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Left' }),
      hasPrimary: false,
    });

    expect(offers.has('join')).toBe(true);
  });

  it('swaps interest for its removal once expressed', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Interested' }),
      hasPrimary: false,
    });

    expect(offers.has('remove-interest')).toBe(true);
    expect(offers.has('express-interest')).toBe(false);
    // Interest is not membership, so joining is still on the table (§8).
    expect(offers.has('join')).toBe(true);
  });

  it('swaps follow for unfollow once following', () => {
    const offers = offerableMembershipActions({
      community: community(),
      membership: membership({ state: 'Following' }),
      hasPrimary: false,
    });

    expect(offers.has('unfollow')).toBe(true);
    expect(offers.has('follow')).toBe(false);
  });

  it('does not offer joining a pending community, but still offers following it', () => {
    const offers = offerableMembershipActions({
      community: community({ status: 'Pending' }),
      membership: null,
      hasPrimary: false,
    });

    expect(offers.has('join')).toBe(false);
    expect(offers.has('follow')).toBe(true);
  });

  it('offers nothing at all for a suspended, archived or unavailable community', () => {
    for (const status of ['Suspended', 'Archived', 'Unavailable'] as const) {
      const offers = offerableMembershipActions({
        community: community({ status }),
        membership: membership({ state: 'Member' }),
        hasPrimary: false,
      });

      expect(offers.size).toBe(0);
    }
  });

  it('offers nothing when the community has not loaded', () => {
    expect(
      offerableMembershipActions({ community: null, membership: null, hasPrimary: false }).size
    ).toBe(0);
  });
});
