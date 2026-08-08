// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — DTOs for UNSUPPORTED monetization capabilities
//
// ⚠ NONE OF THESE TYPES CORRESPONDS TO A CERTIFIED BACKEND CONTRACT. ⚠
//
// The **MockDevelopmentContract** layer. These are the shapes this client would
// need if B15 grew an advertising platform, performance reporting, plan changes,
// usage counters, invoices and premium analytics. They are written the way B15
// writes its own contracts — `Money` rather than a number, an open status
// string, an idempotency key on every mutation, a receipt reference on every
// completion, a reason code on every refusal — so that when a backend phase
// implements these, the argument about naming has already been had and the diff
// is a route change rather than a redesign.
//
// Kept in a separate file from `types/monetization.ts` on purpose: the import
// path is the boundary. Anything importing from here is touching something the
// platform cannot actually do, and that is visible at the top of the file rather
// than buried three hundred lines down.
//
// See `src/config/monetization-gaps.ts` for what is missing, why, and who owns
// each gap.
// ─────────────────────────────────────────────────────────────────────────────

import type { Money, PaymentIntent, PaymentMethodKind } from './financial';

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns — MON-GAP-001
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The campaign lifecycle §13 of the brief asks for.
 *
 * Twelve states, and the ordering matters: `Draft` and `PendingPayment` are the
 * member's, `Submitted` through `Rejected` are the platform's, and `Paused`,
 * `Completed` and `Cancelled` are terminal or near-terminal. Written as an open
 * string for the same reason every B15 status is: a client that narrows to a
 * closed union stops rendering the day a deployment is ahead of the app.
 */
export const CAMPAIGN_STATUSES = [
  'Draft',
  'PendingPayment',
  'Submitted',
  'UnderReview',
  'Approved',
  'Scheduled',
  'Active',
  'Paused',
  'Completed',
  'Rejected',
  'Cancelled',
  'Failed',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number] | (string & {});

/** What the advertiser is trying to achieve. Decides which metric leads. */
export const CAMPAIGN_OBJECTIVES = [
  'Awareness',
  'Traffic',
  'Enquiries',
  'Applications',
  'Attendance',
  'Sales',
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number] | (string & {});

/** Where an advertisement can appear. */
export const CAMPAIGN_PLACEMENTS = [
  'HomeFeed',
  'DiscoverRail',
  'SearchResults',
  'CategoryDirectory',
  'KnowledgeHub',
  'CommunityEvents',
  'Notifications',
] as const;
export type CampaignPlacementSurface = (typeof CAMPAIGN_PLACEMENTS)[number] | (string & {});

/** How the budget is spent over the run. */
export type CampaignBudgetKind = 'Total' | 'Daily' | (string & {});

/**
 * A creative.
 *
 * `mediaReference` is a Media reference and never a URL, matching how every
 * other Diaspora contract carries an image — the client resolves it through the
 * media service rather than being handed somewhere to fetch.
 */
export interface CampaignCreative {
  headline: string;
  body: string;
  /** What the tap does. A route this build can render, checked before it is stored. */
  callToActionLabel: string;
  callToActionRoute?: string | null;
  mediaReference?: string | null;
}

/**
 * Who should see it.
 *
 * Seven dimensions, of which the certified platform honours exactly one —
 * country — through `PurchaseProductRequest.countryCode`. See MON-GAP-007.
 * An empty array on any dimension means "no restriction", not "nobody".
 */
export interface CampaignAudience {
  countries: string[];
  /** Community identifiers from B12. */
  communities: string[];
  /** Neighbourhood identifiers from the hyperlocal engine. */
  neighbourhoods: string[];
  /** `Newcomer`, `Established`, `Business`, `Student`. */
  audienceTypes: string[];
  interests: string[];
  /** Provider, job, housing, marketplace or event categories. */
  categories: string[];
  /** Inclusive lower bound on the member's time in country, in months. Null for no bound. */
  minMonthsInCountry?: number | null;
}

/** What a targeting selection is expected to reach. Estimated server-side. */
export interface AudienceEstimate {
  /** The number of members matching. Bucketed, never exact — an exact count is a privacy leak. */
  reachLower: number;
  reachUpper: number;
  /** Whether the selection is too narrow to deliver. */
  isDeliverable: boolean;
  /** Why not, when it is not. */
  refusalCode?: string | null;
  refusalMessage?: string | null;
}

/** The selectable values for one targeting dimension, owned by the backend. */
export interface TargetingOption {
  value: string;
  label: string;
  /** A grouping label — the country a neighbourhood is in, the vertical a category belongs to. */
  group?: string | null;
}

export interface TargetingOptions {
  countries: TargetingOption[];
  communities: TargetingOption[];
  neighbourhoods: TargetingOption[];
  audienceTypes: TargetingOption[];
  interests: TargetingOption[];
  categories: TargetingOption[];
}

/**
 * A campaign.
 *
 * `spend` and `budget` are both `Money` and both in the same currency; the
 * platform never converts, so a campaign is denominated once at creation.
 */
export interface Campaign {
  campaignId: string;
  name: string;
  status: CampaignStatus;
  objective: CampaignObjective;
  placements: CampaignPlacementSurface[];
  creative: CampaignCreative;
  audience: CampaignAudience;
  budgetKind: CampaignBudgetKind;
  budget: Money;
  /** What has actually been spent. Zero on anything that has not run. */
  spend: Money;
  /** What is left. `budget` less `spend`. */
  remaining: Money;
  startsAt: string;
  endsAt: string;
  /** The payment that funded it, when one has been made. */
  paymentIntentId?: string | null;
  /** Set while the campaign is under review, and after it. */
  reviewNote?: string | null;
  /** Why it was refused. Present only on `Rejected`. */
  rejectionCode?: string | null;
  rejectionReason?: string | null;
  /** Whether the member may still appeal, and until when. */
  appealableUntil?: string | null;
  createdAt: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
}

export interface CreateCampaignRequest {
  name: string;
  objective: CampaignObjective;
  placements: CampaignPlacementSurface[];
  creative: CampaignCreative;
  audience: CampaignAudience;
  budgetKind: CampaignBudgetKind;
  /** Major units, as every B15 request DTO takes. */
  budgetAmount: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  countryCode?: string;
  idempotencyKey?: string;
}

export type UpdateCampaignRequest = Partial<Omit<CreateCampaignRequest, 'idempotencyKey'>>;

/** What submitting answers: the campaign, and the payment that has to clear. */
export interface CampaignSubmission {
  campaign: Campaign;
  /** Null when the campaign is already funded. */
  payment?: PaymentIntent | null;
  methodKind?: PaymentMethodKind | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance — MON-GAP-002
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One reported metric.
 *
 * Carries its own definition. §20 forbids inventing metric semantics, and the
 * way to keep that promise once a real backend serves these is for the
 * definition to travel with the number rather than live in a client constant
 * that will drift from whatever the server actually counts.
 */
export interface PerformanceMetric {
  key: string;
  label: string;
  value: number;
  /** `count`, `currency`, `percentage`, `ratio`. Decides the formatter. */
  unit: 'count' | 'currency' | 'percentage' | 'ratio' | (string & {});
  /** Present when `unit` is `currency`. */
  money?: Money | null;
  /** Change against the preceding period of equal length, as a ratio. Null when there is no prior period. */
  changeRatio?: number | null;
  /** What the platform counts. Shown on a long press, and in the accessibility label. */
  definition: string;
}

/** Performance for one placement or campaign over one period. */
export interface PerformanceReport {
  subjectKind: 'placement' | 'campaign';
  subjectId: string;
  periodStart: string;
  periodEnd: string;
  metrics: PerformanceMetric[];
  /** Points for the trend chart, oldest first. Empty when the run is too short. */
  series: { date: string; impressions: number; clicks: number }[];
  /** How far behind live the figures are, in hours. Reporting is never instant. */
  reportingLagHours: number;
}

/** The rollup the monetization dashboard leads with. */
export interface PerformanceSummary {
  periodStart: string;
  periodEnd: string;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalSpend: Money;
  /** Spend ÷ conversions. Null when nothing converted — not zero, which would read as free. */
  costPerResult?: Money | null;
  /** The best-performing promotion in the period, when there is one. */
  topPlacementId?: string | null;
  reportingLagHours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan changes — MON-GAP-003
// ─────────────────────────────────────────────────────────────────────────────

export type PlanChangeKind = 'Upgrade' | 'Downgrade' | 'IntervalChange' | (string & {});

/**
 * What moving to another plan would cost and when it would take effect.
 *
 * Asked for rather than computed, for the same reason
 * `previewConversion` is: the client multiplying a plan price by a remaining
 * fraction of a period is the client pricing money, and it will disagree with
 * the server at a rounding boundary.
 */
export interface PlanChangePreview {
  fromPlanCode: string;
  toPlanCode: string;
  kind: PlanChangeKind;
  /** What is charged today. Zero on a deferred downgrade. */
  dueNow: Money;
  /** Unused time on the current plan, credited against `dueNow`. */
  proratedCredit: Money;
  /** The full price of the new plan at its next renewal. */
  nextChargeAmount: Money;
  nextChargeAt: string;
  /** When the new entitlements start. Immediately on an upgrade, at period end on a downgrade. */
  effectiveAt: string;
  /** Entitlement keys gained and lost, so the confirmation can be specific. */
  gainedEntitlementKeys: string[];
  lostEntitlementKeys: string[];
  isPermitted: boolean;
  refusalCode?: string | null;
  refusalMessage?: string | null;
}

export interface ChangePlanRequest {
  planCode: string;
  methodKind?: PaymentMethodKind;
  idempotencyKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage — MON-GAP-008
// ─────────────────────────────────────────────────────────────────────────────

/** A limit and what has been consumed against it, in the period it resets in. */
export interface UsageCounter {
  /** The entitlement key this counts against. */
  key: string;
  /** Null when the entitlement is unlimited. */
  limit: number | null;
  consumed: number;
  /** `limit - consumed`, floored at zero. Null when unlimited. */
  remaining: number | null;
  periodStart: string;
  /** Null when the counter does not reset. */
  periodEnd?: string | null;
  /** What happens at the ceiling: `Refuse`, `Queue`, `Overage`. */
  atLimitBehaviour: string;
}

export interface EntitlementSnapshot {
  /** Resolved entitlements, the same shape B15 already serves. */
  entitlements: { key: string; value?: string | null }[];
  counters: UsageCounter[];
  /** The plan these came from, for the "you have this because…" line. */
  sourcePlanCode?: string | null;
  resolvedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices — MON-GAP-009
// ─────────────────────────────────────────────────────────────────────────────

export const INVOICE_STATUSES = ['Draft', 'Issued', 'Paid', 'Void', 'Uncollectible'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number] | (string & {});

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: Money;
  total: Money;
  /** What the line is for, so it can link to the promotion or plan. */
  subjectType?: string | null;
  subjectId?: string | null;
}

export interface Invoice {
  invoiceId: string;
  /** The human-readable number. Sequential per deployment, never per member. */
  number: string;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  subtotal: Money;
  /** Zero where the deployment charges none. Never inferred from a percentage. */
  tax: Money;
  taxLabel?: string | null;
  total: Money;
  issuedAt: string;
  paidAt?: string | null;
  /** The payment that settled it. */
  paymentIntentId?: string | null;
}

/** The next charge on the account. */
export interface UpcomingCharge {
  description: string;
  amount: Money;
  dueAt: string;
  /** `subscription` or `placement-renewal`. */
  kind: string;
  /** Whether it will be attempted automatically. */
  isAutomatic: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Premium analytics — MON-GAP-010
// ─────────────────────────────────────────────────────────────────────────────

/** One breakdown of an audience, by a single dimension. */
export interface AnalyticsBreakdown {
  dimension: string;
  label: string;
  buckets: { label: string; value: number; ratio: number }[];
}

/**
 * The advanced dataset `analytics.advanced` unlocks.
 *
 * Everything here is behind the entitlement gate. §12: premium data the member
 * has not bought is never sent to the device to be blurred — the locked state
 * shows the *shape* and the labels, and this payload is fetched only once the
 * entitlement resolves true.
 */
export interface PremiumAnalytics {
  periodStart: string;
  periodEnd: string;
  headline: PerformanceMetric[];
  breakdowns: AnalyticsBreakdown[];
  series: { date: string; views: number; engagements: number }[];
  /** Best and worst performing of the member's own subjects. */
  topSubjects: {
    subjectType: string;
    subjectId: string;
    title: string;
    views: number;
    engagements: number;
  }[];
  reportingLagHours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations — MON-GAP-011
// ─────────────────────────────────────────────────────────────────────────────

export interface MonetizationRecommendation {
  recommendationId: string;
  /** `product`, `plan`, `campaign`. */
  kind: string;
  /** The product or plan code being recommended. */
  code: string;
  title: string;
  /** Why the platform is suggesting it, in a sentence a member can disagree with. */
  reason: string;
  /** A machine-readable reason, for analytics and for suppression. */
  reasonCode: string;
  /** 0–1. Rendered as a strength, never as a percentage promise. */
  confidence: number;
  /** Where tapping goes. */
  route: string;
  /** The subject it concerns, when it concerns one. */
  subjectType?: string | null;
  subjectId?: string | null;
}
