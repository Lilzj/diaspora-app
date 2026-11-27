// Analytics hooks: definitions. ./index.ts is the overview of the whole module.

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as certifiedApi from '@/lib/api/analytics-api';
import { type FinancialError } from '@/lib/transport/financial-errors';
import { analyticsKeys } from '@/lib/analytics/query-keys';
import { allAnalyticsDefinitions } from '@/lib/analytics/definitions';
import {
  defaultGranularity,
  resolveRange,
  type ResolveRangeOptions,
} from '@/lib/analytics/time-range';
import type {
  AnalyticsComparisonBasis,
  AnalyticsDefinition,
  AnalyticsFilter,
  AnalyticsGranularity,
  AnalyticsRangePreset,
  AnalyticsTimeRange,
} from '@/types/analytics';
import { readOptions } from './shared';

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
