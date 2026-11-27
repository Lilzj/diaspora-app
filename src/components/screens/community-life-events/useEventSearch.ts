// Community Life: the Events tab's search, its filters, and list or map.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import { DEFAULT_EVENT_RADIUS_KM } from '@/lib/domain/events-nearby';
import type { EventCategory, Event } from '@/types/community-life';

export function useEventSearch() {
  // --- Events Tab State ---
  const [eventQuery, setEventQuery] = useState('');
  const [selectedEventCat, setSelectedEventCat] = useState<EventCategory | 'All'>('All');
  // What the list is narrowed to (UAT, 3 Nov 2026, item 2): the town, the
  // circle around the member, or the communities they belong to. The route
  // takes a point and a radius, keeps to the circle and measures each event,
  // and narrows to the member's communities; the screen had withdrawn all of
  // them under a banner saying it could not.
  const [eventScope, setEventScope] = useState<'all' | 'nearby' | 'communities'>('all');
  const [eventRadiusKm, setEventRadiusKm] = useState<number>(DEFAULT_EVENT_RADIUS_KM);
  const [eventFree, setEventFree] = useState(false);
  const [eventTimeFilter, setEventTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'weekend'>('all');
  const [eventSortBy, setEventSortBy] = useState<'date' | 'popular' | 'recently_added' | 'nearest'>('date');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedMapEvent, setSelectedMapEvent] = useState<Event | null>(null);

  return {
    eventQuery, setEventQuery, selectedEventCat, setSelectedEventCat, eventScope, setEventScope,
    eventRadiusKm, setEventRadiusKm, eventFree, setEventFree, eventTimeFilter, setEventTimeFilter,
    eventSortBy, setEventSortBy, viewMode, setViewMode, selectedMapEvent, setSelectedMapEvent,
  };
}

/** What `useEventSearch` holds, as the screen reads it. */
export type EventSearch = ReturnType<typeof useEventSearch>;
