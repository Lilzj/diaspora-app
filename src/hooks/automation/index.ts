// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation hooks (Frontend Phase 18, §4 · §57 · §68)
//
// The stable interface above the two repository arms. §4's requirement is that
// a screen must not know whether automation is backend-driven, queue-driven,
// scheduled, event-driven, webhook-driven, mocked or development-only — and
// this file is where that stops being a principle and becomes a signature.
//
// A screen calls `useAutomations()` and receives `AutomationDefinition[]`.
// Behind that one call:
//
//   * B13's real `/notifications/preferences` decides which channels an action
//     can use,
//   * B13's real `/notifications/categories` supplies the categories,
//   * Phase 16's registry decides whether a calendar action is available,
//   * the development adapter answers for everything with no contract,
//   * and the four are composed into one list.
//
// The screen sees none of that. What it does see, and is **required** to
// render, is `isSimulated` — because §57 forbids mock execution looking
// indistinguishable from real execution, and the only way to make that
// enforceable is to make the marker unavoidable.
//
// ── §68, and the one thing every hook here has in common ─────────────────────
//
// Every query key comes from `lib/automation/query-keys.ts` and every one
// carries the member and, where the data is scoped, the scope. No hook builds
// an array literal. §58 asks for a *proof* that one member's automations cannot
// appear for another and that one community's cannot appear under another, and
// a proof needs one place to reason about.
//
// ── The retry policy, and why it is not the default ──────────────────────────
//
// `shouldRetryAutomation` never retries a backend gap. Almost every query in
// this phase resolves to a gap in production, and TanStack's default three
// attempts would mean three seconds of spinner before a screen that was always
// going to say "not available yet". It also never retries an indeterminate
// failure, which is how one activation becomes two.
// ─────────────────────────────────────────────────────────────────────────────

export * from './scopes';
export * from './catalog';
export * from './automations';
export * from './runs';
export * from './reminders';
