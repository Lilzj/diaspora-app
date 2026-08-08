// ─────────────────────────────────────────────────────────────────────────────
// Attendees and check-in (§29)
//
// The organizer's list for one occurrence or one event: who registered, who is
// waitlisted, who has been checked in.
//
// §45 names attendee lists among the things not to leak: this screen shows a
// display name and a registration state and nothing else — no contact details,
// no membership status, nothing that would let an organizer's device become a
// copy of the member directory.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  CommunityStatusBadge,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { useAttendees, useCheckInAttendee } from '@/hooks/community-life';
import { describeRegistration } from '@/lib/community-state';
import type { RegistrationStatus } from '@/types/community-advanced';

type Filter = '' | 'Registered' | 'Waitlisted' | 'CheckedIn';

export default function AttendeesScreen() {
  const { occurrenceId, eventId } = useLocalSearchParams<{
    occurrenceId?: string;
    eventId?: string;
  }>();
  const { tokens } = useTheme();
  const [filter, setFilter] = useState<Filter>('');

  const {
    attendees,
    totalCount,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isEnabled,
  } = useAttendees({ occurrenceId, eventId });

  const checkIn = useCheckInAttendee(occurrenceId);

  const filtered = useMemo(
    () => (filter ? attendees.filter((attendee) => attendee.status === filter) : attendees),
    [attendees, filter]
  );

  const counts = useMemo(() => {
    const tally: Partial<Record<RegistrationStatus, number>> = {};
    for (const attendee of attendees) {
      tally[attendee.status] = (tally[attendee.status] ?? 0) + 1;
    }
    return tally;
  }, [attendees]);

  return (
    <CommunityScreen
      title="Attendees"
      subtitle={totalCount !== null ? `${totalCount} in total` : undefined}
      gapKey="eventRegistration"
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="Filter attendees"
          options={[
            { value: '' as const, label: `All (${attendees.length})` },
            { value: 'Registered' as const, label: `Registered (${counts.Registered ?? 0})` },
            { value: 'CheckedIn' as const, label: `Checked in (${counts.CheckedIn ?? 0})` },
            { value: 'Waitlisted' as const, label: `Waiting (${counts.Waitlisted ?? 0})` },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <View className="px-5 mt-3">
        {filtered.length === 0 && !isLoading ? (
          <EmptyState
            icon="people-outline"
            title="Nobody yet"
            body={
              filter
                ? 'No attendee is in this state.'
                : 'Nobody has registered for this yet. Share it and they will.'
            }
          />
        ) : (
          filtered.map((attendee) => {
            const state = describeRegistration(attendee.status);

            return (
              <View key={attendee.userId} className="mb-2.5">
                <Card
                  accessibilityLabel={`${attendee.displayName}. ${state.label}.${
                    attendee.guestCount > 0
                      ? ` Bringing ${attendee.guestCount} ${attendee.guestCount === 1 ? 'guest' : 'guests'}.`
                      : ''
                  }`}
                >
                  <View className="flex-row items-center">
                    <View
                      style={{ backgroundColor: tokens.color.surface.elevated }}
                      className="w-10 h-10 rounded-full items-center justify-center"
                    >
                      <Ionicons name="person-outline" size={17} color={tokens.color.text.placeholder} />
                    </View>

                    <View className="flex-1 ml-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-sm font-bold"
                        numberOfLines={1}
                      >
                        {attendee.displayName}
                      </Text>
                      {attendee.guestCount > 0 ? (
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-semibold mt-0.5"
                        >
                          + {attendee.guestCount} {attendee.guestCount === 1 ? 'guest' : 'guests'}
                        </Text>
                      ) : null}
                    </View>

                    <CommunityStatusBadge state={state} size="small" />
                  </View>

                  {attendee.status === 'Registered' ? (
                    <View className="mt-3">
                      <PrimaryButton
                        label="Check in"
                        icon="enter-outline"
                        busy={checkIn.isPending}
                        onPress={() => checkIn.mutate(attendee.userId)}
                      />
                    </View>
                  ) : null}
                </Card>
              </View>
            );
          })
        )}

        {hasNextPage ? (
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

        <InlineRefusal
          icon="shield-outline"
          reason="Diaspora shows you who is coming and nothing more. Contact details stay with the member unless they choose to share them."
        />
      </View>
    </CommunityScreen>
  );
}
