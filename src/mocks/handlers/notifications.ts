// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Notification mock handlers (Backend Phase B13)
//
// Mirrors /api/v1/notifications closely enough that a screen written against
// the mock works unchanged against the server: the same routes, the same
// `{ data }` envelope, the same cursor shape, the same refusals.
//
// The refusals matter as much as the successes. Muting a mandatory category and
// setting ambiguous quiet hours both return 400 here, exactly as the server
// does, so a settings screen's error handling is exercised before it ships.
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import { MOCK_NOTIFICATIONS } from '../notifications-data';
import {
  MOCK_NOTIFICATION_CATEGORIES,
  MOCK_NOTIFICATION_PREFERENCES,
} from '../notifications-catalogue';
import type { NotificationResponse } from '@/types/notification';
import type { NotificationDevice, NotificationPreferences } from '@/types/notification-preferences';

export function setupNotificationMocks(mock: MockAdapter) {
  // Mutable session state, so a mocked run behaves like a real one: marking
  // something read stays read until the app reloads.
  let notifications: NotificationResponse[] = MOCK_NOTIFICATIONS.map((item) => ({ ...item }));
  let preferences: NotificationPreferences = structuredClone(MOCK_NOTIFICATION_PREFERENCES);
  let devices: NotificationDevice[] = [];

  const unread = () => notifications.filter((item) => !item.isRead && !item.isArchived).length;

  const byCategory = () =>
    notifications
      .filter((item) => !item.isRead && !item.isArchived)
      .reduce<Record<string, number>>((counts, item) => {
        counts[item.categoryKey] = (counts[item.categoryKey] ?? 0) + 1;
        return counts;
      }, {});

  const find = (url: string, pattern: RegExp) => {
    const match = pattern.exec(url);
    return match ? notifications.find((item) => item.id === match[1]) : undefined;
  };

  // ── Inbox ──────────────────────────────────────────────────────────────

  mock.onGet('/notifications').reply((config) => {
    const scope = (config.params?.scope as string) ?? 'inbox';
    const unreadOnly = config.params?.unreadOnly === true;
    const search = (config.params?.search as string | undefined)?.toLowerCase();
    const limit = (config.params?.limit as number | undefined) ?? 20;

    let items = notifications.filter((item) =>
      scope === 'archived'
        ? item.isArchived
        : scope === 'starred'
          ? item.isStarred
          : scope === 'pinned'
            ? item.isPinned
            : scope === 'all'
              ? true
              : !item.isArchived
    );

    if (unreadOnly) items = items.filter((item) => !item.isRead);

    if (search) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(search) || item.body.toLowerCase().includes(search)
      );
    }

    // Pinned first, then newest — the server's ordering.
    items = [...items].sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      return right.createdAt.localeCompare(left.createdAt);
    });

    const page = items.slice(0, limit);

    return [
      200,
      {
        data: {
          items: page,
          nextCursor: items.length > limit ? 'mock-cursor' : undefined,
          hasMore: items.length > limit,
          unreadCount: unread(),
        },
      },
    ];
  });

  mock.onGet('/notifications/unread-count').reply(() => [
    200,
    {
      data: {
        total: unread(),
        byCategory: byCategory(),
        hasNew: unread() > 0,
        lastNotificationAt: notifications[0]?.createdAt,
      },
    },
  ]);

  mock.onPost('/notifications/read-all').reply(() => {
    notifications = notifications.map((item) => ({ ...item, isRead: true, status: 'Opened' }));

    return [200, { data: { total: 0, byCategory: {}, hasNew: false } }];
  });

  mock.onPost(/\/notifications\/([^/]+)\/read$/).reply((config) => {
    const item = find(config.url ?? '', /\/notifications\/([^/]+)\/read$/);

    if (!item) return [404, { title: 'Not found' }];

    item.isRead = true;
    item.status = 'Opened';
    item.readAt = new Date().toISOString();

    return [200, { data: item }];
  });

  mock.onPost(/\/notifications\/([^/]+)\/unread$/).reply((config) => {
    const item = find(config.url ?? '', /\/notifications\/([^/]+)\/unread$/);

    if (!item) return [404, { title: 'Not found' }];

    item.isRead = false;
    item.status = 'Delivered';
    item.readAt = undefined;

    return [200, { data: item }];
  });

  mock.onPost(/\/notifications\/([^/]+)\/archive$/).reply((config) => {
    const item = find(config.url ?? '', /\/notifications\/([^/]+)\/archive$/);

    if (!item) return [404, { title: 'Not found' }];

    item.isArchived = true;
    item.isPinned = false;
    item.status = 'Archived';

    return [200, { data: item }];
  });

  mock.onPost(/\/notifications\/([^/]+)\/restore$/).reply((config) => {
    const item = find(config.url ?? '', /\/notifications\/([^/]+)\/restore$/);

    if (!item) return [404, { title: 'Not found' }];

    item.isArchived = false;
    item.status = item.isRead ? 'Opened' : 'Delivered';

    return [200, { data: item }];
  });

  mock.onPost(/\/notifications\/([^/]+)\/(click|dismiss)$/).reply((config) => {
    const item = find(config.url ?? '', /\/notifications\/([^/]+)\/(?:click|dismiss)$/);

    if (!item) return [404, { title: 'Not found' }];

    // A click backfills the open, exactly as the aggregate does — otherwise every
    // open rate under-counts the members who tapped straight through.
    item.isRead = true;
    item.status = config.url?.endsWith('dismiss') ? 'Dismissed' : 'Clicked';

    return [200, { data: item }];
  });

  mock.onPut(/\/notifications\/([^/]+)\/(pin|star)$/).reply((config) => {
    const item = find(config.url ?? '', /\/notifications\/([^/]+)\/(?:pin|star)$/);

    if (!item) return [404, { title: 'Not found' }];

    if (config.url?.endsWith('pin')) {
      item.isPinned = config.params?.pinned !== false;
    } else {
      item.isStarred = config.params?.starred !== false;
    }

    return [200, { data: item }];
  });

  mock.onDelete(/\/notifications\/[^/]+$/).reply((config) => {
    const match = /\/notifications\/([^/]+)$/.exec(config.url ?? '');

    if (match) {
      notifications = notifications.filter((item) => item.id !== match[1]);
    }

    return [200, { data: null }];
  });

  // ── Preferences ────────────────────────────────────────────────────────

  mock.onGet('/notifications/preferences').reply(() => [200, { data: preferences }]);

  mock.onGet('/notifications/preferences/communication').reply(() => [
    200,
    { data: preferences.communication },
  ]);

  mock.onGet('/notifications/categories').reply(() => [200, { data: MOCK_NOTIFICATION_CATEGORIES }]);

  mock.onPut('/notifications/preferences').reply((config) => {
    const update = JSON.parse(config.data || '{}');

    // The two refusals the server makes, mirrored so a settings screen's error
    // handling is exercised before it ships.
    const muted = Object.entries<boolean>(update.categories ?? {}).filter(
      ([, enabled]) => !enabled
    );

    const mandatory = muted.find(([key]) =>
      MOCK_NOTIFICATION_CATEGORIES.some((category) => category.key === key && category.isMandatory)
    );

    if (mandatory) {
      return [
        400,
        {
          title: 'Validation failed',
          code: 'Notifications.Preference.CriticalChannelRequired',
          detail: 'Security notifications cannot be switched off.',
        },
      ];
    }

    if (
      update.quietHoursEnabled &&
      update.quietHoursStart !== undefined &&
      update.quietHoursStart === update.quietHoursEnd
    ) {
      return [
        400,
        {
          title: 'Validation failed',
          code: 'Notifications.Preference.QuietHoursInvalid',
          detail: 'Quiet hours must not start and end at the same hour.',
        },
      ];
    }

    preferences = {
      ...preferences,
      push: update.push ?? preferences.push,
      email: update.email ?? preferences.email,
      categories: preferences.categories.map((category) =>
        update.categories?.[category.key] === undefined
          ? category
          : { ...category, enabled: update.categories[category.key] }
      ),
      communication: {
        ...preferences.communication,
        doNotDisturb: update.doNotDisturb ?? preferences.communication.doNotDisturb,
        quietHoursEnabled: update.quietHoursEnabled ?? preferences.communication.quietHoursEnabled,
        quietHoursStart: update.quietHoursStart ?? preferences.communication.quietHoursStart,
        quietHoursEnd: update.quietHoursEnd ?? preferences.communication.quietHoursEnd,
        digestFrequency: update.digestFrequency ?? preferences.communication.digestFrequency,
        language: update.language ?? preferences.communication.language,
        timeZoneId: update.timeZoneId ?? preferences.communication.timeZoneId,
      },
    };

    return [200, { data: preferences }];
  });

  // ── Devices ────────────────────────────────────────────────────────────

  mock.onGet('/notifications/devices').reply(() => [200, { data: devices }]);

  mock.onPut('/notifications/devices').reply((config) => {
    const body = JSON.parse(config.data || '{}');

    // Idempotent on the endpoint, exactly as the server is: registering twice is
    // one device, not two, so a retry cannot double every push.
    const existing = devices.find((device) => device.deviceIdentifier === body.deviceIdentifier);

    const device: NotificationDevice = existing ?? {
      id: `device-${devices.length + 1}`,
      platform: body.platform ?? 'Unknown',
      channel: 'Push',
      friendlyName: body.friendlyName,
      deviceIdentifier: body.deviceIdentifier,
      appVersion: body.appVersion,
      hasToken: true,
      isActive: true,
      registeredAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    device.lastActiveAt = new Date().toISOString();
    device.isActive = true;

    if (!existing) devices = [...devices, device];

    return [200, { data: device }];
  });

  mock.onDelete(/\/notifications\/devices\/[^/]+$/).reply((config) => {
    const match = /\/notifications\/devices\/([^/]+)$/.exec(config.url ?? '');

    if (match) {
      devices = devices.filter((device) => device.id !== match[1]);
    }

    return [200, { data: null }];
  });
}
