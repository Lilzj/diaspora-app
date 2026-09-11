// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-community performance (Frontend Phase 13, §60, §77)
//
// §77 asks for verification at 1, 10, 100 and 1,000+ communities, with large
// discovery results, multiple community filters, and repeated and rapid switching.
//
// What can honestly be measured in Jest is the *algorithmic* half — the work that
// scales with the number of communities and the number of results, all of which is
// pure functions over arrays. That is measured here, with budgets rather than
// timings-as-assertions where possible: the strongest claims are the complexity
// ones ("resolving a scope over 1,200 communities does not scan the communities"),
// because a wall-clock assertion on CI is a flake waiting to happen.
//
// Where a duration *is* asserted the budget is deliberately loose — an order of
// magnitude above the observed figure — so it catches a quadratic regression and
// not a slow machine.
//
// The render half of §77 is not measurable here and is not claimed to be. The
// switcher and the directory use `FlatList` with `initialNumToRender`, `windowSize`
// and `removeClippedSubviews`, so only the visible rows mount; that is recorded in
// the performance report rather than asserted as a number.
// ─────────────────────────────────────────────────────────────────────────────

import {
  canonicalCommunityIds,
  communityScopeToken,
  matchesProjection,
  projectScope,
  resolveScope,
} from '@/lib/community/scope';
import { narrowToScope } from '@/lib/community-directory-api';
import { getPerformanceCommunitySet, PERFORMANCE_SET_SIZE } from '@/mocks/community-directory-data';
import { useCommunityContextStore } from '@/store/community-context';
import type { Community, CommunityMembershipSet } from '@/types/community-directory';

/**
 * A loose ceiling: catches a quadratic regression, not a slow CI box.
 *
 * ── Why it is calibrated rather than fixed ─────────────────────────────────
 *
 * This was a flat 250 ms and it failed the whole suite at **253 ms** and
 * **273 ms** during the Android UAT — while an emulator and a Gradle build were
 * running on the same machine. Run alone on that same machine, seconds later, it
 * passed. The suite took 297 s in the failing run against roughly 50 s normally
 * (UAT-129).
 *
 * A wall-clock budget in a unit suite measures the machine as much as the code,
 * and a CI agent is at least as loaded as a developer's box mid-build. Tuning the
 * round count — which a previous wave already did — does not fix that; it just
 * moves the threshold at which the machine's load starts deciding the result.
 *
 * So the budget is now **calibrated against this machine, in this run**:
 * `measureBaseline()` times a fixed lump of trivial work immediately before the
 * assertions, and the ceiling scales with it. A loaded box makes the baseline
 * slower and the ceiling looser by the same factor, so the test keeps measuring
 * the code and stops measuring the weather.
 *
 * The floor keeps a fast machine honest: no matter how quick the baseline, the
 * budget never drops below what a correct implementation comfortably meets.
 */
const BUDGET_FLOOR_MS = 250;

/** Iterations of trivial work used to size the machine. Arbitrary but fixed. */
const BASELINE_ROUNDS = 2_000_000;

/**
 * How long this machine takes to do a known-trivial amount of work, right now.
 *
 * Deliberately not cached across the file: load changes during a run, and a
 * baseline taken while the box was idle would be exactly as misleading as the
 * fixed budget it replaces.
 */
function measureBaseline(): number {
  const started = Date.now();

  let accumulator = 0;
  for (let index = 0; index < BASELINE_ROUNDS; index += 1) {
    accumulator += index % 7;
  }

  // Read it so the loop cannot be optimised away.
  if (accumulator < 0) throw new Error('unreachable');

  return Math.max(1, Date.now() - started);
}

/**
 * The ceiling for this assertion, on this machine, in this run.
 *
 * `multiplier` expresses how much slower this operation is allowed to be than
 * the trivial baseline. The numbers are generous by design: this suite exists to
 * catch a quadratic regression, not to hold a millisecond budget.
 */
function budgetMs(multiplier = 1): number {
  return Math.max(BUDGET_FLOOR_MS, measureBaseline() * 25) * multiplier;
}

function membershipSetOf(communities: Community[]): CommunityMembershipSet {
  return {
    memberships: communities.map((community, index) => ({
      communityId: community.id,
      state: index === 0 ? 'VerifiedMember' : index % 3 === 0 ? 'Interested' : 'Member',
      isPrimary: index === 0,
      roles: [],
      capabilities: {
        communityId: community.id,
        roles: [],
        canViewMembers: false,
        canViewPrivateStatistics: false,
        canPostToCommunity: false,
        canModerateContent: false,
        canReviewReports: false,
        canPublishNotice: false,
        canManageRules: false,
        canManageRoles: false,
        canAppointAdministrators: false,
        canLeave: index % 3 !== 0 || index === 0,
        canRequestDeletion: false,
        canTransferOwnership: false,
        canViewModerationQueue: false,
        canViewAmbassadorDirectory: false,
        canManageInitiatives: false,
      },
      visibility: 'Private',
    })),
    primaryCommunityId: communities[0]?.id ?? null,
  };
}

function elapsed(work: () => void): number {
  const started = Date.now();
  work();
  return Date.now() - started;
}

// ═════════════════════════════════════════════════════════════════════════════
// SCALE — §77's four sizes
// ═════════════════════════════════════════════════════════════════════════════

describe('§77 — the four community counts', () => {
  const SIZES = [1, 10, 100, PERFORMANCE_SET_SIZE];

  it.each(SIZES)('resolves a scope over %i communities within budget', (size) => {
    const communities = getPerformanceCommunitySet(size);
    const set = membershipSetOf(communities);

    // A fixed round count over a growing set measures total work, not complexity —
    // 100 rounds × 1,200 memberships × 3 modes is 360,000 array traversals, and a
    // fixed millisecond budget over that is a flake on a loaded CI box rather than
    // an assertion about the code.
    //
    // So the *work* is held roughly constant instead: rounds shrink as the set
    // grows. That keeps the assertion meaningful — it still fails on a quadratic
    // regression, because a quadratic `resolveScope` would blow the budget at 1,200
    // even at one round — without failing on a slow machine.
    //
    // The **upper cap** exists because `rounds × size` models only the traversal
    // work and ignores each call's fixed overhead. Without it, `size = 1` ran
    // 30,000 rounds against 25 at `size = 1200` — 1,200× the call count for the
    // same nominal work, so the fixed overhead dominated and the smallest case
    // became the slowest. It then failed whenever the box was busy, which is
    // exactly the flake this formula was written to avoid. Two thousand rounds is
    // still four orders of magnitude more than any real screen performs and
    // catches a per-call regression comfortably.
    const rounds = Math.min(2_000, Math.max(5, Math.floor(30_000 / size)));

    const duration = elapsed(() => {
      for (let round = 0; round < rounds; round += 1) {
        resolveScope({ mode: 'PRIMARY_COMMUNITY' }, set);
        resolveScope({ mode: 'INTERESTED_COMMUNITIES' }, set);
        resolveScope({ mode: 'CROSS_COMMUNITY' }, set);
      }
    });

    expect(duration).toBeLessThan(budgetMs());
  });

  it.each(SIZES)('builds the development set of %i without a stall', (size) => {
    const duration = elapsed(() => getPerformanceCommunitySet(size));

    expect(duration).toBeLessThan(budgetMs());
  });

  it('memoizes the large set rather than rebuilding it per call', () => {
    getPerformanceCommunitySet();

    const second = elapsed(() => {
      for (let round = 0; round < 50; round += 1) getPerformanceCommunitySet();
    });

    expect(second).toBeLessThan(budgetMs());
  });

  it('produces the same set every run, so a measurement is comparable', () => {
    const first = getPerformanceCommunitySet(50).map((c) => c.memberCount?.value);
    const again = getPerformanceCommunitySet(50).map((c) => c.memberCount?.value);

    expect(again).toEqual(first);
  });
});

describe('resolving a primary community does not scan the community list', () => {
  it('costs the same at 10 and at 1,200 — it reads the membership set only', () => {
    const small = membershipSetOf(getPerformanceCommunitySet(10));
    const large = membershipSetOf(getPerformanceCommunitySet(PERFORMANCE_SET_SIZE));

    const smallDuration = elapsed(() => {
      for (let round = 0; round < 2_000; round += 1) resolveScope({ mode: 'PRIMARY_COMMUNITY' }, small);
    });

    const largeDuration = elapsed(() => {
      for (let round = 0; round < 2_000; round += 1) resolveScope({ mode: 'PRIMARY_COMMUNITY' }, large);
    });

    // Both are trivially fast; the point is that the large case is not orders of
    // magnitude worse, which it would be if a scan crept in.
    expect(smallDuration).toBeLessThan(budgetMs());
    expect(largeDuration).toBeLessThan(budgetMs(4));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PROJECTION AND FILTERING — large result sets
// ═════════════════════════════════════════════════════════════════════════════

describe('§77 — large discovery results and multiple community filters', () => {
  const communities = getPerformanceCommunitySet(PERFORMANCE_SET_SIZE);
  const lookup = (id: string) => communities.find((c) => c.id === id);

  it('projects a 50-community scope within budget', () => {
    const scope = {
      mode: 'CROSS_COMMUNITY' as const,
      communityIds: communities.slice(0, 50).map((c) => c.id),
    };

    const duration = elapsed(() => {
      for (let round = 0; round < 20; round += 1) projectScope(scope, lookup);
    });

    expect(duration).toBeLessThan(budgetMs(4));
  });

  it('narrows a 5,000-result page within budget', () => {
    const scope = { mode: 'SELECTED_COMMUNITY' as const, communityIds: [communities[1].id] };
    const projection = projectScope(scope, lookup);

    const items = Array.from({ length: 5_000 }, (_, index) => ({
      owner: { originCountry: { code: index % 3 === 0 ? 'NG' : 'GH' } },
    }));

    const duration = elapsed(() => {
      narrowToScope('provider', items, projection);
    });

    expect(duration).toBeLessThan(budgetMs());
  });

  it('matches a projection in constant time per item', () => {
    const scope = {
      mode: 'CROSS_COMMUNITY' as const,
      communityIds: communities.slice(0, 20).map((c) => c.id),
    };
    const projection = projectScope(scope, lookup);

    const duration = elapsed(() => {
      for (let round = 0; round < 100_000; round += 1) matchesProjection('NG', projection);
    });

    expect(duration).toBeLessThan(budgetMs(4));
  });

  it('canonicalizes a 1,200-id selection within budget', () => {
    const ids = communities.map((c) => c.id);

    const duration = elapsed(() => {
      for (let round = 0; round < 50; round += 1) canonicalCommunityIds(ids);
    });

    expect(duration).toBeLessThan(budgetMs(4));
  });

  it('builds a scope token for a 1,200-community scope without a stall', () => {
    const scope = { mode: 'CROSS_COMMUNITY' as const, communityIds: communities.map((c) => c.id) };

    const duration = elapsed(() => {
      for (let round = 0; round < 50; round += 1) communityScopeToken(scope);
    });

    expect(duration).toBeLessThan(budgetMs(4));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SWITCHING — repeated and rapid
// ═════════════════════════════════════════════════════════════════════════════

describe('§77 — repeated and rapid community switching', () => {
  beforeEach(() => {
    useCommunityContextStore.getState().reset();
  });

  it('handles 1,000 switches without unbounded growth', () => {
    const communities = getPerformanceCommunitySet(200);

    const duration = elapsed(() => {
      for (let round = 0; round < 1_000; round += 1) {
        useCommunityContextStore.getState().switchTo(communities[round % communities.length].id);
      }
    });

    expect(duration).toBeLessThan(budgetMs(8));

    // The recents list is the one thing that could grow without bound.
    expect(useCommunityContextStore.getState().recentCommunityIds.length).toBeLessThanOrEqual(8);
  });

  it('keeps the last selection after rapid switching', () => {
    const communities = getPerformanceCommunitySet(20);

    for (const community of communities) {
      useCommunityContextStore.getState().switchTo(community.id);
    }

    expect(useCommunityContextStore.getState().activeCommunityId).toBe(
      communities[communities.length - 1].id
    );
  });

  it('does not re-emit or re-persist when switching to the community already active', () => {
    const store = useCommunityContextStore.getState();
    store.switchTo('c-1');

    const before = useCommunityContextStore.getState().recentCommunityIds;
    useCommunityContextStore.getState().switchTo('c-1');
    const after = useCommunityContextStore.getState().recentCommunityIds;

    expect(after).toEqual(before);
  });

  it('handles a 500-community cross-community selection', () => {
    const ids = getPerformanceCommunitySet(500).map((c) => c.id);

    const duration = elapsed(() => {
      useCommunityContextStore.getState().enableCrossCommunity(ids);
    });

    expect(duration).toBeLessThan(budgetMs(4));
    expect(useCommunityContextStore.getState().selectedCommunityIds).toHaveLength(500);
  });

  it('reconciles a 1,200-community available set within budget (§75)', () => {
    const ids = getPerformanceCommunitySet(PERFORMANCE_SET_SIZE).map((c) => c.id);
    useCommunityContextStore.getState().enableCrossCommunity(ids.slice(0, 100));

    const duration = elapsed(() => {
      useCommunityContextStore.getState().reconcile({ availableIds: ids, primaryId: ids[0] });
    });

    expect(duration).toBeLessThan(budgetMs(4));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §60 — no duplicate cache entries for equivalent scopes
// ═════════════════════════════════════════════════════════════════════════════

describe('§60 — equivalent scopes share one cache entry', () => {
  it('does not fork the cache on ordering', () => {
    const a = communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['a', 'b', 'c'] });
    const b = communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['c', 'a', 'b'] });

    expect(a).toBe(b);
  });

  it('does not fork the cache on mode when the resolved set is identical', () => {
    // `PRIMARY_COMMUNITY` resolving to [x] and `SELECTED_COMMUNITY` resolving to [x]
    // produce the same request. Two entries would be pure waste.
    expect(communityScopeToken({ mode: 'PRIMARY_COMMUNITY', communityIds: ['x'] })).toBe(
      communityScopeToken({ mode: 'SELECTED_COMMUNITY', communityIds: ['x'] })
    );
  });

  it('does not fork the cache on duplicate ids', () => {
    expect(communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['a', 'a', 'b'] })).toBe(
      communityScopeToken({ mode: 'CROSS_COMMUNITY', communityIds: ['a', 'b'] })
    );
  });
});
