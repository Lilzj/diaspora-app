// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a community's own events (21 Oct 2026)
//
// Events a host posted *in* this community ("Post in community" on the event
// form), read from `GET /community-life/events?communityId=`. Not the
// country-of-origin projection `CommunityContentSection` applies to the other
// domains: an event now says which community it is for, so the list is exact,
// and it renders for a multi-country community too.
//
// The empty state says only what is true: nobody has posted an event here yet.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { useCommunityEvents } from '@/hooks/community-life';
import type { Event } from '@/types/community-life';

export interface CommunityEventsSectionProps {
  communityId: string | null | undefined;
  communityName?: string;
  /** How many to show; the profile previews two, the route shows a page. */
  limit?: number;
  hideHeading?: boolean;
  onSeeAll?: () => void;
}

export function communityEventsEmptyText(communityName?: string): string {
  return `No events have been posted in ${communityName ?? 'this community'} yet. Members can post one from “Create event” by choosing this community under “Post in community”.`;
}

export function CommunityEventsSection({
  communityId,
  communityName,
  limit,
  hideHeading = false,
  onSeeAll,
}: CommunityEventsSectionProps) {
  const { tokens } = useTheme();
  const { events, isLoading, isError, refetch } = useCommunityEvents(communityId, limit);

  return (
    <View className="px-4">
      {!hideHeading ? (
        <View className="flex-row items-center justify-between mb-2">
          <Text accessibilityRole="header" style={{ color: tokens.color.text.primary }} className="text-sm font-black">
            Events
          </Text>
          {onSeeAll && events.length > 0 ? (
            <TouchableOpacity accessibilityRole="button" onPress={onSeeAll}>
              <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
                See all
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator />
      ) : isError ? (
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.surface.border }}
          className="rounded-2xl border p-4"
        >
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
            This community’s events could not be loaded. That is not the same as there being none.
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void refetch()} className="mt-2">
            <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.surface.border }}
          className="rounded-2xl border p-4"
        >
          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
            {communityEventsEmptyText(communityName)}
          </Text>
        </View>
      ) : (
        events.map((event) => <CommunityEventRow key={event.id} event={event} />)
      )}
    </View>
  );
}

function CommunityEventRow({ event }: { event: Event }) {
  const { tokens } = useTheme();
  const where = [event.location?.areaName, event.location?.cityName].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${event.date}`}
      onPress={() => event.id && router.push(`/community-life/event/${event.id}` as never)}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.surface.border }}
      className="rounded-2xl border p-3 mb-2 flex-row items-center"
    >
      <Ionicons name="calendar-outline" size={20} color={tokens.color.text.secondary} />
      <View className="flex-1 ml-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black" numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold mt-0.5" numberOfLines={1}>
          {[event.date, event.time].filter(Boolean).join(' · ')}
          {where ? ` · ${where}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </TouchableOpacity>
  );
}
