// Trust hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { type QueryClient } from '@tanstack/react-query';
import { trustErrorMessage, trustKeys } from '@/lib/api/trust-api';

// ── Shared plumbing ──────────────────────────────────────────────────────────

/**
 * A 401, 403 or 404 from this module is final. A **429 is too**, and that is
 * the one worth stating.
 *
 * The module's budget is ten requests a minute across every route. Retrying a
 * 429 spends the next permit on the retry, which is how a screen that was one
 * request over its budget becomes a screen that cannot load at all. The member
 * is told to wait instead.
 */
export function shouldRetry(failureCount: number, cause: unknown): boolean {
  const httpStatus = (cause as { response?: { status?: number } })?.response?.status;
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404 || httpStatus === 429) {
    return false;
  }
  return failureCount < 1;
}

/** A sentence for the member, or null. */
export function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? trustErrorMessage(query.error) : null;
}

/**
 * How long a trust read stays fresh.
 *
 * Five minutes for the member's own standing. A verification review has a
 * 24-hour SLA at its fastest, so a five-minute-old answer is not stale in any
 * sense a member would notice — and re-asking costs a tenth of the module's
 * per-minute budget.
 */
export const SELF_STALE_MS = 5 * 60 * 1000;

/** Two minutes for staff queues, which do move while somebody is working them. */
export const QUEUE_STALE_MS = 2 * 60 * 1000;

/** Every verification list and the queue. */
export function invalidateVerifications(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: trustKeys.verifications() });
}
