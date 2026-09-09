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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useMyRsvps } from '@/hooks/community-life';
import { describeRsvp, isLiveRsvp } from '@/lib/my-rsvps';
import { formatRelativeTime } from '@/utils/format';
import type { MyRsvp } from '@/types/community-life';

export default function MyRsvpsScreen() {
  const { tokens } = useTheme();
  const { rsvps, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMyRsvps();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Going to" showBack />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color={tokens.color.primary[500]} />
          </View>
        ) : isError ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-3xl border p-6 items-center"
          >
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-bold text-center"
            >
              We could not load what you are going to
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold mt-2 text-center leading-relaxed"
            >
              Your RSVPs are safe. Pull down to try again.
            </Text>
          </View>
        ) : rsvps.length === 0 ? (
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-3xl border p-6 items-center"
          >
            <Ionicons name="calendar-outline" size={28} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-bold mt-3 text-center"
            >
              Nothing in the diary
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold mt-2 text-center leading-relaxed"
            >
              Events you say you are going to will appear here, along with your place on any
              waitlist.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Browse events"
              onPress={() => router.push('/community-life')}
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="rounded-full px-6 py-3 mt-4"
            >
              <Text className="text-white text-[11px] font-black uppercase tracking-widest">
                Find something
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-3">
            {rsvps.map((entry) => (
              <RsvpRow key={entry.rsvp.rsvpId} entry={entry} />
            ))}
          </View>
        )}

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
