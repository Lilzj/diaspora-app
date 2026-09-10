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
import { useCheckIn, useEventAttendees } from '@/hooks/community-life';
import { describeRegistration } from '@/lib/community-state';
import type { RegistrationStatus } from '@/types/community-advanced';
import { useNotification } from '@/providers/notification-provider';
import type { EventAttendee } from '@/types/community-advanced';
import { formatRelativeTime } from '@/utils/format';

type Filter = '' | 'Registered' | 'Waitlisted' | 'CheckedIn';

export default function AttendeesScreen() {
  const { occurrenceId, eventId } = useLocalSearchParams<{
    occurrenceId?: string;
    eventId?: string;
  }>();
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const [filter, setFilter] = useState<Filter>('');

  // **One path, because an occurrence is an event.**
  //
  // This screen used to branch: an event read the platform, and an occurrence
  // went through a gap adapter calling
  // `/community-life/registrations/attendees` — a route that does not exist.
  //
  // It never needed to. A series occurrence *is* a `CommunityEvent` carrying a
  // `SeriesId`; its own handler reads
  // `_events.GetAsync(CommunityEventId.From(occurrenceId))`. So the occurrence
  // identifier is an event identifier, `GET /events/{id}/attendees` serves it,
  // and the second path was an imagined contract for a case the first already
  // covered.
  const subjectId = eventId ?? occurrenceId;

  const {
    attendees,
    goingCount,
    acceptsCheckIn,
    checkInOpensAt,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useEventAttendees(subjectId);

  const checkIn = useCheckIn(subjectId);

  const filtered = useMemo(
    () => (filter ? attendees.filter((attendee) => attendee.status === filter) : attendees),
    [attendees, filter]
  );

  // **"1 in total" over a list of two.** The header was given the platform's
  // going count while the list also holds the waitlist, so the two numbers on
  // one screen disagreed. It describes the list now, and names the going count
  // separately because that is the one an organiser is counting chairs
  // against.
  const subtitle = `${attendees.length} ${
    attendees.length === 1 ? 'person' : 'people'
  } · ${goingCount} going`;

  /**
   * Marks somebody as arrived.
   *
   * **Says what happened.** `mutate` with no handler swallows the answer, so a
   * check-in that the platform refused looked exactly like one it accepted:
   * the row did not change and nothing was said. That is the affordance this
   * codebase keeps being bitten by, and it is worse at a door with a queue
   * behind it.
   */
  const handleCheckIn = async (attendee: EventAttendee) => {
    const rsvpId = (attendee as { rsvpId?: string }).rsvpId;

    if (!rsvpId) {
      showAlert({
        type: 'error',
        title: 'Cannot check in',
        message: 'This attendee has no registration to check in against.',
      });
      return;
    }

    try {
      await checkIn.mutateAsync({ rsvpId });
      showAlert({
        type: 'success',
        title: 'Checked in',
        message: `${attendee.displayName || 'They'} are marked as arrived.`,
      });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not checked in',
        message: detail?.trim() || 'That could not be recorded. Try again in a moment.',
      });
    }
  };

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
                      {acceptsCheckIn ? (
                        <PrimaryButton
                          label="Check in"
                          icon="enter-outline"
                          busy={checkIn.isPending}
                          onPress={() => handleCheckIn(attendee)}
                        />
                      ) : (
                        // **Not offered before the door opens.** The platform
                        // refuses a check-in outside the window and says so,
                        // and a button that is always refused until a date is
                        // an affordance that always fails. It says when
                        // instead.
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-semibold"
                        >
                          {checkInOpensAt
                            ? `Check-in opens ${formatRelativeTime(checkInOpensAt)}`
                            : 'Check-in is not open yet'}
                        </Text>
                      )}
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
