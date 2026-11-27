// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life repositories (Frontend Phase 12)
//
// This file is §42's repository layer. Every hook here is the *stable domain
// interface* a screen depends on, and each one decides for itself which arm
// answers:
//
//   CommunityLifeRepository        → B12 events/orgs + adapter for the rest
//   MembershipRepository           → development adapter        GAP-001/002
//   RecurringEventsRepository      → development adapter        GAP-004/005
//   DonationRepository             → **B15 for the money**, adapter for context
//   FundraisingRepository          → **B15 for the totals**, adapter for lifecycle
//   VolunteerRepository            → development adapter        GAP-009/010/011
//   PollRepository                 → development adapter        GAP-012
//   OrganizationCommunityRepository→ development adapter        GAP-013/014
//   NeighborhoodEventsRepository   → **B12 for proximity**, adapter for binding
//   AnalyticsRepository            → development adapter        GAP-014/017
//
// Four properties every hook in here holds to, because a screen relies on them:
//
//   **`isSimulated` travels with the data.** A hook that can return simulated
//   data always reports it, so a screen cannot render an invented fundraising
//   total without having had the opportunity to mark it. A screen that ignores
//   the flag is a review comment; a screen that never received one is a bug
//   nobody can see. The hybrid hooks report it *per part*, because marking B15's
//   real `raised` figure as simulated would be its own kind of lie.
//
//   **A disabled build is not an error state.** `areCommunityGapsEnabled()` is
//   false in release, and gap queries are disabled rather than left to fail, so
//   a production binary shows "not available yet" rather than a spinner
//   resolving into a network error.
//
//   **Mutations never retry.** Same rule and same reason as `hooks/financial`:
//   a retried application is a double application, and the persisted idempotency
//   key is what makes a *deliberate* retry safe.
//
//   **Nothing financial is concluded here.** A donation's success comes from
//   B15's `GivingStatus`. A membership payment's success comes from re-reading
//   the payment intent. There is no branch in this file that infers a financial
//   outcome from an HTTP 200, and `useMembershipCheckout` is written the long
//   way round precisely to make that impossible.
// ─────────────────────────────────────────────────────────────────────────────

// On '@/lib/api/community-programme-api', imported by 8 of the files here:
//
// Remediation Wave C-04. `Diaspora.Modules.CommunityProgramme` shipped the
// membership programme, volunteering, polls, organization capabilities and
// announcements at the register's own paths under `/api/v1/communities`, so the
// arms below moved off `gapApi` and onto this one. What stays on `gapApi` stays
// there because B18 does not serve it — neighbourhood bindings and the campaign
// wrapper's donation stitching — and each of those is still marked simulated on
// the screen. (The hub summary and its recommendations left `gapApi` on 20 Oct
// 2026: the hub is composed from real reads, and dismissal is the platform's
// `POST /recommendations/dismiss`.)
//
// Deliberately **not** `community-social-api.ts`. That module serves
// `Diaspora.Modules.Community` (`/api/v1/community`, singular) — the social
// graph — which is a different domain with a nearly identical name. The two are
// never merged here.

export * from './hub';
export * from './events';
export * from './attendance';
export * from './organizations';
export * from './memberships';
export * from './series';
export * from './campaigns';
export * from './donations';
export * from './volunteering';
export * from './polls';
