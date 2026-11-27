// Community Life: the events, organisations and calendar entries the screen reads, and the loading
// flag all three requests share. Lifted out of `app/community-life/events.tsx` (FSOLID-001), which
// composes it.

import { useState, useEffect } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { useEffectRefresh } from '@/hooks/usePullToRefresh';
import { fetchEvents, fetchOrganizations, fetchCalendar } from '@/lib/api/community-life-api';
import { useConnectivityStore } from '@/lib/platform/connectivity';
import type { Event, OrganizationSearchCard, CalendarEvent } from '@/types/community-life';
import type { EventsTabs } from '@/components/screens/community-life-events/useEventsTabs';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';
import type { EventSearch } from '@/components/screens/community-life-events/useEventSearch';
import type {
  DirectorySearch,
} from '@/components/screens/community-life-events/useDirectorySearch';
import type { EventsCalendar } from '@/components/screens/community-life-events/useEventsCalendar';

/**
 * The Timing chips, as the window `GET /community-life/events` actually binds.
 *
 * The route has no `timeFilter` and never did — it has `startsAfter` and
 * `startsBefore`, both `DateTimeOffset?`. So the named bucket is translated
 * here, in the layer that owns the member's clock and time zone, and the API
 * client is handed a window rather than a word it would have to guess a
 * calendar for.
 *
 * "Weekend" means the coming Saturday and Sunday, inclusive, in the device's own
 * zone — which is the reading a member has when they tap it, and is stated here
 * rather than left to a reader of the request log.
 */
function timingWindow(
  timing: 'all' | 'today' | 'tomorrow' | 'weekend',
  now: Date = new Date()
): { startsAfter?: string; startsBefore?: string } {
  if (timing === 'all') return {};

  const startOfDay = (offsetDays: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const endOfDay = (offsetDays: number) => {
    const d = startOfDay(offsetDays);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  if (timing === 'today') {
    return { startsAfter: startOfDay(0).toISOString(), startsBefore: endOfDay(0).toISOString() };
  }

  if (timing === 'tomorrow') {
    return { startsAfter: startOfDay(1).toISOString(), startsBefore: endOfDay(1).toISOString() };
  }

  // Saturday is day 6. `daysToSaturday` is 0 when today *is* Saturday, so the
  // weekend a member asks for on a Saturday is the one they are standing in.
  const daysToSaturday = (6 - now.getDay() + 7) % 7;
  return {
    startsAfter: startOfDay(daysToSaturday).toISOString(),
    startsBefore: endOfDay(daysToSaturday + 1).toISOString(),
  };
}

export function useCommunityLifeLists(
  tabs: EventsTabs,
  place: EventsPlace,
  eventSearch: EventSearch,
  directorySearch: DirectorySearch,
  calendar: EventsCalendar,
) {
  const { showAlert } = useNotification();
  const { activeTab } = tabs;
  const { selectedLocation, nearbyPoint } = place;
  const {
    eventQuery, selectedEventCat, eventScope, eventRadiusKm, eventFree, eventTimeFilter,
    eventSortBy,
  } = eventSearch;
  const { dirQuery, selectedDirCat } = directorySearch;
  const { customReminders } = calendar;

  const [isLoading, setIsLoading] = useState(false);

  // ── Offline state ──────────────────────────────────────────────────────────
  //
  // This was `useState(false)` driven by a toggle in the header labelled
  // "🔌 OFFLINE / ⚡ ONLINE" — a developer's offline simulator that shipped to
  // members. Flipping it swapped the three fetches for `mockEvents` and
  // `mockOrganizations` and drew a banner reading "Using Cached Data", so a
  // member who pressed it was shown fixture content presented as their own
  // city's saved data.
  //
  // The real answer lives in `lib/connectivity.ts`, which the apiClient's
  // interceptors write on every completed and every failed request, and which
  // OS listeners (`expo-network` on native, `online`/`offline` on web) write
  // from the radio. Reading it means the banner appears when the device is
  // actually offline and disappears when a request actually succeeds — neither
  // of which a toggle or a timer can know.
  const isOffline = useConnectivityStore((state) => !state.isOnline);
  const [isRetrying, setIsRetrying] = useState(false);
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [orgsList, setOrgsList] = useState<OrganizationSearchCard[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Pull to refresh. This screen loads through `useEffect` + `apiClient` rather
  // than TanStack, so there is no `refetch()` to hand over — `useEffectRefresh`
  // is the equivalent, and carries the reasoning for why resolving on
  // `isLoading` needs a three-phase guard.
  const { nonce: refreshNonce, refreshControl } = useEffectRefresh(isLoading);

  // Fetch Events
  useEffect(() => {
    // Offline: do not fetch, and do not substitute anything for the answer.
    //
    // This branch used to `import('@/mocks/community-life-data')` and filter
    // `mockEvents` by the chosen city, which put seven fabricated events under a
    // banner claiming they were the member's cached data. There is no cache on
    // this screen — it holds its results in `useState` and loses them on
    // unmount — so the honest offline state is the one already rendered below:
    // whatever was last fetched this session, and the banner saying why nothing
    // is refreshing.
    if (isOffline) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    // Through `fetchEvents` rather than `apiClient.get` by hand. This screen was
    // building its own query string — `cityName`, `query`, `filterType`,
    // `timeFilter`, `sortBy` — none of which the route binds, and that is
    // precisely the class of bug that having one typed client exists to prevent.
    const isNearby = eventScope === 'nearby' && nearbyPoint !== null;
    fetchEvents({
      // The circle supersedes the town; the member's communities are wherever
      // those communities hold events.
      ...(isNearby
        ? { latitude: nearbyPoint.latitude, longitude: nearbyPoint.longitude, radiusKm: eventRadiusKm }
        : eventScope === 'communities'
          ? {}
          : { cityName: selectedLocation.city || undefined, countryCode: selectedLocation.countryCode || undefined }),
      joinedCommunities: eventScope === 'communities' || undefined,
      category: selectedEventCat,
      query: eventQuery || undefined,
      free: eventFree || undefined,
      // The bucket→window translation lives here because this is the layer that
      // owns the member's clock and time zone. `community-life-api.ts` takes the
      // window and never guesses one.
      ...timingWindow(eventTimeFilter),
      // Nearest needs a point to measure from.
      sortBy: eventSortBy === 'nearest' && !isNearby ? 'date' : eventSortBy,
    }).then(page => {
      setEventsList(page.items);
    }).catch(err => {
      console.error('Failed to load events', err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [selectedLocation, selectedEventCat, eventQuery, eventFree, eventTimeFilter, eventSortBy, eventScope, eventRadiusKm, nearbyPoint, isOffline, refreshNonce]);

  // Fetch Directory Orgs
  useEffect(() => {
    // Same reasoning as the events fetch above: offline means no request, not a
    // fixture directory presented as cached organisations.
    if (isOffline) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchOrganizations({
      cityName: selectedLocation.city || undefined,
      category: selectedDirCat,
      query: dirQuery || undefined,
    }).then(page => {
      setOrgsList(page.items);
    }).catch(err => {
      console.error('Failed to load directory organizations', err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [selectedLocation, selectedDirCat, dirQuery, isOffline, refreshNonce]);

  // Fetch Calendar events
  useEffect(() => {
    if (isOffline) {
      // No request while offline. Unlike the two fetches above this branch never
      // substituted fixtures, so it only needed the state to become truthful.
      return;
    }
    if (activeTab === 'calendar') {
      setIsLoading(true);
      // No city. `GET /community-life/calendar` binds `from`, `to`,
      // `countryCode` and `neighborhoodAreaId` and nothing else, so the
      // `cityName` this used to send was discarded and the calendar has always
      // been the whole feed. The country the chosen city sits in is a real
      // filter and is what the route can actually be asked for; the banner below
      // the tab says which of the two the member is looking at.
      fetchCalendar({ countryCode: selectedLocation.countryCode || undefined }).then(apiData => {
        const mappedReminders = customReminders.map(r => ({
          id: r.id,
          title: r.title,
          date: r.date,
          time: r.time,
          type: 'Reminder' as const,
          color: '#F59E0B'
        }));
        setCalendarEvents([...apiData, ...mappedReminders]);
      }).catch(err => {
        console.error('Failed to load calendar events', err);
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [activeTab, selectedLocation, customReminders, isOffline, refreshNonce]);

  /**
   * Retry: ask the API a real question and report what it answered.
   *
   * This was a 1500ms `setTimeout` that cleared the offline flag and told the
   * member "Connected back to Diaspora network servers." Nothing had been
   * connected back to. The timer could not fail, so the claim was made on a
   * plane, in a tunnel, and behind a captive portal alike — and the member,
   * believing they were online, would read an empty events list as "there are
   * no events near me" rather than "I still have no connection".
   *
   * A real probe fixes both halves. The request is a genuine read this screen
   * already makes, so a success is proof the API is reachable *and* warms the
   * data the member came for. The apiClient's interceptors call
   * `recordSuccess()` / `recordNetworkFailure()` on the way through, so
   * `isOffline` above flips itself — this handler does not set it, because a
   * screen that could set its own connectivity is the defect being removed.
   */
  const handleRetryConnection = async () => {
    setIsRetrying(true);
    try {
      // The same read the screen already loads through, so the probe exercises
      // the real path rather than a route string written out a second time.
      // `fetchEvents` uses the same `apiClient`, so the interceptors that
      // record success and failure still run on the way through (FSOLID-002).
      await fetchEvents({ cityName: selectedLocation.city || undefined });
      // The interceptor has already recorded the success; the banner is gone by
      // the time this alert lands, so it confirms rather than announces.
      showAlert({
        type: 'success',
        title: 'Back online',
        message: 'Diaspora reached the network. Refreshing this screen now.',
      });
    } catch {
      // Deliberately not "something went wrong". The member pressed a button
      // labelled Retry and needs to know the retry itself failed, so that they
      // keep treating what is on screen as stale.
      showAlert({
        type: 'error',
        title: 'Still offline',
        message: 'Diaspora could not reach the network. Nothing on this screen has been refreshed.',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return {
    isLoading, isOffline, isRetrying, eventsList, orgsList, calendarEvents, refreshControl,
    handleRetryConnection,
  };
}

/** What `useCommunityLifeLists` holds, as the screen reads it. */
export type CommunityLifeLists = ReturnType<typeof useCommunityLifeLists>;
