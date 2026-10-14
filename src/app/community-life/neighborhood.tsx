// ─────────────────────────────────────────────────────────────────────────────
// Community life around a point (14 Oct 2026)
//
// This screen listed events "in your city" and, beside them, a named catalogue
// neighbourhood's activity. The place catalogue is retired: a neighbourhood is
// now the area around a point, which is the member's own location unless the
// screen was opened for a place they picked (`latitude`, `longitude`, `name`,
// `radiusKm` params, as the area screen sends them).
//
// Both halves are real reads:
//   * `GET /community-life/area/activity`: events, organisations, RSVPs and
//     attendances counted within the circle.
//   * `GET /community-life/events?latitude&longitude&radiusKm`: the events
//     themselves, which the event route binds since the catalogue was retired.
//
// Creating an event goes to the existing event form. §26: reuse existing Events
// infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  Section,
  VerifiedFigure,
} from '@/components/community';
import { useAreaActivity, useEventsAroundPoint } from '@/hooks/community-life';
import { useMemberPoint } from '@/hooks/member-point';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { Event } from '@/types/community-life';

const RADII_KM = [1, 2, 5, 10] as const;
type Radius = (typeof RADII_KM)[number];

function toRadius(value: string | undefined): Radius {
  const parsed = Number(value);
  return (RADII_KM as readonly number[]).includes(parsed) ? (parsed as Radius) : 2;
}

export default function AreaEventsScreen() {
  const params = useLocalSearchParams<{ latitude?: string; longitude?: string; name?: string; radiusKm?: string }>();
  const { tokens } = useTheme();
  const member = useMemberPoint();
  const [radiusKm, setRadiusKm] = useState<Radius>(() => toRadius(params.radiusKm));

  const point = useMemo(() => {
    const latitude = Number(params.latitude);
    const longitude = Number(params.longitude);
    if (params.latitude && params.longitude && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude, name: params.name || null };
    }
    return member.point ? { latitude: member.point.latitude, longitude: member.point.longitude, name: null } : null;
  }, [member.point, params.latitude, params.longitude, params.name]);

  const events = useEventsAroundPoint(point, radiusKm);
  const { activity } = useAreaActivity(point, radiusKm);

  const title = point?.name ?? activity?.displayName ?? 'Around you';

  return (
    <CommunityScreen
      title={title}
      subtitle={point ? `Within ${radiusKm} km` : undefined}
      isLoading={events.isLoading}
      error={events.isError ? events.error : null}
      onRetry={events.refetch}
      onRefresh={events.refetch}
    >
      {!point ? (
        <View className="px-5 mt-4">
          <InlineRefusal
            icon="locate-outline"
            reason="Diaspora knows your country but not where in it you are, so there is nothing to look around. You can set your location from the location bar, or turn location on in Settings."
          />
        </View>
      ) : (
        <>
          <View className="px-5 pt-4">
            <ChipRow
              accessibilityLabel="How far around"
              options={RADII_KM.map((value) => ({ value: String(value), label: `${value} km` }))}
              value={String(radiusKm)}
              onChange={(value) => setRadiusKm(toRadius(value))}
            />
          </View>

          {activity ? (
            <Section title="What is happening around here" style={{ marginTop: 8 }}>
              <View className="px-5">
                <Card>
                  <View className="flex-row justify-between">
                    {(
                      [
                        ['Coming up', activity.upcomingEventCount],
                        ['Organisations', activity.organizationCount],
                        ['People coming', activity.totalRsvps],
                        ['Turned up', activity.totalAttendances],
                      ] as const
                    ).map(([label, value]) => (
                      <View key={label} className="items-center flex-1">
                        <Text style={{ color: tokens.color.text.primary }} className="text-lg font-black tracking-tight">
                          {`${activity.isLowerBound ? '≥' : ''}${value}`}
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
                  <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-semibold mt-3">
                    {`Counted within ${activity.radiusKm} km; events over the last ${activity.windowDays} days and still to come.`}
                  </Text>
                </Card>
              </View>
            </Section>
          ) : null}

          <View className="px-5 mt-4">
            <View className="mb-4">
              <VerifiedFigure label={`Real — events within ${radiusKm} km`} />
            </View>

            {events.events.length === 0 && !events.isLoading ? (
              <EmptyState
                icon="calendar-outline"
                title={`Nothing published within ${radiusKm} km`}
                body={
                  radiusKm < 10
                    ? 'Try a wider distance above, or post one yourself.'
                    : 'Nothing is published this close yet. You can post one yourself.'
                }
              />
            ) : (
              events.events.map((event) => <AreaEventCard key={event.id} event={event} />)
            )}
          </View>
        </>
      )}

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
          Local events use Diaspora&apos;s normal event form, so they show up everywhere events do.
        </Text>
      </View>
    </CommunityScreen>
  );
}

function AreaEventCard({ event }: { event: Event }) {
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
          <View style={{ backgroundColor: tokens.color.surface.elevated }} className="w-12 items-center rounded-xl py-2">
            <Text style={{ color: tokens.color.text.primary }} className="text-base font-black tracking-tight">
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
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black tracking-tight" numberOfLines={2}>
              {event.title}
            </Text>
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold mt-0.5" numberOfLines={1}>
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
        </View>
      </Card>
    </View>
  );
}
