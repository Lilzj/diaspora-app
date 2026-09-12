// ─────────────────────────────────────────────────────────────────────────────
// Membership discovery (§7)
//
// Search, filters, categories, country, city, price band and eligibility. An
// infinite query rather than a list, because this surface spans every
// organization on the platform and §47 forbids loading it in one go.
//
// Private programmes are absent because the *server* withholds them. Nothing in
// this screen filters by visibility — a client-side filter would mean the
// private group had already been sent to the device.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  ChipRow,
  CommunityScreen,
  EmptyState,
  MembershipProgrammeCard,
  SecondaryButton,
} from '@/components/community';
import { useMembershipDiscovery } from '@/hooks/community-life';
import { useLocationStore } from '@/store/location';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { OrgCategory } from '@/types/community-life';

const CATEGORIES: { value: OrgCategory | 'All'; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Associations', label: 'Associations' },
  { value: 'Churches', label: 'Churches' },
  { value: 'Mosques', label: 'Mosques' },
  { value: 'Professional Associations', label: 'Professional' },
  { value: 'Student Associations', label: 'Student' },
  { value: 'Cultural Organizations', label: 'Cultural' },
  { value: 'Sports Clubs', label: 'Sports' },
  { value: 'NGOs', label: 'NGOs' },
];

const PRICE_BANDS: { value: 'any' | 'free' | 'paid'; label: string }[] = [
  { value: 'any', label: 'Any price' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
];

export default function MembershipDiscoveryScreen() {
  const { tokens } = useTheme();
  const city = useLocationStore((state) => state.currentLocation?.cityName);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<OrgCategory | 'All'>('All');
  const [priceBand, setPriceBand] = useState<'any' | 'free' | 'paid'>('any');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [useCity, setUseCity] = useState(true);

  useEffect(() => {
    trackCommunityEvent('community.membership.discovery.viewed', { surface: 'membership-discovery' });
  }, []);

  const params = useMemo(
    () => ({
      query: query.trim() || undefined,
      category,
      priceBand,
      eligibleOnly: eligibleOnly || undefined,
      cityName: useCity ? (city ?? undefined) : undefined,
    }),
    [query, category, priceBand, eligibleOnly, useCity, city]
  );

  /** Whether anything is narrowing the search — decides which empty state reads. */
  const hasFilters = Boolean(query.trim()) || category !== 'All' || priceBand !== 'any' || eligibleOnly;

  const {
    programmes,
    totalCount,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useMembershipDiscovery(params);

  return (
    <CommunityScreen
      title="Find a community"
      subtitle={totalCount !== null ? `${totalCount} with membership` : undefined}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
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
              accessibilityLabel="Search communities with membership"
              accessibilityHint="Type an organisation name or a keyword"
              value={query}
              onChangeText={setQuery}
              placeholder="Associations, churches, networks…"
              placeholderTextColor={tokens.color.text.placeholder}
              returnKeyType="search"
              style={{ color: tokens.color.text.primary, minHeight: 44 }}
              className="flex-1 ml-2 text-sm font-semibold"
            />
            {query.length > 0 ? (
              <Ionicons
                name="close-circle"
                size={16}
                color={tokens.color.text.placeholder}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
              />
            ) : null}
          </View>
        </View>
      }
    >
      <View className="px-5 pt-4">
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold mb-2">
          Category
        </Text>
        <ChipRow
          accessibilityLabel="Filter by category"
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
        />

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mb-2 mt-3"
        >
          Price
        </Text>
        <ChipRow
          accessibilityLabel="Filter by price"
          options={PRICE_BANDS}
          value={priceBand}
          onChange={setPriceBand}
        />

        <View className="flex-row mt-3">
          <ChipRow
            accessibilityLabel="Filter by eligibility"
            options={[
              { value: 'all' as const, label: 'All communities' },
              { value: 'eligible' as const, label: 'I can join' },
            ]}
            value={eligibleOnly ? 'eligible' : 'all'}
            onChange={(value) => setEligibleOnly(value === 'eligible')}
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

      <View className="px-5 mt-4">
        {programmes.length === 0 && !isLoading ? (
          <EmptyState
            icon="search-outline"
            title="No membership programmes match that"
            // This screen searches *membership programmes* — the ones an
            // organisation runs and you pay or apply for. It does not search the
            // community directory, and saying "no community near you" made an
            // empty programme table read as an empty platform. There are twelve
            // communities to join; none of them charges for it.
            body={
              hasFilters
                ? 'Try widening your filters — a nearby organisation may take a different kind of member.'
                : 'No organisation near you runs a paid or approved membership yet. Communities you can simply join are in the directory.'
            }
            action={hasFilters ? 'Clear filters' : 'Browse communities'}
            onAction={() => {
              if (!hasFilters) {
                router.push('/community');
                return;
              }
              setQuery('');
              setCategory('All');
              setPriceBand('any');
              setEligibleOnly(false);
            }}
          />
        ) : (
          programmes.map((programme) => (
            <View key={programme.organizationId} className="mb-3">
              <MembershipProgrammeCard
                programme={programme}
                onPress={() =>
                  router.push(`/community-life/membership/${programme.organizationId}` as never)
                }
              />
            </View>
          ))
        )}

        {hasNextPage ? (
          <View className="mt-2 mb-4">
            {isFetchingNextPage ? (
              <View className="py-4 items-center" accessibilityLabel="Loading more">
                <ActivityIndicator size="small" color={tokens.color.primary[500]} />
              </View>
            ) : (
              <SecondaryButton label="Show more" onPress={() => void fetchNextPage()} />
            )}
          </View>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
