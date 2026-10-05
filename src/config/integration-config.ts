// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — integration configuration (Frontend Phase 16, §38 · §39 · §67)
//
// The only place in the application that reads an integration-related
// environment variable. `map-config.ts` is the equivalent for Phase 8 and the
// two are deliberately separate files rather than one: maps were configured a
// phase ago with their own reasoning written down, and merging them would mean
// editing that reasoning to say something it did not.
//
// ── The reads are spelled out, and must stay that way ────────────────────────
//
// Every read is a **static member access** on `process.env`:
//
//     process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
//
// and never `process.env[name]`. Babel's Expo preset inlines the first at build
// time and leaves the second as a runtime lookup resolving to `undefined` in a
// release bundle. The loop that would tidy this file up is exactly the change
// that breaks it in production and nowhere else. Phase 5 recorded this in
// `gap-preview.ts` and Phase 8 in `map-config.ts`; this is the third time and it
// is still true.
//
// ── What may and may not live here (§38, §39) ────────────────────────────────
//
// `EXPO_PUBLIC_*` variables are compiled into the JavaScript bundle and are
// extractable from the APK by anyone who wants them. So:
//
//   MAY be read here — values that are public by design and protected by
//   restriction rather than secrecy:
//     * an OAuth **client id** (public half of a public/confidential pair;
//       Google's own documentation publishes them in native app source)
//     * a **bundle/package identifier** used in a redirect URI
//     * a **feature switch** saying whether a provider is configured at all
//
//   MUST NOT be read here, and none is:
//     * an OAuth **client secret** — §38's first prohibition
//     * a **service account** key of any kind
//     * a **payment gateway** secret or publishable key. Even the publishable
//       one is absent: B15 returns the gateway names from
//       `/financial/capabilities`, so the client never needs to be told which
//       gateway it is talking to, and a variable that exists is a variable
//       somebody eventually puts the wrong value in.
//     * a **push server key** (FCM server key, APNs .p8). Push tokens go from
//       the OS to Diaspora's own backend; no provider credential is needed on
//       the device at all.
//     * a provider API key. Every third-party integration is proxied —
//       see FRONTEND-PHASE16-GAP-030.
//
// `integration-boundary.test.ts` asserts the absent ones stay absent by
// checking this module's source for the forbidden names, because a comment
// saying "we do not read secrets" is not a control.
//
// ── The OAuth architecture this file assumes, and why ────────────────────────
//
// §38 says "prefer backend-managed OAuth where architecture calls for it", and
// for this application it does. The device performs the **authorization code
// flow with PKCE** and sends the resulting code to Diaspora's backend, which
// exchanges it. The device never sees a refresh token and never holds a client
// secret, because there is none to hold.
//
// The consequence is that the client id below is genuinely all the device
// needs, and the exchange endpoint is a backend gap
// (FRONTEND-PHASE16-GAP-002) rather than something this phase could work
// around by putting a secret in the bundle.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** The variable names, exported so tests and tooling do not re-type them and drift. */
export const INTEGRATION_ENV_VARS = {
  /** Public half of the OAuth pair. Never the secret — see the header. */
  googleOAuthClientId: 'EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID',
  /** iOS variant. Google issues a separate client id per platform. */
  googleOAuthIosClientId: 'EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID',
  /** Which push transport this build was compiled against. */
  pushProvider: 'EXPO_PUBLIC_PUSH_PROVIDER',
  /** Expo's project id, needed to mint an Expo push token. Public. */
  pushExpoProjectId: 'EXPO_PUBLIC_PUSH_EXPO_PROJECT_ID',
  /** The scheme OAuth and payment callbacks return to. Defaults to app.json's. */
  deepLinkScheme: 'EXPO_PUBLIC_DEEP_LINK_SCHEME',
} as const;

/** app.json's `scheme`. The fallback, so an unset variable is still a working app. */
const DEFAULT_SCHEME = 'diaspora';

export type PushProviderKind = 'expo' | 'fcm' | 'apns' | 'none';

export interface IntegrationConfig {
  /** Empty when unconfigured. Never logged, never rendered, never in a bug report. */
  googleOAuthClientId: string;
  googleOAuthIosClientId: string;
  pushProvider: PushProviderKind;
  pushExpoProjectId: string;
  deepLinkScheme: string;
  environment: 'development' | 'staging' | 'production';
}

function readEnv() {
  // Static accesses only. See the header — a computed lookup is not inlined.
  return {
    googleOAuthClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? '',
    googleOAuthIosClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID ?? '',
    pushProvider: process.env.EXPO_PUBLIC_PUSH_PROVIDER ?? '',
    pushExpoProjectId: process.env.EXPO_PUBLIC_PUSH_EXPO_PROJECT_ID ?? '',
    deepLinkScheme: process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME ?? '',
  };
}

/**
 * The same three-way environment Phase 8 resolves, by the same rule, so the
 * diagnostics surfaces agree with each other.
 */
export function resolveIntegrationEnvironment(): IntegrationConfig['environment'] {
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) return 'development';
  return areSimulatedFeaturesEnabled() ? 'staging' : 'production';
}

function parsePushProvider(raw: string): PushProviderKind {
  // Exact matches only. A mistyped value means "no push provider configured",
  // which degrades to the development adapter in a development build and to a
  // clearly-labelled unavailable state in production — both better than
  // silently selecting a transport the build was not compiled for.
  if (raw === 'expo') return 'expo';
  if (raw === 'fcm') return 'fcm';
  if (raw === 'apns') return 'apns';
  return 'none';
}

/**
 * The active configuration.
 *
 * Recomputed on each call rather than captured in a module constant, so a test
 * can set the environment and observe the effect without resetting modules —
 * the same decision, for the same reason, as `getMapProviderConfig()`.
 */
export function getIntegrationConfig(): IntegrationConfig {
  const env = readEnv();

  return {
    googleOAuthClientId: env.googleOAuthClientId,
    googleOAuthIosClientId: env.googleOAuthIosClientId,
    pushProvider: parsePushProvider(env.pushProvider),
    pushExpoProjectId: env.pushExpoProjectId,
    deepLinkScheme: env.deepLinkScheme || DEFAULT_SCHEME,
    environment: resolveIntegrationEnvironment(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURED-NESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Whether Google identity/calendar authorization can even be attempted.
 *
 * A client id alone is enough for the device's half of PKCE. The backend
 * exchange endpoint is the other half and does not exist
 * (FRONTEND-PHASE16-GAP-002), which is why `resolveGoogleCalendarProvider()`
 * checks this *and* the gap switch rather than this alone — a configured client
 * id with nowhere to send the code would produce an authorization screen that
 * ends in a 404, which is worse than one that never opens.
 */
export function isGoogleOAuthConfigured(): boolean {
  const config = getIntegrationConfig();
  return config.googleOAuthClientId.length > 0 || config.googleOAuthIosClientId.length > 0;
}

export function isPushConfigured(): boolean {
  const config = getIntegrationConfig();
  if (config.pushProvider === 'none') return false;
  // Expo's transport needs a project id; the native transports get their
  // configuration from the native project rather than from an env var.
  if (config.pushProvider === 'expo') return config.pushExpoProjectId.length > 0;
  return true;
}

/**
 * The OAuth/payment redirect URI this build will hand to a provider.
 *
 * Built from the scheme rather than hardcoded so a white-label build changes
 * one variable. `path` is a fixed segment per flow — never member data, because
 * a redirect URI ends up in a provider's logs and in the device's URL history
 * (§48, and the privacy rule against personal data in query strings).
 */
export function buildRedirectUri(path: 'oauth' | 'payment' | 'verify'): string {
  return `${getIntegrationConfig().deepLinkScheme}://integrations/${path}`;
}

/**
 * A one-line description of the active integration configuration.
 *
 * Contains **no identifier of any kind** — not a client id, not a prefix of
 * one, not a project id. Phase 8's `describeMapConfiguration()` makes the same
 * promise for the same reason: this string is designed to be safe to paste into
 * a bug report, and a truncated credential in a log is still a credential in a
 * log. Booleans only.
 */
export function describeIntegrationConfiguration(): string {
  const config = getIntegrationConfig();

  const configured = [
    isGoogleOAuthConfigured() ? 'google-oauth' : null,
    isPushConfigured() ? `push:${config.pushProvider}` : null,
  ].filter(Boolean);

  return `integrations: ${config.environment} · ${
    configured.length > 0 ? configured.join(', ') : 'none configured'
  }`;
}
