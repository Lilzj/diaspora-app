// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics, development arm (Frontend Phase 15)
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/analytics-gaps.ts`. ⚠
//
// The development arm of the repository split. The certified arm is
// `analytics-api.ts`; `hooks/analytics.ts` is the stable interface above both,
// and a screen cannot tell which answered except through the provenance the
// data itself carries — which it is required to render.
//
// ── Why the prefix is `/analytics-gap/v0` ────────────────────────────────────
//
// The same reasoning Phases 5 through 13 applied, and the same three
// consequences, all wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether a
//     figure has a backend behind it.
//   * A call that escaped a development build 404s at the gateway rather than
//     colliding with, shadowing, or being mistaken for a certified route.
//   * Migration is mechanical: when a backend phase ships analytics, the hook
//     swaps which arm it calls and the request shapes already match.
//
// Every function refuses to run when the gap features are disabled, so the
// guarantee does not depend on a screen remembering to check.
//
// ── What is NOT in this file, and why it matters ─────────────────────────────
//
// **Nothing that moves money.** No payment, no payout, no wallet write, no
// balance adjustment. Analytics *reads* financial records through the certified
// arm and this file has no financial function at all — asserted structurally by
// `analytics-boundary.test.ts` rather than trusted to this comment.
//
// **Nothing that grants a permission.** `fetchAnalyticsAccess` *reads* a
// capability set; there is no `grantAnalyticsAccess`, no `setCapability`. §48
// keeps authorization server-side, and a development adapter that could mint an
// administrator is one somebody eventually calls from a screen.
//
// **No content, and no second discovery system.** No guide, job, listing, event
// or organization is fetched here. Analytics describes them; it does not serve
// them.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import { ANALYTICS_GAPS, ANALYTICS_GAP_PREFIX, areAnalyticsGapsEnabled } from '@/config/analytics-gaps';
import type {
  AnalyticsAccess,
  AnalyticsDataset,
  AnalyticsGranularity,
  AnalyticsInsight,
  AnalyticsLeaderboard,
  AnalyticsMetricKey,
  AnalyticsQuery,
  AnalyticsRetentionTable,
  AnalyticsSubject,
  AnalyticsTimeRange,
} from '@/types/analytics';

const PREFIX = ANALYTICS_GAP_PREFIX;

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export class AnalyticsUnavailableError extends Error {
  readonly gapKey: string;

  constructor(message: string, gapKey: string) {
    super(message);
    this.name = 'AnalyticsUnavailableError';
    this.gapKey = gapKey;
  }
}

export function isAnalyticsUnavailable(error: unknown): error is AnalyticsUnavailableError {
  return error instanceof AnalyticsUnavailableError;
}

/**
 * The guard every function in this file passes through.
 *
 * Throws rather than returning empty, and the distinction is the whole of §73's
 * first requirement. An empty result renders as "there is no data", which is a
 * claim about the platform. A rejection renders as "this is not available in
 * this build", which is a claim about the build — and it is the true one.
 *
 * Every caller is `async`, deliberately: an `async` function turns this throw
 * into a **rejected promise**, so a caller that wrote `.catch(handle)` sees the
 * refusal. A synchronous throw from a non-async function would escape that
 * `catch` and surface as an unhandled error at the call site instead.
 */
function assertEnabled(gapKey: string): void {
  if (!areAnalyticsGapsEnabled()) {
    const gap = ANALYTICS_GAPS[gapKey];
    throw new AnalyticsUnavailableError(
      gap ? `${gap.id} — ${gap.capability} is not available in this build.` : 'Not available.',
      gapKey
    );
  }
}

async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(`${PREFIX}${path}`, { params, signal });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as the financial, Community Life
 * and community-directory clients do, so a transport failure becomes an
 * *indeterminate* outcome rather than a failed one.
 *
 * It matters less here than for a payment — nobody is charged twice for a saved
 * report — but the reason to keep it uniform is that the one place it does
 * matter should not be the one place somebody remembered.
 */
async function write<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: object
): Promise<T> {
  try {
    const url = `${PREFIX}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(url, { params, data: body })
        : method === 'put'
          ? await apiClient.put<Envelope<T>>(url, body, { params })
          : await apiClient.post<Envelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

/**
 * Serialises a query into request parameters.
 *
 * One function, so the request the client sends and the request the gap register
 * documents cannot drift. Arrays are comma-joined rather than repeated, matching
 * the convention every other client in this codebase uses.
 *
 * Note what travels: `from`, `to` and `timezone` as three separate parameters
 * rather than one ISO instant. §58 is a wire-format decision before it is a UI
 * one — see the header of `lib/analytics/time-range.ts`.
 */
function queryParams(query: AnalyticsQuery): Record<string, unknown> {
  return {
    from: query.range.from,
    to: query.range.to,
    timezone: query.range.timezone,
    metrics: query.metrics?.length ? query.metrics.join(',') : undefined,
    granularity: query.granularity,
    comparison: query.comparison && query.comparison !== 'none' ? query.comparison : undefined,
    breakdowns: query.breakdowns?.length ? query.breakdowns.join(',') : undefined,
    includeSeries: query.includeSeries ?? false,
    filters: query.filters?.length
      ? query.filters
          .filter((filter) => filter.values.length > 0)
          .map((filter) => `${filter.dimension}:${filter.values.join('+')}`)
          .join(';')
      : undefined,
    communityScope: query.communityScopeToken ?? undefined,
  };
}

/**
 * The route a subject's dataset lives at.
 *
 * A subject with an id gets a path segment; `platform` and the self-scoped
 * `creator` do not. The `creator` case is the important one — there is
 * deliberately no `/analytics/creators/{id}` in the register, because a route
 * that cannot name another creator cannot leak one, and that is a stronger
 * guarantee than a permission check.
 */
function datasetPath(subject: AnalyticsSubject): string {
  const id = subject.id ? encodeURIComponent(subject.id) : null;

  switch (subject.type) {
    case 'platform':
      return '/platform';
    case 'creator':
      return '/creators/me';
    case 'country':
      return `/countries/${id}`;
    case 'community':
      return `/communities/${id}`;
    case 'neighborhood':
      return `/neighborhoods/${id}`;
    case 'provider':
      return `/providers/${id}`;
    case 'employer':
      return `/employers/${id}`;
    case 'seller':
      return `/sellers/${id}`;
    case 'landlord':
      return `/landlords/${id}`;
    case 'organization':
      return `/organizations/${id}`;
    case 'campaign':
      return `/campaigns/${id}`;
    // Individual items share one content route, keyed by type. §22 and §23
    // forbid a second analytics system per content kind, and one route with a
    // type segment is what that looks like on the wire.
    case 'job':
    case 'listing':
    case 'housing':
    case 'guide':
    case 'event':
    case 'update':
      return `/content/${subject.type}/${id}`;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — FRONTEND-PHASE15-GAP-025
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The caller's capabilities for one analytics subject.
 *
 * Read-only, and there is deliberately no write counterpart. See the header.
 */
export async function fetchAnalyticsAccess(
  subject: AnalyticsSubject,
  signal?: AbortSignal
): Promise<AnalyticsAccess> {
  assertEnabled(ANALYTICS_GAPS.analyticsAccess.key);
  return read<AnalyticsAccess>(
    '/access',
    { subjectType: subject.type, subjectId: subject.id ?? undefined },
    signal
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DATASETS — GAP-001 … GAP-024
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The one dataset read.
 *
 * Every dashboard in the application goes through this function. That is §4's
 * requirement made structural: there is no per-audience client, so there is no
 * per-audience place for a screen to acquire a habit the others do not have.
 *
 * The gap key is derived from the subject rather than passed, so a caller cannot
 * attribute a community dataset to the platform gap and quietly mislabel which
 * contract is missing.
 */
export async function fetchAnalyticsDataset(
  query: AnalyticsQuery,
  signal?: AbortSignal
): Promise<AnalyticsDataset> {
  assertEnabled(gapKeyForSubject(query.subject));
  return read<AnalyticsDataset>(datasetPath(query.subject), queryParams(query), signal);
}

/** Which gap a subject's dataset is attributed to. Mirrors the mock provider's map. */
export function gapKeyForSubject(subject: AnalyticsSubject): string {
  switch (subject.type) {
    case 'platform':
      return ANALYTICS_GAPS.platformAnalytics.key;
    case 'country':
      return ANALYTICS_GAPS.countryAnalytics.key;
    case 'community':
      return ANALYTICS_GAPS.communityAnalytics.key;
    case 'neighborhood':
      return ANALYTICS_GAPS.neighborhoodAnalytics.key;
    case 'creator':
      return ANALYTICS_GAPS.creatorAnalytics.key;
    case 'provider':
      return ANALYTICS_GAPS.providerAnalytics.key;
    case 'employer':
    case 'job':
      return ANALYTICS_GAPS.employerAnalytics.key;
    case 'seller':
    case 'listing':
      return ANALYTICS_GAPS.marketplaceAnalytics.key;
    case 'landlord':
    case 'housing':
      return ANALYTICS_GAPS.housingAnalytics.key;
    case 'organization':
      return ANALYTICS_GAPS.organizationAnalytics.key;
    case 'event':
      return ANALYTICS_GAPS.eventAnalytics.key;
    case 'campaign':
      return ANALYTICS_GAPS.monetizationAnalytics.key;
    case 'guide':
    case 'update':
      return ANALYTICS_GAPS.contentAnalytics.key;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// RETENTION — GAP-004
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchAnalyticsRetention(
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  granularity: Extract<AnalyticsGranularity, 'day' | 'week' | 'month'>,
  cohortCount: number,
  signal?: AbortSignal
): Promise<AnalyticsRetentionTable> {
  assertEnabled(ANALYTICS_GAPS.retentionAnalytics.key);
  return read<AnalyticsRetentionTable>(
    '/retention',
    {
      subjectType: subject.type,
      subjectId: subject.id ?? undefined,
      cohortGranularity: granularity,
      cohortCount,
      to: range.to,
      timezone: range.timezone,
    },
    signal
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARDS
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchAnalyticsLeaderboard(
  leaderboardKey: string,
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  metricKey: AnalyticsMetricKey,
  signal?: AbortSignal
): Promise<AnalyticsLeaderboard> {
  assertEnabled(gapKeyForSubject(subject));
  return read<AnalyticsLeaderboard>(
    `/leaderboards/${encodeURIComponent(leaderboardKey)}`,
    {
      subjectType: subject.type,
      subjectId: subject.id ?? undefined,
      metric: metricKey,
      from: range.from,
      to: range.to,
      timezone: range.timezone,
    },
    signal
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// INSIGHTS — GAP-028
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchAnalyticsInsights(
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  signal?: AbortSignal
): Promise<AnalyticsInsight[]> {
  assertEnabled(ANALYTICS_GAPS.analyticsInsights.key);
  return read<AnalyticsInsight[]>(
    '/insights',
    {
      subjectType: subject.type,
      subjectId: subject.id ?? undefined,
      from: range.from,
      to: range.to,
      timezone: range.timezone,
    },
    signal
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FUNNELS, EXPORT AND SAVED REPORTS — GAP-016, GAP-026, GAP-027
//
// Served for real since 20 Oct 2026 and read by `analytics-api.ts`; their
// simulated functions are gone, so no build can reach a simulated funnel,
// export or report.
// ═════════════════════════════════════════════════════════════════════════════
