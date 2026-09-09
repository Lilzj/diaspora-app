import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, FlatList, ActivityIndicator, Share, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dialog } from '@/components/overlays/AppModal';
import { Button } from '@/components/Button';
import { useThemeTokens } from '@/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useEffectRefresh } from '@/hooks/usePullToRefresh';
import { Ionicons } from '@expo/vector-icons';
import { TourSpotlight } from '@/components/explore/TourProvider';
import Svg, { Circle, Rect, Path, G } from 'react-native-svg';
import { apiClient } from '@/lib/apiClient';
import { eventHost } from '@/lib/event-host';
import {
  fetchCalendar,
  fetchEvents,
  fetchOrganizations,
  UNSUPPORTED_EVENT_BROWSE_FILTERS,
} from '@/lib/community-life-api';
import { useConnectivityStore } from '@/lib/connectivity';
import { useSavedStore } from '@/store/saved';
import { toDateString } from '@/utils/calendar-date';
import type { Event, CommunityOrganization, CalendarEvent, EventCategory, OrgCategory } from '@/types/community-life';

interface LocationOption {
  city: string;
  country: string;
  /**
   * ISO-3166 alpha-2. The calendar route filters by country and has no city
   * parameter at all, so this is the only thing it can be narrowed by.
   */
  countryCode: string;
  flag: string;
}

const LOCATIONS: LocationOption[] = [
  { city: 'London', country: 'United Kingdom', countryCode: 'GB', flag: '🇬🇧' },
  { city: 'Lagos', country: 'Nigeria', countryCode: 'NG', flag: '🇳🇬' },
  { city: 'Accra', country: 'Ghana', countryCode: 'GH', flag: '🇬🇭' },
];

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

/**
 * What an empty event list should say, given what the search actually narrowed by.
 *
 * <b>It used to say "No events nearby — Be the first to create an event, or
 * expand your filter range!"</b> Both halves were false. The search narrows by
 * city, words, category and date; proximity is not one of the questions the
 * route can be asked, which is exactly what
 * `UNSUPPORTED_EVENT_BROWSE_FILTERS` tells the member a few hundred pixels
 * higher up the same screen. And there is no filter range to expand — the
 * radius control was removed precisely because it emptied every list.
 *
 * So the sentence is built from the filters that are genuinely applied, and the
 * suggestion names only controls that exist on this screen. A member who is
 * told to widen something that is not there learns to distrust the screen.
 */
function describeEmptyEventSearch({
  city,
  category,
  query,
  timeFilter,
  freeOnly,
}: {
  city: string;
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

  // Nothing but the city. There is no filter to relax, so do not imply one.
  if (narrowedBy.length === 0) {
    return `Nothing is listed in ${city} yet. You can change the city from the picker at the top, or be the first to put something on.`;
  }

  const list =
    narrowedBy.length === 1
      ? narrowedBy[0]
      : `${narrowedBy.slice(0, -1).join(', ')} and ${narrowedBy[narrowedBy.length - 1]}`;

  return `Nothing in ${city} matches ${list}. Try another category or a wider date range, or change the city from the picker at the top.`;
}

const EVENT_CATEGORIES: EventCategory[] = [
  'Wedding', 'Naming Ceremony', 'Birthday', 'Graduation', 'Football Match',
  'Basketball', 'Concert', 'Comedy Show', 'Networking', 'Career Fair', 'Job Fair',
  'Business Seminar', 'Conference', 'Training', 'Workshop', 'Church Program',
  'Mosque Event', 'Bible Study', 'Prayer Meeting', 'Youth Program', 'Cultural Festival',
  'Independence Celebration', 'Food Festival', 'Picnic', 'Volunteer Activity',
  'Charity Event', 'Embassy Event', 'Student Orientation', 'Other'
];

const ORG_CATEGORIES: OrgCategory[] = [
  'Churches', 'Mosques', 'Associations', 'Embassies', 'Student Associations',
  'Professional Associations', 'Community Centres', 'NGOs', 'Doctors', 'Lawyers',
  'Accountants', 'Immigration Consultants', 'Cultural Organizations', 'Sports Clubs',
  'Business Associations', 'Volunteer Organizations', 'Restaurants'
];

export default function CommunityLifeScreen() {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const { savedItems, save, unsave, isSaved } = useSavedStore();

  // `?tab=` so a link can land on the right tab. §22 asks for one canonical
  // destination per concept; without this, "the directory" was only reachable by
  // opening the events tab and tapping across, so callers that wanted it either
  // could not say so or invented a second route to say it with.
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'events' | 'directory' | 'calendar' | 'saved'>('events');

  useEffect(() => {
    if (params.tab && ['events', 'directory', 'calendar', 'saved'].includes(params.tab)) {
      setActiveTab(params.tab as typeof activeTab);
    }
  }, [params.tab]);

  // A stack screen with no bottom navigation of its own, so the guard rail is
  // the phone's gesture area plus breathing room. This screen used to reserve
  // nothing: its root is `edges={['top']}` and its body scrolled straight under
  // the gesture bar, which is the state the device capture shows.
  const bottomInset = useBottomInset();

  const [selectedLocation, setSelectedLocation] = useState<LocationOption>(LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
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

  // --- Events Tab State ---
  const [eventQuery, setEventQuery] = useState('');
  const [selectedEventCat, setSelectedEventCat] = useState<EventCategory | 'All'>('All');
  // ── Remediation Wave J — what this screen may and may not ask for ──────────
  //
  // Five controls were removed from this state and from the UI below. Each of
  // them sent a query parameter `GET /community-life/events` does not bind, and
  // an unbound parameter is discarded by the minimal-API model binder with no
  // error — so the request came back 200, unfiltered, and the chip stayed lit.
  // The member operated a control; the server never learned it existed.
  //
  //   `eventFilterType`  the seven discovery buckets. Only "Free" survives, as
  //                      `free=true`, which is a genuine binding. `nearby`,
  //                      `recommended`, `popular`, `recently_added` and `ai` have
  //                      no predicate on the route at all.
  //   `distanceRadius`   a client-side filter on `location.distanceKm`. That
  //                      field is only ever populated when the server resolved a
  //                      geographic centre, which a browse never does — so it was
  //                      always undefined, always compared as 999, and **every
  //                      radius emptied the list**. This was a live defect, not
  //                      just a no-op.
  //   `eventSortBy: 'distance'`
  //                      no centre to measure from; see `community-life-api.ts`.
  //
  // `UNSUPPORTED_EVENT_BROWSE_FILTERS` names them on screen with the reason.
  const [eventFree, setEventFree] = useState(false);
  const [eventTimeFilter, setEventTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'weekend'>('all');
  const [eventSortBy, setEventSortBy] = useState<'date' | 'popular' | 'recently_added'>('date');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedMapEvent, setSelectedMapEvent] = useState<Event | null>(null);

  // --- Directory Tab State ---
  const [dirQuery, setDirQuery] = useState('');
  const [selectedDirCat, setSelectedDirCat] = useState<OrgCategory | 'All'>('All');
  const [orgsList, setOrgsList] = useState<CommunityOrganization[]>([]);

  // --- Calendar Tab State ---
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'agenda'>('month');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  // Today, computed. See DEFECT-013 below: this was the literal '2026-07-13'.
  const [selectedDateStr, setSelectedDateStr] = useState(() => toDateString(new Date()));
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [customReminders, setCustomReminders] = useState<{ id: string; title: string; date: string; time: string; type: 'Reminder' }[]>([]);

  // --- Saved Tab State ---
  const [savedSearchQuery, setSavedSearchQuery] = useState('');

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
    fetchEvents({
      cityName: selectedLocation.city,
      category: selectedEventCat,
      query: eventQuery || undefined,
      free: eventFree || undefined,
      // The bucket→window translation lives here because this is the layer that
      // owns the member's clock and time zone. `community-life-api.ts` takes the
      // window and never guesses one.
      ...timingWindow(eventTimeFilter),
      sortBy: eventSortBy,
    }).then(page => {
      setEventsList(page.items);
    }).catch(err => {
      console.error('Failed to load events', err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [selectedLocation, selectedEventCat, eventQuery, eventFree, eventTimeFilter, eventSortBy, isOffline, refreshNonce]);

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
      cityName: selectedLocation.city,
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
      fetchCalendar({ countryCode: selectedLocation.countryCode }).then(apiData => {
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
      await apiClient.get('/community-life/events', {
        params: { cityName: selectedLocation.city },
      });
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

  // Toggle Saved Item
  const handleSaveToggle = (id: string, type: 'Event' | 'Organization') => {
    if (isSaved(id)) {
      unsave(id);
    } else {
      save(id, type);
    }
  };

  // Share action from card
  const handleShareEvent = async (eventItem: Event) => {
    try {
      const priceText = !eventItem.price || eventItem.price === 0 ? 'FREE' : `£${eventItem.price}`;
      await Share.share({
        message: `Join me at "${eventItem.title}" on ${eventItem.date} (${priceText}) in ${eventItem.location.areaName}! Shared via Diaspora.`,
      });
    } catch (error) {
      console.log('Share failed', error);
    }
  };

  /**
   * Add a note to a calendar day.
   *
   * It used to say *"Reminder Saved — Personal reminder has been added to your
   * calendar."* Two false claims in one sentence: nothing was saved (the note
   * lives in `customReminders`, a `useState` array discarded when the screen
   * unmounts) and nothing was added to any calendar. A member noting the date
   * of their visa appointment would find it gone the next time they opened the
   * tab, having been told it was in their calendar and therefore having no
   * reason to write it down anywhere else. No notification was scheduled
   * either, so the word "reminder" promised a third thing that never happened.
   *
   * **There is no route for this.** `GET /community-life/calendar` is read-only
   * and the CommunityLife module has no reminder concept at all. The Automation
   * module does have `POST /automations/reminders`, but its `SubjectKind` is
   * `event | occurrence | series` — it anchors a reminder to something on the
   * platform and offsets from that moment. It cannot carry a free-text note on
   * an arbitrary date, which is what this control collects. So the capability
   * to build here is "remind me about *this event*", not "save my note", and
   * inventing a client-side calendar is not it.
   *
   * The control keeps working as a scratch note for the current session,
   * because seeing it appear on the grid is genuinely useful while planning —
   * and now says exactly that.
   */
  const handleAddReminder = () => {
    if (!reminderText.trim()) return;
    const newRem = {
      id: `rem-${Date.now()}`,
      title: reminderText,
      date: selectedDateStr,
      time: '09:00',
      type: 'Reminder' as const
    };
    setCustomReminders(prev => [...prev, newRem]);
    setReminderText('');
    setReminderModalOpen(false);
    showAlert({
      type: 'info',
      title: 'Note added for now',
      message: 'This note is only on this screen and will be gone when you leave — write it down somewhere you will see it. Diaspora can remind you about an event you are going to; what it cannot do yet is keep a note of your own against a date you pick.',
    });
  };

  // ── DEFECT-013: the calendar was hardcoded to July 2026 ──────────────────
  //
  // `julyDays` assumed 31 days and a Wednesday start; the grid built its keys
  // as `2026-07-${day}`; the header read "July 2026"; and the **Today** button
  // jumped to `2026-07-13`. So the calendar showed July 2026 for ever, marked
  // the 13th as today for ever, and no event outside that month could be
  // selected on it. Found while driving the events screens on a device.
  //
  // The month is now derived from the clock. `todayStr` is built from local
  // date parts rather than `toISOString()`, which converts to UTC first and
  // west of Greenwich reports yesterday — the same silent-wrong-date bug in a
  // different disguise.
  const todayStr = useMemo(() => toDateString(new Date()), []);

  const calendarMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Monday-first, matching the column headings this grid renders.
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);

    return {
      year,
      month,
      cells,
      label: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      dateStringFor: (day: number) =>
        `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }, []);

  const selectedDateEvents = useMemo(() => {
    return calendarEvents.filter(item => item.date === selectedDateStr);
  }, [calendarEvents, selectedDateStr]);

  // Filtered Saved Content with search query support
  const savedEvents = useMemo(() => {
    const bookmarkedIds: string[] = [];
    savedItems.forEach((type, id) => {
      if (type === 'Event') bookmarkedIds.push(id);
    });
    const matches = eventsList.filter(e => bookmarkedIds.includes(e.id));
    if (!savedSearchQuery) return matches;
    return matches.filter(e => 
      e.title.toLowerCase().includes(savedSearchQuery.toLowerCase()) || 
      e.category.toLowerCase().includes(savedSearchQuery.toLowerCase())
    );
  }, [eventsList, savedItems, savedSearchQuery]);

  const followedOrgs = useMemo(() => {
    const bookmarkedIds: string[] = [];
    savedItems.forEach((type, id) => {
      if (type === 'Organization') bookmarkedIds.push(id);
    });
    const matches = orgsList.filter(o => bookmarkedIds.includes(o.id));
    if (!savedSearchQuery) return matches;
    return matches.filter(o => 
      o.name.toLowerCase().includes(savedSearchQuery.toLowerCase()) || 
      o.category.toLowerCase().includes(savedSearchQuery.toLowerCase())
    );
  }, [orgsList, savedItems, savedSearchQuery]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* 1. Offline Mode Banner */}
      {isOffline && (
        <View className="bg-amber-500 px-6 py-2 flex-row justify-between items-center z-20">
          <View className="flex-row items-center">
            <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" className="mr-2" />
            {/*
              Was "Offline Mode (Using Cached Data)". There is no cache: the
              lists live in `useState` and are empty on a cold start. The banner
              now says what is actually true — the screen is not refreshing —
              rather than vouching for data that may not exist.
            */}
            <Text className="text-white text-xs font-bold">Offline — this screen is not refreshing</Text>
          </View>
          <TouchableOpacity
            onPress={handleRetryConnection}
            className="bg-surface-card/20 px-3 py-1 rounded-lg"
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white text-[10px] font-black uppercase">Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Top Header Panel */}
      <View className="bg-surface-card border-b border-faint px-6 py-4 flex-row items-center justify-between shadow-sm z-10">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-black text-content-primary tracking-tight">Community Life</Text>
            {/* Location Switcher */}
            <TouchableOpacity
              onPress={() => setIsLocationModalOpen(true)}
              className="flex-row items-center mt-0.5"
              activeOpacity={0.7}
            >
              <Text className="text-xs font-bold text-primary-500 mr-1">
                📍 {selectedLocation.city} {selectedLocation.flag}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#F59300" />
            </TouchableOpacity>
          </View>
        </View>

        {/*
          The offline simulator that used to sit here is gone.

          It was a header button reading "🔌 OFFLINE" / "⚡ ONLINE" that flipped
          a local boolean, and it shipped to members. Pressing it did not
          disconnect anything — it swapped three live fetches for fixture arrays
          and raised a banner claiming the fixtures were the member's cached
          data. A control that fakes the one condition a member most needs
          reported accurately has no member-facing purpose; offline is now
          observed rather than chosen.
        */}
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => router.push('/create')}
            className="bg-primary-500 p-2.5 rounded-full items-center justify-center shadow-md"
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. Horizontal Tab Navigation */}
      <View className="bg-surface-card border-b border-faint flex-row px-4 justify-between">
        {[
          { key: 'events', label: 'Events', icon: '🎉' },
          { key: 'directory', label: 'Directory', icon: '🏛' },
          { key: 'calendar', label: 'Calendar', icon: '📅' },
          { key: 'saved', label: 'Saved', icon: '⭐' }
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              className={`flex-row items-center py-3.5 px-3 border-b-2 ${
                isActive ? 'border-primary-500' : 'border-transparent'
              }`}
            >
              <Text className="text-sm mr-1.5">{tab.icon}</Text>
              <Text
                className={`text-xs font-black ${
                  isActive ? 'text-primary-500' : 'text-content-muted'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/*
        The destination tiles that used to be reached from here live on the
        landing page at `/community-life`, which is where this screen is opened
        from. No link back to it: the header's back button already does that,
        and a card pointing at the page you arrived from is how this pair became
        two screens linking to each other in the first place.
      */}

      {/* 4. Tab Contents */}
      {isLoading ? (
        /* Accessibility Skeleton Loading State */
        <View className="flex-1 p-6 gap-4">
          <View className="h-44 bg-subtle rounded-3xl animate-pulse" />
          <View className="h-6 bg-subtle rounded w-2/3" />
          <View className="h-4 bg-subtle rounded w-1/2" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          refreshControl={refreshControl}
        >
          
          {/* ==================== EVENTS TAB ==================== */}
          {activeTab === 'events' && (
            <TourSpotlight spotlightKey="community_events_list">
            <View className="p-5">
              
              {/* Search Bar & View Mode Toggle */}
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1 flex-row bg-surface-card border border-subtle h-12 rounded-2xl px-4 items-center shadow-sm">
                  <Ionicons name="search-outline" size={18} color="#9CA3AF" className="mr-2" />
                  <TextInput
                    placeholder={`Search events in ${selectedLocation.city}...`}
                    value={eventQuery}
                    onChangeText={setEventQuery}
                    className="flex-1 text-xs font-semibold text-content-strong"
                    placeholderTextColor={tokens.color.text.placeholder}
                  />
                </View>
                
                {/* View Toggles */}
                <TouchableOpacity
                  onPress={() => {
                    setViewMode(viewMode === 'list' ? 'map' : 'list');
                    setSelectedMapEvent(null);
                  }}
                  className="bg-surface-card border border-subtle w-12 h-12 rounded-2xl items-center justify-center shadow-sm"
                >
                  <Ionicons name={viewMode === 'list' ? 'map-outline' : 'list-outline'} size={20} color={tokens.color.text.secondary} />
                </TouchableOpacity>
              </View>

              {/* Discovery filters — only the ones the event search binds.
                *
                * "Free" is the whole row now. See
                * `UNSUPPORTED_EVENT_BROWSE_FILTERS` for the five that were
                * withdrawn and the note below, which names them to the member
                * rather than letting them vanish between releases.
                */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                {[
                  { key: 'all' as const, label: 'All Events' },
                  { key: 'free' as const, label: '💰 Free Events' },
                ].map((chip) => {
                  const isSelected = eventFree === (chip.key === 'free');
                  return (
                    <TouchableOpacity
                      key={chip.key}
                      onPress={() => setEventFree(chip.key === 'free')}
                      className={`px-4 py-2 rounded-full mr-2 border ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Sort & Time filter */}
              <View className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3 gap-3">
                {/* Sort — the three orderings the route can be asked for */}
                <View className="flex-row justify-between items-center">
                  <Text className="text-[10px] font-black text-content-muted uppercase">Sort</Text>
                  <View className="flex-row gap-1.5">
                    {[
                      { key: 'date' as const, label: 'Soonest' },
                      { key: 'popular' as const, label: 'Popular' },
                      { key: 'recently_added' as const, label: 'Newest' },
                    ].map(s => (
                      <TouchableOpacity
                        key={s.key}
                        onPress={() => setEventSortBy(s.key)}
                        className={`px-2 py-1 rounded-lg border ${
                          eventSortBy === s.key ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
                      >
                        <Text className={`text-[9px] font-black ${
                          eventSortBy === s.key ? 'text-primary-500' : 'text-content-tertiary'
                        }`}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Time filter — sent as an explicit start window, not a bucket */}
                <View className="flex-row justify-between items-center border-t border-faint pt-2.5">
                  <Text className="text-[10px] font-black text-content-muted uppercase">Timing</Text>
                  <View className="flex-row gap-1.5">
                    {[
                      { key: 'all' as const, label: 'Anytime' },
                      { key: 'today' as const, label: 'Today' },
                      { key: 'tomorrow' as const, label: 'Tomorrow' },
                      { key: 'weekend' as const, label: 'Weekend' }
                    ].map(t => (
                      <TouchableOpacity
                        key={t.key}
                        onPress={() => setEventTimeFilter(t.key)}
                        className={`px-2 py-1 rounded-lg border ${
                          eventTimeFilter === t.key ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                        }`}
                      >
                        <Text className={`text-[9px] font-black ${
                          eventTimeFilter === t.key ? 'text-primary-500' : 'text-content-tertiary'
                        }`}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* The filters that are gone, and why.
                *
                * Named rather than silently deleted. A member who used "Nearby"
                * last week is owed an explanation, and "Diaspora cannot filter
                * events by" is a truer thing to read than a chip that lights up
                * and changes nothing.
                */}
              <View className="bg-surface-muted border border-faint rounded-2xl p-3 mb-4">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name="information-circle-outline" size={13} color={tokens.color.text.placeholder} />
                  <Text className="text-[10px] font-black text-content-tertiary uppercase">
                    Diaspora cannot filter events by
                  </Text>
                </View>
                <Text className="text-[11px] text-content-tertiary leading-4">
                  {UNSUPPORTED_EVENT_BROWSE_FILTERS.map((f) => f.label).join(' · ')}
                </Text>
                <Text className="text-[10px] text-content-muted leading-4 mt-1">
                  The event search narrows by words, category, city and date. Distance is not one of
                  the questions it can be asked, so those controls were removed rather than left to
                  look as though they worked.
                </Text>
              </View>

              {/* Category selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 pb-1">
                <TouchableOpacity
                  onPress={() => setSelectedEventCat('All')}
                  className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                    selectedEventCat === 'All' ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                  }`}
                >
                  <Text className={`text-[11px] font-bold ${selectedEventCat === 'All' ? 'text-primary-500' : 'text-content-tertiary'}`}>
                    All Categories
                  </Text>
                </TouchableOpacity>
                {EVENT_CATEGORIES.map((cat) => {
                  const isSelected = selectedEventCat === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedEventCat(cat)}
                      className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                        isSelected ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                      }`}
                    >
                      <Text className={`text-[11px] font-bold ${isSelected ? 'text-primary-500' : 'text-content-tertiary'}`}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* View Rendering */}
              {viewMode === 'map' ? (
                /* Premium Map Marker Simulation */
                <View className="mb-4">
                  <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm relative overflow-hidden h-[340px]">
                    {/* Simulated vector map blocks */}
                    <View className="absolute inset-0 bg-[#EBF3F9]">
                      <Svg height="100%" width="100%">
                        {/* River */}
                        <Path d="M0,150 Q100,120 200,180 T400,160 L400,240 Q300,220 200,240 T0,200 Z" fill="#A5C9EB" />
                        {/* Grid Roads */}
                        <Rect x="50" y="0" width="10" height="340" fill="#FFFFFF" />
                        <Rect x="200" y="0" width="12" height="340" fill="#FFFFFF" />
                        <Rect x="320" y="0" width="8" height="340" fill="#FFFFFF" />
                        <Rect x="0" y="100" width="400" height="10" fill="#FFFFFF" />
                        <Rect x="0" y="260" width="400" height="12" fill="#FFFFFF" />
                        
                        {/* Park Block */}
                        <Rect x="75" y="20" width="100" height="60" rx="10" fill="#C5E8C5" />
                        <Text style={{ position: 'absolute', top: 40, left: 95 }} className="text-[10px] font-black text-content-muted uppercase tracking-widest">Green Park</Text>
                      </Svg>
                    </View>

                    {/* Interactive Marker Pins */}
                    {eventsList.map((item, idx) => {
                      const positions = [
                        { top: 50, left: 60 },
                        { top: 140, left: 180 },
                        { top: 70, left: 280 },
                        { top: 220, left: 90 },
                        { top: 280, left: 240 }
                      ];
                      const pos = positions[idx % positions.length];
                      const isSelected = selectedMapEvent?.id === item.id;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => setSelectedMapEvent(item)}
                          className="absolute w-8 h-8 items-center justify-center"
                          style={{ top: pos.top, left: pos.left }}
                        >
                          <Ionicons
                            name="pin"
                            size={isSelected ? 32 : 24}
                            color={isSelected ? '#EF4444' : '#F59300'}
                          />
                        </TouchableOpacity>
                      );
                    })}

                    {/* Callout Overlay */}
                    {selectedMapEvent && (
                      <View className="absolute bottom-4 left-4 right-4 bg-surface-card/95 rounded-2xl p-3 border border-subtle shadow-xl flex-row items-center">
                        <View className="flex-1 mr-2">
                          <Text className="text-[8px] font-black text-primary-500 uppercase tracking-widest">{selectedMapEvent.category}</Text>
                          <Text className="text-xs font-black text-content-primary leading-tight mt-0.5" numberOfLines={1}>{selectedMapEvent.title}</Text>
                          <Text className="text-[9px] text-content-muted font-bold mt-0.5">📍 {selectedMapEvent.location.areaName} · {selectedMapEvent.date}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => router.push(`/community-life/event/${selectedMapEvent.id}`)}
                          className="bg-primary-500 px-3.5 py-2 rounded-xl"
                        >
                          <Text className="text-white font-black text-[10px]">DETAILS</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text className="text-[10px] text-content-faint font-bold text-center">Tap red markers to view event callouts</Text>
                </View>
              ) : eventsList.length > 0 ? (
                eventsList.map((item) => (
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
                          {!item.price || item.price === 0 ? 'FREE' : `£${item.price}`}
                        </Text>
                      </View>

                      {/* RSVP Badge (if RSVP'd) */}
                      {item.rsvpStatus && (
                        <View className="absolute top-4 left-20 bg-success-default px-2.5 py-1 rounded-full">
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
                            color={isSaved(item.id) ? '#EF4444' : '#4B5563'}
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
                            <Text className="text-[9px] font-black text-success-default bg-success-surface px-1.5 rounded uppercase">FREE</Text>
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
                        <View className="flex-row items-center">
                          <Ionicons name="location-outline" size={13} color="#6B7280" />
                          <Text className="text-xs font-semibold text-content-muted ml-1">
                            {[item.location?.areaName, item.location?.cityName]
                              .filter(Boolean)
                              .join(', ')}
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
                ))
              ) : (
                <EmptyState
                  title={`No events in ${selectedLocation.city}`}
                  desc={describeEmptyEventSearch({
                    city: selectedLocation.city,
                    category: selectedEventCat,
                    query: eventQuery,
                    timeFilter: eventTimeFilter,
                    freeOnly: eventFree,
                  })}
                  actionText="Create Event"
                  onPressAction={() => router.push('/community-life/event/create')}
                />
              )}
            </View>
            </TourSpotlight>
          )}

          {/* ==================== DIRECTORY TAB ==================== */}
          {activeTab === 'directory' && (
            <TourSpotlight spotlightKey="community_organizations_directory">
            <View className="p-5">
              
              {/* Search Bar */}
              <View className="flex-row bg-surface-card border border-subtle h-12 rounded-2xl px-4 items-center shadow-sm mb-4">
                <Ionicons name="search-outline" size={18} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder={`Search hubs, lawyers, accountants in ${selectedLocation.city}...`}
                  value={dirQuery}
                  onChangeText={setDirQuery}
                  className="flex-1 text-xs font-semibold text-content-strong"
                  placeholderTextColor={tokens.color.text.placeholder}
                />
              </View>

              {/* Directory Categories */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 pb-1">
                <TouchableOpacity
                  onPress={() => setSelectedDirCat('All')}
                  className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                    selectedDirCat === 'All' ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                  }`}
                >
                  <Text className={`text-[11px] font-bold ${selectedDirCat === 'All' ? 'text-primary-500' : 'text-content-tertiary'}`}>
                    All Organizations
                  </Text>
                </TouchableOpacity>
                {ORG_CATEGORIES.map((cat) => {
                  const isSelected = selectedDirCat === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedDirCat(cat)}
                      className={`px-3 py-1.5 rounded-xl mr-2.5 ${
                        isSelected ? 'bg-primary-50 border border-primary-300' : 'bg-surface-muted'
                      }`}
                    >
                      <Text className={`text-[11px] font-bold ${isSelected ? 'text-primary-500' : 'text-content-tertiary'}`}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Directory Org Cards */}
              {orgsList.length > 0 ? (
                orgsList.map((org) => {
                  const isFollowing = isSaved(org.id);
                  return (
                    <TouchableOpacity
                      key={org.id}
                      onPress={() => router.push(`/community-life/org/${org.id}`)}
                      className="bg-surface-card rounded-3xl border border-subtle p-4 mb-4 flex-row items-center shadow-sm"
                      activeOpacity={0.9}
                    >
                      <View className="w-16 h-16 rounded-2xl bg-surface-muted justify-center items-center mr-4 overflow-hidden border border-subtle">
                        <Ionicons name="home" size={24} color="#6B7280" />
                      </View>

                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center flex-wrap gap-1 mb-1">
                          <Text className="text-[9px] font-black text-primary-500 bg-primary-50 px-2 py-0.5 rounded uppercase">
                            {org.category}
                          </Text>
                          {org.isVerified && (
                            <View className="bg-success-surface px-1.5 py-0.5 rounded flex-row items-center">
                              <Text className="text-[8px] font-extrabold text-success-default mr-0.5">✓ VERIFIED</Text>
                            </View>
                          )}
                        </View>
                        
                        <Text className="text-sm font-black text-content-primary leading-snug" numberOfLines={1}>
                          {org.name}
                        </Text>
                        
                        <Text className="text-[11px] text-content-muted font-semibold mt-0.5">
                          📍 {org.location.areaName} · {org.followersCount} followers
                        </Text>
                      </View>

                      {/* Follow Action */}
                      <TouchableOpacity
                        onPress={() => handleSaveToggle(org.id, 'Organization')}
                        className={`px-3 py-1.5 rounded-full border ${
                          isFollowing ? 'bg-surface-background border-subtle' : 'bg-primary-500 border-primary-500'
                        }`}
                      >
                        <Text className={`text-[10px] font-black ${isFollowing ? 'text-content-muted' : 'text-white'}`}>
                          {isFollowing ? 'Following' : '+ Follow'}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <EmptyState
                  title="No organizations found"
                  desc="We couldn't find any listings matching your search. Create one now!"
                  actionText="Register Hub"
                  onPressAction={() => router.push('/community-life/org/create')}
                />
              )}
            </View>
            </TourSpotlight>
          )}

          {/* ==================== CALENDAR TAB ==================== */}
          {activeTab === 'calendar' && (
            <View className="p-5">
              
              {/* Header Toggles: Today / Reminder / View Mode */}
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setSelectedDateStr(todayStr)}
                    className="bg-surface-card border border-subtle px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-xs font-bold text-content-secondary">Today</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => setReminderModalOpen(true)}
                    className="bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-xs font-bold text-primary-500">+ Reminder</Text>
                  </TouchableOpacity>
                </View>

                {/* View toggles */}
                <View className="flex-row bg-surface-card border border-subtle rounded-xl p-1">
                  {['month', 'week', 'agenda'].map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setCalendarView(mode as any)}
                      className={`px-2.5 py-1 rounded-lg ${
                        calendarView === mode ? 'bg-primary-500' : 'transparent'
                      }`}
                    >
                      <Text className={`text-[10px] font-black uppercase ${
                        calendarView === mode ? 'text-white' : 'text-content-muted'
                      }`}>
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Calendar Grid rendering */}
              {calendarView === 'month' && (
                <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm mb-5">
                  <View className="flex-row justify-between items-center mb-3 px-1">
                    <Text className="text-base font-black text-content-strong">{calendarMonth.label}</Text>
                    <View className="bg-surface-background px-2 py-0.5 rounded border border-subtle">
                      <Text className="text-[8px] font-black text-content-muted uppercase">Cached Calendar Mode</Text>
                    </View>
                  </View>

                  {/* Weekdays */}
                  <View className="flex-row mb-2">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                      <Text key={idx} className="flex-1 text-center text-xs font-extrabold text-content-faint">
                        {day}
                      </Text>
                    ))}
                  </View>

                  {/* Days */}
                  <View className="flex-row flex-wrap">
                    {calendarMonth.cells.map((dayNum, idx) => {
                      if (dayNum === null) return <View key={idx} className="w-[14.28%] aspect-square" />;
                      const dateString = calendarMonth.dateStringFor(dayNum);
                      const isSelected = selectedDateStr === dateString;
                      const isToday = dateString === todayStr;
                      const dayEvents = calendarEvents.filter(e => e.date === dateString);
                      const hasEvents = dayEvents.length > 0;

                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => setSelectedDateStr(dateString)}
                          className={`w-[14.28%] aspect-square items-center justify-center rounded-xl p-1 relative ${
                            isSelected ? 'bg-primary-500' : isToday ? 'bg-surface-muted' : 'transparent'
                          }`}
                        >
                          <Text className={`text-xs font-black ${
                            isSelected ? 'text-white' : isToday ? 'text-primary-500' : 'text-content-strong'
                          }`}>
                            {dayNum}
                          </Text>
                          {hasEvents && (
                            <View className={`w-1 h-1 rounded-full absolute bottom-1 ${
                              isSelected ? 'bg-surface-card' : 'bg-primary-500'
                            }`} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Day Agenda Details */}
              <View>
                <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">
                  Schedule for {selectedDateStr}
                </Text>
                
                {selectedDateEvents.length > 0 ? (
                  selectedDateEvents.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => {
                        if (item.type === 'Event') router.push(`/community-life/event/${item.associatedId}`);
                      }}
                      className="bg-surface-card border border-subtle p-4 rounded-2xl flex-row items-center mb-3 shadow-sm"
                      disabled={item.type !== 'Event'}
                    >
                      <View
                        className="w-3 h-10 rounded-full mr-3"
                        style={{ backgroundColor: item.color || '#F59300' }}
                      />
                      <View className="flex-1">
                        <Text className="text-[9px] font-black uppercase text-content-muted">
                          {item.type} {item.time ? `· ${item.time}` : ''}
                        </Text>
                        <Text className="text-sm font-black text-content-strong">{item.title}</Text>
                      </View>
                      {item.type === 'Event' && <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-8">
                    <Ionicons name="cafe-outline" size={32} color="#D1D5DB" />
                    <Text className="text-xs text-content-faint font-bold mt-2">No schedules or reminders for this date</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ==================== SAVED TAB ==================== */}
          {activeTab === 'saved' && (
            <View className="p-5">
              
              {/* Search bar inside Saved Tab to search saved items */}
              <View className="flex-row bg-surface-card border border-subtle h-11 rounded-2xl px-4 items-center shadow-sm mb-5">
                <Ionicons name="search-outline" size={16} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder="Search saved events & followed hubs..."
                  value={savedSearchQuery}
                  onChangeText={setSavedSearchQuery}
                  className="flex-1 text-xs font-semibold text-content-strong"
                  placeholderTextColor={tokens.color.text.placeholder}
                />
              </View>

              {/* Saved Events */}
              <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3.5">
                Saved Events ({savedEvents.length})
              </Text>
              
              {savedEvents.length > 0 ? (
                savedEvents.map((evt) => (
                  <TouchableOpacity
                    key={evt.id}
                    onPress={() => router.push(`/community-life/event/${evt.id}`)}
                    className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
                    activeOpacity={0.9}
                  >
                    <View className="w-16 h-16 rounded-2xl bg-subtle mr-4 overflow-hidden justify-center items-center">
                      <Ionicons name="sparkles" size={24} color="#6B7280" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[9px] font-black text-primary-500 uppercase">{evt.category}</Text>
                      <Text className="text-sm font-black text-content-primary mt-0.5" numberOfLines={1}>
                        {evt.title}
                      </Text>
                      <Text className="text-xs text-content-muted font-bold mt-0.5">
                        🗓 {evt.date} · {evt.location.areaName}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-8 mb-6">
                  <Ionicons name="bookmark-outline" size={28} color="#D1D5DB" />
                  <Text className="text-xs text-content-faint font-bold mt-2">No saved events match search</Text>
                </View>
              )}

              {/* Followed Organizations */}
              <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3.5 mt-4">
                Followed Hubs ({followedOrgs.length})
              </Text>
              
              {followedOrgs.length > 0 ? (
                followedOrgs.map((org) => (
                  <TouchableOpacity
                    key={org.id}
                    onPress={() => router.push(`/community-life/org/${org.id}`)}
                    className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
                    activeOpacity={0.9}
                  >
                    <View className="w-16 h-16 rounded-2xl bg-subtle mr-4 overflow-hidden justify-center items-center">
                      <Ionicons name="home" size={24} color="#6B7280" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[9px] font-black text-primary-500 uppercase">{org.category}</Text>
                      <Text className="text-sm font-black text-content-primary mt-0.5" numberOfLines={1}>
                        {org.name}
                      </Text>
                      <Text className="text-xs text-content-muted font-bold mt-0.5">
                        📍 {org.location.areaName} · {org.followersCount} followers
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-8">
                  <Ionicons name="people-outline" size={28} color="#D1D5DB" />
                  <Text className="text-xs text-content-faint font-bold mt-2">Not following any hubs yet</Text>
                </View>
              )}

            </View>
          )}

          <View className="h-10" />
        </ScrollView>
      )}

      {/* --- Overlay Modal: Location Picker --- */}
      <Modal
        visible={isLocationModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsLocationModalOpen(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsLocationModalOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-3xl p-6 min-h-[280px] shadow-2xl w-full">
              <View className="flex-row items-center justify-between mb-5">
                <Text className="text-lg font-black text-content-primary">Select Location</Text>
                <TouchableOpacity onPress={() => setIsLocationModalOpen(false)}>
                  <Text className="text-primary-500 font-bold text-sm">Close</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={LOCATIONS}
                keyExtractor={(item) => item.city}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedLocation(item);
                      setIsLocationModalOpen(false);
                    }}
                    className="flex-row items-center justify-between py-4 border-b border-faint active:bg-surface-background"
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{item.flag}</Text>
                      <Text className="text-base font-bold text-content-strong">
                        {item.city}, {item.country}
                      </Text>
                    </View>
                    {selectedLocation.city === item.city && (
                      <Ionicons name="checkmark" size={20} color="#F59300" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* --- Overlay Modal: Create Reminder --- */}
      {/* Was a hand-rolled centred Modal with no keyboard handling, so the
          multiline field and both buttons could sit behind the IME. The shared
          Dialog brings the keyboard avoidance, the scrim, the safe-area inset
          and the back-button contract with it. */}
      {/* Was titled "Add Personal Reminder" with a "Save Reminder" button. Both
          words were promises the platform cannot keep — nothing is saved and no
          reminder is ever sent. It is named a note now, and says up front that
          it does not persist, so the member decides knowing that. */}
      <Dialog
        visible={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        title="Add a note to this day"
        subtitle={`${selectedDateStr} · not saved — this note disappears when you leave the screen`}
        testID="reminder-dialog"
        footer={
          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="neutral"
              fullWidth={false}
              className="flex-1"
              onPress={() => setReminderModalOpen(false)}
            />
            <Button
              label="Add note"
              fullWidth={false}
              className="flex-1"
              disabled={!reminderText.trim()}
              onPress={handleAddReminder}
            />
          </View>
        }
      >
        <TextInput
          placeholder="e.g. Call embassy to check visa status..."
          placeholderTextColor={tokens.color.text.placeholder}
          value={reminderText}
          onChangeText={setReminderText}
          accessibilityLabel="Reminder"
          className="bg-surface-background border border-subtle rounded-xl p-4 text-sm font-semibold"
          style={{ color: tokens.color.text.primary, minHeight: 88, textAlignVertical: 'top' }}
          multiline
        />
      </Dialog>

    </SafeAreaView>
  );
}

// Reusable Empty State helper
function EmptyState({ title, desc, actionText, onPressAction }: { title: string; desc: string; actionText: string; onPressAction: () => void }) {
  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-6 items-center py-10 shadow-sm mt-2">
      <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
      <Text className="text-base font-extrabold text-content-strong mt-3">{title}</Text>
      <Text className="text-xs text-content-muted mt-1 text-center leading-relaxed max-w-[220px]">
        {desc}
      </Text>
      <TouchableOpacity
        onPress={onPressAction}
        className="bg-primary-500 px-5 py-2.5 rounded-full mt-5"
      >
        <Text className="text-white font-bold text-xs">{actionText}</Text>
      </TouchableOpacity>
    </View>
  );
}
