// ─────────────────────────────────────────────────────────────────────────────
// Recurring events — discovery (§9)
//
// Series only. One-time events live in the existing B12 events directory and are
// reached from there; §58.2 says extend rather than duplicate, and a second
// events list would be a duplicate.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  ChipRow,
  CommunityScreen,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  SeriesCard,
} from '@/components/community';
import { useCommunityAccess, useSeriesList } from '@/hooks/community-life';
import { useLocationStore } from '@/store/location';

const STATUSES = [
  { value: '' as const, label: 'All' },
  { value: 'Published' as const, label: 'Live' },
  { value: 'Draft' as const, label: 'Drafts' },
  { value: 'Paused' as const, label: 'Paused' },
];

export default function SeriesListScreen() {
  const { tokens } = useTheme();
  const access = useCommunityAccess();
  const city = useLocationStore((state) => state.currentLocation?.cityName);

  const [status, setStatus] = useState<'' | 'Published' | 'Draft' | 'Paused'>('');
  const [useCity, setUseCity] = useState(true);

  const params = useMemo(
    () => ({
      status: status || undefined,
      cityName: useCity ? (city ?? undefined) : undefined,
    }),
    [status, useCity, city]
  );

  const {
    series,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useSeriesList(params);

  return (
    <CommunityScreen
      title="Recurring events"
      subtitle={city && useCity ? `In ${city}` : 'Everywhere'}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="Filter by status"
          options={STATUSES}
          value={status}
          onChange={setStatus}
        />
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
        {series.length === 0 && !isLoading ? (
          <EmptyState
            icon="repeat-outline"
            title="No recurring events"
            body="Weekly meetups, monthly meetings and fortnightly matches all show up here once somebody sets one up."
            action={access.canCreateSeries ? 'Set one up' : undefined}
            onAction={() => router.push('/community-life/series/create')}
          />
        ) : (
          series.map((item) => (
            <View key={item.seriesId} className="mb-3">
              <SeriesCard
                series={item}
                onPress={() => router.push(`/community-life/series/${item.seriesId}` as never)}
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

        {access.canCreateSeries && series.length > 0 ? (
          <View className="mt-4">
            <PrimaryButton
              label="Create a recurring event"
              icon="add"
              onPress={() => router.push('/community-life/series/create')}
            />
          </View>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
