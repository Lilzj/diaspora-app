// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `integration-gaps.ts`, derived by
// `node scripts/generate-production-registers.js`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// `metro.config.js` and `scripts/production-stubs.js`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
//   existingBackendCapability — community/gaps only
//   frontendBehaviour — analytics/gaps, community/gaps, creator/gaps, map/diagnostics
//   existingSeams — creator/gaps only
//   whyNotImplementable — analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection
//   privacyConsiderations — analytics/gaps, community/gaps
//   securityConsiderations — analytics/gaps, community/gaps
//   caching — community/gaps only
//   integrationWork — map/diagnostics only
//   considerations — no reader outside the registers
//   requiredContracts — analytics/gaps, community/gaps — and emptying it takes the nested request, response, authorization, idempotency, aggregation and retryBehaviour shapes with it
//   currentBehaviour — map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS
//   missingBackendCapability — analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS and MULTI_COMMUNITY_GAPS
//
// Edit the source. `production-registers-drift.test.ts` fails if this file
// stops matching what this script would produce from it.

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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: BACKEND_MANAGED_OAUTH,
    webhookRequirements:
      'None for the registry itself. A provider-initiated revocation — a member removing Diaspora from their Google account settings — should mark the connection REAUTH_REQUIRED if the provider offers such a signal, so the connection centre stops claiming a grant that no longer exists.',
    syncBehaviour: 'None. This is connection state, not content.',
    errorModel: `${OAUTH_ERROR_MODEL} Plus BackendGap while this endpoint does not exist, which is what the client renders today.`,
    retryBehaviour:
      'The read is safe to retry with backoff. The disconnect is idempotent and therefore also safe, which is the reason the contract above requires it to be.',
    caching:
      '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: `${BACKEND_MANAGED_OAUTH} The authorization code exists on the device for the duration of one HTTP request and is not persisted, not logged, and not placed in navigation state that survives a reload.`,
    webhookRequirements:
      'Google and Apple both offer account-level revocation signals. Consuming them is what stops the connection centre showing CONNECTED for a grant the member removed from their Google account page a week ago.',
    syncBehaviour: 'None. This is credential custody.',
    errorModel: OAUTH_ERROR_MODEL,
    retryBehaviour: NO_AUTO_RETRY_SENSITIVE,
    caching: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: `${BACKEND_MANAGED_OAUTH} This route is the reason the proxy exists: a device that could list calendars directly would be a device holding a Google access token.`,
    webhookRequirements: 'None.',
    syncBehaviour: 'Read-only. Listing calendars is not synchronisation and the UI must not present it as one.',
    errorModel: `${OAUTH_ERROR_MODEL} ExpiredCredential here means the member revoked Diaspora at Google and the connection must move to REAUTH_REQUIRED rather than ERROR.`,
    retryBehaviour: 'Safe to retry with exponential backoff. Idempotent read.',
    caching:
      '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: BACKEND_MANAGED_OAUTH,
    webhookRequirements:
      'None for one-way export. An event the member then edits in Google diverges silently, and the UI must not claim otherwise — which is why export and two-way sync are separate settings (§8) and separate gaps.',
    syncBehaviour:
      'One-way export only. "Added to your calendar" is a claim about one write at one moment and is the only claim this contract supports. It must never be rendered as "synced".',
    errorModel: `${OAUTH_ERROR_MODEL} Plus Conflict when the event was already exported and the member’s conflict setting is "skip", and PermissionDenied when the chosen calendar is read-only.`,
    retryBehaviour:
      'Retry only with the idempotency key, and only on a network failure or 5xx. A 4xx is never retried. Without the key this write would be in §33’s "never blindly retry" list; with it, it is safe.',
    caching: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: `${BACKEND_MANAGED_OAUTH} A watch channel has its own expiry — Google’s maximum is days, not months — and renewing it is server-side work with no client involvement.`,
    webhookRequirements:
      'Google Calendar push notifications require a publicly reachable HTTPS endpoint with a verified domain, and channels expire and must be renewed. This is the single largest piece of infrastructure in this register. Until it exists the client must never render "synced" — §35 is explicit, and the client-side enforcement is that `lastSyncedAt` may only be set from a server response.',
    syncBehaviour:
      'Two-way. The conflict rule must be decided server-side and stated in the contract, because a client that guessed would produce different answers on two devices. Recommended: last-writer-wins on a per-field basis with Diaspora authoritative for events it owns, and the losing version preserved for a period so a wrong merge is recoverable.',
    errorModel: `${OAUTH_ERROR_MODEL} Plus Conflict for a divergent event, and a partial outcome that is neither success nor failure — which is why IntegrationSyncState has a \`partial\` phase rather than a boolean.`,
    retryBehaviour:
      'A sync is retryable because it is convergent, but only server-side and with backoff. The client offers a manual retry and never loops.',
    caching:
      '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: 'None. No credential is involved in a preference.',
    webhookRequirements: 'None.',
    syncBehaviour: 'None.',
    errorModel: 'BackendUnavailable, NetworkFailure, InvalidRequest, AuthenticationRequired.',
    retryBehaviour: 'Safe. A settings write is idempotent and retrying is harmless.',
    caching: '',
    securityRequirements: `${USER_SCOPED} A default calendar id is stored under a key that includes the member id, so a shared device cannot carry one member’s selection into another’s session.`,
    privacyRequirements:
      'The default calendar id is a weak identifier of a calendar whose title may be personal. It is stored, never logged, and cleared on sign-out along with the rest of the member-scoped integration state.',
    owner: 'integration-platform',
    priority: 'low',
    recommendedPhase: 'B20 Integration Platform Foundation',
  },

  // Identity linking (FRONTEND-PHASE16-GAP-007) was removed on 5 Oct 2026: email
  // and password is the only way to sign in, in the app and on the server.

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL AND SMS — §17 · §18
  // ═══════════════════════════════════════════════════════════════════════════

  emailVerification: {
    id: 'FRONTEND-PHASE16-GAP-008',
    // Partial since 5 Oct 2026: GET /auth/email and POST /auth/email/verification are
    // served (backend a83b13a) and the hook reads them in every build. PUT /auth/email
    // (change with the current password) is served since 20 Oct 2026 (backend 708ff70)
    // and `/profile/change-email` calls it. Bounce webhooks are still not wired, which
    // is the only reason this stays partial.
    backendStatus: 'partial',
    key: 'emailVerification',
    domain: 'email',
    provider: 'email.platform',
    capability: 'Email address verification, change and resend, with an observable verification state',
    capabilityKeys: ['email.verification', 'email.change'],
    feature: '§17 Email Integration',
    screens: ['/settings/integrations/email', '/profile/account-security'],
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    frontendBehaviour:
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'The verification link carries a single-use, short-lived, high-entropy token. It must expire in hours rather than days and must be invalidated by a subsequent change request.',
    webhookRequirements:
      'The email provider’s bounce and complaint webhooks feed `deliveryState`. Without them a member whose address is suppressed sees "verification sent" for ever and has no way to understand why nothing arrives.',
    syncBehaviour: 'None.',
    errorModel:
      'RateLimited with Retry-After for resend, Conflict for an address in use, InvalidRequest for a malformed address, ExpiredCredential for a stale verification link, AuthenticationRequired for a missing reauthentication.',
    retryBehaviour:
      'Resend is member-initiated only and gated by the server-supplied cooldown. Never automatic — an automatic resend loop is an email-bombing tool pointed at whatever address is on file.',
    caching: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'An unsubscribe link must work without a session — that is the point of it — so it carries a signed, single-purpose token scoped to one category. That token must not grant anything else.',
    webhookRequirements: 'Provider unsubscribe and complaint events must set `unsubscribedAt`.',
    syncBehaviour: 'None.',
    errorModel: 'BackendUnavailable, NetworkFailure, InvalidRequest.',
    retryBehaviour: 'Safe. Preference writes are idempotent assignments.',
    caching: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'The OTP is a short-lived shared secret. It must be single-use, expire in minutes, be invalidated on a successful verification, and never be logged or returned in any response.',
    webhookRequirements:
      'The SMS provider’s delivery receipt feeds `deliveryState`. Without it a member with a number that cannot receive SMS waits indefinitely with no explanation.',
    syncBehaviour: 'None.',
    errorModel:
      'InvalidRequest (wrong code), ExpiredCredential (expired code), RateLimited (resend too soon, or locked out, with Retry-After), ProviderUnavailable (carrier failure), NetworkFailure.',
    retryBehaviour:
      'Resend is member-initiated only, gated by the server cooldown where one is returned and by a conservative local default where it is not. Verification is never retried automatically — an automatic retry of a wrong code burns the member’s remaining attempts.',
    caching: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'An intent-scoped client secret, valid for minutes, usable once, and useless for anything but completing that intent. It is held in component state for the duration of the sheet and is never persisted, never logged and never placed in a query string.',
    webhookRequirements:
      'The gateway’s webhook is what makes a payment authoritative — §30. The client must treat its own return from the payment sheet as *nothing more than a prompt to re-read the status*, and the platform already enforces this: `financial-api.ts` classifies every write as `mutating`, so a transport failure is indeterminate rather than failed.',
    syncBehaviour: 'None. Payment state is polled from the authoritative record, never assumed.',
    errorModel:
      'The full §29 set is already available from `lib/financial-errors.ts`, which maps B15’s seventy-odd codes and carries `isRetryable`, `isTerminal` and `isIndeterminate`. This phase normalises them into the `IntegrationErrorKind` vocabulary and adds nothing new — reusing a working error model rather than building a second one.',
    retryBehaviour:
      '§33: never blindly retry a payment. A session request is retryable because it creates no charge; an authorization is not. The existing `lib/idempotency.ts` supplies the key discipline for anything that could double-charge.',
    caching: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: 'A challenge URL is single-use and short-lived. It is never persisted and never logged.',
    webhookRequirements:
      'Completing a challenge does not complete the payment — the gateway’s webhook does. The client returns from the challenge into a `pending` state and reads the authoritative status (§30).',
    syncBehaviour: 'None.',
    errorModel: 'ExpiredCredential for a stale challenge, Conflict when the intent moved on while the member was away.',
    retryBehaviour: 'A challenge is presented once. Re-presenting an expired one produces a provider error; the client requests a fresh intent instead.',
    caching: '',
    securityRequirements:
      'The challenge URL must be an HTTPS URL on an allow-listed gateway domain. Opening an arbitrary server-supplied URL from a payment flow is the highest-value phishing surface the app has, and the client validates the scheme and host before opening.',
    privacyRequirements: 'No member identifier in the challenge URL or the return URL query string.',
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B15.1 Financial — gateway sessions',
  },

  paymentMethodRegistry: {
    id: 'FRONTEND-PHASE16-GAP-015',
    backendStatus: 'connected',
    key: 'paymentMethodRegistry',
    domain: 'payments',
    provider: 'payments.platform',
    capability: 'Saved payment methods — listing, choosing a default, and removing',
    capabilityKeys: ['payments.methods'],
    feature: '§26 Payment Providers · §50 Integration Settings',
    screens: ['/settings/integrations/payments', '/wallet/index'],
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    frontendBehaviour:
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle: 'The gateway holds the instrument. Diaspora holds an opaque reference and display fields, never a PAN.',
    webhookRequirements: 'Card-expiry and account-updater events from the gateway keep the list honest.',
    syncBehaviour: 'None.',
    errorModel: 'BackendUnavailable, NetworkFailure, Conflict when removing a method an active subscription depends on.',
    retryBehaviour: 'Reads are safe. Removal is idempotent and therefore also safe.',
    caching: '',
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
      '',
    coverage: 'partial',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'The push token goes from the OS to `PUT /notifications/devices` and is never held in application state, never persisted and never logged. `PushRegistration` stores a non-reversible fingerprint only, which answers "is this the same token as last time" and nothing else. On sign-out the device is deactivated via `DELETE` **before** the session is cleared, because the call needs the token that is about to be discarded.',
    webhookRequirements:
      'FCM and APNs both report unregistered tokens. B13 already models this as `suppressionReason`; consuming the provider feedback is what keeps it populated.',
    syncBehaviour: 'None.',
    errorModel: 'PermissionDenied, ProviderUnavailable, BackendUnavailable, NetworkFailure.',
    retryBehaviour:
      'Registration is idempotent on the token — B13 documents this explicitly — so retrying is safe and cannot produce duplicate deliveries. Deactivation on sign-out is fire-and-forget with a bounded retry, and must never block signing out.',
    caching: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'No credential of any kind. A notification template carries no token, and a deep link from a notification carries no authorization — the route is resolved against the member’s existing session, so a notification that arrives after sign-out lands on the sign-in screen rather than on somebody else’s data.',
    webhookRequirements: 'None on the client side.',
    syncBehaviour: 'None.',
    errorModel:
      'An unroutable notification type falls back to the inbox rather than erroring — `followNotificationRoute` refuses a route this build cannot render, which is the correct degradation when a deployment is ahead of the app in the store.',
    retryBehaviour: 'None.',
    caching: '',
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
      '',
    coverage: 'none',
    existingBackendCapability: [],
    missingBackendCapability: [],
    requiredContracts: [],
    tokenLifecycle:
      'No credential is transmitted and none may be. The allow-list has no key capable of holding an access token, a refresh token, a push token or a payment instrument, so an event cannot carry one even by accident — which is the point, because a telemetry stream is governed by a different retention policy and read by a wider set of services than the screen that produced it.',
    webhookRequirements: 'None.',
    syncBehaviour: 'None.',
    errorModel: 'Telemetry failure is silent by design. An analytics outage must never surface to a member.',
    retryBehaviour: 'Bounded retry with backoff, then drop. Telemetry is never worth a retry loop.',
    caching: '',
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
