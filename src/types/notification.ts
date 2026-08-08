// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notifications & Communication Types (Backend Phase B13)
//
// These mirror the backend's /api/v1/notifications contracts exactly. They are
// ADDITIVE: the existing `NotificationItemData` in src/store/notifications.ts
// keeps working unchanged, and `NotificationResponse` is a superset of it — the
// same `id`, `title`, `body`, `category`, `isRead`, `createdAt` and
// `targetRoute` the NotificationItem component already renders.
//
// The one difference worth knowing: `createdAt` is an ISO-8601 timestamp where
// the mocked store held a display string like "10 mins ago". A server cannot
// know what "10 mins ago" means by the time it is read, so relative time is a
// rendering decision — use formatRelativeTime() from src/utils/format.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationPriority = 'Critical' | 'High' | 'Normal' | 'Low' | 'Silent';

export type NotificationStatus =
  | 'Created'
  | 'Queued'
  | 'Delivered'
  | 'Opened'
  | 'Clicked'
  | 'Dismissed'
  | 'Archived'
  | 'Expired'
  | 'Failed';

export type NotificationChannel =
  | 'InApp'
  | 'Push'
  | 'Email'
  | 'Sms'
  | 'WhatsApp'
  | 'Voice'
  | 'Webhook';

export type NotificationScope = 'inbox' | 'archived' | 'starred' | 'pinned' | 'all';

export type DigestFrequency = 'Off' | 'Daily' | 'Weekly' | 'Manual';

export type NotificationActionStyle = 'Primary' | 'Secondary' | 'Destructive';

/** One tappable action on a notification card. Actions navigate; they never mutate. */
export interface NotificationAction {
  key: string;
  label: string;
  targetRoute?: string;
  style: NotificationActionStyle;
}

/**
 * One notification. The first seven fields are exactly the shape the existing
 * Zustand store and NotificationItem component already use.
 */
export interface NotificationResponse {
  id: string;
  title: string;
  body: string;
  /** The human-readable label — what the card renders today. */
  category: string;
  /** The stable machine key — what a client should switch on. */
  categoryKey: string;
  isRead: boolean;
  /** ISO-8601. Format for display with formatRelativeTime(). */
  createdAt: string;
  targetRoute?: string;

  priority: NotificationPriority;
  status: NotificationStatus;
  isArchived: boolean;
  isPinned: boolean;
  isStarred: boolean;
  readAt?: string;
  expiresAt?: string;
  imageMediaId?: string;
  /** Which module the fact came from — the "sender" filter. */
  sourceModule: string;
  entityType?: string;
  entityId?: string;
  actions: NotificationAction[];
}

/** One page of the inbox. The badge rides along so a launch is one round trip. */
export interface NotificationPage {
  items: NotificationResponse[];
  nextCursor?: string;
  hasMore: boolean;
  unreadCount: number;
}

export interface UnreadCount {
  total: number;
  byCategory: Record<string, number>;
  /** Anything since the member last opened the inbox screen. Drives a tab-bar dot. */
  hasNew: boolean;
  lastNotificationAt?: string;
}

export interface NotificationDelivery {
  id: string;
  channel: NotificationChannel;
  status: string;
  deliverAfter: string;
  nextAttemptAt?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  completedAt?: string;
  reasonCode?: string;
}

export interface NotificationDetail {
  notification: NotificationResponse;
  deliveries: NotificationDelivery[];
  attempts: unknown[];
}
