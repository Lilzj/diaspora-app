// GENERATED FILE — DO NOT EDIT.
//
// The production twin of `monetization-gaps.ts`, derived by
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

  /**
   * What is real and what is not, for an entry the backend serves *part* of.
   *
   * Every notice on this platform returns null for `connected` and otherwise
   * says "nothing here works", so a partial entry reads as an absent one. This
   * is the sentence a partial entry shows instead, written for the member.
   */
  backendPartialNote?: string;
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
    backendStatus: 'connected',
    key: 'campaigns',
    title: 'Advertising campaigns',
    feature: 'Advertising platform',
    frontendBehaviour:
      '',
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
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'critical',
    recommendedPhase: 'B16 Advertising, or B15.1',
  },

  performance: {
    id: 'MON-GAP-002',
    backendStatus: 'connected',
    key: 'performance',
    title: 'Promotion and campaign performance',
    feature: 'Promotion analytics · Campaign analytics',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/financial/placements/{id}/performance — impressions, clicks, conversions and spend for one placement, with a period',
      'GET /api/v1/financial/campaigns/{id}/performance — the same for a campaign, plus budget consumed and cost per result',
      'GET /api/v1/financial/placements/me/performance/summary — a rollup for the monetization dashboard',
      'A documented definition for every metric — what counts as an impression, what deduplication is applied, what the reporting lag is',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'critical',
    recommendedPhase: 'B16 Advertising, or B15.1',
  },

  planChange: {
    id: 'MON-GAP-003',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'planChange',
    title: 'Subscription upgrade and downgrade',
    feature: 'Business · Organization · Creator · Recruiter · Landlord · Seller subscriptions',
    frontendBehaviour:
      '',
    missingContract: [
      'POST /api/v1/financial/subscriptions/{id}/change — move to another plan code, idempotent',
      'GET /api/v1/financial/subscriptions/{id}/change/preview?planCode= — what it would cost today, what is credited, when the new period starts',
      'A `SubscriptionChangeKind` distinguishing an immediate upgrade from a downgrade deferred to the period end',
      'A proration policy `FinancialPolicyKind`',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  renewal: {
    id: 'MON-GAP-004',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND PARTIAL',
    key: 'renewal',
    title: 'Promotion renewal',
    feature: 'Provider · job · housing · marketplace · guide · update · event · organization promotion renewal',
    frontendBehaviour:
      '',
    missingContract: [
      'POST /api/v1/financial/placements/{id}/renew — extend an existing placement rather than opening a second one',
      'PUT /api/v1/financial/placements/{id}/auto-renew — a stored preference the backend honours at expiry',
      'A `placement.expiring` integration event so B13 can warn before the lapse rather than after it',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  pause: {
    id: 'MON-GAP-005',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'pause',
    title: 'Pause and resume a promotion',
    feature: 'Promotion management',
    frontendBehaviour:
      '',
    missingContract: [
      'POST /api/v1/financial/placements/{id}/pause — suspend delivery and stop the clock',
      'POST /api/v1/financial/placements/{id}/resume — restart it, extending `endsAt` by the paused duration',
      'A `Paused` member of `PlacementStatus`',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'medium',
    recommendedPhase: 'B15.1',
  },

  approval: {
    id: 'MON-GAP-006',
    backendStatus: 'connected',
    key: 'approval',
    title: 'Sponsored content review and approval',
    feature: 'Sponsored guides · sponsored updates · sponsored events · promoted organizations',
    frontendBehaviour:
      '',
    missingContract: [
      'A `PendingApproval` and a `Rejected` member of `PlacementStatus`',
      'GET /api/v1/financial/placements/{id}/review — the decision, the reviewer note and the appeal route',
      'POST /api/v1/financial/placements/{id}/appeal — contest a rejection',
      'A `placement.review.decided` integration event',
      'A documented rule for what happens to the money on a rejection',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'future-evolution',
    priority: 'medium',
    recommendedPhase: 'B16 Advertising, with B12 Moderation',
  },

  targeting: {
    id: 'MON-GAP-007',
    backendStatus: 'connected',
    key: 'targeting',
    title: 'Audience and placement targeting',
    feature: 'Campaign audience · promotion audience',
    frontendBehaviour:
      '',
    missingContract: [
      'A `CampaignAudience` request DTO: countries, communities, neighbourhood ids, audience types, interests, categories',
      'GET /api/v1/financial/targeting/options?dimension= — the selectable values, owned by the backend rather than hard-coded in the app',
      'GET /api/v1/financial/targeting/estimate — the reachable audience for a given selection, so the builder can show a size',
      'A statement of which dimensions the delivery engine actually honours',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B16 Advertising',
  },

  usage: {
    id: 'MON-GAP-008',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'usage',
    title: 'Entitlement usage and limits',
    feature: 'Recruiter · landlord · seller plan usage indicators',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/financial/entitlements/me — the resolved entitlement set with, for each limited key, the consumed count and the period it resets in',
      'A `UsageCounter` contract: key, limit, consumed, remaining, periodStart, periodEnd',
      'A documented rule for what happens at the limit — refuse, queue, or charge overage',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1',
  },

  invoices: {
    id: 'MON-GAP-009',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'invoices',
    title: 'Invoices and upcoming charges',
    feature: 'Billing overview',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/financial/invoices/me?take — issued invoices with a number, a period, line items, tax and a total',
      'GET /api/v1/financial/invoices/{id} — one invoice, including a downloadable representation',
      'GET /api/v1/financial/subscriptions/me/upcoming — the next charge, its date and its amount',
      'A tax/VAT line on the purchase and subscription contracts, where a deployment charges one',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'medium',
    recommendedPhase: 'B15.1',
  },

  premiumAnalytics: {
    id: 'MON-GAP-010',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'premiumAnalytics',
    title: 'Premium analytics data',
    feature: 'Premium analytics upsell',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/analytics/premium/summary — the advanced dataset the `analytics.advanced` entitlement unlocks',
      'GET /api/v1/analytics/premium/audience — demographic and geographic breakdowns',
      'GET /api/v1/analytics/premium/export — the export the `analytics.export` entitlement names',
      'An authorization rule tying those routes to the entitlement, so the server enforces what the client draws',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
    owner: 'B15-incomplete',
    priority: 'high',
    recommendedPhase: 'B15.1, with the analytics module',
  },

  recommendations: {
    id: 'MON-GAP-011',
    backendStatus: 'connected',
    frontendStatus: 'IMPLEMENTED + BACKEND CONNECTED',
    key: 'recommendations',
    title: 'Monetization recommendations',
    feature: 'Recommended upgrade · recommended package · recommended audience',
    frontendBehaviour:
      '',
    missingContract: [
      'GET /api/v1/recommendations/monetization?surface= — ranked monetization suggestions with a reason code',
      'A `MonetizationRecommendation` contract: product or plan code, reason code, expected benefit, confidence',
      'A feedback route so a dismissed suggestion stops being made',
    ],
    existingSeams: [],
    whyNotImplementable:
      '',
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

/**
 * Whether the **backend** serves this gap, wholly or in part.
 *
 * ⚠ This is not on its own the answer to "can this screen render". It answers
 * only for a surface whose client half calls the certified arm. A gap can be
 * `partial` on the backend while the client still reads the development adapter
 * — MON-GAP-009 was exactly that until 20 Oct 2026 — and such a surface still needs a preview
 * build, because the adapter is not in a release bundle at all. The pairing is
 * enforced in `monetization-gap-boundary`: a hook reading `gapApi` must gate on
 * `areMonetizationGapsEnabled`, and one reading the certified arm on this.
 *
 * ── The defect this exists for ────────────────────────────────────────────
 *
 * Every advertising screen used to ask `areMonetizationGapsEnabled()` — that is,
 * "are simulated features on?" — as a proxy for "does this feature work?". While
 * the surface was simulated the two were the same question, and the answer was
 * right: a release build cannot reach the adapter, so the screen said so rather
 * than drawing an empty list.
 *
 * They stopped being the same question the moment B16 shipped. The hooks were
 * repointed at the certified arm and the register was flipped to `connected`,
 * but the screens still asked about simulation — so a release build with a fully
 * deployed backend told members **"Advertising is not open yet"**. Every check
 * passed: 4,627 tests, a clean typecheck, 18 live routes, four seeded products.
 * Only the device could see it.
 *
 * So the question is asked of the register instead, which is the thing that
 * changes when a gap connects. Flipping `backendStatus` now opens the screen.
 */
export function isGapServedByBackend(key: string): boolean {
  const gap = MONETIZATION_GAPS[key];

  // An unknown key is not a licence to render. Same rule as the notice, which
  // renders nothing rather than silently dropping a marker.
  if (!gap) return false;

  // `partial` counts as served: the notice says which half is missing, and half
  // a real screen beats one that denies the platform can do it at all.
  if (gap.backendStatus === 'connected' || gap.backendStatus === 'partial') {
    return true;
  }

  // Nothing behind it, so a caller on the certified arm has nothing to call.
  return false;
}

/** The prefix every simulated monetization endpoint sits behind. Never `/financial`. */
export const MONETIZATION_GAP_PREFIX = '/monetization-gap/v0';
