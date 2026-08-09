// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration domain model (Frontend Phase 16, §3 · §4 · §31 · §32)
//
// The vocabulary every integration in the application shares. Nine integrations
// were in scope for this phase and the audit found them in five different
// states — one fully built (maps), one with a real backend contract and no
// device half (push), two simulated inline inside a screen (SMS/OTP, identity),
// one real and complete (payments), and four that did not exist at all. A phase
// that let each of those keep its own vocabulary would produce nine status
// enums, and the connection centre §5 asks for could not be written.
//
// ── The separation this file exists to enforce (§3) ──────────────────────────
//
//   UI              a screen renders a capability's state
//   Capability      "put this event in a calendar" — the product's own words
//   Provider        Google, Apple, the device, the development adapter
//   Backend         what the platform's own API exposes
//   Device          what the operating system will let us do
//
// A screen names a **capability** and never a provider. `AddToCalendar` is a
// capability; `GoogleCalendarScreen` is the mistake §4 names explicitly. The
// provider is chosen by `lib/integrations/registry.ts`, which is the only
// module that knows which implementations exist.
//
// ── Two axes, deliberately not collapsed into one ────────────────────────────
//
// §31 asks for a connection status and §69 asks for a mode, and it is tempting
// to merge them because `DEVELOPMENT` appears in both lists. They answer
// different questions and merging them loses the one that matters:
//
//   status  — *what state is this connection in?*  CONNECTED, REAUTH_REQUIRED…
//   mode    — *who is actually answering?*         REAL_PROVIDER, DEVELOPMENT_PROVIDER…
//
// A calendar connection can be `CONNECTED` in `DEVELOPMENT_PROVIDER` mode. That
// pair is the honest description: the flow completed, and nothing reached
// Google. Collapsed into one field, the UI would have to choose between showing
// "connected" (a lie about the provider) and "development" (a lie about the
// state), and §69's "must never falsely imply production connectivity" would
// have no representation to hang on.
//
// ── What is deliberately absent ──────────────────────────────────────────────
//
// **There is no token field anywhere in this file.** Not an access token, not a
// refresh token, not a client secret, not an authorization code. §38 forbids
// storing OAuth client secrets and service-account credentials in the frontend,
// and the strongest available enforcement of that is a domain model with
// nowhere to put one — `integration-boundary.test.ts` asserts it structurally.
// A connection is described by `accountLabel`, `scopes` and `expiresAt`, which
// is everything a member needs to decide whether to disconnect and nothing an
// attacker can use.
// ─────────────────────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════════════════════
// DOMAINS AND PROVIDERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The nine integration families this phase covers.
 *
 * `maps` is here even though Phase 8 already built it in full, because the
 * connection centre has to be able to show its status alongside the others.
 * This phase adds no map implementation — see `lib/integrations/maps.ts`, which
 * is a twenty-line bridge onto the existing registry rather than a second one.
 */
export const INTEGRATION_DOMAINS = [
  'calendar',
  'maps',
  'push',
  'email',
  'sms',
  'government',
  'identity',
  'payments',
] as const;

export type IntegrationDomain = (typeof INTEGRATION_DOMAINS)[number];

/**
 * Every provider identity the application can name.
 *
 * Dotted `domain.provider`, so a provider id sorts under its domain and a
 * reviewer never has to ask which family `apple` belongs to — `calendar.apple`
 * and `identity.apple` are different integrations that happen to share a
 * vendor, and §22 warns specifically against conflating them.
 */
export const INTEGRATION_PROVIDERS = [
  // Calendar — §6, §9
  'calendar.google',
  'calendar.apple',
  'calendar.device',

  // Maps — §10. One identity for the whole Phase 8 provider set; the per-
  // capability detail comes from that phase's own `getProviderStatus()`.
  'maps.platform',

  // Push — §14, §15, §16
  'push.expo',
  'push.fcm',
  'push.apns',

  // Email and SMS — §17, §18. Delivery is the backend's; the frontend owns
  // preference, verification state and the failure surface.
  'email.platform',
  'sms.platform',

  // Government — §19. One identity per country source, resolved at runtime;
  // see `GovernmentSource` below, which carries the authority and provenance
  // §20 requires.
  'government.official',
  'government.curated',

  // Identity — §21, §22, §23
  'identity.phone',
  'identity.email',
  'identity.google',
  'identity.apple',

  // Payments — §25, §26. B15 is real and complete; the gateway behind it is
  // named by `/financial/capabilities` and is never hardcoded here.
  'payments.platform',
] as const;

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDERS)[number];

// ═════════════════════════════════════════════════════════════════════════════
// CAPABILITIES — §36, §52
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What an integration can be asked to do.
 *
 * Capability-first, exactly as §4 requires: the UI asks for
 * `calendar.event.create` and does not care that Google needs an OAuth grant
 * and the device needs an OS permission. Both answer the same capability.
 */
export const INTEGRATION_CAPABILITIES = [
  // Calendar — §6, §7, §8
  'calendar.list',
  'calendar.event.create',
  'calendar.event.update',
  'calendar.event.delete',
  'calendar.event.import',
  'calendar.sync.oneWay',
  'calendar.sync.twoWay',

  // Maps — §10
  'maps.render',
  'maps.geocode',
  'maps.reverseGeocode',
  'maps.places',
  'maps.directions',
  'maps.travelTime',
  'maps.transit',

  // Push — §14
  'push.permission',
  'push.token',
  'push.deviceRegistry',
  'push.preferences',
  'push.deepLink',

  // Email — §17
  'email.preferences',
  'email.verification',
  'email.change',
  'email.unsubscribe',

  // SMS — §18
  'sms.verification',
  'sms.preferences',

  // Government — §19
  'government.notices',
  'government.advisories',
  'government.embassy',
  'government.services',

  // Identity — §21, §24
  'identity.signIn',
  'identity.link',
  'identity.unlink',
  'identity.reauthenticate',

  // Payments — §26
  'payments.initialize',
  'payments.authorize',
  'payments.confirm',
  'payments.cancel',
  'payments.status',
  'payments.receipt',
  'payments.refund',
  'payments.methods',
] as const;

export type IntegrationCapability = (typeof INTEGRATION_CAPABILITIES)[number];

/**
 * A permission an integration needs before a capability will work — §36.
 *
 * Two kinds, and the difference decides the whole recovery flow. An OS
 * permission that has been permanently denied can only be fixed in Settings, so
 * `recoverBySettings` is true and the UI offers to open them. A provider scope
 * that was refused can be asked for again, so it is false and the UI offers to
 * retry the authorization.
 */
export interface IntegrationPermission {
  key: string;
  /** What the member sees. Plain language — this is consent text (§37). */
  label: string;
  /** Why it is needed. Never "to improve your experience". */
  rationale: string;
  kind: 'device' | 'providerScope';
  /** Which capabilities stop working without it. */
  requiredFor: IntegrationCapability[];
  /** True when the only way back is the OS settings app. */
  recoverBySettings: boolean;
  /** False when the capability degrades rather than stops. */
  isMandatory: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS — §31
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §31's list, verbatim and complete.
 *
 * "Do not invent separate incompatible status systems" is the instruction, and
 * this is the whole of the answer: every integration in the application reports
 * one of these thirteen, and `lib/integrations/status.ts` owns every transition
 * between them.
 */
export const INTEGRATION_STATUSES = [
  'NOT_CONNECTED',
  'CONNECTING',
  'CONNECTED',
  'SYNCING',
  'SYNCED',
  'PARTIALLY_CONNECTED',
  'REAUTH_REQUIRED',
  'PERMISSION_DENIED',
  'DISCONNECTED',
  'ERROR',
  'UNAVAILABLE',
  'BACKEND_GAP',
  'DEVELOPMENT',
] as const;

export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/**
 * Who is actually answering — §69.
 *
 * The second axis. See the header for why this is not merged into the status.
 *
 *   REAL_PROVIDER        a third-party SDK or service answered
 *   BACKEND_CONNECTED    a certified Diaspora route answered
 *   DEVELOPMENT_PROVIDER a simulated adapter answered; nothing left the device
 *   BACKEND_GAP          nothing answered because the contract does not exist
 *   NOT_CONFIGURED       nothing answered because this build has no credentials
 */
export const INTEGRATION_MODES = [
  'REAL_PROVIDER',
  'BACKEND_CONNECTED',
  'DEVELOPMENT_PROVIDER',
  'BACKEND_GAP',
  'NOT_CONFIGURED',
] as const;

export type IntegrationMode = (typeof INTEGRATION_MODES)[number];

/** Whether a mode means real data crossed a real boundary. Drives every "simulated" marker. */
export function isSimulatedMode(mode: IntegrationMode): boolean {
  return mode === 'DEVELOPMENT_PROVIDER';
}

/** Whether the UI may describe this as a live, production connection — §69. */
export function impliesProductionConnectivity(mode: IntegrationMode): boolean {
  return mode === 'REAL_PROVIDER' || mode === 'BACKEND_CONNECTED';
}

// ═════════════════════════════════════════════════════════════════════════════
// ERRORS — §32
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §32's product-level error vocabulary, verbatim.
 *
 * "Screens must not need to understand raw provider error codes" — so every
 * provider adapter maps its own failures into exactly one of these before the
 * error leaves the adapter. A screen switches on this and nothing else.
 */
export const INTEGRATION_ERROR_KINDS = [
  'AuthenticationRequired',
  'PermissionDenied',
  'ProviderUnavailable',
  'NetworkFailure',
  'RateLimited',
  'ConfigurationMissing',
  'BackendUnavailable',
  'BackendGap',
  'InvalidRequest',
  'ExpiredCredential',
  'Conflict',
  'UnsupportedCapability',
  'UnknownError',
] as const;

export type IntegrationErrorKind = (typeof INTEGRATION_ERROR_KINDS)[number];

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTIONS AND ACCOUNTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The account an integration is connected to, as much of it as is safe to hold.
 *
 * **No token, by construction.** See the file header. `accountLabel` is what a
 * member recognises — an email address they typed, a calendar name they picked
 * — and is the only identifier the UI ever shows.
 */
export interface IntegrationAccount {
  /** Opaque, provider-scoped. Never treated as authorization (§46). */
  externalId: string;
  /** What the member sees: "amara@example.com", "Work calendar". */
  accountLabel: string;
  /**
   * Apple's private relay addresses are real, deliverable and not the member's
   * own — §23. Flagged so the UI can say so rather than presenting a
   * `@privaterelay.appleid.com` address as their email.
   */
  isPrivateRelay?: boolean;
  avatarUrl?: string | null;
}

/**
 * One integration's live state — the object the connection centre renders.
 */
export interface IntegrationConnection {
  provider: IntegrationProviderId;
  domain: IntegrationDomain;
  status: IntegrationStatus;
  mode: IntegrationMode;
  /** Present once connected. Null in every other state. */
  account: IntegrationAccount | null;
  /** Which capabilities are usable *right now*, not which are theoretically supported. */
  grantedCapabilities: IntegrationCapability[];
  /** Provider scopes actually granted. Names only — §38 keeps tokens out. */
  scopes: string[];
  /** ISO-8601. When the grant stops working, if the provider says. */
  expiresAt?: string | null;
  /** ISO-8601. Null when it has never run — distinct from "ran and found nothing". */
  lastSyncedAt?: string | null;
  lastError?: IntegrationErrorSummary | null;
  /** The gap this connection is standing in for, if any. */
  gapId?: string | null;
  /** ISO-8601. When this snapshot was taken. */
  observedAt: string;
}

/** The renderable part of a failure. No stack, no provider payload, no token. */
export interface IntegrationErrorSummary {
  kind: IntegrationErrorKind;
  /** Member-facing. Already in plain language when it reaches here. */
  message: string;
  /** ISO-8601. */
  occurredAt: string;
  /** For a support conversation. Never a token, never a request body (§56). */
  correlationId?: string | null;
  /** Seconds. Only ever set on RateLimited — §57. */
  retryAfterSeconds?: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// SYNC — §35
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §35's sync state.
 *
 * `partial` exists because it is the honest answer far more often than either
 * of its neighbours: a calendar export that wrote eleven of twelve events is
 * not a success and is not a failure, and rounding it to either is how a member
 * ends up believing an event is in their calendar when it is not.
 */
export type IntegrationSyncPhase = 'never' | 'syncing' | 'synced' | 'partial' | 'failed';

export interface IntegrationSyncState {
  phase: IntegrationSyncPhase;
  /** ISO-8601. The last time the backend *confirmed* a sync — never a local guess (§35). */
  lastSyncedAt: string | null;
  /** Set while `phase === 'syncing'`. */
  startedAt?: string | null;
  itemsSynced: number;
  itemsFailed: number;
  /** Why the failed ones failed, deduplicated. */
  failureReasons: string[];
  /** True when something needs the member's attention rather than a retry. */
  needsAttention: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR — §6 · §7 · §8 · §62
// ═════════════════════════════════════════════════════════════════════════════

export interface CalendarRef {
  id: string;
  title: string;
  /** Provider-supplied colour, for the picker. Never used as the only signal. */
  color?: string | null;
  /** False for a subscribed or shared calendar the member cannot write to. */
  allowsModifications: boolean;
  isPrimary: boolean;
  /** Which provider this calendar lives in. A member can have several connected. */
  provider: IntegrationProviderId;
  /** IANA. The calendar's own zone, which need not be the device's — §62. */
  timeZone?: string | null;
}

/**
 * An event on its way into a calendar.
 *
 * **`timeZone` is required and is not defaulted to the device's.** §62 is
 * explicit: an event with an authoritative timezone must not be silently
 * converted to the device's. A community meeting in Lagos is at 18:00 WAT
 * whether or not the member is currently in London, and a calendar entry that
 * says 17:00 BST is a different — and wrong — claim about a real-world event.
 * Making the field required means the conversion cannot happen by omission.
 */
export interface CalendarEventDraft {
  /** Diaspora's own id for the thing being exported. Used for deduplication. */
  sourceId: string;
  sourceKind: 'event' | 'occurrence' | 'series' | 'reminder';
  title: string;
  /** ISO-8601 with offset. */
  startsAt: string;
  endsAt: string;
  /** IANA. Required — see above. */
  timeZone: string;
  isAllDay: boolean;
  location?: string | null;
  notes?: string | null;
  url?: string | null;
  /** Minutes before start. Empty means "use the calendar's default". */
  reminderMinutes: number[];
  /** RFC 5545 RRULE for a recurring series. */
  recurrenceRule?: string | null;
}

/** What a provider gives back once an event exists on its side. */
export interface CalendarEventRef {
  externalEventId: string;
  calendarId: string;
  provider: IntegrationProviderId;
  /** ISO-8601. */
  writtenAt: string;
  /** A deep link into the provider's own app, where it offers one. */
  viewUrl?: string | null;
}

/** §8's settings, kept apart from the connection so a disconnect does not lose them. */
export interface CalendarSyncSettings {
  enabled: boolean;
  /** The calendar new events go into. Null means "ask every time". */
  defaultCalendarId: string | null;
  defaultProvider: IntegrationProviderId | null;
  /**
   * §8 asks for exporting and two-way sync to be visibly different things, and
   * they are different settings rather than two values of one — a member who
   * turns on automatic export has not agreed to Diaspora reading their calendar.
   */
  autoExportRsvps: boolean;
  twoWaySyncEnabled: boolean;
  syncFrequency: 'manual' | 'hourly' | 'daily';
  defaultReminderMinutes: number[];
  /**
   * §62. `eventTimeZone` keeps the event in its own zone; `deviceTimeZone`
   * converts. The default is `eventTimeZone` and the setting exists because a
   * member who has permanently relocated may genuinely want the other.
   */
  timeZoneBehaviour: 'eventTimeZone' | 'deviceTimeZone';
  /** What happens when the same event is exported twice. */
  conflictBehaviour: 'skip' | 'update' | 'duplicate';
}

// ═════════════════════════════════════════════════════════════════════════════
// PUSH — §14 · §15 · §44 · §45
// ═════════════════════════════════════════════════════════════════════════════

export type PushPermissionState =
  | 'notRequested'
  | 'requesting'
  | 'granted'
  | 'denied'
  /** Denied in a way the app cannot re-ask for. Only Settings will fix it. */
  | 'blocked'
  /** Managed-device policy. The member cannot change it and should not be asked to. */
  | 'restricted'
  | 'unavailable';

/**
 * A push registration, as the client knows it.
 *
 * **`token` is deliberately not a field.** The token is passed straight from the
 * OS to `registerNotificationDevice` and is never held in application state,
 * never persisted, and never logged — §38. What is kept is
 * `tokenFingerprint`: a short, non-reversible digest used only to answer "is
 * this the same token I registered last time", which is the one question the
 * lifecycle actually needs and the one an attacker gains nothing from.
 */
export interface PushRegistration {
  /** B13's device id, from `PUT /notifications/devices`. */
  deviceId: string | null;
  provider: IntegrationProviderId;
  platform: 'Android' | 'IOS' | 'Web' | 'Tablet' | 'Unknown';
  /** Non-reversible. See above. */
  tokenFingerprint: string | null;
  /** ISO-8601. */
  registeredAt: string | null;
  /**
   * §44. The user the token was registered for. A token registered for A and
   * left behind after B signs in routes A's notifications to B's phone, which
   * is the single worst failure available to this integration.
   */
  registeredForUserId: string | null;
  permission: PushPermissionState;
  mode: IntegrationMode;
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNMENT — §19 · §20 · §60
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Where a piece of official information came from — §20.
 *
 * The distinction this type exists to make impossible to skip:
 *
 *   `official`  — retrieved from a government API or an official feed
 *   `curated`   — a human at Diaspora read an official page and summarised it
 *   `community` — a member wrote it
 *
 * §19 forbids labelling unofficial information as government information, and
 * the enforcement is that every government-surface component takes a
 * `GovernmentSource` and renders its `authority` and `sourceKind` — there is no
 * component that displays official-looking content without one.
 */
export type GovernmentSourceKind = 'official' | 'curated' | 'community';

export interface GovernmentSource {
  kind: GovernmentSourceKind;
  /** The body that published it. "UK Home Office" — never "Diaspora" (§20). */
  authority: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  region?: string | null;
  /** The official page. Present for `official` and `curated`; absent for `community`. */
  officialUrl?: string | null;
  /** ISO-8601. When the authority published it. */
  publishedAt?: string | null;
  /** ISO-8601. When Diaspora last checked. Distinct from publishedAt and both matter. */
  lastCheckedAt?: string | null;
  /**
   * Whether somebody confirmed this against the official source, and when.
   * `unverified` is a legitimate value and is rendered as such.
   */
  verification: 'verified' | 'unverified' | 'stale';
}

export interface GovernmentNotice {
  id: string;
  title: string;
  summary: string;
  body?: string | null;
  category: 'notice' | 'advisory' | 'embassy' | 'immigration' | 'service';
  /** Advisories carry a level; other categories do not. */
  advisoryLevel?: 'normal' | 'caution' | 'reconsider' | 'doNotTravel' | null;
  source: GovernmentSource;
  /** ISO-8601. */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// IDENTITY — §21 · §24
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One authentication method on the account.
 *
 * `isCurrentSession` and `canUnlink` are separate for the reason §24 gives:
 * a member must not be able to unlink their only way back in. `canUnlink` is
 * computed by `lib/integrations/identity/linking.ts` from the whole set, never
 * from one entry — a rule about "the last one" cannot be evaluated one at a
 * time.
 */
export interface IdentityLink {
  provider: IntegrationProviderId;
  status: IntegrationStatus;
  mode: IntegrationMode;
  account: IntegrationAccount | null;
  /** ISO-8601. */
  linkedAt: string | null;
  lastUsedAt: string | null;
  isPrimary: boolean;
  isCurrentSession: boolean;
  /** False when unlinking would lock the member out — §24. */
  canUnlink: boolean;
  /** Why not, when `canUnlink` is false. Rendered next to the disabled control. */
  cannotUnlinkReason?: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENTS — §25 · §26 · §29 · §30
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The provider-neutral payment state — §25.
 *
 * Deliberately **not** B15's `PaymentStatus`. That union is a backend lifecycle
 * (`Draft`, `Authorized`, `Captured`, `Settled`…) and a screen that switched on
 * it would be encoding B15's internals into the UI, which is what §25 forbids.
 * This is the product's own vocabulary and `lib/integrations/payments/` maps
 * between them in one place.
 *
 * `indeterminate` is the member of this union that earns its keep. A network
 * failure during capture is not `failed` — the money may well have moved — and
 * §26's "do not assume a payment succeeded because the client returned from a
 * payment UI" has an exact mirror that is easier to get wrong: do not assume it
 * failed because the client did not.
 */
export type PaymentPhase =
  | 'idle'
  | 'initializing'
  | 'awaitingAction'
  | 'processing'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'indeterminate'
  | 'refundPending'
  | 'refunded';

/**
 * A challenge the gateway wants the member to complete — §26, §40.
 *
 * B15 returns `nextAction` as an opaque string (see `types/financial.ts:218`),
 * so this is the *parsed* form and the parse is best-effort. An action the
 * client cannot classify becomes `kind: 'unknown'` and the UI tells the member
 * to complete it in the gateway's own surface rather than guessing — which is
 * FRONTEND-PHASE16-GAP-021.
 */
export interface PaymentNextAction {
  kind: 'redirect' | 'threeDSecure' | 'mobileMoneyPrompt' | 'manualTransfer' | 'unknown';
  /** Where to send the member, when there is somewhere. */
  url?: string | null;
  /** What to tell them, when there is nowhere to send them. */
  instruction?: string | null;
  /** Deep link the gateway will return to. Always this app's scheme (§40). */
  returnUrl?: string | null;
}

/**
 * What a screen renders while a payment is in flight.
 *
 * `isAuthoritative` is the field §26 and §30 both turn on. It is true only when
 * this state came from reading the payment back from the backend, and false
 * when it is the client's own optimistic guess. A success screen may only be
 * drawn on an authoritative `succeeded`.
 */
export interface PaymentState {
  phase: PaymentPhase;
  paymentIntentId: string | null;
  /** Never inferred from locale, country or IP — §61. Always from the backend. */
  currency: string | null;
  nextAction: PaymentNextAction | null;
  error: IntegrationErrorSummary | null;
  /** True only when read back from the authoritative backend state (§26, §30). */
  isAuthoritative: boolean;
  /** True when the outcome depends on a webhook the client cannot observe (§30). */
  awaitingWebhook: boolean;
  attemptCount: number;
  /** ISO-8601. */
  observedAt: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE DESCRIPTOR — what the connection centre lists
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The static half of an integration: everything true about it before anybody
 * connects. Registered once in `lib/integrations/catalog.ts`.
 *
 * Static and dynamic are separate types so the connection centre can render the
 * full list — including integrations nobody has connected and integrations this
 * build cannot reach — from the catalogue alone, with the live
 * `IntegrationConnection` merged in where one exists. A single type would mean
 * an unconnected integration had to be represented by a half-empty connection,
 * and "no connection" and "a connection in an empty state" would be
 * indistinguishable.
 */
export interface IntegrationDescriptor {
  provider: IntegrationProviderId;
  domain: IntegrationDomain;
  /** Product name, member-facing. */
  name: string;
  /** One sentence. What it does for them, not how. */
  description: string;
  capabilities: IntegrationCapability[];
  permissions: IntegrationPermission[];
  /** §37's consent copy. Shown before authorization, never after. */
  consent: IntegrationConsentCopy;
  /** True when the member connects it themselves; false for platform-level ones. */
  isMemberConnectable: boolean;
  /** Which capabilities keep working with no network — §34. */
  offlineCapabilities: IntegrationCapability[];
  /** The gap ids this integration depends on. Empty when fully backed. */
  gapIds: string[];
  /** Where in the app it also appears, for §51's contextual discovery. */
  contextualEntryPoints: string[];
}

/**
 * §37's consent, as structured fields rather than a paragraph.
 *
 * §37 forbids burying meaningful consent inside a generic "Continue", and the
 * way this file enforces that is by making the four questions separate required
 * fields. A component cannot render the sheet without answering all of them,
 * and "what Diaspora does not store" in particular is the one that would be
 * dropped first if it were optional prose.
 */
export interface IntegrationConsentCopy {
  /** What will be accessed. */
  accesses: string[];
  /** Why it is needed. One reason per access, in the same order where possible. */
  reasons: string[];
  /** What Diaspora stores. */
  stores: string[];
  /** What Diaspora does *not* store. Usually the more informative list. */
  doesNotStore: string[];
  /** How to disconnect, in one sentence. */
  disconnectSummary: string;
  /** The privacy implication a reasonable person would want flagged. */
  privacyNote: string;
}

/** The catalogue entry joined to its live state. What a list row renders from. */
export interface IntegrationListItem {
  descriptor: IntegrationDescriptor;
  connection: IntegrationConnection;
  sync: IntegrationSyncState | null;
}
