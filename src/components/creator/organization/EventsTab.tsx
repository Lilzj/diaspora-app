// ─────────────────────────────────────────────────────────────────────────────
// Events — §13, §14
//
// §14 is explicit: if Community Life already owns events, organisation
// management calls into that capability rather than creating organisation-
// specific event entities. It does own them. `useSeriesList` takes an
// `organizationId`, `SeriesCard` draws one, and `/community-life/series/[id]`
// is where a series is managed.
//
// So this tab lists and routes. It does not create a second event model, a
// second card, or a second create flow — "+ Host event" pushes Community
// Life's own composer with the organisation pre-selected.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';

import { EmptyState, SecondaryButton, SeriesCard } from '@/components/community';
import { useTheme } from '@/design-system';
import { useSeriesList } from '@/hooks/community-life';
import type { OrganizationCapabilities } from '@/types/community-advanced';

import {
  TabError,
  TabGapNote,
  TabHeading,
  TabLoading,
  TabUnavailable,
} from './OrganizationTabShared';

interface EventsTabProps {
  organizationId: string;
  organizationName: string;
  capabilities: OrganizationCapabilities;
  onOpenRoute: (route: string) => void;
}

export function EventsTab({
  organizationId,
  organizationName,
  capabilities,
  onOpenRoute,
}: EventsTabProps) {
  const { tokens } = useTheme();

  const {
    series,
    isLoading,
    isError,
    error,
    isEnabled,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useSeriesList({ organizationId });

  const canManage = capabilities.canManageEvents;

  if (!isEnabled) return <TabUnavailable label="Events" />;
  if (isLoading) return <TabLoading label="events" />;
  if (isError)
    return (
      <TabError
        label="Events"
        subject="seeing its events"
        kind={error?.kind}
        onRetry={() => void refetch()}
      />
    );

  // A series carries its next occurrence, so "upcoming" is answerable without a
  // second request per series — which is the reason `nextOccurrence` is on the
  // model at all.
  const upcoming = series.filter((entry) => entry.nextOccurrence);
  const dormant = series.filter((entry) => !entry.nextOccurrence);

  return (
    <View>
      <TabGapNote>
        Event series come from a development adapter. Opening one takes you to Community Life,
        which owns events — this tab does not hold a second copy of them.
      </TabGapNote>

      <TabHeading
        title="Events"
        count={series.length}
        action={canManage ? '+ Host event' : undefined}
        onAction={
          canManage
            ? () => onOpenRoute(`/community-life/series/create?organizationId=${organizationId}`)
            : undefined
        }
      />

      {series.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No events yet"
          body={
            canManage
              ? `Run something for ${organizationName} — a one-off, or a series that repeats. Members and followers see it in the community calendar.`
              : `${organizationName} has not scheduled anything. When it does, it will appear here and in the community calendar.`
          }
          action={canManage ? 'Host the first event' : undefined}
          onAction={
            canManage
              ? () => onOpenRoute(`/community-life/series/create?organizationId=${organizationId}`)
              : undefined
          }
        />
      ) : null}

      {upcoming.length > 0 ? (
        <>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mb-2"
          >
            Upcoming
          </Text>
          {upcoming.map((entry) => (
            <View key={entry.seriesId} className="mb-2">
              <SeriesCard
                series={entry}
                onPress={() => onOpenRoute(`/community-life/series/${entry.seriesId}`)}
              />
            </View>
          ))}
        </>
      ) : null}

      {dormant.length > 0 ? (
        <>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mb-2 mt-3"
          >
            Nothing scheduled
          </Text>
          {dormant.map((entry) => (
            <View key={entry.seriesId} className="mb-2">
              <SeriesCard
                series={entry}
                onPress={() => onOpenRoute(`/community-life/series/${entry.seriesId}`)}
              />
            </View>
          ))}
        </>
      ) : null}

      {hasNextPage ? (
        <SecondaryButton
          label={isFetchingNextPage ? 'Loading…' : 'Load more events'}
          icon="arrow-down-circle-outline"
          disabled={isFetchingNextPage}
          onPress={() => void fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
