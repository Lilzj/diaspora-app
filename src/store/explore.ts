import { create } from 'zustand';
import { exploreStorage } from '@/lib/storage/exploreStorage';
import { TourId, TourStep, TourAnalyticsEvent, FeatureDiscoveryAnalyticsEvent, Tutorial } from '@/types/explore';
import { getTourConfig, FEATURE_TOURS, CURRENT_PLATFORM_VERSION } from '@/config/featureRegistry';

interface ElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
}

interface ExploreState {
  // Long-lived (Persisted) State
  completedTutorials: string[];
  completedTours: string[];
  dismissedAnnouncements: string[];
  bookmarks: string[];
  onboardingCompleted: boolean;
  recentlyViewed: string[];
  preferredLanguage: string;
  helpSearchHistory: string[];

  // Transient UI State
  activeTour: TourId | null;
  currentStepIndex: number;
  pausedTourId: TourId | null;
  pausedStepIndex: number;
  registeredElements: Record<string, ElementLayout>;
  unlockedFeatures: string[];
  hasLoadedPersistedState: boolean;
  tourInitiatorElementRef: any | null; // For accessibility focus return

  // Actions - Persistence
  loadPersistedState: () => Promise<void>;
  resetAllProgress: () => Promise<void>;

  // Actions - Element Registry
  registerElementLayout: (key: string, layout: ElementLayout | null) => void;

  // Actions - Guided Tour
  startTour: (tourId: TourId, initiatorRef?: any) => void;
  nextStep: () => void;
  prevStep: () => void;
  pauseTour: () => void;
  resumeTour: () => void;
  skipTour: () => void;
  finishTour: () => void;
  /**
   * The member has declined the welcome tour from the modal, before any tour
   * started. Separate from `skipTour` on purpose — see its implementation.
   */
  completeOnboarding: () => void;
  replayTour: (tourId: TourId, initiatorRef?: any) => void;

  // Actions - Tutorials & Bookmarks
  toggleSaveTutorial: (tutorialId: string) => Promise<void>;
  completeTutorial: (tutorialId: string) => Promise<void>;
  viewTutorial: (tutorialId: string) => Promise<void>;
  addSearchTerm: (term: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;

  // Actions - Progressive Feature Announcements
  triggerFeatureUnlock: (featureName: string) => void;
  dismissUnlock: (featureName: string) => void;
  dismissAnnouncement: (version: string) => Promise<void>;
}

// Loggers to simulate backend telemetry logging
const trackTourAnalytics = (event: TourAnalyticsEvent) => {
  console.log('📊 [TELEMETRY] Tour Analytics Tracked:', event);
};

const trackFeatureDiscoveryAnalytics = (event: FeatureDiscoveryAnalyticsEvent) => {
  console.log('📊 [TELEMETRY] Feature Discovery Analytics Tracked:', event);
};

export const useExploreStore = create<ExploreState>((set, get) => ({
  // Long-lived Initial State
  completedTutorials: [],
  completedTours: [],
  dismissedAnnouncements: [],
  bookmarks: [],
  onboardingCompleted: false,
  recentlyViewed: [],
  preferredLanguage: 'en',
  helpSearchHistory: [],

  // Transient Initial State
  activeTour: null,
  currentStepIndex: 0,
  pausedTourId: null,
  pausedStepIndex: 0,
  registeredElements: {},
  unlockedFeatures: [],
  hasLoadedPersistedState: false,
  tourInitiatorElementRef: null,

  // Actions - Load and synchronize persistence
  loadPersistedState: async () => {
    try {
      const [
        completedTutorials,
        completedTours,
        dismissedAnnouncements,
        bookmarks,
        onboardingCompleted,
        recentlyViewed,
        preferredLanguage,
        helpSearchHistory,
      ] = await Promise.all([
        exploreStorage.getCompletedTutorials(),
        exploreStorage.getCompletedTours(),
        exploreStorage.getDismissedAnnouncements(),
        exploreStorage.getBookmarks(),
        exploreStorage.getOnboardingCompleted(),
        exploreStorage.getRecentlyViewed(),
        exploreStorage.getPreferredLanguage(),
        exploreStorage.getHelpSearchHistory(),
      ]);

      set({
        completedTutorials,
        completedTours,
        dismissedAnnouncements,
        bookmarks,
        onboardingCompleted,
        recentlyViewed,
        preferredLanguage,
        helpSearchHistory,
        hasLoadedPersistedState: true,
      });
      console.log('⚙️ [exploreStore] Persistent education state synchronized successfully.');
    } catch (error) {
      console.error('❌ [exploreStore] Error loading persisted state:', error);
      set({ hasLoadedPersistedState: true });
    }
  },

  resetAllProgress: async () => {
    await exploreStorage.clearAll();
    set({
      completedTutorials: [],
      completedTours: [],
      dismissedAnnouncements: [],
      bookmarks: [],
      onboardingCompleted: false,
      recentlyViewed: [],
      preferredLanguage: 'en',
      helpSearchHistory: [],
      activeTour: null,
      currentStepIndex: 0,
      pausedTourId: null,
      pausedStepIndex: 0,
      unlockedFeatures: [],
    });
    console.log('⚙️ [exploreStore] Reset all learning tracking databases.');
  },

  // Layout Measurement Registrations
  registerElementLayout: (key, layout) => {
    set((state) => {
      const updated = { ...state.registeredElements };
      if (layout === null) {
        delete updated[key];
      } else {
        updated[key] = layout;
      }
      return { registeredElements: updated };
    });
  },

  // Actions - Guided Tour Navigation
  startTour: (tourId, initiatorRef = null) => {
    const config = getTourConfig(tourId);
    if (!config) return;

    set({
      activeTour: tourId,
      currentStepIndex: 0,
      pausedTourId: null,
      pausedStepIndex: 0,
      tourInitiatorElementRef: initiatorRef,
    });

    trackTourAnalytics({
      tourId,
      action: 'Started',
      stepIndex: 0,
      timestamp: new Date().toISOString(),
      appVersion: CURRENT_PLATFORM_VERSION,
    });
  },

  nextStep: () => {
    const { activeTour, currentStepIndex } = get();
    if (!activeTour) return;

    const config = getTourConfig(activeTour);
    if (!config) return;

    if (currentStepIndex + 1 >= config.steps.length) {
      get().finishTour();
    } else {
      set({ currentStepIndex: currentStepIndex + 1 });
      trackTourAnalytics({
        tourId: activeTour,
        action: 'Started', // intermediate action logging
        stepIndex: currentStepIndex + 1,
        timestamp: new Date().toISOString(),
        appVersion: CURRENT_PLATFORM_VERSION,
      });
    }
  },

  prevStep: () => {
    const { activeTour, currentStepIndex } = get();
    if (!activeTour) return;

    if (currentStepIndex > 0) {
      set({ currentStepIndex: currentStepIndex - 1 });
    }
  },

  pauseTour: () => {
    const { activeTour, currentStepIndex } = get();
    if (!activeTour) return;

    set({
      pausedTourId: activeTour,
      pausedStepIndex: currentStepIndex,
      activeTour: null,
    });

    trackTourAnalytics({
      tourId: activeTour,
      action: 'Abandoned',
      stepIndex: currentStepIndex,
      timestamp: new Date().toISOString(),
      appVersion: CURRENT_PLATFORM_VERSION,
    });
  },

  resumeTour: () => {
    const { pausedTourId, pausedStepIndex } = get();
    if (!pausedTourId) return;

    set({
      activeTour: pausedTourId,
      currentStepIndex: pausedStepIndex,
      pausedTourId: null,
      pausedStepIndex: 0,
    });

    trackTourAnalytics({
      tourId: pausedTourId,
      action: 'Started',
      stepIndex: pausedStepIndex,
      timestamp: new Date().toISOString(),
      appVersion: CURRENT_PLATFORM_VERSION,
    });
  },

  skipTour: () => {
    const { activeTour, currentStepIndex } = get();
    if (!activeTour) return;

    const updatedCompleted = [...get().completedTours];
    if (!updatedCompleted.includes(activeTour)) {
      updatedCompleted.push(activeTour);
    }

    // Symmetric with `finishTour`. A member who starts the welcome tour and then
    // skips out of it has declined onboarding just as surely as one who finished
    // it, and before this line only the second of them was remembered.
    const isOnboarding = activeTour === 'app';

    set((state) => ({
      completedTours: updatedCompleted,
      activeTour: null,
      currentStepIndex: 0,
      onboardingCompleted: isOnboarding ? true : state.onboardingCompleted,
    }));

    exploreStorage.setCompletedTours(updatedCompleted);
    if (isOnboarding) {
      exploreStorage.setOnboardingCompleted(true);
    }

    trackTourAnalytics({
      tourId: activeTour,
      action: 'Skipped',
      stepIndex: currentStepIndex,
      timestamp: new Date().toISOString(),
      appVersion: CURRENT_PLATFORM_VERSION,
    });

    // Return accessibility focus
    const ref = get().tourInitiatorElementRef;
    if (ref && ref.focus) {
      try {
        ref.focus();
      } catch (err) {
        console.warn('Failed to return focus to initiator element', err);
      }
    }
  },

  /**
   * Declining the welcome modal, which is not the same act as skipping a tour.
   *
   * `WelcomeModal`'s "Skip Onboarding" used to call `skipTour()`, under a comment
   * that read `// Mark onboarding as completed/skipped`. It did neither, because
   * `skipTour` opens with `if (!activeTour) return;` — and from the welcome modal
   * no tour has started, so the call returned on its first line and wrote nothing.
   *
   * `onboardingCompleted` was therefore only ever set by `finishTour`, which means
   * the *only* way to stop the modal was to walk the whole tour to the end. Declining
   * it left the flag false, the flag is what `(tabs)/index.tsx` gates on, and the
   * modal reopened over the home screen on **every** cold start.
   *
   * Observed rather than reasoned about: on one install, with the tour explicitly
   * skipped and no reinstall in between, two consecutive cold starts both reopened
   * it. That also settles a question an earlier phase recorded and could not answer —
   * it had seen the modal return after a cold start, but on a freshly installed
   * build, where reinstalling clears app state and the two causes are
   * indistinguishable. Same install, same stored state: it is this.
   */
  completeOnboarding: () => {
    if (get().onboardingCompleted) return;

    set({ onboardingCompleted: true });
    exploreStorage.setOnboardingCompleted(true);
  },

  finishTour: () => {
    const { activeTour, currentStepIndex } = get();
    if (!activeTour) return;

    const updatedCompleted = [...get().completedTours];
    if (!updatedCompleted.includes(activeTour)) {
      updatedCompleted.push(activeTour);
    }

    const isOnboarding = activeTour === 'app';

    set((state) => ({
      completedTours: updatedCompleted,
      activeTour: null,
      currentStepIndex: 0,
      onboardingCompleted: isOnboarding ? true : state.onboardingCompleted,
    }));

    exploreStorage.setCompletedTours(updatedCompleted);
    if (isOnboarding) {
      exploreStorage.setOnboardingCompleted(true);
    }

    trackTourAnalytics({
      tourId: activeTour,
      action: 'Completed',
      stepIndex: currentStepIndex,
      timestamp: new Date().toISOString(),
      appVersion: CURRENT_PLATFORM_VERSION,
    });

    // Return accessibility focus
    const ref = get().tourInitiatorElementRef;
    if (ref && ref.focus) {
      try {
        ref.focus();
      } catch (err) {
        console.warn('Failed to return focus to initiator element', err);
      }
    }
  },

  replayTour: (tourId, initiatorRef = null) => {
    get().startTour(tourId, initiatorRef);
    trackTourAnalytics({
      tourId,
      action: 'Replayed',
      stepIndex: 0,
      timestamp: new Date().toISOString(),
      appVersion: CURRENT_PLATFORM_VERSION,
    });
  },

  // Actions - Tutorials and Bookmarks
  toggleSaveTutorial: async (tutorialId) => {
    const current = [...get().bookmarks];
    const index = current.indexOf(tutorialId);
    let bookmarked = false;

    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(tutorialId);
      bookmarked = true;
    }

    set({ bookmarks: current });
    await exploreStorage.setBookmarks(current);

    trackFeatureDiscoveryAnalytics({
      tutorialId,
      action: bookmarked ? 'Bookmarked' : 'Viewed', // bookmark toggled
      timestamp: new Date().toISOString(),
    });
  },

  completeTutorial: async (tutorialId) => {
    const current = [...get().completedTutorials];
    if (!current.includes(tutorialId)) {
      current.push(tutorialId);
      set({ completedTutorials: current });
      await exploreStorage.setCompletedTutorials(current);

      trackFeatureDiscoveryAnalytics({
        tutorialId,
        action: 'Completed',
        timestamp: new Date().toISOString(),
      });
    }
  },

  viewTutorial: async (tutorialId) => {
    const current = [...get().recentlyViewed].filter((id) => id !== tutorialId);
    // Add to front of stack
    current.unshift(tutorialId);
    // Keep max 5 items
    const limited = current.slice(0, 5);

    set({ recentlyViewed: limited });
    await exploreStorage.setRecentlyViewed(limited);

    trackFeatureDiscoveryAnalytics({
      tutorialId,
      action: 'Viewed',
      timestamp: new Date().toISOString(),
    });
  },

  addSearchTerm: async (term) => {
    if (!term.trim()) return;
    const current = [...get().helpSearchHistory].filter((t) => t.toLowerCase() !== term.toLowerCase());
    current.unshift(term.trim());
    const limited = current.slice(0, 8); // Keep 8 queries

    set({ helpSearchHistory: limited });
    await exploreStorage.setHelpSearchHistory(limited);
  },

  clearSearchHistory: async () => {
    set({ helpSearchHistory: [] });
    await exploreStorage.setHelpSearchHistory([]);
  },

  // Progressive Feature Unlocks
  triggerFeatureUnlock: (featureName) => {
    set((state) => {
      const current = [...state.unlockedFeatures];
      if (!current.includes(featureName)) {
        current.push(featureName);
      }
      return { unlockedFeatures: current };
    });
  },

  dismissUnlock: (featureName) => {
    set((state) => ({
      unlockedFeatures: state.unlockedFeatures.filter((f) => f !== featureName),
    }));
  },

  dismissAnnouncement: async (version) => {
    const current = [...get().dismissedAnnouncements];
    if (!current.includes(version)) {
      current.push(version);
      set({ dismissedAnnouncements: current });
      await exploreStorage.setDismissedAnnouncements(current);
    }
  },
}));
export type { ElementLayout, ExploreState };
export { trackTourAnalytics, trackFeatureDiscoveryAnalytics };
