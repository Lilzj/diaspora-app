// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Provider contracts (Frontend Phase 16, §3 · §4 · §15 · §21 · §25)
//
// The interfaces every provider implements. §4's test is that swapping Google
// for another calendar, or Expo's push service for FCM, should not require a
// product screen to change — and the way that becomes a structural property
// rather than a hope is that the interfaces below mention no vendor.
//
// There is no `GoogleCalendarProvider` type here, and no `FirebaseProvider`.
// There is a `CalendarProvider` with three implementations and a
// `PushProvider` with two, and the registry decides which answers.
//
// ── Every method is async, including the ones that look synchronous ──────────
//
// `getPermission()` could be synchronous for a provider holding a cached
// answer. It is not, because for the device provider it is a bridge call, and
// an interface whose shape depends on which implementation is behind it is not
// an abstraction. The same reasoning made every function in the gap arms of
// Phases 5–15 `async`: a synchronous throw escapes a caller's `.catch()`, and
// a refusal that cannot be caught is a crash.
//
// ── Providers throw `IntegrationError`, never anything else ──────────────────
//
// Each implementation is responsible for translating its own failures — an
// `expo-calendar` rejection, an axios error, a provider error code — into the
// §32 vocabulary *before* it leaves the adapter. That is the entire contract
// between this layer and the screens: a screen catches `IntegrationError` and
// switches on `kind`, and never sees a raw provider anything.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CalendarEventDraft,
  CalendarEventRef,
  CalendarRef,
  GovernmentNotice,
  IdentityLink,
  IntegrationAccount,
  IntegrationCapability,
  IntegrationMode,
  IntegrationProviderId,
  PushPermissionState,
} from '@/types/integrations';

/**
 * What a provider says about itself.
 *
 * `mode` is on the descriptor rather than computed at the call site so that a
 * provider cannot be used without its mode being available — §69's "the UI must
 * never falsely imply production connectivity" needs the mode to travel with
 * every answer, and the cheapest way to guarantee that is to attach it to the
 * thing the caller already holds.
 */
export interface ProviderDescriptor {
  id: IntegrationProviderId;
  /** Member-facing. Never includes a vendor name the product does not want to promise. */
  label: string;
  mode: IntegrationMode;
  /** The gap that explains this provider's absence, when it is absent. */
  gapId?: string;
}

/** The permission lifecycle §13 and §14 both describe, as one shape. */
export interface PermissionSnapshot {
  state: PushPermissionState;
  /** True when the only route back is the OS settings app. */
  requiresSettings: boolean;
  /**
   * True when the OS will show a prompt if we ask. False after a denial on
   * platforms that only allow one ask — which is what makes an "Allow" button
   * that silently does nothing avoidable.
   */
  canAskAgain: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR — §6 · §7 · §8 · §9
// ═════════════════════════════════════════════════════════════════════════════

export interface CalendarProvider {
  descriptor: ProviderDescriptor;
  capabilities: readonly IntegrationCapability[];

  /**
   * Whether this provider needs a device permission at all.
   *
   * False for a remote provider like Google, where the gate is an OAuth scope
   * rather than an OS grant. The distinction drives which recovery the UI
   * offers — "open Settings" is wrong for a refused OAuth scope, and
   * "authorize again" is wrong for a blocked OS permission.
   */
  readonly usesDevicePermission: boolean;

  getPermission(): Promise<PermissionSnapshot>;
  requestPermission(): Promise<PermissionSnapshot>;
  /** Opens the OS settings page. Only meaningful when `usesDevicePermission`. */
  openSettings(): Promise<void>;

  listCalendars(): Promise<CalendarRef[]>;

  /**
   * Writes an event.
   *
   * Takes the whole draft including its `timeZone`, which is required by the
   * type — §62's conversion rule cannot be violated by omission because there
   * is no draft without a zone.
   */
  createEvent(calendarId: string, draft: CalendarEventDraft): Promise<CalendarEventRef>;
  updateEvent(ref: CalendarEventRef, draft: CalendarEventDraft): Promise<CalendarEventRef>;
  deleteEvent(ref: CalendarEventRef): Promise<void>;

  /**
   * Whether this provider already holds an event Diaspora wrote for `sourceId`.
   *
   * The input to §8's conflict behaviour. Returns null when the provider cannot
   * answer — the device calendar can, a remote one behind a gap cannot — and
   * a null answer means the conflict setting degrades to "duplicate", which is
   * the only safe default when we do not know.
   */
  findExported(sourceId: string, calendarId: string): Promise<CalendarEventRef | null>;
}

// ═════════════════════════════════════════════════════════════════════════════
// PUSH — §14 · §15 · §16
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A push token, as it leaves the provider.
 *
 * This is the one place in the application where a raw token exists, and it
 * exists for the length of one call: `push-lifecycle.ts` passes `value`
 * straight to B13's device registry and keeps only the fingerprint. Nothing
 * stores this object, and `PushRegistration` in the domain model has no field
 * that could hold it (§38).
 */
export interface PushTokenResult {
  /** The raw token. Never stored, never logged, never in an event. */
  value: string;
  /** Which transport minted it, so the backend knows how to send. */
  transport: 'expo' | 'fcm' | 'apns' | 'simulated';
}

export interface PushProvider {
  descriptor: ProviderDescriptor;
  capabilities: readonly IntegrationCapability[];

  getPermission(): Promise<PermissionSnapshot>;
  requestPermission(): Promise<PermissionSnapshot>;
  openSettings(): Promise<void>;

  /** Mints or fetches the device's token. Throws `PermissionDenied` if not granted. */
  getToken(): Promise<PushTokenResult>;

  /**
   * Subscribes to token rotation.
   *
   * The OS can rotate a token at any time and a client that only reads it at
   * startup will silently stop receiving notifications. Returns an unsubscribe
   * function.
   */
  onTokenRefresh(listener: (token: PushTokenResult) => void): () => void;

  /**
   * Subscribes to notifications arriving while the app is in the foreground.
   *
   * Separate from the tap handler because they are different product moments:
   * a foreground arrival should be a toast, and a tap should navigate.
   */
  onNotificationReceived(listener: (payload: PushPayload) => void): () => void;

  /** Subscribes to a member tapping a notification, including from a cold start. */
  onNotificationTapped(listener: (payload: PushPayload) => void): () => void;

  /** Android channels. A no-op where the platform has none. */
  configureChannels(): Promise<void>;

  /** The OS badge. Best-effort — several platforms have none. */
  setBadgeCount(count: number): Promise<void>;
}

/**
 * A notification as the client sees it.
 *
 * Deliberately narrow. B13 sends a `targetRoute` and a `data` bag; this carries
 * the three fields routing needs and the identifier needed to mark it read.
 * Widening it to the whole provider payload would put arbitrary provider data
 * into application state, which is how a notification body ends up in a log.
 */
export interface PushPayload {
  notificationId: string | null;
  notificationType: string | null;
  /** B13's own route. Always preferred over any client-side table. */
  targetRoute: string | null;
  /** The subject the notification is about, for the fallback route tables. */
  subjectId: string | null;
  categoryKey: string | null;
  title: string | null;
  body: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// IDENTITY / OAUTH — §21 · §22 · §23
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The result of an authorization the *device* performed.
 *
 * `code` and `codeVerifier` are here because they have to travel from the
 * browser hand-off to the backend exchange, and they exist in memory for that
 * one hop. Neither is persisted. Neither is logged. `integration-boundary.test.ts`
 * asserts no function in this layer returns an access or refresh token, which
 * is the pair that would matter if it leaked — a code without the client secret
 * is useless to anybody who intercepts it, and PKCE is what makes that true.
 */
export interface OAuthAuthorization {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  /** Some providers return a display name once and never again — Apple, notably. */
  suggestedAccount?: IntegrationAccount | null;
}

export type OAuthOutcome =
  | { kind: 'authorized'; authorization: OAuthAuthorization }
  | { kind: 'cancelled' }
  | { kind: 'denied'; deniedScopes: string[] };

export interface OAuthProvider {
  descriptor: ProviderDescriptor;
  capabilities: readonly IntegrationCapability[];
  /** The scopes this provider will ask for, for the consent sheet (§37). */
  scopesFor(capability: IntegrationCapability): string[];

  /**
   * Runs the authorization.
   *
   * Returns an outcome rather than throwing on cancellation, because a member
   * backing out of a consent screen is not an error and a `catch` block is the
   * wrong place to handle the most common path through this function.
   */
  authorize(scopes: string[]): Promise<OAuthOutcome>;
}

export interface IdentityProvider {
  descriptor: ProviderDescriptor;
  /** The links this provider knows about. The backend is authoritative; this is a view. */
  listLinks(): Promise<IdentityLink[]>;
  link(authorization: OAuthAuthorization): Promise<IdentityLink[]>;
  unlink(provider: IntegrationProviderId, reauthToken: string): Promise<IdentityLink[]>;
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNMENT — §19 · §20 · §60
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A government information source.
 *
 * `countryCode` is a required argument on every method, not an optional filter.
 * §60 forbids showing one country's information to somebody browsing another,
 * and a signature that cannot be called without a country makes that structural
 * rather than a review item — there is no "fetch all notices" to accidentally
 * render.
 */
export interface GovernmentProvider {
  descriptor: ProviderDescriptor;
  /** Which countries this deployment has any source for. Empty is a valid answer. */
  supportedCountries(): Promise<string[]>;
  listNotices(
    countryCode: string,
    options?: { category?: GovernmentNotice['category']; region?: string }
  ): Promise<GovernmentNotice[]>;
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A provider that exists only to fail cleanly.
 *
 * Phase 8 established the pattern and the reasoning holds here: without an
 * always-present refusing implementation, every call site would have to check a
 * flag before calling, and the first one that forgot would throw inside a
 * render. With it, the answer is a typed `IntegrationError` in the domain's own
 * vocabulary, the screen renders its "not available" state, and "fall back
 * gracefully, do not crash" holds by construction rather than by review.
 */
export interface UnavailableProviderReason {
  gapId: string;
  capability: string;
}
