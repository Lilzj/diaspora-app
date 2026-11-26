// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy repositories (Frontend Phase 7)
//
// This file is §34's repository layer. Every hook here is the *stable domain
// interface* a screen depends on, and each one decides for itself which arm
// answers:
//
//   CreatorRepository            → certified client (profile, verification,
//                                  reputation) — the dashboard summary is
//                                  still the development adapter
//   CreatorRewardsRepository     → Phase 5's rewards adapter, reused not forked
//   CreatorAnalyticsRepository   → development adapter        CREATOR-GAP-007
//   CreatorEducationRepository   → development content provider  CREATOR-GAP-006
//   CreatorReferralRepository    → development adapter        CREATOR-GAP-009
//   CreatorGrantRepository       → development adapter        CREATOR-GAP-005
//   CreatorChallengeRepository   → development adapter        CREATOR-GAP-004
//   CreatorRevenueRepository     → **B15 for the balance**, adapter for attribution
//   CreatorSponsorshipRepository → **B15 for the placement**, adapter for approval
//   CreatorEntitlementRepository → **B15 subscriptions and entitlements**
//
// Three properties every hook in here holds to, because a screen relies on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented earnings
//   figure without having had the opportunity to mark it. A screen that ignores
//   the flag is a review comment; a screen that never received one is a bug
//   nobody can see. The two hybrid hooks — revenue and sponsored content —
//   report it *per part*, because marking a real wallet balance as simulated
//   would be its own kind of lie.
//
//   **A disabled build is not an error state.** `areCreatorGapsEnabled()` is
//   false in release, and gap queries are disabled rather than left to fail, so
//   a production binary shows "not available yet" rather than a spinner
//   resolving into a network error.
//
//   **Mutations never retry.** Same rule and same reason as `hooks/financial`:
//   a retried claim is a double claim, and the server's idempotency key is what
//   makes a *deliberate* retry safe.
// ─────────────────────────────────────────────────────────────────────────────

export * from './profile';
export * from './rewards';
export * from './challenges';
export * from './grants';
export * from './academy';
export * from './performance';

/** A named surface, for analytics and for the gap notice on a screen. */
export type { CreatorAccessSurface } from '@/types/creator-economy';
