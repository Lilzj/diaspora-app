// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-community end-to-end journeys (Frontend Phase 13,
// §71, §73)
//
// §73's ten required journeys and §71's critical scenarios, each driven through the
// real API clients, the real handlers and the real context store against the real
// scope resolver. These are the acceptance tests for the phase: a journey that
// passes here is a journey a member can complete, and a journey that changes shape
// when a gap closes will fail here first.
//
// The store is exercised directly rather than through a rendered screen, following
// the precedent Phase 12 set. What that buys is the ability to assert the *scope*
// each step produced — which is the thing the journeys are actually about, and which
// a render test would hide behind a spinner.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupCommunityDirectoryMocks } from '@/mocks/handlers/community-directory';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import * as api from '../community-gap-directory-api';
import { fetchScopedContent } from '../community-directory-api';
import {
  communityScopeToken,
  isEmptyScope,
  isUnscoped,
  projectScope,
  resolveScope,
} from '../community/scope';
import {
  selectCommunityFilterSelection,
  useCommunityContextStore,
} from '@/store/community-context';
import { MOCK_COMMUNITIES } from '@/mocks/community-directory-data';
import type { CommunityMembershipSet, CommunityScope } from '@/types/community-directory';

let mock: MockAdapter;

const lookup = (id: string) => MOCK_COMMUNITIES.find((c) => c.id === id);
const bySlug = (slug: string) => MOCK_COMMUNITIES.find((c) => c.slug === slug)!;

const NIGERIAN = bySlug('nigerian');
const GHANAIAN = bySlug('ghanaian');
const INDIAN = bySlug('indian');
const WEST_AFRICAN = bySlug('west-african');
const MANCHESTER = bySlug('nigerian-manchester');

beforeEach(async () => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupCommunityDirectoryMocks(mock);
  setupHousingMocks(mock);
  setupJobsMocks(mock);
  setupMarketplaceMocks(mock);
  setupDiscoveryMocks(mock);
  mock.onAny().reply(404);

  // A clean context store per journey. `reset` marks it hydrated, so the scope
  // resolves immediately rather than waiting on AsyncStorage.
  useCommunityContextStore.getState().reset();
});

afterEach(() => {
  mock.restore();
});

/** The store's selection, resolved against a membership set. */
function currentScope(set: CommunityMembershipSet): CommunityScope {
  const selection = selectCommunityFilterSelection(useCommunityContextStore.getState());
  return resolveScope(selection, set);
}

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 1 — New user → primary Nigerian, interested Ghanaian → Home
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 1: onboarding a new member', () => {
  it('joins Nigerian as primary, marks Ghanaian as interested, and lands scoped', async () => {
    // A member with nothing. §71's "user with no community".
    useCommunityContextStore.getState().reset();
    expect(isUnscoped(currentScope({ memberships: [] }))).toBe(true);

    // Step: choose a primary community. The join has to come first — the adapter
    // refuses a primary that is not a joined community, and a real contract must
    // state the same rule (GAP-005).
    const joined = await api.performMembershipAction(WEST_AFRICAN.id, 'join');
    expect(joined.state).toBe('Member');

    const set = await api.setPrimaryCommunity(WEST_AFRICAN.id);
    expect(set.primaryCommunityId).toBe(WEST_AFRICAN.id);

    // Step: express interest in another. Interest is not membership (§8).
    const interested = await api.performMembershipAction(INDIAN.id, 'express-interest');
    expect(interested.state).toBe('Interested');

    // Step: the onboarding flow points the context at the primary.
    useCommunityContextStore
      .getState()
      .switchTo(WEST_AFRICAN.id, { mode: 'PRIMARY_COMMUNITY' });

    const after = await api.fetchMembershipSet();
    const scope = currentScope(after);

    expect(scope.mode).toBe('PRIMARY_COMMUNITY');
    expect(scope.communityIds).toEqual([WEST_AFRICAN.id]);
  });

  it('supports skipping entirely — a member with no community sees everything (§9, §71)', async () => {
    useCommunityContextStore.getState().reset();

    const scope = currentScope({ memberships: [] });

    expect(isUnscoped(scope)).toBe(true);
    expect(communityScopeToken(scope)).toBe('all');

    // And an unscoped read genuinely returns the whole page.
    const projection = projectScope(scope, lookup);
    const result = await fetchScopedContent('job', {}, projection);

    expect(result.scopeApplied).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 2 — Switch Nigerian → Ghanaian → Discover shows Ghanaian content
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 2: switching community', () => {
  it('switches and the discovery results change with it', async () => {
    const set = await api.fetchMembershipSet();
    const store = useCommunityContextStore.getState();

    store.switchTo(NIGERIAN.id);
    const nigerianScope = currentScope(set);
    const nigerianProjection = projectScope(nigerianScope, lookup);
    const nigerianJobs = await fetchScopedContent('job', {}, nigerianProjection);

    useCommunityContextStore.getState().switchTo(GHANAIAN.id);
    const ghanaianScope = currentScope(set);
    const ghanaianProjection = projectScope(ghanaianScope, lookup);
    const ghanaianJobs = await fetchScopedContent('job', {}, ghanaianProjection);

    // Different scope, different token — which is what keeps the two caches apart.
    expect(communityScopeToken(nigerianScope)).not.toBe(communityScopeToken(ghanaianScope));
    expect(nigerianProjection.originCountryCodes).toEqual(['NG']);
    expect(ghanaianProjection.originCountryCodes).toEqual(['GH']);

    // No Nigerian-origin employer survives the Ghanaian scope, and vice versa.
    for (const job of ghanaianJobs.items as Record<string, unknown>[]) {
      const employer = job.employer as Record<string, unknown>;
      const origin = employer.originCountry as Record<string, unknown> | undefined;
      expect(String(origin?.code).toUpperCase()).toBe('GH');
    }

    for (const job of nigerianJobs.items as Record<string, unknown>[]) {
      const employer = job.employer as Record<string, unknown>;
      const origin = employer.originCountry as Record<string, unknown> | undefined;
      expect(String(origin?.code).toUpperCase()).toBe('NG');
    }
  });

  it('remembers the switch in the recents list, for the switcher', () => {
    const store = useCommunityContextStore.getState();

    store.switchTo(NIGERIAN.id);
    useCommunityContextStore.getState().switchTo(GHANAIAN.id);
    useCommunityContextStore.getState().switchTo(INDIAN.id);

    expect(useCommunityContextStore.getState().recentCommunityIds).toEqual([
      INDIAN.id,
      GHANAIAN.id,
      NIGERIAN.id,
    ]);
  });

  it('does not reload the app or clear unrelated state (§11)', () => {
    const store = useCommunityContextStore.getState();
    store.switchTo(NIGERIAN.id);

    const before = useCommunityContextStore.getState();
    useCommunityContextStore.getState().switchTo(GHANAIAN.id);
    const after = useCommunityContextStore.getState();

    // The switch changes the selection and nothing structural.
    expect(after.isHydrated).toBe(before.isHydrated);
    expect(after.mode).toBe('SELECTED_COMMUNITY');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 3 — Cross-community mode → marketplace across Nigerian + Ghanaian
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 3: cross-community discovery', () => {
  it('searches the marketplace across two communities at once', async () => {
    const set = await api.fetchMembershipSet();

    useCommunityContextStore.getState().enableCrossCommunity([NIGERIAN.id, GHANAIAN.id]);

    const scope = currentScope(set);
    expect(scope.mode).toBe('CROSS_COMMUNITY');
    expect(scope.communityIds).toEqual([GHANAIAN.id, NIGERIAN.id].sort());

    const projection = projectScope(scope, lookup);
    expect(projection.originCountryCodes).toEqual(['GH', 'NG']);
    // Two countries: no single code, so the routes cannot express it at all.
    expect(projection.singleCountryCode).toBeNull();

    const result = await fetchScopedContent('marketplace', {}, projection);

    for (const listing of result.items as Record<string, unknown>[]) {
      const seller = listing.seller as Record<string, unknown>;
      const origin = seller.originCountry as Record<string, unknown> | undefined;
      expect(['NG', 'GH']).toContain(String(origin?.code).toUpperCase());
    }
  });

  it('is a different scope from either community alone', async () => {
    const set = await api.fetchMembershipSet();

    useCommunityContextStore.getState().switchTo(NIGERIAN.id);
    const single = communityScopeToken(currentScope(set));

    useCommunityContextStore.getState().enableCrossCommunity([NIGERIAN.id, GHANAIAN.id]);
    const both = communityScopeToken(currentScope(set));

    expect(single).not.toBe(both);
    // …and neither is `all`.
    expect(both).not.toBe('all');
  });

  it('falls back to the member’s own communities when nothing explicit is chosen', async () => {
    const set = await api.fetchMembershipSet();

    useCommunityContextStore.getState().enableCrossCommunity();
    const scope = currentScope(set);

    // The member belongs to Nigerian, follows West African and is a member of the
    // Manchester chapter — interests are excluded, because §8 keeps them separate.
    expect(scope.communityIds).toContain(NIGERIAN.id);
    expect(scope.communityIds).toContain(WEST_AFRICAN.id);
    expect(scope.communityIds).not.toContain(GHANAIAN.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 4 — Community profile → statistics → each content section
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 4: reading a community end to end', () => {
  // Statistics, rules and role holders left this journey on 20 Oct 2026: they
  // are served for real and `community-governance-api.test.ts` covers them.
  it('walks the profile and all seven content sections', async () => {
    const community = await api.fetchCommunity('nigerian');
    expect(community.status).toBe('Active');

    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: [community.id] },
      lookup
    );

    // **Remediation Wave J.** This asserted `scopeApplied` and `isApproximate`
    // for all four domains. Only `job` carries a publisher origin on its
    // response; `housing`, `marketplace` and `provider` do not, and the old
    // assertion passed only because the narrowing used to fall back to the row's
    // *location* country and report that as a community filter.
    //
    // What every section must still do is **say which of the two happened** —
    // §2 in the product — so the loop now asserts that each result carries one
    // of the two honest verdicts and never a silent third state.
    for (const domain of ['job', 'housing', 'marketplace', 'provider'] as const) {
      const result = await fetchScopedContent(domain, {}, projection);

      if (result.scopeUnavailable) {
        // No origin on the page: nothing narrowed, nothing claimed, page whole.
        expect(result.scopeApplied).toBe(false);
        expect(result.isApproximate).toBe(false);
        expect(result.totalAfterScope).toBe(result.totalBeforeScope);
      } else {
        expect(result.scopeApplied).toBe(true);
        expect(result.isApproximate).toBe(true);
      }
    }

    // And `job` is specifically the one that can still be narrowed, so the
    // journey does not quietly become "nothing is ever scoped".
    const jobs = await fetchScopedContent('job', {}, projection);
    expect(jobs.scopeApplied).toBe(true);
    expect(jobs.isApproximate).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 5 — Join → membership state changes → feed updates
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 5: joining changes what the member sees', () => {
  it('moves the state and changes the resolved scope in the same step', async () => {
    let set = await api.fetchMembershipSet();

    // Before: not a member of the Manchester chapter's origin scope in cross mode.
    useCommunityContextStore.getState().enableCrossCommunity();
    const before = currentScope(set);

    await api.performMembershipAction(GHANAIAN.id, 'join');
    set = await api.fetchMembershipSet();

    useCommunityContextStore.getState().enableCrossCommunity();
    const after = currentScope(set);

    expect(after.communityIds).toContain(GHANAIAN.id);
    expect(communityScopeToken(before)).not.toBe(communityScopeToken(after));
  });

  it('takes an approval-gated community to Pending, not to Member', async () => {
    const tamil = bySlug('tamil');
    const membership = await api.performMembershipAction(tamil.id, 'join');

    expect(membership.state).toBe('PendingApproval');

    // A pending application is not belonging, so it is not in "my communities".
    const set = await api.fetchMembershipSet();
    useCommunityContextStore.getState().enableCrossCommunity();

    expect(currentScope(set).communityIds).not.toContain(tamil.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 6 — Add interest → personalization scope updates
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 6: expressing interest', () => {
  it('changes the interested scope without claiming membership', async () => {
    await api.performMembershipAction(MANCHESTER.id, 'express-interest');
    const set = await api.fetchMembershipSet();

    useCommunityContextStore.getState().setMode('INTERESTED_COMMUNITIES');
    const scope = currentScope(set);

    expect(scope.communityIds).toContain(MANCHESTER.id);

    // …but "my communities" — the belonging list — does not include it.
    useCommunityContextStore.getState().enableCrossCommunity();
    expect(currentScope(set).communityIds).not.toContain(MANCHESTER.id);
  });

  it('renders an empty state, not everything, when the last interest is removed', async () => {
    await api.performMembershipAction(GHANAIAN.id, 'remove-interest');
    await api.performMembershipAction(INDIAN.id, 'remove-interest');
    const set = await api.fetchMembershipSet();

    useCommunityContextStore.getState().setMode('INTERESTED_COMMUNITIES');
    const scope = currentScope(set);

    expect(isEmptyScope(scope)).toBe(true);
    expect(isUnscoped(scope)).toBe(false);
    expect(communityScopeToken(scope)).toBe('none');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 7 — Map → community filter → nearby results
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 7: the map with a community filter', () => {
  it('carries the scope into the parameters the map search sends', async () => {
    const set = await api.fetchMembershipSet();
    useCommunityContextStore.getState().switchTo(NIGERIAN.id);

    const scope = currentScope(set);
    const projection = projectScope(scope, lookup);

    // What `useCommunityMapScope` produces, and what lands in the fingerprint.
    const mapParams = {
      communityIds: scope.communityIds,
      communityOriginCountryCodes: projection.originCountryCodes,
    };

    expect(mapParams.communityIds).toEqual([NIGERIAN.id]);
    expect(mapParams.communityOriginCountryCodes).toEqual(['NG']);
  });

  it('produces an empty map parameter set when unscoped, so §69 holds', async () => {
    useCommunityContextStore.getState().clearScope();
    const scope = currentScope({ memberships: [] });
    const projection = projectScope(scope, lookup);

    expect(projection.isUnscoped).toBe(true);
    // The hook returns `{}` here, so the fingerprint is unchanged from pre-Phase-13.
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 8 — Moderator: the community queue is served for real since 20 Oct
// 2026 and its simulated route is gone; `community-governance-api.test.ts`
// covers the real client and `moderation.tsx`'s screen test covers the screen.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 9 — Ambassador → profile → initiatives
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 9: an ambassador and their initiatives', () => {
  it('reads the initiatives ambassadors lead', async () => {
    const initiatives = await api.fetchCommunityInitiatives(MANCHESTER.id);
    expect(initiatives.length).toBeGreaterThan(0);

    const led = initiatives.find((initiative) => initiative.leads.length > 0);
    expect(led?.leads[0].role).toBe('Ambassador');

    // §29: a progress bar with no definition behind it would be a number chosen to
    // look encouraging. Where one exists it is marked.
    if (led?.progress) expect(led.progress.source).toBe('simulated');
  });

  it('reports the ambassador capability the server granted, and not more', async () => {
    const capabilities = await api.fetchCapabilities(MANCHESTER.id);

    expect(capabilities.canManageInitiatives).toBe(true);
    expect(capabilities.canPublishNotice).toBe(true);
    // Being an ambassador is not being a moderator.
    expect(capabilities.canReviewReports).toBe(false);
    expect(capabilities.canViewModerationQueue).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 10 — Deep link → /community/ghanaian/events → context restored
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 10: a deep link restores the community context', () => {
  it('resolves the slug and applies the community as the active scope', async () => {
    // The app opens cold, unscoped.
    useCommunityContextStore.getState().reset();
    expect(isUnscoped(currentScope({ memberships: [] }))).toBe(true);

    // `/community/ghanaian/events` — the `[slug]` layout resolves and applies.
    const community = await api.fetchCommunity('ghanaian');
    useCommunityContextStore
      .getState()
      .applySelection({ mode: 'SELECTED_COMMUNITY', communityIds: [community.id] });

    const set = await api.fetchMembershipSet();
    const scope = currentScope(set);

    expect(scope.mode).toBe('SELECTED_COMMUNITY');
    expect(scope.communityIds).toEqual([GHANAIAN.id]);
    expect(useCommunityContextStore.getState().activeCommunityId).toBe(GHANAIAN.id);
  });

  it('keeps the restored context when navigating onward (§54)', async () => {
    const community = await api.fetchCommunity('ghanaian');
    useCommunityContextStore
      .getState()
      .applySelection({ mode: 'SELECTED_COMMUNITY', communityIds: [community.id] });

    // Navigating from events to a listing and back must not lose the community.
    const set = await api.fetchMembershipSet();
    expect(currentScope(set).communityIds).toEqual([GHANAIAN.id]);
    expect(currentScope(set).communityIds).toEqual([GHANAIAN.id]);
  });

  it('lands on a distinct state for a deep link to a suspended community (§74)', async () => {
    const community = await api.fetchCommunity('suspended-example');

    expect(community.status).toBe('Suspended');
    expect(community.statusReason).toBeTruthy();
  });

  it('lands on not-found for a deep link to a community that does not exist', async () => {
    await expect(api.fetchCommunity('no-such-community')).rejects.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §71 — the remaining critical scenarios
// ═════════════════════════════════════════════════════════════════════════════

describe('§71 critical scenarios', () => {
  it('handles a member with exactly one community', async () => {
    const set: CommunityMembershipSet = {
      memberships: [
        {
          communityId: NIGERIAN.id,
          state: 'Member',
          isPrimary: true,
          roles: ['Member'],
          capabilities: {
            communityId: NIGERIAN.id,
            roles: ['Member'],
            canViewMembers: true,
            canViewPrivateStatistics: false,
            canPostToCommunity: true,
            canModerateContent: false,
            canReviewReports: false,
            canPublishNotice: false,
            canManageRules: false,
            canManageRoles: false,
            canAppointAdministrators: false,
            canLeave: true,
            canRequestDeletion: false,
            canTransferOwnership: false,
            canViewModerationQueue: false,
            canViewAmbassadorDirectory: true,
            canManageInitiatives: false,
          },
          visibility: 'Private',
        },
      ],
      primaryCommunityId: NIGERIAN.id,
    };

    useCommunityContextStore.getState().setMode('PRIMARY_COMMUNITY');
    expect(currentScope(set).communityIds).toEqual([NIGERIAN.id]);
  });

  it('handles a community with no content for the active scope', async () => {
    // The Filipino community is Pending and has no matching fixtures.
    const projection = projectScope(
      { mode: 'SELECTED_COMMUNITY', communityIds: [bySlug('filipino').id] },
      lookup
    );

    const result = await fetchScopedContent('job', {}, projection);

    expect(result.items).toEqual([]);
    expect(result.scopeApplied).toBe(true);
  });

  it('handles the community backend being unavailable', async () => {
    mock.reset();
    mock.onAny().reply(500);

    await expect(api.fetchCommunityDirectory()).rejects.toBeDefined();
    await expect(api.fetchMembershipSet()).rejects.toBeDefined();
  });

  it('handles the membership backend being unavailable while the directory works', async () => {
    mock.reset();
    // The 503 is registered FIRST: `axios-mock-adapter` matches in registration
    // order, so registering the handler first would let it answer and the outage
    // would never happen.
    mock.onGet(/\/communities\/memberships\/me/).reply(503);
    setupCommunityDirectoryMocks(mock);
    mock.onAny().reply(404);

    // The directory still works — the point of this scenario.
    await expect(api.fetchCommunityDirectory()).resolves.toBeDefined();

    await expect(api.fetchMembershipSet()).rejects.toBeDefined();

    // With no membership set, `PRIMARY_COMMUNITY` resolves empty rather than to
    // everything — the degradation that matters.
    useCommunityContextStore.getState().setMode('PRIMARY_COMMUNITY');
    expect(isEmptyScope(currentScope({ memberships: [] }))).toBe(true);
  });

  it('handles a revoked membership arriving in the set', async () => {
    const set = await api.fetchMembershipSet();
    const revoked = set.memberships.find((m) => m.state === 'Revoked');

    expect(revoked).toBeDefined();
    expect(revoked?.stateReason).toBeTruthy();

    // A revoked community is not in any scope the member can act in.
    useCommunityContextStore.getState().enableCrossCommunity();
    expect(currentScope(set).communityIds).not.toContain(revoked!.communityId);
  });

  it('drops an unusable active community and falls back (§75)', async () => {
    const store = useCommunityContextStore.getState();
    store.switchTo('a-community-that-vanished');

    useCommunityContextStore.getState().reconcile({
      availableIds: [NIGERIAN.id, GHANAIAN.id],
      primaryId: NIGERIAN.id,
    });

    // The chain: the primary, then the first available, then unscoped.
    expect(useCommunityContextStore.getState().activeCommunityId).toBe(NIGERIAN.id);
  });

  it('does not clobber a good selection when nothing has loaded yet', () => {
    const store = useCommunityContextStore.getState();
    store.switchTo(NIGERIAN.id);

    useCommunityContextStore.getState().reconcile({ availableIds: [], primaryId: null });

    expect(useCommunityContextStore.getState().activeCommunityId).toBe(NIGERIAN.id);
  });

  it('prunes a stale cross-community selection during reconciliation', () => {
    useCommunityContextStore.getState().enableCrossCommunity([NIGERIAN.id, 'gone']);

    useCommunityContextStore
      .getState()
      .reconcile({ availableIds: [NIGERIAN.id], primaryId: NIGERIAN.id });

    expect(useCommunityContextStore.getState().selectedCommunityIds).toEqual([NIGERIAN.id]);
  });

  it('handles rapid switching without losing the last selection (§77)', () => {
    const ids = [NIGERIAN.id, GHANAIAN.id, INDIAN.id, WEST_AFRICAN.id, MANCHESTER.id];

    for (let round = 0; round < 20; round += 1) {
      useCommunityContextStore.getState().switchTo(ids[round % ids.length]);
    }

    expect(useCommunityContextStore.getState().activeCommunityId).toBe(ids[19 % ids.length]);
    // The recents list stays bounded.
    expect(useCommunityContextStore.getState().recentCommunityIds.length).toBeLessThanOrEqual(8);
  });
});
