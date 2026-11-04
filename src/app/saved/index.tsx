// ─────────────────────────────────────────────────────────────────────────────
// Saved: everything the member saved, by kind
//
// ── What this replaced (UAT, 3 Nov 2026, item 19) ────────────────────────────
//
// Two screens answered `/saved`. This one listed three hand-written folders
// ("London Housing Search", "Visa Documents", "African Grocers List") that
// every member saw and that lived only in local state, beside counts that read
// zero after a reload because the server lower-cases the type it stores. The
// other, a hidden tab, read an `items` field the server never sends. Neither
// showed a guide saved with the guide's own Save button, which writes to the
// Guides module rather than to Bookmarks, and Profile linked to neither.
//
// Now there is one screen. Guides come from `GET /guides/bookmarked`, the list
// the Save button writes to; every other kind comes from the Bookmarks module,
// the store the hearts on cards write to. Each kind opens its own list.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useBookmarkedGuides } from '@/hooks/guides';
import { backOr } from '@/lib/navigation';
import { useSavedStore } from '@/store/saved';
import { SAVED_COLLECTION_CONFIG, type SavedContentType } from '@/types/saved';

/** Always shown, so a member sees where a saved thing will appear. */
const CORE_KINDS: readonly SavedContentType[] = [
  'Guide',
  'Housing',
  'Marketplace',
  'Job',
  'Event',
  'Organization',
];

/** Shown only once something of the kind is saved. */
const OTHER_KINDS: readonly SavedContentType[] = ['Listing', 'CommunityUpdate'];

function countLabel(count: number, more = false): string {
  if (more) return `${count.toLocaleString()}+ saved`;
  return count === 1 ? '1 saved' : `${count.toLocaleString()} saved`;
}

export default function SavedScreen() {
  const bottomInset = useBottomInset();
  const { isLoaded, isLoading, error, load, getCountByType, savedItems } = useSavedStore();
  const guides = useBookmarkedGuides();

  useEffect(() => {
    if (!isLoaded) void load();
  }, [isLoaded, load]);

  // `savedItems` is read so the counts follow a save or an unsave made elsewhere.
  void savedItems;

  // The guide list is paged and the server declines to count, so a first page
  // with more behind it reads "20+" rather than a total it did not give.
  const guideCount = guides.totalCount ?? guides.guides.length;
  const guidesMore = guides.totalCount === null && guides.hasMore;
  const countOf = (kind: SavedContentType): number =>
    kind === 'Guide' ? guideCount : getCountByType(kind);

  const kinds = [...CORE_KINDS, ...OTHER_KINDS.filter((kind) => getCountByType(kind) > 0)];
  const isBusy = (!isLoaded && isLoading) || guides.isLoading;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity
          onPress={() => backOr()}
          className="mr-4"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-content-primary tracking-tight">Saved</Text>
      </View>

      <ScrollEndScrollView
        className="flex-1 px-6 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <Text className="text-xs text-content-muted mb-4 leading-relaxed">
          Everything you saved, by kind. Tap Save on a guide, or the heart on a home, job, event or
          listing, and it appears here.
        </Text>

        {isBusy ? (
          <View className="items-center py-6">
            <ActivityIndicator />
          </View>
        ) : null}

        {error ? (
          <Text className="text-xs text-error-default mb-3" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {kinds.map((kind) => {
          const config = SAVED_COLLECTION_CONFIG[kind];
          const count = countOf(kind);
          const label = countLabel(count, kind === 'Guide' && guidesMore);
          return (
            <TouchableOpacity
              key={kind}
              testID={`saved-kind-${kind}`}
              onPress={() => router.push(`/saved/${kind}` as never)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${config.label}, ${label}`}
              className="bg-surface-card rounded-3xl p-5 mb-3 border border-subtle flex-row items-center justify-between"
            >
              <View className="flex-row items-center flex-1 mr-3">
                <Text className="text-2xl mr-3">{config.icon}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-content-strong">{config.label}</Text>
                  <Text className="text-xs text-content-faint font-semibold mt-0.5">{label}</Text>
                </View>
              </View>
              <Text className="text-content-faint text-lg">›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
