// Community social hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { type QueryClient } from '@tanstack/react-query';
import { communityErrorMessage, communitySocialKeys } from '@/lib/api/community-social-api';

/**
 * A 401 from this module is "sign in", not "try again".
 *
 * Three attempts to be told the same thing is three round trips and a spinner
 * that resolves into an error for a member whose actual problem is that they are
 * signed out. A 404 is equally final — the post is gone.
 */
export function shouldRetry(failureCount: number, cause: unknown): boolean {
  const httpStatus = (cause as { response?: { status?: number } })?.response?.status;
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) return false;
  return failureCount < 1;
}

/** A sentence for the member, or null. */
export function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? communityErrorMessage(query.error) : null;
}

// ── Invalidation ─────────────────────────────────────────────────────────────
//
// Two helpers rather than a hand-written list at each mutation, because getting
// this wrong is invisible: a member's own new post that does not appear in the
// feed they posted it from looks like the post failed.

/** Every feed, whatever its key or filters. A new or removed post changes all of them. */
export function invalidateFeeds(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: communitySocialKeys.feeds() });
}

/** One post, its revisions, and every feed that could be showing it. */
export function invalidatePost(client: QueryClient, postId: string): void {
  void client.invalidateQueries({ queryKey: communitySocialKeys.post(postId) });
  invalidateFeeds(client);
}
