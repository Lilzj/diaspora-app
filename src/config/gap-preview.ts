// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the one switch that decides whether this build may
// simulate a backend capability.
//
// Phases 5, 6, 7 and 12 each register capabilities the certified backend does
// not have, and each builds the complete frontend behind a development adapter.
// Whether those adapters are reachable is decided **here and nowhere else** —
// four separate answers to "is this build allowed to simulate?" would be four
// things to get wrong.
//
// ── The two ways in ──────────────────────────────────────────────────────────
//
//   1. `__DEV__` — React Native's build-time flag. True under Metro and in a
//      debug binary. This is the everyday path and needs no configuration.
//
//   2. `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1` — an **explicit, named opt-in** for
//      internal test builds, set in `eas.json` on the `preview` profile only.
//
// ── Why (2) exists, and what it costs ────────────────────────────────────────
//
// A `preview` APK is a release build, so `__DEV__` is false and every simulated
// surface renders "not available yet". That makes an internal test build
// useless for reviewing precisely the work that most needs reviewing — a tester
// installs it, opens Community Life and hits a wall.
//
// So the guarantee this codebase makes has been narrowed, deliberately and
// visibly, from:
//
//     "no release build ships simulated data"
//
// to:
//
//     "no build ships simulated data unless it explicitly asked to, and the
//      production profile never asks"
//
// That is a real weakening and it is worth being honest about. Three things
// keep it safe:
//
//   * **It is build-time, not runtime.** `EXPO_PUBLIC_*` variables are inlined
//     by Babel when the bundle is built. There is no runtime toggle, no remote
//     flag and no debug menu — a simulated financial capability a support
//     engineer could switch on in production is one that will one day be
//     switched on.
//   * **The production profile does not set it.** `eas.json` gives `production`
//     an explicit empty `env` block so its absence is visible rather than
//     inferred. (`eas.json` is strict JSON and takes no comments, which is why
//     the reasoning lives here.)
//   * **It is loud.** With the flag on, every gap-backed screen renders
//     `<CommunityGapNotice>` / `<GapNotice>` exactly as it does under Metro, so
//     no simulated figure appears unmarked; and `initMocks()` logs which
//     simulated route families it registered.
//
// ── What still cannot happen ─────────────────────────────────────────────────
//
// The flag changes which *simulated* surfaces are reachable. It changes nothing
// about money: every donation still goes to B15's `POST /financial/donations`,
// every membership payment still goes through real B15 payment intents, and
// `community-gap-api.ts` still exports no function that creates a payment, a
// donation or a contribution. That is asserted structurally and does not depend
// on this switch.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The environment variable name, exported so tests and tooling do not
 * re-type it and drift.
 */
export const GAP_PREVIEW_ENV_VAR = 'EXPO_PUBLIC_ENABLE_GAP_PREVIEW';

/**
 * Whether this build may reach the development adapters.
 *
 * `__DEV__` is checked first and short-circuits, so the ordinary development
 * path does not depend on an environment variable being present.
 *
 * The comparison is against the exact string `'1'`. Not truthiness: an
 * accidentally-empty `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=` would otherwise be
 * `''`, and a mistyped `false` would be the string `"false"` — both truthy in
 * the wrong hands. One value means on; everything else means off.
 */
// Verified against a real production export, both ways:
//
//   EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1 npx expo export --platform web --clear
//     → areSimulatedFeaturesEnabled=function(){return!0}
//   npx expo export --platform web --clear
//     → areSimulatedFeaturesEnabled=function(){return!1}
//
// **Pass `--clear`.** Metro caches transforms and the inlining happens at
// transform time, so without it a stale cache silently yields the previous
// build's answer — two runs with different flags produced a byte-identical
// bundle the first time this was checked. A cache hit looks exactly like a
// broken flag, and on EAS it is a non-issue because every build is a fresh
// container.
export function areSimulatedFeaturesEnabled(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) return true;

  // Written as a static member access so Babel can inline it at build time.
  // A computed lookup — `process.env[GAP_PREVIEW_ENV_VAR]` — is not inlined and
  // would read as undefined in a release bundle.
  return process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW === '1';
}

/**
 * Whether the simulated surfaces are on *because somebody asked for them* in a
 * release build, rather than because this is a development build.
 *
 * Used to render the extra "this is an internal test build" banner. A developer
 * running Metro does not need telling; somebody handed an APK does.
 */
export function isGapPreviewBuild(): boolean {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  return !isDev && process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW === '1';
}
