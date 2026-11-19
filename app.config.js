// Expo reads this file in preference to app.json and hands it app.json's contents
// as `config`, so app.json stays the single source for everything static.
//
// It exists for what app.json cannot do: read the environment. Three things need
// that, and each is a separate step below.
//
// ── 1. The Google Maps Android key ──────────────────────────────────────────
//
// The key has to reach the native manifest at build time. It comes from
// EXPO_PUBLIC_MAP_ANDROID_KEY (an EAS environment variable, or .env locally), the
// same variable `src/config/map-config.ts` reads to decide whether the native map
// may be selected. One variable means the manifest and the selector cannot
// disagree: no key, no plugin entry, and the app keeps the schematic canvas map.
//
// The key is not secret — it ships in the APK — and is protected by restricting it
// in Google Cloud to package `com.diaspora.app` plus the signing SHA-1, and to the
// Maps SDK for Android only.
//
// ── 2. google-services.json ─────────────────────────────────────────────────
//
// The file is gitignored, so EAS never uploads it; on the build server it arrives
// as the GOOGLE_SERVICES_JSON file variable (a path), and locally the file beside
// this one is used. Without it the APK has no Firebase project and push never
// registers.
//
// ── 3. The loopback cleartext exception (FSEC-009, 19 Nov 2026) ─────────────
//
// `plugins/with-loopback-cleartext` points the Android manifest at a
// `network_security_config.xml` permitting cleartext to `10.0.2.2`, `127.0.0.1`
// and `localhost` — and to nothing else, because it writes no `base-config`, so
// the platform default of refusing cleartext still applies to every real host.
//
// It was listed in `app.json`, which meant **every** profile got it, production
// included. The plugin's purpose is a release build that can reach a
// `Diaspora.Api` running on the machine the device is attached to; a store build
// has no such server and no reason to carry the exception. The risk was small —
// the base URL is an `https://` constant, so no shipped code path starts a
// cleartext request to loopback — but it is a deviation from secure-by-default
// in an artefact handed to members, and it leaves a channel open for any future
// code path that accepts a server- or link-supplied URL.
//
// **No profile in `eas.json` sets the variable**, which
// `src/config/__tests__/loopback-cleartext.test.ts` asserts by reading that file
// — this sentence is worth no more than the test behind it, which is the whole
// of FSEC-005. The audit suggested setting it on `preview`; this does not, for
// the reason the `preview` profile already stopped setting
// EXPO_PUBLIC_ENABLE_GAP_PREVIEW on 20 Oct 2026 — a build handed to testers
// should have the same posture as the one handed to members, and a tester APK
// with a cleartext exception is the finding again one profile down. It is set by
// hand, for the one build that needs to reach a local server:
//
//     DIASPORA_ALLOW_LOOPBACK_CLEARTEXT=1 npx expo prebuild --platform android
//
// Compared against the exact string `'1'` rather than for truthiness, so an
// empty or mistyped value is off. `src/config/__tests__/loopback-cleartext.test.ts`
// asserts both directions.

/** The Android manifest may permit cleartext to loopback for this build. */
const LOOPBACK_CLEARTEXT_VAR = 'DIASPORA_ALLOW_LOOPBACK_CLEARTEXT';
const LOOPBACK_CLEARTEXT_PLUGIN = './plugins/with-loopback-cleartext';

function withGoogleServices(config) {
  return process.env.GOOGLE_SERVICES_JSON
    ? {
        ...config,
        android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON },
      }
    : config;
}

function withMapKeys(config) {
  const androidKey = process.env.EXPO_PUBLIC_MAP_ANDROID_KEY;
  const iosKey = process.env.EXPO_PUBLIC_MAP_IOS_KEY;

  if (!androidKey && !iosKey) return config;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
          ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
        },
      ],
    ],
  };
}

function withLoopbackCleartext(config) {
  // A computed `process.env[...]` lookup, which would be wrong in anything that
  // ships: Babel inlines only static member access, so a computed one reads as
  // `undefined` in a bundle — the trap `src/config/gap-preview.ts` documents and
  // `expo/no-dynamic-env-var` refuses. This file is never bundled; it runs in
  // Node during prebuild, where the lookup is ordinary. Do not copy the shape
  // into `src/`.
  if (process.env[LOOPBACK_CLEARTEXT_VAR] !== '1') return config;

  return { ...config, plugins: [...(config.plugins ?? []), LOOPBACK_CLEARTEXT_PLUGIN] };
}

module.exports = ({ config }) =>
  withLoopbackCleartext(withMapKeys(withGoogleServices(config)));

module.exports.LOOPBACK_CLEARTEXT_VAR = LOOPBACK_CLEARTEXT_VAR;
module.exports.LOOPBACK_CLEARTEXT_PLUGIN = LOOPBACK_CLEARTEXT_PLUGIN;
