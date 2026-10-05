// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Integrations, development handlers for the REAL contract
// (Remediation Wave C-05)
//
// `Diaspora.Modules.Integrations` serves fifteen routes under
// `/api/v1/integrations`. This file answers those routes in development, and
// **every shape here was read from `IntegrationsEndpointContributor.cs`,
// `IntegrationRequests.cs`, `IntegrationResponses.cs` and the six handler files
// under `Application/`** — not from what `hooks/integrations.ts` expects.
//
// That distinction is the finding this remediation keeps re-hitting:
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// `handlers/integrations-gaps.ts` is the local example. It is a good handler and
// it could not have found any of the six divergences below, because it was
// written from `config/integration-gaps.ts` and the register is what was wrong.
// It stays registered, still under `/integrations-gap/v0`, and now answers only
// the routes that remain genuinely absent — email verification, government
// notices and saved payment methods.
//
// ── The six properties this file ENFORCES rather than describes ──────────────
//
// Each is a real refusal on the real server. Each would otherwise be invisible
// until a deployment, because the gap handler is permissive in exactly the
// places the server is not.
//
//   1. **`Idempotency-Key` is a mandatory HEADER on a calendar write.** Read by
//      `IdempotencyHeader.From(context)`; a blank one is a 400 before a provider
//      is touched. Note this is the *opposite* discipline to Automation, which
//      requires the key in the **body** and reads no headers at all — so
//      neither module generalises to the other, and a handler that accepted
//      both would hide the difference.
//
//   2. **An exchange without a server-issued `state` is refused.** The register
//      never had the field. `ExchangeAuthorizationCommandHandler` looks the
//      attempt up by state hash and a state it never issued matches no row. The
//      only way to hold one is to have called `/oauth/{provider}/authorize`
//      first — so this file mints state there and refuses it here, which makes
//      the missing route findable by running the app.
//
//   3. **`intent: "signIn"` is refused at BOTH ends.** The gap handler refused
//      it only at exchange, with a 501. The server refuses it at authorization
//      too, with a 400 `integrations.oauth.intent-unsupported`, and the reason
//      is stronger than "not built yet": minting a platform session from an
//      external assertion is Identity's decision and would otherwise attach an
//      account to whichever session happened to be open.
//
//   4. **A calendar delete answers `{ data: null }`.** `DeleteCalendarEventCommand`
//      is a value-less `ICommand`, so the non-generic `PlatformResults.Ok`
//      overload writes a null payload. The register declared
//      `{ data: { deleted: boolean } }`, and a client reading `.deleted` gets
//      `undefined` — a successful delete rendering as a failure.
//
//   5. **A read-only calendar is a 403, and the check is made against the
//      PROVIDER.** §46: "a calendar id is a name, not a capability". The server
//      re-lists the calendars before every write; a calendar id that is not on
//      the connection is a 404, not a silent success.
//
//   6. **`identity.phone` cannot be unlinked, and the refusal is explicit.**
//      It parses as a perfectly good provider key and names no connection, so
//      the tempting implementation answers 200 with an unchanged list. The
//      server answers 409 `integrations.identity.last-method` instead, because
//      "a silent no-op is not a refusal".
//
// ── What this file deliberately does NOT do ──────────────────────────────────
//
// **Nothing connects.** `NotConfiguredOAuthProvider` and
// `NotConfiguredCalendarProvider` are what a default deployment actually runs
// (`IntegrationsModule.cs:105-121`), and both answer `NotConfigured` for
// everything. So `GET /capabilities` here reports an unconfigured deployment,
// and `startAuthorization` answers the same 400 a real one would.
//
// That is the single most important choice in the file, and the backend's own
// comment says why better than this one could: the inputs to fabricate a
// connection are all right here — a provider key, a scope list, a signed-in
// member — and returning one would show `CONNECTED` for an account nobody
// authorized, indistinguishable at the wire from a real grant.
//
// A deployment that HAS contracted an adapter is simulated by the
// `__setIntegrationDeploymentConfigured` switch below, which exists so the
// connected paths can be exercised by a test that opts into them explicitly.
// It is off by default, and off is the honest default.
//
// **No money, no session, no push route.** Payments stay on B15's real
// `/financial/*`; there is no route here that mints a token; B13's
// `/notifications/*` are real and are used unchanged.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import {
  listConnections,
  readCalendarSettings,
  removeConnection,
  upsertConnection,
  writeCalendarSettings,
  REMOTE_CALENDARS,
  createRemoteEvent,
  findRemoteEvent,
} from '../integrations-gap-data';
import { INTEGRATION_PROVIDERS } from '@/types/integrations';
import type { CalendarSyncSettings, IntegrationProviderId } from '@/types/integrations';

const ROOT = '/integrations';

type Reply = [number, unknown];

/** The platform envelope, `meta` included — `ApiResponse<T>` always carries one. */
function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

function problem(status: number, code: string, detail: string): Reply {
  return [status, { type: `https://diaspora.app/problems/${code}`, title: code, status, detail }];
}

function params(config: { params?: Record<string, unknown> }): Record<string, string> {
  const source = config.params ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) result[key] = String(value);
  }
  return result;
}

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') return (config.data as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(config.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The `Idempotency-Key` header, however axios cased it. Property 1. */
function idempotencyKey(config: { headers?: unknown }): string | null {
  const headers = config.headers;
  if (typeof headers !== 'object' || headers === null) return null;

  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (name.toLowerCase() === 'idempotency-key' && typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

/** The `{provider}` segment following a fixed literal in the path. */
function segmentAfter(url: string | undefined, literal: string): string | null {
  if (!url) return null;
  const match = new RegExp(`${literal}/([^/?]+)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The deployment's own state
//
// Not a feature flag and not the gap switch. It answers one question — "has an
// operator contracted a vendor adapter for this deployment?" — which on a real
// deployment is decided by whether anything replaced the `TryAdd`-ed
// not-configured seams, and which nothing in the client can observe except
// through `GET /capabilities`.
//
// Default `false`, matching the platform's own default. A test that wants the
// connected paths turns it on and turns it off again, which is also the only
// way to reach `upsertConnection` in this file — there is no code path where a
// caller reaches a fabricated grant without having asked for one.
// ─────────────────────────────────────────────────────────────────────────────

let deploymentConfigured = false;

/**
 * Test-only. See the block comment above.
 *
 * Clears the issued states as well, because a state minted while the deployment
 * was configured and redeemed after it was not would be a case the real
 * platform cannot produce — the adapter check runs before the state lookup.
 */
export function __setIntegrationDeploymentConfigured(configured: boolean): void {
  deploymentConfigured = configured;
  issuedStates.clear();
}

/**
 * `ProviderKey.TryParse`, reproduced.
 *
 * Structural only: exactly one dot, lower-case alphanumerics and hyphens,
 * 64 characters at most. It deliberately does **not** check the key against the
 * client's sixteen known providers, because the server does not either — a
 * well-formed key with no registered adapter is `not-configured` on the real
 * platform, which is a different answer from `unknown` and sends a reader to a
 * different fix.
 *
 * `known` is the narrowing the *store* needs, separately, because the fixture
 * types its rows with the client's union.
 */
function parseProviderKey(
  value: string | null
): { domain: string; key: string; known: IntegrationProviderId | null } | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length > 64) return null;

  const separator = trimmed.indexOf('.');
  if (separator <= 0 || separator === trimmed.length - 1) return null;

  const domain = trimmed.slice(0, separator);
  const provider = trimmed.slice(separator + 1);
  const segment = /^[a-z0-9-]+$/;

  if (!segment.test(domain) || !segment.test(provider)) return null;

  const key = `${domain}.${provider}`;
  const known = INTEGRATION_PROVIDERS.find((candidate) => candidate === key) ?? null;

  return { domain, key, known };
}

function providerUnknown(value: string | null): Reply {
  return problem(
    400,
    'integrations.provider.unknown',
    `'${value ?? ''}' is not a provider this platform knows about.`
  );
}

function notConfigured(capability: string): Reply {
  return problem(
    400,
    'integrations.provider.not-configured',
    `This deployment has no provider configured for ${capability}.`
  );
}

/**
 * The states this module has issued.
 *
 * Property 2 needs somewhere to hold them, and holding them in a module-level
 * map is what makes the authorize→exchange pairing a real precondition here
 * rather than a described one. Cleared by the setter above so tests do not leak
 * a state between cases.
 */
const issuedStates = new Map<string, { provider: string; redirectUri: string }>();

export function setupIntegrationMocks(mock: MockAdapter): void {
  // ── Capabilities ──────────────────────────────────────────────────────────
  //
  // First, because `/connections/{provider}` and the calendar patterns below
  // are broad enough to shadow a literal path registered after them.

  mock.onGet(new RegExp(`${ROOT}/capabilities$`)).reply(() => {
    // The unconfigured deployment, with every reason the real handler writes.
    // A client reading this can tell "no adapter" from "no redirect" from "no
    // key", which are three different fixes — collapsing them into one
    // "unavailable" is what the capability route exists to prevent.
    if (!deploymentConfigured) {
      return ok({
        oAuthProviders: [],
        calendarProviders: [],
        calendarCapabilities: {},
        webhookProviders: [],
        credentialCustodyConfigured: false,
        redirectUrisConfigured: false,
        twoWayCalendarSync: false,
        unavailableReasons: {
          oauth:
            'This deployment has no OAuth adapter registered. Connecting an external account needs one.',
          calendar:
            'This deployment has no calendar adapter registered. Calendars cannot be listed or written to.',
          'oauth.redirect':
            'No redirect address is allow-listed, so no authorization can be started.',
          credentialCustody:
            'No credential protection key is available, so a provider token cannot be stored safely.',
          outbound: 'No outbound host is allow-listed, so no provider call will leave this deployment.',
          'calendar.sync.twoWay':
            'Two-way calendar synchronisation needs an adapter that can both import entries and '
            + 'register a push channel. No adapter on this deployment declares both.',
        },
      });
    }

    // A configured deployment, still without two-way sync. `twoWayCalendarSync`
    // is `ImportEvents && WatchChannel` on the server and no adapter declares
    // the pair, so this stays false even here — the register's own rule is that
    // until the watch channel exists nothing may render "synced", and a
    // development switch that quietly granted it would be the one place that
    // rule could be broken without anybody noticing.
    return ok({
      oAuthProviders: ['calendar.google'],
      calendarProviders: ['calendar.google'],
      // PascalCase enum member names, exactly as `ToString()` produces them.
      // Deliberately NOT the client's dotted `calendar.event.create` vocabulary
      // — the two alphabets coexist in one module and this is the one that
      // appears on this route.
      calendarCapabilities: { 'calendar.google': ['CreateEvent', 'DeleteEvent', 'List', 'ReadEvent', 'UpdateEvent'] },
      webhookProviders: ['calendar.google'],
      credentialCustodyConfigured: true,
      redirectUrisConfigured: true,
      twoWayCalendarSync: false,
      unavailableReasons: {
        'calendar.sync.twoWay':
          'Two-way calendar synchronisation needs an adapter that can both import entries and '
          + 'register a push channel. No adapter on this deployment declares both.',
      },
    });
  });

  // ── OAuth ─────────────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/oauth/[^/]+/authorize$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'oauth');
    const key = parseProviderKey(raw);
    if (key === null) return providerUnknown(raw);

    const payload = body(config);
    const intent = String(payload.intent ?? '').trim().toLowerCase();

    // Property 3, first end. Refused before anything else, and with the same
    // 400 code the server uses rather than the gap handler's 501 — the
    // difference matters because a 501 reads as "not built yet" and this is a
    // deliberate, permanent refusal.
    if (intent === 'signin') {
      return problem(
        400,
        'integrations.oauth.intent-unsupported',
        "This deployment does not support 'signIn' authorization."
      );
    }

    if (intent !== 'link' && intent !== 'reauthorize') {
      return problem(
        400,
        'integrations.oauth.intent-unsupported',
        `This deployment does not support '${payload.intent ?? '(none)'}' authorization.`
      );
    }

    // The order the server checks in: custody, then adapter, then redirect,
    // then PKCE. Reproduced because a client rendering the reason needs the
    // same one the deployment would give.
    if (!deploymentConfigured) {
      return notConfigured('credential custody');
    }

    if (typeof payload.codeChallenge !== 'string' || payload.codeChallenge.trim() === '') {
      return problem(
        400,
        'integrations.oauth.state-unknown',
        'A PKCE code challenge is required. This client is public and cannot authenticate itself '
          + 'without one.'
      );
    }

    const provider = key.key;
    const redirectUri =
      typeof payload.redirectUri === 'string' && payload.redirectUri.trim()
        ? payload.redirectUri.trim()
        : 'diaspora://integrations/callback';

    const state = `dev-state-${provider}-${issuedStates.size + 1}`;
    issuedStates.set(state, { provider, redirectUri });

    return ok({
      authorizationUrl: `https://dev.provider.invalid/authorize?state=${encodeURIComponent(state)}`,
      state,
      redirectUri,
      // Narrowed by the adapter, never echoed. `NotConfiguredOAuthProvider`
      // returns an empty list precisely so a client cannot be shown scopes
      // nobody granted; a configured one narrows rather than widens.
      scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]).slice(0, 2) : [],
      expiresAt: '2026-08-18T10:10:00.000Z',
    });
  });

  mock.onPost(new RegExp(`${ROOT}/oauth/[^/]+/exchange$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'oauth');
    const key = parseProviderKey(raw);
    if (key === null) return providerUnknown(raw);

    const payload = body(config);
    const provider = key.key;

    // Property 3, second end.
    if (String(payload.intent ?? '').trim().toLowerCase() === 'signin') {
      return problem(
        400,
        'integrations.oauth.intent-unsupported',
        "This deployment does not support 'signIn' authorization."
      );
    }

    if (!deploymentConfigured) return notConfigured(provider);

    // Property 2. A state this module never issued matches no row, and the
    // sentence is deliberately the same one an *expired* state produces — the
    // codes differ so telemetry can separate them, and the copy does not, so a
    // caller without a valid state cannot learn which of the two they hit.
    const state = typeof payload.state === 'string' ? payload.state : '';
    const issued = issuedStates.get(state);

    if (!issued || issued.provider !== provider) {
      return problem(
        400,
        'integrations.oauth.state-unknown',
        'That authorization could not be completed. Start again from the connection screen.'
      );
    }

    if (typeof payload.code !== 'string' || typeof payload.codeVerifier !== 'string') {
      return problem(
        400,
        'integrations.oauth.state-unknown',
        'That authorization could not be completed. Start again from the connection screen.'
      );
    }

    // Compared, never used. A mismatch is a visible refusal rather than a
    // silent substitution of the recorded URI.
    if (
      typeof payload.redirectUri === 'string' &&
      payload.redirectUri.trim() !== '' &&
      payload.redirectUri.trim() !== issued.redirectUri
    ) {
      return problem(
        400,
        'integrations.oauth.redirect-not-allowed',
        'That return address is not one this deployment accepts.'
      );
    }

    // Consumed before the connection is written, so a replay is a 409 rather
    // than a second connection. The register requires the status: it is what
    // tells a client the first attempt worked.
    issuedStates.delete(state);

    // A well-formed key with no adapter registered for it. On the real platform
    // this is `FindOAuth(...) is not { }` and the answer is `not-configured` —
    // the same answer an unconfigured deployment gives, and a different one
    // from `unknown`, which means the key itself did not parse.
    if (key.known === null) return notConfigured(provider);

    const scopes = Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [];
    return ok(upsertConnection(key.known, scopes));
  });

  mock.onPost(new RegExp(`${ROOT}/oauth/[^/]+/revoke$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'oauth');
    const key = parseProviderKey(raw);
    if (key === null) return providerUnknown(raw);

    const provider = key.key;
    if (key.known !== null) removeConnection(key.known);

    // `IntegrationDisconnectResponse`, not `{ revokedAtProvider }`. And
    // `revokedAtProvider` is **false** on an unconfigured deployment: the local
    // grant is gone either way, and the member is entitled to know the provider
    // side was not reached rather than being told it was.
    return ok({
      provider,
      status: 'DISCONNECTED',
      revokedAtProvider: deploymentConfigured,
    });
  });

  // ── Calendar ──────────────────────────────────────────────────────────────
  //
  // `/calendar/settings` first: `/calendar/{provider}/…` would otherwise
  // capture it with `settings` read as a provider key.

  mock.onGet(new RegExp(`${ROOT}/calendar/settings$`)).reply(() => ok(readCalendarSettings()));

  mock.onPut(new RegExp(`${ROOT}/calendar/settings$`)).reply((config) => {
    const patch = body(config);

    // A missing field means "leave it alone", never "clear it". Reproduced by
    // dropping undefined and null entries before the merge: the server binds
    // both to the same C# null and its `Update` only assigns non-null values,
    // so a client sending only `enabled` must not wipe the default calendar.
    // Read field by field rather than spread, so the stored settings can only
    // ever hold the nine properties `UpdateCalendarSettingsRequest` binds. A
    // spread would let a client write an arbitrary key into the fixture and
    // then read it back, which is the shape of every "it works in development"
    // bug this remediation has been unpicking.
    const applied: Partial<CalendarSyncSettings> = {};
    const take = <K extends keyof CalendarSyncSettings>(
      name: K,
      accept: (value: unknown) => value is CalendarSyncSettings[K]
    ): void => {
      const value = patch[name];
      if (value !== undefined && value !== null && accept(value)) applied[name] = value;
    };

    const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
    const isString = (value: unknown): value is string => typeof value === 'string';

    take('enabled', isBoolean);
    take('autoExportRsvps', isBoolean);
    take('twoWaySyncEnabled', isBoolean);
    take(
      'defaultCalendarId',
      (value): value is CalendarSyncSettings['defaultCalendarId'] => isString(value)
    );
    take(
      'defaultProvider',
      (value): value is CalendarSyncSettings['defaultProvider'] =>
        isString(value) && INTEGRATION_PROVIDERS.some((candidate) => candidate === value)
    );
    take(
      'syncFrequency',
      (value): value is CalendarSyncSettings['syncFrequency'] =>
        value === 'manual' || value === 'hourly' || value === 'daily'
    );
    take(
      'timeZoneBehaviour',
      (value): value is CalendarSyncSettings['timeZoneBehaviour'] =>
        value === 'eventTimeZone' || value === 'deviceTimeZone'
    );
    take(
      'conflictBehaviour',
      (value): value is CalendarSyncSettings['conflictBehaviour'] =>
        value === 'skip' || value === 'update' || value === 'duplicate'
    );
    take(
      'defaultReminderMinutes',
      (value): value is number[] =>
        Array.isArray(value) && value.every((entry) => typeof entry === 'number')
    );

    return ok(writeCalendarSettings(applied));
  });

  mock.onGet(new RegExp(`${ROOT}/calendar/[^/]+/calendars$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'calendar');
    const key = parseProviderKey(raw);
    if (key === null || key.domain !== 'calendar') return providerUnknown(raw);
    if (!deploymentConfigured) return notConfigured(key.key);

    return ok(REMOTE_CALENDARS);
  });

  // Ahead of `/events/{externalEventId}`, exactly as the server maps it, so
  // "lookup" is never resolved as an identifier.
  mock.onGet(new RegExp(`${ROOT}/calendar/[^/]+/events/lookup$`)).reply((config) => {
    const query = params(config);
    if (!query.sourceId || !query.calendarId) {
      return problem(
        400,
        'integrations.calendar.event.not-found',
        'A source identifier and a calendar are both required.'
      );
    }

    // Answered from the mapping rather than from the provider, so it does not
    // need a configured adapter and does not 400 on an unconfigured
    // deployment: the question is "has this platform recorded an export", and
    // the honest answer to that is `null`.
    return ok(findRemoteEvent(query.calendarId, query.sourceId));
  });

  mock.onGet(new RegExp(`${ROOT}/calendar/[^/]+/sync/status$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'calendar');
    const key = parseProviderKey(raw);
    if (key === null) return providerUnknown(raw);

    // `never`, not a zeroed `synced`. The mapper is explicit that the two
    // "render identically and mean opposite things", and `never` is the true
    // answer for a member who has never synced — which, on a deployment with no
    // adapter, is every member.
    return ok({
      phase: 'never',
      lastSyncedAt: null,
      itemsSynced: 0,
      itemsFailed: 0,
      failureReasons: [],
      needsAttention: false,
    });
  });

  mock.onPost(new RegExp(`${ROOT}/calendar/[^/]+/sync$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'calendar');
    const key = parseProviderKey(raw);
    if (key === null || key.domain !== 'calendar') return providerUnknown(raw);

    const direction = String(body(config).direction ?? '').trim().toLowerCase();

    if (direction !== 'export' && direction !== 'import' && direction !== 'both') {
      return problem(
        400,
        'integrations.calendar.sync.direction-unsupported',
        `The configured provider cannot synchronise in the '${direction || '(none)'}' direction.`
      );
    }

    // Import is refused on every deployment, because no adapter declares
    // `ImportEvents`. Refused rather than silently downgraded to an export: "a
    // member who asked for 'both' and received an export would believe their
    // calendar had been read into Diaspora, which is a consent claim rather
    // than a feature claim."
    if (direction !== 'export') {
      return problem(
        400,
        'integrations.calendar.sync.direction-unsupported',
        `The configured provider cannot synchronise in the '${direction}' direction.`
      );
    }

    if (!deploymentConfigured) return notConfigured(key.key);

    return ok({
      phase: 'syncing',
      lastSyncedAt: null,
      startedAt: '2026-08-18T09:00:00.000Z',
      itemsSynced: 0,
      itemsFailed: 0,
      failureReasons: [],
      needsAttention: false,
      syncId: '11111111-1111-1111-1111-111111111111',
    });
  });

  mock.onPost(new RegExp(`${ROOT}/calendar/[^/]+/events$`)).reply((config) =>
    writeCalendarEvent(config, null)
  );

  mock.onPut(new RegExp(`${ROOT}/calendar/[^/]+/events/[^/?]+$`)).reply((config) =>
    writeCalendarEvent(config, segmentAfter(config.url, 'events'))
  );

  mock.onDelete(new RegExp(`${ROOT}/calendar/[^/]+/events/[^/?]+$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'calendar');
    const key = parseProviderKey(raw);
    if (key === null || key.domain !== 'calendar') return providerUnknown(raw);

    // Property 4. `data: null`, because the command carries no value. A client
    // reading `.deleted` here gets `undefined`, and it is supposed to.
    //
    // Idempotent in two directions: an already-removed link is a 200, and an
    // external id this platform never recorded writing is *also* a 200 that
    // does nothing — which is a control, not laxity. A client that could pass
    // any external id would be one that could delete arbitrary entries from a
    // member's calendar with a grant given for export.
    return ok(null);
  });

  // ── Connections ───────────────────────────────────────────────────────────
  //
  // Last of the `/connections` pair is fine, but both go after the calendar and
  // oauth patterns: `axios-mock-adapter` matches in registration order and
  // `/connections/[^/?]+` is narrow enough not to shadow anything above.

  mock.onGet(new RegExp(`${ROOT}/connections$`)).reply((config) => {
    const domain = params(config).domain;
    const rows = listConnections();

    // Narrowed on the domain half of the dotted key, lower-cased, exactly as
    // `NormalizeDomain` does. A blank value is "no filter", not "no rows".
    return ok(
      domain === undefined || domain.trim() === ''
        ? rows
        : rows.filter((row) => row.domain === domain.trim().toLowerCase())
    );
  });

  mock.onDelete(new RegExp(`${ROOT}/connections/[^/?]+$`)).reply((config) => {
    const raw = segmentAfter(config.url, 'connections');
    const key = parseProviderKey(raw);
    if (key === null) return providerUnknown(raw);

    const provider = key.key;
    const query = params(config);

    // Defaults to true server-side, and the default is the interesting half:
    // "a member disconnecting means it, and the alternative default leaves the
    // platform holding a working refresh token unless a client remembered to
    // ask."
    const requested = query.revokeAtProvider === undefined ? true : query.revokeAtProvider !== 'false';

    if (key.known !== null) removeConnection(key.known);

    // Idempotent: a second call answers 200 with the same body, never 404. §41
    // requires the UI never be left saying "Connected" after a disconnect, and
    // a 404 on the retry is exactly how a flaky connection leaves it there.
    return ok({
      provider,
      status: 'DISCONNECTED',
      // `false` when the deployment could not reach a provider, whatever the
      // caller asked for. The flag reports what happened, not what was wanted.
      revokedAtProvider: requested && deploymentConfigured,
    });
  });
}

/**
 * The create and the replace, which are one command on the server.
 *
 * Written once here for the same reason it is written once there: the two
 * routes run the identical `Validate`, and the gap handler's asymmetry — a 422
 * timezone refusal on create and none on update — is exactly the kind of drift
 * a second copy produces.
 */
function writeCalendarEvent(
  config: { url?: string; data?: unknown; headers?: unknown },
  externalEventId: string | null
): Reply {
  const raw = segmentAfter(config.url, 'calendar');
  const key = parseProviderKey(raw);
  if (key === null || key.domain !== 'calendar') return providerUnknown(raw);

  const payload = body(config);

  if (typeof payload.calendarId !== 'string' || payload.calendarId.trim() === '') {
    return problem(400, 'integrations.calendar.not-found', 'A calendar must be named.');
  }

  if (typeof payload.sourceId !== 'string' || payload.sourceId.trim() === '') {
    return problem(
      400,
      'integrations.calendar.event.not-found',
      'A source identifier is required. Without one an entry cannot be deduplicated, and a retry '
        + 'would write a second copy.'
    );
  }

  if (typeof payload.title !== 'string' || payload.title.trim() === '') {
    return problem(400, 'integrations.calendar.event.not-found', 'A title is required.');
  }

  if (typeof payload.startsAt !== 'string' || typeof payload.endsAt !== 'string') {
    return problem(400, 'integrations.calendar.event.not-found', 'A start and an end are required.');
  }

  if (Date.parse(payload.endsAt) < Date.parse(payload.startsAt)) {
    return problem(
      400,
      'integrations.calendar.event.not-found',
      'An entry cannot end before it starts.'
    );
  }

  // Required and never defaulted, on BOTH verbs. A server that substituted its
  // own zone would write a different — and wrong — claim about a real-world
  // event, silently.
  if (typeof payload.timeZone !== 'string' || payload.timeZone.trim() === '') {
    return problem(
      400,
      'integrations.calendar.timezone-required',
      'A calendar entry needs an IANA time zone. Without one the entry would claim the wrong '
        + 'moment for anybody in a different zone.'
    );
  }

  // Refused rather than substituted. `Intl` is the closest thing available here
  // to `TimeZoneInfo.TryFindSystemTimeZoneById`, and an unknown zone throwing
  // is the behaviour being reproduced.
  try {
    new Intl.DateTimeFormat('en', { timeZone: payload.timeZone });
  } catch {
    return problem(
      400,
      'integrations.calendar.timezone-unknown',
      `'${payload.timeZone}' is not a time zone this platform recognises.`
    );
  }

  // Property 1. The header, and it is checked before the provider is reached —
  // the server validates it in the same `Validate` block as the timezone.
  if (idempotencyKey(config) === null) {
    return problem(
      400,
      'integrations.calendar.event.not-found',
      'An Idempotency-Key header is required for a calendar write. Without one a retry after a '
        + 'timeout writes a second entry into your calendar.'
    );
  }

  const provider = key.key;
  if (!deploymentConfigured || key.known === null) return notConfigured(provider);

  // Property 5. §46: a calendar id is a name, not a capability. The target is
  // resolved from the provider's own list, so an id that is not on this
  // connection is a 404 and a read-only one is a 403 — never a silent no-op.
  const calendar = REMOTE_CALENDARS.find((entry) => entry.id === payload.calendarId);

  if (!calendar) {
    return problem(
      404,
      'integrations.calendar.not-found',
      'That calendar is not one your connected account can reach.'
    );
  }

  if (!calendar.allowsModifications) {
    return problem(403, 'integrations.calendar.read-only', 'That calendar does not allow changes.');
  }

  const written = createRemoteEvent(key.known, payload.calendarId, payload.sourceId);

  // `wasDeduplicated` is additive over the client's `CalendarEventRef` and is
  // what lets a caller say "already in your calendar" instead of claiming a
  // second success. False here, because this store writes every time.
  return ok({
    ...written,
    externalEventId: externalEventId ?? written.externalEventId,
    wasDeduplicated: false,
  });
}
