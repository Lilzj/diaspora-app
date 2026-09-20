// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-Community development adapter (Frontend Phase 13)
//
// ⚠ DEVELOPMENT ONLY. Registers nothing in a release build. ⚠
//
// Serves `/community-directory/v0/*` — the routes `community-gap-directory-api.ts`
// calls. Deliberately **not** `/communities`, which Phase 12 already uses for
// organization membership programmes under `/community-gap/v0`.
//
// ── The one thing in here that is not simulated ──────────────────────────────
//
// The statistics handler is genuinely hybrid, and it matters that it is.
//
// A community's *content* counts are derivable from what the certified routes
// already return: the events, organizations, jobs, housing, marketplace listings
// and provider listings whose publisher's `originCountry` matches the community's
// country of origin. So this handler counts the **real** fixtures the certified
// handlers serve and marks those metrics `backend`. Only the metrics with nothing
// behind them — member count, growth, engagement — are marked `simulated`.
//
// That is not a nicety. §29 forbids inventing authoritative metrics, and the
// alternative was either to invent nine numbers or to show none. Marking each
// metric with where it came from means a reviewer opening a community profile can
// see at a glance which figures a real backend would already be able to serve —
// which is exactly the information GAP-007 needs in order to be prioritised.
//
// ── Route order ──────────────────────────────────────────────────────────────
//
// `axios-mock-adapter` matches in registration order, so the specific patterns go
// first. `/communities/memberships/me`, `/communities/suggestions` and
// `/communities/compare` must all be registered before `/communities/{idOrSlug}`,
// or the last one swallows them and a member's membership set comes back as a
// community called "memberships".
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import {
  COMMUNITY_DIRECTORY_GAP_PREFIX,
  areMultiCommunityGapsEnabled,
} from '@/config/multi-community-gaps';
import {
  MOCK_COMMUNITIES,
  MOCK_COMMUNITY_BY_ID,
  MOCK_COMMUNITY_BY_SLUG,
  MOCK_INITIATIVES,
  MOCK_MEMBERSHIPS,
  MOCK_NOTICES,
  MOCK_REPORTS,
  MOCK_ROLE_HOLDERS,
  MOCK_RULES,
  getPerformanceCommunitySet,
  noCapabilities,
} from '../community-directory-data';
import { mockJobs } from '../jobs-data';
import { mockHousingListings } from '../housing-data';
import { mockMarketplaceListings } from '../marketplace-data';
import { mockListings } from '../data';
import { mockEvents, mockOrganizations } from '../community-life-data';
import { mockGuides } from '../community-data';
import type {
  Community,
  CommunityCapabilities,
  CommunityComparison,
  CommunityDirectoryEntry,
  CommunityMembership,
  CommunityMembershipState,
  CommunityMetric,
  CommunityPreferences,
  CommunityReport,
  CommunityStatistics,
  DataFreshness,
  StatisticsPeriod,
} from '@/types/community-directory';
import { defaultCommunityPreferences } from '@/types/community-directory';

const ROOT = COMMUNITY_DIRECTORY_GAP_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown, meta?: Record<string, unknown>): MockReply {
  return [200, meta ? { data, meta } : { data }];
}

function problem(status: number, errorCode: string, detail: string): MockReply {
  return [
    status,
    {
      type: `https://docs.diaspora.app/errors/${errorCode}`,
      title: 'Request refused',
      status,
      detail,
      // `code`, as PlatformProblem writes it. These mocks sent `errorCode`,
      // which matched the client's old lookup and nothing the platform ever sent —
      // so mocked runs agreed with the defect instead of exposing it.
      code: errorCode,
    },
  ];
}

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The last path segment, decoded. */
function lastSegment(url: string, offsetFromEnd = 0): string {
  const parts = url.split('?')[0].split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1 - offsetFromEnd] ?? '');
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTABLE SESSION STATE
//
// Membership transitions have to stick within a session, or a member who joins a
// community sees the Join button again on the next screen and the whole §33 flow
// is untestable. Reset on reload, like every other development adapter here.
// ═════════════════════════════════════════════════════════════════════════════

let memberships: CommunityMembership[] = [];
let primaryCommunityId: string | null = null;
let preferences: CommunityPreferences = defaultCommunityPreferences();
let reports: Record<string, CommunityReport[]> = {};

/**
 * Restores the session to its initial state.
 *
 * Called by `setupCommunityDirectoryMocks`, so one call to setup is one adapter
 * session. That matters in two places:
 *
 *   * **A reload starts clean.** A member who joined a community in a previous
 *     Metro session should not find themselves already joined after a refresh,
 *     because the *server* has no record of it.
 *   * **Tests are order-independent.** Without this, a test that leaves the
 *     Nigerian community strips its capabilities for every test that runs after
 *     it, and the suite starts depending on declaration order — which is the kind
 *     of failure that gets "fixed" by reordering tests rather than by finding the
 *     bug.
 *
 * Deep-copied, because the transitions below mutate the membership records in
 * place and a shallow copy would edit the fixture itself.
 */
function resetSession(): void {
  memberships = MOCK_MEMBERSHIPS.map((membership) => ({
    ...membership,
    roles: [...membership.roles],
    capabilities: { ...membership.capabilities, roles: [...membership.capabilities.roles] },
  }));

  primaryCommunityId = MOCK_MEMBERSHIPS.find((m) => m.isPrimary)?.communityId ?? null;

  preferences = {
    ...defaultCommunityPreferences(),
    // The development member has opened the screen and allowed one disclosure, so
    // the "on" rendering is reachable without editing data. Everything else stays
    // off, which is the default §41 requires.
    showPrimaryCommunityOnProfile: true,
  };

  reports = Object.fromEntries(
    Object.entries(MOCK_REPORTS).map(([id, list]) => [id, list.map((report) => ({ ...report }))])
  );
}

function membershipFor(communityId: string): CommunityMembership | undefined {
  return memberships.find((m) => m.communityId === communityId);
}

function membershipStateFor(communityId: string): CommunityMembershipState {
  return membershipFor(communityId)?.state ?? 'None';
}

/**
 * The community set a caller may see.
 *
 * `Private` communities are excluded unless the caller has a membership in them —
 * GAP-001's privacy note requires the directory not to reveal that a private
 * community exists. `Unlisted` is excluded from browse but resolvable by id or
 * slug, which is what "unlisted" means.
 */
function visibleCommunities(includePerformanceSet: boolean): Community[] {
  const curated = MOCK_COMMUNITIES.filter((community) => {
    if (community.visibility === 'Private') {
      // Belonging, and only belonging. A role is not a state (they are separate
      // axes in the domain model), and an expressed interest is not access.
      const state = membershipStateFor(community.id);
      return state === 'Member' || state === 'VerifiedMember';
    }
    return community.visibility !== 'Unlisted';
  });

  return includePerformanceSet ? [...curated, ...getPerformanceCommunitySet()] : curated;
}

function toEntry(community: Community, reason?: string): CommunityDirectoryEntry {
  return {
    community,
    membershipState: membershipStateFor(community.id),
    isPrimary: primaryCommunityId === community.id,
    reason: reason ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STATISTICS — the hybrid part
// ═════════════════════════════════════════════════════════════════════════════

function backed(value: number) {
  return { value, source: 'backend' as const };
}

function simulated(value: number) {
  return { value, source: 'simulated' as const, gapKey: 'communityStatistics' };
}

/**
 * Freshness for a metric counted from the certified fixtures.
 *
 * `sourceName` names the routes, so a reviewer can check the number. The
 * limitations are rendered verbatim by `<FreshnessNote>` and say the one thing
 * that matters: the count is of content whose publisher shares the community's
 * country of origin, which is a projection rather than a declared association.
 */
function derivedFreshness(routes: string): DataFreshness {
  return {
    computedAt: nowIso(),
    sourceName: `Counted from ${routes}`,
    methodology:
      'Content whose publisher’s country of origin matches this community’s country of origin, counted at request time.',
    limitations: [
      'This counts content by the publisher’s country of origin, not by a declared community association — no backend contract records one yet (FRONTEND-PHASE13-GAP-009).',
      'Content published by members of a community with no country of origin is not counted at all.',
    ],
  };
}

function simulatedFreshness(what: string): DataFreshness {
  return {
    computedAt: nowIso(),
    sourceName: 'Diaspora development adapter',
    methodology: `${what} has no backend contract. This figure is generated for development and is not a measurement.`,
    limitations: [
      'Not a real figure. Generated so the layout, the accessibility text and the provenance markers can be reviewed.',
    ],
  };
}

/** The publisher's origin country for each fixture family. */
function originOf(item: unknown, key: 'owner' | 'employer' | 'host' | 'seller'): string | null {
  const record = item as Record<string, unknown> | null;
  const publisher = record?.[key] as Record<string, unknown> | undefined;
  const origin = publisher?.originCountry as Record<string, unknown> | undefined;
  const code = origin?.code;
  return typeof code === 'string' ? code.toUpperCase() : null;
}

function countryOf(item: unknown, path: 'country' | 'location'): string | null {
  const record = item as Record<string, unknown> | null;
  const nested = record?.[path] as Record<string, unknown> | undefined;
  const code = (path === 'country' ? nested?.code : nested?.countryCode) ?? null;
  return typeof code === 'string' ? code.toUpperCase() : null;
}

/**
 * Counts the certified fixtures that project onto this community.
 *
 * Returns `null` for a community with no country of origin, because there is
 * nothing to project onto — and a zero would read as "this community has no
 * events", which is a claim rather than an absence of data. The profile renders
 * "not available for regional communities" instead, which is the honest answer
 * and the one that makes GAP-009 visible in the product.
 */
function derivedCounts(community: Community): {
  events: number;
  organizations: number;
  jobs: number;
  housing: number;
  marketplace: number;
  providers: number;
  guides: number;
} | null {
  const code = community.origin.countryCode?.toUpperCase();
  if (!code) return null;

  return {
    // Events and organizations carry a location country rather than a publisher
    // origin, which is a weaker basis — recorded in the limitations above.
    events: mockEvents.filter((e) => countryOf(e, 'location') === code).length,
    organizations: mockOrganizations.filter((o) => countryOf(o, 'location') === code).length,
    jobs: mockJobs.filter((j) => originOf(j, 'employer') === code).length,
    housing: mockHousingListings.filter((h) => originOf(h, 'host') === code).length,
    marketplace: mockMarketplaceListings.filter((m) => originOf(m, 'seller') === code).length,
    providers: mockListings.filter((l) => originOf(l, 'owner') === code).length,
    guides: mockGuides.filter((g) => countryOf(g, 'country') === code).length,
  };
}

function buildStatistics(community: Community, period: StatisticsPeriod): CommunityStatistics {
  const counts = derivedCounts(community);
  const metrics: CommunityMetric[] = [];

  // ── Simulated: nothing on the platform can count a community's members ──────
  metrics.push({
    key: 'members',
    label: 'Members',
    value: community.memberCount
      ? simulated(community.memberCount.value)
      : simulated(0),
    displayValue: community.memberCount
      ? formatCount(community.memberCount.value)
      : 'Not published',
    period,
    freshness: simulatedFreshness('Member count'),
  });

  metrics.push({
    key: 'growth',
    label: 'New members',
    value: simulated(Math.max(1, Math.round((community.memberCount?.value ?? 200) * 0.014))),
    changePercent: simulated(1.4),
    period,
    freshness: simulatedFreshness('Growth'),
  });

  metrics.push({
    key: 'engagement',
    label: 'Active this month',
    value: simulated(Math.round((community.memberCount?.value ?? 200) * 0.22)),
    period,
    freshness: simulatedFreshness('Engagement'),
  });

  // ── Backend: counted from the fixtures the certified routes serve ───────────
  if (counts) {
    metrics.push(
      {
        key: 'events',
        label: 'Events',
        value: backed(counts.events),
        period,
        freshness: derivedFreshness('GET /community-life/events'),
      },
      {
        key: 'organizations',
        label: 'Organisations',
        value: backed(counts.organizations),
        period,
        freshness: derivedFreshness('GET /community-life/organizations'),
      },
      {
        key: 'guides',
        label: 'Guides',
        value: backed(counts.guides),
        period,
        freshness: derivedFreshness('the guide directory'),
      },
      {
        key: 'jobs',
        label: 'Jobs',
        value: backed(counts.jobs),
        period,
        freshness: derivedFreshness('GET /jobs'),
      },
      {
        key: 'housing',
        label: 'Housing',
        value: backed(counts.housing),
        period,
        freshness: derivedFreshness('GET /housing'),
      },
      {
        key: 'marketplace',
        label: 'Marketplace',
        value: backed(counts.marketplace),
        period,
        freshness: derivedFreshness('GET /marketplace'),
      },
      {
        key: 'providers',
        label: 'Service providers',
        value: backed(counts.providers),
        period,
        freshness: derivedFreshness('GET /listings'),
      }
    );
  }

  // A restricted metric, so the §29/§62 path is reachable. Served only to a
  // caller whose capability set allows it — see the route below.
  metrics.push({
    key: 'retention',
    label: 'Member retention',
    value: simulated(78),
    unit: '%',
    period,
    isRestricted: true,
    freshness: simulatedFreshness('Retention'),
  });

  return {
    communityId: community.id,
    period,
    metrics,
    // The set as a whole is hybrid; the honest single label is `simulated`,
    // because a caller that ignored the per-metric marks would otherwise read the
    // whole set as backend. Per-metric marks are the ones the UI renders.
    source: 'simulated',
    freshness: {
      computedAt: nowIso(),
      sourceName: 'Diaspora development adapter (hybrid)',
      methodology:
        'Content counts are real, taken from the certified routes named on each metric. Member, growth, engagement and retention figures have no backend contract and are generated.',
      limitations: [
        'Member counts, growth, engagement and retention are not measurements (FRONTEND-PHASE13-GAP-007).',
      ],
    },
  };
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

export function setupCommunityDirectoryMocks(mock: MockAdapter): void {
  // The switch is checked once, here. A release build registers nothing, so a
  // call that somehow escaped falls through to the passthrough and 404s at the
  // gateway rather than being answered with development data.
  if (!areMultiCommunityGapsEnabled()) return;

  // One setup call, one adapter session. See `resetSession`.
  resetSession();

  // ── Directory ──────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/communities/suggestions$`)).reply((config) => {
    const presence = config.params?.presenceCountryCode
      ? String(config.params.presenceCountryCode).toUpperCase()
      : null;

    // §55: the reason is *given*, not implied by ranking, and the only input is
    // the residence country the member already supplied. Nothing is inferred from
    // nationality, language or contacts — there is no parameter for them.
    const pool = visibleCommunities(false).filter((c) => c.status === 'Active');

    const suggestions = pool
      .map((community) => {
        const hasPresence = presence
          ? (community.presenceCountryCodes ?? []).includes(presence)
          : false;

        return toEntry(
          community,
          hasPresence
            ? `Members of this community live in your country of residence`
            : `A large community on Diaspora`
        );
      })
      // Presence first, then the curated order. A documented client ordering, not
      // a relevance score — §25 forbids the frontend ranking anything.
      .sort((a, b) => Number(Boolean(b.reason?.startsWith('Members'))) - Number(Boolean(a.reason?.startsWith('Members'))))
      .slice(0, 8);

    return ok(suggestions);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/compare$`)).reply((config) => {
    const ids = String(config.params?.ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const period = (config.params?.period as StatisticsPeriod) ?? '30d';

    if (ids.length < 2) {
      return problem(400, 'community.compare.too_few', 'Comparison needs at least two communities.');
    }

    const communities = ids
      .map((id) => MOCK_COMMUNITY_BY_ID.get(id))
      .filter((c): c is Community => Boolean(c));

    if (communities.length < 2) {
      return problem(404, 'community.not_found', 'One or more communities could not be found.');
    }

    const statsByCommunity = communities.map((community) => buildStatistics(community, period));

    // Every metric key present on any community, so a community missing a metric
    // renders as unavailable rather than shifting the row alignment.
    const keys: string[] = [];
    for (const stats of statsByCommunity) {
      for (const metric of stats.metrics) {
        // Restricted metrics are omitted from comparison entirely — GAP-008's
        // privacy note: three communities side by side make a suppressed cell
        // obvious by subtraction.
        if (metric.isRestricted) continue;
        if (!keys.includes(metric.key)) keys.push(metric.key);
      }
    }

    const comparison: CommunityComparison = {
      period,
      communities: communities.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        type: c.type,
        origin: c.origin,
        identity: c.identity,
      })),
      rows: keys.map((key) => {
        const label =
          statsByCommunity.flatMap((s) => s.metrics).find((m) => m.key === key)?.label ?? key;

        return {
          key,
          label,
          values: statsByCommunity.map(
            (stats) => stats.metrics.find((m) => m.key === key)?.value ?? null
          ),
          unit: statsByCommunity.flatMap((s) => s.metrics).find((m) => m.key === key)?.unit ?? null,
        };
      }),
      source: 'simulated',
      freshness: {
        computedAt: nowIso(),
        sourceName: 'Diaspora development adapter (hybrid)',
        methodology:
          'Each community’s metrics are those from its own statistics response. No winner, ranking or composite score is computed — there is no contract that would make one comparable.',
        limitations: [
          'Content counts are real; member, growth and engagement figures are not (FRONTEND-PHASE13-GAP-007).',
          'Metrics are aligned by key, which assumes the key means the same thing for every community (FRONTEND-PHASE13-GAP-008).',
        ],
      },
    };

    return ok(comparison);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/memberships/me$`)).reply(() =>
    ok({
      memberships,
      primaryCommunityId,
      fetchedAt: nowIso(),
    })
  );

  mock.onGet(new RegExp(`${ROOT}/communities/preferences/me$`)).reply(() => ok(preferences));

  mock.onPut(new RegExp(`${ROOT}/communities/preferences/me$`)).reply((config) => {
    const next = body<CommunityPreferences>(config);
    preferences = { ...defaultCommunityPreferences(), ...next };
    return ok(preferences);
  });

  // ── The directory list. Registered before `/communities/{idOrSlug}`. ────────

  mock.onGet(new RegExp(`${ROOT}/communities$`)).reply((config) => {
    const params = config.params ?? {};
    const query = params.query ? String(params.query).toLowerCase().trim() : '';
    const types = params.types ? String(params.types).split(',').filter(Boolean) : [];
    const originCodes = params.originCountryCodes
      ? String(params.originCountryCodes).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
      : [];
    const presence = params.presenceCountryCode
      ? String(params.presenceCountryCode).toUpperCase()
      : '';
    const includeJoined = params.includeJoined !== false && params.includeJoined !== 'false';
    const sort = params.sort ? String(params.sort) : 'relevance';
    const limit = params.limit ? Math.min(Number(params.limit), 250) : 20;
    const start = params.cursor ? Number(params.cursor) : 0;

    // The performance set is opt-in, via a large `limit`. §77's 1,000+ case is
    // reachable without the curated set being swamped in everyday use.
    let pool = visibleCommunities(limit > 100);

    if (query) {
      pool = pool.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.tagline ?? '').toLowerCase().includes(query) ||
          (c.origin.countryName ?? '').toLowerCase().includes(query) ||
          (c.origin.regionName ?? '').toLowerCase().includes(query)
      );
    }

    if (types.length > 0) pool = pool.filter((c) => types.includes(c.type));

    if (originCodes.length > 0) {
      pool = pool.filter((c) => {
        const code = c.origin.countryCode?.toUpperCase();
        return Boolean(code) && originCodes.includes(code!);
      });
    }

    if (presence) {
      pool = pool.filter((c) => (c.presenceCountryCodes ?? []).includes(presence));
    }

    if (!includeJoined) {
      pool = pool.filter((c) => {
        const state = membershipStateFor(c.id);
        return state !== 'Member' && state !== 'VerifiedMember';
      });
    }

    // `members` sorting is deliberately **refused**, not silently downgraded.
    // GAP-001: §31 forbids implying popularity the backend does not report, and
    // this adapter reports every member count as simulated.
    if (sort === 'members') {
      return problem(
        422,
        'community.sort.unsupported',
        'Sorting by member count is not available: no authoritative member counts are published (FRONTEND-PHASE13-GAP-001).'
      );
    }

    const sorted =
      sort === 'name'
        ? [...pool].sort((a, b) => a.name.localeCompare(b.name))
        : sort === 'recent'
          ? [...pool].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          : pool;

    const slice = sorted.slice(start, start + limit);
    const nextIndex = start + limit;

    return ok({
      items: slice.map((community) => toEntry(community)),
      nextCursor: nextIndex < sorted.length ? String(nextIndex) : null,
      hasMore: nextIndex < sorted.length,
      totalCount: sorted.length,
      source: 'simulated',
    });
  });

  // ── Per-community sub-resources. All before `/communities/{idOrSlug}`. ──────

  mock
    .onGet(new RegExp(`${ROOT}/communities/[^/]+/capabilities$`))
    .reply((config) => {
      const communityId = lastSegment(config.url ?? '', 1);
      const membership = membershipFor(communityId);

      // §62: a capability set the server did not report is every field false. A
      // non-member gets an all-false set rather than a 403, so the UI renders
      // nothing rather than an error — GAP-006's contract note.
      return ok(membership?.capabilities ?? noCapabilities(communityId));
    });

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/statistics$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const community = MOCK_COMMUNITY_BY_ID.get(communityId);
    if (!community) return problem(404, 'community.not_found', 'No such community.');

    const period = (config.params?.period as StatisticsPeriod) ?? '30d';
    const statistics = buildStatistics(community, period);
    const canSeeRestricted = membershipFor(communityId)?.capabilities.canViewPrivateStatistics === true;

    return ok({
      ...statistics,
      // Restricted metrics are **omitted**, not nulled. GAP-007's contract note:
      // a nulled restricted metric still tells the caller it exists.
      metrics: statistics.metrics.filter((metric) => !metric.isRestricted || canSeeRestricted),
    });
  });

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/rules$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    return ok(MOCK_RULES[communityId] ?? []);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/notices$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const includeExpired =
      config.params?.includeExpired === true || config.params?.includeExpired === 'true';
    const all = MOCK_NOTICES[communityId] ?? [];
    const now = Date.now();

    const filtered = includeExpired
      ? all
      : all.filter((n) => !n.expiresAt || new Date(n.expiresAt).getTime() > now);

    return ok(
      [...filtered].sort(
        (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) || b.publishedAt.localeCompare(a.publishedAt)
      )
    );
  });

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/roles$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const role = config.params?.role ? String(config.params.role) : null;
    const holders = MOCK_ROLE_HOLDERS[communityId] ?? [];

    return ok(role ? holders.filter((h) => h.role === role) : holders);
  });

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/initiatives$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    return ok(MOCK_INITIATIVES[communityId] ?? []);
  });

  // ── Moderation. Capability-gated server-side, as the real contract must be. ──

  mock
    .onPost(new RegExp(`${ROOT}/communities/[^/]+/reports/[^/]+/decision$`))
    .reply((config) => {
      const url = config.url ?? '';
      const reportId = lastSegment(url, 1);
      const communityId = url.split('/communities/')[1]?.split('/')[0] ?? '';
      const { decision, note } = body<{ decision: string; note?: string }>(config);

      // The client's capability check decided whether to draw the button. This is
      // the check that decides whether the action happens — §62, and the reason
      // the adapter enforces it rather than trusting the caller.
      if (membershipFor(communityId)?.capabilities.canReviewReports !== true) {
        return problem(
          403,
          'community.moderation.forbidden',
          'You do not have permission to decide reports in this community.'
        );
      }

      const queue = reports[communityId] ?? [];
      const report = queue.find((r) => r.id === reportId);
      if (!report) return problem(404, 'community.report.not_found', 'No such report.');

      report.status =
        decision === 'dismiss'
          ? 'Dismissed'
          : decision === 'escalate'
            ? 'Escalated'
            : 'Actioned';
      report.updatedAt = nowIso();
      if (note) report.note = note;

      return ok(report);
    });

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+/reports$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);

    if (membershipFor(communityId)?.capabilities.canViewModerationQueue !== true) {
      return problem(
        403,
        'community.moderation.forbidden',
        'You do not have permission to view this community’s moderation queue.'
      );
    }

    const status = config.params?.status ? String(config.params.status) : null;
    const queue = reports[communityId] ?? [];

    const filtered = status ? queue.filter((r) => r.status === status) : queue;

    // Oldest first, so the report that has waited longest is not buried.
    return ok([...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  });

  // ── Membership transitions ─────────────────────────────────────────────────

  mock
    .onPut(new RegExp(`${ROOT}/communities/[^/]+/membership/visibility$`))
    .reply((config) => {
      const url = config.url ?? '';
      const communityId = url.split('/communities/')[1]?.split('/')[0] ?? '';
      const { visibility } = body<{ visibility: CommunityMembership['visibility'] }>(config);
      const membership = membershipFor(communityId);

      if (!membership) return problem(404, 'community.membership.not_found', 'No membership here.');

      membership.visibility = visibility;
      return ok(membership);
    });

  mock.onPost(new RegExp(`${ROOT}/communities/[^/]+/membership$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const community = MOCK_COMMUNITY_BY_ID.get(communityId);
    const { action } = body<{ action: string }>(config);

    if (!community) return problem(404, 'community.not_found', 'No such community.');

    // §75. A suspended or archived community refuses every transition, and says
    // why rather than returning a generic 403.
    if (community.status === 'Suspended' || community.status === 'Archived') {
      return problem(
        409,
        'community.unavailable',
        community.statusReason ?? 'This community is not currently open to changes.'
      );
    }

    if (action === 'join' && community.status !== 'Active') {
      return problem(
        409,
        'community.not_joinable',
        community.statusReason ?? 'This community is not open for joining yet.'
      );
    }

    const existing = membershipFor(communityId);

    // §74. A revoked membership offers nothing, and the server is the thing that
    // enforces that — the client merely does not draw the button.
    if (existing?.state === 'Revoked') {
      return problem(
        403,
        'community.membership.revoked',
        existing.stateReason ?? 'This community ended your membership.'
      );
    }

    // Tamil requires approval in the development data, so the pending path is
    // reachable. A real contract carries this per community.
    const requiresApproval = communityId.endsWith('tamil');

    const nextState: CommunityMembershipState =
      action === 'join'
        ? requiresApproval
          ? 'PendingApproval'
          : 'Member'
        : action === 'follow'
          ? 'Following'
          : action === 'express-interest'
            ? 'Interested'
            : 'None';

    const membership: CommunityMembership = existing ?? {
      communityId,
      state: 'None',
      isPrimary: false,
      roles: [],
      capabilities: noCapabilities(communityId),
      // §41: a new membership defaults to Private. The member opts in to being
      // visible rather than out.
      visibility: 'Private',
      joinedAt: null,
      verifiedAt: null,
      requiresApproval,
    };

    membership.state = nextState;
    membership.requiresApproval = requiresApproval;

    if (nextState === 'Member') {
      membership.joinedAt = nowIso();
      membership.roles = ['Member'];
      membership.capabilities = {
        ...noCapabilities(communityId),
        roles: ['Member'],
        canViewMembers: true,
        canPostToCommunity: true,
        canViewAmbassadorDirectory: true,
      };
    }

    if (!existing) memberships = [...memberships, membership];

    return ok(membership);
  });

  mock.onDelete(new RegExp(`${ROOT}/communities/[^/]+/membership$`)).reply((config) => {
    const communityId = lastSegment(config.url ?? '', 1);
    const { action } = body<{ action: string }>(config);
    const membership = membershipFor(communityId);

    if (!membership) {
      return problem(404, 'community.membership.not_found', 'No membership to remove.');
    }

    membership.state = action === 'leave' ? 'Left' : 'None';
    membership.roles = [];
    membership.capabilities = noCapabilities(communityId);

    if (action === 'leave') {
      membership.isPrimary = false;
      if (primaryCommunityId === communityId) primaryCommunityId = null;
    }

    return ok(membership);
  });

  mock.onPut(new RegExp(`${ROOT}/users/me/primary-community$`)).reply((config) => {
    const { communityId } = body<{ communityId: string | null }>(config);

    if (communityId) {
      const membership = membershipFor(communityId);
      // A real contract must state whether the primary has to be a joined
      // community. This adapter says yes, and refuses rather than silently
      // accepting — GAP-005's open question, made visible.
      if (!membership || (membership.state !== 'Member' && membership.state !== 'VerifiedMember')) {
        return problem(
          409,
          'community.primary.not_a_member',
          'A primary community must be one you have joined.'
        );
      }
    }

    primaryCommunityId = communityId;
    memberships = memberships.map((m) => ({ ...m, isPrimary: m.communityId === communityId }));

    return ok({ memberships, primaryCommunityId, fetchedAt: nowIso() });
  });

  // ── The profile read. LAST, because `{idOrSlug}` matches anything. ──────────

  mock.onGet(new RegExp(`${ROOT}/communities/[^/]+$`)).reply((config) => {
    const idOrSlug = lastSegment(config.url ?? '');
    const community =
      MOCK_COMMUNITY_BY_ID.get(idOrSlug) ??
      MOCK_COMMUNITY_BY_SLUG.get(idOrSlug) ??
      getPerformanceCommunitySet().find((c) => c.id === idOrSlug || c.slug === idOrSlug);

    if (!community) {
      return problem(404, 'community.not_found', 'We could not find that community.');
    }

    // §62 / GAP-002: a private community the caller has no membership in is a
    // 403, distinct from a 404, so the client can render the right state without
    // guessing — and without the 404 confirming it exists.
    if (community.visibility === 'Private') {
      const state = membershipStateFor(community.id);
      if (state !== 'Member' && state !== 'VerifiedMember') {
        return problem(
          403,
          'community.forbidden',
          'This community is private. Its members choose who can see it.'
        );
      }
    }

    return ok(community);
  });
}
