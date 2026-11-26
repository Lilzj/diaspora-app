// Community Life hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import type { CommunityPage } from '@/types/community-advanced';

// ─────────────────────────────────────────────────────────────────────────────
// Shared query options
// ─────────────────────────────────────────────────────────────────────────────

/** Catalogue-shaped data — tiers, causes, categories — is stable for an hour. */
export const REFERENCE_STALE_MS = 60 * 60 * 1000;

/** Discovery lists change as people publish. A minute is plenty. */
export const DISCOVERY_STALE_MS = 60 * 1000;

/** Analytics is recomputed on a schedule, never live. */
export const ANALYTICS_STALE_MS = 5 * 60 * 1000;

/** Anything with a state machine attached: never served from a stale cache. */
export const LIVE_STALE_MS = 0;

export const readOptions = { retry: shouldRetryQuery, staleTime: 30_000 } as const;

export const mutationOptions = { retry: 0 } as const;

/**
 * How often a live figure is re-read where no realtime channel exists.
 *
 * COMMUNITY-LIFE-GAP-020: B13.2's transport carries conversations only, so
 * campaign progress and poll results are *periodic* rather than live. Thirty
 * seconds is frequent enough that a member watching a campaign sees movement
 * and infrequent enough that a hundred viewers do not become a load problem.
 * The screens say "updated periodically" rather than implying a live feed.
 */
export const PROGRESS_POLL_MS = 30_000;

/** The shape every gap-backed read hook returns. Consistent so screens are too. */
interface GapRead<T> {
  data: T;
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
  /** Always true for a purely gap-backed read. Screens mark accordingly. */
  isSimulated: boolean;
  isEnabled: boolean;
}

function gapRead<T>(
  query: {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  },
  fallback: T,
  enabled: boolean
): GapRead<T> {
  return {
    data: query.data ?? fallback,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: () => void query.refetch(),
    isSimulated: true,
    isEnabled: enabled,
  };
}

/**
 * The same envelope as `gapRead`, for a read that a certified contract answers.
 *
 * Two differences, and both are the point. `isSimulated` is **false**, so the
 * screen stops drawing the gap notice over data that is now real. And
 * `isEnabled` is unconditionally true, because a backend-served read does not
 * depend on `areCommunityGapsEnabled()` — the whole reason for that switch was
 * to keep simulated records out of a release binary, and there is nothing
 * simulated left on these paths to keep out.
 */
export function backendRead<T>(
  query: {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  },
  fallback: T
): GapRead<T> {
  return {
    data: query.data ?? fallback,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: () => void query.refetch(),
    isSimulated: false,
    isEnabled: true,
  };
}

/**
 * A stable string for a params object, so a query key does not churn.
 *
 * Takes `object` rather than an index signature so a plain interface — which is
 * every params type in this phase — can be passed without a cast. Undefined,
 * null and empty values are dropped and the rest sorted, so `{a:1, b:2}` and
 * `{b:2, a:1}` produce one cache entry rather than two.
 */
export function fingerprint(params: object): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');
}

const emptyPage = <T,>(): CommunityPage<T> => ({ items: [], hasMore: false, nextCursor: null });
