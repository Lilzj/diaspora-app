// ─────────────────────────────────────────────────────────────────────────────
// Event series (§11)
//
// §11 asks that a member can tell a *series* from an *occurrence*. This screen
// is the series: the recurrence, the organizer, the next date, every occurrence
// split into upcoming, past and cancelled, and the member's own attendance
// across the whole thing. Tapping an occurrence opens the occurrence screen,
// which is where registration lives — because you register for a date, not for
// a pattern.
//
// The recurrence sentence comes from `series.recurrence.description`, written by
// the backend that owns the semantics. §10: the client does not compose one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  CommunityStatusBadge,
  DetailRow,
  EmptyState,
  InlineRefusal,
  OccurrenceRow,
  PrimaryButton,
  SecondaryButton,
  Section,
  readableDate,
} from '@/components/community';
import { AmountDisplay } from '@/components/financial';
import { useCancelSeries, useOccurrences, useSeries } from '@/hooks/community-life';
import { describeSeries } from '@/lib/community-state';
import { trackCommunityEvent } from '@/lib/community-analytics';

type Tab = 'upcoming' | 'past' | 'cancelled';

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();

  const { series, isLoading, isError, error, refetch, isEnabled } = useSeries(id);
  const {
    upcoming,
    past,
    cancelled,
    isLoading: isLoadingOccurrences,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOccurrences(id);
  const cancelSeries = useCancelSeries();

  const [tab, setTab] = useState<Tab>('upcoming');

  useEffect(() => {
    if (series) {
      trackCommunityEvent('community.event_series.viewed', {
        seriesId: series.seriesId,
        organizationId: series.organizationId ?? undefined,
        frequency: series.recurrence.frequency,
        occurrenceCount: series.occurrenceCount,
      });
    }
  }, [series?.seriesId]);

  const state = describeSeries(series?.status ?? 'Draft');
  const list = tab === 'upcoming' ? upcoming : tab === 'past' ? past : cancelled;
  const canManage = Boolean(series && series.status !== 'Cancelled' && series.status !== 'Completed');

  return (
    <CommunityScreen
      title={series?.title ?? 'Event series'}
      subtitle={series?.recurrence.description ?? undefined}
      gapKey="eventSeries"
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      footer={
        series?.nextOccurrence ? (
          <PrimaryButton
            label={`Open the next one · ${readableDate(series.nextOccurrence.date)}`}
            icon="calendar-outline"
            onPress={() =>
              router.push(`/community-life/occurrence/${series.nextOccurrence?.occurrenceId}` as never)
            }
          />
        ) : null
      }
    >
      {!series ? (
        <EmptyState
          icon="repeat-outline"
          title="Series not found"
          body="It may have been cancelled or removed."
        />
      ) : (
        <View>
          <Image
            source={{ uri: series.coverImage }}
            style={{ width: '100%', height: 180 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />

          <View className="px-5 pt-4">
            {/* Series marker — the thing that makes §11's distinction visible */}
            <View className="flex-row items-center mb-2">
              <View
                style={{ backgroundColor: tokens.color.secondary[50] }}
                className="flex-row items-center rounded-full px-2.5 py-1"
              >
                <Ionicons name="repeat" size={12} color={tokens.color.secondary[600]} />
                <Text
                  style={{ color: tokens.color.secondary[600] }}
                  className="text-[10px] font-black uppercase tracking-widest ml-1"
                >
                  Repeating event
                </Text>
              </View>
              <View className="ml-2">
                <CommunityStatusBadge state={state} size="small" />
              </View>
            </View>

            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-xl font-black tracking-tight"
            >
              {series.title}
            </Text>

            <View className="flex-row items-center mt-2">
              <Ionicons name="person-outline" size={13} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold ml-1.5 flex-1"
                numberOfLines={1}
              >
                {series.organizerName}
              </Text>
              {series.organizerIsVerified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={13}
                  color={tokens.color.info.default}
                  accessibilityLabel="Verified organiser"
                />
              ) : null}
            </View>

            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-sm font-semibold leading-relaxed mt-4"
            >
              {series.description}
            </Text>

            {/* The pattern */}
            <Section title="When it happens" style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card>
                  <DetailRow
                    label="Repeats"
                    icon="repeat-outline"
                    value={series.recurrence.description ?? 'On a schedule'}
                  />
                  {series.nextOccurrence ? (
                    <DetailRow
                      label="Next"
                      icon="calendar-outline"
                      value={`${readableDate(series.nextOccurrence.date)} at ${series.nextOccurrence.time}`}
                    />
                  ) : null}
                  <DetailRow
                    label="Where"
                    icon="location-outline"
                    value={`${series.location.addressLine}, ${series.location.areaName}, ${series.location.cityName}`}
                  />
                  {series.location.landmark ? (
                    <DetailRow label="Landmark" icon="flag-outline" value={series.location.landmark} />
                  ) : null}
                  <DetailRow
                    label="Cost"
                    icon="cash-outline"
                    value={
                      series.price ? (
                        <AmountDisplay
                          value={series.price}
                          size="small"
                          accessibilityPrefix="Cost per occurrence"
                        />
                      ) : (
                        'Free'
                      )
                    }
                  />
                  {series.recurrence.exceptions.length > 0 ? (
                    <DetailRow
                      label="Skipping"
                      icon="close-circle-outline"
                      value={series.recurrence.exceptions.map((date) => readableDate(date)).join(', ')}
                    />
                  ) : null}
                </Card>
              </View>
            </Section>

            {/* The member's own record across the series */}
            {series.myAttendedCount > 0 ? (
              <View className="mt-4">
                <InlineRefusal
                  icon="ribbon-outline"
                  reason={`You have been to ${series.myAttendedCount} of these.`}
                />
              </View>
            ) : null}
          </View>

          {/* Occurrences */}
          <Section
            title="All dates"
            subtitle={`${series.occurrenceCount} in total · ${series.completedCount} already happened`}
          >
            <View className="px-5">
              <ChipRow
                accessibilityLabel="Filter dates"
                options={[
                  { value: 'upcoming' as const, label: `Upcoming (${upcoming.length})` },
                  { value: 'past' as const, label: `Past (${past.length})` },
                  { value: 'cancelled' as const, label: `Cancelled (${cancelled.length})` },
                ]}
                value={tab}
                onChange={setTab}
              />

              <View className="mt-2">
                {isLoadingOccurrences ? (
                  <View className="py-8 items-center" accessibilityLabel="Loading dates">
                    <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                  </View>
                ) : list.length === 0 ? (
                  <EmptyState
                    icon="calendar-outline"
                    title={
                      tab === 'upcoming'
                        ? 'No upcoming dates'
                        : tab === 'past'
                          ? 'Nothing has happened yet'
                          : 'Nothing cancelled'
                    }
                    body={
                      tab === 'upcoming'
                        ? 'The organiser has not scheduled any more of these.'
                        : tab === 'past'
                          ? 'This series has not run yet.'
                          : 'Every date in this series is going ahead.'
                    }
                  />
                ) : (
                  list.map((occurrence) => (
                    <View key={occurrence.occurrenceId} className="mb-2.5">
                      <OccurrenceRow
                        occurrence={occurrence}
                        onPress={() =>
                          router.push(`/community-life/occurrence/${occurrence.occurrenceId}` as never)
                        }
                      />
                    </View>
                  ))
                )}

                {hasNextPage && tab === 'upcoming' ? (
                  <View className="mt-1 mb-3">
                    {isFetchingNextPage ? (
                      <View className="py-3 items-center" accessibilityLabel="Loading more dates">
                        <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                      </View>
                    ) : (
                      <SecondaryButton label="Show more dates" onPress={() => void fetchNextPage()} />
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          </Section>

          {/* Organizer controls */}
          {canManage ? (
            <View className="px-5 mt-6">
              <SecondaryButton
                label="Edit this series"
                icon="create-outline"
                onPress={() =>
                  router.push(`/community-life/series/create?seriesId=${series.seriesId}` as never)
                }
              />
              <View className="mt-3">
                <SecondaryButton
                  label="Cancel the whole series"
                  icon="close-circle-outline"
                  disabled={cancelSeries.isPending}
                  onPress={() =>
                    Alert.alert(
                      'Cancel the whole series?',
                      'Every upcoming date will be cancelled and everyone registered will be told. This cannot be undone.',
                      [
                        { text: 'Keep it', style: 'cancel' },
                        {
                          text: 'Cancel series',
                          style: 'destructive',
                          onPress: () => cancelSeries.mutate({ seriesId: series.seriesId }),
                        },
                      ]
                    )
                  }
                />
              </View>
            </View>
          ) : null}
        </View>
      )}
    </CommunityScreen>
  );
}
