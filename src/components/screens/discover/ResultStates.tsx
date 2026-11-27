// Discover: what every tab shows when it has nothing, or could not ask, and its "Show more".
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { ListMessage } from '@/components/ListState';

// What a tab says in place of its results, drawn by `ListState` since 27 Nov
// 2026 (FARCH-007). The two sentences are this screen's; the look is shared.

/**
 * A search that ran and found nothing.
 *
 * ── The place may not have a name ────────────────────────────────────────
 * A country-precision location has no city — that is what UAT-104's fix made
 * possible, and this sentence still read `No providers match in ` with nothing
 * after it. `place` is empty exactly when there is nothing to name, and the
 * sentence changes shape rather than trailing off.
 */
export function noMatch(label: string, place: string): ListMessage {
  return {
    icon: 'search-outline',
    title: place ? `No ${label} match in ${place}` : `No ${label} match nearby`,
    message: 'Try checking spelling, removing query filters, or widening the discovery radius.',
  };
}

/**
 * A search that could not be asked.
 *
 * Housing and Marketplace both read remote routes, and both used to render the
 * "nothing matched your search" panel when the request had in fact failed — for
 * Marketplace, on *every* request, because the path was wrong. Telling a member
 * their search found nothing when the search never ran is the specific untruth
 * this exists to prevent.
 *
 * "Pull down to try again" only where a pull asks again: the screen's pull
 * re-runs the Housing and Marketplace reads and nothing else, so the other tabs
 * say "Try again" on the button instead.
 */
export function couldNotLoad(label: string, error: string, pullAsksAgain: boolean): ListMessage {
  return {
    icon: 'cloud-offline-outline',
    title: `Could not load ${label}`,
    message: `${error} This is not an empty result — we could not reach Diaspora.${
      pullAsksAgain ? ' Pull down to try again.' : ''
    }`,
  };
}

/** The "Show more" state of a paged hook. */
export function pagingState(list: { isFetchingMore: boolean; loadMoreFailed: boolean }): 'idle' | 'loading' | 'failed' {
  if (list.isFetchingMore) return 'loading';
  return list.loadMoreFailed ? 'failed' : 'idle';
}

/**
 * The next page, on request.
 *
 * A button rather than loading on scroll: the tab lives inside the screen's one
 * scroll view with other sections above it, and a member should be able to
 * reach the end of what is shown without the list growing under them. A failed
 * page leaves the rows already shown and turns the button into a retry.
 */
export function ShowMoreButton({
  label,
  state,
  onPress,
}: {
  label: string;
  state: 'idle' | 'loading' | 'failed';
  onPress: () => void;
}) {
  const loading = state === 'loading';

  return (
    <View className="items-center mt-2 mb-6">
      {state === 'failed' ? (
        <Text className="text-xs text-content-secondary text-center mb-2">
          We could not load more just now.
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={state === 'failed' ? `Try again: ${label}` : label}
        accessibilityState={{ busy: loading, disabled: loading }}
        className="px-6 py-3 rounded-full bg-surface-background border border-subtle min-w-[160px] items-center"
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-xs font-bold text-content-primary">
            {state === 'failed' ? 'Try again' : label}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
