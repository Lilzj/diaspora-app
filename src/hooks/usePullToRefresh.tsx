// ─────────────────────────────────────────────────────────────────────────────
// Pull to refresh — one implementation
//
// The post-APK device pass reported that most screens do nothing when you pull
// down from the top. The survey behind the fix found three states, not one:
//
//   * 50 screens delegate to a shared wrapper (`CommunityScreen`,
//     `CreatorScreen`, `AnalyticsScreen`) and work correctly.
//   * 15 screens hand-roll a `RefreshControl`.
//   * 8 of those 15 pass `refreshing={false}` — a literal. The refetch fires,
//     but the spinner is told it is never refreshing, so it snaps back on
//     release and the screen looks inert. That is the reported symptom
//     exactly: a pull that appears to do nothing.
//
// This hook is what the hand-rolled ones become.
//
// ── Why `isRefreshing` is local state and not `query.isFetching` ─────────────
//
// `isFetching` is true for *any* fetch, including a window-focus refetch, a
// pagination page and a background revalidation. Binding the spinner to it
// makes the control appear when the member did not pull, and — worse — on a
// screen with pagination it re-appears every time they reach the end of the
// list. The spinner belongs to the gesture, so it is owned by the gesture.
//
// ── Errors ───────────────────────────────────────────────────────────────────
//
// §30: a failed refresh must not replace a usable page with a blank error.
// Nothing here touches rendered data — TanStack keeps the last successful
// `data` when a refetch fails, and this hook only clears the spinner. The
// screen's existing error surface reports it. What this does guarantee is that
// the spinner stops: the flag is cleared in `finally`, so a rejected promise
// leaves a working screen rather than an indicator that never retracts.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { useThemeTokens } from '@/design-system';

export interface PullToRefresh {
  /** True only while a member-initiated refresh is in flight. */
  isRefreshing: boolean;
  /** Hand to a wrapper's `onRefresh`, or to a `RefreshControl`. */
  onRefresh: () => Promise<void>;
}

/**
 * Drives a pull-to-refresh gesture from one or more query refetches.
 *
 * @example
 *   const { orders, refetch } = useOrders();
 *   const refresh = usePullToRefresh(refetch);
 *   <FlatList refreshControl={<RefreshControl {...refresh} />} />
 *
 * Several sources refresh together, which is what a dashboard needs:
 *
 * @example
 *   const refresh = usePullToRefresh([balance.refetch, transactions.refetch]);
 */
export function usePullToRefresh(
  refetch: (() => unknown) | Array<() => unknown>
): PullToRefresh {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // A second pull while the first is still running would clear the flag when
  // the *faster* of the two finished, retracting the spinner under a refresh
  // that is still going.
  const inFlight = useRef(false);

  // Held in a ref so a caller passing an inline array does not change the
  // identity of `onRefresh` on every render — a changing `onRefresh` makes
  // `RefreshControl` remount mid-gesture.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;

    inFlight.current = true;
    setIsRefreshing(true);

    try {
      const sources = refetchRef.current;
      const calls = Array.isArray(sources) ? sources : [sources];
      // `allSettled`: on a dashboard fed by several queries, one failing
      // endpoint must not cancel the refresh of the others.
      await Promise.allSettled(calls.map((call) => call()));
    } finally {
      inFlight.current = false;
      setIsRefreshing(false);
    }
  }, []);

  return { isRefreshing, onRefresh };
}

/**
 * Pull-to-refresh for a screen that loads through `useEffect` rather than
 * TanStack — of which this app still has several, including Community Life,
 * Home and Discover.
 *
 * There is no `refetch()` to call, so the equivalent is a nonce in every fetch
 * effect's dependency list: bumping it re-runs whichever load is current, with
 * whatever filters are set.
 *
 * @example
 *   const { nonce, refreshControl } = useEffectRefresh(isLoading);
 *   useEffect(() => { … }, [filters, nonce]);
 *   <ScrollView refreshControl={refreshControl} />
 *
 * ── Why resolving on `isLoading` needs three phases ──────────────────────────
 *
 * The promise must resolve when the *fetch* finishes, or the spinner retracts
 * before the new data lands and the pull looks like it did nothing — the exact
 * complaint this whole workstream came from.
 *
 * `isLoading` is the only signal available, and "resolve when it goes false"
 * does not work: effects run in declaration order within a commit, so a watcher
 * declared after the fetch effect still observes the *pre-fetch* `false` and
 * resolves instantly. Waiting for `true` and then `false` is what makes it wait
 * for the real work.
 */
export function useEffectRefresh(isLoading: boolean): {
  /** Put this in every fetch effect's dependency list. */
  nonce: number;
  refreshControl: React.ReactElement<RefreshControlProps>;
  /**
   * Runs the same refetch from a button rather than a pull.
   *
   * A screen showing an error has no list to pull on — the error *is* the
   * whole screen — so "Try again" needs a way in that does not go through
   * the `RefreshControl` element.
   */
  refresh: () => void;
} {
  const [nonce, setNonce] = useState(0);
  const phase = useRef<'idle' | 'requested' | 'loading'>('idle');
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (phase.current === 'requested' && isLoading) {
      phase.current = 'loading';
    } else if (phase.current === 'loading' && !isLoading) {
      phase.current = 'idle';
      resolveRef.current?.();
      resolveRef.current = null;
    }
  }, [isLoading]);

  const refreshControl = useRefreshControl(
    useCallback(
      () =>
        new Promise<void>((resolve) => {
          phase.current = 'requested';
          resolveRef.current = resolve;
          setNonce((n) => n + 1);
        }),
      []
    )
  );

  const refresh = useCallback(() => {
    phase.current = 'requested';
    setNonce((n) => n + 1);
  }, []);

  return { nonce, refreshControl, refresh };
}

/**
 * The same thing, as a ready-made control.
 *
 * Carries the brand tint so the indicator does not fall back to the platform
 * grey on one screen and the brand amber on the next.
 */
export function useRefreshControl(
  refetch: (() => unknown) | Array<() => unknown>
): React.ReactElement<RefreshControlProps> {
  const tokens = useThemeTokens();
  const { isRefreshing, onRefresh } = usePullToRefresh(refetch);

  return (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      tintColor={tokens.color.primary[500]}
      colors={[tokens.color.primary[500]]}
    />
  );
}
