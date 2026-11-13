// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `community-gaps.ts`, derived by
// `node scripts/generate-production-registers.js`. Metro resolves this file in
// place of its source when the bundle is a production one; see
// `metro.config.js` and `scripts/production-stubs.js`.
//
// Identical to the source except that these fields are emptied, because nothing
// a member can reach in a production build renders them (FSEC-003):
//
//   existingBackendCapability — community/gaps only
//   frontendBehaviour — analytics/gaps, community/gaps, creator/gaps, map/diagnostics
//   existingSeams — creator/gaps only
//   whyNotImplementable — analytics/gaps, community/gaps, creator/gaps, and the __DEV__-gated note in wallet/protection
//   privacyConsiderations — analytics/gaps, community/gaps
//   securityConsiderations — analytics/gaps, community/gaps
//   caching — community/gaps only
//   integrationWork — map/diagnostics only
//   considerations — no reader outside the registers
//   requiredContracts — analytics/gaps, community/gaps — and emptying it takes the nested request, response, authorization, idempotency, aggregation and retryBehaviour shapes with it
//   currentBehaviour — map/diagnostics — and MapsGapNotice, but only out of MAP_PROVIDER_GAPS
//   missingBackendCapability — analytics/gaps, community/gaps — and two notices, but only out of ANALYTICS_GAPS and MULTI_COMMUNITY_GAPS
//
// Edit the source. `production-registers-drift.test.ts` fails if this file
// stops matching what this script would produce from it.

// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 12, Advanced
// Community Life)
//
// ⚠ EVERYTHING REGISTERED HERE IS UNSUPPORTED BY THE CERTIFIED BACKEND. ⚠
//
// Phase 12 is an orchestration phase. Most of what Advanced Community Life needs
// already exists somewhere on this platform, and this phase uses it rather than
// forking it:
//
//   B12 Community    real events, real organizations, real calendar, under
//                    `/community-life/*`. Every one-time event, every
//                    organization profile and every holiday on a Phase 12 screen
//                    comes from there. Nothing in this phase re-implements an
//                    event.
//   B15 Financial    real wallets, payment intents, catalogue, purchases,
//                    subscriptions — and, importantly, **real giving**:
//                    `DonationCause`, `POST /financial/donations`,
//                    `ContributionFund`, `POST /financial/contributions` and
//                    `GET /financial/giving/me`. Every pound a member gives on a
//                    Phase 12 screen moves through B15. There is no second
//                    wallet and no second payment system.
//   B13/B13.1/.2     real notifications and conversations. No Phase 12
//                    notification is delivered by this phase; the platform inbox
//                    carries them, and `notification-routes.ts` already routes
//                    them.
//   B14              recommendations. Community recommendations are a *surface*
//                    on the existing engine, never a second engine.
//   Phase 5/6/7      the wallet UI, the checkout, the entitlement ladder, the
//                    creator programme. Membership checkout is Phase 5's payment
//                    sheet; it is not a new one.
//
// What is left over is this file: the capabilities with no contract behind them
// anywhere on the certified surface. Each entry was written after searching the
// certified modules for it and not finding it — not from a roadmap.
//
// The three mechanisms Phase 5 established, unchanged, because they work:
//
//   1. **A different URL space.** Community gap endpoints live under
//      `/community-gap/v0/…`. Never `/community-life` (B12 owns that), never
//      `/financial` (B15 owns that). A gap call that escaped to a real
//      deployment 404s at the gateway. It cannot collide with, shadow, or be
//      mistaken for a certified route, and it cannot move real money.
//   2. **A visible marker.** Every gap-backed surface renders
//      `<CommunityGapNotice>`, which names the missing contract on the screen.
//   3. **A single switch.** `areCommunityGapsEnabled()` is false in release
//      builds, so a production binary ships no simulated membership approval, no
//      invented fundraising total and no fabricated poll result.
//
// A fourth rule is specific to this phase, because this phase touches money and
// consent in ways Phases 6 and 7 did not:
//
//   4. **A simulated record never claims a financial outcome.** Membership
//      activation, donation success and campaign totals are read back from the
//      authoritative source — B15 for anything monetary — and the simulated
//      layer holds only the *community* record that B15 has no concept of. Where
//      the two must be stitched (a payment that should activate a membership),
//      the stitch itself is a documented gap (GAP-003) rather than a client-side
//      inference. See `frontend-phase-12-advanced-community-life-financial-
//      integration.md`.
//
// When a gap closes, the entry moves out of this file, the repository swaps its
// development arm for the backend arm, and the notice disappears. The screens do
// not change — which is the entire reason to build them now.
//
// Gap identifiers are `COMMUNITY-LIFE-GAP-0xx` and are quoted verbatim in
// `frontend-phase-12-advanced-community-life-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Which backend module should own the work, so a later phase can scope it. */
export type CommunityGapOwner =
  /** B12's domain — events, organizations, the community calendar. */
  | 'B12-community'
  /** B15's domain — money, giving, payments, receipts. */
  | 'B15-financial'
  /** B14's domain — ranking and personalization. */
  | 'B14-recommendation'
  /** B13's domain — notification templates and event contracts. */
  | 'B13-notifications'
  /** B13.2's domain — realtime transport and conversations. */
  | 'B13.2-realtime'
  /** Trust/Identity's domain — verification, roles, permissions. */
  | 'trust-identity'
  /** A community-programme module that does not exist yet. */
  | 'community-platform'
  /** Nobody's brief yet. Platform infrastructure. */
  | 'future-evolution';

export type CommunityGapPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * How much of the capability the certified backend already carries.
 *
 * The distinction matters to a reader deciding what to build next: `partial`
 * means a backend phase has an existing aggregate to extend, and `none` means it
 * has to model one. It is also what stops the register overstating the work —
 * donations are not "missing", they are real, and only the campaign wrapper
 * around them is not.
 */
export type CommunityGapCoverage =
  /** Nothing on the certified surface addresses this. */
  | 'none'
  /** A certified contract carries part of it; the rest is simulated. */
  | 'partial';

export interface CommunityGap {
  /**
   * Whether the backend has since shipped this.
   *
   * The register is a historical record and entries are deliberately not deleted
   * when a gap closes — that is the whole point of the file. But a notice that
   * keeps rendering after the capability arrives tells members the platform
   * cannot do something it does, which is the one failure this pattern exists to
   * prevent, pointing the other way.
   *
   * `connected` means every declared endpoint is served, verified against the
   * deployment rather than assumed. The notice stops rendering; nothing else
   * changes. `partial` means some are, and the notice stays because the screen
   * still has a hole in it.
   */
  backendStatus?: 'connected' | 'partial';
  /** `COMMUNITY-LIFE-GAP-001`. Stable, quoted by screens and by the register. */
  id: string;
  /** The key screens and repositories use. Short, camelCase, no prefix. */
  key: string;
  /** What a member would call it. */
  title: string;
  /** The Phase 12 scope section this belongs to. */
  feature: string;
  /** One sentence on what the frontend does today. */
  frontendBehaviour: string;
  /** How much the certified backend already carries. */
  coverage: CommunityGapCoverage;
  /** What the backend would have to expose. Route-level, not hand-waving. */
  missingContract: string[];
  /** What exists already, so a future phase does not rebuild it. */
  existingSeams: string[];
  /**
   * Where the frontend stands against the backend, once a gap has closed.
   *
   * Added by Remediation Wave C-04, in the shape Wave C-02 established on
   * `automation-gaps.ts`. Absent means the entry is still an open gap — which is
   * how every entry in this file started, and how the ones that have not closed
   * stay.
   *
   * `backend-gap-register-drift.test.ts` reads this: a gap saying BACKEND
   * CONNECTED or BACKEND PARTIAL is no longer making a claim of absence, so its
   * `missingContract` drops out of the comparison. That is why the contracts
   * below are **kept** rather than emptied — emptying one removes the
   * declaration the check reads, and the entry stops being monitored instead of
   * being recorded as resolved.
   */
  frontendStatus?:
    | 'IMPLEMENTED + DEVELOPMENT ADAPTER'
    | 'IMPLEMENTED + BACKEND CONNECTED'
    | 'IMPLEMENTED + BACKEND PARTIAL';
  /**
   * What the backend serves *now*, written when a gap closes.
   *
   * Prose, and it quotes the sentence this entry used to carry — because the
   * register is a historical record and should show when it was wrong, not
   * quietly stop being wrong. The drift check reads backtick-quoted
   * `VERB /path` forms here as claims and verifies them against the backend, so
   * a route named here must actually exist.
   */
  existingBackendCapability?: string[];
  /** Why the frontend cannot safely implement it against what exists. */
  whyNotImplementable: string;
  /** True where the capability decides, or is decided by, money. */
  isFinancial: boolean;
  owner: CommunityGapOwner;
  priority: CommunityGapPriority;
  /** Which backend phase should pick it up. */
  recommendedPhase: string;
}

export const COMMUNITY_GAPS: Record<string, CommunityGap> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // MEMBERSHIP — §6, §7, §8
  // ═══════════════════════════════════════════════════════════════════════════

  membershipCatalogue: {
    id: 'COMMUNITY-LIFE-GAP-001',
    backendStatus: 'connected',
    key: 'membershipCatalogue',
    title: 'Community membership tiers and benefits',
    feature: '§6 Membership · §7 Membership Discovery',
    frontendBehaviour:
      '',
    coverage: 'none',
    missingContract: [
      'GET /api/v1/communities/{organizationId}/membership — the programme attached to an organization: whether it is open, the tiers, the joining rules, whether approval is required',
      'GET /api/v1/communities/{organizationId}/membership/tiers — tiers with price (Money), billing period, benefits, capacity and eligibility requirements',
      'GET /api/v1/communities/memberships/discover — the cross-organization discovery surface, filterable by country, community, neighbourhood, category, price band and free/paid',
      'A `MembershipTier` aggregate carrying `priceAmount`, `priceCurrency`, `billingPeriod` (OneOff | Monthly | Quarterly | Yearly | Lifetime), `benefits[]`, `requirements[]`, `capacity`, `filledCount`',
      'A `visibility` field (Public | Unlisted | Private | InviteOnly) enforced server-side, so a private group never appears in a discovery response for an unauthorized caller',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: true,
    owner: 'community-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Community Programme',
  },

  membershipLifecycle: {
    id: 'COMMUNITY-LIFE-GAP-002',
    backendStatus: 'connected',
    key: 'membershipLifecycle',
    title: 'Membership application and lifecycle',
    feature: '§6 Membership states · §28 Organization Membership Management',
    frontendBehaviour:
      '',
    coverage: 'none',
    missingContract: [
      'POST /api/v1/communities/{organizationId}/memberships/applications — submit, with `Idempotency-Key`',
      'GET /api/v1/communities/memberships/me — every membership the caller holds, in any state',
      'GET /api/v1/communities/memberships/{membershipId} — one membership with its history',
      'POST /api/v1/communities/memberships/{membershipId}/cancel',
      'POST /api/v1/communities/memberships/{membershipId}/renew',
      'GET /api/v1/communities/{organizationId}/memberships — the administrator list, paginated, filterable by state, requiring an organization role',
      'POST /api/v1/communities/memberships/{membershipId}/decision — approve | reject | waitlist | suspend | reinstate | remove, with a reason, requiring an organization role',
      'A `MembershipStatus` enum: NotAMember, Eligible, Ineligible, Draft, Pending, Approved, Rejected, Active, RenewalDue, PaymentPending, PaymentFailed, Expired, Suspended, Cancelled',
      'A `membership.status.changed` integration event so B13 can notify on approval, rejection, renewal and expiry',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'community-platform',
    priority: 'critical',
    recommendedPhase: 'B18 Community Programme',
  },

  membershipPayment: {
    id: 'COMMUNITY-LIFE-GAP-003',
    backendStatus: 'connected',
    key: 'membershipPayment',
    title: 'Binding a membership to a B15 payment',
    feature: '§8 Membership Payment',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'A `MembershipTier` product registered in B15’s catalogue, or a `subjectType: "CommunityMembership"` accepted by `POST /api/v1/financial/payment-intents` so the payment carries its purpose',
      'POST /api/v1/communities/memberships/{membershipId}/payments — attach a captured `paymentIntentId` to a membership and let the backend decide activation',
      'A `membership.payment.settled` integration event, so activation follows settlement rather than following an HTTP 200 on the client',
      'A documented rule for what happens when capture succeeds and activation fails — the reconciliation path B15 already has for purchases',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: true,
    owner: 'B15-financial',
    priority: 'critical',
    recommendedPhase: 'B18 Community Programme, with a B15 catalogue amendment',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURRING EVENTS — §9, §10, §11
  // ═══════════════════════════════════════════════════════════════════════════

  eventSeries: {
    id: 'COMMUNITY-LIFE-GAP-004',
    backendStatus: 'connected',
    key: 'eventSeries',
    title: 'Recurring event series and occurrences',
    feature: '§9 Recurring Events · §10 Recurrence Rules · §11 Event Series',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/community-life/events/series — create a series from a recurrence rule',
      'GET /api/v1/community-life/events/series/{seriesId}',
      'PUT /api/v1/community-life/events/series/{seriesId} — with an explicit `scope` of ThisOccurrence | ThisAndFuture | EntireSeries',
      'DELETE /api/v1/community-life/events/series/{seriesId}',
      'GET /api/v1/community-life/events/series/{seriesId}/occurrences?from&to&cursor — server-expanded, because expansion is where recurrence bugs live',
      'PUT /api/v1/community-life/events/occurrences/{occurrenceId} — reschedule or cancel one occurrence, producing an exception on the rule',
      'A `RecurrenceRule` contract (RFC 5545-shaped: `frequency`, `interval`, `byWeekday[]`, `byMonthDay[]`, `until`, `count`, `exceptions[]`) served as data, so the client never encodes recurrence semantics',
      'An `occurrenceStatus` per occurrence: Scheduled | Rescheduled | Cancelled | Completed',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'B12-community',
    priority: 'critical',
    recommendedPhase: 'B12.1 Events Extension',
  },

  eventRegistration: {
    id: 'COMMUNITY-LIFE-GAP-005',
    key: 'eventRegistration',
    title: 'Event registration, capacity and attendance',
    feature: '§9 Registration · §11 Occurrence · §29 Organization Event Management',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/community-life/events/{eventId}/registrations — with `Idempotency-Key`, returning Registered | Waitlisted | Full',
      'DELETE /api/v1/community-life/events/{eventId}/registrations/me',
      'GET /api/v1/community-life/events/{eventId}/registrations — organizer view, paginated, role-gated',
      'POST /api/v1/community-life/events/{eventId}/attendance — check-in, role-gated',
      'A `capacity` and `registeredCount` on the event contract, so "Event full" is a server fact rather than a client count',
      'A `RegistrationStatus` enum: NotRegistered, Registered, Waitlisted, CheckedIn, Attended, NoShow, Cancelled',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'B12-community',
    priority: 'high',
    recommendedPhase: 'B12.1 Events Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNDRAISING & DONATIONS — §12, §13, §14, §15, §16, §17
  // ═══════════════════════════════════════════════════════════════════════════

  fundraisingCampaign: {
    id: 'COMMUNITY-LIFE-GAP-006',
    backendStatus: 'connected',
    key: 'fundraisingCampaign',
    title: 'Fundraising campaign lifecycle and creation',
    feature: '§14 Fundraising · §15 Campaign Creation · §16 Fundraising States',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/communities/campaigns — create a campaign as a draft',
      'GET /api/v1/communities/campaigns?state&category&country&organizationId&cursor',
      'GET /api/v1/communities/campaigns/{campaignId}',
      'PUT /api/v1/communities/campaigns/{campaignId}',
      'POST /api/v1/communities/campaigns/{campaignId}/submit | /publish | /pause | /resume | /close | /cancel — each role-gated and each with a server-decided legal-transition set',
      'A `CampaignStatus` enum: Draft, PendingReview, Rejected, Published, Active, Paused, GoalReached, DeadlineReached, Completed, Refunding, Cancelled, Closed',
      'A link from a campaign to a B15 `DonationCause` (`causeCode`), created by the backend when a campaign is published, so a campaign is never a place money is collected outside B15',
      'A `beneficiary` contract (organization, member or fund) validated server-side against the campaign creator’s authority',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: true,
    owner: 'B15-financial',
    priority: 'critical',
    recommendedPhase: 'B15.1 Giving Extension',
  },

  campaignTransparency: {
    id: 'COMMUNITY-LIFE-GAP-007',
    backendStatus: 'connected',
    key: 'campaignTransparency',
    title: 'Campaign updates, milestones and fund-usage transparency',
    feature: '§17 Fundraising Transparency · §30 Organization Fundraising Dashboard',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/campaigns/{campaignId}/updates and POST (role-gated)',
      'GET /api/v1/communities/campaigns/{campaignId}/milestones',
      'GET /api/v1/communities/campaigns/{campaignId}/supporters — respecting each donor’s anonymity flag server-side, never client-side',
      'GET /api/v1/communities/campaigns/{campaignId}/fund-usage — declared allocation against actual disbursement',
      'GET /api/v1/financial/donations/causes/{causeCode}/timeseries — raised-over-time, so a progress trend is a server projection rather than a client accumulation',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: true,
    owner: 'B15-financial',
    priority: 'high',
    recommendedPhase: 'B15.1 Giving Extension',
  },

  recurringDonation: {
    id: 'COMMUNITY-LIFE-GAP-008',
    backendStatus: 'connected',
    key: 'recurringDonation',
    title: 'Recurring donation scheduling',
    feature: '§12 Donations — recurring donation where supported',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'A scheduler behind `CreateDonationRequest.recurringIntervalMonths` that actually creates the subsequent donations',
      'GET /api/v1/financial/donations/recurring/me — the caller’s standing donations with their next charge date',
      'POST /api/v1/financial/donations/recurring/{id}/cancel',
      'A `donation.recurring.charged` and `donation.recurring.failed` event pair for B13',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    existingBackendCapability: [],
    isFinancial: true,
    owner: 'B15-financial',
    priority: 'medium',
    recommendedPhase: 'B15.1 Giving Extension',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOLUNTEERING — §18, §19, §20, §21
  // ═══════════════════════════════════════════════════════════════════════════

  volunteerOpportunity: {
    id: 'COMMUNITY-LIFE-GAP-009',
    backendStatus: 'connected',
    key: 'volunteerOpportunity',
    title: 'Volunteer opportunities',
    feature: '§18 Volunteer Management · §21 Volunteer Organizer Experience',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/communities/volunteer/opportunities — role-gated create',
      'GET /api/v1/communities/volunteer/opportunities?cause&organizationId&country&skill&from&to&cursor',
      'GET /api/v1/communities/volunteer/opportunities/{opportunityId}',
      'PUT /api/v1/communities/volunteer/opportunities/{opportunityId} and POST /publish | /close',
      'A capacity contract: `capacity`, `filledCount`, `waitlistCount`, so "Opportunity full" is a server fact',
      'An eligibility contract: `minimumAge`, `requiredSkills[]`, `requiredVerifications[]`, `applicationDeadline`, evaluated server-side and returned as a decision the client renders rather than computes',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Programme',
  },

  volunteerApplication: {
    id: 'COMMUNITY-LIFE-GAP-010',
    backendStatus: 'connected',
    key: 'volunteerApplication',
    title: 'Volunteer applications and assignments',
    feature: '§19 Volunteer Application · §20 Volunteer Dashboard · §31 Organization Volunteer Dashboard',
    frontendBehaviour:
      '',
    coverage: 'none',
    missingContract: [
      'POST /api/v1/communities/volunteer/opportunities/{id}/applications — with `Idempotency-Key`',
      'GET /api/v1/communities/volunteer/applications/me',
      'POST /api/v1/communities/volunteer/applications/{applicationId}/withdraw',
      'GET /api/v1/communities/volunteer/opportunities/{id}/applications — organizer queue, paginated, role-gated',
      'POST /api/v1/communities/volunteer/applications/{applicationId}/decision — approve | reject | waitlist, role-gated, with a reason',
      'POST /api/v1/communities/volunteer/assignments — assign an approved volunteer to a shift',
      'A `VolunteerApplicationStatus` enum: NotApplied, Draft, Pending, Approved, Rejected, Waitlisted, Withdrawn, Cancelled, Completed',
      'A `VolunteerAssignmentStatus` enum: Assigned, Confirmed, CheckedIn, Completed, NoShow, Cancelled',
      'A `volunteer.application.decided` and `volunteer.assignment.created` event pair for B13',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Programme',
  },

  volunteerHours: {
    id: 'COMMUNITY-LIFE-GAP-011',
    backendStatus: 'partial',
    key: 'volunteerHours',
    title: 'Volunteer shifts, attendance, hours and certificates',
    feature: '§20 Volunteer Dashboard · §21 Track attendance and hours',
    frontendBehaviour:
      '',
    coverage: 'none',
    missingContract: [
      'GET /api/v1/communities/volunteer/shifts?opportunityId',
      'POST /api/v1/communities/volunteer/assignments/{id}/check-in and /check-out',
      'POST /api/v1/communities/volunteer/assignments/{id}/hours — organizer-confirmed hours, role-gated',
      'GET /api/v1/communities/volunteer/hours/me — the caller’s verified total with its provenance',
      'GET /api/v1/communities/volunteer/certificates/me',
      'A rule for who may confirm hours, since a self-reported hour and a confirmed hour are different facts',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'community-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Community Programme',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLS — §22, §23, §24, §32
  // ═══════════════════════════════════════════════════════════════════════════

  polls: {
    id: 'COMMUNITY-LIFE-GAP-012',
    // Was 'partial', which does not suppress the notice — `CommunityGapNotice`
    // returns null only for 'connected'. So three poll screens went on drawing
    // "Diaspora cannot do this yet" over a working contract.
    //
    // Every one of the eight items below is served, and this entry's own
    // `existingBackendCapability` already said so, naming the file and line for
    // each. Checked again rather than trusted: create, list, read, respond,
    // results and the lifecycle action route all exist, `PollStatus` has the
    // six states asked for — Draft, Scheduled, Open, Closed, Cancelled,
    // ResultsPublished — and the audience is evaluated server-side, which is
    // why a poll outside it answers 403 rather than a filtered view.
    //
    // Nothing in the entry states a residual. 'partial' was the drift.
    backendStatus: 'connected',
    key: 'polls',
    title: 'Community polls, voting and results',
    feature: '§22 Community Polls · §23 Poll Creation · §24 Poll Results · §32 Organization Polls',
    frontendBehaviour:
      '',
    coverage: 'none',
    missingContract: [
      'POST /api/v1/communities/polls — role-gated create with question, options, `votingType` (SingleChoice | MultipleChoice | OpenResponse), `audience`, `isAnonymous`, `opensAt`, `closesAt`',
      'GET /api/v1/communities/polls?audience&organizationId&state&cursor',
      'GET /api/v1/communities/polls/{pollId} — including the caller’s own participation state',
      'POST /api/v1/communities/polls/{pollId}/responses — with `Idempotency-Key`, refused with a 409 when the caller has already voted and the poll disallows changes',
      'GET /api/v1/communities/polls/{pollId}/results — server-computed counts and percentages, with a documented rule for whether results are visible before close',
      'POST /api/v1/communities/polls/{pollId}/close — role-gated',
      'A `PollStatus` enum: Draft, Scheduled, Open, Closed, Cancelled, ResultsPublished',
      'An audience contract, evaluated server-side, so a members-only poll is never returned to a non-member',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Programme',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ORGANIZATIONS — §27, §28, §29, §30, §31, §32
  // ═══════════════════════════════════════════════════════════════════════════

  organizationRoles: {
    id: 'COMMUNITY-LIFE-GAP-013',
    backendStatus: 'connected',
    key: 'organizationRoles',
    title: 'Organization administration, roles and permissions',
    feature: '§27 Organization Dashboards · §28 Organization Membership Management',
    frontendBehaviour:
      '',
    coverage: 'none',
    missingContract: [
      'GET /api/v1/communities/organizations/me — every organization the caller has a role in, with the role',
      'GET /api/v1/communities/organizations/{organizationId}/capabilities — the caller’s permitted actions, as data',
      'POST /api/v1/communities/organizations/{organizationId}/members/{userId}/role — assign or revoke, role-gated',
      'An `OrganizationRole` enum: Owner, Administrator, Organizer, Treasurer, Moderator, Member',
      'A permission matrix mapping each role to the actions in §28–§32, served rather than compiled into the client',
      'Every write route in this register enforcing the matrix server-side — a client-side gate is a convenience, never a control',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'trust-identity',
    priority: 'critical',
    recommendedPhase: 'B18 Community Programme',
  },

  organizationAnalytics: {
    id: 'COMMUNITY-LIFE-GAP-014',
    backendStatus: 'connected',
    key: 'organizationAnalytics',
    title: 'Organization dashboard analytics',
    feature: '§27 Analytics where available · §30 Organization Fundraising Dashboard',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/organizations/{organizationId}/analytics?period — counters and series for members, events, donations, volunteers and polls',
      'GET /api/v1/communities/organizations/{organizationId}/analytics/members?period — joins, renewals, churn',
      'A documented recomputation cadence, so the UI can say how fresh a figure is instead of implying it is live',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'community-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Community Programme',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEIGHBOURHOOD, ANNOUNCEMENTS, IMPACT — §25, §26, §33, §34
  // ═══════════════════════════════════════════════════════════════════════════

  neighborhoodEvents: {
    id: 'COMMUNITY-LIFE-GAP-015',
    // Served as GET /community-life/neighborhoods/{areaId}/events and /activity — 200.
    backendStatus: 'connected',
    key: 'neighborhoodEvents',
    title: 'Neighbourhood event binding',
    feature: '§25 Neighborhood Events · §26 Neighborhood Event Creation',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'A `neighborhoodId` on the B12 event contract, and `GET /api/v1/community-life/events?neighborhoodId=`',
      'GET /api/v1/neighborhoods/{neighborhoodId}/events',
      'GET /api/v1/neighborhoods/{neighborhoodId}/activity — the digest of what has happened locally',
      'A neighbourhood-scoped authorization rule for who may post to a neighbourhood',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'B12-community',
    priority: 'medium',
    recommendedPhase: 'B12.1 Events Extension',
  },

  announcements: {
    id: 'COMMUNITY-LIFE-GAP-016',
    backendStatus: 'connected',
    key: 'announcements',
    title: 'Community announcements',
    feature: '§33 Community Announcements',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/communities/announcements — role-gated, scoped to an organization, neighbourhood or community',
      'GET /api/v1/communities/announcements?scope&scopeId&cursor',
      'An `announcement.published` integration event so B13 fans it out to the right audience',
      'An audience-resolution rule, so an organization announcement reaches its members and nobody else',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [],
    isFinancial: false,
    owner: 'community-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Community Programme',
  },

  communityImpact: {
    id: 'COMMUNITY-LIFE-GAP-017',
    backendStatus: 'connected',
    key: 'communityImpact',
    title: 'Community impact metrics',
    feature: '§34 Community Impact',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/impact?scope=member|organization|neighborhood|country&scopeId&period',
      'A documented definition for every metric — what counts as a member helped, what counts as an event hosted — since an undefined metric is worse than an absent one',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'community-platform',
    priority: 'low',
    recommendedPhase: 'B18 Community Programme',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM SEAMS — §35, §36, §37, §40, §52
  // ═══════════════════════════════════════════════════════════════════════════

  communityRecommendations: {
    id: 'COMMUNITY-LIFE-GAP-018',
    // 20 Oct 2026. The hub's "For you" rail reads `GET /recommendations/communities`
    // and its "Not interested" posts `POST /recommendations/dismiss` (a
    // `RecordFeedbackRequest` body, not a path id). Partial: the per-surface
    // Community Life rails this entry asked for — events, memberships,
    // volunteering, campaigns, polls — have no surface on B14 yet.
    backendStatus: 'partial',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    key: 'communityRecommendations',
    title: 'Community Life recommendation surface',
    feature: '§35 Community Recommendations',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/recommendations/community?surface=hub|events|organizations|memberships|volunteer|campaigns|polls|neighborhood&take',
      'POST /api/v1/recommendations/{recommendationId}/dismiss — already proposed by CREATOR-GAP-013 and shared with it',
      'A `reason` string per recommendation, so the UI can say why something was suggested',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'B14-recommendation',
    priority: 'medium',
    recommendedPhase: 'B14.1 Recommendation Surfaces',
  },

  communityNotifications: {
    id: 'COMMUNITY-LIFE-GAP-019',
    key: 'communityNotifications',
    title: 'Community Life notification event contracts',
    feature: '§36 Notifications',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'B13 notification types: `membership.approved`, `membership.rejected`, `membership.renewal.due`, `membership.expired`, `event.reminder`, `event.series.reminder`, `event.occurrence.cancelled`, `donation.receipt`, `campaign.update`, `campaign.milestone`, `volunteer.application.decided`, `volunteer.assignment.created`, `poll.closing`, `poll.result`, `organization.announcement`, `neighborhood.event`',
      'A payload contract per type carrying the subject identifier the deep link needs',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'B13-notifications',
    priority: 'high',
    recommendedPhase: 'B13.3 Notification Contract Extension',
  },

  communityRealtime: {
    id: 'COMMUNITY-LIFE-GAP-020',
    key: 'communityRealtime',
    title: 'Community Life realtime channel',
    feature: '§37 Realtime',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'Realtime channels `community:campaign:{campaignId}`, `community:poll:{pollId}`, `community:organization:{organizationId}` and `community:membership:{membershipId}`',
      'Event payloads for `campaign.progress.changed`, `poll.result.changed`, `occurrence.cancelled` and `membership.status.changed`',
      'A documented authorization rule per channel, since a poll result channel must not leak a private poll',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'B13.2-realtime',
    priority: 'medium',
    recommendedPhase: 'B13.3 Realtime Channel Extension',
  },

  communitySearch: {
    id: 'COMMUNITY-LIFE-GAP-021',
    backendStatus: 'connected',
    key: 'communitySearch',
    title: 'Unified Community Life search',
    feature: '§40 Community Life Search',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/search?q&types[]&country&community&neighborhood&from&to&distanceKm&priceBand&organizationId&cause&eventType&cursor — one federated route. **SHIPPED, narrower than asked for:** PollAndAnnouncementEndpoints.cs:239 binds `q`, `types`, `countryCode`, `cityName`, `organizationId`, `cause`, `priceBand` and `take`. It does not bind `country`, `community`, `neighborhood`, `from`, `to`, `distanceKm`, `eventType` or `cursor`, and it returns `nextCursor: null` unconditionally — a federated page over four sources cannot carry one resumable token. The declaration is kept rather than deleted because the *contract* asked for is still wider than the one served.',
      'A relevance contract, so the merge order is the server’s decision rather than the client’s concatenation. **SHIPPED for the four types B18 owns**, and stated in the handler: an exact title match outranks a prefix, a prefix outranks a substring, a body match ranks below all three, and recency breaks ties (CommunitySearchQuery.cs:312-344). It is still missing *across* modules — events and organisations are ranked by B12 and the score is stripped from the response, so no client can compare a poll to an event and none should try.',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'community-platform',
    priority: 'medium',
    recommendedPhase: 'B18 Community Programme',
  },

  communityIdempotency: {
    id: 'COMMUNITY-LIFE-GAP-022',
    key: 'communityIdempotency',
    title: 'Idempotency contract for community mutations',
    feature: '§52 Idempotency & Double Action Protection',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'An `Idempotency-Key` header (or body field) accepted and uniquely indexed on every community write route proposed in this register',
      'A documented 409 response shape for a replayed key whose original is still in flight',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: true,
    owner: 'community-platform',
    priority: 'high',
    recommendedPhase: 'B18 Community Programme',
  },

  /**
   * Split out of `membershipCatalogue`.
   *
   * A gap key covers several capabilities and `backendStatus` is one boolean
   * over all of them, so marking the key connected silenced the notice for the
   * parts that are not. Membership *is* served; this hub summary is not, and
   * the screen was left rendering nothing with no explanation.
   */
  communityHubSummary: {
    id: 'COMMUNITY-LIFE-GAP-030',
    // 20 Oct 2026. The capability is served by composition: every part of the
    // summary has a real route, and `useCommunityLifeSummary` reads them in
    // parallel (`lib/community-life-hub.ts`). The aggregate route itself is
    // still not served and is still declared below, as the record of what was
    // asked for; nothing calls it.
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'communityHubSummary',
    title: 'The Community Life hub summary',
    feature: '§47 Community Life hub',
    frontendBehaviour:
      '',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/community-life/hub/summary — one call answering the counts and the first page of each rail, scoped to the caller and their place',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    isFinancial: false,
    owner: 'B12-community',
    priority: 'medium',
    recommendedPhase: 'B18',
  },
};


/** Every gap, ordered by identifier. Used by the register screen and the docs. */
export const COMMUNITY_GAP_LIST: CommunityGap[] = Object.values(COMMUNITY_GAPS).sort((a, b) =>
  a.id.localeCompare(b.id)
);

export function getCommunityGap(key: string): CommunityGap | undefined {
  return COMMUNITY_GAPS[key];
}

/**
 * Whether this build may reach the community development adapter.
 *
 * Delegates to `areSimulatedFeaturesEnabled()`, which is the single switch for
 * Phases 5, 6, 7 and 12 — four different answers to "is this build allowed to
 * simulate?" would be four things to get wrong.
 *
 * True under Metro and in a debug binary, and in an internal test build that
 * explicitly opted in with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. False otherwise,
 * including in every production build, where Metro's minifier additionally
 * strips the dead branch — so a production binary contains no path to a
 * simulated membership approval, a fabricated fundraising total or an invented
 * poll result.
 *
 * See `src/config/gap-preview.ts` for what the opt-in costs and why it exists.
 */
export function areCommunityGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/**
 * The URL space every simulated community route lives under.
 *
 * Never `/community-life` — B12 owns that and its routes are real. Never
 * `/financial` — B15 owns that and its routes move money. A gap call that
 * escapes a development build 404s at the gateway rather than reaching a
 * certified route.
 */
export const COMMUNITY_GAP_PREFIX = '/community-gap/v0';
