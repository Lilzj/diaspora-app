// Discover: the first-visit tour for the tab in view, started only while the screen has focus.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import { useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type { TourId } from '@/types/explore';
import { useExploreStore } from '@/store/explore';
import type { DiscoverTab } from '@/components/screens/discover/tabs';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

/** Which first-visit tour belongs to which Discover tab. */
const TOUR_FOR_TAB: Partial<Record<DiscoverTab, TourId>> = {
  Marketplace: 'marketplace',
  Jobs: 'jobs',
  Housing: 'housing',
  Community: 'community-life',
};

export function useDiscoverTour(search: DiscoverSearch) {
  const { activeTab } = search;

  const exploreStore = useExploreStore();

  useEffect(() => {
    // Read through `getState()` rather than the subscribed store object, which
    // is a new reference on every state change: naming that object would re-run
    // this on every change the store makes. `profile.tsx` already loads it this
    // way. The action itself is created once with the store.
    void useExploreStore.getState().loadPersistedState();
  }, []);

  // ── First-visit tours, and why this is a `useFocusEffect` ─────────────────
  //
  // This started a tour 800ms after a tab was tapped, on a plain `useEffect`.
  // Nothing cancelled that timer when the member navigated away, so tapping
  // Marketplace and then opening a listing inside the delay fired the tour on
  // the *listing detail* — a screen where none of its target keys are
  // registered, so it fell through to the centred, full-screen-masked card
  // with no relationship to anything behind it. That is the "tour pops out and
  // disrupts the application" report, and the screenshots show exactly it.
  //
  // `useFocusEffect` tears down when the screen loses focus, so navigating away
  // cancels the pending tour rather than firing it somewhere else.
  //
  // The other two guards matter as much:
  //
  //   * `activeTour` — never stack a second tour over one already running.
  //   * `pausedTourId` — a member who paused chose to stop. `pauseTour` does
  //     not mark the tour completed, so without this it re-offered itself on
  //     every subsequent tab tap.
  useFocusEffect(
    useCallback(() => {
      if (!exploreStore.hasLoadedPersistedState) return;

      const tourId = TOUR_FOR_TAB[activeTab];
      if (!tourId) return;
      if (exploreStore.completedTours.includes(tourId)) return;
      if (exploreStore.activeTour || exploreStore.pausedTourId) return;

      // Still a delay, so child components have registered their layouts — but
      // one that dies with the screen.
      const timer = setTimeout(() => exploreStore.startTour(tourId), 800);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      activeTab,
      exploreStore.hasLoadedPersistedState,
      exploreStore.activeTour,
      exploreStore.pausedTourId,
    ])
  );
}
