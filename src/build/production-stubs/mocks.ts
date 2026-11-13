// ─────────────────────────────────────────────────────────────────────────────
// Production stub for `@/mocks` — FSEC-004.
//
// Metro resolves `@/mocks` to this file instead of `src/mocks/index.ts` when
// the bundle is a production one. See `metro.config.js` for the swap and for
// why it is a resolver rather than an `if`.
//
// ── Why a stub exists at all ────────────────────────────────────────────────
//
// `src/mocks/index.ts` already refuses to install its adapter in a production
// build, and that gate is correct: `mockApi` is `null`, nothing can register a
// handler against it, and a release binary talks to the real backend. The gate
// protects *behaviour*.
//
// It does not protect *presence*. A static `import { initMocks } from '@/mocks'`
// in `app/_layout.tsx` puts the module and its 32-module import closure — the
// handlers, 1.7 MB of fixtures and `axios-mock-adapter`, a devDependency — into
// the bundle whatever the gate then decides. Measured on the 13 Nov 2026
// baseline export: the adapter's own startup log and every sampled fixture
// string were in the shipped Hermes bytecode.
//
// ── Why the call site cannot fix it ─────────────────────────────────────────
//
// Neither `if (areSimulatedFeaturesEnabled()) require('@/mocks')` nor
// `void import('@/mocks')` removes anything. Metro collects dependencies from
// the AST at transform time, before any minifier sees the guard, so a `require`
// or an `import()` inside dead code is still a graph edge and the module is
// still bundled.
//
// That is not a prediction. `src/store/auth.ts` has carried exactly that
// pattern since 20 Oct 2026, with a comment saying it keeps the module out of
// production bundles, and all ten sampled strings from the module it guards
// were present in the baseline export. The comment was wrong for three weeks
// because nothing measured it. `src/lib/__tests__/production-bundle-shape.test.ts`
// is what measures it now.
//
// ── What this file must export ──────────────────────────────────────────────
//
// Exactly the names production code imports from `@/mocks`, as no-ops. The test
// above reads both files and fails if the real module grows an export that
// production code uses and this one does not have. Do not add an export here
// speculatively: an unused no-op that shadows a real one is the failure this
// whole finding is about, pointing the other way.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The no-op that replaces `initMocks()` in a production bundle.
 *
 * Silent on purpose. The real `initMocks()` logs "no mock adapter installed" so
 * a tester reading a startup log can tell which kind of build they have — but
 * that line only means something where the adapter *could* have been installed.
 * Here there is no adapter, no handler and no fixture in the binary at all, and
 * a log line claiming a decision was made would misdescribe a bundle in which
 * nothing was ever there to decide about.
 */
export function initMocks(): void {
  // Intentionally empty. See the header.
}
