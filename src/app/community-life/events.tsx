// This route composes the screen. Each concern is a hook and each part of the page a section,
// in `src/components/screens/community-life-events`; the hooks run in the order below and the
// sections read them as props (FSOLID-001).
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useEventsTabs } from '@/components/screens/community-life-events/useEventsTabs';
import { useEventsPlace } from '@/components/screens/community-life-events/useEventsPlace';
import { useEventSearch } from '@/components/screens/community-life-events/useEventSearch';
import { useDirectorySearch } from '@/components/screens/community-life-events/useDirectorySearch';
import { useEventsCalendar } from '@/components/screens/community-life-events/useEventsCalendar';
import {
  useCommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';
import { useSavedItems } from '@/components/screens/community-life-events/useSavedItems';
import { OfflineBanner } from '@/components/screens/community-life-events/OfflineBanner';
import { EventsHeader } from '@/components/screens/community-life-events/EventsHeader';
import { EventsTabBar } from '@/components/screens/community-life-events/EventsTabBar';
import { EventsTab } from '@/components/screens/community-life-events/EventsTab';
import { DirectoryTab } from '@/components/screens/community-life-events/DirectoryTab';
import { CalendarTab } from '@/components/screens/community-life-events/CalendarTab';
import { SavedTab } from '@/components/screens/community-life-events/SavedTab';
import { LocationModal } from '@/components/screens/community-life-events/LocationModal';
import { ReminderDialog } from '@/components/screens/community-life-events/ReminderDialog';

export default function CommunityLifeScreen() {
  // A stack screen with no bottom navigation of its own, so the guard rail is
  // the phone's gesture area plus breathing room. This screen used to reserve
  // nothing: its root is `edges={['top']}` and its body scrolled straight under
  // the gesture bar, which is the state the device capture shows.
  const bottomInset = useBottomInset();
  const tabs = useEventsTabs();
  const place = useEventsPlace();
  const eventSearch = useEventSearch();
  const directorySearch = useDirectorySearch();
  const calendar = useEventsCalendar();
  const lists = useCommunityLifeLists(tabs, place, eventSearch, directorySearch, calendar);
  const saved = useSavedItems(lists);

  const { activeTab } = tabs;
  const { isOffline, refreshControl } = lists;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* 1. Offline Mode Banner */}
      {isOffline && (
        <OfflineBanner lists={lists} />
      )}

      {/* 2. Top Header Panel */}
      <EventsHeader place={place} />

      {/* 3. Horizontal Tab Navigation */}
      <EventsTabBar tabs={tabs} />

      {/*
        The destination tiles that used to be reached from here live on the
        landing page at `/community-life`, which is where this screen is opened
        from. No link back to it: the header's back button already does that,
        and a card pointing at the page you arrived from is how this pair became
        two screens linking to each other in the first place.
      */}

      {/* 4. Tab Contents. Each tab draws its own list state under its own search and
          filters (FARCH-007). A skeleton used to replace this whole ScrollView while any
          of the three reads ran, which unmounted the search field mid-word and the
          pull-to-refresh with it. */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={refreshControl}
      >

        {/* ==================== EVENTS TAB ==================== */}
        {activeTab === 'events' && (
          <EventsTab eventSearch={eventSearch} lists={lists} place={place} saved={saved} />
        )}

        {/* ==================== DIRECTORY TAB ==================== */}
        {activeTab === 'directory' && (
          <DirectoryTab
            directorySearch={directorySearch}
            lists={lists}
            place={place}
            saved={saved}
          />
        )}

        {/* ==================== CALENDAR TAB ==================== */}
        {activeTab === 'calendar' && (
          <CalendarTab calendar={calendar} lists={lists} />
        )}

        {/* ==================== SAVED TAB ==================== */}
        {activeTab === 'saved' && (
          <SavedTab saved={saved} lists={lists} />
        )}

        <View className="h-10" />
      </ScrollView>

      {/* --- Overlay Modal: Location Picker --- */}
      <LocationModal place={place} />

      {/* --- Overlay Modal: Create Reminder --- */}
      {/* Was a hand-rolled centred Modal with no keyboard handling, so the
          multiline field and both buttons could sit behind the IME. The shared
          Dialog brings the keyboard avoidance, the scrim, the safe-area inset
          and the back-button contract with it. */}
      {/* Was titled "Add Personal Reminder" with a "Save Reminder" button. Both
          words were promises the platform cannot keep — nothing is saved and no
          reminder is ever sent. It is named a note now, and says up front that
          it does not persist, so the member decides knowing that. */}
      <ReminderDialog calendar={calendar} />

    </SafeAreaView>
  );
}
