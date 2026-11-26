// Creator economy hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { shouldRetryQuery } from '@/lib/transport/financial-errors';

// ─────────────────────────────────────────────────────────────────────────────
// Shared query options
// ─────────────────────────────────────────────────────────────────────────────

/** Reference data — the Academy catalogue, point rules — is stable for an hour. */
export const REFERENCE_STALE_MS = 60 * 60 * 1000;

/** Analytics is recomputed on a schedule, never live. */
export const ANALYTICS_STALE_MS = 5 * 60 * 1000;

/** Anything with a state machine attached: never served from a stale cache. */
export const LIVE_STALE_MS = 0;

export const readOptions = { retry: shouldRetryQuery, staleTime: 30_000 } as const;

export const mutationOptions = { retry: 0 } as const;
