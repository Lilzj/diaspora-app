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
