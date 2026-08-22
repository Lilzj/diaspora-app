// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the notification inbox against the real contract
// (Remediation Wave M-5)
//
// Notifications is one of the twelve flows the brief names as critical and was
// the largest of them with **no integration coverage at all**: two hundred lines
// of client, twenty-one routes, and nothing exercising any of them.
//
// Runs the real `lib/notifications-api.ts` against the real
// `mocks/handlers/notifications.ts`, which was written from B13's contracts
// rather than from what this client expects. Nothing is re-implemented here — a
// test against a re-implementation of the thing under test proves nothing.
//
// ── What these cases are chosen for ──────────────────────────────────────────
//
// **What leaves the device, not only what comes back.** Every defect this
// programme has found in this shape returned a 200: a dropped filter, a
// misspelled body field, a parameter under a name the binder does not know. A
// response assertion passes for all of them, because the response is a perfectly
// well-formed page of the wrong rows.
//
// So each case below pins the request first — the verb, the path, the query
// names, the body keys — and the response handling second.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  archiveNotification,
  deactivateOtherNotificationDevices,
  deleteNotification,
  dismissNotification,
  fetchInbox,
  fetchNotificationCategories,
  fetchNotificationDevices,
  fetchNotificationPreferences,
  fetchNotificationSubscriptions,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  notificationKeys,
  pinNotification,
  recordNotificationClick,
  registerNotificationDevice,
  restoreNotification,
  starNotification,
  updateNotificationPreferences,
} from '@/lib/notifications-api';
import { setupNotificationMocks } from '@/mocks/handlers/notifications';

let mock: MockAdapter;

beforeEach(() => {
  // A fresh adapter per case rather than one for the suite: the handler holds
  // mutable session state (a notification marked read stays read), and several
  // cases below depend on starting from the fixture rather than from whatever
  // the previous case left behind.
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupNotificationMocks(mock);
  // Anything this client sends that the handler does not answer is a defect in
  // the client, not a passthrough to be tolerated.
  mock.onAny().reply(404);
});

afterEach(() => {
  mock.restore();
});

/** The most recent request of a verb, or a failure that names the verb. */
function lastRequest(verb: 'get' | 'post' | 'put' | 'delete') {
  const history = mock.history[verb];
  expect(history.length).toBeGreaterThan(0);
  return history[history.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// The inbox read
// ─────────────────────────────────────────────────────────────────────────────

describe('the inbox request', () => {
  it('goes to /notifications with no parameters at all when none were asked for', async () => {
    await fetchInbox();

    const request = lastRequest('get');
    expect(request.url).toBe('/notifications');
    // `{}` and not `{ scope: 'inbox', limit: 20 }`: a client that invented the
    // server's defaults would keep sending them after the server changed one,
    // and would then be pinning an old default it never chose.
    expect(request.params).toEqual({});
  });

  it('sends every filter under the name the route binds', async () => {
    await fetchInbox({
      scope: 'archived',
      unreadOnly: true,
      search: 'offer',
      source: 'Marketplace',
      entityType: 'Listing',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      cursor: 'next-page',
      limit: 50,
    });

    const request = lastRequest('get');
    // Names, exactly. `InboxEndpoints.cs` binds `source` and hands it to the
    // query as `SourceModule`; a client sending `sourceModule` would have every
    // row returned and look filtered — the failure mode this suite exists for.
    expect(Object.keys(request.params ?? {}).sort()).toEqual(
      [
        'cursor',
        'entityType',
        'from',
        'limit',
        'scope',
        'search',
        'source',
        'to',
        'unreadOnly',
      ].sort(),
    );
    expect(request.params.source).toBe('Marketplace');
    expect(request.params.entityType).toBe('Listing');
  });

  it('reads the page the route returns, unread count included', async () => {
    const page = await fetchInbox();

    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
    // `unreadCount` rides inside `data` on this route rather than in `meta`.
    // The platform puts a count in three different places depending on the
    // module, and a client that guessed wrong here renders a badge of `null`
    // while looking entirely healthy.
    expect(typeof page.unreadCount).toBe('number');
  });

  it('honours the scope it was given rather than the client filtering locally', async () => {
    const inbox = await fetchInbox({ scope: 'inbox' });
    const archived = await fetchInbox({ scope: 'archived' });

    // Different requests, different answers. A client that fetched once and
    // filtered in memory would page over the wrong set the moment the inbox is
    // larger than one page, and would look right in every fixture.
    expect(mock.history.get.length).toBe(2);
    expect(archived.items.every((item) => item.isArchived)).toBe(true);
    expect(inbox.items.every((item) => !item.isArchived)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The unread badge
// ─────────────────────────────────────────────────────────────────────────────

describe('the unread count', () => {
  it('is its own route, not derived from a page of the inbox', async () => {
    const count = await fetchUnreadCount();

    expect(lastRequest('get').url).toBe('/notifications/unread-count');
    expect(typeof count.total).toBe('number');
    // Counting the unread rows of one page would under-count the moment the
    // inbox is longer than a page, and the badge would quietly cap at the page
    // size. The dedicated route is the only one that can answer.
    expect(count.byCategory).toBeDefined();
  });

  it('falls to zero after marking everything read, in one request', async () => {
    const before = await fetchUnreadCount();
    expect(before.total).toBeGreaterThan(0);

    const after = await markAllNotificationsRead();

    expect(lastRequest('post').url).toBe('/notifications/read-all');
    // The route answers with the new count, so a screen has no reason to make a
    // second request to learn what it already caused.
    expect(after.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acting on one notification
// ─────────────────────────────────────────────────────────────────────────────

describe('acting on one notification', () => {
  async function firstId(): Promise<string> {
    const page = await fetchInbox();
    return page.items[0].id;
  }

  it('marks read with the channel in the query string, not the body', async () => {
    const id = await firstId();
    await markNotificationRead(id);

    const request = lastRequest('post');
    expect(request.url).toBe(`/notifications/${id}/read`);
    expect(request.params).toEqual({ channel: 'InApp' });
    // `null`, deliberately. The route takes no body, and axios sends the string
    // "null" if one is passed as `undefined` through some paths — pinning this
    // keeps the request shaped the way the route reads it.
    expect(request.data).toBe('null');
  });

  it('marks unread through its own route rather than a read=false flag', async () => {
    const id = await firstId();
    const item = await markNotificationUnread(id);

    expect(lastRequest('post').url).toBe(`/notifications/${id}/unread`);
    expect(item.isRead).toBe(false);
  });

  it('sends the action key and the channel when a click is recorded', async () => {
    const id = await firstId();
    await recordNotificationClick(id, 'open-listing');

    const request = lastRequest('post');
    expect(request.url).toBe(`/notifications/${id}/click`);
    expect(JSON.parse(request.data)).toEqual({ actionKey: 'open-listing', channel: 'InApp' });
  });

  it('pins and stars through PUT with the state in the query string', async () => {
    const id = await firstId();

    await pinNotification(id, true);
    expect(lastRequest('put').url).toBe(`/notifications/${id}/pin`);
    expect(lastRequest('put').params).toEqual({ pinned: true });

    await starNotification(id, false);
    expect(lastRequest('put').url).toBe(`/notifications/${id}/star`);
    expect(lastRequest('put').params).toEqual({ starred: false });
  });

  it('archives and restores rather than deleting, and delete is a different route', async () => {
    const id = await firstId();

    const archived = await archiveNotification(id);
    expect(archived.isArchived).toBe(true);
    expect(lastRequest('post').url).toBe(`/notifications/${id}/archive`);

    const restored = await restoreNotification(id);
    expect(restored.isArchived).toBe(false);
    expect(lastRequest('post').url).toBe(`/notifications/${id}/restore`);

    // Archive is reversible and delete is not. They are separate routes on the
    // server and must stay separate here: a screen that sent DELETE for "archive"
    // would be destroying rows behind a button that promises filing.
    await deleteNotification(id);
    expect(lastRequest('delete').url).toBe(`/notifications/${id}`);
  });

  it('dismisses through the shared click/dismiss route', async () => {
    const id = await firstId();
    await dismissNotification(id);

    expect(lastRequest('post').url).toBe(`/notifications/${id}/dismiss`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

describe('preferences', () => {
  it('reads the whole record from one route', async () => {
    const preferences = await fetchNotificationPreferences();

    expect(lastRequest('get').url).toBe('/notifications/preferences');
    expect(Array.isArray(preferences.categories)).toBe(true);
    expect(preferences.communication).toBeDefined();
  });

  it('writes only what changed, with category keys mapped to booleans', async () => {
    await updateNotificationPreferences({ categories: { marketplace: false } });

    const request = lastRequest('put');
    expect(request.url).toBe('/notifications/preferences');
    // A dictionary keyed by category, not an array of rows. The two are easy to
    // confuse from the read shape — which *is* an array — and sending the read
    // shape back would be accepted as an empty update.
    expect(JSON.parse(request.data)).toEqual({ categories: { marketplace: false } });
  });

  it('surfaces the refusal when a mandatory category is switched off', async () => {
    // Security notices are not optional, and the server says so with
    // `Notifications.Preference.CriticalChannelRequired` rather than by silently
    // ignoring the field. A client that swallowed this would render a switch as
    // off while the platform kept sending.
    const mandatory = (await fetchNotificationCategories()).find(
      (category) => category.isMandatory,
    );
    expect(mandatory).toBeDefined();

    await expect(
      updateNotificationPreferences({ categories: { [mandatory!.key]: false } }),
    ).rejects.toMatchObject({
      response: { status: 400, data: { code: 'Notifications.Preference.CriticalChannelRequired' } },
    });
  });

  it('surfaces the refusal when quiet hours start and end at the same time', async () => {
    await expect(
      updateNotificationPreferences({
        quietHoursEnabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 22,
      }),
    ).rejects.toMatchObject({
      response: { status: 400, data: { code: 'Notifications.Preference.QuietHoursInvalid' } },
    });
  });

  it('reports a mandatory category as subscribed whatever is stored against it', async () => {
    const subscriptions = await fetchNotificationSubscriptions();

    expect(lastRequest('get').url).toBe('/notifications/preferences/subscriptions');

    const mandatory = subscriptions.filter((subscription) => subscription.isMandatory);
    expect(mandatory.length).toBeGreaterThan(0);
    // `emailEnabled` reports what the platform will do, not what the member
    // asked for; `unsubscribedAt` is the record of the asking. Rendering a
    // mandatory row as "off" beside a switch that does nothing is how a member
    // concludes the switch is broken.
    expect(mandatory.every((subscription) => subscription.emailEnabled)).toBe(true);
    expect(mandatory.every((subscription) => subscription.unsubscribedAt === null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Push endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('push endpoints', () => {
  const device = {
    token: 'ExponentPushToken[abc]',
    platform: 'IOS',
    deviceIdentifier: 'device-abc',
    friendlyName: "Ama's phone",
    appVersion: '1.4.0',
  };

  it('registers with PUT and names the token field the way the contract does', async () => {
    await registerNotificationDevice(device);

    const request = lastRequest('put');
    expect(request.url).toBe('/notifications/devices');
    // `token`, not `deviceToken`. `RegisterNotificationDeviceRequest` marks it
    // `required`, so the wrong spelling is refused at deserialisation — and the
    // refusal names a field the client does not have, which is how it survives
    // a reading of the error.
    expect(JSON.parse(request.data)).toEqual(device);
  });

  it('is idempotent on the device identifier, so a retry is one endpoint', async () => {
    await registerNotificationDevice(device);
    await registerNotificationDevice(device);

    const devices = await fetchNotificationDevices();
    // Two registrations, one endpoint. Were it otherwise, a client retrying on a
    // flaky connection would make every push arrive twice.
    expect(devices.filter((entry) => entry.deviceIdentifier === 'device-abc').length).toBe(1);
  });

  it('deactivates the others with no body at all', async () => {
    await registerNotificationDevice(device);
    await deactivateOtherNotificationDevices();

    const request = lastRequest('post');
    expect(request.url).toBe('/notifications/devices/deactivate-others');
    // Which endpoint is spared is the server's decision, taken from the
    // session's device claim. A client that named the device to keep would be a
    // client that could keep somebody else's.
    expect(request.data).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache keys
// ─────────────────────────────────────────────────────────────────────────────

describe('the query keys', () => {
  it('separate the preference record from the subscription rows', () => {
    // The two routes answer different questions off the same rows — "what did
    // the member ask for" against "what will the platform do". One cache entry
    // for both would make a preference write refetch a list nothing changed,
    // and would make a stale subscription list look like a failed write.
    expect(notificationKeys.preferences()).not.toEqual(notificationKeys.subscriptions());
  });

  it('give a filtered inbox its own entry, so two filters are not one cache row', () => {
    expect(notificationKeys.inbox({ scope: 'archived' })).not.toEqual(
      notificationKeys.inbox({ scope: 'inbox' }),
    );
    // An absent filter set must be stable, or every render is a cache miss.
    expect(notificationKeys.inbox()).toEqual(notificationKeys.inbox());
  });
});
