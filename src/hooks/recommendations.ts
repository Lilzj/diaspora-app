// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Recommendations hooks (Remediation Wave D-1)
//
// The stable interface over `lib/recommendations-api.ts`. The Home tab calls
// `useHomeFeed()` and receives an ordered list of sections; it never builds a
// query key, never decides a retry policy and never sends a feedback body.
//
// ── Why there is no infinite query here ──────────────────────────────────────
//
// `GET /recommendations/feed` takes one parameter, `country`. No cursor, no
// page, no limit. The feed is the whole feed, and a `useInfiniteQuery` over it
// would be a paging control for a route with no paging — which is worse than an
// absent feature, because it looks like one that works until the second page
// returns the first one again.
//
// ── Why dismissal is optimistic and refetch is not ───────────────────────────
//
// `POST /recommendations/dismiss` suppresses an item for ninety days, but it
// does *not* regenerate the feed: the same response is still cached server-side
// for the rest of its window, so an immediate refetch would bring the dismissed
// item straight back and undo the member's action in front of them. The item is
// therefore removed from the cached feed on this device, and the next natural
// refresh gets the server's own version.
//
// This is the one place where writing the cache rather than invalidating it is
// the correct behaviour, and it is that way because of what the server does, not
// because it is faster.
//
// ── The retry policy, and why it is not the default ──────────────────────────
//
// A 401 from this module is "sign in", not "try again" — no route here is
// decorated with `.RequireAuthorization()`, so the pipeline behaviour throws and
// the platform writes a bare 401 with no challenge header. TanStack's default
// three attempts would be three round trips to receive the same answer, then a
// spinner resolving into an error for a member whose actual problem is that they
// are signed out.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchHomeFeed,
  feedErrorMessage,
  isSignedOutError,
  recommendationKeys,
  recordBookmark,
  recordClick,
  recordDismiss,
  recordView,
  type FeedbackInput,
} from '@/lib/recommendations-api';
import { getActiveLocation, useLocationStore } from '@/store/location';
import type {
  FeedSection,
  HomeFeed,
  Recommendation,
  RecommendationFeedbackResult,
} from '@/types/recommendations';

/**
 * The country the feed should be built for.
 *
 * The location switcher's active country rather than the profile's, because a
 * member who has switched to Mauritius is asking to see Mauritius and the server
 * has no way to know that — `country` is the only signal `/feed` accepts from
 * the client.
 */
export function useFeedCountry(): string {
  const store = useLocationStore();
  return getActiveLocation(store).countryCode;
}

export interface UseHomeFeedResult {
  feed: HomeFeed | null;
  sections: FeedSection[];
  isLoading: boolean;
  isRefreshing: boolean;
  /** True once the request has settled and the server sent no sections at all. */
  isEmpty: boolean;
  /** A sentence for the member, or null. */
  error: string | null;
  /** Whether the failure is "you are signed out" rather than a broken request. */
  isSignedOut: boolean;
  refresh: () => void;
}

/**
 * The Home tab's data.
 *
 * `sections` is returned already flattened out of the query so a screen renders
 * `sections.map(...)` in the order the server sent, which is the order it means.
 * Nothing here reorders, pads or fills a missing section — a section the server
 * dropped is one that did not have enough to show.
 */
export function useHomeFeed(countryOverride?: string | null): UseHomeFeedResult {
  const activeCountry = useFeedCountry();
  const country = countryOverride ?? activeCountry;

  const query = useQuery({
    queryKey: recommendationKeys.feed(country),
    queryFn: () => fetchHomeFeed(country),
    // Two minutes. The server caches a member's feed for its own window and the
    // content underneath moves in hours, not seconds; re-requesting on every tab
    // focus would be a request per glance for an answer that has not changed.
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, cause) => {
      // Signed out is a final answer. Retrying it delays the one useful thing
      // the screen can say.
      if (isSignedOutError(cause)) return false;
      return failureCount < 1;
    },
  });

  const feed = query.data ?? null;

  return useMemo(
    () => ({
      feed,
      sections: feed?.sections ?? [],
      isLoading: query.isLoading,
      isRefreshing: query.isFetching && !query.isLoading,
      // Settled, successful and genuinely empty. Deliberately not true while
      // loading and not true on failure: an empty feed and a failed feed need
      // different words, and a fixture is not the answer to either.
      isEmpty: query.isSuccess && (feed?.sections.length ?? 0) === 0,
      error: query.isError ? feedErrorMessage(query.error) : null,
      isSignedOut: query.isError && isSignedOutError(query.error),
      refresh: () => void query.refetch(),
    }),
    [feed, query]
  );
}

/**
 * Removes one item from the feed already in the cache.
 *
 * A section left with no items is dropped rather than rendered empty — which is
 * what the server itself does when a section falls under its minimum, so the
 * screen behaves the same way whether the removal happened here or upstream.
 */
export function withoutRecommendation(feed: HomeFeed, targetId: string): HomeFeed {
  const sections = feed.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.targetId !== targetId),
    }))
    .filter((section) => section.items.length > 0);

  return { ...feed, sections };
}

export interface UseRecommendationFeedbackResult {
  /** "Not interested." Removes the item locally; the server suppresses it for 90 days. */
  dismiss: (input: FeedbackInput) => Promise<RecommendationFeedbackResult | null>;
  /** A tap. De-duplicated server-side in a five-minute window. */
  click: (input: FeedbackInput) => void;
  /** An impression. De-duplicated server-side in a five-minute window. */
  view: (input: FeedbackInput) => void;
  bookmark: (input: FeedbackInput) => Promise<RecommendationFeedbackResult | null>;
  isDismissing: boolean;
}

/**
 * The five feedback verbs, as a screen wants them.
 *
 * `view` and `click` are fire-and-forget: they are telemetry, they are
 * de-duplicated server-side, and a member's tap must never be delayed or blocked
 * by one. A failure is swallowed rather than surfaced — a member who cannot be
 * counted has not experienced a problem.
 *
 * `dismiss` and `bookmark` are not. Both are deliberate actions with a visible
 * consequence, so both are awaited and both report failure, and neither is
 * retried: `dismiss` is not de-duplicated server-side, so a retried dismissal is
 * a second suppression record for the same item.
 */
export function useRecommendationFeedback(
  countryOverride?: string | null
): UseRecommendationFeedbackResult {
  const activeCountry = useFeedCountry();
  const country = countryOverride ?? activeCountry;
  const queryClient = useQueryClient();

  const dismissal = useMutation({
    mutationFn: (input: FeedbackInput) => recordDismiss(input),
    retry: false,
    onSuccess: (result, input) => {
      // `wasRecorded` rather than "the call did not throw". `/dismiss` is never
      // de-duplicated so this is expected to be true — reading it anyway is what
      // keeps the screen from hiding an item the platform did not suppress.
      if (!result.wasRecorded) return;

      queryClient.setQueryData<HomeFeed>(recommendationKeys.feed(country), (previous) =>
        previous ? withoutRecommendation(previous, input.targetId) : previous
      );
    },
  });

  const bookmarking = useMutation({
    mutationFn: (input: FeedbackInput) => recordBookmark(input),
    retry: false,
  });

  const dismiss = useCallback(
    async (input: FeedbackInput) => {
      try {
        return await dismissal.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [dismissal]
  );

  const bookmark = useCallback(
    async (input: FeedbackInput) => {
      try {
        return await bookmarking.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [bookmarking]
  );

  const click = useCallback((input: FeedbackInput) => {
    // Deliberately not awaited. The navigation happens now; the telemetry
    // catches up. `catch` is required rather than optional — an unhandled
    // rejection from a signed-out member's impression would surface as a crash
    // report about analytics.
    void recordClick(input).catch(() => undefined);
  }, []);

  const view = useCallback((input: FeedbackInput) => {
    void recordView(input).catch(() => undefined);
  }, []);

  return {
    dismiss,
    click,
    view,
    bookmark,
    isDismissing: dismissal.isPending,
  };
}

/**
 * The feedback body for one item in one section.
 *
 * One place rather than at each card, because `position` and `targetType` have
 * to come from the *item* and not from the section — `for-you` is mixed, its
 * `targetType` is null, and a card that read the section's would send the wrong
 * type for every row in it.
 */
export function feedbackFor(item: Recommendation): FeedbackInput {
  return {
    targetType: item.targetType,
    targetId: item.targetId,
    position: item.position,
  };
}
