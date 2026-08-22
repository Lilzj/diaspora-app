// ─────────────────────────────────────────────────────────────────────────────
// Community updates — Remediation Wave D-2b
//
// **This screen used to be fixtures.** It read `mocks/community-data.ts`
// directly, filtered seven hardcoded updates in memory and rendered them with
// invented distances ("1.8 km", literally, for every row) under the words
// "community alerts". No request was made, no state but "found" and "not found"
// existed, and `Diaspora.Modules.Community` has served
// `GET /community/feeds/{feedKey}` the whole time.
//
// It now renders the `home` feed. `mocks/community-data.ts` is untouched and
// still read by the ten other screens that use it.
//
// ── What survived the swap, and what could not ───────────────────────────────
//
// **"Show expired alerts" survived exactly.** It is `includeExpired`, which
// defaults to false server-side — a post whose `expiresAt` is in the past is
// absent from every feed unless it is asked for by name. The toggle is now the
// query parameter it always looked like.
//
// **Sorting became `ranking`, and two of the four options had nowhere to go.**
// `newest` is `chronological` and `trending` is `trending`; `helpful` and
// `updated` are guide orderings with **no ranking key on this module**, so they
// fall back to chronological rather than being mapped onto something that is
// nearly right. The ranking keys are kebab-case — `trust-weighted`, not
// `trustWeighted` — and unlike everything else in this module they are
// configuration keys rather than enum names.
//
// **Search and the category filter could not be wired at all.** Both are shared
// with the guides tab and both speak the guide vocabulary:
//
//   * there is **no post search route**. `GET /community/feeds/search` is a
//     declared feed key with no provider registered — a 404 on every deployment
//     — and `GET /community/posts` does not exist either. Listing is feed-only.
//   * `FeedQuery.category` is a **camelCase** `CommunityPostCategory`
//     (`marketPrices`, `safetyAlert`) while the store holds kebab-cased guide
//     slugs. `market-prices` on that parameter is a 400, not a near miss.
//
// So neither is sent, and the screen says so rather than quietly ignoring a
// filter the member can see is switched on.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { FlatList, View, Text, Switch, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';

import { CommunityPostCard } from '@/components/community-social';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { useCommunityFeed } from '@/hooks/community-social';
import { useAuthStore } from '@/store/auth';
import { useKnowledgeSearchStore } from '@/store/knowledge-search';
import { useBottomInset } from '@/components/layout/bottom-inset';
import type { CommunityFeedRanking } from '@/types/community-social';
import { router } from 'expo-router';

/**
 * The store's sort onto the module's ranking.
 *
 * `helpful` and `updated` have no counterpart. They fall through to
 * `chronological` rather than being sent as themselves — an unknown ranking is
 * not a near miss, and mapping them onto `trending` would be this screen
 * inventing an ordering the platform did not offer.
 */
function rankingFor(sortBy: 'newest' | 'trending' | 'helpful' | 'updated'): CommunityFeedRanking {
  if (sortBy === 'trending') return 'trending';
  return 'chronological';
}

export default function KnowledgeUpdatesScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { user } = useAuthStore();
  const { searchQuery, selectedCategory, sortBy, showExpiredUpdates, toggleShowExpiredUpdates } =
    useKnowledgeSearchStore();

  const query = useMemo(
    () => ({
      ranking: rankingFor(sortBy),
      // The toggle, as the parameter it always was.
      includeExpired: showExpiredUpdates,
    }),
    [sortBy, showExpiredUpdates]
  );

  const feed = useCommunityFeed('home', query);

  // Neither of these narrows the feed. Saying so is the alternative to a filter
  // chip that appears to be doing something and is not.
  const hasInapplicableFilter = searchQuery.trim().length > 0 || selectedCategory !== null;

  const isSignedOut = feed.error === 'Sign in to take part in the community.';

  return (
    <View className="flex-1 bg-surface-background">
      {/* Archive / Expired Toggle */}
      <View className="flex-row items-center justify-between px-6 py-3 bg-surface-card border-b border-faint">
        <View className="flex-1 pr-4">
          <Text className="text-xs font-bold text-content-strong">Show Expired Alerts</Text>
          <Text className="text-[10px] text-content-faint mt-0.5">
            Display outdated warnings or expired community listings.
          </Text>
        </View>
        <Switch
          value={showExpiredUpdates}
          onValueChange={toggleShowExpiredUpdates}
          trackColor={{ false: '#E5E7EB', true: '#F59300' }}
          thumbColor="#FFF"
        />
      </View>

      {hasInapplicableFilter ? (
        <View className="px-6 py-2.5 bg-surface-muted border-b border-faint">
          <Text className="text-[10px] font-semibold text-content-muted leading-relaxed">
            Community alerts are not searchable and do not use the guide categories, so the filters
            above apply to guides and contributors only.
          </Text>
        </View>
      ) : null}

      {feed.isLoading ? (
        <UpdatesSkeleton />
      ) : feed.error ? (
        <EmptyState
          icon={isSignedOut ? '🔑' : '📡'}
          title={isSignedOut ? 'Sign in to see community alerts' : 'We could not load the alerts'}
          description={feed.error}
          action={
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={isSignedOut ? 'Sign in' : 'Try again'}
              onPress={() => (isSignedOut ? router.push('/login') : feed.refresh())}
              className="bg-primary-500 px-5 py-3 rounded-xl active:bg-primary-600"
            >
              <Text className="text-white font-extrabold text-sm">
                {isSignedOut ? 'Sign in' : 'Try again'}
              </Text>
            </TouchableOpacity>
          }
        />
      ) : feed.isEmpty ? (
        // An empty feed renders as empty. The screen this replaced could not
        // reach this state, because its seven fixtures were always there.
        <EmptyState
          icon="📢"
          title="No community alerts yet"
          description={
            showExpiredUpdates
              ? 'Nothing has been posted here, expired or otherwise.'
              : 'Nothing active right now. Turn on "Show Expired Alerts" to look through what has already passed.'
          }
        />
      ) : (
        <FlatList
          data={feed.posts}
          // `postId`. `updateId` is the same value under the module's older
          // name, and keying on it would be keying on the same thing twice.
          keyExtractor={(post) => post.postId}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          refreshControl={
            <RefreshControl refreshing={feed.isRefreshing} onRefresh={feed.refresh} />
          }
          // Stops on `hasMore`, never on an empty page: a malformed cursor comes
          // back as page one at HTTP 200, so "keep going until a page is empty"
          // would append the first page to itself for ever. The hook knows.
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <CommunityPostCard post={item} viewerId={user?.userId ?? null} />
          )}
          ListFooterComponent={
            feed.isFetchingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#6B7280" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

/** Three cards' worth of placeholder, so the list has the shape it will have. */
function UpdatesSkeleton() {
  return (
    <View
      className="p-4"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading community alerts"
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {[0, 1, 2].map((card) => (
          <View key={card} className="bg-surface-card rounded-2xl p-4 mb-3 border border-subtle">
            <Skeleton width="35%" height={12} className="mb-3" />
            <Skeleton width="80%" height={18} className="mb-2" />
            <Skeleton width="95%" height={14} className="mb-1.5" />
            <Skeleton width="60%" height={14} className="mb-3" />
            <Skeleton width="45%" height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}
