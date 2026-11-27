// Analytics hooks: dataset. ./index.ts is the overview of the whole module.

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as certifiedApi from '@/lib/api/analytics-api';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { useConnectivityStore } from '@/lib/platform/connectivity';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import { composeDataset, fromCommunityStatistics } from '@/lib/analytics/adapters';
import { ANALYTICS_DEFINITIONS } from '@/lib/analytics/definitions';
import { useCommunityStatistics } from '../communities';
import type {
  AnalyticsAccess,
  AnalyticsDataStatus,
  AnalyticsDataset,
  AnalyticsMetricKey,
  AnalyticsQuery,
} from '@/types/analytics';
import { DATASET_STALE_MS, readOptions } from './shared';

/** A live count is live. A short stale time keeps it feeling that way. */
const INVENTORY_STALE_MS = 10 * 60_000;

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
// Not 'neighborhood' since 14 Oct 2026: its inventory read a retired catalogue route.
const INVENTORY_SUBJECTS = new Set(['platform', 'country']);

/**
 * The dataset for a query.
 *
 * **Every subject has a served dataset, so there is no development arm.** Until
 * 20 Oct 2026 a simulated `/analytics-gap/v0` dataset was fetched in development
 * and preview builds and its breakdowns, funnels, insights, leaderboards and
 * retention grid were folded into the real one — so a test build showed
 * sections production never had. The certified dataset is now the whole
 * dashboard in every build:
 *
 *   content items      `GET /analytics/content/{type}/{id}`
 *   owners             `GET /analytics/{sellers|landlords|employers|providers|creators}/me`,
 *                      `/analytics/platform`, `/analytics/communities/{id}`
 *   fundraising        `GET /analytics/campaigns/{id}`
 *   places             country, organisation and neighbourhood (see `fetchPlaceAnalytics`)
 *
 * Insights are their own route (`GET /analytics/insights`) and are added where
 * the platform states any; an empty list leaves the section absent. What a
 * route cannot count arrives in `unavailableMetrics` and is shown as not
 * counted, never as zero.
 */
export function useAnalyticsDataset(
  query: AnalyticsQuery | null,
  options: { enabled?: boolean; access?: AnalyticsAccess | null } = {}
): AnalyticsDatasetResult {
  const isOnline = useConnectivityStore((state) => state.isOnline);

  const wanted = Boolean(query) && (options.enabled ?? true);

  // ── The certified per-item dataset ────────────────────────────────────────
  //
  // Enabled on `wanted`: it is a real route and does not depend on the gap
  // switch. `isCertifiedContentSubject` is the gate, and it is deliberately
  // narrow — a subject type the server's `AnalyticsContentTypes.FromRouteSegment`
  // does not accept would earn `analytics.subject.unsupported`.
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

  // ── The certified owner datasets ──────────────────────────────────────────
  //
  // A seller's `GET /analytics/sellers/me`, a landlord's
  // `GET /analytics/landlords/me`, an employer's `GET /analytics/employers/me` and
  // a provider's `GET /analytics/providers/me`, since 13 Sep 2026. Gated on
  // `wanted`, never on the gap switch (`areAnalyticsGapsEnabled()` is false in
  // every release build). The inventory arm below shipped that exact defect once,
  // and the seller dashboard read the development adapter for months because of it.
  //
  // `wanted` already carries `access.canView`, and `/analytics/access` only says
  // yes to an owner subject whose id is the caller — so this is never asked on
  // somebody else's behalf, and the routes have no id to change.
  const wantsOwner = Boolean(query) && certifiedApi.isCertifiedOwnerSubject(query!.subject);

  const ownerQuery = useQuery({
    queryKey: query
      ? [...analyticsKeys.dataset(query), 'certified-owner']
      : ['analytics', 'dataset', 'none', 'certified-owner'],
    queryFn: ({ signal }) =>
      certifiedApi.fetchOwnerAnalytics(
        query!.subject,
        query!.range,
        query!.includeSeries ?? true,
        signal
      ),
    enabled: wanted && wantsOwner,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  // ── The certified place datasets ──────────────────────────────────────────
  //
  // A country's `GET /intelligence/countries/{cc}/analytics`, an organisation's
  // `GET /communities/organizations/{id}/analytics` (+ `/members`), and a
  // neighbourhood composed from `GET /geo/area` and
  // `GET /community-life/area/activity` (20 Oct 2026). Each was served with no
  // client arm, so these three dashboards drew nothing outside a simulation
  // build. Gated on `wanted`, never on the gap switch.
  const wantsPlace = Boolean(query) && certifiedApi.isCertifiedPlaceSubject(query!.subject);

  const placeQuery = useQuery({
    queryKey: query
      ? [...analyticsKeys.dataset(query), 'certified-place']
      : ['analytics', 'dataset', 'none', 'certified-place'],
    queryFn: ({ signal }) => certifiedApi.fetchPlaceAnalytics(query!.subject, query!.range, signal),
    enabled: wanted && wantsPlace,
    staleTime: DATASET_STALE_MS,
    ...readOptions,
  });

  // ── Insights — `GET /analytics/insights` (20 Oct 2026) ────────────────────
  //
  // Statements computed from counted figures, each with the figures it rests
  // on. Asked only for the subjects the route resolves; an empty list is the
  // ordinary answer and leaves the section absent. A failed read leaves it
  // absent too — it never blanks the dashboard, and nothing says "no insights"
  // about a list that did not arrive.
  const wantsInsights = Boolean(query) && certifiedApi.hasServedInsights(query!.subject);

  const insightsQuery = useQuery({
    queryKey: query
      ? analyticsKeys.insights(query.subject, query.range)
      : ['analytics', 'insights', 'none'],
    queryFn: ({ signal }) => certifiedApi.fetchAnalyticsInsights(query!.subject, query!.range, signal),
    enabled: wanted && wantsInsights,
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
      certifiedApi.fetchInventoryCounts(
        {
          countryCode: query!.subject.type === 'country' ? query!.subject.id : undefined,
        },
        signal
      ),

    // `wanted`, never the gap switch. `areAnalyticsGapsEnabled()` is false in
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
  //
  // Only until the certified community dataset answers. That route
  // (`GET /analytics/communities/{id}`, 20 Oct 2026) is the dashboard for the
  // people who run the community, over the dashboard's own range; folding a
  // fixed 30-day snapshot into it would put a second, differently-windowed
  // figure under the same name. For anybody the dataset refuses (a 404 — it is
  // for the community's moderators and administrators), the statistics the
  // community publishes are still what there is to show.
  const communityId = query?.subject.type === 'community' ? query.subject.id ?? undefined : undefined;
  const communityStatistics = useCommunityStatistics(communityId, '30d');
  const certifiedCommunityAnswered = communityId !== undefined && Boolean(ownerQuery.data);

  const dataset = useMemo<AnalyticsDataset | null>(() => {
    if (!query) return null;

    // A subject is a content item, an owner (seller, landlord, employer,
    // provider, creator, the platform, a community, a fundraising campaign) or
    // a place — never more than one — so at most one of these answers.
    const certified = contentQuery.data ?? ownerQuery.data ?? placeQuery.data ?? null;

    const base: AnalyticsDataset | null = certified
      ? { ...certified, insights: insightsQuery.data ?? certified.insights }
      : null;

    // A member who does not run a community is refused its dataset (404) and
    // sees the statistics the community publishes (Phase 13, a real route)
    // instead — composed on their own, never on top of anything simulated.
    const parts = [] as ReturnType<typeof fromCommunityStatistics>[];
    if (communityStatistics.data && !certifiedCommunityAnswered) {
      parts.push(fromCommunityStatistics(communityStatistics.data));
    }

    if (!base && parts.length === 0) return null;

    const certifiedMetrics = base ? inventoryQuery.data?.metrics ?? [] : [];

    // Nothing to compose: the served dataset is already complete.
    const composed =
      base && parts.length === 0 && certifiedMetrics.length === 0
        ? base
        : composeDataset({
            subject: query.subject,
            range: query.range,
            comparison: query.comparison ?? 'none',
            parts: [
              ...(base
                ? [{ metrics: base.metrics, series: base.series, breakdowns: base.breakdowns, unmappedKeys: [] }]
                : []),
              ...parts,
            ],
            certifiedMetrics,
            unavailableMetrics: [
              ...(base?.unavailableMetrics ?? []),
              ...(base ? inventoryQuery.data?.unavailable ?? [] : []),
            ],
            gapKey: null,
            insights: base?.insights,
            funnels: base?.funnels,
            leaderboards: base?.leaderboards,
            retention: base?.retention,
          });

    const filtered = applyAccessRestrictions(composed, options.access);
    return applyFreshnessStatus(filtered, {
      isOnline,
      isFetching: contentQuery.isFetching || ownerQuery.isFetching || placeQuery.isFetching,
    });
  }, [
    query,
    contentQuery.data,
    contentQuery.isFetching,
    ownerQuery.data,
    ownerQuery.isFetching,
    placeQuery.data,
    placeQuery.isFetching,
    insightsQuery.data,
    inventoryQuery.data,
    communityStatistics.data,
    certifiedCommunityAnswered,
    options.access,
    isOnline,
  ]);

  const refetch = useCallback(() => {
    if (wantsContent) void contentQuery.refetch();
    if (wantsOwner) void ownerQuery.refetch();
    if (wantsPlace) void placeQuery.refetch();
    if (wantsInsights) void insightsQuery.refetch();
    if (wantsInventory) void inventoryQuery.refetch();
    if (communityId) void communityStatistics.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contentQuery,
    ownerQuery,
    placeQuery,
    insightsQuery,
    inventoryQuery,
    communityStatistics,
    wantsContent,
    wantsOwner,
    wantsPlace,
    wantsInsights,
    wantsInventory,
    communityId,
  ]);

  // An error is only an error where nothing answered. A certified route that
  // refused while the development arm answered — or the reverse, which is the
  // ordinary case in a release build for a subject with no certified route —
  // must not blank a screen that has a dataset to show. §37's `PARTIAL` is the
  // whole model here: one source being unreachable is a degradation, not a
  // failure.
  // The owner arm counts. Without it a release build — where the adapter never
  // runs — would read a failed owner request as "no dataset, not
  // loading, not an error", and the screen would say there is nothing to show
  // about figures that simply did not arrive. Unanswered is not none.
  const isError =
    dataset === null && (contentQuery.isError || ownerQuery.isError || placeQuery.isError);

  return {
    dataset,
    // A disabled query is never `isLoading`, so this reads as "whichever arm is
    // actually running has not answered yet" without a branch per build.
    isLoading: contentQuery.isLoading || ownerQuery.isLoading || placeQuery.isLoading,
    isFetching:
      contentQuery.isFetching ||
      ownerQuery.isFetching ||
      placeQuery.isFetching ||
      inventoryQuery.isFetching,
    isError,
    error:
      ((contentQuery.error ?? ownerQuery.error ?? placeQuery.error) as FinancialError) ?? null,
    isSimulated: Boolean(dataset?.metrics.some((metric) => metric.value.source === 'simulated')),
    // Every subject with an id (and the platform) has a served dataset.
    isEnabled: wantsContent || wantsOwner || wantsPlace,
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
