// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration isolation (Frontend Phase 16, §42 · §43 · §44 · §47)
//
// §43 says this is mandatory and names the requirement precisely: prove that
// user A's Google Calendar state cannot appear for user B, and the same for map
// preferences, notification preferences, payment state and integration status.
//
// So this file proves it at the two levels where it could fail:
//
//   **The key level.** Every member produces a different key, for every
//   integration surface.
//
//   **The cache level.** A real `QueryClient` is populated as one member and
//   interrogated as another. Not "the keys look different" but "the second
//   member reads undefined", which is the property somebody actually depends on.
//
// ── Why keying matters even though sign-out clears the cache ─────────────────
//
// It is tempting to argue that `queryClient.clear()` on sign-out makes this
// unnecessary. It does not, for three reasons that have all happened to real
// applications:
//
//   * TanStack Query serves cached data **synchronously on mount**. The wrong
//     data renders first and is corrected a moment later, which is worse than a
//     spinner because the member reads it.
//   * A failed or racing clear leaves entries behind, and nothing surfaces that.
//   * Keying is a property of the code; clearing is a property of one call site
//     that a future refactor can move.
//
// Keyed, the wrong entry cannot be *found* even if it is still there.
//
// ── §44, the push token, and the worst failure available here ────────────────
//
// A token registered for A and left active when B signs in routes A's private
// messages to B's lock screen. It is silent, invisible in single-account
// testing, and a data breach. The lifecycle assertions below are the ones that
// matter most in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryClient } from '@tanstack/react-query';
import { integrationKeys, memberToken } from '@/lib/integrations/query-keys';
import {
  __resetPushRegistration,
  fingerprintToken,
  getPushRegistration,
  registerPushToken,
} from '@/lib/integrations/push-lifecycle';
import {
  __resetAdapterPushState,
  __setAdapterPushPermission,
  adapterPushProvider,
} from '@/lib/integrations/providers/push';
import { beginFlow, clearPendingFlows, readPendingFlow } from '@/lib/integrations/deep-links';
import type { IntegrationConnection } from '@/types/integrations';

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

function connection(provider: IntegrationConnection['provider']): IntegrationConnection {
  return {
    provider,
    domain: 'calendar',
    status: 'CONNECTED',
    mode: 'DEVELOPMENT_PROVIDER',
    account: { externalId: 'x', accountLabel: 'a@example.com' },
    grantedCapabilities: ['calendar.event.create'],
    scopes: ['calendar.events'],
    expiresAt: null,
    lastSyncedAt: null,
    lastError: null,
    gapId: null,
    observedAt: '2026-08-09T09:00:00.000Z',
  };
}

describe('§43 · every member-scoped key carries its member', () => {
  // Every key builder that reads member-specific state. A new one added without
  // a member fragment would be a hole this list is meant to catch, so the check
  // is over the whole surface rather than over a sample.
  const builders: { name: string; build: (userId: string | null) => readonly unknown[] }[] = [
    { name: 'connections', build: integrationKeys.connections },
    { name: 'overview', build: integrationKeys.overview },
    { name: 'calendars', build: integrationKeys.calendars },
    { name: 'calendarSettings', build: integrationKeys.calendarSettings },
    { name: 'email', build: integrationKeys.email },
    { name: 'pushDevices', build: integrationKeys.pushDevices },
    { name: 'pushPermission', build: integrationKeys.pushPermission },
    { name: 'paymentMethods', build: integrationKeys.paymentMethods },
  ];

  it.each(builders)('$name produces a different key per member', ({ build }) => {
    expect(build(USER_A)).not.toEqual(build(USER_B));
  });

  it.each(builders)('$name contains the member id', ({ build }) => {
    expect(build(USER_A)).toContain(USER_A);
  });

  it('a signed-out reader is a distinct, named slot rather than a missing one', () => {
    // `anonymous` rather than `undefined`, so a cache dump distinguishes
    // "nobody is signed in" from "a bug dropped the id" — and so a signed-out
    // entry cannot collide with a signed-in one.
    expect(memberToken(null)).toBe('anonymous');
    expect(memberToken('')).toBe('anonymous');
    expect(integrationKeys.connections(null)).not.toEqual(integrationKeys.connections(USER_A));
  });

  it('the per-provider connection key is scoped as well as the list', () => {
    expect(integrationKeys.connection(USER_A, 'calendar.google')).not.toEqual(
      integrationKeys.connection(USER_B, 'calendar.google')
    );
    // And two providers for one member do not collide either.
    expect(integrationKeys.connection(USER_A, 'calendar.device')).not.toEqual(
      integrationKeys.connection(USER_A, 'calendar.google')
    );
  });
});

describe('§43 · a real cache cannot serve one member’s state to another', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('connections written as A are invisible as B', () => {
    client.setQueryData(integrationKeys.connections(USER_A), [connection('calendar.google')]);

    expect(client.getQueryData(integrationKeys.connections(USER_A))).toHaveLength(1);
    // The property a member depends on: not "the keys differ" but "B reads
    // nothing".
    expect(client.getQueryData(integrationKeys.connections(USER_B))).toBeUndefined();
  });

  it('calendar settings written as A are invisible as B', () => {
    client.setQueryData(integrationKeys.calendarSettings(USER_A), { defaultCalendarId: 'cal-A' });
    expect(client.getQueryData(integrationKeys.calendarSettings(USER_B))).toBeUndefined();
  });

  it('payment methods written as A are invisible as B', () => {
    client.setQueryData(integrationKeys.paymentMethods(USER_A), [{ id: 'pm-A', last4: '4242' }]);
    expect(client.getQueryData(integrationKeys.paymentMethods(USER_B))).toBeUndefined();
  });

  it('email state written as A is invisible as B', () => {
    client.setQueryData(integrationKeys.email(USER_A), { address: 'a@example.com' });
    expect(client.getQueryData(integrationKeys.email(USER_B))).toBeUndefined();
  });

  it('push devices written as A are invisible as B', () => {
    client.setQueryData(integrationKeys.pushDevices(USER_A), [{ device: { id: 'd1' } }]);
    expect(client.getQueryData(integrationKeys.pushDevices(USER_B))).toBeUndefined();
  });

  it('invalidating A’s integrations leaves B’s alone', () => {
    client.setQueryData(integrationKeys.connections(USER_A), [connection('calendar.google')]);
    client.setQueryData(integrationKeys.connections(USER_B), [connection('calendar.google')]);

    void client.invalidateQueries({ queryKey: integrationKeys.all(USER_A) });

    // Invalidation marks stale rather than removing, so both are still present.
    // What matters is that B's entry was not *touched* — a prefix that matched
    // both would refetch B's data as a side effect of A doing something.
    const stateA = client.getQueryState(integrationKeys.connections(USER_A));
    const stateB = client.getQueryState(integrationKeys.connections(USER_B));

    expect(stateA?.isInvalidated).toBe(true);
    expect(stateB?.isInvalidated).toBe(false);
  });
});

describe('§44 · the push token belongs to exactly one member at a time', () => {
  beforeEach(() => {
    __resetPushRegistration();
    __resetAdapterPushState();
    __setAdapterPushPermission({ state: 'granted', requiresSettings: false, canAskAgain: false });
  });

  it('a fingerprint is not the token', () => {
    const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
    const fingerprint = fingerprintToken(token);

    expect(fingerprint).not.toContain(token);
    expect(fingerprint.length).toBeLessThan(token.length);
    // Stable, so "is this the same token as last time" is answerable.
    expect(fingerprintToken(token)).toBe(fingerprint);
    // And different tokens do not collide on the values that matter.
    expect(fingerprintToken(`${token}2`)).not.toBe(fingerprint);
  });

  it('registration records which member it is for', async () => {
    const result = await registerPushToken(USER_A);
    expect(result.registration.registeredForUserId).toBe(USER_A);
  });

  it('a simulated token is never sent to the real device registry', async () => {
    // The refusal that keeps an undeliverable address out of B13's production
    // database. Checked on the transport rather than on the build flag, so
    // enabling gap preview cannot route around it.
    const result = await registerPushToken(USER_A);

    expect(result.device).toBeNull();
    expect(result.registration.deviceId).toBeNull();
    expect(result.skippedReason).toMatch(/development build/i);
  });

  it('registering for a second member replaces the first, never adds to it', async () => {
    await registerPushToken(USER_A);
    expect(getPushRegistration().registeredForUserId).toBe(USER_A);

    await registerPushToken(USER_B);

    // The property §44 is about: one device, one member, at any moment.
    expect(getPushRegistration().registeredForUserId).toBe(USER_B);
    expect(getPushRegistration().registeredForUserId).not.toBe(USER_A);
  });

  it('makes the Android channels whenever it has a token', async () => {
    // Added 7 Oct 2026. They were made only when this app asked for permission,
    // so a member who allowed notifications another way had none, and every push
    // landed in Android's "Miscellaneous" channel.
    const channels = jest.spyOn(adapterPushProvider, 'configureChannels');

    await registerPushToken(USER_A);

    expect(channels).toHaveBeenCalled();
    channels.mockRestore();
  });

  it('a denied permission produces no registration at all', async () => {
    __setAdapterPushPermission({ state: 'denied', requiresSettings: false, canAskAgain: true });

    const result = await registerPushToken(USER_A);

    expect(result.registration.deviceId).toBeNull();
    expect(result.skippedReason).toBeTruthy();
    // Minting a token without permission would produce one that never delivers.
    expect(result.registration.registeredForUserId).toBeNull();
  });
});

describe('§40 · §42 · a pending authorization cannot resume in another member’s session', () => {
  afterEach(async () => {
    await clearPendingFlows(USER_A);
    await clearPendingFlows(USER_B);
  });

  it('a flow started by A is not readable as B', async () => {
    await beginFlow(USER_A, { provider: 'calendar.google', intent: 'link' });

    expect(await readPendingFlow(USER_A)).not.toBeNull();
    expect(await readPendingFlow(USER_B)).toBeNull();
  });

  it('clearing A’s flow leaves B’s alone', async () => {
    await beginFlow(USER_A, { provider: 'calendar.google', intent: 'link' });
    await beginFlow(USER_B, { provider: 'calendar.google', intent: 'link' });

    await clearPendingFlows(USER_A);

    expect(await readPendingFlow(USER_A)).toBeNull();
    expect(await readPendingFlow(USER_B)).not.toBeNull();
  });

  it('each flow gets its own state token', async () => {
    const first = await beginFlow(USER_A, { provider: 'calendar.google', intent: 'link' });
    const second = await beginFlow(USER_B, { provider: 'calendar.google', intent: 'link' });

    expect(first.state).not.toBe(second.state);
  });
});
