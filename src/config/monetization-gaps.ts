// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend capability gaps (Frontend Phase 6, Monetization)
//
// ⚠ EVERYTHING REGISTERED HERE IS UNSUPPORTED BY THE CERTIFIED BACKEND. ⚠
//
// B15 is frozen following PSR-1 Final Certification. It already ships a real
// monetization spine — a product catalogue, purchases, placements, promotion
// codes, subscription plans and entitlements — and Phase 6 uses those directly.
// What it does not ship is the advertising platform, any performance metric, any
// plan *change*, any usage counter and any approval workflow.
//
// This file is the register for that second set. It is the single place that
// answers, for each gap: what is missing, what the frontend does instead, which
// contract would have to exist, and who owns it.
//
// The same three mechanisms Phase 5 established keep a simulated capability from
// being mistaken for a real one:
//
//   1. **A different URL space.** Monetization gap endpoints live under
//      `/monetization-gap/v0/…`, never `/financial/…`. A gap call that escaped
//      to a real deployment gets a 404 from the gateway instead of quietly
//      reaching a certified route.
//   2. **A visible marker.** Every gap-backed surface renders
//      `<MonetizationGapNotice>`, which names the missing contract on the screen.
//   3. **A single switch.** `areMonetizationGapsEnabled()` is false in release
//      builds, so a production binary ships no simulated campaign, no invented
//      impression count and no fake plan change.
//
// When a gap is closed, the entry moves out of this file, the screen swaps
// `monetization-gap-api` for `financial-api`, and the notice disappears. Nothing
// else about the screen changes — which is the whole reason to build the flow
// now rather than later.
//
// Gap identifiers are `MON-GAP-0xx` and are quoted verbatim in
// `frontend-phase-6-backend-gap-register.md`.
// ─────────────────────────────────────────────────────────────────────────────

import { areSimulatedFeaturesEnabled } from './gap-preview';

/** Where the responsibility sits, so the next backend phase can scope it. */
export type MonetizationGapOwner =
  /** B15's own domain; the seam exists and the capability was scoped out. */
  | 'B15-incomplete'
  /** B14's domain — recommendations that happen to be monetization-shaped. */
  | 'B14-recommendation'
  /** Nobody's brief yet. A later phase's work. */
  | 'future-evolution';

export type MonetizationGapPriority = 'critical' | 'high' | 'medium' | 'low';

export interface MonetizationGap {
  /** `MON-GAP-001`. Stable, and quoted by screens and by the register. */
  id: string;
  /** The key screens use. Short, lower case, no prefix. */
  key: string;
  /** What a member would call it. */
  title: string;
  /** The Phase 6 scope item this belongs to. */
  feature: string;
  /**
   * How far this entry has been resolved, when it has been.
   *
   * Added by Remediation Wave C-06, and it is read by more than a human:
   * `src/lib/__tests__/backend-gap-register-drift.test.ts` skips a gap whose
   * status says the backend is connected, because such an entry is no longer
   * making a claim of absence and its contracts are a historical record rather
   * than a live assertion.
   *
   * `IMPLEMENTED + BACKEND PARTIAL` where some of the declared contract landed
   * and some did not — MON-GAP-009's next charge shipped and its invoices did
   * not, and rounding that up to CONNECTED would erase the half that is still
   * missing.
   *
   * Absent means unresolved, which is what every other entry in this file still
   * is. `missingContract` is deliberately **not** emptied on resolution: the
   * declaration is what makes the entry legible as a record of what was once
   * true, and deleting it would turn "we were wrong about this" into "this was
   * never here".
   */
  frontendStatus?: 'IMPLEMENTED + BACKEND CONNECTED' | 'IMPLEMENTED + BACKEND PARTIAL';
  /** One sentence on what the frontend does today. */
  frontendBehaviour: string;
  /** What the backend would have to expose. Route-level, not hand-waving. */
  missingContract: string[];
  /** What exists already, so a future phase does not rebuild it. */
  existingSeams: string[];
  /** Why the frontend cannot safely implement it against what exists. */
  whyNotImplementable: string;
  owner: MonetizationGapOwner;
  priority: MonetizationGapPriority;
  /** Which backend phase should pick it up. */
  recommendedPhase: string;
}

/**
 * The eleven gaps.
 *
 * Each is derived from reading the certified contract surface —
 * `src/types/financial.ts` mirrors it field for field — rather than from a
 * roadmap: a capability is listed here only after the contract was searched for
 * it and it was not there.
 */
export const MONETIZATION_GAPS: Record<string, MonetizationGap> = {
  campaigns: {
    id: 'MON-GAP-001',
    key: 'campaigns',
    title: 'Advertising campaigns',
    feature: 'Advertising platform',
    frontendBehaviour:
      'The whole advertising surface — dashboard, campaign wizard, objective, placement, creative, audience, budget, schedule, preview, checkout, submission, review, pause, resume, cancel, performance — runs against simulated persistence and is labelled as such on every screen.',
    missingContract: [
      'POST /api/v1/financial/campaigns — create a draft campaign (name, objective, placements, creative reference, audience, budget, schedule)',
      'GET /api/v1/financial/campaigns/me?status&take — the caller’s campaigns',
      'GET /api/v1/financial/campaigns/{id} — one campaign with its authoritative status',
      'PUT /api/v1/financial/campaigns/{id} — edit a draft',
      'POST /api/v1/financial/campaigns/{id}/submit — submit for review, returning the payment intent to fund it',
      'POST /api/v1/financial/campaigns/{id}/pause and /resume — an operator-visible run state',
      'POST /api/v1/financial/campaigns/{id}/cancel — stop and settle the unspent budget',
      'A `CampaignStatus` enum: Draft, PendingPayment, Submitted, UnderReview, Approved, Scheduled, Active, Paused, Completed, Rejected, Cancelled, Failed',
      'A `campaign.status.changed` integration event so B13 can notify on approval and rejection',
    ],
    existingSeams: [
      '`MonetizationProductCategory.Campaign` exists as an enum member, so a campaign-shaped *product* can be catalogued and bought',
      '`POST /financial/purchases` and the payment intent lifecycle can fund one',
      '`Placement` models "this subject is boosted until then" — a campaign is the missing layer above it',
    ],
    whyNotImplementable:
      'There is no campaign aggregate. `Campaign` is a product category and nothing else: buying one would create a `Placement` against a subject, which has no creative, no budget, no schedule beyond `startsAt`, no spend and no run state. A client that called `POST /purchases` and then drew a campaign dashboard would be drawing an entity the platform does not store.',
    owner: 'B15-incomplete',
    priority: 'critical',
    recommendedPhase: 'B16 Advertising, or B15.1',
  },

  performance: {
    id: 'MON-GAP-002',
    key: 'performance',
    title: 'Promotion and campaign performance',
    feature: 'Promotion analytics · Campaign analytics',
    frontendBehaviour:
      'Impressions, reach, clicks, engagement, conversions, spend and cost-per-result render from simulated data behind a visible marker. No metric is computed on the device from anything the backend did send.',
    missingContract: [
      'GET /api/v1/financial/placements/{id}/performance — impressions, clicks, conversions and spend for one placement, with a period',
      'GET /api/v1/financial/campaigns/{id}/performance — the same for a campaign, plus budget consumed and cost per result',
      'GET /api/v1/financial/placements/me/performance/summary — a rollup for the monetization dashboard',
      'A documented definition for every metric — what counts as an impression, what deduplication is applied, what the reporting lag is',
    ],
    existingSeams: [
      '`Placement.priorityWeight` describes how a ranking consumer should weight the subject, so the ranking side of the loop exists',
      '`FinancialCapabilities.searchProjectionEnabled` shows placements already reach a search projection',
    ],
    whyNotImplementable:
      'No impression, view or click is recorded anywhere in the certified contract. §20 of the phase brief forbids inventing metric semantics, and a "views" number derived from a listing’s own view counter would answer a different question than "how many people saw this *because* it was promoted".',
    owner: 'B15-incomplete',
    priority: 'critical',
    recommendedPhase: 'B16 Advertising, or B15.1',
  },

  planChange: {
    id: 'MON-GAP-003',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'planChange',
    title: 'Subscription upgrade and downgrade',
    feature: 'Business · Organization · Creator · Recruiter · Landlord · Seller subscriptions',
    frontendBehaviour:
      'Plan comparison, the change preview, the proration explanation, the confirmation and the change itself all run against the certified routes. `app/monetization/change-plan.tsx` reads the preview through `usePlanChangePreview` and commits through `useChangeSubscriptionPlan`, and the confirmation renders `effectiveAt` from the preview rather than inferring upgrade-versus-downgrade from a price comparison — an interval change between equally-priced plans is neither, and would be described wrongly by any comparison the client could make. A preview answering `isPermitted: false` is refused client-side, so a refusal the server has already given cannot be rediscovered as a failed charge attempt.',
    missingContract: [
      'POST /api/v1/financial/subscriptions/{id}/change — move to another plan code, idempotent',
      'GET /api/v1/financial/subscriptions/{id}/change/preview?planCode= — what it would cost today, what is credited, when the new period starts',
      'A `SubscriptionChangeKind` distinguishing an immediate upgrade from a downgrade deferred to the period end',
      'A proration policy `FinancialPolicyKind`',
    ],
    existingSeams: [
      '**RESOLVED (Remediation Wave C-06).** Both contracts exist — `SubscriptionEndpoints.cs:83` and `:103` — and both are now called. `lib/financial-api.ts` exports `previewSubscriptionChange` and `changeSubscriptionPlan`, `hooks/monetization.ts` exposes them, and `app/monetization/change-plan.tsx` is the consumer. This array used to end "no client arm calls either route, so the change is still simulated", which is the sentence this line replaces.',
      'The backend summary states the proration rule this entry once called undocumented: "An upgrade takes effect now and charges the difference; a downgrade waits for the period boundary, because somebody who paid for the month keeps the month."',
      '**One divergence from what was declared, in the direction that breaks silently.** `PlanChangePreviewResponse.nextChargeAt` is nullable and the development adapter’s was not, so the screen read it unguarded and rendered "Invalid Date" on any destination with no next charge. A null there is not an unknown date, it is a plan that will not charge again, and the line now drops the date rather than inventing one.',
      'Idempotency is **body-only**: `SubscriptionEndpoints.cs:118` reads `request.IdempotencyKey` and no handler in this module inspects a header, so a key sent as one is silently ignored.',
      '`POST /financial/subscriptions` activates a plan and `POST /financial/subscriptions/{id}/cancel` stops one',
      '`Subscription.cancelAtPeriodEnd` already models deferring a change to the period boundary',
      '`SubscriptionPlan.entitlements[]` makes the *effect* of a change computable for display',
    ],
    whyNotImplementable:
      'IT IS IMPLEMENTED, and this field is kept as the record of when it was not. The sentence it used to carry — "Only activate and cancel exist … nothing in the contract says what happens to the money already paid for the current period" — was true when written and is no longer: the change route, its preview and a stated proration rule all ship. The wave before this one found the routes and deliberately did **not** mark the entry resolved, on the grounds that a register saying CONNECTED while the screen still simulates is the same failure in the other direction. That judgement was right, and the answer to it was to build the client arm rather than to relabel the entry.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  renewal: {
    id: 'MON-GAP-004',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    key: 'renewal',
    title: 'Promotion renewal',
    feature: 'Provider · job · housing · marketplace · guide · update · event · organization promotion renewal',
    frontendBehaviour:
      'Renewal and the auto-renew preference both call the real routes. `app/monetization/promotions/[id].tsx` offers "Run it for longer", which posts the renew route and **extends the placement that exists** rather than queueing a second one behind it, and an auto-renew toggle backed by the preference route. The renew route answers a purchase whose payment intent is created and not captured, so the screen says the renewal has been *started* and sends the member to the payment — it never reports a renewal as done. A promotion that has already finished still goes to the purchase flow, because there is no window left to extend.',
    missingContract: [
      'POST /api/v1/financial/placements/{id}/renew — extend an existing placement rather than opening a second one',
      'PUT /api/v1/financial/placements/{id}/auto-renew — a stored preference the backend honours at expiry',
      'A `placement.expiring` integration event so B13 can warn before the lapse rather than after it',
    ],
    existingSeams: [
      '**PARTLY RESOLVED (Remediation Wave C-06).** Both routes exist — `CatalogEndpoints.cs:169` and `:190` — and both are now called, through `renewPlacement` and `setPlacementAutoRenew` in `lib/financial-api.ts`. The re-purchase fallback is gone from the detail screen. PARTIAL rather than CONNECTED because the third contract below is still genuinely absent: nothing emits placement.expiring, so B13 cannot warn before a lapse.',
      '**A shape divergence a caller gets wrong by assuming symmetry.** `RenewPlacementCommand` is `ICommand<MonetizationPurchaseResponse>` — renew answers a **purchase**, not a placement, with the placement nested under `.placement` and the payment under `.payment`. Pause, resume and auto-renew all answer a placement and move no money, so their result is authoritative on arrival and the renewal’s is not.',
      '`PlacementResponse` carries `autoRenewEnabled` and `pausedAt`, and `types/financial.ts` had neither. A client mapping placements without them cannot render the preference it is being asked to toggle.',
      'Omitting `productCode` is what the server reads as "the same product again". This client omits it deliberately: sending the promotion’s own code would pin the renewal to a product that may since have been withdrawn from sale, turning a renewal into a refusal on a code the member never chose.',
      '`MonetizationProduct.isRenewable` is served on every product and is respected by this client',
      '`PurchaseProductRequest.startsAt` lets a replacement placement be scheduled to begin the moment the current one ends, which is what the fallback does',
      '`billing.placement.ended` already exists as a notification template',
    ],
    whyNotImplementable:
      'The opening clause of this field — "There is no renew route and no stored auto-renew flag" — is stale and both now ship. The rest still describes what the client does today and why: the re-purchase fallback is honest and works, but it produces a second placement rather than a longer one, and B15 refuses overlapping placements with `financial.placement.overlaps`, so it has to be scheduled against the current end date rather than started immediately. The difference the member’s money notices is that the fallback left them with two purchase records and two placements to manage where renewing leaves one, and that is why the route was worth wiring.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  pause: {
    id: 'MON-GAP-005',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'pause',
    title: 'Pause and resume a promotion',
    feature: 'Promotion management',
    frontendBehaviour:
      'Pause and resume are offered on a real placement and call the certified routes. The confirmation states the arithmetic rather than assuming the member knows it — pausing banks the remaining days and resuming hands them back — because that is the one thing distinguishing it from stopping and buying again. While a promotion is paused the screen shows **no countdown**: the clock is stopped and resuming moves `endsAt`, so counting down to the stored date would show a deadline that is not going to arrive.',
    missingContract: [
      'POST /api/v1/financial/placements/{id}/pause — suspend delivery and stop the clock',
      'POST /api/v1/financial/placements/{id}/resume — restart it, extending `endsAt` by the paused duration',
      'A `Paused` member of `PlacementStatus`',
    ],
    existingSeams: [
      '**RESOLVED (Remediation Wave C-06).** All three contracts exist — `CatalogEndpoints.cs:208`, `:221`, and a `Paused` member of `PlacementStatus` — and all three are consumed: `pausePlacement`/`resumePlacement` in `lib/financial-api.ts`, `usePausePromotion`/`useResumePromotion` in `hooks/monetization.ts`, offered on the promotion detail screen. The `MonetizationGapNotice` that stood there saying pausing "is not something Diaspora can do yet" has been removed, because it had become the inaccurate half of the pair.',
      'The new status’s own documentation states the semantics this entry asked for: "a pause banks it and hands it back on resume, which is why resuming extends `Window.EndsAt` by exactly the paused duration rather than restarting the clock."',
      '**A consequence the client had to absorb, not just a route to call.** `endsAt` is stale while `pausedAt` is set, so `toPromotion` now returns a null `daysRemaining` and a false `isExpiringSoon` for a paused placement. Without that, the expiry rail would offer a renewal reminder against a deadline the pause has suspended.',
      '`DELETE /financial/placements/{id}` cancels a placement, with the refund window deciding whether money comes back',
      '`PlacementStatus` has `Scheduled`, `Active`, `Expired`, `Cancelled`, `Refunded` — and now `Paused`',
    ],
    whyNotImplementable:
      'This field is now a historical record. It used to read "`PlacementStatus` has no `Paused` member, so there is no state to write", and that is no longer true — the state, the two routes and the clock arithmetic all ship. The reasoning it rested on is still worth keeping, because it is what the pause routes were built to satisfy: cancelling and re-buying is not the same thing, it loses the remaining paid time, and presenting it as a pause would misdescribe what the member’s money just did.',
    owner: 'B15-incomplete',
    priority: 'medium',
    recommendedPhase: 'B15.1',
  },

  approval: {
    id: 'MON-GAP-006',
    key: 'approval',
    title: 'Sponsored content review and approval',
    feature: 'Sponsored guides · sponsored updates · sponsored events · promoted organizations',
    frontendBehaviour:
      'The pending-review, approved and rejected states are rendered end to end on the simulated surface. A real placement purchase is never shown as "pending review", because the platform activates it on capture.',
    missingContract: [
      'A `PendingApproval` and a `Rejected` member of `PlacementStatus`',
      'GET /api/v1/financial/placements/{id}/review — the decision, the reviewer note and the appeal route',
      'POST /api/v1/financial/placements/{id}/appeal — contest a rejection',
      'A `placement.review.decided` integration event',
      'A documented rule for what happens to the money on a rejection',
    ],
    existingSeams: [
      'B12/moderation already runs a review queue for content, and `src/app/moderation/queue.tsx` renders one',
      '`Placement.status` is an open string, so a new member would not break this client',
    ],
    whyNotImplementable:
      'B15 activates a placement when the payment captures; there is no review step and no rejected state. §13 of the brief forbids inventing backend moderation behaviour, so the approval lifecycle is built only where the whole entity is already simulated.',
    owner: 'future-evolution',
    priority: 'medium',
    recommendedPhase: 'B16 Advertising, with B12 Moderation',
  },

  targeting: {
    id: 'MON-GAP-007',
    key: 'targeting',
    title: 'Audience and placement targeting',
    feature: 'Campaign audience · promotion audience',
    frontendBehaviour:
      'The targeting builder — country, community, neighbourhood, audience type, interest, content and vertical categories — is built in full on the simulated campaign surface. The real promotion flow shows where a product places the subject, read from `placementKind`, and does not offer targeting it cannot send.',
    missingContract: [
      'A `CampaignAudience` request DTO: countries, communities, neighbourhood ids, audience types, interests, categories',
      'GET /api/v1/financial/targeting/options?dimension= — the selectable values, owned by the backend rather than hard-coded in the app',
      'GET /api/v1/financial/targeting/estimate — the reachable audience for a given selection, so the builder can show a size',
      'A statement of which dimensions the delivery engine actually honours',
    ],
    existingSeams: [
      '`PurchaseProductRequest.countryCode` and `Placement.countryCode` give a country-level scope today',
      'B14 already models communities, neighbourhoods and interests for recommendation',
      '`MonetizationSubjectType.Community` exists as a subject a placement can attach to',
    ],
    whyNotImplementable:
      'Country is the only targeting dimension on the wire. A builder that collected six more and sent one would be collecting five for nothing, so the editable builder lives with the simulated campaign and the real promotion flow shows only what it can actually apply.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B16 Advertising',
  },

  usage: {
    id: 'MON-GAP-008',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'usage',
    title: 'Entitlement usage and limits',
    feature: 'Recruiter · landlord · seller plan usage indicators',
    frontendBehaviour:
      'Both halves of every usage meter are served. `useEntitlements` composes the subscription, the plan catalogue and the entitlement snapshot, and `UsageMeter` keeps **three** states apart rather than two: a counter with a consumption draws a bar, a counter with `consumed: null` draws none and says the figure was not reported, and a counter with `consumed: 0` draws an empty bar — which is now a claim somebody actually made. The at-limit line reads `atLimitBehaviour`, so a meter at 15/15 says whether the next one is refused, queued or charged for.',
    missingContract: [
      'GET /api/v1/financial/entitlements/me — the resolved entitlement set with, for each limited key, the consumed count and the period it resets in',
      'A `UsageCounter` contract: key, limit, consumed, remaining, periodStart, periodEnd',
      'A documented rule for what happens at the limit — refuse, queue, or charge overage',
    ],
    existingSeams: [
      '**RESOLVED (Remediation Wave C-06).** `EntitlementEndpoints.cs:24` maps the route and `fetchMyEntitlements` calls it. Its summary answers the question this entry raised: a counter with no consumption means not measured, never zero.',
      '**The follow-up the previous wave flagged is closed, and the cause was a type rather than a rendering.** The development adapter’s `UsageCounter.consumed` is `number`; the real one is nullable. The simulated snapshot therefore *could not express* not-measured — every counter it produced arrived measured, so the meter had nothing to distinguish. `UsageLimit` now carries an explicit `isMeasured`, and `getUsageLimit` reads a structural counter type both arms satisfy.',
      '`atLimitBehaviour` is the third contract this entry asked for and it ships on the counter. It is carried through to the meter rather than assumed, because a limit that queues or charges for the overage is not a limit that refuses, and telling a member their next listing will fail when it will instead cost them money is a specific untruth.',
      '`Entitlement { key, value }` is served on both `SubscriptionPlan` and `Subscription`, and `value` already carries limits such as `listings.concurrent: 15`',
      'The verticals each know their own counts — Marketplace knows how many listings a member has — so a client-side count is possible but would disagree with the server the moment a listing is created elsewhere',
    ],
    whyNotImplementable:
      'The first sentence is stale — the backend now serves consumption alongside the ceiling, where a vertical has reported one. The reasoning behind it is why the route matters and still holds: counting on the device would produce a number that is wrong on a second device and wrong after any server-side expiry, and §25 forbids trusting a client-side entitlement decision. What remains is client work — reading `GET /entitlements/me` and, critically, keeping not-measured visually distinct from zero-consumed. That clause is the one this wave acted on, and the fix was in the type rather than the pixel: the adapter could not express the distinction at all.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  invoices: {
    id: 'MON-GAP-009',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    key: 'invoices',
    title: 'Invoices and upcoming charges',
    feature: 'Billing overview',
    frontendBehaviour:
      'Billing history renders from real transactions, real payments and real purchases, and the next charge is served rather than forecast: `app/monetization/billing.tsx` reads it through `useUpcomingCharges`. A row with `willRenew: false` is rendered as "access ends on", never as a forthcoming payment — the amount is zero and the date means the opposite of what it means on every other row. The invoice document and the tax breakdown remain simulated and marked.',
    missingContract: [
      'GET /api/v1/financial/invoices/me?take — issued invoices with a number, a period, line items, tax and a total',
      'GET /api/v1/financial/invoices/{id} — one invoice, including a downloadable representation',
      'GET /api/v1/financial/subscriptions/me/upcoming — the next charge, its date and its amount',
      'A tax/VAT line on the purchase and subscription contracts, where a deployment charges one',
    ],
    existingSeams: [
      '**PARTLY RESOLVED (Remediation Wave C-06), and the split is exactly where the previous wave said it was.** `SubscriptionEndpoints.cs:126` maps the upcoming-charge route — "The next charge, priced by the server rather than forecast on the device" — and `fetchUpcomingCharges` now calls it. The two invoice routes are genuinely absent: `Diaspora.Modules.Financial/Api` maps nothing under `/invoices`, and no tax field exists on any contract in the module. PARTIAL, not CONNECTED.',
      '**The route answers a list, and this entry declared it as though it answered one charge.** `GetUpcomingChargesQuery` is `IQuery<IReadOnlyList<UpcomingChargeResponse>>`: a member may hold more than one subscription and the route does not choose between them. A client reading `.amount` off the payload gets `undefined`.',
      'It covers subscriptions only. A promotion due to renew is not in this list, which is why the billing screen keeps a separate section for placements.',
      '`GET /financial/wallets/me/transactions`, `GET /financial/payment-intents` and `GET /financial/purchases` together carry every charge that has actually happened',
      '`Donation.receiptReference` and `Contribution.receiptReference` establish the receipt pattern, and `/wallet/receipts/{reference}` renders it',
      '`Subscription.currentPeriodEnd` gives the date of the next charge, though not its amount',
    ],
    whyNotImplementable:
      'There is no invoice aggregate and no tax field anywhere in the contract. The next charge amount is not the current plan price in general — a promotion, a trial or a repricing policy all change it — so forecasting it on the device would put a number in front of a member that the platform never promised.',
    owner: 'B15-incomplete',
    priority: 'medium',
    recommendedPhase: 'B15.1',
  },

  premiumAnalytics: {
    id: 'MON-GAP-010',
    key: 'premiumAnalytics',
    title: 'Premium analytics data',
    feature: 'Premium analytics upsell',
    frontendBehaviour:
      'The gate is real: `analytics.advanced` is a live entitlement key and the lock, the preview, the benefits and the upgrade path are all driven by the member’s actual subscription. The premium dataset behind the lock is simulated.',
    missingContract: [
      'GET /api/v1/analytics/premium/summary — the advanced dataset the `analytics.advanced` entitlement unlocks',
      'GET /api/v1/analytics/premium/audience — demographic and geographic breakdowns',
      'GET /api/v1/analytics/premium/export — the export the `analytics.export` entitlement names',
      'An authorization rule tying those routes to the entitlement, so the server enforces what the client draws',
    ],
    existingSeams: [
      '`analytics.advanced` and `analytics.export` are real entitlement keys served on real plans',
      'The creator dashboard already renders free-tier content metrics',
    ],
    whyNotImplementable:
      'The entitlement exists and grants access to nothing: no premium analytics route is served. §12 forbids revealing premium data the member has not bought, so the preview shows shape and labels rather than obscured real figures.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1, with the analytics module',
  },

  recommendations: {
    id: 'MON-GAP-011',
    key: 'recommendations',
    title: 'Monetization recommendations',
    feature: 'Recommended upgrade · recommended package · recommended audience',
    frontendBehaviour:
      'The recommendation rail on the monetization dashboard renders simulated suggestions behind a marker. Nothing is inferred from the member’s own data on the device.',
    missingContract: [
      'GET /api/v1/recommendations/monetization?surface= — ranked monetization suggestions with a reason code',
      'A `MonetizationRecommendation` contract: product or plan code, reason code, expected benefit, confidence',
      'A feedback route so a dismissed suggestion stops being made',
    ],
    existingSeams: [
      'B14 already ranks content, providers and people, so the ranking infrastructure exists',
      '`MonetizationProduct.sortOrder` gives a deterministic default ordering that this client uses instead',
    ],
    whyNotImplementable:
      'B14 exposes no monetization surface. Ranking products on the device from a member’s listing counts would be building a second recommendation engine, which §21 forbids.',
    owner: 'B14-recommendation',
    priority: 'low',
    recommendedPhase: 'B14.1',
  },
} as const;

export type MonetizationGapKey = keyof typeof MONETIZATION_GAPS;

/** Every gap, ordered by priority then id. For the register and the dev screen. */
export function listMonetizationGaps(): MonetizationGap[] {
  const rank: Record<MonetizationGapPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return Object.values(MONETIZATION_GAPS)
    .slice()
    .sort((left, right) => rank[left.priority] - rank[right.priority] || left.id.localeCompare(right.id));
}

/**
 * Whether MonetizationGaps features are reachable in this build.
 *
 * Delegates to `areSimulatedFeaturesEnabled()`, the single switch shared by
 * Phases 5, 6, 7 and 12.
 *
 * True under Metro and in a debug binary, and in an internal test build that
 * explicitly opted in with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. False in every
 * production build, which therefore ships no simulated campaign, no invented impression count and no fake plan change.
 *
 * Still not a runtime toggle and still not a remote flag: the opt-in is
 * inlined by Babel at build time. A simulated capability a support engineer
 * could switch on in production is one that will one day be switched on.
 * See `src/config/gap-preview.ts`.
 */
export function areMonetizationGapsEnabled(): boolean {
  return areSimulatedFeaturesEnabled();
}

/** The prefix every simulated monetization endpoint sits behind. Never `/financial`. */
export const MONETIZATION_GAP_PREFIX = '/monetization-gap/v0';
