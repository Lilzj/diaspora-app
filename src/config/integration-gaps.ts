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
//   **SMS — half real.** `POST /auth/otp/start` and `/auth/otp/sign-in` are
//   called by the real login flow. What is missing is the state around them:
//   attempts remaining, lock-out, expiry (GAP-012).
//
//   Until Wave M-5 the two sentences above and below named otp/send and
//   otp/verify instead. Those paths have never existed on this platform, and
//   the login screen was written from this comment.
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
  /**
   * Whether the backend has since shipped this.
   *
   * The register is a historical record and entries are deliberately not deleted
   * when a gap closes — that is the whole point of the file. But a notice that
   * keeps rendering after the capability arrives tells members the platform
   * cannot do something it does, which is the one failure this pattern exists to
   * prevent, pointing the other way.
   *
   * `connected` means every declared endpoint is served, verified against the
   * deployment rather than assumed. The notice stops rendering; nothing else
   * changes. `partial` means some are, and the notice stays because the screen
   * still has a hole in it.
   */
  backendStatus?: 'connected' | 'partial';
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
    backendStatus: 'connected',
    key: 'connectionRegistry',
    domain: 'calendar',
    provider: null,
    capability:
      'An integration connection registry — the record of which external accounts a member has connected, in which states, with which scopes',
    capabilityKeys: [],
    feature: '§3 Integration Architecture · §5 Connection Centre · §31 Status Model',
    screens: ['/settings/integrations', '/settings/integrations/[provider]'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The complete connection centre is built: every integration in the catalogue is listed with its status, mode, capabilities, permissions, last sync, last error and privacy summary, in all thirteen §31 states. The list and the disconnect are now read from the platform — `hooks/integrations.ts` calls `lib/integrations/certified-client.ts` — so a row renders the *deployment’s* state rather than an adapter’s guess at it. Connect still stops before opening a browser, and now for a narrower and more accurate reason: the contract exists, and this build cannot satisfy its `state` precondition. See GAP-002.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-05). `Diaspora.Modules.Integrations` serves the registry: `GET /api/v1/integrations/connections` (optionally narrowed by `domain`) and `DELETE /api/v1/integrations/connections/{provider}`. The delete is idempotent by contract — a second call answers 200 with the same body rather than 404 — which is what makes the optimistic §41 disconnect safe to leave in place across a retry.',
      'The sentence this entry used to close with — "Nothing else in the certified surface records an external account connection." — was true when written and had stopped being true without anybody re-reading it. It is kept here rather than deleted because a register entry is a claim with a date on it, and this file was the second-worst instance of that in the repository.',
      'Two details the declaration below did not have, both found by reading `IntegrationsEndpointContributor.cs` rather than by re-reading the register. The list route answers a **bare array** inside the envelope (`{ data: [...] }`) from an `IReadOnlyList<T>` query handler, not a page — so there is no `items` row property and no cursor to look for. And the delete answers an `IntegrationDisconnectResult`, not the updated connection this entry’s declaration describes; nothing reads it as one.',
      'B13 has a device registry at `GET/PUT/DELETE /notifications/devices`, which is a connection registry for exactly one integration and is reused rather than duplicated.',
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The complete authorization lifecycle is built: consent explanation (§37) before anything opens, PKCE challenge generation, the provider hand-off, the deep-link return, cancellation, denial, expiry and the "account already linked to another member" conflict. The flow still stops before opening a browser, and the reason has narrowed from "the endpoint does not exist" to something exact: the server issues the `state` at `/oauth/{provider}/authorize` and matches the exchange against it by hash, and this build generates its state locally *after* the browser opens. So it reads `GET /capabilities` first and renders the deployment’s own refusal where there is one, then refuses on its own behalf — which is still a refusal, but is now the client’s half of the problem rather than the platform’s.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED as a contract (Remediation Wave C-05), not yet as a member-facing flow. `Diaspora.Modules.Integrations` serves `POST /api/v1/integrations/oauth/{provider}/authorize`, `/exchange` and `/revoke`. The sentence this entry used to open with — "No OAuth exists anywhere in the certified backend. The frontend audit found zero occurrences of the term." — was true when written and had stopped being true without anybody re-reading it.',
      'The declaration below is wrong in two ways that only reading the module could show. **There is no `session`.** `ExchangeAuthorizationCommand` returns `IntegrationConnectionResponse` — the same connection row the list route returns — and the response DTO has no field capable of holding a token. **And `intent: "signIn"` is refused at both ends**, with 400 `integrations.oauth.intent-unsupported`, at authorize *and* at exchange. That is a design decision rather than an unbuilt feature: minting a platform session from an external assertion is Identity’s call.',
      'A third field the declaration never had, and the one that actually blocks the flow: `state`. The exchange looks the attempt up by state hash, so a state the server never issued matches no row. `POST /api/v1/integrations/oauth/{provider}/authorize` is the only way to hold one, and this entry’s `requiredContracts` still does not name that route — it is listed under `missingBackendCapability` below as the client-side work it now is.',
      'Phone OTP remains the only authentication contract, and this sentence named the wrong two routes for it until Wave M-5. The platform serves `/auth/otp/start` and `/auth/otp/sign-in` (Identity `AuthController.cs:158`, `:183`). The paths written here before — `otp/send` and `otp/verify` — have never been mapped by any module or controller, and the release built from this sentence 404’d on every sign-in. The real routes are named here without verb-and-path syntax on purpose: they are MVC controller routes, and the drift check reads an inventory of mapped *module* endpoints, so quoting a true statement in route form would fail a check that cannot see it.',
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
    backendStatus: 'connected',
    key: 'googleCalendarList',
    domain: 'calendar',
    provider: 'calendar.google',
    capability: 'Listing the calendars a connected Google account holds, so the member can choose one',
    capabilityKeys: ['calendar.list'],
    feature: '§6 Google Calendar · §8 Calendar Sync Settings',
    screens: ['/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The calendar picker is complete — primary marked, read-only calendars disabled with the reason shown, colours rendered, and a default selection persisted. The device calendar provider fills it from the OS where the native module is present; the Google provider now fills it from `GET /api/v1/integrations/calendar/{provider}/calendars` through `lib/integrations/providers/remote-calendar.ts`. On a stock deployment that route answers 400 `integrations.provider.not-configured`, which the picker renders as ConfigurationMissing — the deployment’s own answer, and one that becomes a list of real calendars the day an operator contracts an adapter, without this client changing.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-05). `GET /api/v1/integrations/calendar/{provider}/calendars` is served, and the sentence this entry used to carry — "None. No calendar contract of any kind exists." — was true when written and had stopped being true without anybody re-reading it. The response is a bare `CalendarRefResponse[]` inside the envelope, carrying exactly the fields declared below including a real `allowsModifications`.',
      'The proxy exists for the reason this entry’s `tokenLifecycle` already gave, and the module states it in the same words: a device that could list calendars directly would be a device holding a Google access token.',
    ],
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
    backendStatus: 'connected',
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The Add-to-Calendar sheet is complete and shared by every event surface — §7 forbids duplicating calendar logic per screen and there is exactly one implementation. It offers whichever providers are actually available, converts a Diaspora event to a draft preserving the event’s own timezone (§62), handles the duplicate-export conflict per the member’s setting, and reports partial success honestly. The device provider writes for real where the native module is present; the Google provider now writes through `POST`/`PUT`/`DELETE /api/v1/integrations/calendar/{provider}/events`, and answers the deployment’s own `not-configured` refusal where there is no adapter.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-05). The event write proxy is served, all under `/api/v1/integrations/calendar/{provider}`: `POST /api/v1/integrations/calendar/{provider}/events`, `PUT /api/v1/integrations/calendar/{provider}/events/{externalEventId}`, `DELETE /api/v1/integrations/calendar/{provider}/events/{externalEventId}`, and a lookup at `GET /api/v1/integrations/calendar/{provider}/events/lookup` this entry never asked for. The link record this entry lists as missing exists too — the server keys it on the idempotency key and answers a replay with `wasDeduplicated: true` without calling the provider at all.',
      '**The delete response declared below is wrong, and wrong in the direction that breaks silently.** `DeleteCalendarEventCommand` is a value-less `ICommand`, so the non-generic `PlatformResults.Ok` overload writes `{ "data": null }`. There is no `deleted` boolean. A client reading `.deleted` gets `undefined` and renders a successful delete as a failure — which is exactly the class of bug this remediation exists to find, and it was declared rather than observed. `certified-client.ts` returns `void` for this call and reads nothing.',
      'Two more the declaration did not have. The `Idempotency-Key` is a **header**, read by `IdempotencyHeader.From(context)`, and it is mandatory — a blank one is a 400 before any provider is touched. That is the *opposite* discipline to Automation, which requires the key in the body and reads no headers at all, so neither module generalises to the other. And the delete takes a `calendarId` **query** parameter, not "None."',
      'Events, occurrences and series exist and carry real start/end times and timezones — `types/community-life.ts` and the B12 contract. The *source* data was always complete; it is now the export path that is complete too.',
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
    backendStatus: 'connected',
    key: 'calendarTwoWaySync',
    domain: 'calendar',
    provider: 'calendar.google',
    capability: 'Two-way synchronisation between Diaspora events and an external calendar, including change notification',
    capabilityKeys: ['calendar.sync.twoWay', 'calendar.event.import'],
    feature: '§6 Google Calendar · §8 Calendar Sync Settings · §35 Sync State',
    screens: ['/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The sync surface is complete: enable/disable, frequency, conflict behaviour, a manual "Sync now", and the full §35 state set — never synced, syncing, synced, partial with the failure reasons listed, and failed. `useCalendarSync` in `hooks/integrations.ts` now drives it from the real routes and polls only while a run is actually in flight. The screen still states plainly that two-way sync is unavailable and that only export is — which is now the *server’s* position rather than this build’s, and §8 asks for exactly that difference to be visible.',
    coverage: 'none',
    existingBackendCapability: [
      'PARTIALLY RESOLVED (Remediation Wave C-05). The sentence this entry used to carry — "None." — was true when written and had stopped being true without anybody re-reading it. `POST /api/v1/integrations/calendar/{provider}/sync` and `GET …/sync/status` are both served, both under `integrations.calendar.sync`, and both behave as the declarations below describe: a run already going for the same (member, calendar) is returned rather than duplicated, and a member who has never synced gets `phase: "never"` rather than a zeroed `synced`.',
      '**The half named in this entry’s title is still genuinely missing, and is now missing out loud.** `direction: "import"` and `"both"` are refused on every deployment with 400 `integrations.calendar.sync.direction-unsupported`, because no adapter declares `ImportEvents`. That refusal is a deliberate design position rather than an unbuilt feature — the module’s reasoning is that a member who asked for "both" and received an export would believe their calendar had been read into Diaspora, which is a consent claim rather than a feature claim. So the export half is connected and the import half is a documented server-side refusal; the three items below remain outstanding.',
      'One detail the declaration did not have: `phase` is **lowercase** — `never`, `syncing`, `synced`, `partial`, `failed` — while `status` and `mode` on a connection row are SCREAMING_SNAKE and `lastError.kind` is PascalCase. Three casings in one module, none of them an enum on the wire; every one is a hand-mapped string.',
    ],
    missingBackendCapability: [
      'A synchronisation engine with a change cursor',
      'A Google watch channel, and the endpoint that receives its notifications',
      'A documented conflict resolution rule the client can describe to a member',
      'An adapter declaring `ImportEvents`, without which `direction` can only ever be `export`',
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
    backendStatus: 'connected',
    key: 'calendarSettings',
    domain: 'calendar',
    provider: null,
    capability: 'Server-side persistence of calendar sync settings, so they survive a reinstall and match across devices',
    capabilityKeys: [],
    feature: '§8 Calendar Sync Settings · §45 Multi-Device',
    screens: ['/settings/integrations/calendar'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'Every setting in §8 is implemented and takes effect immediately, and is now stored by the platform: `useCalendarSettings` reads and writes `/api/v1/integrations/calendar/settings`. The screen’s "not saved to your account" caveat is no longer true — `isPersisted` is hard-coded true and kept as a field so the screen still compiles while the caveat is taken out.',
    coverage: 'none',
    existingBackendCapability: [
      'RESOLVED (Remediation Wave C-05). `GET` and `PUT /api/v1/integrations/calendar/settings` are served, and the sentence this entry used to carry — "Any storage for calendar preferences" as the sole missing capability — described something that already existed. These two are also the only routes in the module that need **no vendor adapter**: a preference is stored by the platform, so they work on a stock deployment where listing a calendar does not.',
      '**A trap the declaration could not have named.** Unknown values for the three vocabulary fields are *silently dropped, not rejected*: `IntegrationCalendarSettings` applies a value only `if (IsKnown(value))`, so a bad `syncFrequency` returns **200 with the old value** and a client that trusted its own request would render a setting the server never took. Worse, `timeZoneBehaviour` is matched **case-sensitively** against `eventTimeZone`/`deviceTimeZone` while `syncFrequency` and `conflictBehaviour` are matched case-insensitively. `types/integrations.ts` spells all three exactly as the server does, which is what keeps this from biting.',
      'B13 persists notification preferences server-side, which is the shape this contract copied rather than invented.',
    ],
    missingBackendCapability: [
      // The storage this entry was opened for exists. What does not exist is a
      // *refusal*, and it is a real residual rather than a technicality: an
      // unknown value for `syncFrequency`, `timeZoneBehaviour` or
      // `conflictBehaviour` is dropped and the route answers 200 with the
      // previous value. A client cannot tell that from a successful write, so
      // the member sees the setting they chose until the next refetch quietly
      // replaces it with the one the server kept.
      'A 400 for an unknown `syncFrequency`, `timeZoneBehaviour` or `conflictBehaviour`, instead of the current silent drop — a rejected write is recoverable and a silently ignored one is not',
    ],
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
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      'The linked-accounts surface is complete: primary method marked, each provider’s link state and last use shown, link and unlink wired, and §24’s lock-out rule enforced in the UI — the unlink control for a member’s only remaining method is disabled with the reason rendered beside it rather than hidden. The rule is computed over the whole set in `lib/integrations/identity/linking.ts`, never per row. The list and the unlink now come from the platform, and the server enforces the same rule independently.',
    coverage: 'none',
    existingBackendCapability: [
      '**RESOLVED, and this entry was wrong about *where* rather than merely out of date (Remediation Wave C-05).** It asked for `/auth/identities`. That path has never existed and does not exist now. The capability is real and lives at `GET /api/v1/integrations/identities` and `DELETE /api/v1/integrations/identities/{provider}` — so the declaration was simultaneously stale *and* misfiled, which is a combination the drift check cannot see: it compares declared paths against served ones, and a declaration pointing at a path nobody serves is indistinguishable from a capability nobody built.',
      'The sentence this entry used to carry — "Phone is the only authentication method … There is no notion of a second method to link." — was true when written. Phone is still the only method a stock deployment can *offer*, but the notion is fully modelled: the list always contains a synthetic `identity.phone` row with `isPrimary: true` and `canUnlink: false`.',
      'The last-method rule is server-side, as this entry asked. Unlinking `identity.phone` is a **409 `integrations.identity.last-method`**, not a 200 with an unchanged list — the module’s position being that a silent no-op is not a refusal. And the unlink answers the full refreshed `IdentityLinkResponse[]`, exactly as declared, so the client re-renders from truth rather than from its own optimistic guess.',
      '`reauthToken` is **accepted and deliberately not trusted**: the server proves recency from the `auth_time`/`iat` claims on the bearer token itself (≤ 5 minutes) rather than from anything the client supplies. The declaration below describes it as "proof of a recent reauthentication", which it is not — it is a hint, and the proof is server-side.',
    ],
    missingBackendCapability: [
      'A second authentication method a stock deployment can actually offer — the list, the rule and the unlink all exist, but with no configured OAuth adapter `identity.phone` is the only row',
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
    backendStatus: 'connected',
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
    backendStatus: 'connected',
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
      '`/auth/otp/start` begins a passwordless sign-in and `/auth/otp/sign-in` redeems the code. Both are real, both are what `lib/auth-api.ts` calls, and both are Identity controller routes rather than mapped module endpoints — which is why they are named here without verb-and-path syntax.',
      'Until Wave M-5 this entry vouched for two other paths — otp/send and otp/verify, written in POST-and-path form — and called them real. Neither has ever existed. They are named here in plain text rather than as quoted routes because this file’s drift check reads every backticked route token in these sentences and cannot distinguish a claim from a record of a withdrawn one; quoting the retraction would re-file the claim. This is the register sentence the login screen was written from, it was repeated in three entries of this file, and Wave A found the result: every sign-in attempt 404’d. Kept as the record, because a register that quietly corrects itself teaches nobody why it was believed.',
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
        // The route exists — this is a contract for the *response metadata* it
        // does not yet carry, not for the route itself. It was declared under
        // the path `otp/send` until Wave M-5, which is a route nothing has ever
        // mapped: a gap register asking a backend team to build a contract at an
        // address the backend already serves under a different name.
        endpoint: 'POST /auth/otp/start',
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
        // As above: the route is real (`AuthController.cs:183`). What is
        // declared here is the failure detail its response omits — attempts
        // remaining, lock-out — without which the client cannot tell a wrong
        // code from an expired one from a locked account.
        endpoint: 'POST /auth/otp/sign-in',
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
    backendStatus: 'connected',
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
    backendStatus: 'connected',
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
    backendStatus: 'connected',
    key: 'integrationNotificationTemplates',
    domain: 'push',
    provider: null,
    capability: 'Notification templates for integration events — a grant expiring, a sync failing, a device suppressed',
    capabilityKeys: ['push.preferences'],
    feature: '§14 Push Notifications · §41 Account Disconnect · §49 Deep Link Routing',
    screens: ['/settings/integrations', '/settings/notifications'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      'The client half is complete: `lib/notification-routes.ts` is **extended** with an `integrations.*` routing table — not replaced and not duplicated, following the Phase 12 and Phase 13 tables already in that file — and `/settings` is already a resolvable prefix, so any integration notification lands correctly the day the templates exist. An unroutable type still falls back to the inbox, which is the correct degradation.',
    coverage: 'none',
    existingBackendCapability: [
      '**PARTLY RESOLVED (Remediation Wave C-06), and the route was already consumed.** The contract declared below is not a new route — the entry says so itself: "A seeded category, not a new route." `notifications-api.ts:169` reads it and `app/settings/notifications.tsx:65` renders it, and has since B13. This entry was baselined as stale on the assumption that nothing called the route; checking first is what this wave did rather than writing a second client for a route that already had one.',
      'PARTIAL, not CONNECTED, and the distinction is the whole entry. What is asked for is **data on an existing route**, not the route: an `integrations` category with `ownerModule: "integration-platform"`, and the five templates below. Marking this CONNECTED because the transport is connected would say the notifications exist, which they do not.',
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
    // ── Closed. See FRONTEND-PHASE15-GAP-029 (`telemetryIngestion`). ──────────
    //
    // This entry asked for `POST /analytics/events`. The route exists and is
    // called: it is `POST /api/v1/telemetry/events`, the analytics module has
    // named that destination since Phase 7, and it takes the batched
    // `TelemetryBatchRequest { events[] }` shape this entry described.
    // `lib/telemetry-api.ts` posts to it and `app/_layout.tsx` starts the
    // sixty-second flush on sign-in. Verified against the deployment on
    // 10 Sep 2026: **202 Accepted**.
    //
    // **What is still true, and belongs to GAP-029 rather than here.** The
    // server registry accepts seven client-submittable names and this app
    // emits four of them — the automation ones. Every other name across the
    // five client vocabularies is refused *locally*, before the network, as
    // `analytics.ingest.event-unknown`. That refusal is the design: the other
    // names are server-produced facts and §41 forbids a client incrementing
    // one. It is not a missing transport, which is what this entry was about.
    //
    // Marked connected rather than deleted: the register is a historical
    // record, and it should show that four entries named one dependency and
    // only one of them was re-read.
    backendStatus: 'connected',
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
