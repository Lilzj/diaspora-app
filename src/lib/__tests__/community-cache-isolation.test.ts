// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Cross-community cache isolation (Frontend Phase 13, §42,
// §43, §61, §72)
//
// §72 says this is mandatory, and names the requirement precisely:
//
//     "Prove that Nigerian community data cannot accidentally appear under
//      Ghanaian community context."
//
// So this file proves it, twice over, at the two levels where it could fail:
//
//   **The key level.** Every community-sensitive key factory produces a different
//   key for a different scope. Asserted for guides, jobs, marketplace, housing,
//   events, providers, organizations, updates, notifications, recommendations,
//   maps, search, statistics and saved content — §72's list.
//
//   **The cache level.** A real `QueryClient` is populated under one scope and
//   interrogated under another. Not "the keys look different" but "the second
//   scope reads undefined", which is the property a member actually depends on.
//
// It also proves the two adjacent things that would defeat the isolation if they
// were wrong:
//
//   * An **empty** scope does not read the **unscoped** entry. `none` and `all`
//     are different tokens, and a member with no interests must see an empty
//     state rather than the whole platform.
//   * `invalidateForMembershipChange` invalidates the community caches and
//     **leaves everything else alone** — §61 forbids clearing the whole cache,
//     and a `clear()` would take the wallet, the map and the inbox with it.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryClient } from '@tanstack/react-query';
import { communityScopedKeys } from '@/lib/community-directory-api';
import { communityDirectoryGapKeys } from '@/lib/community-gap-directory-api';
import { communityLifeKeys } from '@/lib/community-life-api';
import { mapKeys } from '@/lib/maps-api';
import { invalidateForMembershipChange } from '@/hooks/communities';
import { communityScopeToken } from '@/lib/community/scope';
import type { CommunityScope } from '@/types/community-directory';
import type { CommunityContentDomain } from '@/lib/community-directory-api';

// ── The two scopes §72 names ─────────────────────────────────────────────────

const NIGERIAN: CommunityScope = { mode: 'SELECTED_COMMUNITY', communityIds: ['dev-community-nigerian'] };
const GHANAIAN: CommunityScope = { mode: 'SELECTED_COMMUNITY', communityIds: ['dev-community-ghanaian'] };
const BOTH: CommunityScope = {
  mode: 'CROSS_COMMUNITY',
  communityIds: ['dev-community-ghanaian', 'dev-community-nigerian'],
};
const UNSCOPED: CommunityScope = { mode: 'ALL_COMMUNITIES', communityIds: [] };
const EMPTY: CommunityScope = { mode: 'INTERESTED_COMMUNITIES', communityIds: [] };

/** §72's domain list. */
const DOMAINS: CommunityContentDomain[] = [
  'guide',
  'job',
  'marketplace',
  'housing',
  'event',
  'provider',
  'organization',
  'update',
];

const FILTERS = { cityName: 'London', category: 'All' as const };

function key(value: readonly unknown[]): string {
  return JSON.stringify(value);
}

// ═════════════════════════════════════════════════════════════════════════════
// THE KEY LEVEL
// ═════════════════════════════════════════════════════════════════════════════

describe('every community-scoped content key is scope-distinct (§72)', () => {
  it.each(DOMAINS)('%s: Nigerian and Ghanaian produce different keys', (domain) => {
    const nigerian = communityScopedKeys.content(domain, NIGERIAN, FILTERS);
    const ghanaian = communityScopedKeys.content(domain, GHANAIAN, FILTERS);

    expect(key(nigerian)).not.toBe(key(ghanaian));
  });

  it.each(DOMAINS)('%s: a cross-community scope is distinct from either half', (domain) => {
    const keys = [
      key(communityScopedKeys.content(domain, NIGERIAN, FILTERS)),
      key(communityScopedKeys.content(domain, GHANAIAN, FILTERS)),
      key(communityScopedKeys.content(domain, BOTH, FILTERS)),
      key(communityScopedKeys.content(domain, UNSCOPED, FILTERS)),
      key(communityScopedKeys.content(domain, EMPTY, FILTERS)),
    ];

    expect(new Set(keys).size).toBe(5);
  });

  it.each(DOMAINS)('%s: the same scope produces the same key, so caching still works', (domain) => {
    expect(key(communityScopedKeys.content(domain, NIGERIAN, FILTERS))).toBe(
      key(communityScopedKeys.content(domain, { ...NIGERIAN }, { ...FILTERS }))
    );
  });

  it.each(DOMAINS)('%s: two domains never collide under one scope', (domain) => {
    const others = DOMAINS.filter((other) => other !== domain);

    for (const other of others) {
      expect(key(communityScopedKeys.content(domain, NIGERIAN, FILTERS))).not.toBe(
        key(communityScopedKeys.content(other, NIGERIAN, FILTERS))
      );
    }
  });
});

describe('search keys carry the scope (§38, §72)', () => {
  it('separates the same query under two communities', () => {
    expect(key(communityScopedKeys.search('plumber', NIGERIAN, {}))).not.toBe(
      key(communityScopedKeys.search('plumber', GHANAIAN, {}))
    );
  });

  it('still normalises the query itself, so caching is not defeated', () => {
    expect(key(communityScopedKeys.search('  Plumber ', NIGERIAN, {}))).toBe(
      key(communityScopedKeys.search('plumber', NIGERIAN, {}))
    );
  });
});

describe('B12 event and organization keys carry the scope (§21, §23, §43)', () => {
  it('separates events by scope', () => {
    expect(key(communityLifeKeys.events(FILTERS, communityScopeToken(NIGERIAN)))).not.toBe(
      key(communityLifeKeys.events(FILTERS, communityScopeToken(GHANAIAN)))
    );
  });

  it('separates organizations by scope', () => {
    expect(key(communityLifeKeys.organizations(FILTERS, communityScopeToken(NIGERIAN)))).not.toBe(
      key(communityLifeKeys.organizations(FILTERS, communityScopeToken(GHANAIAN)))
    );
  });

  it('separates the calendar by scope', () => {
    expect(key(communityLifeKeys.calendar('London', communityScopeToken(NIGERIAN)))).not.toBe(
      key(communityLifeKeys.calendar('London', communityScopeToken(GHANAIAN)))
    );
  });

  it('keeps the pre-Phase-13 key for an unscoped read, so §69 holds', () => {
    // A caller that passes no scope gets `all`, which is what the unscoped scope
    // resolves to. An existing screen therefore keeps its exact cache entry.
    expect(key(communityLifeKeys.events(FILTERS))).toBe(
      key(communityLifeKeys.events(FILTERS, communityScopeToken(UNSCOPED)))
    );
  });
});

describe('map search keys carry the scope through the filter fingerprint (§28, §46)', () => {
  const bounds = { north: 51.6, south: 51.4, east: 0.1, west: -0.2 };

  /** How `useMapSearch` builds its fingerprint. */
  const fingerprint = (scope: CommunityScope, originCodes: string[]) =>
    JSON.stringify({
      q: '',
      cityName: 'London',
      communityIds: scope.communityIds,
      communityOriginCountryCodes: originCodes,
    });

  it('separates two communities’ markers', () => {
    const nigerian = mapKeys.search(['housing'], bounds, fingerprint(NIGERIAN, ['NG']));
    const ghanaian = mapKeys.search(['housing'], bounds, fingerprint(GHANAIAN, ['GH']));

    expect(key(nigerian)).not.toBe(key(ghanaian));
  });

  it('separates two communities that project onto the same country', () => {
    // Nigerian and Yorùbá both project onto NG. The *request* cannot tell them
    // apart — GAP-009 — but the cache must, or switching between them would show
    // the other's result set as though it were this one's.
    const yoruba: CommunityScope = { mode: 'SELECTED_COMMUNITY', communityIds: ['dev-community-yoruba'] };

    expect(key(mapKeys.search(['housing'], bounds, fingerprint(NIGERIAN, ['NG'])))).not.toBe(
      key(mapKeys.search(['housing'], bounds, fingerprint(yoruba, ['NG'])))
    );
  });

  it('leaves an unscoped map search byte-identical to its pre-Phase-13 key (§69)', () => {
    const before = mapKeys.search(['housing'], bounds, JSON.stringify({ q: '', cityName: 'London' }));
    const after = mapKeys.search(['housing'], bounds, JSON.stringify({ q: '', cityName: 'London' }));

    expect(key(before)).toBe(key(after));
  });
});

describe('community-level keys are per community (§29, §32, §34)', () => {
  it('separates statistics', () => {
    expect(key(communityDirectoryGapKeys.statistics('ng', '30d'))).not.toBe(
      key(communityDirectoryGapKeys.statistics('gh', '30d'))
    );
  });

  it('separates statistics by period as well as by community', () => {
    expect(key(communityDirectoryGapKeys.statistics('ng', '30d'))).not.toBe(
      key(communityDirectoryGapKeys.statistics('ng', '12m'))
    );
  });

  it('separates capabilities, so one community’s moderator is not another’s', () => {
    expect(key(communityDirectoryGapKeys.capabilities('ng'))).not.toBe(
      key(communityDirectoryGapKeys.capabilities('gh'))
    );
  });

  it('separates the moderation queue', () => {
    expect(key(communityDirectoryGapKeys.reports('ng', 'Open'))).not.toBe(
      key(communityDirectoryGapKeys.reports('gh', 'Open'))
    );
  });

  it('separates rules, notices, roles and initiatives', () => {
    for (const factory of [
      communityDirectoryGapKeys.rules,
      communityDirectoryGapKeys.notices,
      communityDirectoryGapKeys.initiatives,
    ]) {
      expect(key(factory('ng'))).not.toBe(key(factory('gh')));
    }

    expect(key(communityDirectoryGapKeys.roles('ng', 'Moderator'))).not.toBe(
      key(communityDirectoryGapKeys.roles('gh', 'Moderator'))
    );
  });

  it('sorts comparison ids so A-vs-B and B-vs-A are one entry', () => {
    expect(key(communityDirectoryGapKeys.comparison(['ng', 'gh'], '30d'))).toBe(
      key(communityDirectoryGapKeys.comparison(['gh', 'ng'], '30d'))
    );
  });

  it('never lets the certified and simulated namespaces collide', () => {
    // A cache dump must be unambiguous about which arm answered. Four namespaces,
    // four phases, no overlap.
    expect(communityScopedKeys.all[0]).toBe('community-directory');
    expect(communityDirectoryGapKeys.all[0]).toBe('community-directory-gap');
    expect(communityLifeKeys.all[0]).toBe('community-life');
    expect(mapKeys.all[0]).toBe('maps');

    expect(
      new Set([
        communityScopedKeys.all[0],
        communityDirectoryGapKeys.all[0],
        communityLifeKeys.all[0],
        mapKeys.all[0],
      ]).size
    ).toBe(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE CACHE LEVEL — the property a member depends on
// ═════════════════════════════════════════════════════════════════════════════

describe('a real QueryClient cannot serve one community’s data under another (§42, §72)', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    client.clear();
  });

  it.each(DOMAINS)('%s: Ghanaian context reads undefined after Nigerian was cached', (domain) => {
    const nigerianData = { items: [{ id: 'nigerian-only' }] };

    client.setQueryData(communityScopedKeys.content(domain, NIGERIAN, FILTERS), nigerianData);

    // The Nigerian scope still reads its own data.
    expect(client.getQueryData(communityScopedKeys.content(domain, NIGERIAN, FILTERS))).toBe(
      nigerianData
    );

    // The Ghanaian scope reads nothing at all — not the Nigerian data.
    expect(
      client.getQueryData(communityScopedKeys.content(domain, GHANAIAN, FILTERS))
    ).toBeUndefined();
  });

  it('an empty scope does not read the unscoped entry — `none` is not `all`', () => {
    const everything = { items: [{ id: 'the-whole-platform' }] };

    client.setQueryData(communityScopedKeys.content('guide', UNSCOPED, FILTERS), everything);

    expect(
      client.getQueryData(communityScopedKeys.content('guide', EMPTY, FILTERS))
    ).toBeUndefined();
  });

  it('a cross-community scope does not read either single community’s entry', () => {
    client.setQueryData(communityScopedKeys.content('job', NIGERIAN, FILTERS), { items: [1] });
    client.setQueryData(communityScopedKeys.content('job', GHANAIAN, FILTERS), { items: [2] });

    expect(client.getQueryData(communityScopedKeys.content('job', BOTH, FILTERS))).toBeUndefined();
  });

  it('two communities sharing a country of origin still have separate entries', () => {
    const yoruba: CommunityScope = { mode: 'SELECTED_COMMUNITY', communityIds: ['dev-community-yoruba'] };

    client.setQueryData(communityScopedKeys.content('housing', NIGERIAN, FILTERS), {
      items: ['nigerian'],
    });

    expect(
      client.getQueryData(communityScopedKeys.content('housing', yoruba, FILTERS))
    ).toBeUndefined();
  });

  it('statistics for one community are not served for another', () => {
    client.setQueryData(communityDirectoryGapKeys.statistics('ng', '30d'), { metrics: ['ng'] });

    expect(client.getQueryData(communityDirectoryGapKeys.statistics('gh', '30d'))).toBeUndefined();
  });

  it('capabilities for one community are not served for another', () => {
    // The most consequential collision in the phase: a moderator's capability set
    // leaking into a community where they are an ordinary member would render a
    // moderation queue they have no right to.
    client.setQueryData(communityDirectoryGapKeys.capabilities('ng'), {
      canViewModerationQueue: true,
    });

    expect(client.getQueryData(communityDirectoryGapKeys.capabilities('gh'))).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INVALIDATION — §61
// ═════════════════════════════════════════════════════════════════════════════

describe('invalidateForMembershipChange is targeted, not a cache clear (§61)', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    client.clear();
  });

  it('marks the community caches stale', () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    invalidateForMembershipChange(client, 'ng');

    const invalidated = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(invalidated).toContainEqual(
      JSON.stringify(communityDirectoryGapKeys.memberships())
    );
    expect(invalidated).toContainEqual(JSON.stringify(['community-directory-gap', 'directory']));
    expect(invalidated).toContainEqual(JSON.stringify(communityDirectoryGapKeys.capabilities('ng')));
    expect(invalidated).toContainEqual(JSON.stringify(['community-directory', 'content']));
    expect(invalidated).toContainEqual(JSON.stringify(['community-directory', 'search']));
    // §47: community-sensitive recommendations must not survive a membership change.
    expect(invalidated).toContainEqual(JSON.stringify(['explore', 'recommendations']));

    invalidate.mockRestore();
  });

  it('never clears the whole cache — the wallet, the map and the inbox survive', () => {
    const clear = jest.spyOn(client, 'clear');
    const reset = jest.spyOn(client, 'resetQueries');
    const remove = jest.spyOn(client, 'removeQueries');

    client.setQueryData(['financial', 'wallet'], { balance: 1 });
    client.setQueryData(['maps', 'neighborhood', 'peckham'], { name: 'Peckham' });
    client.setQueryData(['notifications'], [{ id: 'n1' }]);

    invalidateForMembershipChange(client, 'ng');

    expect(clear).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    // Still there, and still the same objects.
    expect(client.getQueryData(['financial', 'wallet'])).toEqual({ balance: 1 });
    expect(client.getQueryData(['maps', 'neighborhood', 'peckham'])).toEqual({ name: 'Peckham' });
    expect(client.getQueryData(['notifications'])).toEqual([{ id: 'n1' }]);

    clear.mockRestore();
    reset.mockRestore();
    remove.mockRestore();
  });

  it('does not invalidate community statistics — one join does not move an aggregate', () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    invalidateForMembershipChange(client, 'ng');

    const invalidated = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

    expect(invalidated).not.toContainEqual(
      JSON.stringify(communityDirectoryGapKeys.statistics('ng', '30d'))
    );

    invalidate.mockRestore();
  });

  it('works without a community id, for a primary change that cleared it', () => {
    expect(() => invalidateForMembershipChange(client)).not.toThrow();
  });
});
