// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notifications API client (Backend Phase B13)
//
// Thin wrappers over /api/v1/notifications. Every response is unwrapped from the
// platform's `{ data, meta }` envelope here, so callers see the payload only.
//
// These are plain async functions rather than hooks: the app has no shared
// TanStack Query hook convention yet, and adding one here would be inventing a
// pattern in a file about notifications. Wrap them in useQuery/useMutation at
// the call site — the query keys below are provided so that is one line.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import type {
  NotificationDetail,
  NotificationPage,
  NotificationResponse,
  NotificationScope,
  UnreadCount,
} from '@/types/notification';
import type {
  NotificationCategoryDefinition,
  NotificationDevice,
  NotificationPreferences,
  RegisterNotificationDevice,
  UpdateNotificationPreferences,
} from '@/types/notification-preferences';

const ROOT = '/notifications';

/** Stable query keys, so a mutation can invalidate exactly what it changed. */
export const notificationKeys = {
  all: ['notifications'] as const,
  inbox: (params?: InboxParams) => ['notifications', 'inbox', params ?? {}] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  preferences: () => ['notifications', 'preferences'] as const,
  categories: () => ['notifications', 'categories'] as const,
  /**
   * B13.3's per-category subscription state.
   *
   * Its own key rather than sharing `preferences()`, because the two routes
   * answer different questions off the same rows — "what did the member ask
   * for" against "what will the platform do" — and one entry for both would
   * make a preference write refetch a list nothing changed.
   */
  subscriptions: () => ['notifications', 'preferences', 'subscriptions'] as const,
  devices: () => ['notifications', 'devices'] as const,
  digests: () => ['notifications', 'digests'] as const,
};

export interface InboxParams {
  scope?: NotificationScope;
  unreadOnly?: boolean;
  /** Category keys. Repeatable. */
  category?: string[];
  priority?: string[];
  search?: string;
  /** The publishing module — the brief's "sender" filter. */
  source?: string;
  entityType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function unwrap<T>(payload: { data: T }): T {
  return payload.data;
}

export async function fetchInbox(params: InboxParams = {}): Promise<NotificationPage> {
  const response = await apiClient.get(ROOT, { params });
  return unwrap<NotificationPage>(response.data);
}

export async function fetchUnreadCount(): Promise<UnreadCount> {
  const response = await apiClient.get(`${ROOT}/unread-count`);
  return unwrap<UnreadCount>(response.data);
}

export async function fetchNotification(id: string): Promise<NotificationDetail> {
  const response = await apiClient.get(`${ROOT}/${id}`);
  return unwrap<NotificationDetail>(response.data);
}

export async function markNotificationRead(
  id: string,
  channel: string = 'InApp'
): Promise<NotificationResponse> {
  const response = await apiClient.post(`${ROOT}/${id}/read`, null, { params: { channel } });
  return unwrap<NotificationResponse>(response.data);
}

export async function markNotificationUnread(id: string): Promise<NotificationResponse> {
  const response = await apiClient.post(`${ROOT}/${id}/unread`);
  return unwrap<NotificationResponse>(response.data);
}

/** Marks everything read in batches and returns what is left. */
export async function markAllNotificationsRead(): Promise<UnreadCount> {
  const response = await apiClient.post(`${ROOT}/read-all`);
  return unwrap<UnreadCount>(response.data);
}

/**
 * Reports that the member followed a notification somewhere. Call it alongside
 * the navigation, not instead of it — the server records the click and the
 * client owns the routing.
 */
export async function recordNotificationClick(
  id: string,
  actionKey?: string,
  channel: string = 'InApp'
): Promise<NotificationResponse> {
  const response = await apiClient.post(`${ROOT}/${id}/click`, { actionKey, channel });
  return unwrap<NotificationResponse>(response.data);
}

export async function dismissNotification(id: string): Promise<NotificationResponse> {
  const response = await apiClient.post(`${ROOT}/${id}/dismiss`);
  return unwrap<NotificationResponse>(response.data);
}

export async function archiveNotification(id: string): Promise<NotificationResponse> {
  const response = await apiClient.post(`${ROOT}/${id}/archive`);
  return unwrap<NotificationResponse>(response.data);
}

/** Brings a filed notification back. This is the un-archive, not the un-delete. */
export async function restoreNotification(id: string): Promise<NotificationResponse> {
  const response = await apiClient.post(`${ROOT}/${id}/restore`);
  return unwrap<NotificationResponse>(response.data);
}

export async function pinNotification(
  id: string,
  pinned: boolean
): Promise<NotificationResponse> {
  const response = await apiClient.put(`${ROOT}/${id}/pin`, null, { params: { pinned } });
  return unwrap<NotificationResponse>(response.data);
}

export async function starNotification(
  id: string,
  starred: boolean
): Promise<NotificationResponse> {
  const response = await apiClient.put(`${ROOT}/${id}/star`, null, { params: { starred } });
  return unwrap<NotificationResponse>(response.data);
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`${ROOT}/${id}`);
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await apiClient.get(`${ROOT}/preferences`);
  return unwrap<NotificationPreferences>(response.data);
}

export async function updateNotificationPreferences(
  update: UpdateNotificationPreferences
): Promise<NotificationPreferences> {
  const response = await apiClient.put(`${ROOT}/preferences`, update);
  return unwrap<NotificationPreferences>(response.data);
}

export async function fetchNotificationCategories(): Promise<NotificationCategoryDefinition[]> {
  const response = await apiClient.get(`${ROOT}/categories`);
  return unwrap<NotificationCategoryDefinition[]>(response.data);
}

export async function fetchNotificationDevices(): Promise<NotificationDevice[]> {
  const response = await apiClient.get(`${ROOT}/devices`);
  return unwrap<NotificationDevice[]>(response.data);
}

/**
 * Registers or refreshes a push endpoint. Idempotent on the token: calling it
 * twice with the same token is one endpoint, not two, so a client retrying on a
 * flaky connection cannot make every message arrive twice.
 */
export async function registerNotificationDevice(
  device: RegisterNotificationDevice
): Promise<NotificationDevice> {
  const response = await apiClient.put(`${ROOT}/devices`, device);
  return unwrap<NotificationDevice>(response.data);
}

export async function removeNotificationDevice(id: string): Promise<void> {
  await apiClient.delete(`${ROOT}/devices/${id}`);
}

/**
 * Stops delivering to every endpoint except the one making the request
 * (Remediation Wave C-05).
 *
 * `integration-gaps.ts`'s GAP-016 declared this missing — "a 'deactivate all
 * other devices' operation for the sign-out-everywhere case" — and B13.3
 * shipped it. `POST /notifications/devices/deactivate-others`, mapped ahead of
 * `/devices/{id:guid}` so "others" is never read as an identifier.
 *
 * Which endpoint is "this one" is decided **server-side**, from the session's
 * device claim, not from anything the client sends. That is the same fact
 * `isCurrentDevice` reports on the list, and it is why this route takes no
 * body: a client naming the device to spare would be a client that could spare
 * somebody else's.
 */
export async function deactivateOtherNotificationDevices(): Promise<NotificationDevice[]> {
  const response = await apiClient.post(`${ROOT}/devices/deactivate-others`);
  return unwrap<NotificationDevice[]>(response.data);
}

/**
 * Where a member stands on each category's email (Remediation Wave C-05).
 *
 * Mirrors `NotificationSubscriptionResponse`. `integration-gaps.ts`'s GAP-009
 * asked for exactly this and B13.3 shipped it — plus two fields the register
 * did not ask for and which are the reason it is worth reading:
 * `displayName`, so a confirmation can name what was switched off without a
 * second lookup, and `isMandatory`, so a screen can explain why a switch is
 * absent rather than rendering one that does nothing.
 */
export interface NotificationSubscription {
  categoryKey: string;
  displayName: string;
  /**
   * Whether the platform may send email for this category at all.
   *
   * **A mandatory category always reports `true`, whatever is stored against
   * it.** The platform will send it, and reporting false beside a switch that
   * does nothing is how a member concludes the switch is broken. So this field
   * is not a record of what the member asked for — `unsubscribedAt` is.
   */
  emailEnabled: boolean;
  isMandatory: boolean;
  /** When they asked to stop. Null while email is on. */
  unsubscribedAt: string | null;
  /**
   * How they asked. Null while email is on.
   *
   * The three values oblige the platform differently, which is why one boolean
   * is not enough. `app` is reversible where the member found it. `emailLink`
   * was followed with no session, so they may not know where the setting lives.
   * `bounce` is **not a request at all** — nobody asked, the address stopped
   * accepting mail — and turning it back on without a re-verified address
   * resumes sending to somewhere already rejecting it.
   */
  unsubscribeSource: 'app' | 'emailLink' | 'bounce' | null;
}

/**
 * Per-category email subscription state, with when and how it was set.
 *
 * Shares `notificationKeys.preferences()`'s neighbourhood deliberately but not
 * its key: this answers "what did the member ask for", and
 * `GET /notifications/preferences` answers "what will the platform do". They
 * are read from the same rows and are not two sources of truth, and giving them
 * one cache entry would mean invalidating a preference write refetched both.
 */
export async function fetchNotificationSubscriptions(): Promise<NotificationSubscription[]> {
  const response = await apiClient.get(`${ROOT}/preferences/subscriptions`);
  return unwrap<NotificationSubscription[]>(response.data);
}
