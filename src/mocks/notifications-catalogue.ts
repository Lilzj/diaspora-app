// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notification catalogue and preference mocks
//
// Mirrors what the backend's PlatformNotificationCategoryContributor seeds. The
// keys `reviews`, `updates`, `alerts`, `marketplace`, `guides`, `jobs` and
// `housing` are the ones the existing settings screen already stores under, so
// that screen can bind to this list without remapping.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  NotificationCategoryDefinition,
  NotificationPreferences,
} from '@/types/notification-preferences';

export const MOCK_NOTIFICATION_CATEGORIES: NotificationCategoryDefinition[] = [
  {
    key: 'security',
    displayName: 'Security',
    description: 'Sign-ins, password changes and account restrictions. Always delivered.',
    defaultPriority: 'Critical',
    isMandatory: true,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 10,
  },
  {
    key: 'moderation',
    displayName: 'Moderation',
    description: 'Decisions about content you posted. Always delivered.',
    defaultPriority: 'High',
    isMandatory: true,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 20,
  },
  {
    key: 'trust',
    displayName: 'Verification',
    description: 'Verification outcomes, badges and trust changes.',
    defaultPriority: 'High',
    isMandatory: false,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 30,
  },
  {
    key: 'jobs',
    displayName: 'Jobs',
    description: 'Applications, interviews and offers.',
    defaultPriority: 'High',
    isMandatory: false,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 40,
  },
  {
    key: 'housing',
    displayName: 'Housing',
    description: 'Viewings, reservations and landlord updates.',
    defaultPriority: 'High',
    isMandatory: false,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 50,
  },
  {
    key: 'marketplace',
    displayName: 'Marketplace',
    description: 'Offers, reservations and sales.',
    defaultPriority: 'Normal',
    isMandatory: false,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 60,
  },
  {
    key: 'community',
    displayName: 'Community',
    description: 'Mentions, replies and reactions.',
    defaultPriority: 'Low',
    isMandatory: false,
    digestByDefault: true,
    ownerModule: 'Notifications',
    position: 70,
  },
  {
    key: 'guides',
    displayName: 'Community Guides',
    description: 'Newly published and featured guides.',
    defaultPriority: 'Low',
    isMandatory: false,
    digestByDefault: true,
    ownerModule: 'Notifications',
    position: 100,
  },
  {
    key: 'reviews',
    displayName: 'New Reviews',
    description: 'When someone reviews or recommends you.',
    defaultPriority: 'Low',
    isMandatory: false,
    digestByDefault: true,
    ownerModule: 'Notifications',
    position: 130,
  },
  {
    key: 'alerts',
    displayName: 'New Alerts',
    description: 'Safety alerts and area updates.',
    defaultPriority: 'High',
    isMandatory: false,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 140,
  },
  {
    key: 'updates',
    displayName: 'App Updates',
    description: 'New features and improvements.',
    defaultPriority: 'Low',
    isMandatory: false,
    digestByDefault: true,
    ownerModule: 'Notifications',
    position: 150,
  },
  {
    // Added in Frontend Phase 5. PSR-1.1's readiness report recorded this mock
    // as drifted — it listed eleven categories where the backend seeds
    // seventeen — and named `billing` as the one this phase needs: B15's
    // `FinancialNotificationRuleContributor` routes nine template keys to it.
    //
    // **Not mandatory, and deliberately not digested.** B13 collapses a burst
    // into one line everywhere else; money messages do not batch, because two
    // failed payments are two facts about somebody's money and the second is
    // not a repeat of the first.
    key: 'billing',
    displayName: 'Payments & Billing',
    description: 'Payment results, refunds, receipts, subscriptions and promotions.',
    defaultPriority: 'High',
    isMandatory: false,
    digestByDefault: false,
    ownerModule: 'Notifications',
    position: 160,
  },
];

export const MOCK_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inApp: true,
  push: true,
  email: false,
  categories: MOCK_NOTIFICATION_CATEGORIES.map((category) => ({
    key: category.key,
    displayName: category.displayName,
    description: category.description,
    enabled: true,
    inApp: true,
    push: true,
    email: false,
    useDigest: category.digestByDefault,
    isMandatory: category.isMandatory,
    position: category.position,
  })),
  communication: {
    doNotDisturb: false,
    quietHoursEnabled: false,
    quietHoursStart: 22,
    quietHoursEnd: 7,
    digestFrequency: 'Daily',
    digestHour: 8,
    digestDayOfWeek: 'Monday',
    language: 'en',
    timeZoneId: 'UTC',
    allowsMarketing: false,
    criticalOverrideEnabled: true,
  },
};
