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
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  CreatorCardSkeleton,
  CreatorDirectoryCard,
  CreatorEmptyState,
  CreatorScreen,
} from '@/components/creator-economy';
import { useCreatorDirectory } from '@/hooks/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
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

  const open = useCallback((creator: PublicCreator) => {
    // The public contributor profile already exists and is real. The creator
    // directory is a different way in to the same person, not a second profile.
    router.push(`/contributor/${creator.creatorId}` as never);
  }, []);

  const hasFilters = submitted.length > 0 || category !== 'all' || verifiedOnly;

  return (
    <CreatorScreen
      title="Find creators"
      subtitle="People who write about what you need"
      gapKey="discovery"
      isEnabled={directory.isEnabled}
      error={directory.error}
      onRetry={directory.refetch}
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
    >
      <View className="px-5 pt-5">
        {directory.isLoading ? (
          <CreatorCardSkeleton rows={4} />
        ) : directory.creators.length === 0 ? (
          <CreatorEmptyState
            icon="people-outline"
            title="Nobody matches"
            body={
              hasFilters
                ? 'Try a different search, or clear the filters.'
                : 'No creators are listed yet.'
            }
            actionLabel={hasFilters ? 'Clear filters' : undefined}
            onAction={
              hasFilters
                ? () => {
                    setQuery('');
                    setSubmitted('');
                    setCategory('all');
                    setVerifiedOnly(false);
                  }
                : undefined
            }
          />
        ) : (
          <>
            {directory.creators.map((creator) => (
              <CreatorDirectoryCard key={creator.creatorId} creator={creator} onPress={open} />
            ))}

            {directory.hasNextPage ? (
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
          </>
        )}

        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold text-center mt-2 mb-4 leading-relaxed"
        >
          Creators who have turned off discovery are not in these results at all. Diaspora decides
          who is listed.
        </Text>
      </View>
    </CreatorScreen>
  );
}
