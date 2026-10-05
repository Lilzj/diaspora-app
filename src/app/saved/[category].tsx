// ─────────────────────────────────────────────────────────────────────────────
// One category of saved items
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Seven typed branches, each rendering a rich card from `@/mocks`:
//
//     const guides = mockGuides.filter((g) => bookmarkedIds.includes(g.guideId));
//     const jobs   = mockJobs.filter((j) => bookmarkedIds.includes(j.jobId));
//     …five more
//
// `bookmarkedIds` came from a store seeded with the very ids those mocks use, so
// the screen looked like it worked. Against a real identifier it matched
// nothing. A member therefore saw seven items they never saved, and none of the
// ones they did.
//
// ── Why the rows are plainer now ─────────────────────────────────────────────
//
// `GET /bookmarks` returns `{ id, targetType, targetId, note, createdAt }` and
// no display data, and there is no route that resolves a set of `(type, id)`
// pairs in one call. So each row is fetched from its own module's detail route
// and rendered from what that response actually carries.
//
// That is a plainer row than the mock cards showed — no price, no distance
// badge, no cover image. Those came from fixtures, so the richness was never
// real: a plain row about something the member saved is worth more than a
// detailed one about something they did not.
//
// A row that cannot be resolved is left out rather than shown as a placeholder.
// Saved items do disappear — unpublished, deleted, made private — and a card
// that goes nowhere is worse than an accurate count.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { SAVED_COLLECTION_CONFIG, type SavedContentType } from '@/types/saved';
import { useSavedStore } from '@/store/saved';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { resolveSavedItems, type ResolvedSavedItem } from '@/lib/saved-resolver';
import { backOr } from '@/lib/navigation';

export default function SavedCategoryScreen() {
  const bottomInset = useBottomInset();
  const { category } = useLocalSearchParams<{ category: string }>();
  const config = SAVED_COLLECTION_CONFIG[category as keyof typeof SAVED_COLLECTION_CONFIG];

  const { savedItems, isLoaded, load } = useSavedStore();

  const [items, setItems] = useState<ResolvedSavedItem[]>([]);
  const [unresolved, setUnresolved] = useState(0);
  const [truncated, setTruncated] = useState(0);
  const [isResolving, setIsResolving] = useState(true);

  // The ids this member saved in this category — real identifiers now, matched
  // against nothing.
  const entries = useMemo(() => {
    const found: { contentId: string; contentType: SavedContentType }[] = [];
    savedItems.forEach((type, id) => {
      if (type === category) found.push({ contentId: id, contentType: type });
    });
    return found;
  }, [savedItems, category]);

  useEffect(() => {
    if (!isLoaded) void load();
  }, [isLoaded, load]);

  const resolve = useCallback(async () => {
    if (!isLoaded) return;

    setIsResolving(true);
    const resolved = await resolveSavedItems(entries);
    setItems(resolved.items);
    setUnresolved(resolved.unresolved);
    setTruncated(resolved.truncated);
    setIsResolving(false);
  }, [entries, isLoaded]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const isBusy = !isLoaded || isResolving;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => backOr()} className="mr-4" accessibilityRole="button">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-xl mr-2">{config?.icon}</Text>
        <Text className="text-xl font-bold text-content-primary">{config?.label}</Text>
      </View>

      <ScrollEndScrollView
        className="flex-1 p-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        {isBusy ? (
          <View className="items-center py-16">
            <ActivityIndicator />
          </View>
        ) : null}

        {!isBusy && items.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-base font-black text-content-primary mb-1 text-center">
              Nothing saved here yet
            </Text>
            <Text className="text-xs text-content-muted text-center leading-relaxed">
              Tap the heart on anything you want to come back to.
            </Text>
          </View>
        ) : null}

        {items.map((item) => (
          <TouchableOpacity
            key={item.contentId}
            onPress={() => router.push(item.href as never)}
            className="bg-surface-card border border-subtle rounded-2xl p-4 mb-2 flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <View className="flex-1 pr-2">
              <Text className="text-[13px] font-black text-content-primary">{item.title}</Text>
              {item.subtitle ? (
                <Text className="text-[11px] text-content-muted mt-0.5">{item.subtitle}</Text>
              ) : null}
            </View>
            <Text className="text-content-tertiary text-xs font-extrabold">›</Text>
          </TouchableOpacity>
        ))}

        {/* Saved things go away, and a member who saved nine and sees seven
          * deserves to know why rather than wonder which two they imagined. */}
        {!isBusy && unresolved > 0 ? (
          <Text className="text-[11px] text-content-muted mt-3 leading-relaxed">
            {unresolved === 1
              ? '1 saved item is no longer available.'
              : `${unresolved} saved items are no longer available.`}
          </Text>
        ) : null}

        {/* Each row costs a request, so the screen stops at a bound rather than
          * firing two hundred. Saying so beats silently showing a prefix. */}
        {!isBusy && truncated > 0 ? (
          <Text className="text-[11px] text-content-muted mt-1 leading-relaxed">
            Showing your most recent {items.length}. {truncated} more are saved.
          </Text>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
