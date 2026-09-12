// ─────────────────────────────────────────────────────────────────────────────
// The role directory, from members the platform actually serves — 12 Sep 2026
//
// Found by sweeping for the Community Life hub's defect shape. Four screens —
// Rules, Moderators, Ambassadors, Initiatives — share one component whose
// `isEmpty` is `!isLoading && !isError && length === 0`. A query gated on
// `areMultiCommunityGapsEnabled()` never runs, and a query that never ran is not
// loading, not erroring and holds nothing: all three true, for ever, in every
// release build. So the screen said
//
//     Nothing here yet
//     There is no moderators to show for the communities you have chosen.
//     Try widening your community filter or looking in a wider area.
//
// to a community with moderators — asserting an absence it had never checked,
// and blaming the member's own filter for it.
//
// Moderators and Ambassadors had a real route all along: every row of
// `GET /communities/{idOrSlug}/members` carries its `roles`, and a role cannot be
// held without a visible membership. These tests pin the derivation.
// ─────────────────────────────────────────────────────────────────────────────

import { roleHoldersFromMembers } from '../community/roles';
import type { CommunityMember } from '@/types/community-directory';

function member(overrides: Partial<CommunityMember> & { userId: string }): CommunityMember {
  return {
    displayName: 'A member',
    roles: [],
    visibility: 'Community',
    joinedAt: '2026-01-15T00:00:00.000Z',
    isYou: false,
    ...overrides,
  } as CommunityMember;
}

const MEMBERS: CommunityMember[] = [
  member({ userId: 'u1', displayName: 'Zainab Bello', roles: ['Moderator'] }),
  member({ userId: 'u2', displayName: 'Adaeze Nwosu', roles: ['Moderator', 'Administrator'] }),
  member({ userId: 'u3', displayName: 'Kwame Mensah', roles: ['Ambassador'] }),
  member({ userId: 'u4', displayName: 'Tunde Bakare', roles: [] }),
  member({ userId: 'u5', displayName: 'Amara Okafor', roles: ['Owner', 'Administrator'] }),
];

describe('reading the role directory off the member list', () => {
  it('finds the moderators', () => {
    const holders = roleHoldersFromMembers(MEMBERS, 'Moderator');

    expect(holders.map((holder) => holder.userId)).toEqual(['u2', 'u1']);
  });

  it('keeps somebody who holds more than one role', () => {
    // Adaeze is a moderator *and* an administrator. A directory that dropped her
    // from the moderators would be the same lie in a narrower form.
    const holders = roleHoldersFromMembers(MEMBERS, 'Moderator');

    expect(holders.map((holder) => holder.displayName)).toContain('Adaeze Nwosu');
  });

  it('leaves out members with no role, and holders of a different one', () => {
    const holders = roleHoldersFromMembers(MEMBERS, 'Ambassador');

    expect(holders).toHaveLength(1);
    expect(holders[0].userId).toBe('u3');
  });

  it('orders by name, so the list does not reshuffle between pages', () => {
    // The members route pages by its own cursor and promises no order that means
    // anything here.
    expect(roleHoldersFromMembers(MEMBERS, 'Moderator').map((h) => h.displayName)).toEqual([
      'Adaeze Nwosu',
      'Zainab Bello',
    ]);
  });

  it('says "A member" rather than printing an identifier', () => {
    const holders = roleHoldersFromMembers(
      [member({ userId: 'u9', displayName: null, roles: ['Moderator'] })],
      'Moderator'
    );

    expect(holders[0].displayName).toBe('A member');
    expect(holders[0].displayName).not.toContain('u9');
  });

  it('invents nothing the members route does not carry', () => {
    // The simulated adapter supplied a bio, languages and an area. The real
    // route carries none of them, and the field is optional so a real holder can
    // be built without inventing one.
    const [holder] = roleHoldersFromMembers(MEMBERS, 'Ambassador');

    expect(holder.bio).toBeUndefined();
    expect(holder.languages).toBeUndefined();
    expect(holder.areaLabel).toBeUndefined();
  });

  it('carries no "since" where the platform gave no joined date', () => {
    const holders = roleHoldersFromMembers(
      [member({ userId: 'u9', joinedAt: null, roles: ['Moderator'] })],
      'Moderator'
    );

    expect(holders[0].since).toBeNull();
  });

  it('is genuinely empty for a community whose members hold no such role', () => {
    // The one case where "Nothing here yet" is true: the list was fetched and
    // nobody in it moderates.
    expect(roleHoldersFromMembers([member({ userId: 'u4', roles: [] })], 'Moderator')).toEqual([]);
  });
});
