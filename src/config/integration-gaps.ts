// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 16, Integrations)
//
// ⚠ EVERY CAPABILITY REGISTERED HERE IS UNSUPPORTED, OR ONLY PARTLY SUPPORTED,
//   BY THE CERTIFIED BACKEND. ⚠
//
// ── What the audit found, stated plainly ─────────────────────────────────────
//
// Nine integrations were in scope. They were in five different states, and the
// spread is the single most important thing for whoever picks this up:
//
//   **Maps — complete.** Phase 8 built a full provider abstraction:
//   `lib/maps/providers/` with a registry, a surface provider, geocoding over
//   the *certified* `/location/search` and `/location/reverse-geocode`, routing
//   behind an adapter, and its own provider-gap register. This phase adds no map
//   implementation. `lib/integrations/maps.ts` is a bridge onto that registry so
//   the connection centre can show its status, and §10's abstraction requirement
//   is already satisfied by work that exists. Re-registering those gaps here
//   would produce two backend tickets for one contract.
//
//   **Payments — real and complete, with two holes.** B15 is genuinely there:
//   payment intents, authorize, capture, cancel, refunds, `/capabilities`
//   naming the live gateways, and `financial-errors.ts` mapping seventy-odd
//   codes. Phase 5 built the wallet UI over it. The two holes are GAP-018 (no
//   gateway session the device's SDK can present) and GAP-019 (`nextAction` is
//   an opaque `string | null`, so a 3-D Secure challenge cannot be routed).
//   Everything else about payments in this phase is a **presentation** layer
//   over a working contract.
//
//   **Push — backend present, device half missing.** B13 exposes
//   `PUT /notifications/devices`, `DELETE /notifications/devices/{id}`,
//   `/notifications/preferences` and `/notifications/categories`, and
//   `lib/notifications-api.ts` already wraps all of them. What does not exist is
//   on the device: no `expo-notifications`, no Firebase, no APNs configuration —
//   registered as provider gaps in `integration-provider-gaps.ts`, not here,
//   because they are not backend gaps and filing them as such would send a
//   backend team work it cannot do.
//
//   **SMS — half real.** `POST /auth/otp/send` and `/auth/otp/verify` are
//   called by the real login flow. What is missing is the state around them:
//   attempts remaining, lock-out, expiry (GAP-012).
//
//   **Calendar, government, and third-party identity — nothing at all.** No
//   OAuth of any kind exists anywhere in the application; the audit found zero
//   occurrences of the word. These are the gaps that carry the weight of this
//   register.
//
// ── The one architectural decision the register depends on ───────────────────
//
// **OAuth is backend-managed.** The device runs the authorization code flow
// with PKCE and posts the code to Diaspora; the backend holds the client secret
// and every refresh token. GAP-002 is that exchange endpoint, and it is the
// blocker for six other entries — nothing about Google Calendar or Google
// identity can be built past the authorization screen without it.
//
// The alternative — a public client holding tokens on the device — was rejected
// rather than overlooked. §38 forbids the client secret in the bundle, and a
// refresh token in device storage is a long-lived credential for somebody's
// entire Google Calendar sitting in an APK's sandbox. The cost of the decision
// is that this phase cannot ship a working Google connection at all, and that
// cost is recorded here rather than paid by weakening the rule.
//
// ── Where the simulated surfaces live ────────────────────────────────────────
//
// `lib/integrations-gap-api.ts`, under `/integrations-gap/v0`, behind
// `areSimulatedFeaturesEnabled()` — the same single switch Phases 5, 6, 7, 8,
// 12, 13 and 15 use. Never its own switch.
//
// The guarantee is a **runtime** one and it is real: in a production export the
// switch inlines to `function(){return!1}`, so `assertEnabled()` rejects on
// every path into this arm and `setupIntegrationGapMocks()` registers nothing.
// It is **not** a stripping guarantee — the modules survive minification, as
// verified against a real export for the seven earlier phases. A production
// bundle contains unreachable adapter code and route strings; it contains no
// member data and exposes no way to display a fabricated connection.
//
// Nothing in this phase moves money, mints a session, grants a permission or
// writes to a certified route. Every gap id below is quoted verbatim in
// `frontend-phase-16-integrations-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';
import type { IntegrationCapability, IntegrationDomain, IntegrationProviderId } from '@/types/integrations';

/** Where the simulated integration routes live. Never `/integrations`. */
export const INTEGRATION_GAP_PREFIX = '/integrations-gap/v0';

/** Which backend module should own the work. Extends the vocabulary Phase 13 established. */
export type IntegrationGapOwner =
  | 'identity-platform'
  | 'B13-notifications'
  | 'B15-financial'
  | 'location-platform'
  | 'B17-platform'
  /** A dedicated integration/connection service. Does not exist in any brief yet. */
  | 'integration-platform'
  /** Country data and official-source curation. Does not exist in any brief yet. */
  | 'government-data-platform'
  | 'analytics-platform'
  | 'future-evolution';

export type IntegrationGapPriority = 'critical' | 'high' | 'medium' | 'low';

/** How much of the capability the certified backend already carries. */
export type IntegrationGapCoverage = 'none' | 'partial';

/**
 * The frontend's own status, in the phase's vocabulary.
 *
 * There is no `incomplete` member, deliberately. The final principle forbids
 * leaving a screen unfinished because the backend is behind, and a type with
 * nowhere to record "unfinished" is the cheapest available enforcement.
 */
export type IntegrationGapFrontendStatus =
  | 'IMPLEMENTED + BACKEND CONNECTED'
  | 'IMPLEMENTED + BACKEND PARTIAL'
  | 'IMPLEMENTED + DEVELOPMENT ADAPTER';

/** The required contract, at the level of detail §53 asks for. */
export interface IntegrationGapContract {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request: string;
  response: string;
  authentication: string;
  authorization: string;
  permission?: string;
  /** §53 asks for idempotency explicitly. `null` where the verb is naturally safe. */
  idempotency: string | null;
}

export interface IntegrationGap {
  /** `FRONTEND-PHASE16-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  domain: IntegrationDomain;
  /** Null for a capability no single provider owns — a connection registry, say. */
  provider: IntegrationProviderId | null;
  capability: string;
  /** The capability keys this gap blocks. Cross-checked against the type union. */
  capabilityKeys: IntegrationCapability[];
  /** The Phase 16 section(s) this belongs to. */
  feature: string;
  /** Which screens depend on it. §53. */
  screens: string[];
  frontendStatus: IntegrationGapFrontendStatus;
  frontendBehaviour: string;
  coverage: IntegrationGapCoverage;
  existingBackendCapability: string[];
  missingBackendCapability: string[];
  requiredContracts: IntegrationGapContract[];
  /** Who holds which credential for how long. §53's "token lifecycle". */
  tokenLifecycle: string;
  /** What the provider must call back, and what the client must not assume. §30, §53. */
  webhookRequirements: string;
  /** One-way, two-way, or none — and what "synced" is allowed to mean. §35. */
  syncBehaviour: string;
  /** Which `IntegrationErrorKind`s this contract must be able to produce. §32. */
  errorModel: string;
  /** Whether an automatic retry is safe here. §33. */
  retryBehaviour: string;
  caching: string;
  securityRequirements: string;
  privacyRequirements: string;
  /** Another phase's gap that already covers part of this. */
  partiallyCoveredBy?: string | null;
  /** A gap in *this* register that must land first. */
  blockedBy?: string | null;
  owner: IntegrationGapOwner;
  priority: IntegrationGapPriority;
  recommendedPhase: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared prose
//
// Several gaps state the same rule. Naming it keeps the register honest — if
// the rule for six gaps is genuinely one rule, six paraphrases would eventually
// drift into six different rules.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_MANAGED_OAUTH =
  'The device performs the authorization code flow with PKCE and never holds a client secret. It posts the authorization code and code verifier to Diaspora, which exchanges them and stores the refresh token server-side, encrypted at rest. The device receives no access token and no refresh token — only a connection record naming the account and the granted scopes. Refresh is entirely server-side and invisible to the client; a client that could refresh would be a client that held a refresh token.';

const NO_TOKEN_ON_DEVICE =
  'No provider access token, refresh token, authorization code beyond the moment of exchange, or client secret may be returned to the device or stored on it. The response contract carries an account label, scope names and expiry only. `types/integrations.ts` has no field capable of holding a token, which is the client-side half of the enforcement and is asserted structurally by `integration-boundary.test.ts`.';

const SERVER_AUTHORITATIVE =
  'Authorization is entirely server-side. The client renders what it is given; a caller who edits a connection id in a request must receive a 403 rather than being stopped by the client. Frontend state is never trusted as a permission.';

const NO_TOKEN_IN_LOGS =
  'No access token, refresh token, authorization code, push token or payment instrument may appear in a log line, an error message, an analytics event or a crash report — including truncated. A truncated credential in a log is still a credential in a log.';

const USER_SCOPED =
  'Every record is scoped to the authenticated subject and must be re-fetched, not merely re-rendered, when the session changes. A connection belonging to one member must be unreachable by another under any identifier they can supply.';

const OAUTH_ERROR_MODEL =
  'AuthenticationRequired (no session), PermissionDenied (member refused a scope), ExpiredCredential (the stored grant no longer works and the member must reauthorize), ProviderUnavailable (the provider answered 5xx), RateLimited with Retry-After, ConfigurationMissing (this deployment has no client credentials), Conflict (the external account is already linked to a different member), InvalidRequest, UnknownError.';

const NO_AUTO_RETRY_SENSITIVE =
  'No automatic retry. §33 forbids blind retries on identity linking, and an authorization code is single-use: replaying one produces a provider error that reads like a bug and is not. A failure surfaces a member-initiated "Try again" that starts a fresh authorization.';

export const INTEGRATION_GAPS: Record<string, IntegrationGap> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // THE FOUNDATION — §3, §5, §31, §41
  // ═══════════════════════════════════════════════════════════════════════════

  connectionRegistry: {
    id: 'FRONTEND-PHASE16-GAP-001',
    key: 'connectionRegistry',
    domain: 'calendar',
    provider: null,
    capability:
      'An integration connection registry — the record of which external accounts a member has connected, in which states, with which scopes',
    capabilityKeys: [],
    feature: '§3 Integration Architecture · §5 Connection Centre · §31 Status Model',
    screens: ['/settings/integrations', '/settings/integrations/[provider]'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The complete connection centre is built: every integration in the catalogue is listed with its status, mode, capabilities, permissions, last sync, last error and privacy summary, in all thirteen §31 states. Connect, reconnect, disconnect and revoke are wired end to end. In production the registry resolves to the unavailable provider and each row renders its real, honest state — a device calendar row is genuinely connectable, a Google row says the exchange endpoint does not exist and names this gap.',
    coverage: 'none',
    existingBackendCapability: [
      'B13 has a device registry at `GET/PUT/DELETE /notifications/devices`, which is a connection registry for exactly one integration and is reused rather than duplicated.',
      'Nothing else in the certified surface records an external account connection.',
    ],
    missingBackendCapability: [
      'Any endpoint listing a member’s connected integrations',
      'A per-connection status the server owns, so two devices agree on whether Google is connected',
      'A disconnect that revokes server-side rather than only forgetting locally',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /integrations/connections',
        method: 'GET',
        request: 'domain?: string — optional narrowing to one integration family',
        response:
          '{ data: IntegrationConnection[] } where each carries provider, status, mode, accountLabel, scopes[], expiresAt, lastSyncedAt, lastError, observedAt. No token field.',
        authentication: 'Bearer. The subject is the token’s, never a parameter.',
        authorization: 'Self only. There is no read-another-member’s-connections variant.',
        idempotency: null,
      },
      {
        endpoint: 'DELETE /integrations/connections/{provider}',
        method: 'DELETE',
        request: 'revokeAtProvider: boolean — whether to call the provider’s revocation endpoint too',
        response: '{ data: { provider, status: "DISCONNECTED", revokedAtProvider: boolean } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency:
          'Naturally idempotent: disconnecting an already-disconnected integration returns 200 with the same body, not 404. §41 requires the UI never be left saying "Connected" after a disconnect, and a 404 on the second call is exactly how a retry leaves it there.',
      },
    ],
    tokenLifecycle: BACKEND_MANAGED_OAUTH,
    webhookRequirements:
      'None for the registry itself. A provider-initiated revocation — a member removing Diaspora from their Google account settings — should mark the connection REAUTH_REQUIRED if the provider offers such a signal, so the connection centre stops claiming a grant that no longer exists.',
    syncBehaviour: 'None. This is connection state, not content.',
    errorModel: `${OAUTH_ERROR_MODEL} Plus BackendGap while this endpoint does not exist, which is what the client renders today.`,
    retryBehaviour:
      'The read is safe to retry with backoff. The disconnect is idempotent and therefore also safe, which is the reason the contract above requires it to be.',
    caching:
      'Query key `["integrations","connections"]`, staleTime 30 seconds. Short because a connection changes as a direct result of something the member just did, and a stale "Not connected" immediately after connecting is the most confusing possible state.',
    securityRequirements: `${SERVER_AUTHORITATIVE} ${NO_TOKEN_ON_DEVICE} ${USER_SCOPED}`,
    privacyRequirements:
      'The account label is the minimum that identifies the account to its owner. No profile data, no contact list, no calendar content is carried by a connection record. A connected integration is itself a disclosure — that a member has a Google account — and the record must not be readable by any other member.',
    owner: 'integration-platform',
    priority: 'critical',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  oauthExchange: {
    id: 'FRONTEND-PHASE16-GAP-002',
    key: 'oauthExchange',
    domain: 'identity',
    provider: null,
    capability:
      'Backend-managed OAuth: exchanging a PKCE authorization code for tokens the backend holds, so no provider credential ever reaches the device',
    capabilityKeys: ['identity.signIn', 'identity.link', 'calendar.list'],
    feature: '§21 Identity Provider Abstraction · §38 Token Security · §6 Google Calendar',
    screens: [
      '/settings/integrations/[provider]',
      '/settings/integrations/identity',
      '/(auth)/login',
    ],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The complete authorization lifecycle is built: consent explanation (§37) before anything opens, PKCE challenge generation, the provider hand-off, the deep-link return, cancellation, denial, expiry and the "account already linked to another member" conflict. In production the flow stops before opening a browser and says the exchange endpoint does not exist, naming this gap — deliberately, because an authorization screen a member completes and which then 404s has cost them a real Google consent for nothing.',
    coverage: 'none',
    existingBackendCapability: [
      'No OAuth exists anywhere in the certified backend. The frontend audit found zero occurrences of the term.',
      '`POST /auth/otp/send` and `/auth/otp/verify` are the only authentication contracts, and they are phone-based.',
    ],
    missingBackendCapability: [
      'An authorization code exchange endpoint',
      'Server-side custody of refresh tokens, encrypted at rest',
      'Server-side refresh, so an expired access token is invisible to the client',
      'Provider-side revocation on disconnect',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /integrations/oauth/{provider}/exchange',
        method: 'POST',
        request:
          'code: string; codeVerifier: string; redirectUri: string; scopes: string[]; intent: "link" | "signIn" | "reauthorize"',
        response:
          '{ data: { connection: IntegrationConnection, session?: { accessToken, expiresIn } } } — `session` present only when intent is "signIn". The provider’s own tokens are never in this response.',
        authentication:
          'Bearer for intent "link" and "reauthorize" — the member is already signed in and is attaching an account. Anonymous for "signIn", which is how a session is created.',
        authorization:
          'For "link": the external account must not already be attached to a different member, and the response must be 409 Conflict when it is — never a silent re-attach, which would be an account takeover with a friendly UI.',
        permission: 'integrations.connections.write',
        idempotency:
          'An authorization code is single-use by specification. A replayed code must return 409, not a second connection. The client sends no idempotency key here precisely because the code is one.',
      },
      {
        endpoint: 'POST /integrations/oauth/{provider}/revoke',
        method: 'POST',
        request: 'connectionId: string',
        response: '{ data: { revokedAtProvider: boolean } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Idempotent. Revoking twice is a no-op returning 200.',
      },
    ],
    tokenLifecycle: `${BACKEND_MANAGED_OAUTH} The authorization code exists on the device for the duration of one HTTP request and is not persisted, not logged, and not placed in navigation state that survives a reload.`,
    webhookRequirements:
      'Google and Apple both offer account-level revocation signals. Consuming them is what stops the connection centre showing CONNECTED for a grant the member removed from their Google account page a week ago.',
    syncBehaviour: 'None. This is credential custody.',
    errorModel: OAUTH_ERROR_MODEL,
    retryBehaviour: NO_AUTO_RETRY_SENSITIVE,
    caching: 'None. A credential exchange is never cached, and the response is never persisted.',
    securityRequirements: `${NO_TOKEN_ON_DEVICE} ${NO_TOKEN_IN_LOGS} The redirect URI must be validated server-side against an allow-list; accepting a client-supplied redirect is the canonical OAuth code-interception vulnerability. PKCE is mandatory, not optional, because the client is public and cannot authenticate itself. The 409 on an already-linked account is a security control rather than a niceness — without it, linking is an account merge anybody can trigger.`,
    privacyRequirements:
      'Request the minimum scope for the capability the member asked for, and no more (§36). A member connecting a calendar must not be asked for contacts. The granted scope list must be readable in the connection centre so the member can see what they agreed to without going to the provider.',
    owner: 'identity-platform',
    priority: 'critical',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR — §6 · §7 · §8 · §46 · §62
  // ═══════════════════════════════════════════════════════════════════════════

  googleCalendarList: {
    id: 'FRONTEND-PHASE16-GAP-003',
    key: 'googleCalendarList',
    domain: 'calendar',
    provider: 'calendar.google',
    capability: 'Listing the calendars a connected Google account holds, so the member can choose one',
    capabilityKeys: ['calendar.list'],
    feature: '§6 Google Calendar · §8 Calendar Sync Settings',
    screens: ['/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The calendar picker is complete — primary marked, read-only calendars disabled with the reason shown, colours rendered, and a default selection persisted. The device calendar provider fills it from the OS where the native module is present; the Google provider fills it from the development adapter and renders the gap notice.',
    coverage: 'none',
    existingBackendCapability: ['None. No calendar contract of any kind exists.'],
    missingBackendCapability: [
      'A proxied calendar list, so the device never calls Google directly with a token it should not have',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /integrations/calendar/{provider}/calendars',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: CalendarRef[] } — id, title, color, allowsModifications, isPrimary, timeZone. `allowsModifications` must reflect the provider’s real access role, not be assumed true.',
        authentication: 'Bearer. The provider call is made server-side with the stored grant.',
        authorization: 'Self only. Reads only the calling member’s connection.',
        idempotency: null,
      },
    ],
    tokenLifecycle: `${BACKEND_MANAGED_OAUTH} This route is the reason the proxy exists: a device that could list calendars directly would be a device holding a Google access token.`,
    webhookRequirements: 'None.',
    syncBehaviour: 'Read-only. Listing calendars is not synchronisation and the UI must not present it as one.',
    errorModel: `${OAUTH_ERROR_MODEL} ExpiredCredential here means the member revoked Diaspora at Google and the connection must move to REAUTH_REQUIRED rather than ERROR.`,
    retryBehaviour: 'Safe to retry with exponential backoff. Idempotent read.',
    caching:
      'Query key `["integrations","calendar",provider,"calendars"]`, staleTime 5 minutes. A member does not create calendars often, and a stale list is corrected the moment a write fails against a calendar that has gone.',
    securityRequirements: `${SERVER_AUTHORITATIVE} ${USER_SCOPED} §46: a calendar id is not authorization. The server must verify the calendar belongs to the connection it is acting for, because a client that can name a calendar id must not thereby be able to write to it.`,
    privacyRequirements:
      'Calendar *titles* are personal — "Therapy", "Dad’s chemo" — and this response carries them. It must never be logged, never included in an analytics event (§55 forbids it), and never cached beyond the session.',
    blockedBy: 'FRONTEND-PHASE16-GAP-002',
    owner: 'integration-platform',
    priority: 'high',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  googleCalendarWrite: {
    id: 'FRONTEND-PHASE16-GAP-004',
    key: 'googleCalendarWrite',
    domain: 'calendar',
    provider: 'calendar.google',
    capability: 'Creating, updating and deleting a Diaspora event in a connected Google calendar',
    capabilityKeys: ['calendar.event.create', 'calendar.event.update', 'calendar.event.delete'],
    feature: '§6 Google Calendar · §7 Calendar Integration with Diaspora Events',
    screens: [
      '/community-life/event/[id]',
      '/community-life/occurrence/[id]',
      '/community-life/series/[id]',
      '/settings/integrations/calendar',
    ],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The Add-to-Calendar sheet is complete and shared by every event surface — §7 forbids duplicating calendar logic per screen and there is exactly one implementation. It offers whichever providers are actually available, converts a Diaspora event to a draft preserving the event’s own timezone (§62), handles the duplicate-export conflict per the member’s setting, and reports partial success honestly. The device provider writes for real where the native module is present; the Google provider writes to the development adapter.',
    coverage: 'none',
    existingBackendCapability: [
      'Events, occurrences and series exist and carry real start/end times and timezones — `types/community-life.ts` and the B12 contract. The *source* data is complete; only the export path is missing.',
    ],
    missingBackendCapability: [
      'A proxied event write',
      'A record of which Diaspora event maps to which external event id, so an update is an update rather than a duplicate',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /integrations/calendar/{provider}/events',
        method: 'POST',
        request:
          'calendarId: string; sourceId: string; sourceKind: string; title; startsAt; endsAt; timeZone (IANA, required); isAllDay; location?; notes?; url?; reminderMinutes: number[]; recurrenceRule?',
        response: '{ data: CalendarEventRef } — externalEventId, calendarId, writtenAt, viewUrl',
        authentication: 'Bearer.',
        authorization:
          'Self only, and the calendar must belong to the caller’s own connection (§46). A shared calendar the member has read-only access to must produce 403 rather than a silent no-op.',
        permission: 'integrations.calendar.write',
        idempotency:
          'Mandatory. `Idempotency-Key` on the (sourceId, calendarId) pair. Without it, a retry after a timeout is a duplicate event in somebody’s calendar — the most visible possible failure of this integration, and the one a member cannot easily undo. The platform already has `lib/idempotency.ts` from Phase 5 and this route should use the same key discipline.',
      },
      {
        endpoint: 'DELETE /integrations/calendar/{provider}/events/{externalEventId}',
        method: 'DELETE',
        request: 'None.',
        response: '{ data: { deleted: boolean } }',
        authentication: 'Bearer.',
        authorization: 'Self only, and only for an event Diaspora wrote (§46).',
        idempotency: 'Idempotent. Deleting an already-deleted event returns 200.',
      },
    ],
    tokenLifecycle: BACKEND_MANAGED_OAUTH,
    webhookRequirements:
      'None for one-way export. An event the member then edits in Google diverges silently, and the UI must not claim otherwise — which is why export and two-way sync are separate settings (§8) and separate gaps.',
    syncBehaviour:
      'One-way export only. "Added to your calendar" is a claim about one write at one moment and is the only claim this contract supports. It must never be rendered as "synced".',
    errorModel: `${OAUTH_ERROR_MODEL} Plus Conflict when the event was already exported and the member’s conflict setting is "skip", and PermissionDenied when the chosen calendar is read-only.`,
    retryBehaviour:
      'Retry only with the idempotency key, and only on a network failure or 5xx. A 4xx is never retried. Without the key this write would be in §33’s "never blindly retry" list; with it, it is safe.',
    caching: 'No caching of a write. The resulting external id is held with the source event.',
    securityRequirements: `${SERVER_AUTHORITATIVE} ${USER_SCOPED} §46 is the governing rule: a calendar id in a request is a name, not a capability. The server re-derives access from the connection on every write.`,
    privacyRequirements:
      'The event body sent to the provider is Diaspora’s own event data, which the member has already seen. Attendee lists must not be included — exporting an event must not disclose who else is going to a third party the other attendees never agreed to.',
    blockedBy: 'FRONTEND-PHASE16-GAP-002',
    owner: 'integration-platform',
    priority: 'high',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  calendarTwoWaySync: {
    id: 'FRONTEND-PHASE16-GAP-005',
    key: 'calendarTwoWaySync',
    domain: 'calendar',
    provider: 'calendar.google',
    capability: 'Two-way synchronisation between Diaspora events and an external calendar, including change notification',
    capabilityKeys: ['calendar.sync.twoWay', 'calendar.event.import'],
    feature: '§6 Google Calendar · §8 Calendar Sync Settings · §35 Sync State',
    screens: ['/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The sync surface is complete: enable/disable, frequency, conflict behaviour, a manual "Sync now", and the full §35 state set — never synced, syncing, synced, partial with the failure reasons listed, and failed. The screen states plainly that two-way sync is not available in this build and that only export is, which is the difference §8 asks to be made visible.',
    coverage: 'none',
    existingBackendCapability: ['None.'],
    missingBackendCapability: [
      'A synchronisation engine with a change cursor',
      'A Google watch channel, and the endpoint that receives its notifications',
      'A documented conflict resolution rule the client can describe to a member',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /integrations/calendar/{provider}/sync',
        method: 'POST',
        request: 'calendarId: string; direction: "export" | "import" | "both"',
        response:
          '{ data: { syncId, phase: "syncing", startedAt } } — accepted, not completed. The result is read back from the status route.',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency:
          'A sync already running for the same (member, calendar) must return the running one rather than starting a second. Two concurrent syncs over one calendar is how duplicates are produced.',
      },
      {
        endpoint: 'GET /integrations/calendar/{provider}/sync/status',
        method: 'GET',
        request: 'calendarId?: string',
        response:
          '{ data: IntegrationSyncState } — phase, lastSyncedAt, itemsSynced, itemsFailed, failureReasons[], needsAttention',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
    tokenLifecycle: `${BACKEND_MANAGED_OAUTH} A watch channel has its own expiry — Google’s maximum is days, not months — and renewing it is server-side work with no client involvement.`,
    webhookRequirements:
      'Google Calendar push notifications require a publicly reachable HTTPS endpoint with a verified domain, and channels expire and must be renewed. This is the single largest piece of infrastructure in this register. Until it exists the client must never render "synced" — §35 is explicit, and the client-side enforcement is that `lastSyncedAt` may only be set from a server response.',
    syncBehaviour:
      'Two-way. The conflict rule must be decided server-side and stated in the contract, because a client that guessed would produce different answers on two devices. Recommended: last-writer-wins on a per-field basis with Diaspora authoritative for events it owns, and the losing version preserved for a period so a wrong merge is recoverable.',
    errorModel: `${OAUTH_ERROR_MODEL} Plus Conflict for a divergent event, and a partial outcome that is neither success nor failure — which is why IntegrationSyncState has a \`partial\` phase rather than a boolean.`,
    retryBehaviour:
      'A sync is retryable because it is convergent, but only server-side and with backoff. The client offers a manual retry and never loops.',
    caching:
      'Status polled while `phase === "syncing"` at 5-second intervals, capped at 2 minutes, then the UI stops and offers a manual refresh. An unbounded poll against a stuck sync is a battery drain nobody notices in development.',
    securityRequirements: `${SERVER_AUTHORITATIVE} ${USER_SCOPED} Webhook payloads must be verified — an unauthenticated notification endpoint is an invitation to have somebody else’s sync triggered.`,
    privacyRequirements:
      'Import is the direction that matters here. Reading a member’s calendar brings personal events into Diaspora’s storage, and the consent copy must say so in those words. Imported events must be visible to nobody but the member, must never feed recommendations, and must be deleted when the integration is disconnected.',
    blockedBy: 'FRONTEND-PHASE16-GAP-002',
    owner: 'integration-platform',
    priority: 'medium',
    recommendedPhase: 'B21 Integration Platform — Synchronisation',
  },

  calendarSettings: {
    id: 'FRONTEND-PHASE16-GAP-006',
    key: 'calendarSettings',
    domain: 'calendar',
    provider: null,
    capability: 'Server-side persistence of calendar sync settings, so they survive a reinstall and match across devices',
    capabilityKeys: [],
    feature: '§8 Calendar Sync Settings · §45 Multi-Device',
    screens: ['/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'Every setting in §8 is implemented and takes effect immediately. Persistence is per-device and per-member for now, held under a user-scoped key so §42’s account switching cannot leak one member’s default calendar to another.',
    coverage: 'none',
    existingBackendCapability: [
      'B13 persists notification preferences server-side, which is the shape this contract should copy rather than invent.',
    ],
    missingBackendCapability: ['Any storage for calendar preferences'],
    requiredContracts: [
      {
        endpoint: 'GET /integrations/calendar/settings',
        method: 'GET',
        request: 'None.',
        response: '{ data: CalendarSyncSettings }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
      {
        endpoint: 'PUT /integrations/calendar/settings',
        method: 'PUT',
        request: 'Partial<CalendarSyncSettings> — send only what changed, as B13’s preference update does.',
        response: '{ data: CalendarSyncSettings }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Naturally idempotent — a settings write is a last-writer-wins assignment.',
      },
    ],
    tokenLifecycle: 'None. No credential is involved in a preference.',
    webhookRequirements: 'None.',
    syncBehaviour: 'None.',
    errorModel: 'BackendUnavailable, NetworkFailure, InvalidRequest, AuthenticationRequired.',
    retryBehaviour: 'Safe. A settings write is idempotent and retrying is harmless.',
    caching: 'Query key `["integrations","calendar","settings"]`, staleTime 1 minute.',
    securityRequirements: `${USER_SCOPED} A default calendar id is stored under a key that includes the member id, so a shared device cannot carry one member’s selection into another’s session.`,
    privacyRequirements:
      'The default calendar id is a weak identifier of a calendar whose title may be personal. It is stored, never logged, and cleared on sign-out along with the rest of the member-scoped integration state.',
    owner: 'integration-platform',
    priority: 'low',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY — §21 · §22 · §23 · §24
  // ═══════════════════════════════════════════════════════════════════════════

  identityLinking: {
    id: 'FRONTEND-PHASE16-GAP-007',
    key: 'identityLinking',
    domain: 'identity',
    provider: null,
    capability: 'Listing, linking and unlinking the authentication methods attached to an account',
    capabilityKeys: ['identity.link', 'identity.unlink'],
    feature: '§21 Identity Abstraction · §24 Account Linking',
    screens: ['/settings/integrations/identity', '/profile/account-security'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The linked-accounts surface is complete: primary method marked, each provider’s link state and last use shown, link and unlink wired, and §24’s lock-out rule enforced in the UI — the unlink control for a member’s only remaining method is disabled with the reason rendered beside it rather than hidden. The rule is computed over the whole set in `lib/integrations/identity/linking.ts`, never per row.',
    coverage: 'none',
    existingBackendCapability: [
      'Phone is the only authentication method: `POST /auth/otp/send` and `/auth/otp/verify`. There is no notion of a second method to link.',
    ],
    missingBackendCapability: [
      'An account-methods list',
      'Link and unlink operations',
      'A server-side rule refusing to remove a member’s last authentication method',
      'A reauthentication challenge before a security-sensitive change',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /auth/identities',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: IdentityLink[] } — provider, accountLabel, linkedAt, lastUsedAt, isPrimary, canUnlink, cannotUnlinkReason',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
      {
        endpoint: 'DELETE /auth/identities/{provider}',
        method: 'DELETE',
        request: 'reauthToken: string — proof of a recent reauthentication',
        response: '{ data: IdentityLink[] } — the remaining methods, so the client re-renders from truth',
        authentication: 'Bearer, plus a fresh reauthentication.',
        authorization:
          'Self only. **The server must refuse to remove the last method with 409**, regardless of what the client sent. §24’s rule is a server rule; the client’s disabled button is a courtesy, and a courtesy is not a control.',
        permission: 'auth.identities.write',
        idempotency: 'Idempotent per provider. Unlinking an unlinked provider returns the current list, not 404.',
      },
    ],
    tokenLifecycle:
      'Unlinking must revoke the provider-side grant as well as forgetting it locally, or the member believes they have disconnected and Diaspora retains a working refresh token.',
    webhookRequirements: 'Provider account-deletion signals, where offered, should unlink automatically.',
    syncBehaviour: 'None.',
    errorModel: `${OAUTH_ERROR_MODEL} Plus Conflict for "this is your only sign-in method" and for "this account is linked elsewhere".`,
    retryBehaviour: NO_AUTO_RETRY_SENSITIVE,
    caching:
      'Query key `["auth","identities"]`, staleTime 0 — always refetched. This list is the input to a lock-out decision and a stale copy could enable an unlink the current state forbids.',
    securityRequirements: `${SERVER_AUTHORITATIVE} Reauthentication is mandatory before an unlink: an attacker with a borrowed unlocked phone must not be able to detach the real owner’s recovery method. ${NO_TOKEN_IN_LOGS}`,
    privacyRequirements:
      'The account labels here are email addresses and phone numbers. They are shown only to the account owner and never in any shared or public surface. Apple private-relay addresses are marked as such (§23) so a member is not shown a relay address as though it were their own.',
    blockedBy: 'FRONTEND-PHASE16-GAP-002',
    owner: 'identity-platform',
    priority: 'high',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL AND SMS — §17 · §18
  // ═══════════════════════════════════════════════════════════════════════════

  emailVerification: {
    id: 'FRONTEND-PHASE16-GAP-008',
    key: 'emailVerification',
    domain: 'email',
    provider: 'email.platform',
    capability: 'Email address verification, change and resend, with an observable verification state',
    capabilityKeys: ['email.verification', 'email.change'],
    feature: '§17 Email Integration',
    screens: ['/settings/integrations/email', '/profile/account-security'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The complete flow is built: current address with its verification state, change with confirmation, resend with a cooldown that survives navigation, the pending-verification state, expiry, and the deep-link return from the verification link (§40). Delivery failure — a bounced address — has its own state, because "we sent it" and "it arrived" are different claims.',
    coverage: 'partial',
    existingBackendCapability: [
      'B13 carries an `email` preference and per-category email switches, and `lib/notifications-api.ts` already reads and writes them. The *preference* half is real and is used.',
      '`User.email` exists on the auth model.',
    ],
    missingBackendCapability: [
      'A verification state on the address',
      'Send-verification and resend endpoints',
      'A change-email flow that verifies the new address before switching',
      'A bounce/suppression state the member can see and act on',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /auth/email',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { address, isVerified, verificationSentAt, verificationExpiresAt, deliveryState: "ok" | "bounced" | "suppressed" } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
      {
        endpoint: 'POST /auth/email/verification',
        method: 'POST',
        request: 'None — resends to the address on file.',
        response: '{ data: { sentAt, expiresAt, cooldownSeconds } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        permission: 'auth.email.write',
        idempotency:
          'Rate-limited rather than idempotent, and the limit must be in the response as `cooldownSeconds` so the client can render a countdown instead of guessing one. §57.',
      },
      {
        endpoint: 'PUT /auth/email',
        method: 'PUT',
        request: 'address: string; reauthToken: string',
        response: '{ data: { pendingAddress, verificationSentAt } } — the old address stays active until the new one is verified',
        authentication: 'Bearer, plus reauthentication.',
        authorization: 'Self only. 409 if the address belongs to another account.',
        idempotency: 'Idempotent on the same target address.',
      },
    ],
    tokenLifecycle:
      'The verification link carries a single-use, short-lived, high-entropy token. It must expire in hours rather than days and must be invalidated by a subsequent change request.',
    webhookRequirements:
      'The email provider’s bounce and complaint webhooks feed `deliveryState`. Without them a member whose address is suppressed sees "verification sent" for ever and has no way to understand why nothing arrives.',
    syncBehaviour: 'None.',
    errorModel:
      'RateLimited with Retry-After for resend, Conflict for an address in use, InvalidRequest for a malformed address, ExpiredCredential for a stale verification link, AuthenticationRequired for a missing reauthentication.',
    retryBehaviour:
      'Resend is member-initiated only and gated by the server-supplied cooldown. Never automatic — an automatic resend loop is an email-bombing tool pointed at whatever address is on file.',
    caching: 'Query key `["auth","email"]`, staleTime 30 seconds.',
    securityRequirements: `${SERVER_AUTHORITATIVE} Changing the email address must require reauthentication, since it is a password-reset vector. The old address must remain the account’s until the new one is verified — switching first is how a typo locks somebody out permanently.`,
    privacyRequirements:
      'The address is shown only to its owner. It must not appear in any analytics event (§55) or log. Marketing consent is a separate switch from transactional email and must not be inferred from it.',
    owner: 'identity-platform',
    priority: 'high',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  emailPreferenceDetail: {
    id: 'FRONTEND-PHASE16-GAP-009',
    key: 'emailPreferenceDetail',
    domain: 'email',
    provider: 'email.platform',
    capability: 'Digest and unsubscribe controls at the granularity §17 asks for, including one-click unsubscribe state',
    capabilityKeys: ['email.preferences', 'email.unsubscribe'],
    feature: '§17 Email Integration · §14 Notification Preferences',
    screens: ['/settings/integrations/email', '/settings/notifications'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Built entirely on B13’s real preference contract — per-category email switches, digest frequency, digest hour and day, quiet hours, marketing consent and the mandatory-category explanation are all live against `PUT /notifications/preferences`. **No duplicate preference system was created**; §14 forbids it and the existing AsyncStorage-only screen was migrated onto the server contract rather than left beside it. What is missing is only the unsubscribe *state* an email footer link produces.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET/PUT /notifications/preferences` with `email`, per-category `email`, `useDigest`, `digestFrequency`, `digestHour`, `digestDayOfWeek`, `allowsMarketing`, quiet hours and `criticalOverrideEnabled` — all real and all used.',
      '`GET /notifications/categories` for the category definitions and their mandatory flags.',
    ],
    missingBackendCapability: [
      'A record of an unsubscribe performed from an email footer rather than in the app, so the app can show it',
      'A per-category suppression reason, so "you unsubscribed from this on 3 May" can be explained',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /notifications/preferences/subscriptions',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { categoryKey, emailEnabled, unsubscribedAt: string|null, unsubscribeSource: "app"|"emailLink"|"bounce"|null }[] }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
    tokenLifecycle:
      'An unsubscribe link must work without a session — that is the point of it — so it carries a signed, single-purpose token scoped to one category. That token must not grant anything else.',
    webhookRequirements: 'Provider unsubscribe and complaint events must set `unsubscribedAt`.',
    syncBehaviour: 'None.',
    errorModel: 'BackendUnavailable, NetworkFailure, InvalidRequest.',
    retryBehaviour: 'Safe. Preference writes are idempotent assignments.',
    caching: 'Shares B13’s existing `notificationKeys.preferences()` key. No second cache.',
    securityRequirements:
      'An unsubscribe token must not be usable to read or change anything other than the one subscription it names.',
    privacyRequirements:
      'Mandatory categories cannot be switched off and the screen says why, rather than rendering a switch that silently does nothing. Marketing consent is opt-in and its state is never inferred from any other preference.',
    partiallyCoveredBy: 'B13 notification preferences — the majority of this capability already exists and is used.',
    owner: 'B13-notifications',
    priority: 'low',
    recommendedPhase: 'B13.3 Notification Preferences — subscription state',
  },

  smsVerificationState: {
    id: 'FRONTEND-PHASE16-GAP-010',
    key: 'smsVerificationState',
    domain: 'sms',
    provider: 'sms.platform',
    capability: 'Observable OTP state — attempts remaining, resend cooldown, expiry and lock-out',
    capabilityKeys: ['sms.verification'],
    feature: '§18 SMS Integration · §57 Rate Limiting UX',
    screens: ['/(auth)/login', '/(auth)/otp', '/verification/phone'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The complete OTP UX is built and now runs through one adapter rather than three inline `setTimeout` simulations — the audit found simulated OTP behaviour hardcoded in `(auth)/otp.tsx` and `verification/phone.tsx`, which §68 forbids, and both now call the same capability. Every §18 state is handled: invalid code, expired code, too many attempts, resend countdown, international formatting and country code selection. Where the backend returns no attempt metadata the client applies conservative local defaults and says they are local.',
    coverage: 'partial',
    existingBackendCapability: [
      '`POST /auth/otp/send` and `POST /auth/otp/verify` are real and are what the login flow calls.',
    ],
    missingBackendCapability: [
      'Attempts remaining and maximum, in the verify response',
      'A server-supplied resend cooldown, so the client stops guessing 30 seconds',
      'Code expiry, so the UI can say "this code has expired" rather than "incorrect code"',
      'A lock-out state distinguishable from a wrong code',
      'A delivery state, so an undeliverable number is distinguishable from an unread message',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /auth/otp/send',
        method: 'POST',
        request: 'phoneNumber: E.164; purpose: "signIn" | "changePhone" | "verify"',
        response:
          '{ data: { sentAt, expiresAt, cooldownSeconds, maxAttempts, deliveryState: "queued"|"sent"|"undeliverable" } } — currently returns none of this',
        authentication: 'Anonymous for signIn; Bearer for changePhone.',
        authorization: 'Rate-limited per number *and* per device, or it is an SMS-pumping endpoint.',
        idempotency:
          'Requests inside the cooldown must return the existing code’s metadata rather than sending a second message. §33: never blindly retry — and a resend loop bills the platform per message.',
      },
      {
        endpoint: 'POST /auth/otp/verify',
        method: 'POST',
        request: 'phoneNumber: E.164; code: string',
        response:
          '{ data: { user, accessToken, attemptsRemaining } } or a typed failure carrying `attemptsRemaining` and `lockedUntil`',
        authentication: 'Anonymous.',
        authorization: 'The code is the authorization. It must be single-use and invalidated on success.',
        idempotency: 'A verified code must not verify twice.',
      },
    ],
    tokenLifecycle:
      'The OTP is a short-lived shared secret. It must be single-use, expire in minutes, be invalidated on a successful verification, and never be logged or returned in any response.',
    webhookRequirements:
      'The SMS provider’s delivery receipt feeds `deliveryState`. Without it a member with a number that cannot receive SMS waits indefinitely with no explanation.',
    syncBehaviour: 'None.',
    errorModel:
      'InvalidRequest (wrong code), ExpiredCredential (expired code), RateLimited (resend too soon, or locked out, with Retry-After), ProviderUnavailable (carrier failure), NetworkFailure.',
    retryBehaviour:
      'Resend is member-initiated only, gated by the server cooldown where one is returned and by a conservative local default where it is not. Verification is never retried automatically — an automatic retry of a wrong code burns the member’s remaining attempts.',
    caching: 'None. Nothing about an OTP is cacheable.',
    securityRequirements: `The client must not decide whether verification succeeded. **The audit found the previous implementation logging the member in from the \`catch\` block when the API call failed, with a fabricated user and the literal token \`mock-jwt-token\` — an authentication bypass on any network error.** That is fixed in this phase: the fallback is gone and a transport failure is now a failure. ${NO_TOKEN_IN_LOGS} Attempts remaining must be enforced server-side; the client’s counter is a display.`,
    privacyRequirements:
      'The phone number is displayed to its owner in full and appears in no analytics event. §55 forbids it. Country selection must not be presented as, or recorded as, a nationality signal.',
    owner: 'identity-platform',
    priority: 'high',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNMENT — §19 · §20 · §60
  // ═══════════════════════════════════════════════════════════════════════════

  governmentNotices: {
    id: 'FRONTEND-PHASE16-GAP-011',
    key: 'governmentNotices',
    domain: 'government',
    provider: 'government.official',
    capability: 'Official government notices, advisories, embassy details and country services, with verifiable provenance',
    capabilityKeys: ['government.notices', 'government.advisories', 'government.embassy', 'government.services'],
    feature: '§19 Government API Integrations · §20 Government Information Trust · §60 Country Awareness',
    screens: ['/settings/integrations/government', '/country/[code]', '/settings/integrations'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The complete government surface is built and is country-aware by construction — it takes a country and cannot render without one, so §60’s "do not show Nigeria visa information to somebody browsing Canada" is structural rather than a review item. Every item renders its authority, source kind, published date, last-checked date, official URL and verification state (§20), and the three source kinds are visually and textually distinct. **No item can be rendered without a `GovernmentSource`** — there is no component that displays official-looking content without provenance, which is the enforcement §19 asks for.',
    coverage: 'none',
    existingBackendCapability: [
      'None. `types/country.ts` carries country statistics; nothing carries an official notice.',
      'The word "government" appears in the codebase only as a verification document type and in guide copy.',
    ],
    missingBackendCapability: [
      'Any government notice, advisory or embassy contract',
      'A proxy for the country APIs that do exist, so no government API key is ever in the bundle',
      'A curation and verification workflow producing the provenance §20 requires',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /government/{countryCode}/notices',
        method: 'GET',
        request:
          'category?: notice|advisory|embassy|immigration|service; region?: string; audienceCountry?: ISO-3166-1 — the member’s country of origin, where they have chosen to share it',
        response:
          '{ data: GovernmentNotice[] } — each with a mandatory `source` carrying kind, authority, countryCode, officialUrl, publishedAt, lastCheckedAt and verification',
        authentication: 'Bearer, or anonymous — official information should be readable without an account.',
        authorization: 'None beyond authentication. This is public information.',
        idempotency: null,
      },
      {
        endpoint: 'GET /government/sources',
        method: 'GET',
        request: 'countryCode?: string',
        response:
          '{ data: { countryCode, authority, sourceKind, officialUrl, lastCheckedAt, isLive: boolean }[] } — which countries have a live official feed and which are curated. The client renders the difference.',
        authentication: 'Anonymous.',
        authorization: 'None.',
        idempotency: null,
      },
    ],
    tokenLifecycle:
      'Any government API key stays server-side. §19 and §38 both apply and there is no case for a government credential in a mobile bundle — see FRONTEND-PHASE16-GAP-012.',
    webhookRequirements:
      'Few government sources push. A scheduled re-check that updates `lastCheckedAt` is what makes the staleness indicator honest, and without it the client cannot distinguish "confirmed current this morning" from "scraped once in 2024".',
    syncBehaviour: 'Server-side refresh on a schedule. The client reads a snapshot and shows how old it is.',
    errorModel:
      'ProviderUnavailable when the official source is down — and the client must say the *source* is unavailable rather than showing nothing, because "we cannot reach the Home Office right now" and "there are no advisories" are opposite claims. UnsupportedCapability for a country with no source at all.',
    retryBehaviour: 'Safe to retry a read with backoff. Never retried against the government source directly by the client.',
    caching:
      'Query key `["government",countryCode,category]`, staleTime 30 minutes, and the rendered `lastCheckedAt` always comes from the payload rather than from the fetch time — otherwise a cached response would appear to have been checked when it was merely re-read.',
    securityRequirements:
      'The official URL must be validated server-side and rendered as an outbound link the member can inspect. A government surface is a high-value phishing target and an unvalidated URL in an official-looking card is the whole attack.',
    privacyRequirements:
      '§60’s last line is the load-bearing one: do not infer sensitive identity attributes from location. Reading a country’s visa advisories must not be recorded as, or used to infer, the member’s nationality or immigration status. The request carries a country the member *chose*, and `audienceCountry` is optional for exactly that reason.',
    owner: 'government-data-platform',
    priority: 'medium',
    recommendedPhase: 'B22 Country and Government Information',
  },

  governmentProxy: {
    id: 'FRONTEND-PHASE16-GAP-012',
    key: 'governmentProxy',
    domain: 'government',
    provider: null,
    capability: 'A server-side proxy for third-party government and travel-advisory APIs, so no such key is ever in the bundle',
    capabilityKeys: [],
    feature: '§19 Government APIs · §38 Token Security · §39 Environment Configuration',
    screens: ['/settings/integrations/government'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '`config/integration-config.ts` reads no government API key of any kind, and the boundary test asserts it never will. The client only ever calls Diaspora’s own routes; the government provider’s "unconfigured" state means Diaspora’s proxy is absent, never that a key is missing from the device.',
    coverage: 'none',
    existingBackendCapability: ['None.'],
    missingBackendCapability: ['A credentialed server-side client for any official source'],
    requiredContracts: [
      {
        endpoint: 'GET /government/{countryCode}/notices',
        method: 'GET',
        request: 'As GAP-011. This entry is about *where the credential lives*, not about a second route.',
        response: 'As GAP-011.',
        authentication: 'Bearer or anonymous at the Diaspora edge; the provider credential is applied server-side.',
        authorization: 'None beyond authentication.',
        idempotency: null,
      },
    ],
    tokenLifecycle:
      'Provider keys live in the backend’s secret store, rotate there, and never appear in an `EXPO_PUBLIC_*` variable. An `EXPO_PUBLIC_*` value is compiled into the bundle and extractable from the APK; for a metered government API that is both a billing exposure and a terms-of-use breach.',
    webhookRequirements: 'None.',
    syncBehaviour: 'None.',
    errorModel: 'ConfigurationMissing when the deployment has no source configured — surfaced as "not configured", never as "no information".',
    retryBehaviour: 'Server-side, with the provider’s own rate limits respected. The client never retries into a metered API.',
    caching: 'Server-side, aggressively. A government advisory changes rarely and is read often.',
    securityRequirements: `${NO_TOKEN_IN_LOGS} No government API key may be read by \`config/integration-config.ts\`. Asserted by \`integration-boundary.test.ts\` against the module source, not by convention.`,
    privacyRequirements:
      'The proxy must not forward a member identifier to a third-party government API. Which member is reading a visa advisory is not information a foreign government needs.',
    blockedBy: 'FRONTEND-PHASE16-GAP-011',
    owner: 'government-data-platform',
    priority: 'medium',
    recommendedPhase: 'B22 Country and Government Information',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENTS — §25 · §26 · §29 · §30
  // ═══════════════════════════════════════════════════════════════════════════

  paymentGatewaySession: {
    id: 'FRONTEND-PHASE16-GAP-013',
    key: 'paymentGatewaySession',
    domain: 'payments',
    provider: 'payments.platform',
    capability: 'A gateway session the device SDK can present, so an instrument can be collected without touching Diaspora',
    capabilityKeys: ['payments.authorize', 'payments.methods'],
    feature: '§25 Payment Provider Abstraction · §28 Payment Security',
    screens: ['/wallet/add-money', '/wallet/plans', '/monetization/*', '/marketplace/*'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'Everything B15 supports is connected and real: intent creation, authorization, capture, cancel, the full status lifecycle, refund visibility and receipts, through Phase 5’s existing `PaymentSheet`. **No second payment implementation was created** — §27 forbids it and this phase adds a provider-neutral state machine over the existing client rather than a parallel one. What the UI cannot do is collect a card, because there is no gateway session to present; it renders the deployment’s real `supportedMethods` from `/financial/capabilities` and, where an instrument is required, explains that this build has no gateway session and names this gap.',
    coverage: 'partial',
    existingBackendCapability: [
      '`POST /financial/payment-intents`, `/authorize`, `/capture`, `/cancel`, `/refunds` — all real, all wrapped in `lib/financial-api.ts`.',
      '`GET /financial/capabilities` returns the live `gateways` and `supportedMethods`, so the client never hardcodes a provider (§25).',
      '`GET /financial/payment-intents/{id}` is the authoritative status and is what every success screen reads.',
    ],
    missingBackendCapability: [
      'A gateway client session/secret scoped to one intent, for the provider SDK',
      'A saved payment-method list',
      'A gateway-hosted redirect URL as a documented alternative for deployments with no SDK',
    ],
    requiredContracts: [
      {
        endpoint: 'POST /financial/payment-intents/{id}/session',
        method: 'POST',
        request: 'returnUrl: string — this app’s deep link, validated server-side against an allow-list',
        response:
          '{ data: { gateway: string, sessionKind: "sdk"|"hostedRedirect", clientSecret?: string, redirectUrl?: string, expiresAt } } — the client secret is intent-scoped, short-lived, and confers nothing beyond completing this one payment',
        authentication: 'Bearer.',
        authorization: 'Self only, and only for an intent the caller owns (§47).',
        permission: 'financial.payments.write',
        idempotency:
          'Requesting a session twice for one intent must return the same session while it is valid, never a second one. Two live sessions on one intent is a double-charge waiting for a slow network.',
      },
    ],
    tokenLifecycle:
      'An intent-scoped client secret, valid for minutes, usable once, and useless for anything but completing that intent. It is held in component state for the duration of the sheet and is never persisted, never logged and never placed in a query string.',
    webhookRequirements:
      'The gateway’s webhook is what makes a payment authoritative — §30. The client must treat its own return from the payment sheet as *nothing more than a prompt to re-read the status*, and the platform already enforces this: `financial-api.ts` classifies every write as `mutating`, so a transport failure is indeterminate rather than failed.',
    syncBehaviour: 'None. Payment state is polled from the authoritative record, never assumed.',
    errorModel:
      'The full §29 set is already available from `lib/financial-errors.ts`, which maps B15’s seventy-odd codes and carries `isRetryable`, `isTerminal` and `isIndeterminate`. This phase normalises them into the `IntegrationErrorKind` vocabulary and adds nothing new — reusing a working error model rather than building a second one.',
    retryBehaviour:
      '§33: never blindly retry a payment. A session request is retryable because it creates no charge; an authorization is not. The existing `lib/idempotency.ts` supplies the key discipline for anything that could double-charge.',
    caching: 'Never cached. A payment session is single-use by design.',
    securityRequirements: `${NO_TOKEN_IN_LOGS} No card data ever reaches Diaspora — the instrument is collected by the gateway’s own SDK, which is why the platform cannot store or log one. The client must never treat its own return from the sheet as success (§26): only an authoritative read of the intent may draw a success screen. \`returnUrl\` must be validated server-side; an attacker-supplied return URL on a payment flow is a redirect to a convincing fake receipt.`,
    privacyRequirements:
      'No instrument detail is stored or displayed beyond what the gateway returns for display — last four digits and a brand. No payment event carries an amount, a currency or an instrument (§55).',
    owner: 'B15-financial',
    priority: 'high',
    recommendedPhase: 'B15.1 Financial — gateway sessions',
  },

  paymentNextAction: {
    id: 'FRONTEND-PHASE16-GAP-014',
    key: 'paymentNextAction',
    domain: 'payments',
    provider: 'payments.platform',
    capability: 'A structured `nextAction`, so a 3-D Secure or mobile-money challenge can be routed rather than guessed',
    capabilityKeys: ['payments.confirm'],
    feature: '§26 Payment Providers · §29 Payment Error UX · §40 Deep Linking',
    screens: ['/wallet/payments/[id]', '/wallet/add-money'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The challenge UX is complete for all four kinds §26 implies — redirect, 3-D Secure, mobile-money prompt and manual transfer — plus an `unknown` branch. Because B15 returns `nextAction` as an opaque `string | null` (`types/financial.ts:218`), the client parses it best-effort and falls back to `unknown`, which tells the member to complete the step in the provider’s own surface and offers a status refresh. It never invents a challenge it cannot render.',
    coverage: 'partial',
    existingBackendCapability: [
      '`PaymentIntent.nextAction?: string | null` exists on the wire. The field is there; only its structure is missing.',
    ],
    missingBackendCapability: [
      'A discriminated `nextAction` object with a kind, a URL or instruction, and a return URL',
      'A documented set of kinds, so a client can be exhaustive rather than defensive',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /financial/payment-intents/{id}',
        method: 'GET',
        request: 'None. This is a change to an existing response, not a new route.',
        response:
          'nextAction: { kind: "redirect"|"threeDSecure"|"mobileMoneyPrompt"|"manualTransfer", url?, instruction?, returnUrl?, expiresAt? } | null',
        authentication: 'Bearer.',
        authorization: 'Self only (§47).',
        idempotency: null,
      },
    ],
    tokenLifecycle: 'A challenge URL is single-use and short-lived. It is never persisted and never logged.',
    webhookRequirements:
      'Completing a challenge does not complete the payment — the gateway’s webhook does. The client returns from the challenge into a `pending` state and reads the authoritative status (§30).',
    syncBehaviour: 'None.',
    errorModel: 'ExpiredCredential for a stale challenge, Conflict when the intent moved on while the member was away.',
    retryBehaviour: 'A challenge is presented once. Re-presenting an expired one produces a provider error; the client requests a fresh intent instead.',
    caching: 'Never cached.',
    securityRequirements:
      'The challenge URL must be an HTTPS URL on an allow-listed gateway domain. Opening an arbitrary server-supplied URL from a payment flow is the highest-value phishing surface the app has, and the client validates the scheme and host before opening.',
    privacyRequirements: 'No member identifier in the challenge URL or the return URL query string.',
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B15.1 Financial — gateway sessions',
  },

  paymentMethodRegistry: {
    id: 'FRONTEND-PHASE16-GAP-015',
    key: 'paymentMethodRegistry',
    domain: 'payments',
    provider: 'payments.platform',
    capability: 'Saved payment methods — listing, choosing a default, and removing',
    capabilityKeys: ['payments.methods'],
    feature: '§26 Payment Providers · §50 Integration Settings',
    screens: ['/settings/integrations/payments', '/wallet/index'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The payment-methods surface is complete: the deployment’s real supported method kinds from `/financial/capabilities`, a chooser, a default, and removal with confirmation. With no registry the list is empty in production and the screen says the deployment stores no saved methods — which is the truth, and is materially different from "you have not added one".',
    coverage: 'none',
    existingBackendCapability: [
      '`FinancialCapabilities.supportedMethods` names the *kinds* a deployment accepts. That is real and is rendered.',
    ],
    missingBackendCapability: ['Any per-member saved instrument list'],
    requiredContracts: [
      {
        endpoint: 'GET /financial/payment-methods',
        method: 'GET',
        request: 'None.',
        response:
          '{ data: { id, kind, brand?, last4?, expiryMonth?, expiryYear?, isDefault, addedAt }[] } — display fields only; no PAN, no token',
        authentication: 'Bearer.',
        authorization: 'Self only (§47).',
        idempotency: null,
      },
      {
        endpoint: 'DELETE /financial/payment-methods/{id}',
        method: 'DELETE',
        request: 'None.',
        response: '{ data: { deleted: true } }',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: 'Idempotent.',
      },
    ],
    tokenLifecycle: 'The gateway holds the instrument. Diaspora holds an opaque reference and display fields, never a PAN.',
    webhookRequirements: 'Card-expiry and account-updater events from the gateway keep the list honest.',
    syncBehaviour: 'None.',
    errorModel: 'BackendUnavailable, NetworkFailure, Conflict when removing a method an active subscription depends on.',
    retryBehaviour: 'Reads are safe. Removal is idempotent and therefore also safe.',
    caching: 'Query key `["financial","payment-methods"]`, staleTime 1 minute, invalidated on any payment completion.',
    securityRequirements: `${NO_TOKEN_IN_LOGS} §28: no raw card data is stored anywhere in the client, and there is no field in the domain model that could hold one.`,
    privacyRequirements: 'Only the owner sees their methods. Never in an analytics event.',
    owner: 'B15-financial',
    priority: 'low',
    recommendedPhase: 'B15.1 Financial — gateway sessions',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PUSH — §14 · §15 · §16 · §44 · §45
  // ═══════════════════════════════════════════════════════════════════════════

  pushDeviceIdentity: {
    id: 'FRONTEND-PHASE16-GAP-016',
    key: 'pushDeviceIdentity',
    domain: 'push',
    provider: null,
    capability: 'Knowing which registered device is *this* one, so a member can name and remove devices safely',
    capabilityKeys: ['push.deviceRegistry'],
    feature: '§14 Push Notifications · §44 Push Token Isolation · §45 Multi-Device',
    screens: ['/settings/integrations/push'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The device list is real — it reads B13’s `GET /notifications/devices` and renders platform, friendly name, registration time, last delivery and suppression reason for each. Registration and removal are real. The current device is identified by matching the `deviceIdentifier` this client generated, which works but is client-derived, so the "this device" marker is rendered as a best guess where the identifier is missing rather than asserted.',
    coverage: 'partial',
    existingBackendCapability: [
      '`GET /notifications/devices`, `PUT /notifications/devices` (idempotent on the token) and `DELETE /notifications/devices/{id}` are all real and already wrapped in `lib/notifications-api.ts`. Registration, refresh and removal need no new contract.',
      '`NotificationDevice` already carries `hasToken`, `isActive`, `suppressionReason`, `lastDeliveredAt`.',
    ],
    missingBackendCapability: [
      'An `isCurrentDevice` flag on the device list, so the UI does not have to infer it',
      'A "deactivate all other devices" operation for the sign-out-everywhere case',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /notifications/devices',
        method: 'GET',
        request: 'None. A change to an existing response, not a new route.',
        response: 'Add `isCurrentDevice: boolean`, derived server-side from the calling session.',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
    tokenLifecycle:
      'The push token goes from the OS to `PUT /notifications/devices` and is never held in application state, never persisted and never logged. `PushRegistration` stores a non-reversible fingerprint only, which answers "is this the same token as last time" and nothing else. On sign-out the device is deactivated via `DELETE` **before** the session is cleared, because the call needs the token that is about to be discarded.',
    webhookRequirements:
      'FCM and APNs both report unregistered tokens. B13 already models this as `suppressionReason`; consuming the provider feedback is what keeps it populated.',
    syncBehaviour: 'None.',
    errorModel: 'PermissionDenied, ProviderUnavailable, BackendUnavailable, NetworkFailure.',
    retryBehaviour:
      'Registration is idempotent on the token — B13 documents this explicitly — so retrying is safe and cannot produce duplicate deliveries. Deactivation on sign-out is fire-and-forget with a bounded retry, and must never block signing out.',
    caching: 'Query key `["notifications","devices"]` — B13’s existing key. No second cache.',
    securityRequirements: `${USER_SCOPED} §44 is the rule that matters: a token registered for member A must be deactivated before member B’s session begins, or A’s notifications reach B’s phone. This is enforced in the sign-out path and asserted by \`integration-account-switching.test.ts\`.`,
    privacyRequirements:
      'A device list is a record of a member’s hardware. Visible only to them, never in an analytics event, and the friendly name defaults to a model name rather than anything personal.',
    partiallyCoveredBy: 'B13 device registry — registration, refresh and removal already exist and are used unchanged.',
    owner: 'B13-notifications',
    priority: 'low',
    recommendedPhase: 'B13.3 Notification Preferences — device identity',
  },

  integrationNotificationTemplates: {
    id: 'FRONTEND-PHASE16-GAP-017',
    key: 'integrationNotificationTemplates',
    domain: 'push',
    provider: null,
    capability: 'Notification templates for integration events — a grant expiring, a sync failing, a device suppressed',
    capabilityKeys: ['push.preferences'],
    feature: '§14 Push Notifications · §41 Account Disconnect · §49 Deep Link Routing',
    screens: ['/settings/integrations', '/settings/notifications'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      'The client half is complete: `lib/notification-routes.ts` is **extended** with an `integrations.*` routing table — not replaced and not duplicated, following the Phase 12 and Phase 13 tables already in that file — and `/settings` is already a resolvable prefix, so any integration notification lands correctly the day the templates exist. An unroutable type still falls back to the inbox, which is the correct degradation.',
    coverage: 'none',
    existingBackendCapability: [
      'B13’s template and category system is real. It emits no `integrations.*` type yet, exactly as it emitted no `creator.*` type when Phase 7 shipped.',
    ],
    missingBackendCapability: [
      'An `integrations` notification category',
      'Templates for: grant expiring, grant expired, sync failed, device suppressed, new sign-in method linked',
    ],
    requiredContracts: [
      {
        endpoint: 'GET /notifications/categories',
        method: 'GET',
        request: 'None. A seeded category, not a new route.',
        response: 'Add an `integrations` category with `ownerModule: "integration-platform"`.',
        authentication: 'Bearer.',
        authorization: 'Self only.',
        idempotency: null,
      },
    ],
    tokenLifecycle:
      'No credential of any kind. A notification template carries no token, and a deep link from a notification carries no authorization — the route is resolved against the member’s existing session, so a notification that arrives after sign-out lands on the sign-in screen rather than on somebody else’s data.',
    webhookRequirements: 'None on the client side.',
    syncBehaviour: 'None.',
    errorModel:
      'An unroutable notification type falls back to the inbox rather than erroring — `followNotificationRoute` refuses a route this build cannot render, which is the correct degradation when a deployment is ahead of the app in the store.',
    retryBehaviour: 'None.',
    caching: 'Shares B13’s existing category cache.',
    securityRequirements:
      'A "new sign-in method linked" notification is a security notification and must be in the mandatory set B13 already models — a member must not be able to switch off the alert that tells them somebody attached an account to theirs.',
    privacyRequirements: 'The notification body must not contain the linked account’s address in a lock-screen preview.',
    partiallyCoveredBy: 'B13 notification delivery — the transport exists; only the templates are missing.',
    owner: 'B13-notifications',
    priority: 'medium',
    recommendedPhase: 'B13.3 Notification Preferences — integration templates',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-CUTTING — §55 · §56
  // ═══════════════════════════════════════════════════════════════════════════

  integrationTelemetry: {
    id: 'FRONTEND-PHASE16-GAP-018',
    key: 'integrationTelemetry',
    domain: 'maps',
    provider: null,
    capability: 'An ingestion endpoint for the integration events §55 asks to be tracked',
    capabilityKeys: [],
    feature: '§55 Integration Analytics · §56 Integration Observability',
    screens: ['every integration surface'],
    frontendStatus: 'IMPLEMENTED + DEVELOPMENT ADAPTER',
    frontendBehaviour:
      '§55’s event vocabulary is implemented in `lib/integrations/events.ts` with a typed emitter per event and a property allow-list extension. It emits into the **existing** ring buffer in `lib/creator-analytics.ts` — the fifth phase to extend it and still one buffer, because §55’s "do not create duplicate tracking systems" applies to systems, and a sixth would be one. The buffer has no transport, so events are counted and dropped.',
    coverage: 'none',
    existingBackendCapability: ['None. There is no event ingestion endpoint anywhere.'],
    missingBackendCapability: ['A batched event ingestion endpoint'],
    requiredContracts: [
      {
        endpoint: 'POST /analytics/events',
        method: 'POST',
        request: 'events: { name, occurredAt, properties }[] — batched, capped, with a client-generated batch id',
        response: '{ data: { accepted: number, rejected: number } }',
        authentication: 'Bearer.',
        authorization: 'Self only. A client cannot emit an event attributed to another member.',
        idempotency: 'The batch id makes a retry safe. Without it a flaky connection doubles every metric.',
      },
    ],
    tokenLifecycle:
      'No credential is transmitted and none may be. The allow-list has no key capable of holding an access token, a refresh token, a push token or a payment instrument, so an event cannot carry one even by accident — which is the point, because a telemetry stream is governed by a different retention policy and read by a wider set of services than the screen that produced it.',
    webhookRequirements: 'None.',
    syncBehaviour: 'None.',
    errorModel: 'Telemetry failure is silent by design. An analytics outage must never surface to a member.',
    retryBehaviour: 'Bounded retry with backoff, then drop. Telemetry is never worth a retry loop.',
    caching: 'None.',
    securityRequirements: `${NO_TOKEN_IN_LOGS} The allow-list drops any property not explicitly registered, so a new event cannot accidentally carry a token, an address or a calendar title. This is enforcement rather than intention — it is asserted in \`integration-boundary.test.ts\`.`,
    privacyRequirements:
      '§55’s prohibitions are implemented as an allow-list rather than a deny-list: no access token, no refresh token, no payment credential, no message content, no precise location, no email address, no phone number, no calendar title, no account label. Only the provider, the capability, the outcome and an error *category* are recorded.',
    partiallyCoveredBy:
      'FRONTEND-PHASE15-GAP-029 and CREATOR-GAP-016 are the same missing endpoint at a different scope. One backend ticket, not three.',
    owner: 'analytics-platform',
    priority: 'low',
    recommendedPhase: 'B19 Analytics Platform Foundation',
  },
};

/**
 * Whether this build may reach the simulated integration surfaces.
 *
 * Delegates to the single platform switch. Never its own — seven phases share
 * one answer to "is this build allowed to simulate", and an eighth would be an
 * eighth thing to get wrong.
 */
export function areIntegrationGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/** Look a gap up by key. Returns undefined for a key belonging to another phase. */
export function getIntegrationGap(key: string): IntegrationGap | undefined {
  return INTEGRATION_GAPS[key];
}

/** Every gap blocking a given provider, for the connection centre's honesty line. */
export function gapsForProvider(provider: IntegrationProviderId): IntegrationGap[] {
  return Object.values(INTEGRATION_GAPS).filter((gap) => gap.provider === provider);
}

/** Every gap in a domain, including the domain-wide ones with no single provider. */
export function gapsForDomain(domain: IntegrationDomain): IntegrationGap[] {
  return Object.values(INTEGRATION_GAPS).filter((gap) => gap.domain === domain);
}
