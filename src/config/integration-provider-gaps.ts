// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration provider gaps (Frontend Phase 16, §67)
//
// Kept in a separate register from `integration-gaps.ts` for the reason Phase 8
// separated `map-provider-gaps.ts` from `maps-gaps.ts`, and it is the same
// reason:
//
//   A **backend gap** is a contract somebody has to design and build. It lands
//   on a backend team's roadmap.
//
//   A **provider gap** is a dependency to install, a native module to compile,
//   a config plugin to add, a store capability to request and a key to put in a
//   secret store. It lands on release engineering. Nothing in this file needs a
//   line of backend code.
//
// Filing "install expo-notifications" as a backend gap would send a backend
// team work it cannot do, and would hide the fact that the push *contract*
// already exists and works.
//
// ── What the audit found, precisely ──────────────────────────────────────────
//
// The application is a managed Expo project (`expo ~57.0.4`) with **no native
// integration module of any kind installed**. Verified by inspection rather than
// assumed:
//
//   * `expo-calendar` — not in `package.json`. No calendar capability exists.
//   * `expo-notifications` — not in `package.json`. Zero occurrences of the
//     word in `src/`. There is no push token acquisition anywhere.
//   * Firebase / FCM — zero occurrences. No `google-services.json`,
//     no `GoogleService-Info.plist`, no config plugin entry in `app.json`.
//   * `expo-auth-session`, `expo-apple-authentication`,
//     `@react-native-google-signin` — none present. Zero occurrences of
//     "oauth" in the entire source tree.
//   * `expo-secure-store` — not present. The only persistence is
//     `@react-native-async-storage/async-storage`, which is unencrypted.
//   * A payment gateway SDK — none. B15's server side is real; the device has
//     nothing to present a card sheet with.
//
// `app.json` declares three plugins — `expo-router`, `expo-status-bar`,
// `expo-image` — and no permission strings, no associated domains and no intent
// filters beyond the `diaspora` scheme.
//
// ── Why this is not a blocker, and where the line is ─────────────────────────
//
// Every capability below is implemented behind an abstraction with a working
// provider selected in its absence, exactly as Phase 8's canvas renderer stands
// in for tiles. The device calendar provider resolves the native module through
// an **optional require** — the same technique `lib/maps/providers/native-map.tsx`
// uses — so the day `expo-calendar` is installed and a development build is
// made, the same screens write to a real calendar with no code change.
//
// Two of these are honest limits rather than fallbacks, and it is worth being
// exact about which:
//
//   * **A push token cannot be simulated into existence.** The development
//     adapter produces a synthetic token for the lifecycle to be exercised and
//     tested against, and it is never sent to B13 — `assertEnabled()` guards the
//     arm and the registration path refuses a simulated token in any build that
//     would reach a real device registry.
//   * **An OAuth grant cannot be simulated into existence either.** The
//     development adapter completes the *flow*; nothing reaches Google.
//     `IntegrationMode.DEVELOPMENT_PROVIDER` is rendered on every surface that
//     shows it, which is §69.
//
// Gap identifiers are `INTEGRATION-PROVIDER-GAP-0xx` and are quoted verbatim in
// `frontend-phase-16-integrations-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntegrationDomain } from '@/types/integrations';

export type ProviderGapStatus =
  /** The frontend is complete behind the abstraction. Only wiring is missing. */
  | 'frontend-complete'
  /** The frontend is complete and a fallback implementation is in use. */
  | 'frontend-complete-with-fallback';

export type ProviderGapPriority = 'critical' | 'high' | 'medium' | 'low';

export interface IntegrationProviderGap {
  /** `INTEGRATION-PROVIDER-GAP-001`. */
  id: string;
  key: string;
  domain: IntegrationDomain;
  /** The capability, in provider terms. */
  capability: string;
  /** The Phase 16 sections that depend on it. */
  feature: string;
  status: ProviderGapStatus;
  /** What the app does today in the provider's absence. */
  currentBehaviour: string;
  /** The packages, plugins and native configuration required. */
  requiredDependencies: string[];
  /** The non-code work: store capabilities, keys, native builds, review. */
  integrationWork: string[];
  /** Permission strings and store declarations this would introduce. */
  permissionsIntroduced: string[];
  /** Cost, review, privacy and licensing considerations a decision needs. */
  considerations: string[];
  priority: ProviderGapPriority;
}

export const INTEGRATION_PROVIDER_GAPS: Record<string, IntegrationProviderGap> = {
  deviceCalendar: {
    id: 'INTEGRATION-PROVIDER-GAP-001',
    domain: 'calendar',
    key: 'deviceCalendar',
    capability: 'Reading and writing the device calendar (Apple Calendar on iOS, the calendar provider on Android)',
    feature: '§9 Apple Calendar · §7 Calendar Integration with Events',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The device calendar provider resolves `expo-calendar` through an optional require and reports `UNAVAILABLE` when the module is absent, which it is today. The complete permission lifecycle, calendar picker, event draft conversion, timezone handling and write path are implemented and exercised against the development adapter. Installing the package and making a development build switches the provider with no change to any screen — the resolution already checks for it on every call.',
    requiredDependencies: [
      'expo-calendar (~15.x for SDK 57)',
      'A config plugin entry in app.json supplying the iOS usage descriptions',
      'A development build or EAS build — the module cannot work in Expo Go',
    ],
    integrationWork: [
      'Add `expo-calendar` to app.json plugins with `calendarPermission` and `remindersPermission` strings that state the real reason, since App Review reads them',
      'Add `NSCalendarsUsageDescription` (and `NSCalendarsWriteOnlyAccessUsageDescription` for iOS 17+, which is the narrower grant and the one this app actually needs for export-only)',
      'Android: `READ_CALENDAR` / `WRITE_CALENDAR` are added by the plugin and appear on the store listing',
      'Verify the write-only iOS 17 permission path — it is a different prompt and a different denial state from full access',
    ],
    permissionsIntroduced: [
      'iOS: NSCalendarsWriteOnlyAccessUsageDescription (export only) or NSCalendarsFullAccessUsageDescription (two-way)',
      'Android: android.permission.WRITE_CALENDAR, android.permission.READ_CALENDAR',
    ],
    considerations: [
      'Export-only needs write access alone. Requesting full access for an export feature is exactly what §36 forbids — request the permission the capability needs and no more — and iOS 17 makes the narrower grant available specifically so apps stop over-asking.',
      'A calendar read is a significant privacy escalation: calendar titles are among the most sensitive strings on a phone. Two-way sync should be a separate, later, explicitly-consented step rather than bundled into "connect calendar".',
      'Android calendar access is a sensitive permission on the Play listing and needs a declaration if the app targets recent API levels.',
    ],
    priority: 'high',
  },

  pushToken: {
    id: 'INTEGRATION-PROVIDER-GAP-002',
    domain: 'push',
    key: 'pushToken',
    capability: 'Acquiring a device push token and receiving notifications',
    feature: '§14 Push Notifications · §15 Push Provider Abstraction · §16 Firebase/FCM',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The full lifecycle is implemented behind `PushProvider`: permission request with explanation, granted/denied/blocked/restricted states, settings recovery, token acquisition, refresh, registration against B13’s **real** `PUT /notifications/devices`, deactivation on sign-out, and foreground/background/tapped routing through the existing `notification-routes.ts` table. With no native module the provider reports `UNAVAILABLE` in production and resolves to the development adapter in a development build, which produces a synthetic token so the lifecycle and its tests are exercisable. A synthetic token is never sent to B13.',
    requiredDependencies: [
      'expo-notifications (~0.3x for SDK 57)',
      'expo-device — `Notifications.getExpoPushTokenAsync` requires a physical device and this is how that is detected',
      'A development or EAS build; push does not work in Expo Go on Android since SDK 53',
    ],
    integrationWork: [
      'Decide the transport: Expo Push Service (simplest, adds Expo as a delivery hop) or FCM/APNs direct (no third party, more native configuration). `EXPO_PUBLIC_PUSH_PROVIDER` already selects between them and the adapters are written for both.',
      'FCM: create the Firebase project, add `google-services.json`, upload the FCM v1 service account **to the backend’s secret store, never to the app**',
      'APNs: create the key, upload it to whichever service sends — again, backend-side only',
      'Define Android notification channels; a channel is required for a heads-up notification to appear at all on Android 8+, and a missing channel is a silent failure',
      'iOS: enable the Push Notifications capability and add the background modes entitlement for silent delivery',
    ],
    permissionsIntroduced: [
      'iOS: the runtime notification authorization prompt (there is no Info.plist string for it)',
      'Android 13+: android.permission.POST_NOTIFICATIONS, which is a runtime prompt',
    ],
    considerations: [
      '§16 is explicit that no private Firebase or service-account credential may be in the frontend, and none is: the device needs only a public project id to mint a token. Every sending credential belongs in the backend’s secret store.',
      'Android 13 changed notifications to a runtime permission. An app that asks for it on first launch, before the member has any idea what it is for, gets denied — the implemented flow explains first and asks second, which is §14 and §37.',
      'The Expo Push Service is materially easier and puts a third party in the delivery path for every notification. That is a privacy decision as much as an operational one and belongs with whoever owns the privacy policy.',
    ],
    priority: 'critical',
  },

  googleOAuth: {
    id: 'INTEGRATION-PROVIDER-GAP-003',
    domain: 'identity',
    key: 'googleOAuth',
    capability: 'Google authorization on the device — the PKCE flow and its browser hand-off',
    feature: '§22 Google Identity · §6 Google Calendar · §38 Token Security',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The authorization lifecycle is implemented end to end behind `OAuthProvider`: consent explanation, PKCE challenge, hand-off, deep-link return, cancellation, denial and the already-linked conflict. With no auth-session module and no client id the provider reports `NOT_CONFIGURED`, and the connection centre says so rather than opening a browser that cannot come back. The development adapter completes the flow locally so the states are reachable and testable; nothing reaches Google.',
    requiredDependencies: [
      'expo-auth-session and expo-crypto — expo-crypto is what generates a real PKCE verifier; the development adapter’s is deterministic and is explicitly not cryptographic',
      'expo-web-browser for the system browser hand-off',
      'A Google Cloud project with OAuth client ids per platform',
    ],
    integrationWork: [
      'Create OAuth client ids for iOS, Android and Web. The **client secret stays in the backend** — §38, and GAP-002 is the endpoint that uses it',
      'Register the redirect URI `diaspora://integrations/oauth` and, for Android, the SHA-1 of every signing certificate including the EAS-managed one',
      'Configure the OAuth consent screen with the real scopes; `calendar.events` alone for export, not the full `calendar` scope',
      'Google verification review is required for calendar scopes and takes weeks — start it before it is on the critical path',
    ],
    permissionsIntroduced: [
      'No OS permission. The provider scopes are the permission, and they are shown in the consent sheet (§37).',
    ],
    considerations: [
      'The system browser must be used, not an embedded WebView. Google blocks embedded WebViews for OAuth, and an in-app WebView could read the credentials being typed into it — which is the reason for the block.',
      'Ask for `calendar.events` rather than `calendar`. The narrower scope covers everything this application does, and the wider one asks for read access to every event a member has, which §36 forbids requesting for a capability that does not need it.',
      'Sign-in and calendar are two different grants (§22) and are requested separately. Bundling them means a member who wants to sign in with Google is asked for their calendar.',
    ],
    priority: 'high',
  },

  appleIdentity: {
    id: 'INTEGRATION-PROVIDER-GAP-004',
    domain: 'identity',
    key: 'appleIdentity',
    capability: 'Sign in with Apple',
    feature: '§23 Apple Identity · §24 Account Linking',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'Implemented behind the same `OAuthProvider` abstraction, including the two behaviours that are specific to Apple and easy to get wrong: the private-relay address is flagged in the domain model (`IntegrationAccount.isPrivateRelay`) so it is never presented as the member’s own address, and the name is captured on first authorization only — Apple returns it once and never again, so a flow that ignores it the first time has lost it. Reports `NOT_CONFIGURED` today.',
    requiredDependencies: [
      'expo-apple-authentication',
      'An Apple Developer account with the Sign in with Apple capability',
      'A Services ID and key for the Android/web path, which does not use the native module',
    ],
    integrationWork: [
      'Enable the Sign in with Apple capability on the App ID and add the plugin to app.json',
      'Configure the Services ID and return URL for Android/web',
      'Backend: verify the identity token against Apple’s public keys — a client-supplied token is not proof of anything',
      'Handle the private-relay forwarding address in every outbound email path, or mail to those members bounces',
    ],
    permissionsIntroduced: ['None.'],
    considerations: [
      'App Store Review Guideline 4.8 requires Sign in with Apple wherever another third-party sign-in is offered. Adding Google identity without it is a rejection.',
      'Apple returns the member’s name exactly once, on first authorization. There is no second chance and no API to fetch it later.',
      'Apple permits account *deletion* to be required but is strict about unlink flows leaving a member unable to sign in — which is the same rule §24 states, from a different direction.',
    ],
    priority: 'high',
  },

  paymentSdk: {
    id: 'INTEGRATION-PROVIDER-GAP-005',
    domain: 'payments',
    key: 'paymentSdk',
    capability: 'A gateway SDK that can collect a payment instrument on the device',
    feature: '§26 Payment Providers · §28 Payment Security',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'Every payment capability B15 supports is connected and real — intents, authorization, capture, cancel, status, refunds, receipts — through Phase 5’s existing `PaymentSheet` and this phase’s provider-neutral state machine. The one thing the device cannot do is collect a card, so the payment surface renders the deployment’s real `supportedMethods` and, where an instrument is required, explains that no gateway session is available (FRONTEND-PHASE16-GAP-013). Wallet-funded and manual-transfer flows work end to end today because they need no instrument.',
    requiredDependencies: [
      'The chosen gateway’s React Native SDK — named by `/financial/capabilities`, never hardcoded in the app (§25)',
      'A publishable key, which is the only payment credential that may be client-side, and even that is fetched from the backend rather than compiled in',
    ],
    integrationWork: [
      'Confirm which gateways the deployment has adapters for; `GET /financial/capabilities` already answers this at runtime and the client already reads it',
      'Add the SDK behind a `PaymentInstrumentProvider` so a second gateway is a second adapter, not a second payment flow (§27)',
      'Apple Pay: merchant id and entitlement. Google Pay: merchant configuration',
      'PCI scope review — using the gateway’s own sheet is what keeps the app out of scope, and any tempting shortcut that puts a PAN in a React Native TextInput ends that',
    ],
    permissionsIntroduced: ['None, unless Apple Pay or Google Pay is added.'],
    considerations: [
      'No card data may pass through the application at any point (§28). The gateway’s own sheet is the control, not a policy.',
      'The client returning from a payment sheet is not a payment (§26). The implemented state machine treats the return as a prompt to re-read the authoritative status and nothing else.',
      'Currency comes from the payment context, never from device locale (§61). Already enforced: `PaymentState.currency` is populated only from a backend response.',
    ],
    priority: 'high',
  },

  secureStorage: {
    id: 'INTEGRATION-PROVIDER-GAP-006',
    domain: 'identity',
    key: 'secureStorage',
    capability: 'Encrypted device storage for anything sensitive that must persist',
    feature: '§38 Token Security',
    status: 'frontend-complete',
    currentBehaviour:
      'Nothing sensitive is persisted, so nothing needs encrypting today — which is a design choice rather than luck. The session token lives in the in-memory zustand store and is gone on restart; no provider token is ever held (§38 and the domain model that has no field for one); the push token goes from the OS to B13 without being stored; and the only integration data written to disk is preference-shaped — a default calendar id, a consent acknowledgement — under member-scoped keys cleared on sign-out. `expo-secure-store` becomes **required** the moment session persistence ("stay signed in") is added, and this entry exists so that change is not made without it.',
    requiredDependencies: ['expo-secure-store, when session persistence is introduced'],
    integrationWork: [
      'Move the session token to SecureStore at the same time as introducing persistence, not afterwards',
      'Keychain accessibility on iOS should be `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so a token does not travel in an iCloud backup',
      'Android: StrongBox where available',
    ],
    permissionsIntroduced: ['None.'],
    considerations: [
      'AsyncStorage is unencrypted and readable on a rooted or jailbroken device, and its contents are included in device backups. It is fine for a default calendar id and wrong for a credential.',
      'The current in-memory-only session is genuinely more secure than the usual alternative; the cost is that members sign in on every cold start. Whoever changes that should read this entry first.',
    ],
    priority: 'medium',
  },

  deepLinkConfiguration: {
    id: 'INTEGRATION-PROVIDER-GAP-007',
    domain: 'identity',
    key: 'deepLinkConfiguration',
    capability: 'Verified deep links for OAuth callbacks, payment returns and notification taps',
    feature: '§40 Deep Linking · §49 Notification Deep Link Routing',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      'The `diaspora` custom scheme is declared in app.json and works. Deep-link handling is implemented for every integration return — OAuth success, denial, cancellation, expiry and an unknown state — and, per §40, **does not assume the app was alive when the callback arrived**: the handler reconstructs the pending flow from a persisted, short-lived, member-scoped record rather than from component state. Notification routing reuses `lib/notification-routes.ts` and its refusal behaviour unchanged.',
    requiredDependencies: [
      'Apple: an `apple-app-site-association` file and the Associated Domains entitlement',
      'Android: `assetlinks.json` and intent filters with `android:autoVerify`',
    ],
    integrationWork: [
      'Host the association files on the domain the links use',
      'Add associated domains to app.json for iOS and verified intent filters for Android',
      'Test the cold-start path specifically — a callback arriving at a process that is not running is the case that breaks, and it is the normal case for OAuth because the browser has been in the foreground',
    ],
    permissionsIntroduced: ['None.'],
    considerations: [
      'A custom scheme can be claimed by any other app on the device; a verified universal link cannot. For an OAuth callback that difference is a real interception risk, which is why PKCE is not optional (INTEGRATION-PROVIDER-GAP-003).',
      'The callback URL must never carry member data in its query string, and none of the implemented flows does — the state parameter is an opaque single-use handle.',
    ],
    priority: 'medium',
  },
};

/** Look a provider gap up by key. */
export function getIntegrationProviderGap(key: string): IntegrationProviderGap | undefined {
  return INTEGRATION_PROVIDER_GAPS[key];
}

/** Every provider gap in a domain. */
export function providerGapsForDomain(domain: IntegrationDomain): IntegrationProviderGap[] {
  return Object.values(INTEGRATION_PROVIDER_GAPS).filter((gap) => gap.domain === domain);
}
