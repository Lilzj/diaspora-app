// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration boundary (Frontend Phase 16, §28 · §38 · §55 · §66)
//
// The structural assertions. Each proves a property of the *shape* of the code
// rather than of a single behaviour, which is what makes them worth having: a
// behavioural test proves a function does the right thing today, and these
// prove that the wrong thing is not reachable at all.
//
// Six properties:
//
//   **A release build reaches no simulated integration.** Every function in the
//   development arm refuses when the gap switch is off, and it *rejects* rather
//   than returning empty — the distinction between "you have no connections" (a
//   claim about the member) and "this build cannot show you this" (a claim
//   about the build, and the true one).
//
//   **The development arm moves no money and mints no session.** Asserted by
//   inspecting the module's exports rather than by trusting a comment. A gap API
//   that could create a payment, or produce an access token, is one somebody
//   eventually calls from a screen.
//
//   **No secret is read by the configuration module.** Asserted against the
//   module's own source, because §38's prohibition is about what the code *can*
//   read, not about what happens to be set today.
//
//   **The domain model has nowhere to put a token.** §38's strongest available
//   enforcement: a type with no field for a refresh token cannot leak one.
//
//   **No integration event can carry an identifier or a measurement.** The
//   allow-list is the whole privacy design of the telemetry layer.
//
//   **A simulated connection can never claim to be real.** §69, at the one
//   point where a mistake would be invisible.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';

import * as gapApi from '@/lib/integrations-gap-api';
import * as certifiedApi from '@/lib/integrations-api';
import { INTEGRATION_GAPS, INTEGRATION_GAP_PREFIX } from '@/config/integration-gaps';
import { INTEGRATION_PROVIDER_GAPS } from '@/config/integration-provider-gaps';
import { setupIntegrationGapMocks } from '@/mocks/handlers/integrations-gaps';
import { sanitise, drainCreatorEvents, resetCreatorEvents } from '@/lib/creator-analytics';
import { trackIntegrationEvent, trackCalendarExport } from '@/lib/integrations/events';
import { upsertConnection, resetIntegrationGapData } from '@/mocks/integrations-gap-data';
import { impliesProductionConnectivity, isSimulatedMode } from '@/types/integrations';

// `areSimulatedFeaturesEnabled()` reads `__DEV__` first, so a release build is
// simulated here by turning it off for the duration of the assertion.
// ─────────────────────────────────────────────────────────────────────────────
// Reading source files, without pulling Node's types into the project
//
// Several assertions below inspect module *source*, because they prove the
// absence of code and a behavioural test cannot do that.
//
// The obvious approach — `import fs from 'fs'` — needs `@types/node` in
// `tsconfig.json`'s `types` array, and adding it there breaks twenty existing
// assertions in Phases 5, 6 and 12: `@types/node` declares its own `globalThis`
// and shadows the ambient React Native declaration that gives those files
// `__DEV__`. A shared config change that silently retypes seven other phases'
// tests is not worth a convenience import.
//
// So the two functions are required locally with the narrowest possible
// signatures. `require` is already declared by the React Native types, and this
// is the same technique `native-map.tsx` and `device-calendar.ts` use for their
// optional native modules.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/**
 * Source with its comments removed.
 *
 * Several assertions below are about what the code *does*, and the files being
 * inspected explain in prose why they no longer do it — `integrations-api.ts`
 * names the removed `mock-jwt-token` fallback in its header precisely so nobody
 * reintroduces it. A naive `toContain` would fail on the explanation, which
 * would mean deleting the most useful comment in the file to satisfy a test
 * about the code beneath it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function readSource(...segments: string[]): string {
  return withoutComments(fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8'));
}

function withReleaseBuild<T>(body: () => T): T {
  const globals = globalThis as { __DEV__?: boolean };
  const previous = globals.__DEV__;
  globals.__DEV__ = false;
  const previousEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
  delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  try {
    return body();
  } finally {
    globals.__DEV__ = previous;
    if (previousEnv !== undefined) process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = previousEnv;
  }
}

describe('§66 · a release build reaches no simulated integration', () => {
  const reads: { name: string; call: () => Promise<unknown> }[] = [
    { name: 'fetchConnections', call: () => gapApi.fetchConnections() },
    {
      name: 'disconnectIntegration',
      call: () => gapApi.disconnectIntegration('calendar.google', true),
    },
    {
      name: 'exchangeAuthorizationCode',
      call: () =>
        gapApi.exchangeAuthorizationCode({
          provider: 'calendar.google',
          code: 'c',
          codeVerifier: 'v',
          redirectUri: 'diaspora://integrations/oauth',
          scopes: [],
          intent: 'link',
        }),
    },
    { name: 'fetchRemoteCalendars', call: () => gapApi.fetchRemoteCalendars('calendar.google') },
    {
      name: 'createRemoteCalendarEvent',
      call: () =>
        gapApi.createRemoteCalendarEvent('calendar.google', 'cal-1', {
          sourceId: 's1',
          sourceKind: 'event',
          title: 'x',
          startsAt: '2026-09-01T17:00:00.000Z',
          endsAt: '2026-09-01T19:00:00.000Z',
          timeZone: 'Africa/Lagos',
          isAllDay: false,
          reminderMinutes: [],
        }),
    },
    {
      name: 'updateRemoteCalendarEvent',
      call: () =>
        gapApi.updateRemoteCalendarEvent('calendar.google', 'e1', 'cal-1', {
          sourceId: 's1',
          sourceKind: 'event',
          title: 'x',
          startsAt: '2026-09-01T17:00:00.000Z',
          endsAt: '2026-09-01T19:00:00.000Z',
          timeZone: 'Africa/Lagos',
          isAllDay: false,
          reminderMinutes: [],
        }),
    },
    {
      name: 'deleteRemoteCalendarEvent',
      call: () => gapApi.deleteRemoteCalendarEvent('calendar.google', 'e1'),
    },
    {
      name: 'findRemoteExportedEvent',
      call: () => gapApi.findRemoteExportedEvent('calendar.google', 's1', 'cal-1'),
    },
    {
      name: 'startCalendarSync',
      call: () => gapApi.startCalendarSync('calendar.google', 'cal-1', 'export'),
    },
    {
      name: 'fetchCalendarSyncStatus',
      call: () => gapApi.fetchCalendarSyncStatus('calendar.google'),
    },
    { name: 'fetchCalendarSettings', call: () => gapApi.fetchCalendarSettings() },
    { name: 'updateCalendarSettings', call: () => gapApi.updateCalendarSettings({ enabled: false }) },
  ];

  it.each(reads)('$name rejects rather than resolving', async ({ call }) => {
    // The rejection has to survive `await`, which is why every function in the
    // arm is `async` — a synchronous throw from a non-async function escapes
    // the caller's `.catch()` entirely.
    await withReleaseBuild(async () => {
      await expect(call()).rejects.toThrow();
    });
  });

  it('the rejection names the gap rather than being generic', async () => {
    await withReleaseBuild(async () => {
      await expect(gapApi.fetchRemoteCalendars('calendar.google')).rejects.toThrow(
        /FRONTEND-PHASE16-GAP-003/
      );
    });
  });

  it('every simulated route family is covered by the refusal', async () => {
    // A function added to the arm without a corresponding entry above would
    // slip through the `it.each` silently. This asserts the count instead.
    const exported = Object.keys(gapApi).filter(
      (name) => typeof (gapApi as Record<string, unknown>)[name] === 'function'
    );
    expect(reads.map((read) => read.name).sort()).toEqual(exported.sort());
  });
});

describe('§66 · the simulated routes cannot be mistaken for certified ones', () => {
  it('lives under its own prefix', () => {
    expect(INTEGRATION_GAP_PREFIX).toBe('/integrations-gap/v0');
  });

  it('does not claim the `/integrations` namespace a real backend would use', () => {
    expect(INTEGRATION_GAP_PREFIX).not.toBe('/integrations');
    expect(INTEGRATION_GAP_PREFIX.startsWith('/integrations-gap')).toBe(true);
  });

  // The handler is the second half of the runtime guarantee: the client refuses
  // to call, and the mock refuses to answer. Neither alone is load-bearing,
  // which is the point of having both.
  it('the handler registers nothing in a release build', () => {
    withReleaseBuild(() => {
      const registered: string[] = [];
      const spy = {
        onGet: () => spy,
        onPost: () => spy,
        onPut: () => spy,
        onDelete: () => spy,
        reply: () => {
          registered.push('route');
          return spy;
        },
      };

      setupIntegrationGapMocks(spy as never);
      expect(registered).toEqual([]);
    });
  });

  it('registers routes when the build is allowed to simulate', () => {
    // The converse, so the assertion above cannot pass because the spy is wrong.
    const registered: string[] = [];
    const spy = {
      onGet: () => spy,
      onPost: () => spy,
      onPut: () => spy,
      onDelete: () => spy,
      reply: () => {
        registered.push('route');
        return spy;
      },
    };

    setupIntegrationGapMocks(spy as never);
    expect(registered.length).toBeGreaterThan(10);
  });
});

describe('§28 · §38 · the development arm moves no money and mints no session', () => {
  const exported = Object.keys(gapApi);

  it('exports no function that moves money', () => {
    const forbidden = exported.filter((name) =>
      /^(pay|charge|refund|payout|deposit|withdraw|transfer|donate|contribut)/i.test(name)
    );
    expect(forbidden).toEqual([]);
  });

  it('exports no function that creates or stores a payment instrument', () => {
    const forbidden = exported.filter((name) => /^(add|create|save|store).*(card|method|instrument)/i.test(name));
    expect(forbidden).toEqual([]);
  });

  it('exports no function that grants a capability or a role', () => {
    const forbidden = exported.filter((name) =>
      /grant|revokeRole|setCapability|assign|elevate|promote|impersonate/i.test(name)
    );
    expect(forbidden).toEqual([]);
  });

  it('exports no function that produces a session or a token', () => {
    const forbidden = exported.filter((name) => /token|session|signIn|login|authenticate/i.test(name));
    expect(forbidden).toEqual([]);
  });

  describe('the simulated OAuth exchange', () => {
    let mock: MockAdapter;

    beforeEach(() => {
      resetIntegrationGapData();
      mock = new MockAdapter(apiClient);
      setupIntegrationGapMocks(mock);
    });

    afterEach(() => mock.restore());

    it('returns a connection and never a session', async () => {
      const connection = await gapApi.exchangeAuthorizationCode({
        provider: 'calendar.google',
        code: 'c',
        codeVerifier: 'v',
        redirectUri: 'diaspora://integrations/oauth',
        scopes: ['openid'],
        intent: 'link',
      });

      expect(connection.provider).toBe('calendar.google');
      expect(connection).not.toHaveProperty('accessToken');
      expect(connection).not.toHaveProperty('session');
      expect(connection).not.toHaveProperty('refreshToken');
    });

    it('refuses a sign-in intent even when one is forced past the type', async () => {
      // `intent` is `'link' | 'reauthorize'` on the client, so this is a
      // compile error at every real call site. The runtime refusal exists
      // because the type is not the control — a development adapter that could
      // mint a session would be an authentication bypass, and the handler must
      // refuse it whatever the client sends.
      await expect(
        gapApi.exchangeAuthorizationCode({
          provider: 'calendar.google',
          code: 'c',
          codeVerifier: 'v',
          redirectUri: 'diaspora://integrations/oauth',
          scopes: ['openid'],
          intent: 'signIn' as never,
        })
      ).rejects.toThrow();
    });
  });
});

describe('§30 · the certified arm reports failures as failures', () => {
  const exported = Object.keys(certifiedApi);

  it('exports no function whose name suggests a fallback or a mock', () => {
    // The bypass this phase removed was a `catch` block, not an export — but a
    // named fallback is how it would come back.
    const forbidden = exported.filter((name) => /mock|fake|fallback|bypass|stub/i.test(name));
    expect(forbidden).toEqual([]);
  });

  it('the OTP client fabricates no identity', () => {
    // Asserted against the source because its absence is the property, and a
    // behavioural test cannot prove a `catch` block does not exist. Comments are
    // stripped first — the file explains the removal in prose, and that
    // explanation is the thing most worth keeping.
    const source = readSource('src', 'lib', 'integrations-api.ts');

    expect(source).not.toMatch(/mock-jwt-token/);
    expect(source).not.toMatch(/login\(/);
  });

  it('the sign-in screen no longer signs anybody in from a catch block', () => {
    const source = readSource('src', 'app', '(auth)', 'otp.tsx');

    expect(source).not.toMatch(/mock-jwt-token/);
    // The account state must come from the server, never inferred from digits
    // the member typed. This was the pattern that chose their permissions.
    expect(source).not.toMatch(/phone\?\.endsWith/);
    expect(source).not.toMatch(/mockState/);
  });

  it('the sign-in screen no longer fills the code in on the member’s behalf', () => {
    const source = readSource('src', 'app', '(auth)', 'otp.tsx');

    // The simulated clipboard code — a `setTimeout` that filled the boxes with
    // `987654` and auto-submitted. §68 forbids fake provider behaviour in a
    // screen, and this one submitted a code nobody typed.
    expect(source).not.toMatch(/987654/);
    expect(source).not.toMatch(/clipboardCode/);
  });

  it('phone verification no longer approves itself', () => {
    const source = readSource('src', 'app', 'verification', 'phone.tsx');

    // It used to write `Phone → Approved` into the trust store after a
    // `setTimeout`, accepting any six digits.
    expect(source).not.toMatch(/updateVerificationStatus\(\s*'Phone'\s*,\s*'Approved'\s*\)/);
    expect(source).not.toMatch(/setTimeout/);
  });

  it('identity verification no longer approves itself or names a processor', () => {
    const source = readSource('src', 'app', 'verification', 'identity.tsx');

    // It used to write `Identity → Approved` from a `setTimeout` and tell the
    // member a biometric face match had passed.
    expect(source).not.toMatch(/updateVerificationStatus\(\s*'Identity'\s*,\s*'Approved'\s*\)/);
    // §25/§69: which verification processor a deployment uses is a backend
    // decision the client cannot confirm, so the client does not promise one.
    expect(source).not.toMatch(/Stripe/i);
  });
});

describe('§38 · §39 · no provider secret is readable by the configuration module', () => {
  // Comments stripped: the file's header discusses the credentials it must not
  // read — naming them is how the rule stays legible — and a raw `toContain`
  // would fail on the explanation rather than on a read.
  const source = readSource('src', 'config', 'integration-config.ts');

  // Asserted against the source rather than against the resolved config,
  // because the prohibition is about what the code *can* read. A variable that
  // happens to be unset today would pass a runtime check and still be a hole.
  const forbidden = [
    'CLIENT_SECRET',
    'SERVICE_ACCOUNT',
    'PRIVATE_KEY',
    'FCM_SERVER_KEY',
    'APNS_KEY',
    'STRIPE_SECRET',
    'PAYSTACK_SECRET',
    'FLUTTERWAVE_SECRET',
    'TWILIO_AUTH',
    'TELNYX_API_KEY',
    'GOVERNMENT_API_KEY',
    'SECRET_KEY',
  ];

  it.each(forbidden)('never reads %s', (name) => {
    expect(source).not.toContain(name);
  });

  it('reads no payment credential of any kind, publishable included', () => {
    // Even a publishable key is absent: B15 names the live gateways at runtime,
    // so the client never needs to be told which one it is talking to, and a
    // variable that exists is a variable somebody puts the wrong value in.
    expect(source).not.toMatch(/PUBLISHABLE/i);
    expect(source).not.toMatch(/EXPO_PUBLIC_[A-Z_]*PAYMENT[A-Z_]*KEY/);
  });

  it('every environment variable it does read is EXPO_PUBLIC and therefore not a secret', () => {
    const reads = source.match(/process\.env\.([A-Z0-9_]+)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read).toMatch(/process\.env\.EXPO_PUBLIC_/);
    }
  });
});

describe('§38 · the domain model has nowhere to put a token', () => {
  const source = readSource('src', 'types', 'integrations.ts');

  it('declares no accessToken, refreshToken, clientSecret or idToken field', () => {
    // The strongest available enforcement: a type with no field for a
    // credential cannot carry one into state, storage or a crash report.
    expect(source).not.toMatch(/^\s*accessToken/m);
    expect(source).not.toMatch(/^\s*refreshToken/m);
    expect(source).not.toMatch(/^\s*clientSecret/m);
    expect(source).not.toMatch(/^\s*idToken/m);
    expect(source).not.toMatch(/^\s*authorizationCode/m);
  });

  it('the push registration holds a fingerprint rather than a token', () => {
    expect(source).toMatch(/tokenFingerprint/);
    // `PushRegistration` must not have a raw `token` field.
    expect(source).not.toMatch(/^\s*token:\s*string/m);
  });
});

describe('§55 · no integration event can carry an identifier or a measurement', () => {
  beforeEach(() => resetCreatorEvents());

  it('drops an account label', () => {
    const { safe, dropped } = sanitise({
      provider: 'calendar.google',
      accountLabel: 'amara@example.com',
    });

    expect(safe).toEqual({ provider: 'calendar.google' });
    expect(dropped).toContain('accountLabel');
  });

  it('drops a push token under every plausible name', () => {
    const { safe } = sanitise({
      provider: 'push.expo',
      token: 'ExponentPushToken[abc]',
      pushToken: 'ExponentPushToken[abc]',
      deviceToken: 'abc',
    });

    expect(safe).toEqual({ provider: 'push.expo' });
  });

  it('drops a calendar title', () => {
    const { safe } = sanitise({ provider: 'calendar.device', title: 'Oncology follow-up' });
    expect(safe).toEqual({ provider: 'calendar.device' });
  });

  it('drops a payment amount', () => {
    const { safe, dropped } = sanitise({ outcome: 'completed', amount: 4200 });
    expect(safe).toEqual({ outcome: 'completed' });
    expect(dropped).toContain('amount');
  });

  it('keeps the currency code, and that is deliberate', () => {
    // `currency` was allow-listed by an earlier phase and is left allow-listed
    // here rather than removed. It is a three-letter code from a closed set —
    // GBP, NGN, MUR — which identifies nobody and answers a real product
    // question ("which currencies do payments actually fail in?"). The *amount*
    // is what turns a payment event stream into a spending history, and that is
    // dropped above.
    //
    // Written as an assertion rather than left implicit so the decision is
    // visible: if somebody later concludes a currency is too much, this is the
    // test that will tell them it was a choice.
    const { safe } = sanitise({ outcome: 'completed', currency: 'GBP' });
    expect(safe.currency).toBe('GBP');
  });

  it('drops coordinates', () => {
    const { safe } = sanitise({ provider: 'maps.platform', latitude: 51.5, longitude: -0.12 });
    expect(safe).toEqual({ provider: 'maps.platform' });
  });

  it('the typed calendar emitter sends only shape, never content', () => {
    trackCalendarExport({
      provider: 'calendar.device',
      mode: 'REAL_PROVIDER',
      succeeded: true,
      isRecurring: false,
      isAllDay: false,
      usesEventTimeZone: true,
      durationMs: 42,
    });

    const [record] = drainCreatorEvents();

    expect(record.event).toBe('calendar.event.exported');
    expect(Object.keys(record.properties)).not.toContain('title');
    expect(Object.keys(record.properties)).not.toContain('sourceId');
    expect(Object.keys(record.properties)).not.toContain('calendarId');
  });

  it('uses one naming convention — the platform’s since Phase 7', () => {
    resetCreatorEvents();
    trackIntegrationEvent('integration.hub.viewed');
    trackIntegrationEvent('calendar.sync.started');
    trackIntegrationEvent('push.token.registered');

    for (const record of drainCreatorEvents()) {
      expect(record.event).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+$/);
      expect(record.event).toBe(record.event.toLowerCase());
    }
  });
});

describe('§69 · a simulated connection can never claim to be real', () => {
  beforeEach(() => resetIntegrationGapData());

  it('every connection the development arm produces is DEVELOPMENT_PROVIDER', () => {
    const connection = upsertConnection('calendar.google', ['calendar.events']);
    expect(connection.mode).toBe('DEVELOPMENT_PROVIDER');
    expect(isSimulatedMode(connection.mode)).toBe(true);
    expect(impliesProductionConnectivity(connection.mode)).toBe(false);
  });

  it('the mode predicates disagree, so a screen cannot use one for the other', () => {
    expect(impliesProductionConnectivity('REAL_PROVIDER')).toBe(true);
    expect(impliesProductionConnectivity('BACKEND_CONNECTED')).toBe(true);
    expect(impliesProductionConnectivity('DEVELOPMENT_PROVIDER')).toBe(false);
    expect(impliesProductionConnectivity('BACKEND_GAP')).toBe(false);
    expect(impliesProductionConnectivity('NOT_CONFIGURED')).toBe(false);
  });
});

describe('§53 · the gap registers are internally consistent', () => {
  const gaps = Object.values(INTEGRATION_GAPS);

  it('every gap key matches its record key', () => {
    for (const [key, gap] of Object.entries(INTEGRATION_GAPS)) {
      expect(gap.key).toBe(key);
    }
  });

  it('every gap id is unique and correctly formatted', () => {
    const ids = gaps.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^FRONTEND-PHASE16-GAP-\d{3}$/);
    }
  });

  it('every gap names at least one missing capability and one contract', () => {
    for (const gap of gaps) {
      expect(gap.missingBackendCapability.length).toBeGreaterThan(0);
      expect(gap.requiredContracts.length).toBeGreaterThan(0);
    }
  });

  it('every gap states its token lifecycle, security and privacy requirements', () => {
    for (const gap of gaps) {
      expect(gap.tokenLifecycle.length).toBeGreaterThan(10);
      expect(gap.securityRequirements.length).toBeGreaterThan(20);
      expect(gap.privacyRequirements.length).toBeGreaterThan(20);
    }
  });

  it('every contract states whether it needs idempotency', () => {
    // §53 asks for it explicitly, and it is the field that decides whether a
    // retry is safe. `null` is a legitimate answer for a naturally-safe verb;
    // omitting the field is not.
    for (const gap of gaps) {
      for (const contract of gap.requiredContracts) {
        expect(contract).toHaveProperty('idempotency');
      }
    }
  });

  it('no gap claims to be implemented-but-incomplete', () => {
    for (const gap of gaps) {
      expect([
        'IMPLEMENTED + BACKEND CONNECTED',
        'IMPLEMENTED + BACKEND PARTIAL',
        'IMPLEMENTED + DEVELOPMENT ADAPTER',
      ]).toContain(gap.frontendStatus);
    }
  });

  it('every blockedBy reference names a gap in this register', () => {
    for (const gap of gaps) {
      if (!gap.blockedBy) continue;
      expect(gaps.some((candidate) => candidate.id === gap.blockedBy)).toBe(true);
    }
  });

  it('provider gaps are registered separately and use their own prefix', () => {
    // Two registers, because a backend contract and a native module are
    // different work for different people. Collapsing them would put "install
    // expo-notifications" on a backend roadmap.
    for (const [key, gap] of Object.entries(INTEGRATION_PROVIDER_GAPS)) {
      expect(gap.key).toBe(key);
      expect(gap.id).toMatch(/^INTEGRATION-PROVIDER-GAP-\d{3}$/);
      expect(gap.requiredDependencies.length).toBeGreaterThan(0);
    }
  });

  it('no provider gap id collides with a backend gap id', () => {
    const backendIds = new Set(gaps.map((gap) => gap.id));
    for (const gap of Object.values(INTEGRATION_PROVIDER_GAPS)) {
      expect(backendIds.has(gap.id)).toBe(false);
    }
  });
});
