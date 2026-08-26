// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community scope resolution (Frontend Phase 13, §12, §13,
// §15, §42, §43)
//
// The unit tests for the file every community-sensitive query in the application
// derives its key and its request from. If `scope.ts` is wrong, every scoped
// surface is wrong in the same way — which is the argument for it being one file
// and for these tests being thorough.
//
// The cases that matter most are the ones where a wrong answer would *widen* the
// scope: an empty interest list must not resolve to "everything", and an unknown
// community id must not fall through to unfiltered. Those are the paths by which
// a member would be shown data they did not ask for.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Community,
  CommunityMembership,
  CommunityMembershipSet,
  CommunityRef,
} from '@/types/community-directory';
import {
  ALL_COMMUNITIES_SCOPE,
  canonicalCommunityIds,
  communitiesForCountry,
  communityModeLabel,
  communityScopeToken,
  isEmptyScope,
  isUnscoped,
  matchesProjection,
  membershipStateLabel,
  projectScope,
  resolveAssociation,
  resolveInterestedCommunityIds,
  resolveMyCommunityIds,
  resolvePrimaryMembership,
  resolveScope,
  withCommunityScope,
} from '@/lib/community/scope';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function community(overrides: Partial<Community> & { id: string }): Community {
  return {
    slug: overrides.id,
    name: overrides.id,
    type: 'NationalDiaspora',
    origin: { countryCode: null, countryName: null, flag: null, regionName: null },
    identity: { logoUrl: null, iconName: null, accentColor: null },
    status: 'Active',
    visibility: 'Public',
    ...overrides,
  } as Community;
}

const NIGERIAN = community({
  id: 'ng',
  slug: 'nigerian',
  name: 'Nigerian',
  origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬' },
});

const YORUBA = community({
  id: 'yo',
  slug: 'yoruba',
  name: 'Yorùbá',
  type: 'EthnoLinguistic',
  // Deliberately shares Nigeria with NIGERIAN. §2's many-to-one case.
  origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬' },
});

const GHANAIAN = community({
  id: 'gh',
  slug: 'ghanaian',
  name: 'Ghanaian',
  origin: { countryCode: 'GH', countryName: 'Ghana', flag: '🇬🇭' },
});

/** The country-less case. `projectScope` must report it rather than drop it. */
const WEST_AFRICAN = community({
  id: 'wa',
  slug: 'west-african',
  name: 'West African',
  type: 'RegionalDiaspora',
  origin: { countryCode: null, countryName: null, flag: null, regionName: 'West Africa' },
});

const ALL = [NIGERIAN, YORUBA, GHANAIAN, WEST_AFRICAN];
const lookup = (id: string) => ALL.find((c) => c.id === id);

function membership(
  communityId: string,
  overrides: Partial<CommunityMembership> = {}
): CommunityMembership {
  return {
    communityId,
    state: 'Member',
    isPrimary: false,
    roles: [],
    capabilities: {
      communityId,
      roles: [],
      canViewMembers: false,
      canViewPrivateStatistics: false,
      canPostToCommunity: false,
      canModerateContent: false,
      canReviewReports: false,
      canPublishNotice: false,
      canManageRules: false,
      canManageRoles: false,
      canViewModerationQueue: false,
      canViewAmbassadorDirectory: false,
      canManageInitiatives: false,
    },
    visibility: 'Private',
    ...overrides,
  };
}

const MEMBERSHIP_SET: CommunityMembershipSet = {
  memberships: [
    membership('ng', { state: 'VerifiedMember', isPrimary: true }),
    membership('gh', { state: 'Interested' }),
    membership('yo', { state: 'Interested' }),
    membership('wa', { state: 'Following' }),
  ],
  primaryCommunityId: 'ng',
};

// ═════════════════════════════════════════════════════════════════════════════

describe('canonicalCommunityIds', () => {
  it('sorts, so two orderings of one selection are one cache entry', () => {
    expect(canonicalCommunityIds(['gh', 'ng'])).toEqual(['gh', 'ng']);
    expect(canonicalCommunityIds(['ng', 'gh'])).toEqual(['gh', 'ng']);
  });

  it('de-duplicates and drops blanks', () => {
    expect(canonicalCommunityIds(['ng', 'ng', '', '  ', null, undefined, 'gh'])).toEqual([
      'gh',
      'ng',
    ]);
  });

  it('trims, so a stray space cannot fork the cache', () => {
    expect(canonicalCommunityIds([' ng '])).toEqual(['ng']);
  });
});

describe('resolvePrimaryMembership', () => {
  it('prefers the server’s stated primary over scanning isPrimary', () => {
    const set: CommunityMembershipSet = {
      // A server bug: two entries claim primacy. The stated id decides.
      memberships: [membership('gh', { isPrimary: true }), membership('ng', { isPrimary: true })],
      primaryCommunityId: 'ng',
    };

    expect(resolvePrimaryMembership(set)?.communityId).toBe('ng');
  });

  it('falls back to the isPrimary scan when the server stated nothing', () => {
    const set: CommunityMembershipSet = {
      memberships: [membership('gh'), membership('ng', { isPrimary: true })],
    };

    expect(resolvePrimaryMembership(set)?.communityId).toBe('ng');
  });

  it('returns null when there is genuinely no primary — a supported state (§9)', () => {
    expect(resolvePrimaryMembership({ memberships: [membership('gh')] })).toBeNull();
    expect(resolvePrimaryMembership({ memberships: [] })).toBeNull();
    expect(resolvePrimaryMembership(null)).toBeNull();
  });
});

describe('interest and membership are different things (§8)', () => {
  it('separates the interested list from the belonging list', () => {
    expect(resolveInterestedCommunityIds(MEMBERSHIP_SET)).toEqual(['gh', 'yo']);
    // `wa` is Following and counts as "mine"; `gh`/`yo` are Interested and do not.
    expect(resolveMyCommunityIds(MEMBERSHIP_SET)).toEqual(['ng', 'wa']);
  });

  it('does not count a pending application as belonging', () => {
    const set: CommunityMembershipSet = {
      memberships: [membership('ng', { state: 'PendingApproval' })],
    };

    expect(resolveMyCommunityIds(set)).toEqual([]);
  });

  it('does not count a revoked or left membership as belonging', () => {
    const set: CommunityMembershipSet = {
      memberships: [membership('ng', { state: 'Revoked' }), membership('gh', { state: 'Left' })],
    };

    expect(resolveMyCommunityIds(set)).toEqual([]);
  });
});

describe('resolveScope', () => {
  it('resolves the primary mode to the primary community', () => {
    expect(resolveScope({ mode: 'PRIMARY_COMMUNITY' }, MEMBERSHIP_SET)).toEqual({
      mode: 'PRIMARY_COMMUNITY',
      communityIds: ['ng'],
    });
  });

  it('resolves the interested mode to the interested set', () => {
    expect(resolveScope({ mode: 'INTERESTED_COMMUNITIES' }, MEMBERSHIP_SET).communityIds).toEqual([
      'gh',
      'yo',
    ]);
  });

  it('leaves ALL_COMMUNITIES unscoped', () => {
    expect(resolveScope({ mode: 'ALL_COMMUNITIES' }, MEMBERSHIP_SET).communityIds).toEqual([]);
    expect(isUnscoped(resolveScope({ mode: 'ALL_COMMUNITIES' }, MEMBERSHIP_SET))).toBe(true);
  });

  it('honours the cardinality SELECTED_COMMUNITY names', () => {
    const scope = resolveScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: ['ng', 'gh'] },
      MEMBERSHIP_SET
    );

    expect(scope.communityIds).toEqual(['gh']);
  });

  it('reads CROSS_COMMUNITY with no explicit selection as "my communities"', () => {
    const scope = resolveScope({ mode: 'CROSS_COMMUNITY' }, MEMBERSHIP_SET);

    expect(scope.communityIds).toEqual(['ng', 'wa']);
    // Still scoped — not `all`. This is the distinction §13 insists on.
    expect(isUnscoped(scope)).toBe(false);
  });

  // The two cases that would leak if they were wrong.
  it('resolves PRIMARY_COMMUNITY with no primary to EMPTY, not to everything', () => {
    const scope = resolveScope({ mode: 'PRIMARY_COMMUNITY' }, { memberships: [] });

    expect(scope.communityIds).toEqual([]);
    expect(isEmptyScope(scope)).toBe(true);
    expect(isUnscoped(scope)).toBe(false);
  });

  it('resolves INTERESTED_COMMUNITIES with no interests to EMPTY, not to everything', () => {
    const scope = resolveScope(
      { mode: 'INTERESTED_COMMUNITIES' },
      { memberships: [membership('ng', { state: 'Member' })] }
    );

    expect(isEmptyScope(scope)).toBe(true);
    expect(isUnscoped(scope)).toBe(false);
  });

  it('survives a null membership set', () => {
    expect(isEmptyScope(resolveScope({ mode: 'PRIMARY_COMMUNITY' }, null))).toBe(true);
  });
});

describe('communityScopeToken', () => {
  it('distinguishes unscoped from empty — the distinction that prevents the leak', () => {
    expect(communityScopeToken({ mode: 'ALL_COMMUNITIES', communityIds: [] })).toBe('all');
    expect(communityScopeToken({ mode: 'PRIMARY_COMMUNITY', communityIds: [] })).toBe('none');
    expect(communityScopeToken({ mode: 'ALL_COMMUNITIES', communityIds: [] })).not.toBe(
      communityScopeToken({ mode: 'PRIMARY_COMMUNITY', communityIds: [] })
    );
  });

  it('is derived from the id set, not the mode — so identical requests dedupe', () => {
    const asPrimary = communityScopeToken({ mode: 'PRIMARY_COMMUNITY', communityIds: ['ng'] });
    const asSelected = communityScopeToken({ mode: 'SELECTED_COMMUNITY', communityIds: ['ng'] });

    expect(asPrimary).toBe(asSelected);
  });

  it('is stable under reordering', () => {
    expect(communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['ng', 'gh'] })).toBe(
      communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['gh', 'ng'] })
    );
  });

  it('differs for different id sets — so two scopes cannot share a cache entry', () => {
    const nigerian = communityScopeToken({ mode: 'SELECTED_COMMUNITY', communityIds: ['ng'] });
    const ghanaian = communityScopeToken({ mode: 'SELECTED_COMMUNITY', communityIds: ['gh'] });
    const both = communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['ng', 'gh'] });

    expect(new Set([nigerian, ghanaian, both]).size).toBe(3);
  });

  it('treats a missing scope as unscoped rather than throwing', () => {
    expect(communityScopeToken(null)).toBe('all');
    expect(communityScopeToken(undefined)).toBe('all');
  });
});

describe('withCommunityScope', () => {
  it('adds the token so an existing params-hashing key factory isolates for free', () => {
    const params = { category: 'Housing', cityName: 'London' };

    expect(withCommunityScope(params, { mode: 'SELECTED_COMMUNITY', communityIds: ['ng'] })).toEqual(
      { category: 'Housing', cityName: 'London', communityScope: 'c:ng' }
    );
  });

  it('does not mutate the params it was given', () => {
    const params = { category: 'Housing' };
    withCommunityScope(params, ALL_COMMUNITIES_SCOPE);

    expect(params).toEqual({ category: 'Housing' });
  });
});

describe('projectScope', () => {
  it('reports an unscoped scope as unscoped and filters nothing', () => {
    const projection = projectScope(ALL_COMMUNITIES_SCOPE, lookup);

    expect(projection.isUnscoped).toBe(true);
    expect(projection.isApproximate).toBe(false);
    expect(matchesProjection('NG', projection)).toBe(true);
    expect(matchesProjection(null, projection)).toBe(true);
  });

  it('reports an empty scope as empty and matches nothing', () => {
    const projection = projectScope({ mode: 'PRIMARY_COMMUNITY', communityIds: [] }, lookup);

    expect(projection.isEmpty).toBe(true);
    expect(matchesProjection('NG', projection)).toBe(false);
  });

  it('projects a national community onto its country of origin', () => {
    const projection = projectScope({ mode: 'SELECTED_COMMUNITY', communityIds: ['ng'] }, lookup);

    expect(projection.originCountryCodes).toEqual(['NG']);
    expect(projection.singleCountryCode).toBe('NG');
    // Always approximate: the routes cannot express a community.
    expect(projection.isApproximate).toBe(true);
  });

  it('collapses two communities that share a country to one code', () => {
    const projection = projectScope({ mode: 'CROSS_COMMUNITY', communityIds: ['ng', 'yo'] }, lookup);

    expect(projection.originCountryCodes).toEqual(['NG']);
    // The scope token still distinguishes them, which is what matters for the
    // cache — the *request* cannot, and that is GAP-009.
    expect(communityScopeToken(projection.scope)).toBe('c:ng|yo');
  });

  it('reports a country-less community as unexpressed rather than dropping it', () => {
    const projection = projectScope({ mode: 'SELECTED_COMMUNITY', communityIds: ['wa'] }, lookup);

    expect(projection.originCountryCodes).toEqual([]);
    expect(projection.unexpressed.map((ref) => ref.id)).toEqual(['wa']);
    // Nothing matches, so the screen renders an empty state and names the
    // community that could not be projected — rather than showing everything.
    expect(matchesProjection('NG', projection)).toBe(false);
  });

  it('mixes an expressible and an inexpressible community honestly', () => {
    const projection = projectScope({ mode: 'CROSS_COMMUNITY', communityIds: ['ng', 'wa'] }, lookup);

    expect(projection.originCountryCodes).toEqual(['NG']);
    expect(projection.unexpressed.map((ref) => ref.id)).toEqual(['wa']);
    expect(projection.singleCountryCode).toBe('NG');
  });

  it('narrows rather than widens when a community id is unknown', () => {
    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: ['not-loaded'] },
      lookup
    );

    expect(projection.isUnscoped).toBe(false);
    expect(projection.originCountryCodes).toEqual([]);
    expect(matchesProjection('NG', projection)).toBe(false);
  });

  it('handles more than one country', () => {
    const projection = projectScope({ mode: 'CROSS_COMMUNITY', communityIds: ['ng', 'gh'] }, lookup);

    expect(projection.originCountryCodes).toEqual(['GH', 'NG']);
    // No single code: routes that accept only one must filter client-side.
    expect(projection.singleCountryCode).toBeNull();
    expect(matchesProjection('GH', projection)).toBe(true);
    expect(matchesProjection('NG', projection)).toBe(true);
    expect(matchesProjection('IN', projection)).toBe(false);
  });
});

describe('matchesProjection', () => {
  const projection = projectScope({ mode: 'SELECTED_COMMUNITY', communityIds: ['ng'] }, lookup);

  it('is case-insensitive about country codes', () => {
    expect(matchesProjection('ng', projection)).toBe(true);
    expect(matchesProjection(' Ng ', projection)).toBe(true);
  });

  it('refuses an entity with no origin under a scoped projection', () => {
    // An absent origin is not evidence of belonging. Admitting it would make the
    // filter mean "these countries, plus anything unlabelled".
    expect(matchesProjection(null, projection)).toBe(false);
    expect(matchesProjection(undefined, projection)).toBe(false);
    expect(matchesProjection('', projection)).toBe(false);
  });
});

describe('resolveAssociation', () => {
  it('prefers a declared association and marks it as fact', () => {
    const association = resolveAssociation({
      declaredCommunityIds: ['gh'],
      originCountryCode: 'NG',
      communities: ALL,
    });

    expect(association.basis).toBe('declared');
    expect(association.community?.id).toBe('gh');
  });

  it('falls back to the publisher’s origin and marks it as an inference', () => {
    const association = resolveAssociation({ originCountryCode: 'GH', communities: ALL });

    expect(association.basis).toBe('origin');
    expect(association.community?.id).toBe('gh');
  });

  it('falls back to location only when there is no origin', () => {
    const association = resolveAssociation({
      originCountryCode: null,
      locationCountryCode: 'NG',
      communities: ALL,
    });

    expect(association.basis).toBe('location');
  });

  it('returns unknown rather than guessing, so no badge is drawn', () => {
    const association = resolveAssociation({ communities: ALL });

    expect(association.basis).toBe('unknown');
    expect(association.community).toBeNull();
  });

  it('returns unknown when the country matches no community at all', () => {
    expect(resolveAssociation({ originCountryCode: 'ZZ', communities: ALL }).basis).toBe('unknown');
  });

  it('puts the extra communities in `additional` when a country maps to several', () => {
    const association = resolveAssociation({ originCountryCode: 'NG', communities: ALL });

    expect(association.basis).toBe('origin');
    expect([association.community?.id, ...(association.additional ?? []).map((r) => r.id)]).toEqual(
      ['ng', 'yo']
    );
  });

  it('ignores a declared id the client cannot resolve and falls through', () => {
    const association = resolveAssociation({
      declaredCommunityIds: ['unknown-id'],
      originCountryCode: 'GH',
      communities: ALL,
    });

    expect(association.basis).toBe('origin');
  });
});

describe('communitiesForCountry', () => {
  it('returns many, because a country is not a community (§2)', () => {
    const matches: CommunityRef[] = communitiesForCountry('NG', ALL);

    expect(matches.map((ref) => ref.id)).toEqual(['ng', 'yo']);
  });

  it('never returns a country-less community', () => {
    expect(communitiesForCountry('NG', ALL).map((r) => r.id)).not.toContain('wa');
  });
});

describe('labels', () => {
  it('names each mode distinctly', () => {
    const labels = (
      ['ALL_COMMUNITIES', 'PRIMARY_COMMUNITY', 'SELECTED_COMMUNITY', 'INTERESTED_COMMUNITIES', 'CROSS_COMMUNITY'] as const
    ).map((mode) => communityModeLabel(mode, 3));

    expect(new Set(labels).size).toBe(5);
  });

  it('gives every membership state its own words, so colour is not the signal (§59)', () => {
    const states = [
      'None',
      'Discovering',
      'Interested',
      'Following',
      'PendingApproval',
      'Member',
      'VerifiedMember',
      'Declined',
      'Revoked',
      'Left',
    ] as const;

    const labels = states.map(membershipStateLabel);

    expect(new Set(labels).size).toBe(states.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A set whose `memberships` is missing
//
// Found on a device, on the first screen after signing in. `resolvePrimaryMembership`
// guarded `!set` and then read `set.memberships.length`, which is safe only if the
// field is always an array. `CommunityMembershipSet.memberships` is declared
// required and non-nullable, so `tsc` had no reason to object and never did — and
// neither did any test here, because every fixture was well-formed.
//
// The set arrived without it. The Home screen went down with a red render error
// on the very first thing a member sees after verifying their number, having just
// completed sign-in successfully.
//
// A type is a claim about data the client did not produce. These three functions
// already accept `null | undefined`; tolerating a malformed object is the same
// job, not a new one.
// ─────────────────────────────────────────────────────────────────────────────

describe('a membership set that is missing its memberships', () => {
  // Deliberately cast: the whole point is that this shape does not typecheck and
  // arrived anyway. A fixture that satisfied the type could not reproduce it.
  const malformed = { primaryCommunityId: null, fetchedAt: null } as unknown as CommunityMembershipSet;

  it('resolves no primary rather than crashing', () => {
    expect(() => resolvePrimaryMembership(malformed)).not.toThrow();
    expect(resolvePrimaryMembership(malformed)).toBeNull();
  });

  it('resolves no interested communities rather than crashing', () => {
    expect(() => resolveInterestedCommunityIds(malformed)).not.toThrow();
    expect(resolveInterestedCommunityIds(malformed)).toEqual([]);
  });

  it('resolves no communities of my own rather than crashing', () => {
    expect(() => resolveMyCommunityIds(malformed)).not.toThrow();
    expect(resolveMyCommunityIds(malformed)).toEqual([]);
  });

  it('resolves a scope, and an empty one rather than everything', () => {
    // The widening failure this file's header warns about. Falling back to
    // ALL_COMMUNITIES on malformed input would show a member data they never
    // asked for, which is worse than the crash it replaced.
    const scope = resolveScope({ mode: 'PRIMARY_COMMUNITY' }, malformed);

    expect(scope.mode).toBe('PRIMARY_COMMUNITY');
    expect(scope.communityIds).toEqual([]);
  });

  it('tolerates memberships being null, or not an array at all', () => {
    for (const value of [null, undefined, 'nope', 42, {}]) {
      const set = { memberships: value } as unknown as CommunityMembershipSet;

      expect(() => resolvePrimaryMembership(set)).not.toThrow();
      expect(resolvePrimaryMembership(set)).toBeNull();
      expect(resolveMyCommunityIds(set)).toEqual([]);
    }
  });
});
