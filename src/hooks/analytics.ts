// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics hooks (Frontend Phase 15, §4 · §52 · §54)
//
// The stable interface above both repository arms. §4's requirement is that a
// screen must not know whether its data came from a certified route, an existing
// phase's adapter, or the development provider — and this file is where that
// stops being a principle and becomes a signature.
//
// A screen calls `useAnalyticsDataset(query)` and receives an `AnalyticsDataset`.
// Behind it, that one call may:
//
//   * read the certified `/jobs`, `/housing`, `/neighborhood/{id}` routes for
//     real inventory counts,
//   * read Phase 13's existing community statistics contract and normalise it,
//   * read the development adapter for everything with no contract,
//   * and compose the three into one object whose per-metric provenance says
//     which is which.
//
// The screen sees none of that. What it does see, and is required to render, is
// `dataset.status` and each metric's `value.source` — because §38 forbids
// presenting a gap as a production number, and the only way to make that
// enforceable is to make the marker unavoidable rather than optional.
//
// ── §54, offline, and the one thing this file will not do ────────────────────
//
// TanStack Query will happily serve a cached dataset for ever. That is the right
// behaviour — analytics is exactly the kind of data worth reading offline — and
// it is also how a dashboard silently shows last Tuesday's numbers as today's.
//
// So `useAnalyticsDataset` computes a **status override**: when the device is
// offline and the cached data is older than its own freshness promise, the
// dataset it returns is marked `STALE` rather than `LIVE`. The data is still
// shown, which §54 permits. It is never shown as current, which §54 forbids.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as gapApi from '@/lib/analytics-gap-api';
import * as certifiedApi from '@/lib/analytics-api';
import { ANALYTICS_GAPS, areAnalyticsGapsEnabled } from '@/config/analytics-gaps';
import { shouldRetryQuery, type FinancialError } from '@/lib/financial-errors';
import { useConnectivityStore } from '@/lib/connectivity';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import { composeDataset, fromCommunityStatistics } from '@/lib/analytics/adapters';
import { noAnalyticsAccess } from '@/lib/analytics/access';
import { ANALYTICS_DEFINITIONS, allAnalyticsDefinitions } from '@/lib/analytics/definitions';
import {
  defaultGranularity,
  resolveRange,
  resolveReportingTimezone,
  type ResolveRangeOptions,
} from '@/lib/analytics/time-range';
import { useCommunityStatistics } from './communities';
import type {
  AnalyticsAccess,
  AnalyticsComparisonBasis,
  AnalyticsDataStatus,
  AnalyticsDataset,
  AnalyticsDefinition,
  AnalyticsExportFormat,
  AnalyticsFilter,
  AnalyticsGranularity,
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsQuery,
  AnalyticsRangePreset,
  AnalyticsReport,
  AnalyticsSubject,
  AnalyticsTimeRange,
  AnalyticsVisualization,
} from '@/types/analytics';

/** A dataset is a nightly rollup. Refetching it every thirty seconds is waste. */
const DATASET_STALE_MS = 5 * 60_000;
/** A live count is live. A short stale time keeps it feeling that way. */
const INVENTORY_STALE_MS = 10 * 60_000;
/** A capability must stop being effective quickly after it is revoked. */
const ACCESS_STALE_MS = 60_000;

const readOptions = { retry: shouldRetryQuery } as const;
/** Mutations never retry. Same rule and same reason as `hooks/financial.ts`. */
const mutationOptions = { retry: 0 } as const;

/** Whether this build can reach the development analytics adapter at all. */
export function useAnalyticsGapsEnabled(): boolean {
  return areAnalyticsGapsEnabled();
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — GAP-025
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsAccessResult {
  access: AnalyticsAccess;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  /** True where the capability set is the server's rather than the safe default. */
  isResolved: boolean;
  refetch: () => void;
}

/**
 * The server's answer about what this caller may see.
 *
 * Returns `noAnalyticsAccess()` — every field false — until the server answers.
 * That default is the whole point: a screen that renders before the capability
 * arrives renders *nothing*, rather than flashing an administrative dashboard
 * for the half-second before a permission check lands. §48.
 */
export function useAnalyticsAccess(subject: AnalyticsSubject): AnalyticsAccessResult {
  // ── Which arm answers, and why it is this way round ───────────────────────
  //
  // `GET /api/v1/analytics/access` is real and this hook now reads it. What it
  // does *not* do is read it in a development build, because the development
  // build's dashboards are drawn from a simulated dataset the real capability
  // set knows nothing about: the server hardcodes `canCompare`, `canExport` and
  // `canBuildReports` to false, and §48's rule is that a missing capability
  // renders *nothing*. Wiring the real answer under a simulated dashboard would
  // hide three surfaces the whole point of the development arm is to be able to
  // review.
  //
  // So the switch is the phase's own switch, read the only honest way round:
  // **gaps on → the simulated capability set; gaps off → the platform's.**
  // Before this change the second half did not exist at all — with gaps off the
  // query never ran, `query.data` was always undefined, and every screen in the
  // application saw `noAnalyticsAccess()`, which is every field false. A release
  // build did not show a member less analytics than a development one; it
  // showed them none.
  const gapsEnabled = areAnalyticsGapsEnabled();

  const query = useQuery({
    queryKey: analyticsKeys.access(subject),
    queryFn: ({ signal }) =>
      gapsEnabled
        ? gapApi.fetchAnalyticsAccess(subject, signal)
        : certifiedApi.fetchAnalyticsAccess(subject, signal),
    // Always enabled now. A capability set is the one read that must happen
    // before anything else can, and there is no build in which the app is
    // better off not knowing what the caller may see.
    enabled: true,
    staleTime: ACCESS_STALE_MS,
    ...readOptions,
  });

  return {
    access: query.data ?? noAnalyticsAccess(subject),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isResolved: Boolean(query.data),
    refetch: query.refetch,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFINITIONS — GAP-030, and the catalogue the platform actually serves
// ═════════════════════════════════════════════════════════════════════════════

/** A definitions catalogue is a release-scale document. An hour is generous. */
const DEFINITIONS_STALE_MS = 60 * 60_000;

export interface AnalyticsDefinitionsResult {
  definitions: AnalyticsDefinition[];
  /** The platform's catalogue version, where it answered. Empty otherwise. */
  version: string;
  /** True where the platform's own prose and statuses are being shown. */
  isReconciled: boolean;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
}

/**
 * The metric catalogue, the platform's version of it folded in.
 *
 * **The shipped catalogue is always the answer**, and the network can only
 * improve it. That is not defensive coding, it is the same trade the catalogue
 * was written under: a definition the app cannot show because the connection
 * dropped is worse than one a release behind. So this hook never returns null,
 * never renders a spinner over a list it already has, and treats a failed fetch
 * as "no improvement available" rather than as an error state a member sees.
 *
 * `isReconciled` is what a screen renders the difference from — it is true only
 * once the platform has answered, which is the only honest moment to tell a
 * reader that the sentence in front of them is the platform's own.
 *
 * Unlike the dataset and capability reads, this one is **not** gated on the gap
 * switch. There is nothing simulated to keep out of a release binary: it is a
 * real route improving a real catalogue, and a development build is better off
 * seeing what the deployment actually says.
 */
export function useAnalyticsDefinitions(): AnalyticsDefinitionsResult {
  const query = useQuery({
    queryKey: analyticsKeys.definitions(),
    queryFn: ({ signal }) => certifiedApi.fetchAnalyticsDefinitions(signal),
    staleTime: DEFINITIONS_STALE_MS,
    ...readOptions,
  });

  const definitions = useMemo(
    () => query.data?.definitions ?? allAnalyticsDefinitions(),
    [query.data]
  );

  return {
    definitions,
    version: query.data?.version ?? '',
    isReconciled: Boolean(query.data && query.data.reconciledCount > 0),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TIME RANGE — §6, §42
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsControls {
  range: AnalyticsTimeRange;
  preset: AnalyticsRangePreset;
  comparison: AnalyticsComparisonBasis;
  granularity: AnalyticsGranularity;
  filters: AnalyticsFilter[];
  setPreset: (preset: AnalyticsRangePreset) => void;
  setCustomRange: (from: string, to: string) => void;
  setComparison: (comparison: AnalyticsComparisonBasis) => void;
  setGranularity: (granularity: AnalyticsGranularity | 'auto') => void;
  setFilter: (dimension: AnalyticsFilter['dimension'], values: string[]) => void;
  clearFilters: () => void;
}

/**
 * The controls every dashboard shares.
 *
 * §42 asks for filter persistence "where appropriate" and warns against
 * persisting indefinitely where that creates confusing behaviour. The judgement
 * taken here, and it is a judgement:
 *
 *   **The range and comparison persist for the session, in memory.** A member
 *   moving between the community dashboard and the creator dashboard expects the
 *   same 30 days.
 *
 *   **Filters do not persist across subjects.** A community filter applied on
 *   the platform dashboard means nothing on a job dashboard, and carrying it
 *   would silently narrow a screen the member had not narrowed.
 *
 *   **Nothing is written to disk.** A range restored from storage three weeks
 *   later is the confusing behaviour §42 warns about — the member does not
 *   remember setting it, and "last 7 days" resolved then is a different window
 *   now. Session-lifetime is the honest lifetime for a view preference.
 *
 * `reportingTimezone` comes from the capability set, so the range is cut in the
 * platform's calendar as soon as the server says what it is, and in the device's
 * — marked — until then.
 */
export function useAnalyticsControls(options: {
  initialPreset?: AnalyticsRangePreset;
  initialComparison?: AnalyticsComparisonBasis;
  reportingTimezone?: string | null;
  /** Overridable so tests are not a function of the day they run. */
  now?: Date;
} = {}): AnalyticsControls {
  const [preset, setPresetState] = useState<AnalyticsRangePreset>(options.initialPreset ?? 'last30d');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [comparison, setComparison] = useState<AnalyticsComparisonBasis>(
    options.initialComparison ?? 'previousPeriod'
  );
  const [granularityOverride, setGranularityOverride] = useState<AnalyticsGranularity | null>(null);
  const [filters, setFilters] = useState<AnalyticsFilter[]>([]);

  const range = useMemo<AnalyticsTimeRange>(() => {
    const resolveOptions: ResolveRangeOptions = {
      reportingTimezone: options.reportingTimezone,
      now: options.now,
      from: custom?.from,
      to: custom?.to,
    };
    return resolveRange(preset, resolveOptions);
  }, [preset, custom, options.reportingTimezone, options.now]);

  const granularity = granularityOverride ?? defaultGranularity(range);

  const setPreset = useCallback((next: AnalyticsRangePreset) => {
    setPresetState(next);
    // Leaving a stale custom window behind would make a later switch back to
    // `custom` silently reuse dates the member had forgotten about.
    if (next !== 'custom') setCustom(null);
  }, []);

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustom({ from, to });
    setPresetState('custom');
  }, []);

  const setFilter = useCallback((dimension: AnalyticsFilter['dimension'], values: string[]) => {
    setFilters((current) => {
      const others = current.filter((filter) => filter.dimension !== dimension);
      return values.length > 0 ? [...others, { dimension, values }] : others;
    });
  }, []);

  return {
    range,
    preset,
    comparison,
    granularity,
    filters,
    setPreset,
    setCustomRange,
    setComparison,
    setGranularity: useCallback((next: AnalyticsGranularity | 'auto') => {
      setGranularityOverride(next === 'auto' ? null : next);
    }, []),
    setFilter,
    clearFilters: useCallback(() => setFilters([]), []),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DATASET — the one read every dashboard makes
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsDatasetResult {
  dataset: AnalyticsDataset | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: FinancialError | null;
  /** True where any metric came from the development provider. */
  isSimulated: boolean;
  /** True where this build cannot reach the adapter at all. */
  isEnabled: boolean;
  refetch: () => void;
}

/**
 * Which subjects have genuinely certified inventory counts worth fetching.
 *
 * A short list, and it is short because the certified surface is. Fetching six
 * list routes for a creator dashboard would be six requests for numbers that say
 * nothing about that creator.
 */
const INVENTORY_SUBJECTS = new Set(['platform', 'country', 'neighborhood']);

/**
 * The dataset for a query.
 *
 * Composes up to four sources. The ordering in `composeDataset` matters and is
 * documented there: certified metrics are appended last, so a real figure always
 * wins over a simulated one on a key collision.
 *
 * ── The fourth source, and why it is a *base* rather than an overlay ─────────
 *
 * `GET /api/v1/analytics/content/{type}/{id}` serves a whole Phase 15 dataset
 * for a guide, an update, an event, a job, a marketplace listing or a housing
 * listing — subject, resolved range, status, metrics, series, freshness and
 * `unavailableMetrics`. It is not a handful of extra figures to merge into a
 * simulated dashboard; it is the dashboard.
 *
 * So for a content subject it becomes the base and the development arm keeps
 * only the four collections the certified route **always** returns empty:
 * breakdowns, funnels, insights, leaderboards, and the retention grid. Those are
 * FRONTEND-PHASE15-GAP-016, -004 and -028, they belong to later phases, and the
 * server declines to invent them. Every one of those simulated parts carries its
 * own `source` so §38's marker stays at field level — and in a release build,
 * where the development arm does not run at all, they are simply absent.
 */
export function useAnalyticsDataset(
  query: AnalyticsQuery | null,
  options: { enabled?: boolean; access?: AnalyticsAccess | null } = {}
): AnalyticsDatasetResult {
  const gapsEnabled = areAnalyticsGapsEnabled();
  const isOnline = useConnectivityStore((state) => state.isOnline);

  const wanted = Boolean(query) && (options.enabled ?? true);
  const enabled = wanted && gapsEnabled;

  const adapterQuery = useQuery({
    queryKey: query ? analyticsKeys.dataset(query) : ['analytics', 'dataset', 'none'],
    queryFn: ({ signal }) => gapApi.fetchAnalyticsDataset(query!, signal),
    enabled,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  // ── The certified per-item dataset ────────────────────────────────────────
  //
  // Enabled on `wanted` rather than on `enabled`: it is a real route and does
  // not depend on the gap switch. `isCertifiedContentSubject` is the gate, and
  // it is deliberately narrow — a subject type the server's
  // `AnalyticsContentTypes.FromRouteSegment` does not accept would earn
  // `analytics.subject.unsupported`, so anything outside its table keeps the
  // development arm rather than asking a route that will refuse.
  const wantsContent = Boolean(query) && certifiedApi.isCertifiedContentSubject(query!.subject);

  const contentQuery = useQuery({
    queryKey: query
      ? [...analyticsKeys.dataset(query), 'certified-content']
      : ['analytics', 'dataset', 'none', 'certified-content'],
    queryFn: ({ signal }) =>
      certifiedApi.fetchContentAnalytics(query!.subject, query!.range, signal),
    enabled: wanted && wantsContent,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  // ── The certified half ────────────────────────────────────────────────────
  //
  // Real counts, for the subjects where they mean something. Deliberately a
  // separate query rather than part of the dataset fetch: it has a different
  // stale time (a live count is live), a different failure mode (one domain down
  // must not blank the dashboard) and a different cache lifetime.
  const wantsInventory = Boolean(query) && INVENTORY_SUBJECTS.has(query!.subject.type);

  const inventoryQuery = useQuery({
    queryKey: query
      ? analyticsKeys.inventory(query.subject.type, query.subject.id)
      : ['analytics', 'inventory', 'none'],
    queryFn: ({ signal }) =>
      query!.subject.type === 'neighborhood' && query!.subject.id
        ? certifiedApi
            .fetchNeighborhoodInventory(query!.subject.id, signal)
            .then((metrics) => ({ metrics, unavailable: [] as AnalyticsMetricKey[] }))
        : certifiedApi.fetchInventoryCounts(
            {
              countryCode: query!.subject.type === 'country' ? query!.subject.id : undefined,
            },
            signal
          ),

    // `wanted`, not `enabled`. `enabled` folds in `areAnalyticsGapsEnabled()`, which is false in
    // the `production` build profile — `eas.json` sets EXPO_PUBLIC_ENABLE_GAP_PREVIEW on `preview`
    // only — so this query, the "real counts" half by its own heading, never ran in the build that
    // ships. The content query above already gated on `wanted`; this one now matches it.
    enabled: wanted && wantsInventory,
    staleTime: INVENTORY_STALE_MS,
    ...readOptions,
  });

  // ── Phase 13's existing community statistics ──────────────────────────────
  //
  // Reused rather than re-fetched under a new key. §2: do not duplicate an
  // existing capability because it lives in another feature folder.
  const communityId = query?.subject.type === 'community' ? query.subject.id ?? undefined : undefined;
  const communityStatistics = useCommunityStatistics(communityId, '30d');

  const dataset = useMemo<AnalyticsDataset | null>(() => {
    if (!query) return null;

    // ── Which dataset is the base ─────────────────────────────────────────
    //
    // The certified per-item dataset wins outright where there is one. It is a
    // whole dashboard rather than a set of extra metrics, and merging it *into*
    // a simulated one would keep the simulated range, the simulated status and
    // the simulated freshness beside real figures — which is §37's last line
    // read backwards.
    //
    // The development arm then contributes only what the certified route always
    // serves empty. In a release build there is no development arm and those
    // sections are absent, which is the correct rendering of "this deployment
    // computes no funnel for this content" — not a funnel of zeroes.
    const certifiedContent = contentQuery.data ?? null;
    const adapterBase = adapterQuery.data ?? null;

    const base: AnalyticsDataset | null = certifiedContent
      ? adapterBase
        ? {
            ...certifiedContent,
            breakdowns: adapterBase.breakdowns,
            funnels: adapterBase.funnels,
            insights: adapterBase.insights,
            leaderboards: adapterBase.leaderboards,
            retention: adapterBase.retention,
            // Not a gap. The figures on this dataset are the platform's, and
            // offering a register entry beside them would tell a reader to go
            // and read about a gap that has closed.
            gapKey: null,
          }
        : certifiedContent
      : adapterBase;

    if (!base) return null;

    const parts = [] as ReturnType<typeof fromCommunityStatistics>[];
    if (communityStatistics.data) {
      parts.push(fromCommunityStatistics(communityStatistics.data));
    }

    const certifiedMetrics = inventoryQuery.data?.metrics ?? [];

    // Nothing to compose. The adapter's own dataset is already complete.
    const composed =
      parts.length === 0 && certifiedMetrics.length === 0
        ? base
        : composeDataset({
            subject: query.subject,
            range: query.range,
            comparison: query.comparison ?? 'none',
            parts: [{ metrics: base.metrics, series: base.series, breakdowns: base.breakdowns, unmappedKeys: [] }, ...parts],
            certifiedMetrics,
            unavailableMetrics: [
              ...base.unavailableMetrics,
              ...(inventoryQuery.data?.unavailable ?? []),
            ],
            gapKey: base.gapKey,
            insights: base.insights,
            funnels: base.funnels,
            leaderboards: base.leaderboards,
            retention: base.retention,
          });

    const filtered = applyAccessRestrictions(composed, options.access);
    return applyFreshnessStatus(filtered, {
      isOnline,
      isFetching: adapterQuery.isFetching || contentQuery.isFetching,
    });
  }, [
    query,
    adapterQuery.data,
    adapterQuery.isFetching,
    contentQuery.data,
    contentQuery.isFetching,
    inventoryQuery.data,
    communityStatistics.data,
    options.access,
    isOnline,
  ]);

  const refetch = useCallback(() => {
    adapterQuery.refetch();
    if (wantsContent) contentQuery.refetch();
    if (wantsInventory) inventoryQuery.refetch();
    if (communityId) communityStatistics.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adapterQuery,
    contentQuery,
    inventoryQuery,
    communityStatistics,
    wantsContent,
    wantsInventory,
    communityId,
  ]);

  // An error is only an error where nothing answered. A certified route that
  // refused while the development arm answered — or the reverse, which is the
  // ordinary case in a release build for a subject with no certified route —
  // must not blank a screen that has a dataset to show. §37's `PARTIAL` is the
  // whole model here: one source being unreachable is a degradation, not a
  // failure.
  const isError = dataset === null && (adapterQuery.isError || contentQuery.isError);

  return {
    dataset,
    // A disabled query is never `isLoading`, so this reads as "whichever arm is
    // actually running has not answered yet" without a branch per build.
    isLoading: adapterQuery.isLoading || contentQuery.isLoading,
    isFetching: adapterQuery.isFetching || contentQuery.isFetching || inventoryQuery.isFetching,
    isError,
    error: ((contentQuery.error ?? adapterQuery.error) as FinancialError) ?? null,
    isSimulated: Boolean(dataset?.metrics.some((metric) => metric.value.source === 'simulated')),
    isEnabled: gapsEnabled,
    refetch,
  };
}

/**
 * Removes metrics the caller may not see.
 *
 * §46 and §73: a restricted metric is **omitted**, and its key moves to
 * `unavailableMetrics` so the UI can say something was withheld without saying
 * what it was. A zero would be a claim about the data; a blur would be a claim
 * about the member; absence is correct.
 *
 * Note this is defence in depth rather than the mechanism. The server is meant
 * to omit restricted metrics before they reach the device — §48 — and a client
 * that filtered a payload it should never have received would be hiding data
 * that is still in the cache and still in a debugger. This filter exists because
 * the *development adapter* returns everything, and because a backend bug should
 * degrade to a missing card rather than to a leak.
 */
function applyAccessRestrictions(
  dataset: AnalyticsDataset,
  access: AnalyticsAccess | null | undefined
): AnalyticsDataset {
  if (!access) return dataset;

  const withheld: AnalyticsMetricKey[] = [];

  const metrics = dataset.metrics.filter((metric) => {
    const definition = ANALYTICS_DEFINITIONS[metric.key];
    const privacyClass = definition?.privacyClass ?? metric.privacyClass;

    if (access.restrictedMetrics.includes(metric.key)) {
      withheld.push(metric.key);
      return false;
    }
    if (privacyClass === 'financial' && !access.canViewFinancial) {
      withheld.push(metric.key);
      return false;
    }
    if (privacyClass === 'administrative' && !access.canViewAdministrative) {
      withheld.push(metric.key);
      return false;
    }
    return true;
  });

  if (withheld.length === 0) return dataset;

  const withheldSet = new Set(withheld);

  return {
    ...dataset,
    metrics,
    // A chart of a metric the caller may not see is the same disclosure as the
    // number, so the series and breakdowns go with it.
    series: dataset.series.filter((entry) => !withheldSet.has(entry.key)),
    breakdowns: dataset.breakdowns.filter((entry) => !withheldSet.has(entry.metricKey)),
    unavailableMetrics: [...dataset.unavailableMetrics, ...withheld],
  };
}

/**
 * §54's status override.
 *
 * Marks a dataset `STALE` when the device is offline and the data has aged past
 * its own `validUntil`, or past a day where the freshness carries no promise.
 * `CACHED` while a refetch is in flight over a live connection — the numbers on
 * screen are real and are about to be replaced, which is worth saying quietly and
 * is not the same claim as `STALE`.
 *
 * The data is never hidden. §54 permits showing cached historical data offline;
 * what it forbids is presenting it as live, and the status is what stops that.
 */
function applyFreshnessStatus(
  dataset: AnalyticsDataset,
  context: { isOnline: boolean; isFetching: boolean }
): AnalyticsDataset {
  // A gap or an unavailable dataset already says something stronger than
  // "stale", and overwriting it would lose the more important statement.
  const isTerminalStatus: AnalyticsDataStatus[] = ['BACKEND_GAP', 'UNAVAILABLE'];
  if (isTerminalStatus.includes(dataset.status)) return dataset;

  const computedAt = Date.parse(dataset.freshness.computedAt);
  const validUntil = dataset.freshness.validUntil
    ? Date.parse(dataset.freshness.validUntil)
    : Number.isFinite(computedAt)
      ? computedAt + 24 * 60 * 60 * 1000
      : NaN;

  const isPastValidity = Number.isFinite(validUntil) && Date.now() > validUntil;

  if (!context.isOnline && isPastValidity) {
    return { ...dataset, status: 'STALE' };
  }

  if (!context.isOnline) {
    return { ...dataset, status: 'CACHED' };
  }

  if (context.isFetching && dataset.status === 'LIVE') {
    return { ...dataset, status: 'CACHED' };
  }

  return dataset;
}

// ═════════════════════════════════════════════════════════════════════════════
// FUNNEL, RETENTION, LEADERBOARD
// ═════════════════════════════════════════════════════════════════════════════

export function useAnalyticsFunnel(
  funnelKey: string | undefined,
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  options: { enabled?: boolean } = {}
) {
  const enabled = Boolean(funnelKey) && (options.enabled ?? true) && areAnalyticsGapsEnabled();

  const query = useQuery({
    queryKey: funnelKey
      ? analyticsKeys.funnel(funnelKey, subject, range)
      : ['analytics', 'funnel', 'none'],
    queryFn: ({ signal }) => gapApi.fetchAnalyticsFunnel(funnelKey!, subject, range, signal),
    enabled,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  return {
    funnel: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isSimulated: query.data?.source === 'simulated',
    isEnabled: areAnalyticsGapsEnabled(),
    refetch: query.refetch,
  };
}

export function useAnalyticsRetention(
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  options: { granularity?: 'day' | 'week' | 'month'; cohortCount?: number; enabled?: boolean } = {}
) {
  const granularity = options.granularity ?? 'week';
  const cohortCount = options.cohortCount ?? 8;
  const enabled = (options.enabled ?? true) && areAnalyticsGapsEnabled();

  const query = useQuery({
    queryKey: analyticsKeys.retention(subject, range, granularity, cohortCount),
    queryFn: ({ signal }) =>
      gapApi.fetchAnalyticsRetention(subject, range, granularity, cohortCount, signal),
    enabled,
    // A cohort table changes once a day at most.
    staleTime: 30 * 60_000,
    ...readOptions,
  });

  return {
    retention: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isSimulated: query.data?.source === 'simulated',
    isEnabled: areAnalyticsGapsEnabled(),
    refetch: query.refetch,
  };
}

export function useAnalyticsLeaderboard(
  leaderboardKey: string,
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  metricKey: AnalyticsMetricKey,
  options: { enabled?: boolean } = {}
) {
  const enabled = (options.enabled ?? true) && areAnalyticsGapsEnabled();

  const query = useQuery({
    queryKey: analyticsKeys.leaderboard(leaderboardKey, subject, range, metricKey),
    queryFn: ({ signal }) =>
      gapApi.fetchAnalyticsLeaderboard(leaderboardKey, subject, range, metricKey, signal),
    enabled,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  return {
    leaderboard: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// WALLET — the certified arm, and §5's `client-derived` case
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Real wallet activity for a period.
 *
 * Reads B15's real ledger through the certified financial client and sums it on
 * the device. Every metric it produces is `backend`-sourced and `client-derived`
 * — the records are the platform's, the arithmetic is this phone's — and the UI
 * says both. There is no gap notice on this data because it is not simulated.
 *
 * `walletId` is required rather than resolved here, so a member with two wallets
 * gets two calls and two clearly-labelled sections rather than one figure that
 * silently covers a third of their activity.
 */
export function useWalletAnalytics(
  walletId: string | undefined,
  range: AnalyticsTimeRange,
  options: { enabled?: boolean } = {}
) {
  const enabled = Boolean(walletId) && (options.enabled ?? true);

  const query = useQuery({
    queryKey: ['analytics', 'wallet', walletId ?? 'none', range.from, range.to, range.timezone] as const,
    queryFn: () => certifiedApi.fetchWalletActivity(walletId!, range),
    enabled,
    // The ledger is live. A minute is enough to stop a tab switch re-paging it.
    staleTime: 60_000,
    ...readOptions,
  });

  const metricsFor = useCallback(
    (currency: string): AnalyticsMetric[] =>
      query.data ? certifiedApi.walletMetricsFor(query.data, currency) : [],
    [query.data]
  );

  return {
    aggregate: query.data ?? null,
    /** Currencies the member actually transacted in. Never assumed — §57. */
    // The trailing `?? []` covers a missing response; this one covers a response
    // whose `totals` is absent, which the type says cannot happen and which took
    // the Home screen down after sign-in. See `lib/community/scope.ts`.
    currencies: (query.data?.totals ?? []).map((entry) => entry.currency),
    metricsFor,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    /** True where the page cap stopped the walk. §51, and GAP-018. */
    isTruncated: Boolean(query.data?.isTruncated),
    refetch: query.refetch,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT — GAP-026
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Requests an export and polls it to a terminal state.
 *
 * The polling is bounded — `MAX_POLLS` — and the interval is fixed rather than
 * exponential. An export is a job somebody is waiting on with the screen open;
 * backing off to thirty seconds would make a ten-second job feel like a broken
 * one. Bounded, because a job stuck in `running` for ever must eventually render
 * as a failure rather than as a spinner nobody ever dismisses.
 */
const EXPORT_POLL_MS = 1_500;
const MAX_EXPORT_POLLS = 40;

export function useAnalyticsExport() {
  const [exportId, setExportId] = useState<string | null>(null);
  const pollCount = useRef(0);

  const request = useMutation({
    ...mutationOptions,
    mutationFn: ({ query, format }: { query: AnalyticsQuery; format: AnalyticsExportFormat }) =>
      gapApi.requestAnalyticsExport(query, format),
    onSuccess: (job) => {
      pollCount.current = 0;
      setExportId(job.exportId);
    },
  });

  const job = useQuery({
    queryKey: exportId ? analyticsKeys.exportJob(exportId) : ['analytics', 'export', 'none'],
    queryFn: ({ signal }) => gapApi.fetchAnalyticsExport(exportId!, signal),
    enabled: Boolean(exportId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'ready' || status === 'failed' || status === 'expired') return false;
      if (pollCount.current >= MAX_EXPORT_POLLS) return false;
      pollCount.current += 1;
      return EXPORT_POLL_MS;
    },
    ...readOptions,
  });

  const reset = useCallback(() => {
    pollCount.current = 0;
    setExportId(null);
    request.reset();
  }, [request]);

  const hasGivenUp =
    pollCount.current >= MAX_EXPORT_POLLS &&
    job.data?.status !== 'ready' &&
    job.data?.status !== 'failed';

  return {
    request: request.mutate,
    isRequesting: request.isPending,
    requestError: (request.error as FinancialError) ?? null,
    job: job.data ?? null,
    isPolling: Boolean(exportId) && job.data?.status !== 'ready' && job.data?.status !== 'failed',
    /** True where polling gave up. Rendered as a failure, never as a spinner. */
    hasTimedOut: hasGivenUp,
    reset,
    isEnabled: areAnalyticsGapsEnabled(),
    gapKey: ANALYTICS_GAPS.analyticsExport.key,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORTS — GAP-027
// ═════════════════════════════════════════════════════════════════════════════

export function useAnalyticsReports(scope: 'mine' | 'shared' | 'favorites' = 'mine') {
  const enabled = areAnalyticsGapsEnabled();

  const query = useQuery({
    queryKey: analyticsKeys.reports(scope),
    queryFn: ({ signal }) => gapApi.fetchAnalyticsReports(scope, signal),
    enabled,
    staleTime: 60_000,
    ...readOptions,
  });

  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isEnabled: enabled,
    refetch: query.refetch,
  };
}

export function useAnalyticsReport(reportId: string | undefined) {
  const enabled = Boolean(reportId) && areAnalyticsGapsEnabled();

  const query = useQuery({
    queryKey: reportId ? analyticsKeys.report(reportId) : ['analytics', 'report', 'none'],
    queryFn: ({ signal }) => gapApi.fetchAnalyticsReport(reportId!, signal),
    enabled,
    staleTime: 60_000,
    ...readOptions,
  });

  return {
    report: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    isEnabled: areAnalyticsGapsEnabled(),
    refetch: query.refetch,
  };
}

/**
 * Report mutations.
 *
 * All three invalidate every report list rather than patching the cache. A
 * report's `updatedAt` and its position in a list are the server's to decide, and
 * an optimistic reorder that disagreed would resolve itself on the next fetch —
 * visibly, as a jump.
 */
export function useReportMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['analytics', 'reports'] });
  };

  const create = useMutation({
    ...mutationOptions,
    mutationFn: (input: gapApi.SaveReportInput) => gapApi.createAnalyticsReport(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    ...mutationOptions,
    mutationFn: ({
      reportId,
      input,
    }: {
      reportId: string;
      input: Partial<gapApi.SaveReportInput> & { isFavorite?: boolean };
    }) => gapApi.updateAnalyticsReport(reportId, input),
    onSuccess: (report) => {
      queryClient.setQueryData(analyticsKeys.report(report.reportId), report);
      invalidate();
    },
  });

  const remove = useMutation({
    ...mutationOptions,
    mutationFn: (reportId: string) => gapApi.deleteAnalyticsReport(reportId),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITION HELPER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The whole of a dashboard's data, in one call.
 *
 * Access, controls and dataset are needed together by every screen, and wiring
 * them separately in twenty screens is twenty chances to forget that the range
 * depends on the capability set's reporting timezone. This composes them in the
 * right order: access first, its timezone feeds the range, the range feeds the
 * query, and the query is not made at all until the capability says it may be.
 */
export function useAnalyticsDashboard(input: {
  subject: AnalyticsSubject;
  metrics?: AnalyticsMetricKey[];
  breakdowns?: AnalyticsQuery['breakdowns'];
  includeSeries?: boolean;
  initialPreset?: AnalyticsRangePreset;
  communityScopeToken?: string | null;
  now?: Date;
}) {
  const access = useAnalyticsAccess(input.subject);

  const controls = useAnalyticsControls({
    initialPreset: input.initialPreset,
    reportingTimezone: access.access.reportingTimezone,
    now: input.now,
  });

  const query = useMemo<AnalyticsQuery>(
    () => ({
      subject: input.subject,
      metrics: input.metrics,
      range: controls.range,
      granularity: controls.granularity,
      comparison: controls.comparison,
      filters: controls.filters,
      breakdowns: input.breakdowns,
      includeSeries: input.includeSeries ?? true,
      communityScopeToken: input.communityScopeToken ?? null,
    }),
    [
      input.subject,
      input.metrics,
      input.breakdowns,
      input.includeSeries,
      input.communityScopeToken,
      controls.range,
      controls.granularity,
      controls.comparison,
      controls.filters,
    ]
  );

  // The request is not made until the server says the caller may see it. §48:
  // a dashboard that fetched first and hid later would have the data on the
  // device, where anybody with a debugger can read it.
  const dataset = useAnalyticsDataset(query, {
    enabled: access.access.canView,
    access: access.access,
  });

  return { access, controls, query, ...dataset };
}

/**
 * Resolves the timezone a dashboard reports in, for screens that need it before
 * they have a range.
 */
export function useReportingTimezone(reportingTimezone?: string | null) {
  return useMemo(() => resolveReportingTimezone(reportingTimezone), [reportingTimezone]);
}

/**
 * Prefetches a dashboard.
 *
 * §51 asks for prefetching "where appropriate", and the appropriate place is
 * narrow: the analytics hub knows which dashboards the member can open and can
 * warm the one they are most likely to tap. Prefetching all of them would be the
 * "fetch every dataset when the dashboard opens" §51 forbids, so this takes one
 * query and is called deliberately.
 */
export function usePrefetchAnalytics() {
  const queryClient = useQueryClient();

  return useCallback(
    (query: AnalyticsQuery) => {
      if (!areAnalyticsGapsEnabled()) return;
      queryClient.prefetchQuery({
        queryKey: analyticsKeys.dataset(query),
        queryFn: ({ signal }) => gapApi.fetchAnalyticsDataset(query, signal),
        staleTime: DATASET_STALE_MS,
      });
    },
    [queryClient]
  );
}

/**
 * Invalidates analytics when the active community changes.
 *
 * A named list rather than `queryClient.clear()` — see
 * `analyticsKeysInvalidatedByCommunitySwitch`. Exposed as a hook so a screen or
 * the community context store can call it at the moment of the switch.
 */
export function useInvalidateAnalyticsOnCommunitySwitch() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['analytics', 'dataset'] });
    queryClient.invalidateQueries({ queryKey: ['analytics', 'access'] });
    queryClient.invalidateQueries({ queryKey: ['analytics', 'insights'] });
  }, [queryClient]);
}

/** Re-exported so a screen imports its visualization type from one place. */
export type { AnalyticsVisualization, AnalyticsReport };

/** Signals that a dashboard should offer to save its query as a report. */
export function useCanBuildReports(access: AnalyticsAccess | null | undefined): boolean {
  return Boolean(access?.canBuildReports);
}

/** Keeps the export polling counter honest across unmounts. */
export function useResetExportOnUnmount(reset: () => void) {
  useEffect(() => reset, [reset]);
}
