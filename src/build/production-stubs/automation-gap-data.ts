// ─────────────────────────────────────────────────────────────────────────────
// Production stub for `@/mocks/automation-gap-data` — FSEC-004.
//
// `src/store/auth.ts` clears the development adapter's own store on sign-out,
// through a `require()` guarded by `areSimulatedFeaturesEnabled()`. The guard
// is right — the store only exists where the adapter can run — and the comment
// beside it says the `require` is "required, not imported" so that "a static
// import [does not put] it in every production bundle".
//
// The guard works. The sentence about the bundle did not: a guarded `require`
// is still a dependency edge in Metro's graph, so all 38 KB of fixture data
// shipped anyway. Measured, not assumed — see `production-bundle-shape.test.ts`.
//
// Resolving the module to this file in a production bundle is what makes the
// comment true. The call site is unchanged and still correct: it is guarded, so
// in production it never runs, and this no-op is what it would reach if it did.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The no-op that replaces `resetAutomationState()` in a production bundle.
 *
 * There is no development store to reset, because there is no development
 * adapter, because neither is in the binary.
 */
export function resetAutomationState(): void {
  // Intentionally empty. See the header.
}
