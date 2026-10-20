// ─────────────────────────────────────────────────────────────────────────────
// A community's figures, rules, notices, office holders, preferences and
// moderation queue, after the gap closed — 20 Oct 2026.
//
// CommunityProgramme serves these at the paths the Phase 13 adapter simulated,
// without the `/community-directory/v0` prefix (backend d07a707; the queue on
// the moderation branch, 64ddcb0, merged as 7ffb551). These pin what would regress without a screen
// changing:
//
//   1. The paths, literally. A call reaching the gap prefix 404s in production.
//   2. What the server cannot count stays uncounted: `unavailableMetrics` passes
//      through and nothing is turned into a zero or an estimate.
//   3. The queue pages by the `X-Next-Cursor` header, not by a body field.
//   4. `isSaved` is the server's to report and is never sent back.
//   5. A deleted rule answers the rules that remain, and that list is returned.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  decideCommunityReport,
  deleteCommunityRule,
  fetchCommunityComparison,
  fetchCommunityNotices,
  fetchCommunityPreferences,
  fetchCommunityReportsPage,
  fetchCommunityRoleHolders,
  fetchCommunityRules,
  fetchCommunityStatistics,
  publishCommunityNotice,
  saveCommunityPreferences,
} from '../community-entity-api';
import type { CommunityId } from '@/types/community-directory';
import { defaultCommunityPreferences } from '@/types/community-directory';

const ID = '2f1c9a30-0d5e-4c1a-9f21-5b6a7c8d9e01' as CommunityId;
const OTHER = '7a1c9a30-0d5e-4c1a-9f21-5b6a7c8d9e02' as CommunityId;

const envelope = <T,>(data: T) => ({ data });

const freshness = { computedAt: '2026-10-20T08:00:00Z', sourceName: 'Diaspora community records' };

describe('the community governance routes are the real ones', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('reads statistics without the gap prefix and keeps what was not counted', async () => {
    mock.onGet(`/communities/${ID}/statistics`).reply((config) => {
      expect(config.params).toEqual({ period: '90d' });
      return [
        200,
        envelope({
          communityId: ID,
          period: '90d',
          from: '2026-07-22T00:00:00Z',
          until: '2026-10-20T00:00:00Z',
          metrics: [
            {
              key: 'members',
              label: 'Members',
              value: { value: 41, source: 'backend' },
              displayValue: '41',
              unit: null,
              changePercent: null,
              period: '90d',
              freshness,
              isRestricted: false,
            },
          ],
          unavailableMetrics: [
            { key: 'events', label: 'Events', reason: 'Events are not filed by community.' },
          ],
          series: [
            { key: 'newMembers', label: 'New members', interval: 'day', points: [{ start: '2026-10-19T00:00:00Z', value: 2 }] },
          ],
          source: 'backend',
          freshness,
        }),
      ];
    });

    const statistics = await fetchCommunityStatistics(ID, '90d');

    expect(statistics.source).toBe('backend');
    expect(statistics.metrics).toHaveLength(1);
    expect(statistics.metrics[0].value).toEqual({ value: 41, source: 'backend' });
    // Not counted is not zero, and it is not dropped.
    expect(statistics.unavailableMetrics).toEqual([
      { key: 'events', label: 'Events', reason: 'Events are not filed by community.' },
    ]);
    expect(statistics.metrics.find((metric) => metric.key === 'events')).toBeUndefined();
    expect(statistics.series?.[0].points).toHaveLength(1);
    expect(statistics.from).toBe('2026-07-22T00:00:00Z');
  });

  it('compares through /communities/compare with sorted ids and leaves an uncounted cell null', async () => {
    mock.onGet('/communities/compare').reply((config) => {
      expect(config.params).toEqual({ ids: [ID, OTHER].sort().join(','), period: '30d' });
      return [
        200,
        envelope({
          period: '30d',
          communities: [
            { id: ID, slug: 'a', name: 'A', type: 'NationalDiaspora', origin: { countryCode: 'NG' }, identity: { logoMediaId: null } },
            { id: OTHER, slug: 'b', name: 'B', type: 'NationalDiaspora', origin: { countryCode: 'GH' }, identity: { logoMediaId: null } },
          ],
          rows: [{ key: 'members', label: 'Members', values: [{ value: 9, source: 'backend' }, null], unit: null }],
          source: 'backend',
          freshness,
        }),
      ];
    });

    const comparison = await fetchCommunityComparison([OTHER, ID], '30d');

    expect(comparison.rows[0].values).toEqual([{ value: 9, source: 'backend' }, null]);
    expect(comparison.communities.map((c) => c.slug)).toEqual(['a', 'b']);
    expect(comparison.communities[0].origin.countryName).toBeNull();
  });

  it('reads rules, notices and office holders at their real paths', async () => {
    mock.onGet(`/communities/${ID}/rules`).reply(200, envelope([{ id: 'r1', position: 1, title: 'Be kind', body: 'Always.' }]));
    mock.onGet(`/communities/${ID}/notices`).reply((config) => {
      expect(config.params).toEqual({ includeExpired: true });
      return [200, envelope([{ id: 'n1', communityId: ID, title: 'Meet-up', body: 'Saturday', publishedAt: '2026-10-19T00:00:00Z', publishedByRole: 'Moderator', isPinned: true, canEdit: true }])];
    });
    mock.onGet(`/communities/${ID}/roles`).reply((config) => {
      expect(config.params).toEqual({ role: 'Moderator' });
      return [200, envelope([{ userId: 'u1', displayName: '  ', role: 'Moderator', since: null }])];
    });

    await expect(fetchCommunityRules(ID)).resolves.toHaveLength(1);
    const notices = await fetchCommunityNotices(ID, { includeExpired: true });
    expect(notices[0].canEdit).toBe(true);

    const holders = await fetchCommunityRoleHolders(ID, 'Moderator');
    // Never an id where a name belongs, and nothing invented beside it.
    expect(holders[0].displayName).toBe('A member');
    expect(holders[0].bio).toBeUndefined();
    expect(holders[0].languages).toEqual([]);
  });

  it('answers the remaining rules when one is deleted', async () => {
    mock.onDelete(`/communities/${ID}/rules/r1`).reply(200, envelope([{ id: 'r2', position: 1, title: 'Next', body: 'Rule' }]));

    const remaining = await deleteCommunityRule(ID, 'r1');

    expect(remaining.map((rule) => rule.id)).toEqual(['r2']);
  });

  it('publishes a notice with the body the route binds', async () => {
    mock.onPost(`/communities/${ID}/notices`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ title: 'T', body: 'B', isPinned: true });
      return [200, envelope({ id: 'n2', communityId: ID, title: 'T', body: 'B', publishedAt: 'x', publishedByRole: 'Owner', isPinned: true, canEdit: true })];
    });

    await expect(publishCommunityNotice(ID, { title: 'T', body: 'B', isPinned: true })).resolves.toMatchObject({ id: 'n2' });
  });

  it('reads preferences at /communities/preferences/me and never sends isSaved back', async () => {
    mock.onGet('/communities/preferences/me').reply(200, envelope({ ...defaultCommunityPreferences(), isSaved: false }));
    mock.onPut('/communities/preferences/me').reply((config) => {
      const sent = JSON.parse(config.data);
      expect(sent).not.toHaveProperty('isSaved');
      expect(sent.defaultMembershipVisibility).toBe('CommunityOnly');
      return [200, envelope({ ...sent, isSaved: true })];
    });

    const read = await fetchCommunityPreferences();
    expect(read.isSaved).toBe(false);
    expect(read.defaultMembershipVisibility).toBe('Private');

    const saved = await saveCommunityPreferences({ ...read, defaultMembershipVisibility: 'CommunityOnly' });
    expect(saved.isSaved).toBe(true);
  });

  it('pages the moderation queue by the X-Next-Cursor header', async () => {
    mock.onGet(`/communities/${ID}/reports`).reply((config) => {
      if (!config.params?.cursor) {
        expect(config.params).toEqual({ status: 'Open', cursor: undefined, limit: 20 });
        return [200, envelope([{ id: 'rep1', status: 'Open' }]), { 'x-next-cursor': 'c2' }];
      }
      return [200, envelope([{ id: 'rep2', status: 'Open' }])];
    });

    const first = await fetchCommunityReportsPage(ID, { status: 'Open', limit: 20 });
    expect(first.items.map((r) => r.id)).toEqual(['rep1']);
    expect(first.nextCursor).toBe('c2');

    const second = await fetchCommunityReportsPage(ID, { status: 'Open', cursor: 'c2', limit: 20 });
    expect(second.items.map((r) => r.id)).toEqual(['rep2']);
    expect(second.nextCursor).toBeNull();
  });

  it('posts a decision to the real route and keeps the server sentence on refusal', async () => {
    mock.onPost(`/communities/${ID}/reports/rep1/decision`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ decision: 'escalate' });
      return [409, { code: 'community.report.already-resolved', detail: 'That report has already been decided.' }];
    });

    const error = await decideCommunityReport(ID, 'rep1', 'escalate').catch((e: unknown) => e);

    expect((error as { message: string }).message).toBe('That report has already been decided.');
  });

  it('never reaches the gap prefix', async () => {
    mock.onAny(/community-directory\/v0/).reply(() => {
      throw new Error('a real read reached the simulated prefix');
    });
    mock.onAny().reply(200, envelope([]));

    await fetchCommunityRules(ID);
    await fetchCommunityRoleHolders(ID);
    await fetchCommunityReportsPage(ID);

    expect(mock.history.get.every((request) => !String(request.url).includes('/community-directory/v0'))).toBe(true);
  });
});
