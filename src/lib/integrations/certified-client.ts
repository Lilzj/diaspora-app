// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integrations, certified arm (Remediation Wave C-05)
//
// `config/integration-gaps.ts` opens by saying, correctly for its time:
//
//   > **Calendar, government, and third-party identity — nothing at all.** No
//   > OAuth of any kind exists anywhere in the application; the audit found zero
//   > occurrences of the word.
//
// `Diaspora.Modules.Integrations` now serves fifteen routes under
// `/api/v1/integrations`, and its own endpoint contributor says why the shapes
// match:
//
//   > **Route shapes come from the frontend, not from this module.** The
//   > client's `integrations-gap-api.ts` declares every one of these against
//   > `/integrations-gap/v0` … Only the prefix changes.
//
// It is very nearly true. This file is the client for the real prefix, and the
// header below is the list of places where it is *not* true — each found by
// reading `IntegrationsEndpointContributor.cs`, `IntegrationRequests.cs`,
// `IntegrationResponses.cs` and the six handler files, rather than by trusting
// the register.
//
// ── Seven things the register could not have known ───────────────────────────
//
// **1. There is a third OAuth route, and it is mandatory.**
// `POST /integrations/oauth/{provider}/authorize` is additive and is not
// optional: the *server* mints the `state` and chooses the redirect, and
// `/exchange` refuses any state it did not issue
// (`OAuthHandlers.cs:417-421`). A client that composed its own authorization
// URL — which is what the gap arm's contract implies — cannot complete an
// exchange at all. `startAuthorization` below is that route.
//
// **2. `state` is a required field on the exchange.** Not in the register's
// declared request, and without it the lookup matches no row
// (`OAuthHandlers.cs:417`).
//
// **3. `intent: "signIn"` is refused, at both ends of the flow.** The register
// declared `{ connection, session? }` with `session` present for a sign-in.
// There is no session in the response type at all, and `StartAuthorization` and
// `ExchangeAuthorization` each fail with `IntentUnsupported` before anything
// else runs (`OAuthHandlers.cs:140-152`, `:400-403`). Minting a platform
// session from an external assertion is Identity's decision and Identity has no
// external credential model. `OAuthIntent` below therefore has two members, not
// three — a signature that cannot express the refused case.
//
// **4. Idempotency is a HEADER here, and it is mandatory on a calendar write.**
// `IdempotencyHeader.From(context)` reads `Idempotency-Key`
// (`IntegrationsEndpointContributor.cs:562-574`) and the handler 400s on a
// blank one (`CalendarHandlers.cs:414-420`). Worth stating because Wave C-02
// found the *opposite* in Automation — mandatory, in the body, no headers read
// at all — so neither module's discipline generalises to the other.
//
// **5. Identity links live under `/integrations/identities`, not `/auth`.**
// The register declared `GET /auth/identities` and
// `DELETE /auth/identities/{provider}`. Neither has ever existed. The routes
// are on this module (`IntegrationsEndpointContributor.cs:379`, `:390`), and
// `reauthToken` is a **query parameter**, not a body field (`:392`).
//
// **6. `reauthToken` is accepted and deliberately not trusted.** The server
// proves recency from the token's own `auth_time`/`iat` claim within five
// minutes (`IdentityHandlers.cs:267-278`), and its comment is explicit that "a
// value the caller chooses cannot demonstrate that the caller is the owner".
// It is still sent, because the parameter is part of the contract; it is not
// treated here as though it were the control.
//
// **7. A delete answers `{ data: null }`.** `DeleteCalendarEventCommand` is a
// value-less `ICommand`, so `PlatformResults.Ok(context, result)` takes the
// non-generic overload and writes `data: null` (`PlatformResults.cs:29-37`).
// The register declared `{ data: { deleted: boolean } }`. A client reading
// `.deleted` gets `undefined`, which is falsy — so a successful delete would
// have rendered as a failure.
//
// ── The capability that exists and is switched off ───────────────────────────
//
// Every route below is real and reachable. **Almost none of them can succeed on
// a default deployment**, and that is a different fact from a missing contract.
// `IntegrationsModule.cs:105-121` registers `NotConfiguredOAuthProvider` and
// `NotConfiguredCalendarProvider` as the seams a vendor adapter replaces, and
// both answer `NotConfigured` for everything. So:
//
//   · `GET /connections` and `GET /identities` work, and answer honestly —
//     an empty list, and the platform phone method, respectively.
//   · `GET /capabilities` works and is the route that *says* the rest cannot.
//   · Everything OAuth or calendar answers `integrations.provider.not-configured`
//     → 400 → `ConfigurationMissing`, until a deployment contracts an adapter.
//
// This is why `fetchCapabilities` is not an afterthought. A screen must read it
// before offering a connect button, because the alternative is a button that
// answers 400 — and `NotConfiguredOAuthProvider`'s own summary explains what
// the tempting shortcut would have cost: "Return an `ExternalAccount` with the
// member's own email, mint a random token, and the connection centre shows
// CONNECTED — indistinguishable at the wire from a real grant."
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';
import { toIntegrationError } from './errors';
import type {
  CalendarEventDraft,
  CalendarEventRef,
  CalendarRef,
  CalendarSyncSettings,
  IdentityLink,
  IntegrationCapability,
  IntegrationConnection,
  IntegrationDomain,
  IntegrationProviderId,
  IntegrationSyncState,
} from '@/types/integrations';

/**
 * The module's prefix, relative to `apiClient`'s `/v1` base.
 *
 * Never `/integrations-gap/v0`. The two arms are separate files precisely so
 * that a call cannot drift from one prefix to the other by editing a constant.
 */
const ROOT = '/integrations';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Why this file never calls `readPage`.
 *
 * Every list route in this module returns `IReadOnlyList<T>` from its query
 * handler — `ListConnectionsQuery`, `ListIdentityLinksQuery`,
 * `ListRemoteCalendarsQuery` — so the envelope is `{ data: [...] }` and the
 * payload is a bare array. `toPage` recognises that as `shape: 'array'`, which
 * is correct and also pointless: nothing here is paged, nothing carries a
 * cursor, and wrapping a member's four connections in a `Page` would invite a
 * caller to look for a `nextCursor` that will never exist.
 *
 * Recorded rather than left implicit because the *row-property* trap this
 * remediation keeps hitting is real on other modules, and "why is there no
 * `readPage` here" is the question a reader will ask.
 */
async function get<T>(path: string, params?: object): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(`${ROOT}${path}`, { params });
    return response.data.data;
  } catch (cause) {
    throw toIntegrationError(cause, { mutating: false });
  }
}

async function send<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  options: {
    body?: unknown;
    params?: object;
    /** Sent as `Idempotency-Key`. See point 4 in the header. */
    idempotencyKey?: string;
    provider?: IntegrationProviderId;
    capability?: IntegrationCapability;
  } = {}
): Promise<T> {
  const url = `${ROOT}${path}`;
  const config = {
    params: options.params,
    headers:
      options.idempotencyKey === undefined
        ? undefined
        : { 'Idempotency-Key': options.idempotencyKey },
  };

  try {
    const response =
      method === 'delete'
        ? await apiClient.delete<Envelope<T>>(url, config)
        : method === 'put'
          ? await apiClient.put<Envelope<T>>(url, options.body, config)
          : await apiClient.post<Envelope<T>>(url, options.body, config);

    return response.data.data;
  } catch (cause) {
    throw toIntegrationError(cause, {
      mutating: true,
      provider: options.provider,
      capability: options.capability,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this deployment actually has.
 *
 * Mirrors `IntegrationCapabilitiesResponse`. The reason it matters is in the
 * header: on a deployment with no vendor adapter every OAuth and calendar route
 * exists and refuses, and this is the only route that lets a screen tell that
 * apart from an outage *before* offering the member a button.
 *
 * `unavailableReasons` is keyed by capability — `oauth`, `calendar`,
 * `oauth.redirect`, `credentialCustody`, `outbound`, `calendar.sync.twoWay` —
 * and every `false` above has an entry. Rendered rather than paraphrased: the
 * server distinguishes "no adapter", "no credential", "no redirect" and "no
 * key", which are four different fixes, and a client that collapsed them into
 * "unavailable" would throw away the only diagnosis available.
 */
export interface IntegrationCapabilityReport {
  oAuthProviders: string[];
  calendarProviders: string[];
  /**
   * Per calendar provider, the operations its adapter declares.
   *
   * The values are the C# enum member names as `ToString()` produced them —
   * `List`, `CreateEvent`, `UpdateEvent`, `DeleteEvent`, `ReadEvent`,
   * `ImportEvents`, `WatchChannel` — **PascalCase**, and deliberately not the
   * client's dotted `IntegrationCapability` vocabulary. The two are different
   * alphabets: `GetIntegrationCapabilitiesQuery.cs:100` serialises the enum
   * directly, while `IntegrationMapper.ToCapabilities` translates the *same*
   * enum into `calendar.event.create` for the connection rows. Typed as
   * `string[]` rather than mis-typed as `IntegrationCapability[]`, because a
   * union that does not contain the values it is fed is worse than a string.
   */
  calendarCapabilities: Record<string, string[]>;
  webhookProviders: string[];
  credentialCustodyConfigured: boolean;
  redirectUrisConfigured: boolean;
  twoWayCalendarSync: boolean;
  unavailableReasons: Record<string, string>;
}

export function fetchCapabilities(): Promise<IntegrationCapabilityReport> {
  return get<IntegrationCapabilityReport>('/capabilities');
}

/**
 * Whether an authorization can be started at all on this deployment.
 *
 * Three conditions, all server-reported, and all three are genuinely required:
 * an adapter to talk to, a key to store the grant under, and an allow-listed
 * redirect. `StartAuthorizationCommandHandler` checks the second and third
 * before it checks the first (`OAuthHandlers.cs:154-181`), so a deployment
 * missing only the redirect list still reports an OAuth provider and still
 * cannot connect anything.
 */
export function canStartAuthorization(report: IntegrationCapabilityReport | null): boolean {
  return Boolean(
    report &&
      report.oAuthProviders.length > 0 &&
      report.credentialCustodyConfigured &&
      report.redirectUrisConfigured
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connections — GAP-001
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every integration this member has connected.
 *
 * Takes no subject and there is no variant that does: "Self only. There is no
 * read-another-member's-connections variant."
 *
 * `domain` narrows on the domain half of the dotted provider key and is
 * lower-cased server-side (`ConnectionHandlers.cs:110`), so the client's own
 * `IntegrationDomain` literals pass through unchanged.
 */
export function fetchConnections(domain?: IntegrationDomain): Promise<IntegrationConnection[]> {
  return get<IntegrationConnection[]>('/connections', domain ? { domain } : undefined);
}

/**
 * What a disconnect answers.
 *
 * **Not an `IntegrationConnection`.** The gap arm returned the updated
 * connection row and this route returns three fields
 * (`IntegrationDisconnectResponse`), so a caller that spread the result into a
 * connection would produce a row with no `provider` domain, no `status` the UI
 * understands and no `observedAt`.
 */
export interface IntegrationDisconnectResult {
  provider: IntegrationProviderId;
  /** Always `DISCONNECTED`. Present because the contract names it. */
  status: 'DISCONNECTED';
  /**
   * Whether the provider confirmed the revocation.
   *
   * `false` is a real answer rather than a failure, and the response type says
   * why: "the local grant is gone either way, and a member is entitled to know
   * that Google still lists Diaspora because Google could not be reached."
   */
  revokedAtProvider: boolean;
}

/**
 * Disconnects a provider.
 *
 * `revokeAtProvider` is a **query parameter** and defaults to `true`
 * server-side, with the reason stated in the endpoint: "A member disconnecting
 * means it, and the alternative default leaves the platform holding a working
 * refresh token unless a client remembered to ask." It is a required argument
 * here for exactly that reason — there is no safe default to invent locally,
 * and the one the server picked is the one a caller should have to opt out of
 * deliberately.
 *
 * Idempotent: a second call answers 200 with the same body, never 404. §41
 * requires the UI never be left saying "Connected" after a disconnect, and a
 * 404 on the retry is exactly how a flaky connection leaves it there.
 */
export function disconnectIntegration(
  provider: IntegrationProviderId,
  revokeAtProvider: boolean
): Promise<IntegrationDisconnectResult> {
  return send<IntegrationDisconnectResult>(
    'delete',
    `/connections/${encodeURIComponent(provider)}`,
    { params: { revokeAtProvider }, provider }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth — GAP-002
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a client cannot ask for a sign-in.
 *
 * Two members, not the register's three. `signIn` is refused at authorization
 * *and* again at exchange with an explicit `IntentUnsupported` rather than a
 * silent downgrade to `link` — which "would attach an account to whichever
 * session happened to be open". A union that cannot express it is the cheapest
 * place to enforce that, and it means no screen can offer the affordance.
 */
export type OAuthIntent = 'link' | 'reauthorize';

/** What a started authorization gives the client. `AuthorizationStartResponse`. */
export interface AuthorizationStart {
  /** Where to send the member. Composed by the adapter, never by this client. */
  authorizationUrl: string;
  /**
   * The state to send back at exchange.
   *
   * Issued by the server and stored as a hash, "because a state the server did
   * not mint is a state the server cannot validate". Held for the duration of
   * one flow and never persisted.
   */
  state: string;
  /** The redirect the server approved. The client must use this one. */
  redirectUri: string;
  /** What the adapter will actually ask for, after narrowing. */
  scopes: string[];
  expiresAt: string;
}

/**
 * Opens an authorization.
 *
 * The route the register does not have, and the one without which nothing else
 * in this section works — see point 1 in the header.
 *
 * `codeChallenge` is the base64url SHA-256 of the verifier the device keeps.
 * It is required, and `plain` is not accepted: the client is public and cannot
 * authenticate itself. The *verifier* never travels here — that is the split
 * RFC 7636 specifies and it is what keeps the secret on the device.
 *
 * `redirectUri` may be omitted, in which case the deployment's first
 * allow-listed entry is used. A named one is matched **exactly**, never by
 * prefix: `ResolveRedirect` says why, and it is the canonical
 * code-interception vulnerability if it were otherwise.
 */
export function startAuthorization(
  provider: IntegrationProviderId,
  input: {
    codeChallenge: string;
    scopes: string[];
    intent: OAuthIntent;
    redirectUri?: string;
  }
): Promise<AuthorizationStart> {
  return send<AuthorizationStart>(
    'post',
    `/oauth/${encodeURIComponent(provider)}/authorize`,
    {
      body: {
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        scopes: input.scopes,
        intent: input.intent,
      },
      provider,
    }
  );
}

/**
 * Completes an authorization.
 *
 * Returns the connection itself — **not** `{ connection, session? }`. There is
 * no session field on the wire and no route that mints one.
 *
 * `state` is required. `redirectUri` is sent and is *compared, never used*: the
 * URI presented to the provider is the one recorded at authorization time, and
 * a mismatch is a visible refusal rather than a silent substitution.
 *
 * **No idempotency key, deliberately.** An authorization code is single-use by
 * specification, the request is consumed *before* the provider call so a
 * timeout cannot leave a redeemable row, and a replay answers 409 — which is
 * how a client learns the first attempt worked. Retrying this is never safe and
 * there is no key that would make it so.
 */
export function exchangeAuthorizationCode(
  provider: IntegrationProviderId,
  input: {
    code: string;
    codeVerifier: string;
    state: string;
    redirectUri: string;
    scopes?: string[];
    intent: OAuthIntent;
  }
): Promise<IntegrationConnection> {
  return send<IntegrationConnection>(
    'post',
    `/oauth/${encodeURIComponent(provider)}/exchange`,
    {
      body: {
        code: input.code,
        codeVerifier: input.codeVerifier,
        state: input.state,
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        intent: input.intent,
      },
      provider,
    }
  );
}

/**
 * Revokes the grant at the provider.
 *
 * **Takes no body.** The register declared `{ connectionId }`; the route binds
 * only the provider from the path (`IntegrationsEndpointContributor.cs:167`)
 * and `RevokeAuthorizationCommand` has one property. A connection id sent here
 * would be silently ignored, which is worse than being refused.
 *
 * Distinct from `disconnectIntegration`: this drops the provider-side grant
 * while the flow keeps the connection record, which is what a reauthorization
 * needs. Idempotent — revoking twice is a 200 no-op.
 */
export function revokeAuthorization(
  provider: IntegrationProviderId
): Promise<IntegrationDisconnectResult> {
  return send<IntegrationDisconnectResult>(
    'post',
    `/oauth/${encodeURIComponent(provider)}/revoke`,
    { provider }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar — GAP-003, GAP-004, GAP-005
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The calendars a connected account can see.
 *
 * Never cached, anywhere, and the module makes the same promise on its side:
 * "No cache entry is written for this query anywhere in the module." A calendar
 * title is personal — "Therapy", "Dad's chemo" — so the cost of a provider
 * round-trip on every render of the picker is the correct trade.
 */
export function fetchRemoteCalendars(provider: IntegrationProviderId): Promise<CalendarRef[]> {
  return get<CalendarRef[]>(`/calendar/${encodeURIComponent(provider)}/calendars`);
}

/**
 * What a write gives back.
 *
 * `wasDeduplicated` is additive and is not on the client's `CalendarEventRef`.
 * It is the field that lets a caller say "already in your calendar" rather than
 * claiming a second success, and it is set by two different barriers: a
 * replayed idempotency key, and an unchanged event already written.
 */
export interface RemoteCalendarEventRef extends CalendarEventRef {
  wasDeduplicated: boolean;
}

/**
 * Writes an entry into a connected calendar.
 *
 * **`idempotencyKey` is required, and it goes in the `Idempotency-Key`
 * header.** A blank one is a 400 before a provider is touched
 * (`CalendarHandlers.cs:414-420`), and the register's reason is the right one:
 * without it "a retry after a timeout is a duplicate event in somebody's
 * calendar — the most visible possible failure of this integration, and the one
 * a member cannot easily undo".
 *
 * `timeZone` is required on `CalendarEventDraft` and is validated against the
 * zone database. An unknown zone is **refused, not substituted**: a provider
 * given one either rejects the write or silently reads it as UTC, and the
 * second is worse — the entry appears, at the wrong time, with nothing
 * recorded to say why.
 *
 * There is no attendees field on the request record and there is deliberately
 * nowhere to add one. Exporting an event must not disclose who else is going to
 * a third party the other attendees never agreed to.
 */
export function createRemoteCalendarEvent(
  provider: IntegrationProviderId,
  calendarId: string,
  draft: CalendarEventDraft,
  idempotencyKey: string
): Promise<RemoteCalendarEventRef> {
  return send<RemoteCalendarEventRef>(
    'post',
    `/calendar/${encodeURIComponent(provider)}/events`,
    {
      body: { calendarId, ...draft },
      idempotencyKey,
      provider,
      capability: 'calendar.event.create',
    }
  );
}

/**
 * Replaces an entry this platform wrote.
 *
 * The same command as the create, with the target supplied from the path, and
 * the same header requirement — the endpoint calls the identical
 * `IdempotencyHeader.From(context)`. The gap handler enforced the timezone
 * refusal on create and not on update; the server enforces it on both, because
 * both run the same `Validate`.
 */
export function updateRemoteCalendarEvent(
  provider: IntegrationProviderId,
  externalEventId: string,
  calendarId: string,
  draft: CalendarEventDraft,
  idempotencyKey: string
): Promise<RemoteCalendarEventRef> {
  return send<RemoteCalendarEventRef>(
    'put',
    `/calendar/${encodeURIComponent(provider)}/events/${encodeURIComponent(externalEventId)}`,
    {
      body: { calendarId, ...draft },
      idempotencyKey,
      provider,
      capability: 'calendar.event.update',
    }
  );
}

/**
 * Removes an entry.
 *
 * Returns nothing, and that is the contract rather than an omission — see point
 * 7 in the header. Typed `Promise<void>` so no caller can read a `deleted` flag
 * that is not there.
 *
 * Idempotent in two directions: an already-removed link is a 200, and an
 * external id this platform has no record of writing is *also* a 200 that does
 * nothing. The second is a control rather than laxity — "a client that could
 * pass any external id would be a client that could delete arbitrary entries
 * from a member's calendar using a grant the member gave for export."
 */
export async function deleteRemoteCalendarEvent(
  provider: IntegrationProviderId,
  externalEventId: string,
  calendarId?: string
): Promise<void> {
  await send<null>(
    'delete',
    `/calendar/${encodeURIComponent(provider)}/events/${encodeURIComponent(externalEventId)}`,
    {
      params: calendarId === undefined ? undefined : { calendarId },
      provider,
      capability: 'calendar.event.delete',
    }
  );
}

/**
 * Whether the provider already holds an entry Diaspora wrote for this source.
 *
 * Answered from this platform's own mapping rather than by calling the
 * provider, so it costs no calendar read on every render of an export button.
 * `null` means "no entry recorded" and is the common answer.
 *
 * Mapped ahead of `/events/{externalEventId}` on the server so that `lookup` is
 * never read as an identifier.
 */
export function findRemoteExportedEvent(
  provider: IntegrationProviderId,
  sourceId: string,
  calendarId: string
): Promise<RemoteCalendarEventRef | null> {
  return get<RemoteCalendarEventRef | null>(
    `/calendar/${encodeURIComponent(provider)}/events/lookup`,
    { sourceId, calendarId }
  );
}

/**
 * A sync run's state, as the server reports it.
 *
 * `syncId` is additive over the client's `IntegrationSyncState` and is the run's
 * own identifier, so a poll follows one run rather than a key.
 */
export interface RemoteSyncState extends IntegrationSyncState {
  syncId?: string | null;
}

/**
 * Starts a synchronisation.
 *
 * Accepted, not completed — the outcome is read back from
 * `fetchCalendarSyncStatus`.
 *
 * **`direction: 'import'` and `'both'` are refused** on every deployment today,
 * with `SyncDirectionUnsupported`, because no adapter declares `ImportEvents`.
 * The refusal is explicit rather than a silent downgrade to an export, and the
 * module says why: "A member who asked for 'both' and received an export would
 * believe their calendar had been read into Diaspora, which is a consent claim
 * rather than a feature claim."
 *
 * A run already going for the same (member, calendar) is **returned** rather
 * than duplicated, so a double tap answers with the running run and not a
 * second one. Two concurrent syncs over one calendar is how duplicates are
 * produced.
 */
export function startCalendarSync(
  provider: IntegrationProviderId,
  calendarId: string | null,
  direction: 'export' | 'import' | 'both'
): Promise<RemoteSyncState> {
  return send<RemoteSyncState>('post', `/calendar/${encodeURIComponent(provider)}/sync`, {
    body: { calendarId, direction },
    provider,
  });
}

/**
 * The state of the most recent synchronisation.
 *
 * A member who has never synced gets `phase: 'never'` with a null
 * `lastSyncedAt`, not a zeroed `synced`. The mapper is explicit that the two
 * "render identically and mean opposite things".
 *
 * `lastSyncedAt` is populated only for a run that reached `synced` or
 * `partial`. A failed run has a `completedAt` and must not present it as the
 * moment a sync succeeded.
 */
export function fetchCalendarSyncStatus(
  provider: IntegrationProviderId,
  calendarId?: string
): Promise<RemoteSyncState> {
  return get<RemoteSyncState>(
    `/calendar/${encodeURIComponent(provider)}/sync/status`,
    calendarId === undefined ? undefined : { calendarId }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar settings — GAP-006
// ─────────────────────────────────────────────────────────────────────────────

/** This member's calendar preferences, defaulted server-side if they have set none. */
export function fetchCalendarSettings(): Promise<CalendarSyncSettings> {
  return get<CalendarSyncSettings>('/calendar/settings');
}

/**
 * A partial update.
 *
 * Every property on `UpdateCalendarSettingsRequest` is nullable and **a missing
 * field means "leave it alone", never "clear it"**. The distinction is
 * load-bearing: a client sending only `enabled` against a clear-on-absent
 * server would wipe the member's default calendar.
 *
 * `undefined` entries are stripped before the request rather than sent as JSON
 * nulls, because a `null` on the wire binds to the same C# `null` an omitted
 * field does — the two are indistinguishable server-side, so the safe thing is
 * to send neither.
 */
export function updateCalendarSettings(
  patch: Partial<CalendarSyncSettings>
): Promise<CalendarSyncSettings> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) body[key] = value;
  }

  return send<CalendarSyncSettings>('put', '/calendar/settings', { body });
}

// Identity links (`GET`/`DELETE /identities`) were removed from the client on
// 5 Oct 2026: email and password is the only way to sign in.
