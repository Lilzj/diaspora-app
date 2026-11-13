// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the development-only module register (FSEC-004).
//
// Every entry names a module that must be ABSENT from a production bundle, and
// the stub Metro resolves in its place. `metro.config.js` performs the swap;
// `src/lib/__tests__/production-bundle-shape.test.ts` checks that each pair
// still lines up and that no production code has grown a new reach into one of
// these modules that the stub does not answer.
//
// ── Why this is a resolver and not a guard ──────────────────────────────────
//
// Because a guard cannot do it. Metro builds its dependency graph from the AST
// at transform time, before any minifier evaluates `if (false)`. A `require()`
// or an `import()` inside an unreachable branch is still an edge, so the module
// is still in the bundle. Resolution is the only layer at which a module can be
// made genuinely absent.
//
// The repository had already tried the other way. `src/store/auth.ts` has
// guarded its `require('@/mocks/automation-gap-data')` since 20 Oct 2026 with a
// comment saying that keeps it out of production bundles. It did not. That is
// why the entry for it is below rather than deleted.
//
// ── Adding an entry ─────────────────────────────────────────────────────────
//
// 1. The stub exports exactly the names production code imports, as no-ops.
// 2. Nothing in a production path may *depend on the behaviour* of the real
//    module — only on it being callable. A stub that returns empty data to a
//    screen that renders it is a fabricated-content defect, which is the
//    opposite problem and a worse one.
// 3. Add a marker string to the test so the exported bundle is checked, not the
//    intention.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');

const posix = (p) => p.split(path.sep).join('/');

/**
 * Modules a production bundle must not contain, each with its replacement.
 *
 * Two kinds, and the difference matters to anyone adding an entry:
 *
 *   `stub` — the replacement is a no-op. Nothing a production build runs may
 *            depend on the real module's behaviour, only on it being callable.
 *
 *   `twin` — the replacement is the same module with material removed. It is
 *            generated from the source, so the two cannot disagree, and a
 *            drift test regenerates and compares.
 *
 * Paths are repository-relative and POSIX-spelled; `stubFor` normalises.
 */
const DEV_ONLY_MODULES = [
  // ── FSEC-003 — the gap registers, each swapped for its generated twin ─────
  //
  // Twins, not stubs, because the registers are load-bearing in production: a
  // gap notice reads an entry's id, title, capability, backendStatus,
  // backendPartialNote and the first line of its missing contract, and must go
  // on reading exactly those. What the twin drops is the engineering record
  // around them — ~405 KB — which only the four developer gap screens render,
  // and only when the simulated features are on.
  //
  // `scripts/generate-production-registers.js` derives them;
  // `production-registers-drift.test.ts` keeps them current.
  ...require('./generate-production-registers')
    .registers()
    .map(({ source, twin }) => ({
      kind: 'twin',
      module: posix(source),
      stub: posix(twin),
      reason: 'FSEC-003 — the engineering prose in a gap register',
    })),

  {
    // The development API adapter and its 32-module closure: every handler,
    // ~1.7 MB of fixtures, `served-routes.ts`, and `axios-mock-adapter` — a
    // devDependency, which is what made `npm audit --omit=dev` an incomplete
    // description of what ships (FSEC-001).
    kind: 'stub',
    module: 'src/mocks/index.ts',
    stub: 'src/build/production-stubs/mocks.ts',
    reason: 'FSEC-004 — the mock adapter, its handlers and its fixtures',
  },
  {
    // Reached from `src/store/auth.ts` on sign-out, already guarded there.
    kind: 'stub',
    module: 'src/mocks/automation-gap-data.ts',
    stub: 'src/build/production-stubs/automation-gap-data.ts',
    reason: 'FSEC-004 — the development automation store',
  },
];

/** Windows resolves case-insensitively; comparing raw strings would miss. */
function key(absolutePath) {
  const normalised = path.normalize(absolutePath);
  return process.platform === 'win32' ? normalised.toLowerCase() : normalised;
}

/**
 * The stub that replaces `resolvedPath`, or null if it is not dev-only.
 *
 * Takes a RESOLVED absolute path rather than the specifier as written, so a
 * module reached as `@/mocks`, `../mocks` or `./index` is caught the same way.
 */
function stubFor(resolvedPath, rootDir) {
  if (!resolvedPath) return null;
  const wanted = key(resolvedPath);
  for (const entry of DEV_ONLY_MODULES) {
    if (key(path.resolve(rootDir, entry.module)) === wanted) {
      return path.resolve(rootDir, entry.stub);
    }
  }
  return null;
}

/**
 * Whether this bundle may contain the development modules.
 *
 * Mirrors `areSimulatedFeaturesEnabled()` in `src/config/gap-preview.ts`, which
 * is `__DEV__ || EXPO_PUBLIC_ENABLE_GAP_PREVIEW === '1'`. Metro's `context.dev`
 * is the same flag `__DEV__` compiles to, so the two answers cannot drift.
 *
 * **Compared with `=== false`, deliberately.** If a future Metro stops
 * providing `dev` on the resolution context, `dev === false` is false and no
 * swap happens: the bundle goes back to containing the mocks, which is today's
 * behaviour and merely a finding. The other spelling — `!context.dev` — would
 * strip the adapter out of *development* builds the moment the field moved,
 * and no unit test would see it, because jest does not run Metro.
 */
function maySimulate(context) {
  if (process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW === '1') return true;
  return context.dev !== false;
}

module.exports = { DEV_ONLY_MODULES, stubFor, maySimulate };
