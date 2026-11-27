// Financial hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { shouldRetryQuery } from '@/lib/transport/financial-errors';

// ─────────────────────────────────────────────────────────────────────────────
// Cache policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long a balance may be shown without re-asking.
 *
 * Thirty seconds. Long enough that moving between wallet tabs does not refetch
 * on every push; short enough that a member who has just been paid sees it
 * without pulling to refresh. Anything longer and the screen is quoting a
 * number that a payment made on another device has already changed.
 */
const BALANCE_STALE_MS = 30_000;

/** Catalogue prices can change under a repricing policy. Five minutes. */
export const CATALOG_STALE_MS = 5 * 60 * 1000;

export const readOptions = {
  retry: shouldRetryQuery,
  staleTime: BALANCE_STALE_MS,
} as const;

/** Mutations never retry. See the header. */
export const mutationOptions = { retry: 0 } as const;
