// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map provider configuration and feature gates
// (Frontend Phase 8, §45, §58)
//
// §45 is unambiguous: provider credentials and configuration must never be
// hardcoded, and must be environment-specific even when the key is a
// client-safe public one. This file is the only place in the application that
// reads a map-related environment variable.
//
// ── Why the reads look repetitive ────────────────────────────────────────────
//
// Every read is written as a **static member access** on `process.env`:
//
//     process.env.EXPO_PUBLIC_MAP_PROVIDER
//
// and never as `process.env[name]`. Babel's Expo preset inlines the first at
// build time and leaves the second as a runtime lookup that resolves to
// `undefined` in a release bundle. So the loop that would tidy this file up is
// precisely the change that would break it in production and nowhere else —
// which is why it is spelled out and why this comment exists. Phase 5 learned
// the same lesson in `gap-preview.ts` and it is recorded there too.
//
// ── What is and is not a secret ──────────────────────────────────────────────
//
// `EXPO_PUBLIC_*` variables are compiled into the JavaScript bundle and are
// extractable by anyone with the APK. That is fine for a map key and fatal for
// anything else. The rule this file follows:
//
//   * A **client map key** may live here, because it is restricted by package
//     name and signing certificate on the provider side. Restriction, not
//     secrecy, is what protects it.
//   * A **routing, geocoding or transit key** must not. Those are billed per
//     request, are rarely restrictable to a mobile package, and belong behind
//     the backend proxy described in MAP-PROVIDER-GAP-003. This file reads no
//     such key, and the absence is deliberate rather than an oversight.
//
// No key of any kind is committed. Every value below defaults to empty, and an
// empty key means the provider is unconfigured and the fallback is used.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { areSimulatedFeaturesEnabled } from './gap-preview';

/** The environment variable names, exported so tests and tooling do not drift. */
export const MAP_ENV_VARS = {
  provider: 'EXPO_PUBLIC_MAP_PROVIDER',
  androidKey: 'EXPO_PUBLIC_MAP_ANDROID_KEY',
  iosKey: 'EXPO_PUBLIC_MAP_IOS_KEY',
  webKey: 'EXPO_PUBLIC_MAP_WEB_KEY',
  styleUrl: 'EXPO_PUBLIC_MAP_STYLE_URL',
  routingEnabled: 'EXPO_PUBLIC_MAP_ROUTING_ENABLED',
  transitEnabled: 'EXPO_PUBLIC_MAP_TRANSIT_ENABLED',
} as const;

/**
 * Which tile provider this build is configured for.
 *
 * `canvas` is not a degraded mode. It is a complete, self-contained schematic
 * renderer that needs no key, no native module and no network, and it is the
 * default precisely so that a build with no configuration is a working build.
 */
export type MapProviderKind = 'canvas' | 'native';

export type MapEnvironment = 'development' | 'staging' | 'production';

export interface MapProviderConfig {
  kind: MapProviderKind;
  environment: MapEnvironment;
  /** Empty when unconfigured. Never logged, never rendered. */
  androidKey: string;
  iosKey: string;
  webKey: string;
  /** Custom style/tile URL where the provider supports one. */
  styleUrl: string;
  /** True when the native surface has everything it needs to be selected. */
  isNativeConfigured: boolean;
}

function readEnv(): {
  provider: string;
  androidKey: string;
  iosKey: string;
  webKey: string;
  styleUrl: string;
  routing: string;
  transit: string;
} {
  // Static accesses only. See the header — a computed lookup is not inlined.
  return {
    provider: process.env.EXPO_PUBLIC_MAP_PROVIDER ?? '',
    androidKey: process.env.EXPO_PUBLIC_MAP_ANDROID_KEY ?? '',
    iosKey: process.env.EXPO_PUBLIC_MAP_IOS_KEY ?? '',
    webKey: process.env.EXPO_PUBLIC_MAP_WEB_KEY ?? '',
    styleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? '',
    routing: process.env.EXPO_PUBLIC_MAP_ROUTING_ENABLED ?? '',
    transit: process.env.EXPO_PUBLIC_MAP_TRANSIT_ENABLED ?? '',
  };
}

export function resolveMapEnvironment(): MapEnvironment {
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) return 'development';
  return areSimulatedFeaturesEnabled() ? 'staging' : 'production';
}

/**
 * The active provider configuration.
 *
 * Recomputed on each call rather than captured in a module constant, so a test
 * can set the environment and observe the effect without resetting modules.
 * It is three property reads and a comparison; there is nothing to cache.
 */
export function getMapProviderConfig(): MapProviderConfig {
  const env = readEnv();
  const environment = resolveMapEnvironment();

  // A key is required, not just a provider name. `EXPO_PUBLIC_MAP_PROVIDER=native`
  // with no key produces a grey rectangle where the map should be — the single
  // most common way a map integration ships broken. Requiring both means a
  // half-configured build falls back to a renderer that works.
  //
  // **The key must be this platform's** (27 Sep 2026). The native surface always
  // asks for Google's provider, and Google's terms forbid showing its routes or
  // places on any other map. An Android key alone used to switch iOS to Google
  // tiles with no iOS key, which is a grey rectangle and a licence problem.
  const platformKey =
    Platform.OS === 'android' ? env.androidKey : Platform.OS === 'ios' ? env.iosKey : env.webKey || env.styleUrl;
  const isNativeConfigured = env.provider === 'native' && Boolean(platformKey);

  return {
    kind: isNativeConfigured ? 'native' : 'canvas',
    environment,
    androidKey: env.androidKey,
    iosKey: env.iosKey,
    webKey: env.webKey,
    styleUrl: env.styleUrl,
    isNativeConfigured,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE GATES — §58
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §58's flags.
 *
 * The distinction §58 draws is the important one and it is worth restating:
 * these gates do **not** hide unfinished work behind a permanent "Coming Soon".
 * Every capability below is fully implemented. A gate answers a different
 * question — *is the dependency this capability needs available in this
 * environment* — and when the answer is no the screen explains which dependency
 * and what it would take, rather than showing a shrug.
 */
export interface MapFeatureFlags {
  mapsEnabled: boolean;
  navigationEnabled: boolean;
  routePlanningEnabled: boolean;
  transitEnabled: boolean;
  heatMapsEnabled: boolean;
  safetyScoresEnabled: boolean;
  costOfLivingEnabled: boolean;
  neighborhoodScoresEnabled: boolean;
  communityAlertsEnabled: boolean;
  realtimeMapUpdatesEnabled: boolean;
  /** Offering to hand off to the device's navigation app. Always available. */
  externalNavigationEnabled: boolean;
}

export function getMapFeatureFlags(): MapFeatureFlags {
  const env = readEnv();
  const simulated = areSimulatedFeaturesEnabled();

  return {
    // Always on. The canvas renderer means the map surface has no unmet
    // dependency in any environment, which is the entire reason it exists.
    mapsEnabled: true,

    // Live community alerts are B9 Community Updates read through a real
    // contract, so this is on in production. Only the affected-area geometry is
    // simulated, and that degrades to a point marker rather than to nothing.
    communityAlertsEnabled: true,

    // Route planning is a complete UX over an estimated routing adapter. In
    // production, with no routing provider, it stays reachable and every figure
    // is labelled as an estimate — §58 says a capability may be implemented and
    // its dependency unavailable, and this is that case rather than a hidden
    // screen.
    routePlanningEnabled: true,
    externalNavigationEnabled: true,

    // In-app guidance is the one capability §18 explicitly forbids claiming
    // without provider support. Off in production; the route screen offers the
    // device hand-off instead, which is a real capability rather than a stub.
    navigationEnabled: env.routing === '1' || simulated,

    // Transit needs a timetable. Nothing derives one, so production shows the
    // provider-gap notice on the transit tab rather than a fabricated itinerary.
    transitEnabled: env.transit === '1' || simulated,

    // Heat layers read the certified `GET /geo/heatmap` in every build (all
    // eight layers since 20 Oct 2026). What a layer cannot show, the server
    // says, and the screen shows that reason.
    heatMapsEnabled: true,
    neighborhoodScoresEnabled: true,
    safetyScoresEnabled: true,
    costOfLivingEnabled: true,

    // Subscribes through the existing platform realtime seam where a channel
    // exists, and degrades to bounded refetch where none does.
    realtimeMapUpdatesEnabled: true,
  };
}

/**
 * Whether a capability may show *fully detailed* data in this build.
 *
 * The pairing that keeps §23/§25/§26 honest. `neighborhoodScoresEnabled` is
 * true everywhere because the certified route returns real numbers; this is
 * false in production because the nine-dimension breakdown around them does
 * not exist. A screen consults both: it renders the real figures either way,
 * and renders the simulated breakdown only when this is true.
 */
export function canShowSimulatedDetail(): boolean {
  return areSimulatedFeaturesEnabled();
}

/**
 * A one-line description of the active map configuration.
 *
 * Deliberately never includes a key, not even a prefix. A truncated key in a
 * log is still a key in a log, and this string is designed to be safe to paste
 * into a bug report.
 */
export function describeMapConfiguration(): string {
  const config = getMapProviderConfig();
  const flags = getMapFeatureFlags();

  const surface = config.kind === 'native' ? 'native tiles' : 'schematic canvas';
  const enabled = [
    flags.navigationEnabled ? 'navigation' : null,
    flags.transitEnabled ? 'transit' : null,
    flags.heatMapsEnabled ? 'heat maps' : null,
  ].filter(Boolean);

  return `maps: ${surface} · ${config.environment} · ${
    enabled.length > 0 ? enabled.join(', ') : 'core only'
  }`;
}
