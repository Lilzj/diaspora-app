// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator directory (Frontend Phase 7, §31)
//
// §31: "Do not expose creators who should not be discoverable. Respect backend
// privacy/visibility rules."
//
// The way that is honoured here is that the client never filters for privacy.
// A creator who has turned off discoverability is **absent from the response**,
// not present and hidden — because a client-side privacy filter is one refactor
// away from being a client-side privacy leak. `CREATOR-GAP-014` names the
// server-enforced visibility rule as part of the missing contract for exactly
// this reason.
//
// The result type is `PublicCreator`, which has no audience internals and no
// completeness score. A component here could not print a private field if it
// tried.
//
// The directory pages, so the screen is one FlashList (FARCH-004, 27 Nov 2026):
// the rows are recycled as they scroll rather than every page staying mounted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useTheme } from '@/design-system';
import { CreatorCardSkeleton, CreatorDirectoryCard, CreatorScreen } from '@/components/creator-economy';
import { ListState } from '@/components/ListState';
import { useCreatorDirectory } from '@/hooks/creator-economy';
import { trackCreatorEvent } from '@/lib/platform/creator-analytics';
import type { PublicCreator } from '@/types/creator-economy';

const CATEGORIES = [
  { key: 'all', label: 'Everyone' },
  { key: 'settling-in', label: 'Settling in' },
  { key: 'money-and-banking', label: 'Money' },
  { key: 'housing', label: 'Housing' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'work', label: 'Work' },
  { key: 'community', label: 'Community' },
];

/** Stable, so an empty list is the same empty list on every render. */
const NO_CREATORS: PublicCreator[] = [];

function openCreator(creator: PublicCreator) {
  // The public contributor profile already exists and is real. The creator
  // directory is a different way in to the same person, not a second profile.
  // The page is keyed by the member (20 Oct 2026); creatorId found no guides.
  router.push(`/contributor/${creator.userId ?? creator.creatorId}` as never);
}

/** One creator. Module-level, so the list keeps a row until its creator changes. */
function renderCreator({ item }: ListRenderItemInfo<PublicCreator>) {
  return (
    <View className="px-5">
      <CreatorDirectoryCard creator={item} onPress={openCreator} />
    </View>
  );
}

export default function CreatorDiscoverScreen() {
  const { tokens } = useTheme();

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [category, setCategory] = useState('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const directory = useCreatorDirectory({
    query: submitted || undefined,
    category: category === 'all' ? undefined : category,
    verified: verifiedOnly || undefined,
  });

  useEffect(() => {
    trackCreatorEvent('creator.directory.viewed');
  }, []);

  const search = useCallback(() => {
    setSubmitted(query.trim());
    trackCreatorEvent('creator.directory.searched', {
      hasQuery: query.trim().length > 0,
      category: category === 'all' ? undefined : category,
      filterCount: (category !== 'all' ? 1 : 0) + (verifiedOnly ? 1 : 0),
    });
  }, [category, query, verifiedOnly]);

  const hasFilters = submitted.length > 0 || category !== 'all' || verifiedOnly;
  // The skeleton stands in for the rows while the first page loads, as it did.
  const creators = directory.isLoading ? NO_CREATORS : directory.creators;

  return (
    <CreatorScreen
      title="Find creators"
      subtitle="People who write about what you need"
      availability={{ gapKey: 'discovery', isEnabled: directory.isEnabled }}
      load={{ error: directory.error, onRetry: directory.refetch }}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <View
            style={{
              backgroundColor: tokens.color.surface.background,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-2xl border px-3.5 mb-3"
          >
            <Ionicons name="search" size={17} color={tokens.color.text.placeholder} />
            <TextInput
              accessibilityLabel="Search creators by name or what they write about"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
              placeholder="Name, or what they write about"
              placeholderTextColor={tokens.color.text.disabled}
              style={{ color: tokens.color.text.primary }}
              className="flex-1 py-3 px-2.5 text-sm font-medium"
            />
            {query.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => {
                  setQuery('');
                  setSubmitted('');
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={17} color={tokens.color.text.placeholder} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: verifiedOnly }}
              accessibilityLabel="Show verified creators only"
              onPress={() => setVerifiedOnly((current) => !current)}
              style={{
                backgroundColor: verifiedOnly
                  ? tokens.color.primary[500]
                  : tokens.color.surface.background,
                borderColor: verifiedOnly ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="flex-row items-center rounded-full border px-3.5 py-2 mr-2"
            >
              <Ionicons
                name="checkmark-circle"
                size={12}
                color={verifiedOnly ? '#FFFFFF' : tokens.color.text.secondary}
              />
              <Text
                style={{ color: verifiedOnly ? '#FFFFFF' : tokens.color.text.secondary }}
                className="text-[11px] font-black ml-1"
              >
                Verified
              </Text>
            </Pressable>

            {CATEGORIES.map((item) => {
              const isActive = category === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${item.label} creators`}
                  onPress={() => setCategory(item.key)}
                  style={{
                    backgroundColor: isActive
                      ? tokens.color.primary[500]
                      : tokens.color.surface.background,
                    borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
                  }}
                  className="rounded-full border px-3.5 py-2 mr-2"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      list={{
        data: creators,
        keyExtractor: (creator) => creator.creatorId,
        renderItem: renderCreator,
        // The error is the shell's (`load.error`); the list draws the rest.
        ListEmptyComponent: (
          <View className="px-5">
            <ListState
              loading={directory.isLoading}
              loadingLabel="Loading creators"
              skeleton={<CreatorCardSkeleton rows={4} />}
              isEmpty
              empty={{
                icon: 'people-outline',
                title: 'Nobody matches',
                message: hasFilters
                  ? 'Try a different search, or clear the filters.'
                  : 'No creators are listed yet.',
                action: hasFilters
                  ? {
                      label: 'Clear filters',
                      onPress: () => {
                        setQuery('');
                        setSubmitted('');
                        setCategory('all');
                        setVerifiedOnly(false);
                      },
                    }
                  : undefined,
              }}
            />
          </View>
        ),
        ListFooterComponent: (
          <View className="px-5">
            {directory.hasNextPage && creators.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Load more creators"
                accessibilityState={{ busy: directory.isFetchingNextPage }}
                disabled={directory.isFetchingNextPage}
                onPress={() => directory.fetchNextPage()}
                className="py-4 items-center"
              >
                {directory.isFetchingNextPage ? (
                  <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                ) : (
                  <Text
                    style={{ color: tokens.color.primary[500] }}
                    className="text-[11px] font-black uppercase tracking-wider"
                  >
                    Load more
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Text
              style={{ color: tokens.color.text.disabled }}
              className="text-[10px] font-semibold text-center mt-2 mb-4 leading-relaxed"
            >
              Creators who have turned off discovery are not in these results at all. Diaspora decides
              who is listed.
            </Text>
          </View>
        ),
      }}
    >
      {/* The space the list starts with: the search and the filters are pinned above it. */}
      <View className="pt-5" />
    </CreatorScreen>
  );
}
