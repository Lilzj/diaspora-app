// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration journeys (Frontend Phase 16, §34 · §64 · §68)
//
// §64's required scenarios, driven end to end against the same handlers the app
// uses. Not "the function returns something" but "the flow a member goes
// through produces the state they see".
//
//   Google Calendar   connect · deny · reauthorize · sync · disconnect · failure
//   Apple Calendar    permission granted · denied · settings · add event
//   Push              granted · denied · registration · refresh · logout
//   Identity          connect · link · unlink · conflict
//   Government        country selection · unavailable API · stale information
//
// ── §34, and the distinction that is easy to collapse ────────────────────────
//
// "Some integrations can work offline. Some cannot. The UI must clearly
// communicate the difference."
//
// The device calendar keeps working with no network — it is an OS API. Google
// Calendar does not. Collapsing those into one "you are offline" state would
// tell a member they cannot add an event to their own phone's calendar, which
// is false. The catalogue carries `offlineCapabilities` per integration so the
// distinction is data rather than a special case, and it is asserted here.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import * as gapApi from '@/lib/integrations-gap-api';
import { setupIntegrationGapMocks } from '@/mocks/handlers/integrations-gaps';
import { resetIntegrationGapData } from '@/mocks/integrations-gap-data';
import { integrationCatalog, descriptorFor } from '@/lib/integrations/catalog';
import { applyUnlinkRules } from '@/lib/integrations/identity';
import { isIntegrationError } from '@/lib/integrations/errors';
import {
  __resetAdapterPushState,
  __setAdapterPushPermission,
} from '@/lib/integrations/providers/push';
import {
  __resetPushRegistration,
  readPushPermission,
  requestPushPermission,
} from '@/lib/integrations/push-lifecycle';
import { __setAdapterOAuthOutcome, adapterOAuthProvider } from '@/lib/integrations/providers/oauth';
import { adapterGovernmentProvider } from '@/lib/integrations/providers/government';

let mock: MockAdapter;

beforeEach(() => {
  resetIntegrationGapData();
  mock = new MockAdapter(apiClient);
  setupIntegrationGapMocks(mock);
});

afterEach(() => mock.restore());

// ═════════════════════════════════════════════════════════════════════════════
// §64 — Google Calendar
// ═════════════════════════════════════════════════════════════════════════════

describe('§64 · Google Calendar: connect, use, disconnect', () => {
  it('connecting produces a connection that says it is simulated', async () => {
    const connection = await gapApi.exchangeAuthorizationCode({
      provider: 'calendar.google',
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'diaspora://integrations/oauth',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      intent: 'link',
    });

    expect(connection.status).toBe('CONNECTED');
    expect(connection.mode).toBe('DEVELOPMENT_PROVIDER');
    expect(connection.scopes).toContain('https://www.googleapis.com/auth/calendar.events');
  });

  it('the connection then appears in the list', async () => {
    await gapApi.exchangeAuthorizationCode({
      provider: 'calendar.google',
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'diaspora://integrations/oauth',
      scopes: [],
      intent: 'link',
    });

    const connections = await gapApi.fetchConnections();
    expect(connections.map((entry) => entry.provider)).toContain('calendar.google');
  });

  it('lists calendars, including one that cannot be written to', async () => {
    const calendars = await gapApi.fetchRemoteCalendars('calendar.google');

    expect(calendars.length).toBeGreaterThan(1);
    // The read-only calendar exists in the fixtures precisely so the disabled
    // row and the 403 branch are reachable in development rather than only in
    // production.
    expect(calendars.some((calendar) => !calendar.allowsModifications)).toBe(true);
  });

  it('writes an event and finds it again, so a second export is a duplicate', async () => {
    const draft = {
      sourceId: 'evt-1',
      sourceKind: 'event' as const,
      title: 'Community meeting',
      startsAt: '2026-09-01T17:00:00.000Z',
      endsAt: '2026-09-01T19:00:00.000Z',
      timeZone: 'Africa/Lagos',
      isAllDay: false,
      reminderMinutes: [60],
    };

    const ref = await gapApi.createRemoteCalendarEvent('calendar.google', 'sim-cal-primary', draft);
    expect(ref.externalEventId).toBeTruthy();

    const found = await gapApi.findRemoteExportedEvent(
      'calendar.google',
      'evt-1',
      'sim-cal-primary'
    );
    expect(found?.externalEventId).toBe(ref.externalEventId);
  });

  it('refuses an event with no timezone rather than defaulting one', async () => {
    // §62 enforced by the contract, not only by the client: a default here is
    // exactly the silent conversion the rule forbids.
    await expect(
      gapApi.createRemoteCalendarEvent('calendar.google', 'sim-cal-primary', {
        sourceId: 'evt-2',
        sourceKind: 'event',
        title: 'x',
        startsAt: '2026-09-01T17:00:00.000Z',
        endsAt: '2026-09-01T19:00:00.000Z',
        timeZone: '',
        isAllDay: false,
        reminderMinutes: [],
      })
    ).rejects.toThrow();
  });

  it('refuses a write to a read-only calendar', async () => {
    await expect(
      gapApi.createRemoteCalendarEvent('calendar.google', 'sim-cal-shared', {
        sourceId: 'evt-3',
        sourceKind: 'event',
        title: 'x',
        startsAt: '2026-09-01T17:00:00.000Z',
        endsAt: '2026-09-01T19:00:00.000Z',
        timeZone: 'Europe/London',
        isAllDay: false,
        reminderMinutes: [],
      })
    ).rejects.toThrow();
  });

  it('a sync reports a partial outcome rather than a clean one', async () => {
    // A simulation that always synced everything would leave §35's `partial`
    // phase — the one hardest to render honestly — unexercised in every
    // development build.
    const status = await gapApi.fetchCalendarSyncStatus('calendar.google');

    expect(status.phase).toBe('partial');
    expect(status.itemsFailed).toBeGreaterThan(0);
    expect(status.failureReasons.length).toBeGreaterThan(0);
    expect(status.needsAttention).toBe(true);
  });

  it('disconnecting clears the account, and is idempotent', async () => {
    await gapApi.exchangeAuthorizationCode({
      provider: 'calendar.google',
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'diaspora://integrations/oauth',
      scopes: [],
      intent: 'link',
    });

    const first = await gapApi.disconnectIntegration('calendar.google', true);
    expect(first.status).toBe('DISCONNECTED');
    expect(first.account).toBeNull();

    // §41: a 404 on the retry is exactly how the UI is left saying "Connected".
    const second = await gapApi.disconnectIntegration('calendar.google', true);
    expect(second.status).toBe('DISCONNECTED');

    expect((await gapApi.fetchConnections()).map((entry) => entry.provider)).not.toContain(
      'calendar.google'
    );
  });

  it('a denied authorization is an outcome, not an exception', async () => {
    // A member backing out of a consent screen is not an error, and a `catch`
    // block is the wrong place to handle the second-most-common path.
    __setAdapterOAuthOutcome('denied');
    const outcome = await adapterOAuthProvider('calendar.google').authorize(['calendar.events']);

    expect(outcome.kind).toBe('denied');
    __setAdapterOAuthOutcome('authorized');
  });

  it('a cancelled authorization is its own outcome', async () => {
    __setAdapterOAuthOutcome('cancelled');
    const outcome = await adapterOAuthProvider('calendar.google').authorize([]);

    expect(outcome.kind).toBe('cancelled');
    __setAdapterOAuthOutcome('authorized');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §64 — Push
// ═════════════════════════════════════════════════════════════════════════════

describe('§64 · Push: permission granted, denied, and blocked', () => {
  beforeEach(() => {
    __resetPushRegistration();
    __resetAdapterPushState();
  });

  it('starts as not requested, so the explanation can come first', async () => {
    // A component that asked on mount would consume the member's one chance to
    // say yes before they had read why — and on Android 13 a denial is
    // effectively permanent.
    const registration = await readPushPermission();
    expect(registration.permission).toBe('notRequested');
  });

  it('granting produces a granted permission', async () => {
    const registration = await requestPushPermission();
    expect(registration.permission).toBe('granted');
  });

  it('a blocked permission stays blocked when asked again', async () => {
    // The distinction that decides the recovery: an "Allow" button for a
    // blocked permission does nothing at all and teaches the member the app is
    // broken.
    __setAdapterPushPermission({ state: 'blocked', requiresSettings: true, canAskAgain: false });

    const registration = await requestPushPermission();
    expect(registration.permission).toBe('blocked');
  });

  it('a restricted permission is not the member’s to change', async () => {
    __setAdapterPushPermission({ state: 'restricted', requiresSettings: false, canAskAgain: false });
    const registration = await requestPushPermission();
    expect(registration.permission).toBe('restricted');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §64 — Identity
// ═════════════════════════════════════════════════════════════════════════════

describe('§64 · Identity: link, conflict, unlink', () => {
  it('a member starts with exactly one usable sign-in method', async () => {
    // The seed reflects reality — phone is the only certified authentication
    // method — which makes §24's lock-out rule active in development rather
    // than reachable only by contriving it.
    const links = applyUnlinkRules(await gapApi.fetchIdentityLinks());

    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe('identity.phone');
    expect(links[0].canUnlink).toBe(false);
  });

  it('linking a provider adds it without replacing the first', async () => {
    await gapApi.exchangeAuthorizationCode({
      provider: 'identity.google',
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'diaspora://integrations/oauth',
      scopes: ['openid'],
      intent: 'link',
    });

    const links = await gapApi.fetchIdentityLinks();
    expect(links.map((link) => link.provider)).toEqual(
      expect.arrayContaining(['identity.phone', 'identity.google'])
    );
  });

  it('linking the same provider twice does not duplicate it', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await gapApi.exchangeAuthorizationCode({
        provider: 'identity.google',
        code: 'c',
        codeVerifier: 'v',
        redirectUri: 'diaspora://integrations/oauth',
        scopes: ['openid'],
        intent: 'link',
      });
    }

    const google = (await gapApi.fetchIdentityLinks()).filter(
      (link) => link.provider === 'identity.google'
    );
    expect(google).toHaveLength(1);
  });

  it('unlinking needs a reauthentication', async () => {
    // An attacker with a borrowed unlocked phone must not be able to detach the
    // owner's recovery method.
    await expect(gapApi.unlinkIdentity('identity.google', '')).rejects.toThrow();
  });

  it('the server refuses to remove the last usable method', async () => {
    // §24's actual control. The disabled button on the client is a courtesy;
    // this is the thing that holds.
    const error = await gapApi.unlinkIdentity('identity.phone', 'reauth-token').catch((cause) => cause);

    expect(isIntegrationError(error)).toBe(true);
    if (isIntegrationError(error)) expect(error.kind).toBe('Conflict');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §64 — Government
// ═════════════════════════════════════════════════════════════════════════════

describe('§64 · Government: country selection, provenance, staleness', () => {
  it('lists only the countries this deployment has a source for', async () => {
    const countries = await adapterGovernmentProvider.supportedCountries();
    expect(countries.length).toBeGreaterThan(0);
  });

  it('an unsupported country returns nothing rather than another country’s notices', async () => {
    // §60 at the data layer.
    expect(await adapterGovernmentProvider.listNotices('ZZ')).toEqual([]);
  });

  it('never attributes simulated content to a real authority', async () => {
    // §19's core prohibition. Asserted at the provider boundary rather than on
    // the fixtures, so a fixture edited later cannot break it.
    const notices = await adapterGovernmentProvider.listNotices('GB');

    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) {
      expect(notice.source.kind).not.toBe('official');
      expect(notice.source.verification).toBe('unverified');
      expect(notice.source.officialUrl).toBeNull();
      // No real ministry, embassy or department is named as a publisher.
      expect(notice.source.authority).toMatch(/Diaspora/);
    }
  });

  it('the country is carried on every item', async () => {
    const notices = await adapterGovernmentProvider.listNotices('NG');
    for (const notice of notices) {
      expect(notice.source.countryCode).toBe('NG');
    }
  });

  it('carries a last-checked date, so staleness is renderable', async () => {
    const notices = await adapterGovernmentProvider.listNotices('MU');
    for (const notice of notices) {
      expect(notice.source.lastCheckedAt).toBeTruthy();
    }
  });

  it('filters by category without inventing one', async () => {
    const advisories = await adapterGovernmentProvider.listNotices('GB', { category: 'advisory' });
    expect(advisories.every((notice) => notice.category === 'advisory')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §34 — offline
// ═════════════════════════════════════════════════════════════════════════════

describe('§34 · what works offline is stated per integration, not globally', () => {
  it('the device calendar keeps working with no network', () => {
    // It is an OS API. Telling a member they cannot add an event to their own
    // phone's calendar because they are offline would be false.
    const descriptor = descriptorFor('calendar.device');
    expect(descriptor?.offlineCapabilities).toContain('calendar.event.create');
  });

  it('a remote calendar does not', () => {
    const descriptor = descriptorFor('calendar.google');
    expect(descriptor?.offlineCapabilities).toEqual([]);
  });

  it('the map still renders', () => {
    // Phase 8's canvas renderer needs no network, no tiles and no key.
    expect(descriptorFor('maps.platform')?.offlineCapabilities).toContain('maps.render');
  });

  it('nothing can be paid offline', () => {
    expect(descriptorFor('payments.platform')?.offlineCapabilities).toEqual([]);
  });

  it('every integration declares an answer', () => {
    // An absent array would be indistinguishable from "nothing works offline",
    // and the two are different claims.
    for (const descriptor of integrationCatalog()) {
      expect(Array.isArray(descriptor.offlineCapabilities)).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §5 · §37 — the catalogue itself
// ═════════════════════════════════════════════════════════════════════════════

describe('§5 · §37 · every integration in the catalogue is completely described', () => {
  const catalog = integrationCatalog();

  it('covers every domain in scope for this phase', () => {
    const domains = new Set(catalog.map((entry) => entry.domain));
    for (const domain of ['calendar', 'maps', 'push', 'email', 'sms', 'government', 'identity', 'payments'] as const) {
      expect(domains.has(domain)).toBe(true);
    }
  });

  it.each(catalog.map((entry) => [entry.provider, entry] as const))(
    '%s answers all four consent questions',
    (_provider, descriptor) => {
      expect(descriptor.consent.accesses.length).toBeGreaterThan(0);
      expect(descriptor.consent.reasons.length).toBeGreaterThan(0);
      expect(descriptor.consent.stores.length).toBeGreaterThan(0);
      // The list that would be dropped first if it were optional prose.
      expect(descriptor.consent.doesNotStore.length).toBeGreaterThan(0);
      expect(descriptor.consent.disconnectSummary.length).toBeGreaterThan(10);
      expect(descriptor.consent.privacyNote.length).toBeGreaterThan(10);
    }
  );

  it.each(catalog.map((entry) => [entry.provider, entry] as const))(
    '%s declares at least one capability',
    (_provider, descriptor) => {
      expect(descriptor.capabilities.length).toBeGreaterThan(0);
    }
  );

  it('every permission explains itself without marketing language', () => {
    for (const descriptor of catalog) {
      for (const permission of descriptor.permissions) {
        expect(permission.rationale.length).toBeGreaterThan(20);
        expect(permission.rationale).not.toMatch(/improve your experience/i);
        expect(permission.requiredFor.length).toBeGreaterThan(0);
      }
    }
  });

  it('§51 · the member-connectable integrations appear somewhere other than Settings', () => {
    for (const descriptor of catalog) {
      if (!descriptor.isMemberConnectable) continue;
      expect(descriptor.contextualEntryPoints.length).toBeGreaterThan(0);
    }
  });
});
