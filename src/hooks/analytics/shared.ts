// Analytics hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { shouldRetryQuery } from '@/lib/transport/financial-errors';

/** A dataset is a nightly rollup. Refetching it every thirty seconds is waste. */
export const DATASET_STALE_MS = 5 * 60_000;

export const readOptions = { retry: shouldRetryQuery } as const;
