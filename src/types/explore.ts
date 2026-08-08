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

export interface TutorialCategory {
  id: string;
  name: string;
  icon: string;
  color: string; // Tailored HSL theme colors
  description: string;
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
