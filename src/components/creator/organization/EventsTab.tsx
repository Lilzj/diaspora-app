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
//
// The tab pages, so its rows are the sheet's list (FARCH-004, 27 Nov 2026):
// `useEventsTab` hands the sheet what it draws above them, the two groups as
// rows, and the next page below them.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import type { ListRenderItemInfo } from '@shopify/flash-list';

import { SecondaryButton, SeriesCard } from '@/components/community';
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
import { NO_ROWS, type EventsHeading, type OrganizationRow, type OrganizationTabList } from './OrganizationRows';

interface EventsTabProps {
  organizationId: string;
  organizationName: string;
  capabilities: OrganizationCapabilities;
  onOpenRoute: (route: string) => void;
  /** Whether Events is the tab in view. Only the tab in view fetches (§40). */
  active: boolean;
}

const UPCOMING: EventsHeading = { heading: 'Upcoming' };
const DORMANT: EventsHeading = { heading: 'Nothing scheduled' };

export function useEventsTab({
  organizationId,
  organizationName,
  capabilities,
  onOpenRoute,
  active,
}: EventsTabProps): OrganizationTabList {
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
  } = useSeriesList({ organizationId }, active);

  const canManage = capabilities.canManageEvents;
  // Read, and readable: until then the tab's loading, its failure or its
  // unavailability stands in for all of it, as each did.
  const listed = isEnabled && !isLoading && !isError;

  // A series carries its next occurrence, so "upcoming" is answerable without a
  // second request per series — which is the reason `nextOccurrence` is on the
  // model at all.
  const rows = useMemo((): readonly OrganizationRow[] => {
    if (!listed) return NO_ROWS;
    const upcoming = series.filter((entry) => entry.nextOccurrence);
    const dormant = series.filter((entry) => !entry.nextOccurrence);
    return [...(upcoming.length > 0 ? [UPCOMING, ...upcoming] : []), ...(dormant.length > 0 ? [DORMANT, ...dormant] : [])];
  }, [listed, series]);

  // A group's label or one series. Kept while the theme and the sheet's route
  // opener are, so a row is redrawn only when its record changes.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OrganizationRow>) => {
      if ('heading' in item) {
        return (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className={
              item.heading === 'Upcoming'
                ? 'text-[9px] font-black uppercase tracking-widest mb-2'
                : 'text-[9px] font-black uppercase tracking-widest mb-2 mt-3'
            }
          >
            {item.heading}
          </Text>
        );
      }
      if (!('seriesId' in item)) return null;

      return (
        <View className="mb-2">
          <SeriesCard
            series={item}
            onPress={() => onOpenRoute(`/community-life/series/${item.seriesId}`)}
          />
        </View>
      );
    },
    [tokens, onOpenRoute]
  );

  return {
    header: listed ? (
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
      </View>
    ) : null,
    rows,
    renderItem,
    state: {
      // Unavailable first, as it was: nothing was asked, so nothing is loading.
      loading: isEnabled && isLoading,
      skeleton: <TabLoading label="events" />,
      error: !isEnabled ? (
        <TabUnavailable label="Events" />
      ) : isError ? (
        <TabError
          label="Events"
          subject="seeing its events"
          kind={error?.kind}
          onRetry={() => void refetch()}
        />
      ) : null,
      isEmpty: series.length === 0,
      empty: {
        icon: 'calendar-outline',
        title: 'No events yet',
        message: canManage
          ? `Run something for ${organizationName} — a one-off, or a series that repeats. Members and followers see it in the community calendar.`
          : `${organizationName} has not scheduled anything. When it does, it will appear here and in the community calendar.`,
        action: canManage
          ? {
              label: 'Host the first event',
              onPress: () => onOpenRoute(`/community-life/series/create?organizationId=${organizationId}`),
            }
          : undefined,
      },
    },
    footer:
      listed && hasNextPage ? (
        <SecondaryButton
          label={isFetchingNextPage ? 'Loading…' : 'Load more events'}
          icon="arrow-down-circle-outline"
          disabled={isFetchingNextPage}
          onPress={() => void fetchNextPage()}
        />
      ) : null,
  };
}
