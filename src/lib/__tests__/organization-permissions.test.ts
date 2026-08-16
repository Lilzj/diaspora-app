// ─────────────────────────────────────────────────────────────────────────────
// Organisation permissions — §23, §37
//
// The owner-protection rules are the part of this module that can silently do
// harm: every other function is presentation, but `canChangeRole` returning
// `allowed` on the last owner leaves an organisation nobody can administer, and
// the server would accept it because from its side it is a legitimate
// assignment by somebody holding `canManageMembers`.
//
// So these tests are mostly about refusals — the cases where a control must not
// be drawn — rather than about the happy path.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CAPABILITY_ORDER,
  ROLE_CATALOGUE,
  assignableRoles,
  canChangeRole,
  canRemoveMember,
  describeCreatorRole,
  describeRole,
  isReadOnly,
  splitCapabilities,
} from '../organization-permissions';
import type { OrganizationCapabilities, OrganizationRole } from '@/types/community-advanced';

function caps(overrides: Partial<OrganizationCapabilities> = {}): OrganizationCapabilities {
  return {
    organizationId: 'org-1',
    role: 'Member',
    canManageMembers: false,
    canApproveMembers: false,
    canManageTiers: false,
    canManageEvents: false,
    canManageCampaigns: false,
    canManageVolunteers: false,
    canManagePolls: false,
    canPublishAnnouncements: false,
    canViewAnalytics: false,
    canViewFinancials: false,
    ...overrides,
  };
}

const owner = caps({
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
});

const organizer = caps({
  role: 'Organizer',
  canManageEvents: true,
  canManageVolunteers: true,
  canManagePolls: true,
  canPublishAnnouncements: true,
  canViewAnalytics: true,
});

const member = caps({ role: 'Member' });

const asMember = (role: OrganizationRole, userId = 'u-1') => ({ userId, role });

// ─────────────────────────────────────────────────────────────────────────────

describe('splitCapabilities', () => {
  it('accounts for every flag exactly once', () => {
    const { granted, withheld } = splitCapabilities(organizer);
    expect(granted.length + withheld.length).toBe(CAPABILITY_ORDER.length);
    expect(new Set([...granted, ...withheld]).size).toBe(CAPABILITY_ORDER.length);
  });

  it('puts the granted flags in catalogue order, not fetch order', () => {
    const { granted } = splitCapabilities(organizer);
    const positions = granted.map((key) => CAPABILITY_ORDER.indexOf(key));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('isReadOnly', () => {
  it('is true for a plain member', () => {
    expect(isReadOnly(member)).toBe(true);
  });

  it('is false as soon as one capability is granted', () => {
    expect(isReadOnly(caps({ canViewAnalytics: true }))).toBe(false);
  });

  it('is false for an owner', () => {
    expect(isReadOnly(owner)).toBe(false);
  });
});

describe('canChangeRole — owner protection', () => {
  it('refuses when the caller cannot manage members', () => {
    const verdict = canChangeRole(asMember('Moderator'), { capabilities: organizer, ownerCount: 2 });
    expect(verdict.allowed).toBe(false);
  });

  it('refuses to demote the only owner', () => {
    const verdict = canChangeRole(asMember('Owner'), { capabilities: owner, ownerCount: 1 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/only owner/i);
  });

  it('refuses when no owner is loaded at all, rather than assuming there is another', () => {
    // A paged roster that has not yet loaded an owner reports zero. Zero is not
    // evidence of a second owner, so it must refuse for the same reason one does.
    const verdict = canChangeRole(asMember('Owner'), { capabilities: owner, ownerCount: 0 });
    expect(verdict.allowed).toBe(false);
  });

  it('allows demoting an owner when a second one exists', () => {
    const verdict = canChangeRole(asMember('Owner'), { capabilities: owner, ownerCount: 2 });
    expect(verdict.allowed).toBe(true);
  });

  it('refuses an owner changing their own owner role even with a second owner', () => {
    const verdict = canChangeRole(asMember('Owner', 'me'), {
      capabilities: owner,
      ownerCount: 3,
      selfUserId: 'me',
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/transfer ownership/i);
  });

  it('allows an owner to change a non-owner', () => {
    expect(canChangeRole(asMember('Member'), { capabilities: owner, ownerCount: 1 }).allowed).toBe(
      true,
    );
  });
});

describe('canRemoveMember', () => {
  it('never allows removing an owner, however many there are', () => {
    expect(canRemoveMember(asMember('Owner'), { capabilities: owner, ownerCount: 5 }).allowed).toBe(
      false,
    );
  });

  it('refuses when the caller cannot manage members', () => {
    expect(
      canRemoveMember(asMember('Member'), { capabilities: member, ownerCount: 2 }).allowed,
    ).toBe(false);
  });

  it('refuses self-removal, which is a membership action rather than a roster one', () => {
    const verdict = canRemoveMember(asMember('Moderator', 'me'), {
      capabilities: owner,
      ownerCount: 2,
      selfUserId: 'me',
    });
    expect(verdict.allowed).toBe(false);
  });

  it('allows an owner to remove an ordinary member', () => {
    expect(
      canRemoveMember(asMember('Member'), { capabilities: owner, ownerCount: 1, selfUserId: 'me' })
        .allowed,
    ).toBe(true);
  });
});

describe('assignableRoles', () => {
  it('is empty without canManageMembers, whatever the role name says', () => {
    expect(assignableRoles(caps({ role: 'Owner' }))).toEqual([]);
  });

  it('lets an owner assign every role including Owner', () => {
    expect(assignableRoles(owner)).toContain('Owner');
    expect(assignableRoles(owner)).toHaveLength(ROLE_CATALOGUE.length);
  });

  it('withholds Owner from anyone who is not one', () => {
    const administrator = caps({ role: 'Administrator', canManageMembers: true });
    expect(assignableRoles(administrator)).not.toContain('Owner');
    expect(assignableRoles(administrator)).toHaveLength(ROLE_CATALOGUE.length - 1);
  });
});

describe('describeRole', () => {
  it('finds every role in the catalogue', () => {
    for (const entry of ROLE_CATALOGUE) {
      expect(describeRole(entry.role).role).toBe(entry.role);
    }
  });

  it('falls back to Member for a null role rather than throwing', () => {
    expect(describeRole(null).role).toBe('Member');
    expect(describeRole(undefined).role).toBe('Member');
  });

  it('gives Member no conventional capabilities', () => {
    expect(describeRole('Member').conventional).toEqual([]);
  });

  it('gives Owner all of them', () => {
    expect(describeRole('Owner').conventional).toHaveLength(CAPABILITY_ORDER.length);
  });
});

describe('describeCreatorRole', () => {
  it('maps every creator label onto a canonical role', () => {
    const canonical = ROLE_CATALOGUE.map((entry) => entry.role);
    for (const role of ['owner', 'manager', 'moderator', 'contributor'] as const) {
      expect(canonical).toContain(describeCreatorRole(role).canonical);
    }
  });

  it('maps contributor to Member, not to a management role', () => {
    // A contributor badge on the card must not read as management. The card is
    // a label; the sheet behind it reads the fetched capability set.
    expect(describeCreatorRole('contributor').canonical).toBe('Member');
    expect(describeRole(describeCreatorRole('contributor').canonical).conventional).toEqual([]);
  });
});
