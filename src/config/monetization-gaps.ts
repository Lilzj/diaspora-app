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
    key: 'planChange',
    title: 'Subscription upgrade and downgrade',
    feature: 'Business · Organization · Creator · Recruiter · Landlord · Seller subscriptions',
    frontendBehaviour:
      'Plan comparison, the change preview, the proration explanation and the confirmation all run; the change itself is simulated. Cancelling and subscribing from free both use the real contract.',
    missingContract: [
      'POST /api/v1/financial/subscriptions/{id}/change — move to another plan code, idempotent',
      'GET /api/v1/financial/subscriptions/{id}/change/preview?planCode= — what it would cost today, what is credited, when the new period starts',
      'A `SubscriptionChangeKind` distinguishing an immediate upgrade from a downgrade deferred to the period end',
      'A proration policy `FinancialPolicyKind`',
    ],
    existingSeams: [
      '`POST /financial/subscriptions` activates a plan and `POST /financial/subscriptions/{id}/cancel` stops one',
      '`Subscription.cancelAtPeriodEnd` already models deferring a change to the period boundary',
      '`SubscriptionPlan.entitlements[]` makes the *effect* of a change computable for display',
    ],
    whyNotImplementable:
      'Only activate and cancel exist. Calling `POST /subscriptions` with a second plan code while a subscription is live is not a documented upgrade path, and nothing in the contract says what happens to the money already paid for the current period. Guessing a proration credit would be the client pricing money.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  renewal: {
    id: 'MON-GAP-004',
    key: 'renewal',
    title: 'Promotion renewal',
    feature: 'Provider · job · housing · marketplace · guide · update · event · organization promotion renewal',
    frontendBehaviour:
      'The renewal offer, the reminder on an expiring promotion and the auto-renew preference are shown; the renewal itself falls back to buying the product again, which is real and is what the confirmation says it is doing.',
    missingContract: [
      'POST /api/v1/financial/placements/{id}/renew — extend an existing placement rather than opening a second one',
      'PUT /api/v1/financial/placements/{id}/auto-renew — a stored preference the backend honours at expiry',
      'A `placement.expiring` integration event so B13 can warn before the lapse rather than after it',
    ],
    existingSeams: [
      '`MonetizationProduct.isRenewable` is served on every product and is respected by this client',
      '`PurchaseProductRequest.startsAt` lets a replacement placement be scheduled to begin the moment the current one ends, which is what the fallback does',
      '`billing.placement.ended` already exists as a notification template',
    ],
    whyNotImplementable:
      'There is no renew route and no stored auto-renew flag. The re-purchase fallback is honest and works, but it produces a second placement rather than a longer one, and B15 refuses overlapping placements with `financial.placement.overlaps` — so it has to be scheduled against the current end date rather than started immediately.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  pause: {
    id: 'MON-GAP-005',
    key: 'pause',
    title: 'Pause and resume a promotion',
    feature: 'Promotion management',
    frontendBehaviour:
      'Pause and resume are offered on the simulated campaign surface only. A real placement offers cancel — which exists — and says plainly that pausing is not yet possible.',
    missingContract: [
      'POST /api/v1/financial/placements/{id}/pause — suspend delivery and stop the clock',
      'POST /api/v1/financial/placements/{id}/resume — restart it, extending `endsAt` by the paused duration',
      'A `Paused` member of `PlacementStatus`',
    ],
    existingSeams: [
      '`DELETE /financial/placements/{id}` cancels a placement, with the refund window deciding whether money comes back',
      '`PlacementStatus` has `Scheduled`, `Active`, `Expired`, `Cancelled` and `Refunded`',
    ],
    whyNotImplementable:
      '`PlacementStatus` has no `Paused` member, so there is no state to write. Cancelling and re-buying is not the same thing — it loses the remaining paid time — and presenting it as a pause would be misdescribing what the member’s money just did.',
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
    key: 'usage',
    title: 'Entitlement usage and limits',
    feature: 'Recruiter · landlord · seller plan usage indicators',
    frontendBehaviour:
      'The limit half of every usage meter is real — it is read from the entitlement value the backend serves. The consumed half is simulated, and the meter says so rather than drawing a bar from a number nobody sent.',
    missingContract: [
      'GET /api/v1/financial/entitlements/me — the resolved entitlement set with, for each limited key, the consumed count and the period it resets in',
      'A `UsageCounter` contract: key, limit, consumed, remaining, periodStart, periodEnd',
      'A documented rule for what happens at the limit — refuse, queue, or charge overage',
    ],
    existingSeams: [
      '`Entitlement { key, value }` is served on both `SubscriptionPlan` and `Subscription`, and `value` already carries limits such as `listings.concurrent: 15`',
      'The verticals each know their own counts — Marketplace knows how many listings a member has — so a client-side count is possible but would disagree with the server the moment a listing is created elsewhere',
    ],
    whyNotImplementable:
      'The backend serves the ceiling and never the consumption. Counting on the device would produce a number that is wrong on a second device and wrong after any server-side expiry, and §25 forbids trusting a client-side entitlement decision.',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  invoices: {
    id: 'MON-GAP-009',
    key: 'invoices',
    title: 'Invoices and upcoming charges',
    feature: 'Billing overview',
    frontendBehaviour:
      'Billing history renders from real transactions, real payments and real purchases. The invoice document, the tax breakdown and the next-charge forecast are simulated and marked.',
    missingContract: [
      'GET /api/v1/financial/invoices/me?take — issued invoices with a number, a period, line items, tax and a total',
      'GET /api/v1/financial/invoices/{id} — one invoice, including a downloadable representation',
      'GET /api/v1/financial/subscriptions/me/upcoming — the next charge, its date and its amount',
      'A tax/VAT line on the purchase and subscription contracts, where a deployment charges one',
    ],
    existingSeams: [
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
 * Whether monetization gap features are reachable in this build.
 *
 * `__DEV__` is React Native's build-time flag: true under Metro and in a
 * development client, false in a release bundle. So a production binary has no
 * simulated campaign, no invented impression count and no fake plan change — the
 * entry points render an honest "not available yet" instead.
 *
 * Deliberately not a runtime toggle or a remote flag, for the same reason
 * `areGapFeaturesEnabled()` is not: a simulated monetization capability that a
 * support engineer could switch on in production is one that will one day be
 * switched on.
 */
export function areMonetizationGapsEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** The prefix every simulated monetization endpoint sits behind. Never `/financial`. */
export const MONETIZATION_GAP_PREFIX = '/monetization-gap/v0';
