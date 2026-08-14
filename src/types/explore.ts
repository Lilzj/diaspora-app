/**
 * TypeScript definitions for the Explore Diaspora product education module.
 */

export type TourId =
  | 'app'
  | 'marketplace'
  | 'jobs'
  | 'housing'
  | 'creator'
  | 'trust'
  | 'neighborhood'
  | 'community-life';

export type TourTriggerType =
  | 'FirstLogin'
  | 'FirstVisit'
  | 'VersionUpdate'
  | 'FeatureUnlock'
  | 'ManualLaunch'
  | 'AdminAnnouncement';

export interface TourStep {
  /** The element registration key to spotlight (e.g. 'home_tab', 'profile_avatar') */
  targetKey?: string;
  /**
   * The route this step's target lives on.
   *
   * A tour without these was a tour that spotlighted nothing: the launcher sent
   * every tour to the home dashboard, so only the six navigation tabs of the
   * `app` tour were ever on screen. The other seven fell through to the
   * centred "no target" card and read as a slideshow. The driver navigates here
   * before showing the step, so the member is looking at the real feature.
   *
   * Omit when the step's target is on the same screen as the step before it.
   */
  route?: string;
  /** Title of the tooltip card */
  title: string;
  /** Educational explanation of the feature */
  description: string;
  /** Preferred tooltip layout position relative to the spotlight target */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Accessibility text override if different from default */
  accessibilityLabel?: string;
}

export interface TourTriggerRule {
  type: TourTriggerType;
  /** Target version if checking version update onboarding */
  version?: string;
  /** Specific feature name that triggers this tour on first visit or unlock */
  featureKey?: string;
}

export interface Tour {
  id: TourId;
  title: string;
  version: string;
  description: string;
  /**
   * Where the tour begins.
   *
   * Must name its group — `'/'` is ambiguous between `(auth)/index` and
   * `(tabs)/index`, and resolving it to the auth Welcome screen is what made
   * "Launch Live Walkthrough" look like it logged the member out.
   */
  entryRoute: string;
  steps: TourStep[];
  triggerRule: TourTriggerRule;
}

export type TutorialDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface TutorialStep {
  title: string;
  description: string;
  illustration?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  summary: string;
  categoryId: string;
  readingTimeMinutes: number;
  difficulty: TutorialDifficulty;
  steps: TutorialStep[];
  isCompleted?: boolean;
  isBookmarked?: boolean;
  relatedTourId?: TourId;
  imageUrl?: string;
}

/**
 * The shelves of the learning centre.
 *
 * §11 asks that Explore not become "an enormous list of disconnected feature
 * cards". Fourteen categories in one horizontal rail is exactly that: the
 * member scrolls sideways past things they have no way to relate to each other,
 * and the ones at the end are never seen.
 *
 * The order is the journey — arrive, find your people, earn, live, make, get
 * paid, grow, measure, stay safe, learn more.
 */
export type TutorialGroup =
  | 'discover'
  | 'community'
  | 'work'
  | 'living'
  | 'creators'
  | 'wallet'
  | 'grow'
  | 'analytics'
  | 'trust'
  | 'learning';

export const TUTORIAL_GROUP_ORDER: readonly TutorialGroup[] = [
  'discover',
  'community',
  'work',
  'living',
  'creators',
  'wallet',
  'grow',
  'analytics',
  'trust',
  'learning',
] as const;

export const TUTORIAL_GROUP_LABELS: Record<TutorialGroup, string> = {
  discover: 'Discover Diaspora',
  community: 'Community',
  work: 'Work & Opportunities',
  living: 'Housing & Marketplace',
  creators: 'Creators',
  wallet: 'Wallet & Rewards',
  grow: 'Grow & Monetization',
  analytics: 'Analytics',
  trust: 'Trust & Safety',
  learning: 'Learning & Academies',
};

export interface TutorialCategory {
  id: string;
  name: string;
  icon: string;
  color: string; // Tailored HSL theme colors
  description: string;
  /** Which shelf this category sits on. */
  group: TutorialGroup;
}

export interface ReleaseItem {
  type: 'feature' | 'improvement' | 'fix' | 'tip';
  title: string;
  description: string;
}

export interface ReleaseAnnouncement {
  version: string;
  releaseDate: string;
  title: string;
  description: string;
  items: ReleaseItem[];
  exploreTourId?: TourId;
}

/** DTO contract representing the active user's educational progress */
export interface UserLearningProgress {
  tutorialsCompletedCount: number;
  totalTutorialsCount: number;
  featuresDiscoveredCount: number;
  totalFeaturesCount: number;
  completionPercentage: number;
  learningStreakDays: number;
}

/** Structures for Tour Onboarding Analytics */
export interface TourAnalyticsEvent {
  tourId: TourId;
  action: 'Started' | 'Completed' | 'Skipped' | 'Abandoned' | 'Replayed';
  stepIndex: number;
  timestamp: string;
  appVersion: string;
}

/** Structures for Tutorial Usage Analytics */
export interface FeatureDiscoveryAnalyticsEvent {
  tutorialId: string;
  action: 'Viewed' | 'Completed' | 'Bookmarked' | 'Replayed' | 'DropOff';
  readingDurationSeconds?: number;
  dropOffStepIndex?: number;
  timestamp: string;
}
