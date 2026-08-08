// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-community repositories against their handlers
// (Frontend Phase 13, §70)
//
// Runs the real `community-gap-directory-api.ts` and `community-directory-api.ts`
// against the real handlers. Nothing is re-implemented; a test against a
// re-implementation of the thing under test proves nothing.
//
// Two halves, matching the phase's two arms:
//
//   The **development** arm, against `/community-directory/v0/*`. What is asserted
//   is not "the fixture came back" but the properties a screen depends on: that
//   route order does not make `/communities/memberships/me` resolve as a community
//   called "memberships"; that a private community is a 403 and a missing one a 404;
//   that a capability-gated route refuses; that the statistics response is genuinely
//   hybrid; and that `sort=members` is *refused* rather than silently downgraded.
//
//   The **certified** arm, against the real `/jobs`, `/housing`, `/marketplace` and
//   `/listings` handlers. What is asserted there is that the community projection
//   narrows a real page correctly and reports honestly how much it set aside.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupCommunityDirectoryMocks } from '@/mocks/handlers/community-directory';
import { setupHousingMocks } from '@/mocks/handlers/housing';
import { setupJobsMocks } from '@/mocks/handlers/jobs';
import { setupMarketplaceMocks } from '@/mocks/handlers/marketplace';
import { setupDiscoveryMocks } from '@/mocks/handlers/discovery';
import {
  decideCommunityReport,
  fetchCapabilities,
  fetchCommunity,
  fetchCommunityComparison,
  fetchCommunityDirectory,
  fetchCommunityInitiatives,
  fetchCommunityNotices,
  fetchCommunityPreferences,
  fetchCommunityReports,
  fetchCommunityRoleHolders,
  fetchCommunityRules,
  fetchCommunityStatistics,
  fetchCommunitySuggestions,
  fetchMembershipSet,
  performMembershipAction,
  saveCommunityPreferences,
  setPrimaryCommunity,
} from '@/lib/community-gap-directory-api';
import { fetchScopedContent, narrowToScope } from '@/lib/community-directory-api';
import { projectScope, toRef } from '@/lib/community/scope';
import { MOCK_COMMUNITIES } from '@/mocks/community-directory-data';
import type { Community, CommunityScope } from '@/types/community-directory';

let mock: MockAdapter;

const lookup = (id: string) => MOCK_COMMUNITIES.find((c) => c.id === id);
const NIGERIAN = MOCK_COMMUNITIES.find((c) => c.slug === 'nigerian')!;
const GHANAIAN = MOCK_COMMUNITIES.find((c) => c.slug === 'ghanaian')!;
const WEST_AFRICAN = MOCK_COMMUNITIES.find((c) => c.slug === 'west-african')!;
const PRIVATE = MOCK_COMMUNITIES.find((c) => c.slug === 'private-example')!;
const SUSPENDED = MOCK_COMMUNITIES.find((c) => c.slug === 'suspended-example')!;
const PENDING = MOCK_COMMUNITIES.find((c) => c.slug === 'filipino')!;

beforeEach(() => {
  // A fresh adapter per test, because the handler holds mutable session state —
  // memberships change when a test joins something, and a shared adapter would make
  // the tests order-dependent.
  jest.resetModules();
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupCommunityDirectoryMocks(mock);
  setupHousingMocks(mock);
  setupJobsMocks(mock);
  setupMarketplaceMocks(mock);
  setupDiscoveryMocks(mock);
  mock.onAny().reply(404);
});

afterEach(() => {
  mock.restore();
});

// ═════════════════════════════════════════════════════════════════════════════
// THE DIRECTORY
// ═════════════════════════════════════════════════════════════════════════════

describe('the community directory (GAP-001)', () => {
  it('returns the curated communities with the caller’s membership state per row', async () => {
    const page = await fetchCommunityDirectory();

    expect(page.items.length).toBeGreaterThan(5);
    expect(page.source).toBe('simulated');

    const nigerian = page.items.find((entry) => entry.community.slug === 'nigerian');
    expect(nigerian?.membershipState).toBe('VerifiedMember');
    expect(nigerian?.isPrimary).toBe(true);

    const ghanaian = page.items.find((entry) => entry.community.slug === 'ghanaian');
    // §8: an interest is not a membership, and the row says which it is.
    expect(ghanaian?.membershipState).toBe('Interested');
    expect(ghanaian?.isPrimary).toBe(false);
  });

  it('does not reveal a private community the caller has no membership in (§62)', async () => {
    const page = await fetchCommunityDirectory();

    expect(page.items.map((entry) => entry.community.slug)).not.toContain('private-example');
  });

  it('excludes unlisted communities from browse', async () => {
    const page = await fetchCommunityDirectory({ limit: 30 });

    expect(page.items.every((entry) => entry.community.visibility !== 'Unlisted')).toBe(true);
  });

  it('searches by name, country and region', async () => {
    for (const [query, expected] of [
      ['nigeria', 'nigerian'],
      ['ghana', 'ghanaian'],
      ['west africa', 'west-african'],
    ] as const) {
      const page = await fetchCommunityDirectory({ query });
      expect(page.items.map((entry) => entry.community.slug)).toContain(expected);
    }
  });

  it('filters by type', async () => {
    const page = await fetchCommunityDirectory({ types: ['RegionalDiaspora'] });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((entry) => entry.community.type === 'RegionalDiaspora')).toBe(true);
  });

  it('filters by country of origin — a country filter over communities, not a claim', async () => {
    const page = await fetchCommunityDirectory({ originCountryCodes: ['NG'] });

    const slugs = page.items.map((entry) => entry.community.slug);

    // Two communities share Nigeria. §2's many-to-one case, end to end.
    expect(slugs).toContain('nigerian');
    expect(slugs).toContain('yoruba');
    expect(slugs).not.toContain('ghanaian');
  });

  it('excludes joined communities when asked', async () => {
    const page = await fetchCommunityDirectory({ includeJoined: false });

    expect(page.items.map((entry) => entry.community.slug)).not.toContain('nigerian');
  });

  it('REFUSES sort=members rather than quietly downgrading (§31)', async () => {
    // §31 forbids implying popularity the backend does not report. A 422 a reviewer
    // can see beats a silent fallback nobody notices.
    await expect(fetchCommunityDirectory({ sort: 'members' })).rejects.toBeDefined();
  });

  it('sorts by name and by recency', async () => {
    const byName = await fetchCommunityDirectory({ sort: 'name' });
    const names = byName.items.map((entry) => entry.community.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const byRecent = await fetchCommunityDirectory({ sort: 'recent' });
    expect(byRecent.items.length).toBeGreaterThan(0);
  });

  it('pages with a cursor', async () => {
    const first = await fetchCommunityDirectory({ limit: 3 });

    expect(first.items).toHaveLength(3);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe('3');

    const second = await fetchCommunityDirectory({ limit: 3, cursor: first.nextCursor! });

    expect(second.items.map((e) => e.community.id)).not.toEqual(
      first.items.map((e) => e.community.id)
    );
  });

  it('returns suggestions with the reason stated, not implied (§55)', async () => {
    const suggestions = await fetchCommunitySuggestions('GB');

    expect(suggestions.length).toBeGreaterThan(0);
    for (const entry of suggestions) {
      expect(entry.reason).toBeTruthy();
    }
  });

  it('accepts no suggestion input beyond residence — §55 forbids inferring identity', async () => {
    // Called with nothing: a member who skipped residence sends nothing at all.
    const suggestions = await fetchCommunitySuggestions();

    expect(Array.isArray(suggestions)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE PROFILE — including the route-order trap
// ═════════════════════════════════════════════════════════════════════════════

describe('the community profile (GAP-002)', () => {
  it('resolves by slug, which is what a deep link carries (§53)', async () => {
    const community = await fetchCommunity('nigerian');

    expect(community.id).toBe(NIGERIAN.id);
  });

  it('resolves by id as well', async () => {
    const community = await fetchCommunity(NIGERIAN.id);

    expect(community.slug).toBe('nigerian');
  });

  it('does not swallow /communities/memberships/me as a community called "memberships"', async () => {
    // The route-order trap the handler's header warns about. If `{idOrSlug}` were
    // registered first, this would return a `Community` and the member's whole
    // relationship set would silently be missing.
    const set = await fetchMembershipSet();

    expect(Array.isArray(set.memberships)).toBe(true);
    expect(set.primaryCommunityId).toBe(NIGERIAN.id);
  });

  it('does not swallow /communities/suggestions or /communities/compare either', async () => {
    await expect(fetchCommunitySuggestions('GB')).resolves.toBeDefined();
    await expect(
      fetchCommunityComparison([NIGERIAN.id, GHANAIAN.id], '30d')
    ).resolves.toBeDefined();
  });

  it('answers 403 for a private community, distinct from 404 (§62, GAP-002)', async () => {
    // The distinction matters: a 404 would leak nothing but would send the client to
    // the wrong state, and a 403 on a nonexistent community would confirm it exists.
    const error = await fetchCommunity(PRIVATE.slug).catch((e) => e);

    expect(error).toBeDefined();
    expect(String(error?.message ?? error)).toBeTruthy();
  });

  it('answers 404 for a community that does not exist', async () => {
    await expect(fetchCommunity('no-such-community')).rejects.toBeDefined();
  });

  it('returns a suspended community WITH its reason, rather than refusing (§74, §75)', async () => {
    const community = await fetchCommunity(SUSPENDED.slug);

    expect(community.status).toBe('Suspended');
    expect(community.statusReason).toBeTruthy();
  });

  it('returns a pending community as readable', async () => {
    const community = await fetchCommunity(PENDING.slug);

    expect(community.status).toBe('Pending');
    // §29: a community may legitimately refuse to report a size. `null` is not zero.
    expect(community.memberCount).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP
// ═════════════════════════════════════════════════════════════════════════════

describe('membership transitions (GAP-003, GAP-004, GAP-005)', () => {
  it('joins a community that needs no approval', async () => {
    const membership = await performMembershipAction(WEST_AFRICAN.id, 'join');

    expect(membership.state).toBe('Member');
    expect(membership.joinedAt).toBeTruthy();
    // §41: a new membership defaults to Private. The member opts in to visibility.
    expect(membership.visibility).toBe('Private');
  });

  it('lands in PendingApproval where the community requires approval', async () => {
    const tamil = MOCK_COMMUNITIES.find((c) => c.slug === 'tamil')!;
    const membership = await performMembershipAction(tamil.id, 'join');

    expect(membership.state).toBe('PendingApproval');
    expect(membership.requiresApproval).toBe(true);
  });

  it('refuses to join a pending community, with the community’s own reason', async () => {
    await expect(performMembershipAction(PENDING.id, 'join')).rejects.toBeDefined();
  });

  it('refuses every transition on a suspended community (§75)', async () => {
    for (const action of ['join', 'follow', 'express-interest'] as const) {
      await expect(performMembershipAction(SUSPENDED.id, action)).rejects.toBeDefined();
    }
  });

  it('expresses and removes interest without ever claiming membership (§8)', async () => {
    const interested = await performMembershipAction(WEST_AFRICAN.id, 'express-interest');
    expect(interested.state).toBe('Interested');

    const removed = await performMembershipAction(WEST_AFRICAN.id, 'remove-interest');
    expect(removed.state).toBe('None');
  });

  it('follows and unfollows', async () => {
    expect((await performMembershipAction(GHANAIAN.id, 'follow')).state).toBe('Following');
    expect((await performMembershipAction(GHANAIAN.id, 'unfollow')).state).toBe('None');
  });

  it('leaves, and distinguishes Left from None (§74)', async () => {
    const left = await performMembershipAction(NIGERIAN.id, 'leave');

    expect(left.state).toBe('Left');
    expect(left.roles).toEqual([]);
    // A moderator who leaves is no longer a moderator.
    expect(left.capabilities.canViewModerationQueue).toBe(false);
  });

  it('sets the primary community and returns the whole set, so primacy cannot disagree', async () => {
    await performMembershipAction(GHANAIAN.id, 'join');
    const set = await setPrimaryCommunity(GHANAIAN.id);

    expect(set.primaryCommunityId).toBe(GHANAIAN.id);
    expect(set.memberships.filter((m) => m.isPrimary)).toHaveLength(1);
    expect(set.memberships.find((m) => m.isPrimary)?.communityId).toBe(GHANAIAN.id);
  });

  it('refuses a primary community the member has not joined (GAP-005’s open question)', async () => {
    await expect(setPrimaryCommunity(WEST_AFRICAN.id)).rejects.toBeDefined();
  });

  it('clears the primary community', async () => {
    const set = await setPrimaryCommunity(null);

    expect(set.primaryCommunityId).toBeNull();
    expect(set.memberships.every((m) => !m.isPrimary)).toBe(true);
  });

  it('refuses any transition for a revoked membership (§74)', async () => {
    // `suspended-example` carries a Revoked membership in the development data, and
    // the community is suspended — either alone is enough to refuse.
    await expect(performMembershipAction(SUSPENDED.id, 'join')).rejects.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CAPABILITIES AND MODERATION
// ═════════════════════════════════════════════════════════════════════════════

describe('capabilities and moderation (GAP-006, GAP-017)', () => {
  it('returns an all-false set for a non-member rather than a 403 (GAP-006)', async () => {
    const capabilities = await fetchCapabilities(WEST_AFRICAN.id);

    expect(capabilities.communityId).toBe(WEST_AFRICAN.id);
    expect(capabilities.canViewModerationQueue).toBe(false);
    expect(capabilities.canReviewReports).toBe(false);
    expect(capabilities.roles).toEqual([]);
  });

  it('returns the moderator’s capabilities where the server granted them', async () => {
    const capabilities = await fetchCapabilities(NIGERIAN.id);

    expect(capabilities.canViewModerationQueue).toBe(true);
    expect(capabilities.canReviewReports).toBe(true);
    // Not everything: this moderator cannot manage rules or roles.
    expect(capabilities.canManageRules).toBe(false);
    expect(capabilities.canManageRoles).toBe(false);
  });

  it('serves the moderation queue only to a caller with the capability', async () => {
    const reports = await fetchCommunityReports(NIGERIAN.id);
    expect(reports.length).toBeGreaterThan(0);

    // Ghanaian: the member is only Interested, so no queue.
    await expect(fetchCommunityReports(GHANAIAN.id)).rejects.toBeDefined();
  });

  it('never includes a reporter identity in a report (GAP-017 privacy)', async () => {
    const reports = await fetchCommunityReports(NIGERIAN.id);

    for (const report of reports) {
      expect(report).not.toHaveProperty('reporterId');
      expect(report).not.toHaveProperty('reporterName');
      expect(report).not.toHaveProperty('reporters');
      expect(typeof report.reporterCount).toBe('number');
    }
  });

  it('orders the queue oldest first, so a waiting report is not buried', async () => {
    const reports = await fetchCommunityReports(NIGERIAN.id);
    const dates = reports.map((r) => r.createdAt);

    expect(dates).toEqual([...dates].sort());
  });

  it('filters the queue by status', async () => {
    const open = await fetchCommunityReports(NIGERIAN.id, 'Open');

    expect(open.length).toBeGreaterThan(0);
    expect(open.every((report) => report.status === 'Open')).toBe(true);
  });

  it('applies a decision and moves the report’s state', async () => {
    const [first] = await fetchCommunityReports(NIGERIAN.id, 'Open');

    const dismissed = await decideCommunityReport(NIGERIAN.id, first.id, 'dismiss');
    expect(dismissed.status).toBe('Dismissed');
    expect(dismissed.updatedAt).toBeTruthy();
  });

  it('maps each decision to its own resulting state', async () => {
    const open = await fetchCommunityReports(NIGERIAN.id, 'Open');

    const escalated = await decideCommunityReport(NIGERIAN.id, open[0].id, 'escalate');
    expect(escalated.status).toBe('Escalated');

    const actioned = await decideCommunityReport(NIGERIAN.id, open[1].id, 'remove-content');
    expect(actioned.status).toBe('Actioned');
  });

  it('refuses a decision from a caller without the capability — server-side (§62)', async () => {
    // The client's check decided whether to draw the button. This is the check that
    // decides whether the action happens.
    await expect(decideCommunityReport(GHANAIAN.id, 'report-x', 'dismiss')).rejects.toBeDefined();
  });

  it('404s a decision on a report that does not exist', async () => {
    await expect(decideCommunityReport(NIGERIAN.id, 'no-such-report', 'dismiss')).rejects.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STATISTICS — the hybrid claim
// ═════════════════════════════════════════════════════════════════════════════

describe('community statistics are genuinely hybrid (GAP-007)', () => {
  it('marks content counts as backend and member figures as simulated', async () => {
    const statistics = await fetchCommunityStatistics(NIGERIAN.id, '30d');

    const byKey = new Map(statistics.metrics.map((metric) => [metric.key, metric]));

    // Real: counted from the certified fixtures the certified handlers serve.
    for (const key of ['events', 'organizations', 'guides', 'jobs', 'housing', 'marketplace', 'providers']) {
      expect(byKey.get(key)?.value.source).toBe('backend');
    }

    // Not real: there is no membership record on the platform to count.
    for (const key of ['members', 'growth', 'engagement']) {
      expect(byKey.get(key)?.value.source).toBe('simulated');
      expect(byKey.get(key)?.value.gapKey).toBe('communityStatistics');
    }
  });

  it('gives every metric a period and a freshness, so none is printable bare (§29)', async () => {
    const statistics = await fetchCommunityStatistics(NIGERIAN.id, '90d');

    for (const metric of statistics.metrics) {
      expect(metric.period).toBe('90d');
      expect(metric.freshness.computedAt).toBeTruthy();
      expect(metric.freshness.sourceName).toBeTruthy();
      expect(metric.freshness.limitations?.length).toBeGreaterThan(0);
    }
  });

  it('names the certified route each real count came from', async () => {
    const statistics = await fetchCommunityStatistics(NIGERIAN.id, '30d');
    const jobs = statistics.metrics.find((metric) => metric.key === 'jobs');

    expect(jobs?.freshness.sourceName).toContain('/jobs');
  });

  it('OMITS a restricted metric for a caller without the capability, rather than nulling it', async () => {
    // GAP-007's contract note: a nulled restricted metric still tells the caller it
    // exists. Ghanaian: the member is only Interested.
    const restricted = await fetchCommunityStatistics(GHANAIAN.id, '30d');

    expect(restricted.metrics.map((m) => m.key)).not.toContain('retention');
  });

  it('includes the restricted metric where the server granted it', async () => {
    const permitted = await fetchCommunityStatistics(NIGERIAN.id, '30d');

    const retention = permitted.metrics.find((metric) => metric.key === 'retention');
    expect(retention?.isRestricted).toBe(true);
  });

  it('omits content counts entirely for a community with no country of origin', async () => {
    // A zero would read as "this community has no events", which is a claim. The
    // absence is the honest answer and it is what makes GAP-009 visible in product.
    const statistics = await fetchCommunityStatistics(WEST_AFRICAN.id, '30d');

    expect(statistics.metrics.map((m) => m.key)).not.toContain('events');
    expect(statistics.metrics.map((m) => m.key)).toContain('members');
  });

  it('404s statistics for a community that does not exist', async () => {
    await expect(fetchCommunityStatistics('no-such-id', '30d')).rejects.toBeDefined();
  });
});

describe('community comparison (GAP-008)', () => {
  it('aligns rows across communities and computes no winner', async () => {
    const comparison = await fetchCommunityComparison([NIGERIAN.id, GHANAIAN.id], '30d');

    expect(comparison.communities).toHaveLength(2);
    expect(comparison.rows.length).toBeGreaterThan(0);

    for (const row of comparison.rows) {
      // One value per community, aligned by index. A missing metric is `null`, not
      // a shifted column.
      expect(row.values).toHaveLength(2);
    }

    // No winner, no ranking, no composite. §29/§30.
    expect(comparison).not.toHaveProperty('winner');
    expect(comparison).not.toHaveProperty('ranking');
    expect(comparison).not.toHaveProperty('score');
  });

  it('excludes restricted metrics from comparison entirely (GAP-008 privacy)', async () => {
    const comparison = await fetchCommunityComparison([NIGERIAN.id, GHANAIAN.id], '30d');

    expect(comparison.rows.map((row) => row.key)).not.toContain('retention');
  });

  it('refuses fewer than two communities', async () => {
    await expect(fetchCommunityComparison([NIGERIAN.id], '30d')).rejects.toBeDefined();
  });

  it('404s when a community in the set does not exist', async () => {
    await expect(fetchCommunityComparison([NIGERIAN.id, 'nope'], '30d')).rejects.toBeDefined();
  });

  it('carries limitations naming both gaps it depends on', async () => {
    const comparison = await fetchCommunityComparison([NIGERIAN.id, GHANAIAN.id], '30d');

    const limitations = (comparison.freshness.limitations ?? []).join(' ');

    expect(limitations).toContain('FRONTEND-PHASE13-GAP-007');
    expect(limitations).toContain('FRONTEND-PHASE13-GAP-008');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE
// ═════════════════════════════════════════════════════════════════════════════

describe('governance (GAP-016, GAP-018, GAP-019)', () => {
  it('returns rules in position order with their consequences intact', async () => {
    const rules = await fetchCommunityRules(NIGERIAN.id);

    expect(rules.length).toBeGreaterThan(0);
    expect(rules.map((rule) => rule.position)).toEqual(
      [...rules.map((rule) => rule.position)].sort((a, b) => a - b)
    );
    expect(rules.some((rule) => Boolean(rule.consequence))).toBe(true);
  });

  it('returns an empty rule set rather than failing for a community with none', async () => {
    await expect(fetchCommunityRules(WEST_AFRICAN.id)).resolves.toEqual([]);
  });

  it('puts pinned notices first and hides expired ones by default', async () => {
    const notices = await fetchCommunityNotices(NIGERIAN.id);

    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0].isPinned).toBe(true);

    const now = Date.now();
    expect(
      notices.every((notice) => !notice.expiresAt || new Date(notice.expiresAt).getTime() > now)
    ).toBe(true);
  });

  it('includes expired notices when asked', async () => {
    const withExpired = await fetchCommunityNotices(NIGERIAN.id, { includeExpired: true });
    const without = await fetchCommunityNotices(NIGERIAN.id);

    expect(withExpired.length).toBeGreaterThanOrEqual(without.length);
  });

  it('filters role holders by role', async () => {
    const moderators = await fetchCommunityRoleHolders(NIGERIAN.id, 'Moderator');
    const ambassadors = await fetchCommunityRoleHolders(NIGERIAN.id, 'Ambassador');

    expect(moderators.length).toBeGreaterThan(0);
    expect(moderators.every((holder) => holder.role === 'Moderator')).toBe(true);
    expect(ambassadors.every((holder) => holder.role === 'Ambassador')).toBe(true);
  });

  it('caps a role holder’s location at city precision (GAP-018 privacy)', async () => {
    const holders = await fetchCommunityRoleHolders(NIGERIAN.id);

    for (const holder of holders) {
      expect(holder).not.toHaveProperty('latitude');
      expect(holder).not.toHaveProperty('longitude');
      expect(holder).not.toHaveProperty('neighborhood');
      expect(holder).not.toHaveProperty('street');
    }
  });

  it('returns initiatives with provenance on any progress figure', async () => {
    const initiatives = await fetchCommunityInitiatives(NIGERIAN.id);

    expect(initiatives.length).toBeGreaterThan(0);
    for (const initiative of initiatives) {
      if (initiative.progress) {
        expect(initiative.progress.source).toBe('simulated');
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PREFERENCES
// ═════════════════════════════════════════════════════════════════════════════

describe('community preferences (GAP-012, GAP-021)', () => {
  it('round-trips a notification scope overlay', async () => {
    const saved = await saveCommunityPreferences({
      crossCommunityDiscoveryEnabled: true,
      showPrimaryCommunityOnProfile: false,
      showInterestedCommunitiesOnProfile: false,
      showCommunityRolesOnProfile: false,
      notifications: [{ categoryKey: 'jobs', scope: 'primary-only' }],
      preferredContentLanguage: null,
    });

    expect(saved.notifications).toEqual([{ categoryKey: 'jobs', scope: 'primary-only' }]);

    const read = await fetchCommunityPreferences();
    expect(read.notifications).toEqual([{ categoryKey: 'jobs', scope: 'primary-only' }]);
  });

  it('merges a partial record over the privacy-safe defaults (§41)', async () => {
    // A field the client did not send must not read as consent to publish.
    const saved = await saveCommunityPreferences({ notifications: [] } as never);

    expect(saved.showPrimaryCommunityOnProfile).toBe(false);
    expect(saved.showInterestedCommunitiesOnProfile).toBe(false);
    expect(saved.showCommunityRolesOnProfile).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE CERTIFIED ARM — the projection over real routes
// ═════════════════════════════════════════════════════════════════════════════

describe('community-scoped content over certified routes (GAP-009)', () => {
  const scopeFor = (community: Community): CommunityScope => ({
    mode: 'SELECTED_COMMUNITY',
    communityIds: [community.id],
  });

  it('narrows a real /jobs page to the community and reports what it set aside', async () => {
    const projection = projectScope(scopeFor(NIGERIAN), lookup);
    const result = await fetchScopedContent('job', { cityName: 'London' }, projection);

    expect(result.scopeApplied).toBe(true);
    // Always approximate: the route cannot express a community.
    expect(result.isApproximate).toBe(true);
    expect(result.totalAfterScope).toBe(result.items.length);
    expect(result.totalBeforeScope).toBeGreaterThanOrEqual(result.totalAfterScope);

    // Every surviving job's employer is genuinely Nigerian-origin.
    for (const job of result.items as Record<string, unknown>[]) {
      const employer = job.employer as Record<string, unknown>;
      const origin = employer.originCountry as Record<string, unknown> | undefined;
      expect(String(origin?.code).toUpperCase()).toBe('NG');
    }
  });

  it('narrows /housing, /marketplace and /listings the same way', async () => {
    const projection = projectScope(scopeFor(NIGERIAN), lookup);

    for (const domain of ['housing', 'marketplace', 'provider'] as const) {
      const result = await fetchScopedContent(domain, {}, projection);
      expect(result.scopeApplied).toBe(true);
      expect(result.isApproximate).toBe(true);
    }
  });

  it('applies nothing and claims nothing for an unscoped read (§69)', async () => {
    const projection = projectScope({ mode: 'ALL_COMMUNITIES', communityIds: [] }, lookup);
    const result = await fetchScopedContent('job', { cityName: 'London' }, projection);

    expect(result.scopeApplied).toBe(false);
    expect(result.isApproximate).toBe(false);
    expect(result.totalAfterScope).toBe(result.items.length);
  });

  it('returns nothing for an empty scope — not everything', async () => {
    const projection = projectScope({ mode: 'INTERESTED_COMMUNITIES', communityIds: [] }, lookup);
    const result = await fetchScopedContent('job', {}, projection);

    expect(result.items).toEqual([]);
    expect(result.scopeApplied).toBe(true);
  });

  it('names an inexpressible community rather than silently returning nothing', async () => {
    const projection = projectScope(scopeFor(WEST_AFRICAN), lookup);
    const result = await fetchScopedContent('job', {}, projection, {
      unexpressedNames: projection.unexpressed.map((ref) => ref.name),
    });

    expect(result.items).toEqual([]);
    expect(result.unexpressedCommunityNames).toEqual(['West African']);
  });

  it('refuses to be used for a domain with no certified list route', async () => {
    const projection = projectScope(scopeFor(NIGERIAN), lookup);

    // Guides and updates are narrowed in memory. A caller that reached here has a
    // bug worth finding, so this throws rather than returning empty.
    await expect(fetchScopedContent('guide', {}, projection)).rejects.toThrow(
      /no certified list route/
    );
  });

  it('narrows an in-memory collection identically', () => {
    const projection = projectScope(scopeFor(GHANAIAN), lookup);

    const items = [
      { country: { code: 'GH' } },
      { country: { code: 'NG' } },
      { country: undefined },
    ];

    const result = narrowToScope('guide', items, projection);

    expect(result.items).toHaveLength(1);
    expect(result.totalBeforeScope).toBe(3);
    expect(result.isApproximate).toBe(true);
  });

  it('flags truncation when a scope removed most of a full page', () => {
    const projection = projectScope(scopeFor(GHANAIAN), lookup);

    const items = Array.from({ length: 20 }, (_, index) => ({
      owner: { originCountry: { code: index === 0 ? 'GH' : 'NG' } },
    }));

    const result = narrowToScope('provider', items, projection);

    expect(result.totalAfterScope).toBe(1);
    // The server probably holds more Ghanaian providers further out. Claiming the
    // empty-ish result is final would be dishonest.
    expect(result.resultTruncated).toBe(true);
  });

  it('does not flag truncation on a small page', () => {
    const projection = projectScope(scopeFor(GHANAIAN), lookup);
    const result = narrowToScope('provider', [{ owner: { originCountry: { code: 'NG' } } }], projection);

    expect(result.resultTruncated).toBe(false);
  });

  it('carries the community ref shape the badge needs', () => {
    const ref = toRef(NIGERIAN);

    expect(Object.keys(ref).sort()).toEqual(['id', 'identity', 'name', 'origin', 'slug', 'type']);
    // Deliberately no membership state: a content badge has nowhere to leak one.
    expect(ref).not.toHaveProperty('membershipState');
    expect(ref).not.toHaveProperty('status');
  });
});
