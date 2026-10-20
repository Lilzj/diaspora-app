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
      'Membership discovery, tier comparison, benefit lists and eligibility rules render from a simulated catalogue. The organizations the tiers hang off are real B12 organizations; only the membership programme attached to them is simulated.',
    coverage: 'none',
    missingContract: [
      'GET /api/v1/communities/{organizationId}/membership — the programme attached to an organization: whether it is open, the tiers, the joining rules, whether approval is required',
      'GET /api/v1/communities/{organizationId}/membership/tiers — tiers with price (Money), billing period, benefits, capacity and eligibility requirements',
      'GET /api/v1/communities/memberships/discover — the cross-organization discovery surface, filterable by country, community, neighbourhood, category, price band and free/paid',
      'A `MembershipTier` aggregate carrying `priceAmount`, `priceCurrency`, `billingPeriod` (OneOff | Monthly | Quarterly | Yearly | Lifetime), `benefits[]`, `requirements[]`, `capacity`, `filledCount`',
      'A `visibility` field (Public | Unlisted | Private | InviteOnly) enforced server-side, so a private group never appears in a discovery response for an unauthorized caller',
    ],
    existingSeams: [
      '`CommunityOrganization` in `types/community-life.ts` already models the organization a membership would belong to, with category, verification and follower count',
      '`SubscriptionPlan` and `Subscription` in B15 already model a priced, recurring, entitlement-bearing relationship — a community membership is the same shape with a different counterparty, and the plan catalogue is the contract to copy',
      '`OrgFormState.hasMembershipPlans` already exists in the B12 organization creation form, so the concept was anticipated',
    ],
    whyNotImplementable:
      'There is no membership aggregate anywhere. `CommunityOrganization` carries `followersCount` and `isFollowing`, and a follow is not a membership — it has no tier, no price, no state machine, no approval and no expiry. Deriving one from the other would mean the client inventing the entire domain, and §7 of the brief forbids exactly that.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by `Diaspora.Modules.CommunityProgramme` (B18); connected in Remediation Wave C-04.** This entry used to open: “There is no membership aggregate anywhere.” There is now. `MembershipProgramme`, `MembershipTier` and `ProgrammeMembership` are real aggregates with EF configuration and a migration, and the module mounts at `/api/v1/communities` — the register’s own declared prefix, chosen by the backend precisely so closing this gap would be a change of import and nothing else.',
      '`GET /api/v1/communities/{organizationId}/membership` is real — MembershipEndpoints.cs:171. It answers the programme with the caller’s own standing against it, one of fourteen states.',
      '`GET /api/v1/communities/{organizationId}/membership/tiers` is real — MembershipEndpoints.cs:184. Every tier carries `requirements[].isMet`, evaluated **server-side per caller on each read**, which is the half of this gap the client could never have filled.',
      '`GET /api/v1/communities/memberships/discover` is real — MembershipEndpoints.cs:33, filtering on query, category, country, city, neighbourhood area, price band and eligibility.',
      '`visibility` is enforced by **omission**, as this entry asked: a `Private` or `InviteOnly` programme is absent from a discovery page for an unauthorized caller rather than present with a flag. `ProgrammeVisibility` — CommunityProgrammeEnums.cs:99.',
      'Wire casing is **PascalCase** for every enum value on this surface — `.ToString()` into a string DTO property, and the host renames properties to camelCase and never values.',
    ],
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
      'The full application flow — eligibility, form, submission, pending, approval, rejection, suspension, expiry, renewal and cancellation — runs against simulated persistence. Every state in the machine is reachable in a development build and every one is marked.',
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
    existingSeams: [
      'B15’s `SubscriptionStatus` already models an Active/PastDue/Cancelled/Expired ladder with period boundaries — the renewal and expiry semantics are already solved once on this platform',
      'B13 already delivers state-change notifications and `notification-routes.ts` already maps a notification to a destination screen',
      'The Trust module already carries the account-level restriction states an eligibility check would consult',
    ],
    whyNotImplementable:
      'A membership decision is an authorization decision made by an organization about a person. §19 of the brief forbids the frontend making one, and there is no route to ask. A client that showed "Approved" because it had optimistically written that locally would be asserting a fact only the organization can state.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.** This entry used to say “a membership decision is an authorization decision made by an organization about a person … and there is no route to ask”. There is now, and it is role-gated.',
      '`POST /api/v1/communities/{organizationId}/memberships/applications` — MembershipEndpoints.cs:215, idempotent on the key.',
      '`GET /api/v1/communities/memberships/me` — :67. `GET /api/v1/communities/memberships/{membershipId}` — :77, with its history.',
      '`POST /api/v1/communities/memberships/{membershipId}/cancel` — :90. `POST /api/v1/communities/memberships/{membershipId}/renew` — :108.',
      '`GET /api/v1/communities/{organizationId}/memberships` — :236, role-gated and cursor-paged. `POST /api/v1/communities/memberships/{membershipId}/decision` — :150, which **refuses with 403 rather than filtering**.',
      'The fourteen-state `ProgrammeMembershipStatus` shipped intact — CommunityProgrammeEnums.cs:19 — including the three that are never stored (`NotAMember`, `Eligible`, `Ineligible`), answered by the programme read.',
      'The integration event this entry asked for exists: `CommunityProgrammeIntegrationEvents.cs`, consumed by `Diaspora.Modules.Notifications` under `Application/Consumers/CommunityProgramme/`.',
    ],
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
      'The paid-tier flow creates a **real** B15 payment intent and authorizes and captures it through Phase 5’s payment sheet. What is simulated is only the binding: the community record that says this captured payment activated that membership. The payment status shown to the member is always read back from B15 and never inferred.',
    coverage: 'partial',
    missingContract: [
      'A `MembershipTier` product registered in B15’s catalogue, or a `subjectType: "CommunityMembership"` accepted by `POST /api/v1/financial/payment-intents` so the payment carries its purpose',
      'POST /api/v1/communities/memberships/{membershipId}/payments — attach a captured `paymentIntentId` to a membership and let the backend decide activation',
      'A `membership.payment.settled` integration event, so activation follows settlement rather than following an HTTP 200 on the client',
      'A documented rule for what happens when capture succeeds and activation fails — the reconciliation path B15 already has for purchases',
    ],
    existingSeams: [
      '`POST /api/v1/financial/payment-intents`, `/authorize`, `/capture` and `GET /payment-intents/{id}` are real, and `fetchPaymentIntent` is already the only thing this app treats as authoritative payment state',
      '`PaymentSheet`, `PaymentReview` and `PaymentResult` in `components/financial` already render the whole lifecycle including the indeterminate case',
      '`acquireIdempotencyKey` already survives retries and app restarts, and B15 already uniquely indexes `IdempotencyKey` on payment intents',
      '`MonetizationPurchase` already models "this payment bought that thing", which is precisely the shape a membership payment needs',
    ],
    whyNotImplementable:
      'B15 can take the money — that part is real and is used. What it cannot do is say what the money was for, because no `subjectType` for a community membership exists and there is no route to attach a settled payment to a membership. §18 forbids the client concluding "paid, therefore a member", so the binding is simulated and marked rather than assumed.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.** The sentence this entry carried — “B15 can take the money … what it cannot do is say what the money was for” — is no longer true.',
      '`POST /api/v1/communities/memberships/{membershipId}/payments` — MembershipEndpoints.cs:130. The route belongs to B18 because it owns the prefix; every financial decision behind it is dispatched as B15’s own command (`RecordMembershipSettlementCommand`).',
      '**It refuses anything that has not actually settled.** `MembershipSettlement` re-reads B15’s own record of the intent; nothing about the amount, the currency or the outcome is taken from the request. So both halves now check, and the client still concludes nothing about payment on its own.',
      '`GET /api/v1/financial/memberships/{membershipId}/payments` also exists — GivingExtensionEndpoints.cs:74 — the financial half of the record, read from the module that owns the money.',
      '**No second money path was built.** The checkout still creates, authorizes, captures and then re-reads a real B15 payment intent, and only then binds.',
    ],
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
      'Series creation, a data-driven recurrence editor (daily, weekly, monthly, yearly, custom; by weekday; interval; end-by-date, end-after-count, never), occurrence expansion, cancellation and rescheduling of a single occurrence, and the series/occurrence split in the UI all run against a simulated series store. Individual occurrences render through the same components as real B12 events.',
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
    existingSeams: [
      'B12’s `/community-life/events` already carries the entire event payload — title, category, location, host, agenda, contact, pricing, RSVP and counters. A series is a *generator* of those, not a new event type',
      '`EventFormState.isRecurring` and `EventFormState.recurrencePattern` already exist in the B12 create form as free text, which is the anticipation of this contract and not a substitute for it',
      '`/community-life/calendar` already merges events and holidays into a calendar projection, which is where occurrences belong',
    ],
    whyNotImplementable:
      'B12 stores an event as a single `date` plus a `time`. There is no series identity, so two occurrences of the same weekly meetup are two unrelated rows, and cancelling one has no defined effect on the other. Expanding a rule on the client would mean occurrence identifiers that only exist on one device — RSVPs, reminders and attendance could not refer to them.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by `Diaspora.Modules.CommunityLife` (B12), not by B18; connected in Wave C-04.** This entry used to say B12 “has no concept of a series”. It does: `EventSeriesEndpoints.cs` maps seven routes, and an occurrence *is* an event — so RSVP, check-in and the attendee list already work against one.',
      '`POST /api/v1/community-life/events/series` — EventSeriesEndpoints.cs:98. `GET /api/v1/community-life/events/series/{idOrSlug}` — :52. `PUT /api/v1/community-life/events/series/{seriesId}` — :110, taking the three-valued edit scope. `PUT /api/v1/community-life/events/occurrences/{occurrenceId}` — :179.',
      '`DELETE /api/v1/community-life/events/series/{seriesId}` — :139, and it **cancels rather than deletes**, with `reason` and `pauseOnly` in the query string. A pattern people are coming to must not vanish.',
      '**Expansion is genuinely the server’s.** The occurrences route returns dates B12 wrote, and `materialisedThrough` says how far ahead they go — so a never-ending series does not report a false count.',
      '**One divergence remains and is not smoothed over.** B12 binds `categoryKey` from a sixteen-key catalogue (`worship-service`, `naming-ceremony`, `sports`…); the client’s `EventCategory` is a twenty-eight-member display union that does not correspond to it. `community-programme-api.ts` carries an explicit written-out translation table with `other` as the fallback rather than guessing a slug. The same divergence exists on B12’s single-event create and is older than this wave.',
    ],
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
      'Registration, waitlisting, capacity display, cancellation, check-in and the attendee list run against simulated persistence. The RSVP state B12 does carry is real and is used for the three-value Going/Interested/Maybe signal.',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/community-life/events/{eventId}/registrations — with `Idempotency-Key`, returning Registered | Waitlisted | Full',
      'DELETE /api/v1/community-life/events/{eventId}/registrations/me',
      'GET /api/v1/community-life/events/{eventId}/registrations — organizer view, paginated, role-gated',
      'POST /api/v1/community-life/events/{eventId}/attendance — check-in, role-gated',
      'A `capacity` and `registeredCount` on the event contract, so "Event full" is a server fact rather than a client count',
      'A `RegistrationStatus` enum: NotRegistered, Registered, Waitlisted, CheckedIn, Attended, NoShow, Cancelled',
    ],
    existingSeams: [
      '`Event.rsvpStatus` (`Going | Interested | Maybe | null`) is real in B12 and is a genuine intent signal — it is used, and it is not a registration',
      '`Event.viewCount`, `shareCount` and `saveCount` are real counters already maintained server-side',
      'B15’s payment intents already handle a paid event, and `Event.price`/`currency` already exist',
    ],
    whyNotImplementable:
      'An RSVP is a statement of intent with no capacity semantics: B12 has no `capacity` field, so nothing can be full, and no seat can be held. §51 requires the UI to handle "Event full" and "Already registered", and neither is answerable from what exists.',
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
      'Campaign discovery, the campaign page, the creation wizard, draft/submit/publish/pause/resume/close and the organizer’s campaign list run against a simulated campaign store. **The money does not.** Donating to a campaign creates a real B15 donation against the campaign’s real `causeCode`, and the raised total shown on the page is B15’s `DonationCause.raised` wherever the campaign is backed by one.',
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
    existingSeams: [
      'B15’s `DonationCause` is **most of the read side already**: `title`, `description`, `beneficiaryType`, `beneficiaryId`, `organizerName`, `urgency`, `acceptedKinds`, `raised`, `target`, `supporterCount`, `isVerified`, `isActive`, `countryCode`, `locationLabel` and a media reference. Phase 12 reads it and does not duplicate it',
      '`POST /api/v1/financial/donations` is real, idempotent and takes a `causeCode` — every campaign donation in this phase goes through it',
      '`ContributionFund` is the same shape for the five-kinds-of-support case and is also real',
      'B15’s `GET /financial/giving/me` is the real donation history',
    ],
    whyNotImplementable:
      'A `DonationCause` is created by staff and has no lifecycle a member can drive: there is no create route, no draft, no review, no pause and no close, and `isActive` is a boolean where §16 requires twelve states. The read side is real and is used; only the lifecycle around it is simulated.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B15.1 Giving Extension; connected in Remediation Wave C-04.** This entry used to close: “only the lifecycle around it is simulated.” The lifecycle is now real. `Campaign` is an aggregate in `Diaspora.Modules.Financial` with the twelve states this entry asked for, and B18 maps its routes at the register’s own `/api/v1/communities` prefix and forwards to B15’s commands — ownership follows the aggregate, the URL follows the register.',
      '`POST /api/v1/communities/campaigns` is real — CampaignEndpoints.cs:66. It creates a **draft**, with no cause and nowhere to collect, and refuses server-side when `acceptedTerms` is false.',
      '`GET /api/v1/communities/campaigns` is real — CampaignEndpoints.cs:80, filtering on state, category, country, organization and `mine`. A draft is visible only to the person who wrote it, by omission rather than by a flag.',
      '`GET /api/v1/communities/campaigns/{campaignId}` is real — CampaignEndpoints.cs:109, with `progress`, `canDonate` and `availableTransitions` all computed server-side.',
      '`PUT /api/v1/communities/campaigns/{campaignId}` is real — CampaignEndpoints.cs:121. **It binds eleven fields and not the create contract’s seventeen**: `currency`, `beneficiaryType`, `beneficiaryId`, `beneficiaryName`, `organizationId`, `countryCode` and `acceptedTerms` are absent from `UpdateCampaignRequest` and would be dropped in silence. The client sends only what binds.',
      'The six lifecycle verbs are real — CampaignEndpoints.cs:144, one route each, the destination taken from the route and never from the body. An illegal move is a 409, and `availableTransitions` on the read is the server saying which it would accept.',
      'A `causeCode` is created **by the backend at publication** and is null before it, which is what `canDonate` branches on. The register asked for exactly this: a campaign is never a place money is collected outside B15.',
      'Wire casing is PascalCase for every enum value; the three campaign categories carrying a space are translated in both directions by the backend, so the client’s own spelling is the contract.',
      '**Served since 20 Oct 2026 (backend a7b97c7).** `GET /api/v1/communities/campaigns/{campaignId}/donations/me` answers the caller’s own donations to one campaign through its cause, newest first, each wrapping B15’s `Donation` with the campaign id and title; anonymous gifts are absent because they store no donor, and a campaign the caller can neither see nor gave to is a 404. The campaign screen reads it (`useMyCampaignDonations`) as “Your gifts”.',
      '**Not closed by this**: the campaign-side donation *write* stitch (the simulated arm’s attach call, which posts a donation id to the campaign) has no served route. It is not needed on the connected arm: a published campaign has a real cause, a gift against it is an ordinary B15 donation, and `/financial/giving/me` is the authoritative history.',
    ],
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
      'Campaign updates, milestones, fund-usage breakdown, the supporter list and the donor-count-over-time trend render from a simulated projection. Target, raised, percentage and supporter count come from B15 and are marked as real; everything else on the transparency panel is marked as simulated.',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/campaigns/{campaignId}/updates and POST (role-gated)',
      'GET /api/v1/communities/campaigns/{campaignId}/milestones',
      'GET /api/v1/communities/campaigns/{campaignId}/supporters — respecting each donor’s anonymity flag server-side, never client-side',
      'GET /api/v1/communities/campaigns/{campaignId}/fund-usage — declared allocation against actual disbursement',
      'GET /api/v1/financial/donations/causes/{causeCode}/timeseries — raised-over-time, so a progress trend is a server projection rather than a client accumulation',
    ],
    existingSeams: [
      '`DonationCause.raised`, `.target` and `.supporterCount` are real and are the only figures this phase prints as fact',
      '`Donation.isAnonymous` is enforced by B15 — an anonymous donation stores no donor identifier at all, so the anonymity guarantee is structural rather than a filter',
      'B9 Community Updates already models a published update with media, which is the shape a campaign update should reuse',
    ],
    whyNotImplementable:
      '§17 says plainly: do not invent financial figures. B15 exposes the three aggregate numbers and nothing else — no per-donation feed for a cause, no time series, no disbursement record. A client that accumulated a trend from the donations it happened to observe would be publishing a number nobody can reconcile.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B15.1 Giving Extension; connected in Remediation Wave C-04.** This entry used to say: “B15 exposes the three aggregate numbers and nothing else — no per-donation feed for a cause, no time series, no disbursement record.” All three now exist, and the client no longer accumulates anything.',
      '`GET /api/v1/communities/campaigns/{campaignId}/updates` and `POST /api/v1/communities/campaigns/{campaignId}/updates` are real — CampaignEndpoints.cs:169 and :189. Cursor-paged, newest first, role-gated on the write, and a withdrawn update is **absent** for everybody except the person who wrote it rather than present with a flag.',
      '`GET /api/v1/communities/campaigns/{campaignId}/milestones` is real — CampaignEndpoints.cs:207, alongside a `PUT` at :222 the register did not ask for. `isReached` is the server’s own stamp against the cause’s total; the client is given the answer and never the two numbers to divide.',
      '`GET /api/v1/communities/campaigns/{campaignId}/supporters` is real — CampaignEndpoints.cs:240, and anonymity is structural exactly as this entry hoped: an anonymous supporter arrives with no identifier, no message and no correlation handle, because B15 never stored one.',
      '`GET /api/v1/communities/campaigns/{campaignId}/fund-usage` is real — CampaignEndpoints.cs:262. **It is an envelope, not the list of lines this register declared**: `raised`, `allocated`, `disbursed`, `disbursedVerified`, `remaining`, the lines, and an `isOverReported` flag. `disbursedVerified` is the part a settled B15 payout backs, and it is the figure that separates the organizer’s word from something the platform can prove — a client reading only the lines would have discarded it.',
      '`GET /api/v1/financial/donations/causes/{causeCode}/timeseries` is real — GivingExtensionEndpoints.cs:29, at **B15’s own prefix** rather than under `/communities`. Bucketed by whole UTC days with every empty day present, and the response states the window it actually covers because a request wider than the deployment’s maximum is clamped rather than refused.',
      'Refunds are reported beside the total and **never netted off it**, so a chart cannot quietly turn two facts into a third figure nobody can reconcile.',
    ],
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
      'The donation sheet offers a recurring option and sends B15’s existing `recurringIntervalMonths`. The UI states explicitly that the interval is recorded as an intention and not yet scheduled, and no screen shows a "next charge" date, because there is nothing that would honour one.',
    coverage: 'partial',
    missingContract: [
      'A scheduler behind `CreateDonationRequest.recurringIntervalMonths` that actually creates the subsequent donations',
      'GET /api/v1/financial/donations/recurring/me — the caller’s standing donations with their next charge date',
      'POST /api/v1/financial/donations/recurring/{id}/cancel',
      'A `donation.recurring.charged` and `donation.recurring.failed` event pair for B13',
    ],
    existingSeams: [
      '`CreateDonationRequest.recurringIntervalMonths` already exists on the certified request and is already documented in `types/financial.ts` as "declared and not scheduled by the backend in this phase"',
      'B15’s `Subscription` already proves the platform can run a recurring charge — the machinery exists, it is simply not wired to giving',
    ],
    whyNotImplementable:
      'The field is accepted and stored, and nothing charges against it. Showing a member "we will take £10 every month" would be a promise the platform does not keep, so the UI records the preference and says exactly what it does.',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    existingBackendCapability: [
      '**Largely closed by B15.1 Giving Extension; connected in Remediation Wave C-04.** This entry used to say: “The field is accepted and stored, and nothing charges against it.” Something charges against it now. `RecurringDonation` is an aggregate with a five-state life, and `RecurringDonationSweep` charges the due ones through the **ordinary payment path** — it creates a donation and a payment intent exactly as a member’s own tap does, and marks nothing paid itself.',
      '`GET /api/v1/financial/donations/recurring/me` is real — GivingExtensionEndpoints.cs:51. A bare list, not a page, and it carries **every** state including cancelled ones, so a donor who stopped a gift can see that it stopped.',
      '`POST /api/v1/financial/donations/recurring/{id}/cancel` is real — GivingExtensionEndpoints.cs:61. Owner only, idempotent, and a schedule that is absent and one that belongs to somebody else are answered identically so the identifiers cannot be enumerated.',
      '`donation.recurring.charged` and `donation.recurring.failed` exist as integration events — B15_1GivingIntegrationEvents.cs — which is the pair this entry asked B13 for.',
      '**PARTIAL, and this is the part that is not closed.** The scheduler sits behind a deployment switch, `FinancialOptions.EnableRecurringDonations`. When it is off the interval is accepted, **no schedule is created, and the donation still answers 200** — and nothing on the wire tells a client which happened. There is no capability flag for giving that reports it. So the donate screen does not conclude a standing gift from a successful donation: it reads `donations/recurring/me` and reports what is actually there, and says plainly when it cannot find one. A `recurringAvailable` flag on the giving capabilities response, in the shape `financial/capabilities` already uses elsewhere, is what would close this.',
      'One rule the client now enforces in front of the member rather than after their card is charged: **an anonymous gift cannot repeat.** B15 refuses it — it stores no donor identifier, so there would be nobody to charge next month and nobody to tell when it failed — and the monthly switch is disabled while anonymity is on, carrying the server’s own reason.',
    ],
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
      'Opportunity discovery, the opportunity page, filters by cause, organization, location, date, skills and capacity, and the organizer’s create/edit/publish/close flow run against a simulated opportunity store.',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/communities/volunteer/opportunities — role-gated create',
      'GET /api/v1/communities/volunteer/opportunities?cause&organizationId&country&skill&from&to&cursor',
      'GET /api/v1/communities/volunteer/opportunities/{opportunityId}',
      'PUT /api/v1/communities/volunteer/opportunities/{opportunityId} and POST /publish | /close',
      'A capacity contract: `capacity`, `filledCount`, `waitlistCount`, so "Opportunity full" is a server fact',
      'An eligibility contract: `minimumAge`, `requiredSkills[]`, `requiredVerifications[]`, `applicationDeadline`, evaluated server-side and returned as a decision the client renders rather than computes',
    ],
    existingSeams: [
      'B15’s `ContributionKind` already contains `VolunteerService` and `ProfessionalSkills`, and `POST /api/v1/financial/contributions` already records a non-monetary pledge of time or skills against a fund. That is a real, certified way to say "I will help" and this phase uses it where a fund exists',
      '`DonationCause.acceptedKinds` already tells a screen that a cause wants volunteers rather than money',
      'B12’s `EventCategory` already contains `Volunteer Activity` and `Charity Event`',
      'Trust already carries the verifications an eligibility rule would test',
    ],
    whyNotImplementable:
      'A B15 contribution is a pledge against a *fund*, with a quantity and a unit. It has no shift, no date, no location, no capacity, no skills and no approval — it cannot express "four stewards needed, Saturday 09:00–13:00, must be over 18". The pledge is real and is used as the pledge; the opportunity around it does not exist.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.** `VolunteerOpportunity`, `VolunteerApplication` and `VolunteerAssignment` are real aggregates.',
      '`GET /api/v1/communities/volunteer/opportunities` — VolunteerEndpoints.cs:33, filtering on cause, organization, country, city, skill, date window and state. `POST /api/v1/communities/volunteer/opportunities` — :69, role-gated and idempotent. `GET /api/v1/communities/volunteer/opportunities/{opportunityId}` — :86. `PUT /api/v1/communities/volunteer/opportunities/{opportunityId}` — :99.',
      '`GET /api/v1/communities/volunteer/shifts` — :135 — and a lifecycle verb route at :117 (publish, close, complete, cancel).',
      '**Drafts are absent for anybody who cannot manage them**, not present with a flag — the same omission rule the membership programme uses.',
      '`canApply` and `cannotApplyReason` are the server’s decision and its own words, printed verbatim. The client composes no explanation.',
    ],
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
      'Applying, withdrawing, the applicant queue, approve/reject/waitlist, assignment to a shift and the volunteer’s own dashboard run against simulated persistence, with every state in §19 reachable and marked.',
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
    existingSeams: [
      'B13 already delivers decision notifications, and `notification-routes.ts` already knows how to route one to a destination screen',
      'The job-application flow in `app/job/[id].tsx` is the closest existing analogue on this platform for an apply → pending → decision loop',
    ],
    whyNotImplementable:
      'An approval is an authorization decision by an organization. §19 forbids the frontend making one and there is no route to ask for one, so the whole queue is simulated rather than half-built.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.**',
      '`POST /api/v1/communities/volunteer/opportunities/{opportunityId}/applications` — VolunteerEndpoints.cs:161. **A full opportunity waitlists rather than refusing**, which is why `Waitlisted` is a pending state rather than a terminal one.',
      '`GET /api/v1/communities/volunteer/applications/me` — :151. `GET /api/v1/communities/volunteer/opportunities/{opportunityId}/applications` — :180, role-gated and oldest first.',
      '`POST /api/v1/communities/volunteer/applications/{applicationId}/withdraw` — :202. `POST /api/v1/communities/volunteer/applications/{applicationId}/decision` — :215, role-gated.',
      '`POST /api/v1/communities/volunteer/assignments` — :246, answering **409 for an unapproved volunteer** rather than trusting the caller to have checked.',
      '`waitlistPosition` is computed at read time from the other waitlisted applications, because a stored position goes wrong the moment somebody ahead withdraws.',
      '**What the applicant queue does not carry is the point:** no email, no telephone, no address. An organizer who needs to reach somebody uses conversations, and this module adds no messaging.',
      '**No route reads one application by id.** An applicant reads their own out of `/volunteer/applications/me`, and an organizer reads it out of the opportunity’s queue. Nothing in the client fetches one, and adding a screen that did would need a route that does not exist.',
    ],
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
      'Shifts, check-in, logged hours, completion, certificates and the volunteer’s cumulative impact render from a simulated ledger. The screen states that hours are not yet an auditable record.',
    coverage: 'none',
    missingContract: [
      'GET /api/v1/communities/volunteer/shifts?opportunityId',
      'POST /api/v1/communities/volunteer/assignments/{id}/check-in and /check-out',
      'POST /api/v1/communities/volunteer/assignments/{id}/hours — organizer-confirmed hours, role-gated',
      'GET /api/v1/communities/volunteer/hours/me — the caller’s verified total with its provenance',
      'GET /api/v1/communities/volunteer/certificates/me',
      'A rule for who may confirm hours, since a self-reported hour and a confirmed hour are different facts',
    ],
    existingSeams: [
      '`Contribution.pledgeQuantity` and `.pledgeUnit` in B15 already record "N hours pledged" against a fund — a pledge, explicitly not a completed hour',
      'Phase 7’s creator certificates already model an issued, shareable credential',
    ],
    whyNotImplementable:
      'A volunteer hour that appears on a member’s profile is a claim about the world that somebody has to stand behind. Nothing on the platform records attendance, so any total the client showed would be self-asserted, and §34 forbids inventing an impact metric.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.**',
      '`POST /api/v1/communities/volunteer/assignments/{assignmentId}/hours` — VolunteerEndpoints.cs:259. **The organizer confirms, and the certificate follows from the confirmation.** §34 held: there is no route that would accept a self-reported hour.',
      '`GET /api/v1/communities/volunteer/hours/me` — :296, confirmed hours only. `GET /api/v1/communities/volunteer/certificates/me` — :306.',
      'A check-in/check-out route exists at :278 and records the moment; it proves nothing on its own, which the server says in as many words.',
      '**One thing is still absent, and honestly so.** `VolunteerCertificateResponse.downloadUrl` is null: rendering a signed document is a service this platform does not have. The certificate is real, listed and traceable to the organization that confirmed it; the file is what a later phase adds. The client renders the null rather than pointing at something that 404s.',
    ],
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
      'Poll discovery, the poll page, single-choice, multiple-choice and open-response voting, vote confirmation, results, participation counts and the organizer’s create/close/audience flow all run against a simulated poll store. **No result is computed on the device**: the client sends a vote and re-reads the result the server returns, exactly as it would against a real contract.',
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
    existingSeams: [
      'B12 organizations and B13 notifications provide the audience and the delivery a poll needs',
      'The guide voting mechanic (helpful votes) is the closest existing one-member-one-vote surface on the platform',
    ],
    whyNotImplementable:
      'There is no poll aggregate. §24 forbids computing authoritative results from incomplete client data, and one-member-one-vote is unenforceable on a device. Both the tally and the eligibility have to be server-side, so the whole capability is simulated behind the adapter and the UI is written as though the contract were real.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.**',
      '`POST /api/v1/communities/polls` — PollAndAnnouncementEndpoints.cs:48, role-gated on an organization poll. `GET /api/v1/communities/polls/{pollId}` — :65, answering **403 outside the audience** rather than a filtered view.',
      '`GET /api/v1/communities/polls/{pollId}/results` — :76. `POST /api/v1/communities/polls/{pollId}/responses` — :88, which **answers with the result rather than the vote**.',
      '**The tally is computed in the database and there is nothing on the client that could compute one:** `PollOptionResponse` deliberately carries no count, so a component holding a poll has nothing to add up. §24 is structural here rather than a convention.',
      '**A withheld tally returns `options: null`, never an empty array** — an empty array renders as “nobody voted”, which is a different and false statement — and `resultsHiddenReason` is what the client draws in its place.',
    ],
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
      'The dashboard reads a simulated capability set for the caller against each organization and renders only the sections that set allows. **The client never decides the set** — it asks for it and renders the answer, which is the same call it would make against a real contract.',
    coverage: 'none',
    missingContract: [
      'GET /api/v1/communities/organizations/me — every organization the caller has a role in, with the role',
      'GET /api/v1/communities/organizations/{organizationId}/capabilities — the caller’s permitted actions, as data',
      'POST /api/v1/communities/organizations/{organizationId}/members/{userId}/role — assign or revoke, role-gated',
      'An `OrganizationRole` enum: Owner, Administrator, Organizer, Treasurer, Moderator, Member',
      'A permission matrix mapping each role to the actions in §28–§32, served rather than compiled into the client',
      'Every write route in this register enforcing the matrix server-side — a client-side gate is a convenience, never a control',
    ],
    existingSeams: [
      'B12 already models the organization itself, its verification and its leaders (`OrgLeader` has `name` and `role` as display text, not as an authorization fact)',
      '`PublishingIdentity` in `types/creator.ts` already models acting as an organization rather than as a person',
      'The Trust module already carries account-level roles and restrictions',
    ],
    whyNotImplementable:
      '`OrgLeader.role` is a string for a profile page — "Pastor", "Chair" — with no authorization meaning. There is no membership edge between a user and an organization at all, so nothing can answer "may this person approve members?". §19 forbids the frontend answering it, so the capability set is fetched from the adapter and every gated action is additionally refused server-side in the simulation.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.**',
      '`GET /api/v1/communities/organizations/me` — OrganizationEndpoints.cs:282, each row with its role and capability set. `GET /api/v1/communities/organizations/{organizationId}/capabilities` — :292, **served as data**: ten flags the client renders and computes none of.',
      '`POST /api/v1/communities/organizations/{organizationId}/members/{userId}/role` — :318. The route is B18’s because it owns the prefix; the write is dispatched to B12, which owns the role edge.',
      '`GET /api/v1/communities/organizations/{organizationId}/dashboard` — :305, capabilities and section counts in one call.',
      '**Every gated route re-decides the capability independently on each request.** The permission says the caller may run a programme *somewhere*; whether they may run *this* one is asked separately every time, because a token cannot carry the second. A hidden button remains a convenience, not a control.',
      '**The dashboard counts six things and not ten.** Events, series and campaigns belong to B12 and B15, and this route does not reach across for them — so those four counts arrive null and the screen draws an em dash rather than a zero that would read as “none”.',
    ],
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
      'Overview counters, membership growth, event attendance, donation totals, volunteer hours and poll participation render through a development analytics adapter, marked as simulated on every panel. Where B15 can answer a figure — funds raised for a cause — the real figure is used and marked as real.',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/organizations/{organizationId}/analytics?period — counters and series for members, events, donations, volunteers and polls',
      'GET /api/v1/communities/organizations/{organizationId}/analytics/members?period — joins, renewals, churn',
      'A documented recomputation cadence, so the UI can say how fresh a figure is instead of implying it is live',
    ],
    existingSeams: [
      'Phase 6’s `monetization-gap` analytics adapter and Phase 7’s `creator-gap` analytics adapter already establish the shape and the marking convention this reuses',
      '`DonationCause.raised` and `.supporterCount` are real and are the only fundraising figures printed as fact',
      '`Event.viewCount`, `.shareCount` and `.saveCount` are real B12 counters and are used as such',
    ],
    whyNotImplementable:
      'There is no analytics projection for an organization anywhere on the platform, and §34 forbids inventing a metric. The adapter exists so the dashboard is complete and reviewable; every simulated panel says so on its face.',
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
      'Neighbourhood event discovery reuses B12’s real event list with real coordinates and the platform’s real distance filtering. What is simulated is the *neighbourhood identity* on an event — the named area an event belongs to, as opposed to the point it happens at — and the neighbourhood activity digest.',
    coverage: 'partial',
    missingContract: [
      'A `neighborhoodId` on the B12 event contract, and `GET /api/v1/community-life/events?neighborhoodId=`',
      'GET /api/v1/neighborhoods/{neighborhoodId}/events',
      'GET /api/v1/neighborhoods/{neighborhoodId}/activity — the digest of what has happened locally',
      'A neighbourhood-scoped authorization rule for who may post to a neighbourhood',
    ],
    existingSeams: [
      'B12 events already carry `latitude`, `longitude` and a server-computed `distanceKm`, and `/community-life/events` already accepts `latitude`, `longitude` and `radiusKm` — proximity discovery is real and is used unchanged',
      '`EventLocation.areaName` already names an area as free text',
      '`app/neighborhood/[id].tsx` and the location store already exist',
      '`EventFormState.neighborhood` already exists on the create form',
    ],
    whyNotImplementable:
      'An area name is a string on a location, not an entity. Two events in "Peckham" are not related by anything the backend can query, so a neighbourhood feed can only be assembled by string-matching — which is not a contract. Proximity is real and is what the UI leans on; the named-neighbourhood binding is simulated.',
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
      'The announcement feed — community, organization, neighbourhood, event, campaign, volunteer and poll announcements — renders from a simulated feed. **Delivery is not simulated**: every announcement notification is a real B13 notification, and this phase adds no delivery infrastructure.',
    coverage: 'partial',
    missingContract: [
      'POST /api/v1/communities/announcements — role-gated, scoped to an organization, neighbourhood or community',
      'GET /api/v1/communities/announcements?scope&scopeId&cursor',
      'An `announcement.published` integration event so B13 fans it out to the right audience',
      'An audience-resolution rule, so an organization announcement reaches its members and nobody else',
    ],
    existingSeams: [
      'B9 Community Updates already models a published, versioned community post with media — an announcement is a scoped variant of one, not a new thing',
      'B13 already carries delivery, preferences and the inbox; `notifications-api.ts` and `notification-routes.ts` are used as-is',
      'B12 organizations already have followers, which is the closest existing audience',
    ],
    whyNotImplementable:
      'B9 posts are authored by a member to a country audience. There is no scope on them, so an organization cannot address its members, and there is no audience-resolution rule to reuse.',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    existingBackendCapability: [
      '**Closed by B18; connected in Wave C-04.**',
      '`POST /api/v1/communities/announcements` — PollAndAnnouncementEndpoints.cs:157, role-gated and idempotent; B13 delivers it.',
      '`GET /api/v1/communities/announcements` — :131. **The audience rule is applied in the query**, so the page is already what the caller may see and there is no client-side filter.',
      'Media arrive as B5 asset identifiers rather than URLs, so the client claims no URL for them.',
      '**Deliberately not rewired:** the release-notes screen reads a different route and is a changelog, which is a different thing from a community announcement. Wave C-04 left it alone.',
    ],
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
      'The impact view renders through the development analytics adapter and is marked as simulated in full, with the sole exception of the member’s own real giving history from `GET /financial/giving/me`, which is shown as real.',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/impact?scope=member|organization|neighborhood|country&scopeId&period',
      'A documented definition for every metric — what counts as a member helped, what counts as an event hosted — since an undefined metric is worse than an absent one',
    ],
    existingSeams: [
      '`GET /api/v1/financial/giving/me` is real and returns the caller’s donations, contributions and non-monetary contribution count — the one impact figure this phase prints as fact',
      '`DonationCause.supporterCount` and `.raised` are real per cause',
      'Phase 7’s creator impact panels establish the marking convention',
    ],
    whyNotImplementable:
      '§34 says do not invent metrics. No aggregate exists, and a client that summed what it could see would produce a number that changes with the cache.',
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
      'The hub’s "For you" rail reads the platform’s Communities surface (`GET /recommendations/communities`) and renders the ordered list it is given with the server’s reason on each card; "Not interested" sends `POST /recommendations/dismiss` with the item’s target, surface, set and position, and removes the card once the server records it. This phase adds **no ranking logic**. Recommendations of Community Life entities themselves (events, memberships, volunteering, campaigns, polls) have no surface on B14 and are not shown.',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/recommendations/community?surface=hub|events|organizations|memberships|volunteer|campaigns|polls|neighborhood&take',
      'POST /api/v1/recommendations/{recommendationId}/dismiss — already proposed by CREATOR-GAP-013 and shared with it',
      'A `reason` string per recommendation, so the UI can say why something was suggested',
    ],
    existingSeams: [
      'B14 is the recommendation engine and this is a new surface on it, not a new engine',
      'Phase 7 already proposed `GET /recommendations/creator` (CREATOR-GAP-013) with the same shape — the two should be one route with a surface parameter',
      // Remediation Wave J. This line used to read "B12’s
      // `/community-life/events?filterType=recommended` already exists and is a
      // coarse server-side filter — it is used where it fits". There is no
      // `filterType` property on `EventSearchParameters`
      // (`CommunityLife/Api/CommunityLifeDiscoveryEndpoints.cs:113`) and never
      // has been; the parameter was discarded by the model binder and the route
      // answered 200 with an unfiltered page. So there is no coarse
      // server-side recommendation to fall back on, and this seam is not one.
      'B12 has **no** recommendation filter on the event route — the `filterType=recommended` this line used to claim does not bind. The only genuine discovery filter there is `free`.',
    ],
    whyNotImplementable:
      'B14 exposes no community surface. §35 forbids building a second recommendation engine, so the ordered list comes from the adapter and the client contributes no ranking.',
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
      'Phase 12 notification types are registered in the existing B13 routing table so that when the backend emits them the inbox already routes them to the right screen. No delivery infrastructure is added by this phase.',
    coverage: 'partial',
    missingContract: [
      'B13 notification types: `membership.approved`, `membership.rejected`, `membership.renewal.due`, `membership.expired`, `event.reminder`, `event.series.reminder`, `event.occurrence.cancelled`, `donation.receipt`, `campaign.update`, `campaign.milestone`, `volunteer.application.decided`, `volunteer.assignment.created`, `poll.closing`, `poll.result`, `organization.announcement`, `neighborhood.event`',
      'A payload contract per type carrying the subject identifier the deep link needs',
    ],
    existingSeams: [
      'B13 delivery, preferences, the inbox and `notifications-api.ts` are real and are used unchanged',
      '`lib/notification-routes.ts` already maps a notification type to a destination route and is extended by this phase rather than replaced',
      'B13.1 already enriched notification event contracts once, so the extension path is established',
    ],
    whyNotImplementable:
      'The transport exists; the templates and payload contracts for these sixteen types do not. Nothing is faked — the routing entries simply have nothing to route yet.',
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
      'Live fundraising progress, poll result updates, occurrence cancellation and membership decisions subscribe through the platform’s existing realtime seam. Where no channel exists the repository falls back to a bounded refetch, and the screen says the figure is periodic rather than live.',
    coverage: 'partial',
    missingContract: [
      'Realtime channels `community:campaign:{campaignId}`, `community:poll:{pollId}`, `community:organization:{organizationId}` and `community:membership:{membershipId}`',
      'Event payloads for `campaign.progress.changed`, `poll.result.changed`, `occurrence.cancelled` and `membership.status.changed`',
      'A documented authorization rule per channel, since a poll result channel must not leak a private poll',
    ],
    existingSeams: [
      'B13.2 already runs a realtime transport for conversations, presence and typing (`store/presence.ts`, `store/typing.ts`, `lib/realtime-mock.ts`)',
      'TanStack Query invalidation is already how every other phase applies a push to the UI',
    ],
    whyNotImplementable:
      'The transport is real and carries conversations only. §37 forbids a parallel realtime layer, so this phase subscribes where it can and degrades to polling where it cannot, saying which is in effect.',
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
      'One search box queries events, organizations, memberships, campaigns, volunteer opportunities, polls and neighbourhood events. **Remediation Wave I — all three arms behind it are now certified.** Events and organizations go to B12’s routes; membership, volunteering, polls and announcements go to the real federated route, which orders them by a relevance score the server computes. Nothing on this surface reaches the development adapter any more, and the screen groups the three result sets by type rather than interleaving them by a score only one of them carries.',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/communities/search?q&types[]&country&community&neighborhood&from&to&distanceKm&priceBand&organizationId&cause&eventType&cursor — one federated route. **SHIPPED, narrower than asked for:** PollAndAnnouncementEndpoints.cs:239 binds `q`, `types`, `countryCode`, `cityName`, `organizationId`, `cause`, `priceBand` and `take`. It does not bind `country`, `community`, `neighborhood`, `from`, `to`, `distanceKm`, `eventType` or `cursor`, and it returns `nextCursor: null` unconditionally — a federated page over four sources cannot carry one resumable token. The declaration is kept rather than deleted because the *contract* asked for is still wider than the one served.',
      'A relevance contract, so the merge order is the server’s decision rather than the client’s concatenation. **SHIPPED for the four types B18 owns**, and stated in the handler: an exact title match outranks a prefix, a prefix outranks a substring, a body match ranks below all three, and recency breaks ties (CommunitySearchQuery.cs:312-344). It is still missing *across* modules — events and organisations are ranked by B12 and the score is stripped from the response, so no client can compare a poll to an event and none should try.',
    ],
    existingSeams: [
      '`/community-life/events` is real and used directly — **but not with the parameters this line used to name.** It binds `q`, `category` (repeated lower-kebab catalogue keys), `facet`, `organizationId`, `countryCode`, `city`, `neighborhoodAreaId`, `bounds`, `startsAfter`, `startsBefore`, `sort`, `cursor` and `limit`. It does **not** bind `query`, `cityName`, `latitude`, `longitude`, `radiusKm`, `filterType`, `timeFilter` or `sortBy`; unbound query parameters are discarded by the model binder without an error, which is how the search tab spent this long answering a search with an unfiltered browse.',
      '`/community-life/organizations` is real and used directly. It binds `q`, `type` (repeated), `countryCode`, `city`, `neighborhoodAreaId`, `bounds`, `verified`, `featured`, `acceptingMembers`, `language`, `sort`, `cursor` and `limit` — **not** `query`, `category`, `cityName` or any proximity parameter.',
      'The platform search infrastructure and `types/search.ts` already exist',
    ],
    whyNotImplementable:
      'Two of the seven searchable types still have none. `series` has a route that binds `q` (`GET /community-life/events/series`) and simply has no arm in the client yet; `campaign` is B15.1’s and does not exist in either repository. Both are reported to the screen as unsearchable so a filter naming one says so, rather than returning an empty list that reads as “nothing matched”.',
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
      'Every Phase 12 mutation that could double-submit — membership application, membership payment, donation, contribution, volunteer application, poll vote, event registration — acquires a persisted idempotency key through the platform’s existing `acquireIdempotencyKey` and sends it. For B15 routes the key is honoured; for adapter routes it is honoured by the simulation.',
    coverage: 'partial',
    missingContract: [
      'An `Idempotency-Key` header (or body field) accepted and uniquely indexed on every community write route proposed in this register',
      'A documented 409 response shape for a replayed key whose original is still in flight',
    ],
    existingSeams: [
      '`lib/idempotency.ts` already persists a key across retries and app restarts, scoped to an operation, with a TTL and a release on terminal state',
      'B15 already uniquely indexes `IdempotencyKey` on payment intents, purchases, subscriptions, donations and contributions — the pattern to copy exists and is certified',
    ],
    whyNotImplementable:
      'The client-side half is complete and real. The server-side half exists only for B15 routes, so a membership application retried against a real future backend would double-submit unless the contract is specified now.',
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
      'The hub composes its summary on the device from the served lists — `GET /community-life/events` (upcoming, and around the member’s point), `GET /communities/memberships/me`, `GET /communities/organizations/me`, `GET /communities/campaigns`, `GET /communities/volunteer/opportunities`, `GET /communities/polls`, `GET /communities/announcements`, `GET /community-life/area/activity` and `GET /recommendations/communities` — each a short first page read in parallel. Counts come from those lists: the server total where published, a marked lower bound where not, and nothing where a list has not answered.',
    coverage: 'partial',
    missingContract: [
      'GET /api/v1/community-life/hub/summary — one call answering the counts and the first page of each rail, scoped to the caller and their place',
    ],
    existingSeams: [
      'Every rail the hub links to is served: events and area activity by B12 (`/community-life`), organisations, memberships, campaigns, volunteering, polls and announcements by B18 (`/communities`), and recommended communities by B14 — all with real routes and real screens',
    ],
    whyNotImplementable:
      'Written when the aggregate was believed necessary: "a client-side fan-out across six modules on every hub open is the waterfall §47 prohibits." §47 forbids loading everything, not reading several short pages at once; the hub reads one short page per list, in parallel, and no screen waits on another. An aggregate route would still save round trips and remains a fair backend request.',
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
