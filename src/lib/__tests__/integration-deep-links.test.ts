// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration deep links (Frontend Phase 16, §40 · §49)
//
// §40's sentence: **"Do not assume the app is still alive when the callback
// arrives."**
//
// It usually is not. An OAuth flow puts the system browser in the foreground
// for as long as it takes somebody to find their password, and Android will
// reclaim a backgrounded React Native process in that time. When the browser
// redirects, the app cold-starts with an empty component tree — so a flow whose
// pending state lives in `useState` works in every manual test on a fast device
// and fails on the phones of the people most likely to be using this app.
//
// The assertions here are about the persisted record surviving that, and about
// the three limits on it: a short expiry, a member-scoped key, and a state
// token that must match.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  beginFlow,
  callbackKindFor,
  clearPendingFlows,
  parseCallbackParams,
  readPendingFlow,
  resolveCallback,
  routeForCallback,
} from '@/lib/integrations/deep-links';
import { buildRedirectUri } from '@/config/integration-config';
import {
  followNotificationRoute,
  integrationNotificationRoute,
  isIntegrationNotification,
  isResolvableRoute,
  INTEGRATION_NOTIFICATION_TYPES,
} from '@/lib/notification-routes';

const USER = 'user-deep-link';

afterEach(async () => {
  await clearPendingFlows(USER);
});

describe('§40 · a callback URL is recognised and parsed', () => {
  it('recognises each of this app’s callbacks', () => {
    expect(callbackKindFor(`${buildRedirectUri('oauth')}?code=abc`)).toBe('oauth');
    expect(callbackKindFor(`${buildRedirectUri('payment')}?status=ok`)).toBe('payment');
    expect(callbackKindFor(`${buildRedirectUri('verify')}?token=abc`)).toBe('verify');
  });

  it('recognises nothing else', () => {
    expect(callbackKindFor('https://example.com/oauth?code=abc')).toBeNull();
    expect(callbackKindFor('diaspora://community/lagos')).toBeNull();
  });

  it('reads query parameters', () => {
    const params = parseCallbackParams('diaspora://x?code=abc&state=s1');
    expect(params).toEqual({ code: 'abc', state: 's1' });
  });

  it('reads fragment parameters as well as query ones', () => {
    // A parser that read only the query would silently see an empty response
    // for a fragment-style callback, which several providers still use.
    const params = parseCallbackParams('diaspora://x#code=abc&state=s1');
    expect(params).toEqual({ code: 'abc', state: 's1' });
  });

  it('decodes escaped values', () => {
    const params = parseCallbackParams('diaspora://x?scope=openid%20email');
    expect(params.scope).toBe('openid email');
  });

  it('survives a malformed escape rather than throwing', () => {
    // A callback with one bad parameter should still deliver the others.
    const params = parseCallbackParams('diaspora://x?good=1&bad=%E0%A4%A');
    expect(params.good).toBe('1');
  });

  it('returns nothing for a URL with no parameters', () => {
    expect(parseCallbackParams('diaspora://x')).toEqual({});
  });
});

describe('§40 · a pending flow survives the app being killed', () => {
  it('is readable from storage rather than from memory', async () => {
    const started = await beginFlow(USER, {
      provider: 'identity.google',
      intent: 'link',
      codeVerifier: 'v',
      returnRoute: '/settings/integrations/identity',
    });

    // Read back with no reference to the object `beginFlow` returned — this is
    // the cold-start path.
    const resumed = await readPendingFlow(USER);

    expect(resumed?.state).toBe(started.state);
    expect(resumed?.codeVerifier).toBe('v');
    expect(resumed?.returnRoute).toBe('/settings/integrations/identity');
  });

  it('expires, so a stale link cannot complete an abandoned authorization', async () => {
    await beginFlow(USER, { provider: 'identity.google', intent: 'link' });

    // Rewrite the record with a start time outside the TTL, which is what an
    // hour-old abandoned flow looks like.
    const raw = await AsyncStorage.getItem(`diaspora_integration_pending_flow_${USER}`);
    const record = JSON.parse(raw as string);
    record.startedAt = Date.now() - 60 * 60 * 1000;
    await AsyncStorage.setItem(
      `diaspora_integration_pending_flow_${USER}`,
      JSON.stringify(record)
    );

    expect(await readPendingFlow(USER)).toBeNull();
  });
});

describe('§40 · every outcome is handled, not only success', () => {
  it('resolves a matching callback', async () => {
    const flow = await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    const { outcome } = await resolveCallback(USER, `diaspora://x?code=abc&state=${flow.state}`);

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') expect(outcome.params.code).toBe('abc');
  });

  it('is single-use, so a replayed link cannot complete the same flow twice', async () => {
    const flow = await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    const url = `diaspora://x?code=abc&state=${flow.state}`;

    expect((await resolveCallback(USER, url)).outcome.kind).toBe('success');
    // A replayed OAuth code would produce a provider error; a replayed payment
    // return would double a status refresh.
    expect((await resolveCallback(USER, url)).outcome.kind).toBe('expired');
  });

  it('discards a callback whose state does not match', async () => {
    // The CSRF defence `state` exists for, and also what stops a link from a
    // *different* pending flow completing the wrong one.
    await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    const { outcome } = await resolveCallback(USER, 'diaspora://x?code=abc&state=not-mine');

    expect(outcome.kind).toBe('unknown');
  });

  it('discards a callback with no state at all', async () => {
    await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    const { outcome } = await resolveCallback(USER, 'diaspora://x?code=abc');
    expect(outcome.kind).toBe('unknown');
  });

  it('reports a denial as a denial', async () => {
    const flow = await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    const { outcome } = await resolveCallback(
      USER,
      `diaspora://x?error=access_denied&state=${flow.state}`
    );

    expect(outcome.kind).toBe('denied');
  });

  it('reports a cancellation as a cancellation, not a failure', async () => {
    const flow = await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    const { outcome } = await resolveCallback(
      USER,
      `diaspora://x?error=user_cancelled&state=${flow.state}`
    );

    expect(outcome.kind).toBe('cancelled');
  });

  it('reports a callback with no pending flow as expired, not as an error', async () => {
    // The most common non-success path: a stale link, a second tap, a callback
    // after a sign-out. Treating it as failure would show an error to a member
    // who did nothing wrong.
    const { outcome } = await resolveCallback(USER, 'diaspora://x?code=abc&state=s');
    expect(outcome.kind).toBe('expired');
  });
});

describe('§40 · the return route never comes from the callback', () => {
  it('uses the route the flow recorded when it started', async () => {
    const flow = await beginFlow(USER, {
      provider: 'identity.google',
      intent: 'link',
      returnRoute: '/settings/integrations/identity',
    });

    expect(routeForCallback(flow, { kind: 'success', params: {} })).toBe(
      '/settings/integrations/identity'
    );
  });

  it('sends a payment callback to the wallet, whatever the URL said', async () => {
    // A redirect target supplied by whatever opened the link is an open
    // redirect inside the app — on a payment callback, a route to a convincing
    // fake receipt.
    const flow = await beginFlow(USER, { provider: 'payments.platform', intent: 'payment' });
    expect(routeForCallback(flow, { kind: 'success', params: {} })).toMatch(/^\/wallet/);
  });

  it('falls back to the connection centre rather than nowhere', async () => {
    const flow = await beginFlow(USER, { provider: 'identity.google', intent: 'link' });
    expect(routeForCallback(flow, { kind: 'cancelled' })).toBe('/settings/integrations');
  });
});

describe('§49 · integration notifications route without changing the routing rules', () => {
  it('every integration route this build declares is resolvable', () => {
    // The property that made this a table rather than a change to
    // `KNOWN_PREFIXES`: `/settings` was already resolvable.
    for (const type of INTEGRATION_NOTIFICATION_TYPES) {
      const route = integrationNotificationRoute(type);
      expect(route).not.toBeNull();
      expect(isResolvableRoute(route)).toBe(true);
    }
  });

  it('returns null for another phase’s notification type', () => {
    // Four tables in one file, each answering only for its own domain. Passing
    // a Phase 12 type here must not produce a Phase 16 route.
    expect(integrationNotificationRoute('membership.approved')).toBeNull();
    expect(integrationNotificationRoute('community.role.granted')).toBeNull();
    expect(integrationNotificationRoute('billing.payment.failed')).toBeNull();
  });

  it('recognises the integration category', () => {
    expect(isIntegrationNotification('integrations')).toBe(true);
    expect(isIntegrationNotification(null, 'integration.grant.expired')).toBe(true);
    expect(isIntegrationNotification('billing')).toBe(false);
  });

  it('declares no payment notification type of its own', () => {
    // Payment notifications stay on B15's existing `billing.*` templates. A
    // second vocabulary would split one member-facing concept across two tables.
    expect(INTEGRATION_NOTIFICATION_TYPES.some((type) => type.includes('payment'))).toBe(false);
  });

  it('refuses a route this build cannot render', () => {
    // The existing behaviour, unchanged. A deployment can be ahead of the app
    // in the store, and a crash from tapping a notification is far worse than a
    // tap that does nothing.
    expect(followNotificationRoute('/some-future-surface/123')).toBe(false);
    expect(followNotificationRoute(null)).toBe(false);
    expect(followNotificationRoute('not-a-route')).toBe(false);
  });
});
