// ─────────────────────────────────────────────────────────────────────────────
// Volunteer discovery (§18)
//
// The list pages, so the screen is one FlashList (FARCH-004, 27 Nov 2026): the
// filters are drawn above the rows, and the rows are recycled as they scroll
// rather than every page staying mounted.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  ChipRow,
  CommunityScreen,
  OpportunityCard,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { ListState } from '@/components/ListState';
import { useOpportunities } from '@/hooks/community-life';
import { useLocationStore } from '@/store/location';
import { trackCommunityEvent } from '@/lib/platform/community-analytics';
import type { VolunteerOpportunity } from '@/types/community-advanced';

const CAUSES = [
  { value: '', label: 'All causes' },
  { value: 'Community Events', label: 'Events' },
  { value: 'Education', label: 'Education' },
  { value: 'Elder Care', label: 'Elder care' },
  { value: 'Legal Support', label: 'Legal' },
  { value: 'Food', label: 'Food' },
  { value: 'Health', label: 'Health' },
];

/** One opportunity. Module-level, so the list keeps a row until its opportunity changes. */
function renderOpportunity({ item }: ListRenderItemInfo<VolunteerOpportunity>) {
  return (
    <View className="px-5 mb-3">
      <OpportunityCard
        opportunity={item}
        onPress={() => router.push(`/community-life/volunteer/${item.opportunityId}` as never)}
      />
    </View>
  );
}

export default function VolunteerListScreen() {
  const { tokens } = useTheme();
  const city = useLocationStore((state) => state.currentLocation?.cityName);

  const [query, setQuery] = useState('');
  const [cause, setCause] = useState('');
  const [useCity, setUseCity] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);

  useEffect(() => {
    trackCommunityEvent('community.life.viewed', { surface: 'volunteer' });
  }, []);

  const params = useMemo(
    () => ({
      query: query.trim() || undefined,
      cause: cause || undefined,
      cityName: useCity ? (city ?? undefined) : undefined,
      state: openOnly ? 'Published' : undefined,
    }),
    [query, cause, useCity, city, openOnly]
  );

  const {
    opportunities,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useOpportunities(params);

  return (
    <CommunityScreen
      title="Volunteering"
      subtitle={city && useCity ? `Around ${city}` : 'Everywhere'}
      load={{ isLoading, error: isError ? error : null, onRetry: refetch, onRefresh: refetch }}
      headerRight={
        <Ionicons
          name="person-circle-outline"
          size={24}
          color={tokens.color.primary[500]}
          accessibilityRole="button"
          accessibilityLabel="My volunteering"
          style={{ marginRight: 12 }}
          onPress={() => router.push('/community-life/volunteer/dashboard')}
        />
      }
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
              backgroundColor: tokens.color.surface.elevated,
              borderColor: tokens.color.border.default,
            }}
            className="flex-row items-center rounded-full border px-4"
          >
            <Ionicons name="search" size={16} color={tokens.color.text.placeholder} />
            <TextInput
              accessibilityLabel="Search volunteer opportunities"
              value={query}
              onChangeText={setQuery}
              placeholder="Stewarding, teaching, driving…"
              placeholderTextColor={tokens.color.text.placeholder}
              returnKeyType="search"
              style={{ color: tokens.color.text.primary, minHeight: 44 }}
              className="flex-1 ml-2 text-sm font-semibold"
            />
          </View>
        </View>
      }
      list={{
        data: opportunities,
        keyExtractor: (opportunity) => opportunity.opportunityId,
        renderItem: renderOpportunity,
        // The shell draws the list's loading and error; the list says when it is empty.
        ListEmptyComponent: (
          <View className="px-5">
            <ListState
              isEmpty
              empty={{
                icon: 'hand-left-outline',
                title: 'Nothing to volunteer for right now',
                message:
                  query || cause
                    ? 'Try widening your filters.'
                    : 'When a community near you needs help, it will show up here.',
                action:
                  query || cause
                    ? {
                        label: 'Clear filters',
                        onPress: () => {
                          setQuery('');
                          setCause('');
                        },
                      }
                    : undefined,
              }}
            />
          </View>
        ),
        ListFooterComponent: (
          <View className="px-5">
            {hasNextPage && opportunities.length > 0 ? (
              <View className="mb-4">
                {isFetchingNextPage ? (
                  <View className="py-4 items-center" accessibilityLabel="Loading more">
                    <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                  </View>
                ) : (
                  <SecondaryButton label="Show more" onPress={() => void fetchNextPage()} />
                )}
              </View>
            ) : null}

            <View className="mt-2">
              <PrimaryButton
                label="My volunteering"
                icon="person-circle-outline"
                onPress={() => router.push('/community-life/volunteer/dashboard')}
              />
            </View>
          </View>
        ),
      }}
    >
      <View className="px-5 pt-4 pb-4">
        <ChipRow accessibilityLabel="Filter by cause" options={CAUSES} value={cause} onChange={setCause} />
        <View className="flex-row mt-1">
          <ChipRow
            accessibilityLabel="Filter by availability"
            options={[
              { value: 'open' as const, label: 'Open now' },
              { value: 'all' as const, label: 'Everything' },
            ]}
            value={openOnly ? 'open' : 'all'}
            onChange={(value) => setOpenOnly(value === 'open')}
          />
        </View>
        {city ? (
          <View className="flex-row mt-1">
            <ChipRow
              accessibilityLabel="Filter by location"
              options={[
                { value: 'city' as const, label: `In ${city}` },
                { value: 'anywhere' as const, label: 'Anywhere' },
              ]}
              value={useCity ? 'city' : 'anywhere'}
              onChange={(value) => setUseCity(value === 'city')}
            />
          </View>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
