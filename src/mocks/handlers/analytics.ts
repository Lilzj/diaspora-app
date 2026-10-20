// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified backend has no
//   analytics contract of any kind — no dataset, no funnel, no cohort table, no
//   capability set, no export job and no saved report. These handlers exist so
//   the Phase 15 dashboards can be built, reviewed and tested now, and so that
//   closing each gap is a change of import rather than a redesign.
//
//   Three safeguards, none of which is a comment:
//
//     * The prefix is `/analytics-gap/v0`, never `/analytics`. A call that
//       escaped to a real deployment 404s at the gateway.
//     * `setupAnalyticsGapMocks` refuses to register in a release build.
//     * Every screen behind these routes renders `<AnalyticsGapNotice>` and
//       every figure carries `Sourced.source === 'simulated'`, so no simulated
//       number can reach a member unmarked.
//
//   ── What is different about this handler ──────────────────────────────────
//
//   It holds **no fixture data**. Phases 6, 7, 12 and 13 shipped hand-written
//   mock objects; an analytics handler cannot, because the answer depends on a
//   date range the fixture author cannot know. So every response is computed by
//   the deterministic provider in `mocks/analytics-data.ts` from the request
//   itself — same query in, same dataset out, on every render and in every test.
//   §60 is the requirement; a pure function of the request is the implementation.
//
//   The only mutable state is the export-job and saved-report store below, which
//   is stateful within a session on purpose: an export that was `ready` the
//   instant it was requested would let the polling UI ship untested.
//
//   See `src/config/analytics-gaps.ts` and
//   `frontend-phase-15-analytics-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import { ANALYTICS_GAP_PREFIX, areAnalyticsGapsEnabled } from '@/config/analytics-gaps';
import {
  buildDevAccess,
  buildDevDataset,
  buildInsights,
  buildLeaderboard,
  buildRetention,
} from '../analytics-data';
import type {
  AnalyticsComparisonBasis,
  AnalyticsDimensionKey,
  AnalyticsFilter,
  AnalyticsGranularity,
  AnalyticsMetricKey,
  AnalyticsQuery,
  AnalyticsSubject,
  AnalyticsSubjectType,
  AnalyticsTimeRange,
} from '@/types/analytics';

const ROOT = ANALYTICS_GAP_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown): MockReply {
  return [200, { data }];
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

type Params = Record<string, string | undefined>;

function params(config: { params?: unknown; url?: string }): Params {
  const raw = (config.params ?? {}) as Record<string, unknown>;
  const result: Params = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== null) result[key] = String(value);
  }
  return result;
}

/**
 * Rebuilds a query from request parameters.
 *
 * The inverse of `queryParams` in `analytics-gap-api.ts`, and deliberately
 * strict: a missing `from`, `to` or `timezone` is a refusal rather than a
 * default. §58 says the client must state the calendar it means, and a mock that
 * quietly substituted today's date in the device zone would let a screen ship
 * without sending one.
 */
function parseQuery(subject: AnalyticsSubject, query: Params): AnalyticsQuery | null {
  const { from, to, timezone } = query;
  if (!from || !to || !timezone) return null;

  const range: AnalyticsTimeRange = {
    // The preset is not on the wire — the dates are the identity. `custom` is the
    // honest label for a range reconstructed from two dates.
    preset: 'custom',
    from,
    to,
    timezone,
    isDeviceTimezone: false,
  };

  const filters: AnalyticsFilter[] = (query.filters ?? '')
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [dimension, values] = part.split(':');
      return {
        dimension: dimension as AnalyticsDimensionKey,
        values: (values ?? '').split('+').filter(Boolean),
      };
    })
    .filter((filter) => filter.values.length > 0);

  return {
    subject,
    range,
    metrics: query.metrics ? (query.metrics.split(',') as AnalyticsMetricKey[]) : undefined,
    granularity: query.granularity as AnalyticsGranularity | undefined,
    comparison: (query.comparison as AnalyticsComparisonBasis | undefined) ?? 'none',
    breakdowns: query.breakdowns ? (query.breakdowns.split(',') as AnalyticsDimensionKey[]) : undefined,
    includeSeries: query.includeSeries === 'true',
    filters: filters.length ? filters : undefined,
    communityScopeToken: query.communityScope ?? null,
  };
}

/** Pulls the last path segment, decoded. */
function lastSegment(url: string | undefined): string {
  const path = (url ?? '').split('?')[0];
  const segments = path.split('/').filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? '');
}

/** Pulls the segment before the last one. For `/content/{type}/{id}`. */
function penultimateSegment(url: string | undefined): string {
  const path = (url ?? '').split('?')[0];
  const segments = path.split('/').filter(Boolean);
  return decodeURIComponent(segments[segments.length - 2] ?? '');
}

/**
 * Kept for the suites that call it between tests. There is no session state
 * left to reset: the export jobs and saved reports it held left with their
 * simulated routes on 20 Oct 2026.
 */
export function resetAnalyticsMockState(): void {
  // Nothing to reset.
}

// ═════════════════════════════════════════════════════════════════════════════

export function setupAnalyticsGapMocks(mock: MockAdapter) {
  // A release build has no path to any of this. The guard is here as well as in
  // the client so that neither alone is load-bearing.
  if (!areAnalyticsGapsEnabled()) return;

  // ── Access — GAP-025 ──────────────────────────────────────────────────────
  //
  // Registered first, and deliberately: it is the route every screen calls
  // before it draws anything, and a handler ordering bug that shadowed it would
  // make every dashboard render as unauthorized.
  mock.onGet(new RegExp(`${ROOT}/access$`)).reply((config) => {
    const query = params(config);
    const subjectType = query.subjectType as AnalyticsSubjectType | undefined;
    if (!subjectType) return problem(400, 'analytics.subject.missing', 'subjectType is required.');

    const subject: AnalyticsSubject = { type: subjectType, id: query.subjectId ?? null };

    // The administrative preview is opt-in through a header rather than on by
    // default, so the ordinary development experience is a member's and the
    // administrative screens are reached on purpose. See `buildDevAccess`.
    const asAdministrator = config.headers?.['X-Dev-Analytics-Admin'] === '1';
    const hasPremium = config.headers?.['X-Dev-Analytics-Premium'] === '1';

    return ok(buildDevAccess(subject, { asAdministrator, hasPremium }));
  });

  // ── Datasets — GAP-001 … GAP-024 ──────────────────────────────────────────
  //
  // Ordered longest-path-first. `axios-mock-adapter` matches in registration
  // order, and `/content/{type}/{id}` would otherwise be swallowed by a looser
  // pattern registered before it.

  mock.onGet(new RegExp(`${ROOT}/content/[^/]+/[^/]+$`)).reply((config) => {
    const subject: AnalyticsSubject = {
      type: penultimateSegment(config.url) as AnalyticsSubjectType,
      id: lastSegment(config.url),
    };
    return datasetReply(subject, params(config));
  });

  const SUBJECT_ROUTES: { pattern: string; type: AnalyticsSubjectType }[] = [
    { pattern: 'countries', type: 'country' },
    { pattern: 'communities', type: 'community' },
    { pattern: 'neighborhoods', type: 'neighborhood' },
    { pattern: 'providers', type: 'provider' },
    { pattern: 'employers', type: 'employer' },
    { pattern: 'sellers', type: 'seller' },
    { pattern: 'landlords', type: 'landlord' },
    { pattern: 'organizations', type: 'organization' },
    { pattern: 'campaigns', type: 'campaign' },
  ];

  for (const route of SUBJECT_ROUTES) {
    mock.onGet(new RegExp(`${ROOT}/${route.pattern}/[^/]+$`)).reply((config) =>
      datasetReply({ type: route.type, id: lastSegment(config.url) }, params(config))
    );
  }

  // Self-scoped. No id on the wire, by design — see `datasetPath`.
  mock.onGet(new RegExp(`${ROOT}/creators/me$`)).reply((config) =>
    datasetReply({ type: 'creator', id: null }, params(config))
  );

  mock.onGet(new RegExp(`${ROOT}/platform$`)).reply((config) =>
    datasetReply({ type: 'platform', id: null }, params(config))
  );

  // ── Retention — GAP-004 ───────────────────────────────────────────────────
  mock.onGet(new RegExp(`${ROOT}/retention$`)).reply((config) => {
    const query = params(config);
    const subject: AnalyticsSubject = {
      type: (query.subjectType as AnalyticsSubjectType) ?? 'platform',
      id: query.subjectId ?? null,
    };

    const to = query.to;
    const timezone = query.timezone;
    if (!to || !timezone) {
      return problem(400, 'analytics.range.missing', 'to and timezone are required.');
    }

    const granularity = (query.cohortGranularity as 'day' | 'week' | 'month') ?? 'week';
    const cohortCount = Math.min(24, Number.parseInt(query.cohortCount ?? '8', 10) || 8);

    const range: AnalyticsTimeRange = {
      preset: 'custom',
      from: to,
      to,
      timezone,
      isDeviceTimezone: false,
    };

    return ok(
      buildRetention(
        subject,
        { subject, range },
        'retentionAnalytics',
        granularity,
        cohortCount
      )
    );
  });

  // ── Leaderboards ──────────────────────────────────────────────────────────
  mock.onGet(new RegExp(`${ROOT}/leaderboards/[^/]+$`)).reply((config) => {
    const query = params(config);
    const key = lastSegment(config.url);
    const subject: AnalyticsSubject = {
      type: (query.subjectType as AnalyticsSubjectType) ?? 'platform',
      id: query.subjectId ?? null,
    };

    const parsed = parseQuery(subject, query);
    if (!parsed) return problem(400, 'analytics.range.missing', 'from, to and timezone are required.');

    const metric = (query.metric as AnalyticsMetricKey) ?? 'content.views';
    return ok(buildLeaderboard(key, 'Top content', metric, subject, parsed));
  });

  // ── Insights — GAP-028 ────────────────────────────────────────────────────
  mock.onGet(new RegExp(`${ROOT}/insights$`)).reply((config) => {
    const query = params(config);
    const subject: AnalyticsSubject = {
      type: (query.subjectType as AnalyticsSubjectType) ?? 'platform',
      id: query.subjectId ?? null,
    };

    const parsed = parseQuery(subject, query);
    if (!parsed) return problem(400, 'analytics.range.missing', 'from, to and timezone are required.');

    return ok(buildInsights(subject, parsed));
  });

  // Funnels (GAP-016), exports (GAP-026) and saved reports (GAP-027) are served
  // for real since 20 Oct 2026 and read from `analytics-api.ts`; nothing here
  // answers them any more.

  // ── Helpers bound to this registration ────────────────────────────────────

  function datasetReply(subject: AnalyticsSubject, query: Params): MockReply {
    const parsed = parseQuery(subject, query);
    if (!parsed) {
      return problem(
        400,
        'analytics.range.missing',
        'from, to and timezone are all required. A range without a timezone is not a range.'
      );
    }
    return ok(buildDevDataset(parsed));
  }
}
