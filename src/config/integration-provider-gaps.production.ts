// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `integration-provider-gaps.ts`, derived by
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
      '',
    requiredDependencies: [
      'expo-calendar (~15.x for SDK 57)',
      'A config plugin entry in app.json supplying the iOS usage descriptions',
      'A development build or EAS build — the module cannot work in Expo Go',
    ],
    integrationWork: [],
    permissionsIntroduced: [
      'iOS: NSCalendarsWriteOnlyAccessUsageDescription (export only) or NSCalendarsFullAccessUsageDescription (two-way)',
      'Android: android.permission.WRITE_CALENDAR, android.permission.READ_CALENDAR',
    ],
    considerations: [],
    priority: 'high',
  },

  pushToken: {
    id: 'INTEGRATION-PROVIDER-GAP-002',
    backendStatus: 'connected',
    domain: 'push',
    key: 'pushToken',
    capability: 'Acquiring a device push token and receiving notifications',
    feature: '§14 Push Notifications · §15 Push Provider Abstraction · §16 Firebase/FCM',
    status: 'frontend-complete-with-fallback',
    currentBehaviour:
      '',
    requiredDependencies: [
      'RESOLVED (Remediation Wave H) — `expo-notifications@~57.0.12` installed. The version guess recorded here was "~0.3x for SDK 57", which is the pre-unified numbering; SDK 57 packages carry the SDK’s own major.',
      'RESOLVED (Remediation Wave H) — `expo-device@~57.0.1` installed, and `getToken` now refuses on a simulator *before* prompting for permission, because a simulator grants the prompt and then cannot mint a token.',
      'STILL REQUIRED — a development or EAS build. Expo Go **throws** on Android since SDK 53 (SDK 55 turned the warning into a throw) and warns on iOS. So this capability is wired and type-verified but cannot be runtime-verified in Expo Go, and no amount of frontend work changes that.',
      'STILL REQUIRED — the transport decision and its native configuration (see `integrationWork` below). `EXPO_PUBLIC_PUSH_PROVIDER` selects it and defaults to none, so a build that sets nothing still resolves to the unavailable provider rather than a broken one.',
    ],
    integrationWork: [],
    permissionsIntroduced: [
      'iOS: the runtime notification authorization prompt (there is no Info.plist string for it)',
      'Android 13+: android.permission.POST_NOTIFICATIONS, which is a runtime prompt',
    ],
    considerations: [],
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
      '',
    requiredDependencies: [
      'expo-auth-session and expo-crypto — expo-crypto is what generates a real PKCE verifier; the development adapter’s is deterministic and is explicitly not cryptographic',
      'expo-web-browser for the system browser hand-off',
      'A Google Cloud project with OAuth client ids per platform',
    ],
    integrationWork: [],
    permissionsIntroduced: [
      'No OS permission. The provider scopes are the permission, and they are shown in the consent sheet (§37).',
    ],
    considerations: [],
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
      '',
    requiredDependencies: [
      'expo-apple-authentication',
      'An Apple Developer account with the Sign in with Apple capability',
      'A Services ID and key for the Android/web path, which does not use the native module',
    ],
    integrationWork: [],
    permissionsIntroduced: ['None.'],
    considerations: [],
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
      '',
    requiredDependencies: [
      'The chosen gateway’s React Native SDK — named by `/financial/capabilities`, never hardcoded in the app (§25)',
      'A publishable key, which is the only payment credential that may be client-side, and even that is fetched from the backend rather than compiled in',
    ],
    integrationWork: [],
    permissionsIntroduced: ['None, unless Apple Pay or Google Pay is added.'],
    considerations: [],
    priority: 'high',
  },

  secureStorage: {
    id: 'INTEGRATION-PROVIDER-GAP-006',
    backendStatus: 'connected',
    domain: 'identity',
    key: 'secureStorage',
    capability: 'Encrypted device storage for anything sensitive that must persist',
    feature: '§38 Token Security',
    status: 'frontend-complete',
    currentBehaviour:
      '',
    requiredDependencies: ['expo-secure-store, when session persistence is introduced'],
    integrationWork: [],
    permissionsIntroduced: ['None.'],
    considerations: [],
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
      '',
    requiredDependencies: [
      'Apple: an `apple-app-site-association` file and the Associated Domains entitlement',
      'Android: `assetlinks.json` and intent filters with `android:autoVerify`',
    ],
    integrationWork: [],
    permissionsIntroduced: ['None.'],
    considerations: [],
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
