// Community Life: the Events tab, as a list or a map.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TouchableOpacity, Text, Share } from 'react-native';
import { useThemeTokens } from '@/design-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TourSpotlight } from '@/components/explore/TourProvider';
import { eventHost } from '@/lib/api/event-host';
import { eventDistanceLabel } from '@/lib/domain/events-nearby';
import type { Event, EventCategory } from '@/types/community-life';
import { describeEventPrice } from '@/lib/api/event-wire';
import { ListState } from '@/components/ListState';
import { ListSkeleton } from '@/components/screens/community-life-events/ListSkeleton';
import { EventSearchBar } from '@/components/screens/community-life-events/EventSearchBar';
import { EventScopeChips } from '@/components/screens/community-life-events/EventScopeChips';
import { EventFilters } from '@/components/screens/community-life-events/EventFilters';
import { EventCategoryChips } from '@/components/screens/community-life-events/EventCategoryChips';
import { EventMap } from '@/components/screens/community-life-events/EventMap';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';
import type { SavedItems } from '@/components/screens/community-life-events/useSavedItems';

/**
 * What an empty event list should say, given what the search actually narrowed by.
 *
 * <b>It used to say "No events nearby — Be the first to create an event, or
 * expand your filter range!"</b> when the search had narrowed by town, and
 * there was no range to expand. The sentence is built from the filters that are
 * genuinely applied, and the suggestion names only controls on this screen: a
 * wider radius only when the search was around the member (since 4 Nov 2026).
 */
function describeEmptyEventSearch({
  city,
  scope,
  radiusKm,
  category,
  query,
  timeFilter,
  freeOnly,
}: {
  city: string;
  scope: 'all' | 'nearby' | 'communities';
  radiusKm: number;
  category: EventCategory | 'All';
  query: string;
  timeFilter: 'all' | 'today' | 'tomorrow' | 'weekend';
  freeOnly: boolean;
}): string {
  const narrowedBy: string[] = [];

  if (query.trim().length > 0) narrowedBy.push(`the words "${query.trim()}"`);
  if (category !== 'All') narrowedBy.push(`the ${category} category`);
  if (timeFilter !== 'all') narrowedBy.push(timeFilter === 'weekend' ? 'this weekend' : timeFilter);
  if (freeOnly) narrowedBy.push('free events only');

  const list =
    narrowedBy.length === 1
      ? narrowedBy[0]
      : `${narrowedBy.slice(0, -1).join(', ')} and ${narrowedBy[narrowedBy.length - 1]}`;

  if (scope === 'nearby') {
    return narrowedBy.length === 0
      ? `Nothing is on within ${radiusKm} km of you yet. Try a wider radius, or be the first to put something on.`
      : `Nothing within ${radiusKm} km matches ${list}. Try a wider radius, another category or a wider date range.`;
  }

  if (scope === 'communities') {
    return narrowedBy.length === 0
      ? 'None of your communities has an event coming up. Join a community to see its events here.'
      : `Nothing in your communities matches ${list}. Try another category or a wider date range.`;
  }

  // Nothing but the city. There is no filter to relax, so do not imply one.
  if (narrowedBy.length === 0) {
    return `Nothing is listed in ${city} yet. You can change the city from the picker at the top, or be the first to put something on.`;
  }

  return `Nothing in ${city} matches ${list}. Try another category or a wider date range, or change the city from the picker at the top.`;
}

interface EventsTabProps {
  eventSearch: EventSearch;
  lists: CommunityLifeLists;
  place: EventsPlace;
  saved: SavedItems;
}

export function EventsTab({ eventSearch, lists, place, saved }: EventsTabProps) {
  const tokens = useThemeTokens();
  const {
    eventQuery, selectedEventCat, eventScope, eventRadiusKm, eventFree, eventTimeFilter, viewMode,
  } = eventSearch;
  const { eventsList, eventsLoading, eventsError, refresh } = lists;
  const { placeName } = place;
  const { isSaved, handleSaveToggle } = saved;

  // Share action from card
  const handleShareEvent = async (eventItem: Event) => {
    try {
      const priceText = describeEventPrice(eventItem);
      await Share.share({
        message: `Join me at "${eventItem.title}" on ${eventItem.date} (${priceText}) in ${eventItem.location.areaName}! Shared via Diaspora.`,
      });
    } catch (error) {
      console.log('Share failed', error);
    }
  };

  return (
    <TourSpotlight spotlightKey="community_events_list">
    <View className="p-5">
      
      {/* Search Bar & View Mode Toggle */}
      <EventSearchBar eventSearch={eventSearch} place={place} />

      {/* What the list is narrowed to: everything in the town, the
        * circle around the member, or their communities, with Free on
        * top of any of them (UAT, 3 Nov 2026, item 2). */}
      <EventScopeChips eventSearch={eventSearch} place={place} />

      {/* Sort & Time filter */}
      <EventFilters eventSearch={eventSearch} />

      {/* Category selector */}
      <EventCategoryChips eventSearch={eventSearch} />

      {/* View Rendering. One list state for both views (FARCH-007): a map with no pins
          is still a map, so only the list says it is empty. */}
      <ListState
        loading={eventsLoading && eventsList.length === 0}
        skeleton={<ListSkeleton label="Loading events" />}
        error={
          eventsError && eventsList.length === 0
            ? { title: 'Events could not be loaded', message: eventsError.message }
            : null
        }
        onRetry={refresh}
        isEmpty={viewMode === 'list' && eventsList.length === 0}
        empty={{
          icon: 'calendar-outline',
          title:
            eventScope === 'nearby'
              ? `No events within ${eventRadiusKm} km`
              : eventScope === 'communities'
                ? 'No events in your communities'
                : `No events in ${placeName}`,
          message: describeEmptyEventSearch({
            city: placeName,
            scope: eventScope,
            radiusKm: eventRadiusKm,
            category: selectedEventCat,
            query: eventQuery,
            timeFilter: eventTimeFilter,
            freeOnly: eventFree,
          }),
          action: { label: 'Create Event', onPress: () => router.push('/community-life/event/create') },
        }}
      >
        {viewMode === 'map' ? (
          /* Premium Map Marker Simulation */
          <EventMap eventSearch={eventSearch} lists={lists} />
        ) : eventsList.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => router.push(`/community-life/event/${item.id}`)}
            className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-5 shadow-sm"
            activeOpacity={0.9}
          >
            {/* Cover image area */}
            <View className="relative h-44 bg-surface-muted">
              <View className="w-full h-full justify-center items-center bg-subtle">
                <Ionicons name="image" size={32} color="#9CA3AF" />
              </View>
              
              {/* Pricing Tag Overlay */}
              <View className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full border border-white/10">
                <Text className="text-white text-[10px] font-black uppercase">
                  {describeEventPrice(item)}
                </Text>
              </View>

              {/* RSVP Badge (if RSVP'd) */}
              {item.rsvpStatus && (
                <View className="absolute top-4 left-20 bg-success-solid px-2.5 py-1 rounded-full">
                  <Text className="text-white text-[8px] font-black uppercase">✓ {item.rsvpStatus}</Text>
                </View>
              )}

              {/* Save Heart & Share icon group */}
              <View className="absolute top-4 right-4 flex-row gap-2">
                <TouchableOpacity
                  onPress={() => handleShareEvent(item)}
                  className="w-9 h-9 bg-surface-card/90 rounded-full items-center justify-center shadow"
                >
                  <Ionicons name="share-social-outline" size={17} color={tokens.color.text.secondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSaveToggle(item.id, 'Event')}
                  className="w-9 h-9 bg-surface-card/90 rounded-full items-center justify-center shadow"
                >
                  <Ionicons
                    name={isSaved(item.id) ? 'heart' : 'heart-outline'}
                            size={18}
                            color={isSaved(item.id) ? '#EF4444' : tokens.color.text.secondary}
                  />
                </TouchableOpacity>
              </View>
                    </View>

            {/* Card Body */}
            <View className="p-5">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest">
                    {item.category}
                  </Text>
                  {item.price === 0 && (
                    <Text className="text-[9px] font-black text-success-default bg-surface-muted px-1.5 rounded uppercase">FREE</Text>
                  )}
                </View>
                <Text className="text-[10px] font-bold text-content-faint">
                          ⏱ {item.date} · {item.time}
                        </Text>
              </View>

              <Text className="text-base font-extrabold text-content-primary leading-snug mb-1.5">
                {item.title}
              </Text>

              <Text className="text-xs text-content-tertiary mb-3" numberOfLines={2}>
                {item.description}
              </Text>

              <View className="flex-row items-center justify-between border-t border-faint pt-3">
                <View className="flex-row items-center flex-1 mr-2">
                  <Ionicons name="location-outline" size={13} color="#6B7280" />
                  <Text className="text-xs font-semibold text-content-muted ml-1 flex-shrink" numberOfLines={1}>
                    {[item.location?.areaName, item.location?.cityName]
                      .filter(Boolean)
                      .join(', ')}
                    {/* Only when the server measured it: a search around the member. */}
                    {eventDistanceLabel(item.location?.distanceKm)
                      ? ` · ${eventDistanceLabel(item.location?.distanceKm)}`
                      : ''}
                          </Text>
                        </View>

                {/*
                          Through `eventHost`, because there is no `host` object
                          on the wire — reading `item.host.name` here crashed
                  the whole list the moment one real event came back.
                */}
                <View className="flex-row items-center">
                  <Text className="text-[11px] font-bold text-content-secondary mr-1" numberOfLines={1}>
                    {eventHost(item)?.name ?? ''}
                  </Text>
                  {eventHost(item)?.isVerified && (
                    <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  )}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ListState>
    </View>
    </TourSpotlight>
  );
}
