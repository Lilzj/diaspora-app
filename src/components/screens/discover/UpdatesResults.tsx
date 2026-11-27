// Discover: the Updates tab, which has no route to list from and says so.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

/**
 * The community-updates list, which has no route to fill it.
 *
 * Module-level so the reference is stable across renders — an inline `[]` would
 * be a new array every time and would re-run every memo that depends on it.
 */
const EMPTY_UPDATES: never[] = [];

export function UpdatesResults() {

  /**
   * Community updates — there is no route, so there is no list.
   *
   * Held as a constant rather than deleted so the Updates tab keeps its shape
   * and renders the honest empty state below. See the header for why this is a
   * genuine absence and not a missing client: no `/community/updates` segment
   * exists, `GET /community/posts` has no collection route, listing is feed-only
   * via `GET /community/feeds/{feedKey}`, and `feeds/search` is a declared key
   * with no registered provider — it 404s.
   *
   * The nearest real thing is `GET /communities/announcements`, in the separate
   * CommunityProgramme module. It is a different object on a different aggregate
   * with a different scope model, and quietly relabelling announcements as local
   * community alerts would restate the same lie with real data behind it.
   */
  const filteredUpdates: never[] = EMPTY_UPDATES;

  return (
    <View>
      {/* `filteredUpdates` is `EMPTY_UPDATES` and always will be
          until a list route exists — see its declaration. The map
          is kept so the tab renders rows the day one does; today
          it falls through to the panel below. */}
      {filteredUpdates.length > 0 ? null : (
        <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-10 shadow-sm">
          <Text className="text-4xl mb-3">📢</Text>
          <Text className="text-base font-black text-content-primary text-center tracking-tight">
            Community updates aren&apos;t available yet
          </Text>
          <Text className="text-xs text-content-muted mt-2 text-center leading-relaxed max-w-[280px]">
            This tab used to show local alerts that were not real. The
            platform has no way to list community updates yet, so
            rather than show invented ones, it shows none.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/community-life')}
            className="bg-primary-500 px-6 py-3 rounded-full mt-5"
          >
            <Text className="text-white font-black text-xs">
              See what is happening nearby →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
