// ─────────────────────────────────────────────────────────────────────────────
// What I said I would go to
//
// `GET /rsvps/mine` has been served since the CommunityLife module shipped, and
// **no client function, hook or screen ever called it**. A member could RSVP to
// an event and then had nowhere to see what they had committed to — the
// commitment existed on the server and nowhere a person could look. There was
// no way to find out you were fourth on a waitlist except by opening the event
// again and remembering that you had.
//
// It is the ninth route this application serves and renders nowhere.
//
// ── Two things this screen refuses to do ────────────────────────────────────
//
// **It does not drop a row whose event failed to join.** The server sends the
// RSVPs and their event summaries as two arrays; if one ever lacks the other,
// the honest answer is a commitment whose event could not be loaded, not a
// silently shorter list. A vanished commitment is the failure nobody notices.
//
// **It does not compute a status.** `Waitlisted`, `Cancelled` and `Attended`
// are the server's words about somebody's place at an event, and a client that
// second-guessed them would tell a member they were going to something they
// had been dropped from.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListState } from '@/components/ListState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useMyRsvps } from '@/hooks/community-life';
import { describeRsvp, isLiveRsvp } from '@/lib/domain/my-rsvps';
import { formatRelativeTime } from '@/utils/format';
import type { MyRsvp } from '@/types/community-life';

export default function MyRsvpsScreen() {
  const { tokens } = useTheme();
  const { rsvps, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyRsvps();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Going to" showBack />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* The error said "Pull down to try again" over a list nothing could pull; it offers
            Try again instead (FARCH-007). RSVPs already shown stay when a later page fails. */}
        <ListState
          loading={isLoading}
          loadingLabel="Loading your RSVPs"
          error={
            isError && rsvps.length === 0
              ? { title: 'We could not load what you are going to', message: 'Your RSVPs are safe.' }
              : null
          }
          onRetry={() => void refetch()}
          isEmpty={rsvps.length === 0}
          empty={{
            icon: 'calendar-outline',
            title: 'Nothing in the diary',
            message:
              'Events you say you are going to will appear here, along with your place on any waitlist.',
            action: { label: 'Find something', onPress: () => router.push('/community-life') },
          }}
        >
          <View className="gap-3">
            {rsvps.map((entry) => (
              <RsvpRow key={entry.rsvp.rsvpId} entry={entry} />
            ))}
          </View>

          {hasNextPage ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Load more"
              accessibilityState={{ busy: isFetchingNextPage }}
              disabled={isFetchingNextPage}
              onPress={() => fetchNextPage()}
              style={{ borderColor: tokens.color.border.default }}
              className="rounded-full border py-3 items-center mt-4"
            >
              {isFetchingNextPage ? (
                <ActivityIndicator size="small" color={tokens.color.primary[500]} />
              ) : (
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[11px] font-black uppercase tracking-widest"
                >
                  Load more
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </ListState>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One commitment.
 *
 * Tappable only when the event joined. A row whose event is missing still shows
 * — the RSVP is real — but it cannot navigate anywhere, and offering a tap that
 * fails on arrival is the affordance this codebase has already been bitten by.
 */
function RsvpRow({ entry }: { entry: MyRsvp }) {
  const { tokens } = useTheme();
  const { rsvp, event } = entry;

  const live = isLiveRsvp(rsvp);
  const Container = event ? TouchableOpacity : View;

  return (
    <Container
      accessibilityRole={event ? 'button' : 'text'}
      accessibilityLabel={
        event
          ? `${event.title}. ${describeRsvp(rsvp)}.`
          : `An event that could not be loaded. ${describeRsvp(rsvp)}.`
      }
      onPress={event ? () => router.push(`/community-life/event/${event.eventId}`) : undefined}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
        opacity: live ? 1 : 0.6,
      }}
      className="rounded-2xl border p-4"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
            {event?.title ?? 'An event we could not load'}
          </Text>

          {event ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold mt-0.5"
            >
              {formatRelativeTime(event.startsAt)}
              {event.venueName ? ` · ${event.venueName}` : ''}
            </Text>
          ) : (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold mt-0.5"
            >
              Your RSVP is recorded. The event details did not come back.
            </Text>
          )}
        </View>

        <Text
          style={{
            color: rsvp.status === 'Waitlisted'
              ? tokens.color.warning.default
              : tokens.color.text.secondary,
          }}
          className="text-[10px] font-black uppercase tracking-wider"
        >
          {describeRsvp(rsvp)}
        </Text>
      </View>
    </Container>
  );
}
