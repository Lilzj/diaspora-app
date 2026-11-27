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
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useLocalSearchParams, router } from 'expo-router';
import { SAVED_COLLECTION_CONFIG, type SavedContentType } from '@/types/saved';
import { useSavedStore } from '@/store/saved';
import { ScrollEndFlashList, ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ListState } from '@/components/ListState';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { resolveSavedItems, type ResolvedSavedItem } from '@/lib/platform/saved-resolver';
import { useBookmarkedGuides } from '@/hooks/guides';
import { backOr } from '@/lib/platform/navigation';
import type { GuideCardResponse } from '@/types/guides';

export default function SavedCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  // A guide's Save button writes to the Guides module, not to Bookmarks, so
  // saved guides are that module's list (UAT, 3 Nov 2026).
  return category === 'Guide' ? <SavedGuides /> : <SavedBookmarks category={category} />;
}

function SavedHeader({ category }: { category: string | undefined }) {
  const config = SAVED_COLLECTION_CONFIG[category as keyof typeof SAVED_COLLECTION_CONFIG];
  return (
    <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
      <TouchableOpacity onPress={() => backOr()} className="mr-4" accessibilityRole="button">
        <Text className="text-xl text-content-tertiary">←</Text>
      </TouchableOpacity>
      <Text className="text-xl mr-2">{config?.icon}</Text>
      <Text className="text-xl font-bold text-content-primary">{config?.label}</Text>
    </View>
  );
}

function SavedRow({ title, subtitle, onPress }: { title: string; subtitle?: string | null; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-surface-card border border-subtle rounded-2xl p-4 mb-2 flex-row items-center"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="flex-1 pr-2">
        <Text className="text-[13px] font-black text-content-primary">{title}</Text>
        {subtitle ? <Text className="text-[11px] text-content-muted mt-0.5">{subtitle}</Text> : null}
      </View>
      <Text className="text-content-tertiary text-xs font-extrabold">›</Text>
    </TouchableOpacity>
  );
}

/** Stable, so a list with no guides to draw is the same empty list on every render. */
const NO_GUIDES: GuideCardResponse[] = [];

/** One saved guide. Module-level, so the list keeps a row until its guide changes. */
function renderSavedGuide({ item: guide }: ListRenderItemInfo<GuideCardResponse>) {
  return (
    <SavedRow
      title={guide.title}
      subtitle={[guide.countryCode, guide.cityName].filter(Boolean).join(' · ')}
      onPress={() => router.push(`/guide/${guide.guideId}` as never)}
    />
  );
}

function SavedGuides() {
  const bottomInset = useBottomInset();
  const { guides, isLoading, error, hasMore, isFetchingMore, loadMore, refresh } = useBookmarkedGuides();
  // The rows, once the guides have been read and there are some.
  const listed = !isLoading && guides.length > 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <SavedHeader category="Guide" />
      <ScrollEndFlashList
        // Saved guides page, so the list recycles its rows rather than keeping
        // every page mounted (FARCH-004, 27 Nov 2026). The scroll view's `p-6` is
        // the list's content padding now: a FlashList takes no className.
        data={listed ? guides : NO_GUIDES}
        keyExtractor={(guide) => guide.guideId}
        renderItem={renderSavedGuide}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 24, paddingBottom: bottomInset }}
        ListHeaderComponent={
          // A failed "Show more" keeps the guides already read, and says so beside them.
          error && guides.length > 0 ? (
            <Text className="text-xs text-error-default mb-3" accessibilityRole="alert">
              {error}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <ListState
            loading={isLoading}
            loadingLabel="Loading your saved guides"
            error={error && guides.length === 0 ? { title: 'Your saved guides could not be loaded', message: error } : null}
            onRetry={refresh}
            isEmpty={guides.length === 0}
            empty={{
              icon: 'bookmark-outline',
              title: 'Nothing saved here yet',
              message: 'Tap Save guide at the end of any guide to keep it here.',
            }}
          />
        }
        ListFooterComponent={
          listed && hasMore ? (
            <TouchableOpacity
              onPress={() => loadMore()}
              disabled={isFetchingMore}
              className="items-center py-3"
              accessibilityRole="button"
            >
              <Text className="text-xs font-bold text-primary-600">
                {isFetchingMore ? 'Loading…' : 'Show more'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function SavedBookmarks({ category }: { category: string | undefined }) {
  const bottomInset = useBottomInset();

  const { savedItems, isLoaded, error: storeError, load } = useSavedStore();

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
  // A read of the store that failed before it ever answered. Without this the
  // spinner never resolved: `isLoaded` stays false and the effect does not run again.
  const loadError = isLoaded ? null : storeError;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <SavedHeader category={category} />

      <ScrollEndScrollView
        className="flex-1 p-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <ListState
          loading={isBusy && !loadError}
          loadingLabel="Loading your saved items"
          error={loadError ? { title: loadError, message: 'Check your connection and try again.' } : null}
          onRetry={() => void load()}
          isEmpty={items.length === 0}
          empty={{
            icon: 'heart-outline',
            title: 'Nothing saved here yet',
            message: 'Tap the heart on anything you want to come back to.',
          }}
        >
          {items.map((item) => (
            <SavedRow
              key={item.contentId}
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => router.push(item.href as never)}
            />
          ))}
        </ListState>

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
