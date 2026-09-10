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
import {
  useAttendees,
  useCheckIn,
  useCheckInAttendee,
  useEventAttendees,
} from '@/hooks/community-life';
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

  // **Two paths, and only one of them is real.**
  //
  // An event's attendees come from `GET /events/{id}/attendees`, which the
  // platform has served since the module shipped. The occurrence path still
  // goes through the gap adapter, which calls
  // `/community-life/registrations/attendees` — a route that does not exist,
  // written from an imagined contract and never exercised because the whole
  // screen was gated behind the gap-preview flag.
  //
  // So an event now reads the platform and an occurrence keeps its declared
  // gap, rather than both quietly reading nothing.
  const real = useEventAttendees(eventId);
  const gap = useAttendees({ occurrenceId, eventId: eventId ? undefined : undefined });

  const usingEvent = Boolean(eventId);

  const attendees = usingEvent ? real.attendees : gap.attendees;
  const totalCount = usingEvent ? real.goingCount : gap.totalCount;
  const isLoading = usingEvent ? real.isLoading : gap.isLoading;
  const isError = usingEvent ? real.isError : gap.isError;
  const error = usingEvent ? real.error : gap.error;
  const fetchNextPage = usingEvent ? real.fetchNextPage : gap.fetchNextPage;
  const hasNextPage = usingEvent ? real.hasNextPage : gap.hasNextPage;
  const isFetchingNextPage = usingEvent ? real.isFetchingNextPage : gap.isFetchingNextPage;
  const refetch = usingEvent ? real.refetch : gap.refetch;
  const isEnabled = usingEvent ? true : gap.isEnabled;

  const realCheckIn = useCheckIn(eventId);
  const gapCheckIn = useCheckInAttendee(occurrenceId);

  const checkIn = usingEvent ? realCheckIn : gapCheckIn;

  const filtered = useMemo(
    () => (filter ? attendees.filter((attendee) => attendee.status === filter) : attendees),
    [attendees, filter]
  );

  // **"1 in total" over a list of two.** The header was given the platform's
  // going count while the list also holds the waitlist, so the two numbers on
  // one screen disagreed. It describes the list now, and names the going count
  // separately because that is the one an organiser is counting chairs
  // against.
  const subtitle = usingEvent
    ? `${attendees.length} ${attendees.length === 1 ? 'person' : 'people'} · ${totalCount} going`
    : totalCount !== null
      ? `${totalCount} in total`
      : undefined;

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
      subtitle={subtitle}
      {...(usingEvent
        ? {}
        : {
            // **Only the occurrence path is still a gap.** An event's
            // attendees come from a route the platform serves, and the notice
            // sat directly above two real people with real names saying
            // "Event registration, capacity and attendance is not something
            // Diaspora can do yet". A declared gap does not quiet itself when
            // half of it arrives.
            gapKey: 'eventRegistration' as const,
          })}
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
                        onPress={() =>
                          usingEvent
                            ? realCheckIn.mutate({
                                rsvpId: (attendee as { rsvpId?: string }).rsvpId ?? '',
                              })
                            : gapCheckIn.mutate(attendee.userId)
                        }
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
