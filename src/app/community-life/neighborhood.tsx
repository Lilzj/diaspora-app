// ─────────────────────────────────────────────────────────────────────────────
// Neighbourhood events (§25, §26)
//
// Two lists, and the difference between them is the point:
//
//   **Near me** is entirely real. B12's event route takes `latitude`,
//   `longitude` and `radiusKm` and computes `distanceKm` server-side, so
//   proximity discovery needs no adapter at all and carries no gap notice.
//
//   **In this neighbourhood** is the simulated part — GAP-015. A named
//   neighbourhood is not an entity on the platform, only a string on a
//   location, so binding an event to one is string-matching rather than a
//   contract. The events inside are real B12 records; the binding is not.
//
// Creating a neighbourhood event goes to the existing B12 event creation, not
// to a second one. §26: reuse existing Events infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  Section,
  SimulatedFigure,
  VerifiedFigure,
} from '@/components/community';
import {
  useNearbyEvents,
  useNeighborhoodActivity,
  useNeighborhoodEvents,
} from '@/hooks/community-life';
import { useLocationStore } from '@/store/location';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { Event } from '@/types/community-life';

type Tab = 'nearby' | 'neighborhood';

export default function NeighborhoodEventsScreen() {
  const { neighborhoodId } = useLocalSearchParams<{ neighborhoodId?: string }>();
  const { tokens } = useTheme();
  const location = useLocationStore((state) => state.currentLocation);

  const [tab, setTab] = useState<Tab>('nearby');

  // No radius state. See the "In your city" block below: the event route has no
  // radius to hold one for, and a picker whose every value returns the same list
  // is worse than no picker.
  const nearby = useNearbyEvents({ cityName: location?.cityName }, tab === 'nearby');

  const bound = useNeighborhoodEvents(tab === 'neighborhood' ? neighborhoodId : undefined);
  const { activity } = useNeighborhoodActivity(neighborhoodId);

  return (
    <CommunityScreen
      title={activity?.neighborhoodName ?? 'Near you'}
      subtitle={location?.cityName}
      // No gap key at the screen level: the nearby tab is entirely real, and
      // marking the whole screen would be wrong on it.
      isLoading={tab === 'nearby' ? nearby.isLoading : bound.isLoading}
      error={tab === 'nearby' ? (nearby.isError ? nearby.error : null) : bound.isError ? bound.error : null}
      onRetry={tab === 'nearby' ? nearby.refetch : bound.refetch}
      onRefresh={tab === 'nearby' ? nearby.refetch : bound.refetch}
    >
      <View className="px-5 pt-4">
        <ChipRow
          accessibilityLabel="How to find events"
          options={[
            { value: 'nearby' as const, label: 'Near me' },
            ...(neighborhoodId
              ? [{ value: 'neighborhood' as const, label: activity?.neighborhoodName ?? 'Neighbourhood' }]
              : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {/* ── In your city — Remediation Wave J ───────────────────────────────
        *
        * This block was headed "real proximity" and led with a radius picker
        * and a `VerifiedFigure` reading "Real — distances from Diaspora". The
        * event route binds no point and no radius, so the picker moved nothing:
        * every radius from 1 km to 25 km returned the same list, and no event in
        * it carried a distance. Selecting "1 km" and seeing events across the
        * city is the kind of contradiction a member notices and cannot explain.
        *
        * The control is withdrawn rather than left inert, and the list says what
        * it actually is. `useNearbyEvents` reports `proximityAvailable: false`;
        * the tab is still called "Near me" because that is the member's
        * question, and the answer now states its own precision.
        */}
      {tab === 'nearby' ? (
        <View className="px-5 mt-4">
          <View className="mb-4">
            <VerifiedFigure label="Real — events published in your city" />
          </View>

          <InlineRefusal
            icon="resize-outline"
            reason={
              nearby.hasLocation
                ? 'These are events across your whole city, not events within a distance of you. Diaspora cannot yet ask for events within a radius — the event search narrows by city, map area or neighbourhood, and none of those is a distance from where you are standing.'
                : 'Diaspora does not know which city you are in, so there is nothing to narrow this list by. You can turn location on in Settings.'
            }
          />

          <View className="mt-3">
            {nearby.events.length === 0 && !nearby.isLoading ? (
              <EmptyState
                icon="calendar-outline"
                title="Nothing published in your city yet"
                body="This is everything Diaspora holds for your city, not a filtered slice of it — so there is nothing wider to try."
              />
            ) : (
              nearby.events.map((event) => <NeighborhoodEventCard key={event.id} event={event} isReal />)
            )}
          </View>
        </View>
      ) : null}

      {/* ── Named neighbourhood — the simulated binding ─────────────────────── */}
      {tab === 'neighborhood' ? (
        <View className="px-5 mt-4">
          <InlineRefusal
            icon="flask-outline"
            reason="Diaspora stores an area as text on an event's address, not as a place you can ask about. Grouping events under a named neighbourhood is simulated here — the events themselves are real."
          />

          {activity ? (
            <Section title={`What is happening in ${activity.neighborhoodName}`} style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card>
                  <View className="flex-row justify-between">
                    {(
                      [
                        ['Events', activity.upcomingEventCount],
                        ['Fundraisers', activity.activeCampaignCount],
                        ['Volunteering', activity.openOpportunityCount],
                        ['Polls', activity.openPollCount],
                      ] as const
                    ).map(([label, value]) => (
                      <View key={label} className="items-center flex-1">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-lg font-black tracking-tight"
                        >
                          {value}
                        </Text>
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[10px] font-bold mt-0.5 text-center"
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="mt-3">
                    <SimulatedFigure />
                  </View>
                </Card>
              </View>
            </Section>
          ) : null}

          <View className="mt-4">
            {bound.events.length === 0 && !bound.isLoading ? (
              <EmptyState
                icon="home-outline"
                title="Nothing in this neighbourhood"
                body="No event has been posted with this area on it."
              />
            ) : (
              bound.events.map((row) => (
                <NeighborhoodEventCard
                  key={row.event.id}
                  event={row.event}
                  isReal={row.distanceSource === 'backend'}
                />
              ))
            )}
          </View>
        </View>
      ) : null}

      <View className="px-5 mt-8">
        <PrimaryButton
          label="Post an event here"
          icon="add"
          accessibilityHint="Uses Diaspora's usual event form"
          onPress={() => router.push('/community-life/event/create')}
        />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold text-center mt-3 leading-relaxed"
        >
          Neighbourhood events use Diaspora's normal event form, so they show up everywhere events
          do.
        </Text>
      </View>
    </CommunityScreen>
  );
}

function NeighborhoodEventCard({ event, isReal }: { event: Event; isReal: boolean }) {
  const { tokens } = useTheme();

  return (
    <View className="mb-3">
      <Card
        onPress={() => {
          trackCommunityEvent('community.neighborhood_event.viewed', { eventId: event.id });
          router.push(`/community-life/event/${event.id}` as never);
        }}
        accessibilityLabel={`${event.title}. ${event.date} at ${event.time}. ${event.location.areaName}.${
          event.location.distanceKm ? ` ${event.location.distanceKm.toFixed(1)} kilometres away.` : ''
        }`}
        accessibilityHint="Opens the event"
      >
        <View className="flex-row items-center">
          <View
            style={{ backgroundColor: tokens.color.surface.elevated }}
            className="w-12 items-center rounded-xl py-2"
          >
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black tracking-tight"
            >
              {event.date.slice(8, 10)}
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              {new Date(`${event.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}
            </Text>
          </View>

          <View className="flex-1 ml-3">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black tracking-tight"
              numberOfLines={2}
            >
              {event.title}
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-bold mt-0.5"
              numberOfLines={1}
            >
              {event.time} · {event.location.areaName}
              {event.location.distanceKm ? ` · ${event.location.distanceKm.toFixed(1)} km` : ''}
            </Text>
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[10px] font-black uppercase tracking-widest mt-1"
            >
              {event.category}
            </Text>
          </View>

          {isReal ? null : (
            <View className="ml-2">
              <SimulatedFigure label="Binding" />
            </View>
          )}
        </View>
      </Card>
    </View>
  );
}
