// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trust hooks (Remediation Wave D-4)
//
// The read layer for `lib/trust-api.ts`. What these replace is not another
// hooks file — there was none — but `store/trust.ts`, a zustand store that held
// the member's verification statuses, account health, badges, country standings
// and trust journey as **seeded local state**, and `lib/trustEngine.ts`, which
// computed feature unlocks and a risk score from it.
//
// ── Why every staleTime here is measured in minutes ──────────────────────────
//
// The Trust module's route group carries `RequireRateLimiting(
// "diaspora-signin")` — **10 requests per 60 seconds, partitioned by IP
// address** rather than by member. The Trust Centre alone needs profile +
// timeline + feature requirements; the reputation dashboard needs two more.
// Five of the ten, for one member, on one screen visit, on a connection several
// members might share.
//
// So: nothing polls, nothing refetches on focus, and the `staleTime`s are long
// enough that a member moving between the Trust Centre and the reputation
// screen and back does not spend a second budget. Verification state does not
// change second to second — a review has a 24-to-48-hour SLA — and pretending
// otherwise would cost the member a 429 on the screen that explains why they
// are restricted.
//
// ── The one thing that is deliberately not a query ───────────────────────────
//
// `useEligibilityCheck` is a **mutation**, not a query, and it is not cached. A
// non-dry-run evaluation consumes a rate-limit permit server-side, which makes
// it a write however much it reads like a question; and caching "may I publish?"
// is how a member who has just been verified is still told they cannot.
// ─────────────────────────────────────────────────────────────────────────────

export * from './profile';
export * from './verifications';
export * from './appeals';
export * from './reputation';
export * from './eligibility';
export * from './moderation';
