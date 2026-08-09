// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation cache isolation (Frontend Phase 18, §58 · §59 · §60 · §68)
//
// §58 asks for a *proof* of four properties:
//
//   User A's automations cannot appear under User B.
//   Community A's cannot appear under Community B.
//   Creator A's cannot appear under Creator B.
//   Organization A's cannot appear under Organization B.
//
// A proof needs one place to reason about, which is why every key in this phase
// comes from `lib/automation/query-keys.ts` and no screen builds an array
// literal. These tests are that proof, and they are deliberately *structural*:
// they assert on the keys rather than on a rendered screen, because a rendered
// screen proves the property for one screen and a key proves it for all of them.
//
// ── Why keying matters more than clearing ────────────────────────────────────
//
// The cache is also cleared on sign-out (`store/auth.ts`). That is necessary
// and not sufficient: a failed clear, a race with an in-flight query, or a
// second query client would each defeat it. Keying on the member means the
// wrong entry cannot be *found* even if it is still there — and TanStack serves
// cached data synchronously on mount, so a found-but-wrong entry renders
// *first* and is corrected a moment later, which is worse than a spinner
// because the member reads it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  automationKeys,
  filterToken,
  memberToken,
  scopeToken,
  scopeTokenFor,
} from '@/lib/automation/query-keys';
import { DEFAULT_AUTOMATION_FILTERS } from '@/types/automation';
import type { AutomationListFilters, AutomationScope } from '@/types/automation';

const FILTERS: AutomationListFilters = DEFAULT_AUTOMATION_FILTERS;

function scope(ownerKind: AutomationScope['ownerKind'], ownerId: string): AutomationScope {
  return {
    ownerKind,
    ownerId,
    ownerLabel: ownerId,
    communityIds: [],
    isCrossCommunity: false,
    countryCodes: [],
    neighbourhoodIds: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════

describe('§58 · user isolation', () => {
  it('two members never share a list key', () => {
    const a = automationKeys.list('user-a', 'user:me', FILTERS);
    const b = automationKeys.list('user-b', 'user:me', FILTERS);

    expect(a).not.toEqual(b);
  });

  it('two members never share a detail key, even for the same automation id', () => {
    // The scenario that matters: a deep link to `automation/abc` opened by two
    // members on one device. Without the member fragment both would read one
    // cache entry, and the second would render the first's automation.
    const a = automationKeys.detail('user-a', 'abc');
    const b = automationKeys.detail('user-b', 'abc');

    expect(a).not.toEqual(b);
  });

  it('two members never share a run, a schedule, an audit or a saved-search key', () => {
    const pairs: [readonly unknown[], readonly unknown[]][] = [
      [automationKeys.runs('user-a', null, null, null), automationKeys.runs('user-b', null, null, null)],
      [automationKeys.run('user-a', 'r1'), automationKeys.run('user-b', 'r1')],
      [automationKeys.schedule('user-a', 'a1'), automationKeys.schedule('user-b', 'a1')],
      [automationKeys.audit('user-a', 'a1'), automationKeys.audit('user-b', 'a1')],
      [automationKeys.savedSearches('user-a', 'jobs'), automationKeys.savedSearches('user-b', 'jobs')],
      [
        automationKeys.reminders('user-a', 'event', 'e1'),
        automationKeys.reminders('user-b', 'event', 'e1'),
      ],
      [
        automationKeys.capabilities('user-a', 'user:me'),
        automationKeys.capabilities('user-b', 'user:me'),
      ],
      [
        automationKeys.audience('user-a', 'user:me', 'notify.self'),
        automationKeys.audience('user-b', 'user:me', 'notify.self'),
      ],
    ];

    for (const [a, b] of pairs) {
      expect(a).not.toEqual(b);
    }
  });

  it('a signed-out reader is a distinct, named identity', () => {
    // `anonymous` rather than `undefined`, so a cache dump distinguishes
    // "nobody is signed in" from "a bug dropped the id".
    expect(memberToken(null)).toBe('anonymous');
    expect(memberToken(undefined)).toBe('anonymous');
    expect(memberToken('')).toBe('anonymous');

    expect(automationKeys.list(null, 'user:me', FILTERS)).not.toEqual(
      automationKeys.list('user-a', 'user:me', FILTERS)
    );
  });

  it('every key begins with the automations namespace and the member', () => {
    const keys: readonly unknown[][] = [
      [...automationKeys.all('user-a')],
      [...automationKeys.list('user-a', 'user:me', FILTERS)],
      [...automationKeys.detail('user-a', 'a1')],
      [...automationKeys.runs('user-a', null, null, null)],
      [...automationKeys.run('user-a', 'r1')],
      [...automationKeys.capabilities('user-a', 'user:me')],
      [...automationKeys.savedSearches('user-a', null)],
      [...automationKeys.reminders('user-a', 'event', 'e1')],
      [...automationKeys.audit('user-a', 'a1')],
      [...automationKeys.schedule('user-a', 'a1')],
      [...automationKeys.audience('user-a', 'user:me', 'x')],
      [...automationKeys.triggerContext('user-a', 'event.created', 'e1')],
    ];

    for (const key of keys) {
      // The prefix is what makes `invalidateQueries({ queryKey: all(userId) })`
      // reach every one of these — a key that skipped it would survive a
      // sign-out invalidation.
      expect(key[0]).toBe('automations');
      expect(key[1]).toBe('user-a');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§58 · community, creator and organization isolation', () => {
  it('two communities never share a key', () => {
    const ng = automationKeys.list('user-a', scopeTokenFor(scope('community', 'ng')), FILTERS);
    const gh = automationKeys.list('user-a', scopeTokenFor(scope('community', 'gh')), FILTERS);

    expect(ng).not.toEqual(gh);
  });

  it('two organizations never share a key', () => {
    const one = automationKeys.list('user-a', scopeTokenFor(scope('organization', 'org-1')), FILTERS);
    const two = automationKeys.list('user-a', scopeTokenFor(scope('organization', 'org-2')), FILTERS);

    expect(one).not.toEqual(two);
  });

  it('two creators never share a key', () => {
    const one = automationKeys.list('user-a', scopeTokenFor(scope('creator', 'c-1')), FILTERS);
    const two = automationKeys.list('user-a', scopeTokenFor(scope('creator', 'c-2')), FILTERS);

    expect(one).not.toEqual(two);
  });

  it('one member’s personal and community automations are separate entries', () => {
    // The same moderator has both, and the community ones are visible to their
    // co-moderators. One key would merge two different visibility sets.
    const personal = automationKeys.list('user-a', scopeTokenFor(scope('user', 'user-a')), FILTERS);
    const community = automationKeys.list('user-a', scopeTokenFor(scope('community', 'ng')), FILTERS);

    expect(personal).not.toEqual(community);
  });

  it('the same owner id under two owner kinds is two scopes', () => {
    // An id is not unique across kinds. `community:ng` and `organization:ng`
    // must not collide, and the token contains both components verbatim so
    // they cannot.
    expect(scopeToken('community', 'ng')).not.toBe(scopeToken('organization', 'ng'));
  });

  it('capabilities are per scope, so a community answer cannot leak into another', () => {
    const ng = automationKeys.capabilities('user-a', scopeToken('community', 'ng'));
    const gh = automationKeys.capabilities('user-a', scopeToken('community', 'gh'));

    // "May I create a community automation" has a different answer per
    // community, and one shared entry would carry the last community's answer
    // into the next one's builder.
    expect(ng).not.toEqual(gh);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§68 · keys carry what the brief asks them to', () => {
  it('the list key carries user, scope, status and filters', () => {
    const key = automationKeys.list('user-a', 'community:ng', {
      tab: 'active',
      domain: 'jobs',
      ownerKind: 'community',
      communityId: 'ng',
      search: 'lagos',
    });

    const joined = key.join('|');
    expect(joined).toContain('user-a');
    expect(joined).toContain('community:ng');
    expect(joined).toContain('tab=active');
    expect(joined).toContain('domain=jobs');
    expect(joined).toContain('q=lagos');
  });

  it('two different filter sets are two entries', () => {
    const active = automationKeys.list('user-a', 'user:me', { ...FILTERS, tab: 'active' });
    const paused = automationKeys.list('user-a', 'user:me', { ...FILTERS, tab: 'paused' });

    expect(active).not.toEqual(paused);
  });

  it('a search is normalised, so equivalent queries share one entry', () => {
    // Deduplication rather than isolation: `"Lagos "` and `"lagos"` are the
    // same query and two entries would be two identical fetches.
    expect(filterToken({ ...FILTERS, search: 'Lagos ' })).toBe(
      filterToken({ ...FILTERS, search: 'lagos' })
    );
  });

  it('a run key carries the automation and the status', () => {
    const all = automationKeys.runs('user-a', null, null, null);
    const one = automationKeys.runs('user-a', 'a1', null, null);
    const failed = automationKeys.runs('user-a', 'a1', 'FAILED', null);

    expect(all).not.toEqual(one);
    expect(one).not.toEqual(failed);
  });

  it('a cursor is part of the key, so pages do not overwrite each other', () => {
    const first = automationKeys.runs('user-a', 'a1', null, null);
    const second = automationKeys.runs('user-a', 'a1', null, '20');

    expect(first).not.toEqual(second);
  });

  it('the template catalogue is deliberately not member-scoped', () => {
    // It is the same for everybody with the same capabilities — the
    // member-specific filtering happens on the client from the capability set,
    // which is itself member-scoped and cached separately. Scoping it per
    // member would mean two members on one device each fetch an identical list.
    const key = automationKeys.templates('user');

    expect(key[0]).toBe('automations');
    expect(key[1]).toBe('templates');
    expect(key).not.toContain('user-a');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§59 · account switching', () => {
  it('User A creates, User B signs in, and A’s key is unreachable', () => {
    // The full §59 journey, at the level the client can guarantee it: the key
    // that held A's list cannot be produced from B's session.
    const aList = automationKeys.list('user-a', scopeToken('user', 'user-a'), FILTERS);
    const bList = automationKeys.list('user-b', scopeToken('user', 'user-b'), FILTERS);

    expect(aList).not.toEqual(bList);

    // And restoring A produces A's key again — a member who signs back in sees
    // their own automations rather than a cold cache.
    const aAgain = automationKeys.list('user-a', scopeToken('user', 'user-a'), FILTERS);
    expect(aAgain).toEqual(aList);
  });

  it('the sign-out invalidation prefix reaches every automation key', () => {
    // `store/auth.ts` and the mutation hooks both invalidate
    // `automationKeys.all(userId)`. This asserts the prefix relationship that
    // makes that reach everything, which is a property of the key *shape*
    // rather than of the invalidation call.
    const prefix = automationKeys.all('user-a');

    const everyKey: readonly unknown[][] = [
      [...automationKeys.list('user-a', 'user:me', FILTERS)],
      [...automationKeys.detail('user-a', 'a1')],
      [...automationKeys.runs('user-a', 'a1', null, null)],
      [...automationKeys.capabilities('user-a', 'user:me')],
      [...automationKeys.savedSearches('user-a', 'jobs')],
      [...automationKeys.reminders('user-a', 'event', 'e1')],
    ];

    for (const key of everyKey) {
      expect(key.slice(0, prefix.length)).toEqual([...prefix]);
    }
  });

  it('the development adapter’s own store is cleared between members', () => {
    const {
      resetAutomationState,
      listAutomationsFor,
      createAutomationSimulated,
    } = require('@/mocks/automation-gap-data') as {
      resetAutomationState: () => void;
      listAutomationsFor: (
        ownerKind: string,
        status: string | null,
        domain: string | null,
        search: string | null
      ) => { id: string; name: string }[];
      createAutomationSimulated: (body: Record<string, unknown>) => { id: string };
    };

    resetAutomationState();
    const before = listAutomationsFor('user', null, null, null).length;

    createAutomationSimulated({ name: 'User A’s private rule' });
    expect(listAutomationsFor('user', null, null, null)).toHaveLength(before + 1);

    // What `store/auth.ts` calls on sign-out. The query cache is keyed per
    // member so the wrong entry cannot be *found*, but the adapter's own store
    // is not keyed, and on a shared device the next member would be served the
    // previous one's automations out of it.
    resetAutomationState();

    const after = listAutomationsFor('user', null, null, null);
    expect(after).toHaveLength(before);
    expect(after.some((entry) => entry.name === 'User A’s private rule')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§60 · multi-device', () => {
  it('two devices for one member share a key, so an edit on one is seen on the other', () => {
    // The mirror of isolation, and just as important: keying too finely — per
    // device, per session — would mean a member pausing an automation on their
    // phone still sees it Active on their tablet.
    const phone = automationKeys.detail('user-a', 'a1');
    const tablet = automationKeys.detail('user-a', 'a1');

    expect(phone).toEqual(tablet);
  });

  it('no key carries a device identifier', () => {
    const key = automationKeys.list('user-a', 'user:me', FILTERS).join('|');

    for (const forbidden of ['device', 'session', 'installation']) {
      expect(key).not.toContain(forbidden);
    }
  });
});
