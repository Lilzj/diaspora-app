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
  buildFunnel,
  buildInsights,
  buildLeaderboard,
  buildRetention,
} from '../analytics-data';
import type {
  AnalyticsComparisonBasis,
  AnalyticsDimensionKey,
  AnalyticsExport,
  AnalyticsExportFormat,
  AnalyticsFilter,
  AnalyticsGranularity,
  AnalyticsMetricKey,
  AnalyticsQuery,
  AnalyticsReport,
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

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Session state
//
// Export jobs and saved reports only. Everything else is computed.
// ─────────────────────────────────────────────────────────────────────────────

interface ExportJobState extends AnalyticsExport {
  /** How many times the client has polled. Drives the state machine below. */
  pollCount: number;
}

const exportJobs = new Map<string, ExportJobState>();
const savedReports = new Map<string, AnalyticsReport>();
let idCounter = 0;

/**
 * Deterministic ids.
 *
 * A counter rather than `Math.random()`, so a test asserting on an export id can
 * do so, and so two runs of the same journey produce the same ids. §60 applies
 * to identifiers as much as to figures.
 */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(6, '0')}`;
}

export function resetAnalyticsMockState(): void {
  exportJobs.clear();
  savedReports.clear();
  idCounter = 0;
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

  // ── Funnels — GAP-016 ─────────────────────────────────────────────────────
  mock.onGet(new RegExp(`${ROOT}/funnels/[^/]+$`)).reply((config) => {
    const query = params(config);
    const funnelKey = lastSegment(config.url);
    const subject: AnalyticsSubject = {
      type: (query.subjectType as AnalyticsSubjectType) ?? 'platform',
      id: query.subjectId ?? null,
    };

    const parsed = parseQuery(subject, query);
    if (!parsed) return problem(400, 'analytics.range.missing', 'from, to and timezone are required.');

    const funnel = buildFunnel(funnelKey, subject, parsed, 'funnelAnalytics');
    if (!funnel) {
      // §32 forbids inventing funnel events. An unknown funnel key is a 404
      // rather than a generated funnel, so a typo in a screen surfaces as a
      // missing funnel instead of as plausible numbers for a journey that does
      // not exist.
      return problem(404, 'analytics.funnel.unknown', `No funnel named "${funnelKey}".`);
    }
    return ok(funnel);
  });

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

  // ── Export — GAP-026 ──────────────────────────────────────────────────────
  //
  // Genuinely asynchronous. The job reports `queued`, then `running`, then
  // `ready`, one state per poll, because an export that was ready immediately
  // would let the polling UI, its spinner and its failure path ship untested.
  //
  // A PDF export of a range longer than 90 days fails, deliberately: §74 asks
  // for an error path and a failure nobody can reproduce is a failure nobody has
  // rendered.
  mock.onPost(new RegExp(`${ROOT}/exports$`)).reply((config) => {
    const input = body<{ query: AnalyticsQuery; format: AnalyticsExportFormat }>(config);
    if (!input.query || !input.format) {
      return problem(400, 'analytics.export.invalid', 'A query and a format are required.');
    }

    const exportId = nextId('exp');
    const job: ExportJobState = {
      exportId,
      format: input.format,
      status: 'queued',
      query: input.query,
      // Derived from the range rather than the clock, so a test asserting on the
      // response body is not a function of when it ran.
      requestedAt: `${input.query.range?.to ?? '1970-01-01'}T09:00:00.000Z`,
      completedAt: null,
      downloadUrl: null,
      sizeBytes: null,
      failureReason: null,
      expiresAt: null,
      pollCount: 0,
    };

    exportJobs.set(exportId, job);
    return [202, { data: stripInternal(job) }];
  });

  mock.onGet(new RegExp(`${ROOT}/exports/[^/]+$`)).reply((config) => {
    const exportId = lastSegment(config.url);
    const job = exportJobs.get(exportId);
    if (!job) return problem(404, 'analytics.export.notFound', 'No such export.');

    job.pollCount += 1;

    const rangeDays = daysBetween(job.query.range?.from, job.query.range?.to);
    const isOversizedPdf = job.format === 'pdf' && rangeDays > 90;

    if (job.pollCount === 1) {
      job.status = 'running';
    } else if (job.pollCount >= 2) {
      if (isOversizedPdf) {
        job.status = 'failed';
        job.failureReason =
          'A PDF cannot be generated for a range longer than 90 days. Try CSV, or pick a shorter period.';
      } else {
        job.status = 'ready';
        job.completedAt = `${job.query.range?.to ?? '1970-01-01'}T09:00:30.000Z`;
        // A signed, short-lived URL in shape. It resolves to nothing, and saying
        // so in the path is better than a plausible link that 404s silently.
        job.downloadUrl = `https://exports.dev.diaspora.invalid/${exportId}.${job.format}?sig=development-only`;
        job.sizeBytes = 1024 * (12 + rangeDays * 3);
        // Twelve hours after completion. Short-lived on purpose: §43's privacy
        // note is that an exported file leaves every protection the app provides.
        job.expiresAt = `${job.query.range?.to ?? '1970-01-01'}T21:00:00.000Z`;
      }
    }

    return ok(stripInternal(job));
  });

  // ── Reports — GAP-027 ─────────────────────────────────────────────────────
  mock.onGet(new RegExp(`${ROOT}/reports$`)).reply((config) => {
    const scope = params(config).scope ?? 'mine';
    const all = [...savedReports.values()];

    const filtered =
      scope === 'favorites'
        ? all.filter((report) => report.isFavorite)
        : scope === 'shared'
          ? all.filter((report) => !report.isOwnedByCaller)
          : all.filter((report) => report.isOwnedByCaller);

    return ok(filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  });

  mock.onGet(new RegExp(`${ROOT}/reports/[^/]+$`)).reply((config) => {
    const report = savedReports.get(lastSegment(config.url));
    return report ? ok(report) : problem(404, 'analytics.report.notFound', 'No such report.');
  });

  mock.onPost(new RegExp(`${ROOT}/reports$`)).reply((config) => {
    const input = body<Partial<AnalyticsReport> & { name?: string }>(config);
    if (!input.name || !input.query) {
      return problem(400, 'analytics.report.invalid', 'A name and a query are required.');
    }

    const reportId = nextId('rpt');
    const stamp = `${input.query.range?.to ?? '1970-01-01'}T09:00:00.000Z`;

    const report: AnalyticsReport = {
      reportId,
      name: input.name,
      description: input.description ?? null,
      query: input.query,
      visualization: input.visualization ?? 'metricCards',
      // An opaque owner id. Compared, never displayed — §47.
      ownerId: 'dev-owner',
      isOwnedByCaller: true,
      isFavorite: false,
      sharing: input.sharing ?? 'private',
      createdAt: stamp,
      updatedAt: stamp,
      lastRunAt: null,
    };

    savedReports.set(reportId, report);
    return [201, { data: report }];
  });

  mock.onPut(new RegExp(`${ROOT}/reports/[^/]+$`)).reply((config) => {
    const reportId = lastSegment(config.url);
    const existing = savedReports.get(reportId);
    if (!existing) return problem(404, 'analytics.report.notFound', 'No such report.');

    const input = body<Partial<AnalyticsReport>>(config);
    const updated: AnalyticsReport = {
      ...existing,
      ...input,
      reportId: existing.reportId,
      ownerId: existing.ownerId,
      isOwnedByCaller: existing.isOwnedByCaller,
      createdAt: existing.createdAt,
      updatedAt: `${existing.query.range?.to ?? '1970-01-01'}T09:05:00.000Z`,
    };

    savedReports.set(reportId, updated);
    return ok(updated);
  });

  mock.onDelete(new RegExp(`${ROOT}/reports/[^/]+$`)).reply((config) => {
    const reportId = lastSegment(config.url);
    if (!savedReports.has(reportId)) {
      return problem(404, 'analytics.report.notFound', 'No such report.');
    }
    savedReports.delete(reportId);
    return ok({ reportId });
  });

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

function stripInternal(job: ExportJobState): AnalyticsExport {
  const { pollCount: _pollCount, ...rest } = job;
  return rest;
}

function daysBetween(from: string | undefined, to: string | undefined): number {
  if (!from || !to) return 0;
  const span = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Number.isFinite(span) ? Math.round(span / 86_400_000) + 1 : 0;
}
