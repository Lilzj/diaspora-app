// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notification Preference Types (Backend Phase B13)
//
// The settings screen, server-side. The three flat booleans at the top of
// NotificationPreferences are exactly the keys the existing
// src/app/settings/notifications.tsx screen stores in AsyncStorage under
// `diaspora_notification_settings`, so that screen can move to the server
// without remapping anything.
//
// The backend serves the brief's "notification preferences" and "communication
// preferences" from one record because they are one screen and are always saved
// together. `communication` is the second half, also available on its own at
// GET /notifications/preferences/communication.
// ─────────────────────────────────────────────────────────────────────────────

import type { DigestFrequency } from './notification';

/** One subject area's row on the settings screen. */
export interface CategoryPreference {
  key: string;
  displayName: string;
  description?: string;
  /** The coarse switch the current screen binds to. */
  enabled: boolean;
  inApp: boolean;
  push: boolean;
  email: boolean;
  /** Collect rather than send. Applies to Normal and Low messages only. */
  useDigest: boolean;
  /**
   * True when the platform will not let this be switched off — security and
   * moderation. Render the switch disabled with the description as the reason.
   */
  isMandatory: boolean;
  position: number;
}

export interface CommunicationPreferences {
  doNotDisturb: boolean;
  quietHoursEnabled: boolean;
  /** Local hour, 0–23, inclusive. The member's own wall clock, not UTC. */
  quietHoursStart: number;
  /** Local hour, 0–23, exclusive. */
  quietHoursEnd: number;
  digestFrequency: DigestFrequency;
  digestHour: number;
  digestDayOfWeek: string;
  /** BCP-47. What templates render in. */
  language: string;
  /** IANA. What quiet hours and digests are expressed in. */
  timeZoneId: string;
  allowsMarketing: boolean;
  /**
   * Always true. Critical messages — a suspension, a sign-in from a new country
   * — override every setting above. Show this, or the switches misrepresent
   * what they do.
   */
  criticalOverrideEnabled: boolean;
}

export interface NotificationPreferences {
  /** Always true; the inbox cannot be switched off. Render disabled. */
  inApp: boolean;
  /** The existing screen's `push` key. */
  push: boolean;
  /** The existing screen's `email` key. */
  email: boolean;
  categories: CategoryPreference[];
  communication: CommunicationPreferences;
}

/**
 * Every field is optional: send only what changed. That is what stops two
 * clients on one screen overwriting each other with stale copies of everything
 * they did not touch.
 */
export interface UpdateNotificationPreferences {
  push?: boolean;
  email?: boolean;
  /** Category key to a single on/off switch — the shape the current screen holds. */
  categories?: Record<string, boolean>;
  /** The finer per-channel form. Wins over `categories` where both name a key. */
  categoryChannels?: CategoryChannelPreference[];
  doNotDisturb?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  digestFrequency?: DigestFrequency;
  digestHour?: number;
  digestDayOfWeek?: string;
  language?: string;
  timeZoneId?: string;
  allowsMarketing?: boolean;
}

export interface CategoryChannelPreference {
  categoryKey: string;
  inApp?: boolean;
  push?: boolean;
  email?: boolean;
  useDigest?: boolean;
  /** Refused by the server for a mandatory category. */
  isMuted?: boolean;
}

/** One delivery endpoint. The push token is never returned. */
export interface NotificationDevice {
  id: string;
  platform: 'Android' | 'IOS' | 'Web' | 'Tablet' | 'Unknown';
  channel: string;
  friendlyName?: string;
  deviceIdentifier?: string;
  appVersion?: string;
  hasToken: boolean;
  isActive: boolean;
  registeredAt: string;
  lastActiveAt: string;
  lastDeliveredAt?: string;
  /** Why it stopped being used. Null while it is healthy. */
  suppressionReason?: string;
}

export interface RegisterNotificationDevice {
  token: string;
  platform: string;
  deviceIdentifier?: string;
  friendlyName?: string;
  appVersion?: string;
}

export interface NotificationCategoryDefinition {
  key: string;
  displayName: string;
  description?: string;
  defaultPriority: string;
  isMandatory: boolean;
  digestByDefault: boolean;
  ownerModule: string;
  position: number;
}
