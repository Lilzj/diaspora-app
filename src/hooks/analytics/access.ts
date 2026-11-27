// Analytics hooks: access. ./index.ts is the overview of the whole module.

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as certifiedApi from '@/lib/api/analytics-api';
import { areAnalyticsGapsEnabled } from '@/config/analytics-gaps';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import { noAnalyticsAccess } from '@/lib/analytics/access';
import type { AnalyticsAccess, AnalyticsSubject } from '@/types/analytics';
import { readOptions } from './shared';

/** A capability must stop being effective quickly after it is revoked. */
const ACCESS_STALE_MS = 60_000;

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
  // ── The platform's answer, in every build ─────────────────────────────────
  //
  // `GET /api/v1/analytics/access` is real. Development builds used to read a
  // simulated capability set instead, because the server hardcoded
  // `canExport` and `canBuildReports` to false and the simulated export and
  // report surfaces would otherwise have disappeared. Since 20 Oct 2026 both
  // are served for real and the server reports them where the caller can view,
  // so a test build now shows exactly the capabilities production does.

  // Country, organization and neighbourhood dashboards read routes outside the
  // Analytics module, and `/analytics/access` refuses all three whatever those
  // routes would answer. Their access comes from the place arm, which asks the
  // platform the way each route decides (20 Oct 2026). In every build: the
  // datasets are real in every build.
  const isPlace = certifiedApi.isCertifiedPlaceSubject(subject);

  const query = useQuery({
    queryKey: analyticsKeys.access(subject),
    queryFn: ({ signal }) =>
      isPlace
        ? certifiedApi.fetchPlaceAnalyticsAccess(subject, signal)
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
    void queryClient.invalidateQueries({ queryKey: analyticsKeys.datasetAll() });
    void queryClient.invalidateQueries({ queryKey: analyticsKeys.accessAll() });
    void queryClient.invalidateQueries({ queryKey: analyticsKeys.insightsAll() });
  }, [queryClient]);
}
