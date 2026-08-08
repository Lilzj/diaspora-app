import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Interface representing our storage layer engine.
 * Allows switching the underlying engine (e.g. AsyncStorage, EncryptedStorage, SQLite, Cloud Sync)
 * without affecting the rest of the application.
 */
export interface StorageEngine {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * Standard AsyncStorage implementation of the StorageEngine.
 */
const asyncStorageEngine: StorageEngine = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error(`[exploreStorage] Error reading key "${key}":`, error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error(`[exploreStorage] Error writing key "${key}":`, error);
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`[exploreStorage] Error removing key "${key}":`, error);
    }
  },
};

// Current active engine
const activeEngine: StorageEngine = asyncStorageEngine;

// Storage Keys constants
const KEYS = {
  COMPLETED_TUTORIALS: 'explore_completed_tutorials',
  COMPLETED_TOURS: 'explore_completed_tours',
  DISMISSED_ANNOUNCEMENTS: 'explore_dismissed_announcements',
  BOOKMARKS: 'explore_bookmarks',
  ONBOARDING_COMPLETED: 'explore_onboarding_completed',
  CONTINUE_LEARNING: 'explore_continue_learning',
  RECENTLY_VIEWED: 'explore_recently_viewed',
  PREFERRED_LANGUAGE: 'explore_preferred_language',
  HELP_SEARCH_HISTORY: 'explore_help_search_history',
};

/**
 * ExploreStorage service providing structured methods to persist and retrieve long-lived data.
 */
export const exploreStorage = {
  /**
   * Retrieves completed tutorial IDs.
   */
  getCompletedTutorials: async (): Promise<string[]> => {
    const raw = await activeEngine.getItem(KEYS.COMPLETED_TUTORIALS);
    return raw ? JSON.parse(raw) : [];
  },

  /**
   * Saves completed tutorial IDs.
   */
  setCompletedTutorials: async (ids: string[]): Promise<void> => {
    await activeEngine.setItem(KEYS.COMPLETED_TUTORIALS, JSON.stringify(ids));
  },

  /**
   * Retrieves completed tour IDs.
   */
  getCompletedTours: async (): Promise<string[]> => {
    const raw = await activeEngine.getItem(KEYS.COMPLETED_TOURS);
    return raw ? JSON.parse(raw) : [];
  },

  /**
   * Saves completed tour IDs.
   */
  setCompletedTours: async (ids: string[]): Promise<void> => {
    await activeEngine.setItem(KEYS.COMPLETED_TOURS, JSON.stringify(ids));
  },

  /**
   * Retrieves dismissed announcement versions.
   */
  getDismissedAnnouncements: async (): Promise<string[]> => {
    const raw = await activeEngine.getItem(KEYS.DISMISSED_ANNOUNCEMENTS);
    return raw ? JSON.parse(raw) : [];
  },

  /**
   * Saves dismissed announcement versions.
   */
  setDismissedAnnouncements: async (versions: string[]): Promise<void> => {
    await activeEngine.setItem(KEYS.DISMISSED_ANNOUNCEMENTS, JSON.stringify(versions));
  },

  /**
   * Retrieves bookmarked tutorial IDs.
   */
  getBookmarks: async (): Promise<string[]> => {
    const raw = await activeEngine.getItem(KEYS.BOOKMARKS);
    return raw ? JSON.parse(raw) : [];
  },

  /**
   * Saves bookmarked tutorial IDs.
   */
  setBookmarks: async (ids: string[]): Promise<void> => {
    await activeEngine.setItem(KEYS.BOOKMARKS, JSON.stringify(ids));
  },

  /**
   * Retrieves onboarding/welcome tour completion status.
   */
  getOnboardingCompleted: async (): Promise<boolean> => {
    const raw = await activeEngine.getItem(KEYS.ONBOARDING_COMPLETED);
    return raw === 'true';
  },

  /**
   * Saves onboarding/welcome tour completion status.
   */
  setOnboardingCompleted: async (completed: boolean): Promise<void> => {
    await activeEngine.setItem(KEYS.ONBOARDING_COMPLETED, completed ? 'true' : 'false');
  },

  /**
   * Retrieves recently viewed tutorials queue.
   * Keeps track of the last N tutorials viewed.
   */
  getRecentlyViewed: async (): Promise<string[]> => {
    const raw = await activeEngine.getItem(KEYS.RECENTLY_VIEWED);
    return raw ? JSON.parse(raw) : [];
  },

  /**
   * Saves recently viewed tutorials queue.
   */
  setRecentlyViewed: async (ids: string[]): Promise<void> => {
    await activeEngine.setItem(KEYS.RECENTLY_VIEWED, JSON.stringify(ids));
  },

  /**
   * Retrieves preferred language choice.
   */
  getPreferredLanguage: async (): Promise<string> => {
    return (await activeEngine.getItem(KEYS.PREFERRED_LANGUAGE)) || 'en';
  },

  /**
   * Saves preferred language choice.
   */
  setPreferredLanguage: async (lang: string): Promise<void> => {
    await activeEngine.setItem(KEYS.PREFERRED_LANGUAGE, lang);
  },

  /**
   * Retrieves help search terms history.
   */
  getHelpSearchHistory: async (): Promise<string[]> => {
    const raw = await activeEngine.getItem(KEYS.HELP_SEARCH_HISTORY);
    return raw ? JSON.parse(raw) : [];
  },

  /**
   * Saves help search terms history.
   */
  setHelpSearchHistory: async (history: string[]): Promise<void> => {
    await activeEngine.setItem(KEYS.HELP_SEARCH_HISTORY, JSON.stringify(history));
  },

  /**
   * Clears all explore persistent data (useful for profile reset/logout).
   */
  clearAll: async (): Promise<void> => {
    const clearPromises = Object.values(KEYS).map(key => activeEngine.removeItem(key));
    await Promise.all(clearPromises);
  },
};
