// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-3 — the Knowledge Hub's guide list, from the server.
//
// ── What this screen did before ─────────────────────────────────────────────
//
// It imported `mockGuides` and `mockAuthors` from `mocks/community-data.ts`,
// filtered three fixture guides in memory by title, country *name* and category
// *label*, sorted them on the device, and rendered each with a fixture author
// beside it. Every member, in every country, saw the same three guides — and the
// Hub's filter chips appeared to work because the filtering really was happening,
// against fixtures.
//
// `Diaspora.Modules.Guides` has served `GET /guides` the whole time, with every
// one of those filters and five sort orders.
//
// ── What it does now ────────────────────────────────────────────────────────
//
// `useGuideSearch`, cursor-paged, with the Hub's filters translated into the
// contract's own vocabulary:
//
//   * `q` — the search box, sent to the server rather than applied here.
//   * `country` — the ISO code, from the store's second spelling. The display
//     name the picker shows would match no `countryCode` on any row.
//   * `category` — the catalogue **key**, likewise.
//   * `sort` — the four chips mapped onto `GuideSortKey`. Note `helpful` →
//     `most-helpful` and `updated` → `recently-updated`: the wire spellings are
//     kebab, and `GuideWireNames.ParseSort` **silently falls back to `newest`**
//     for anything it does not recognise. A chip that sent its own label would
//     have produced a plausible list in the wrong order and no error at all.
//
// Sorting is the server's. Doing it again here would fight the cursor: page two
// is ordered by the server's key, and re-sorting the accumulated pages on the
// device makes rows jump as you scroll.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { FlatList, View, Text, ActivityIndicator, RefreshControl } from 'react-native';

import { GuideResultCard } from '@/components/guides/GuideResultCard';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useGuideCategories, useGuideSearch } from '@/hooks/guides';
import type { GuideSortKey } from '@/types/guides';

/**
 * The Hub's four chips, in the contract's spelling.
 *
 * `trending` is the one that is a ranking-strategy seam on the server rather
 * than an indexed ordering; the other three translate directly.
 */
const SORT_KEYS: Record<'newest' | 'trending' | 'helpful' | 'updated', GuideSortKey> = {
  newest: 'newest',
  trending: 'trending',
  helpful: 'most-helpful',
  updated: 'recently-updated',
};

export default function KnowledgeGuidesScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { searchQuery, selectedCountryCode, selectedCategoryKey, sortBy } =
    useKnowledgeSearchStore();

  const { categories } = useGuideCategories();

  const categoryNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const category of categories) names.set(category.key, category.name);
    return names;
  }, [categories]);

  const results = useGuideSearch({
    q: searchQuery.trim() || undefined,
    country: selectedCountryCode ?? undefined,
    category: selectedCategoryKey ?? undefined,
    sort: SORT_KEYS[sortBy],
  });

  if (results.isLoading) {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading guides"
        className="flex-1 items-center justify-center bg-surface-background"
      >
        <ActivityIndicator color="#F59300" />
      </View>
    );
  }

  // A failed request and an empty knowledge base need different words. The
  // fixture screen could only ever say the second.
  if (results.error && results.guides.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6 bg-surface-background">
        <Text className="text-4xl mb-2">📖</Text>
        <Text className="text-sm font-bold text-content-strong">Guides are unavailable</Text>
        <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[260px]">
          {results.error}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-background">
      <FlatList
        data={results.guides}
        keyExtractor={(item) => item.guideId}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={results.isRefreshing} onRefresh={results.refresh} />
        }
        // `hasMore`, never an empty page — see `hooks/guides.ts`.
        onEndReachedThreshold={0.4}
        onEndReached={results.loadMore}
        renderItem={({ item }) => (
          <GuideResultCard guide={item} categoryName={categoryNames.get(item.categoryKey)} />
        )}
        ListFooterComponent={
          results.isFetchingMore ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#F59300" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-4xl mb-2">📖</Text>
            <Text className="text-sm font-bold text-content-strong">No community guides found</Text>
            <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[240px]">
              Try relaxing your filters or searching for other items in our Knowledge Hub.
            </Text>
          </View>
        }
      />
    </View>
  );
}
