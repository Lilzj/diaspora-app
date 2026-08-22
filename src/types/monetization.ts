// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization domain model (Frontend Phase 6)
//
// The **FrontendDomainModel** layer. Three layers exist and the import path is
// the boundary between them:
//
//   `types/financial.ts`        BackendContract        — a field-for-field
//                                                        mirror of B15. Nothing
//                                                        is invented there.
//   `types/monetization.ts`     FrontendDomainModel    — this file. Shapes the
//                                                        UI actually renders,
//                                                        every one of them
//                                                        *derived* from a
//                                                        certified DTO.
//   `types/monetization-gaps.ts` MockDevelopmentContract — shapes with no
//                                                        backend behind them at
//                                                        all.
//
// Nothing in this file adds a field the backend does not serve. What it adds is
// *arrangement*: B15 serves a flat list of `MonetizationProduct`, and a member
// choosing how to promote a listing is choosing a package and then a duration.
// That regrouping is a presentation decision and belongs on this side of the
// wire; it is done once, here, rather than in each of the eight screens that
// would otherwise each do it slightly differently.
//
// The rule that governs every type below: if a figure can be read from a
// certified response it is read, and if it cannot it is absent rather than
// approximated. `PromotionPackage` has no `impressions`, because no impression
// count exists — see MON-GAP-002.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BillingInterval,
  Entitlement,
  MonetizationCategory,
  MonetizationProduct,
  MonetizationPurchase,
  MonetizationSubjectType,
  Money,
  Placement,
  PlacementKind,
  PlacementStatus,
  Subscription,
  SubscriptionPlan,
  Transaction,
} from './financial';

// ─────────────────────────────────────────────────────────────────────────────
// Promotion targets — the eight things that can be promoted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The frontend's key for a promotable entity.
 *
 * Deliberately not the same string as `MonetizationSubjectType`: the backend
 * calls a marketplace item a `MarketplaceListing`, and a route parameter that
 * has to be spelled that way in eight `router.push` calls is a route parameter
 * that will eventually be spelled `MarketplaceListings`. The mapping is made
 * once, below.
 */
export type PromotionTargetKey =
  | 'provider'
  | 'job'
  | 'housing'
  | 'marketplace'
  | 'guide'
  | 'update'
  | 'event'
  | 'organization';

export interface PromotionTarget {
  key: PromotionTargetKey;
  /** What goes on the wire. The one place the two vocabularies meet. */
  subjectType: MonetizationSubjectType;
  /** "job", for "Promote this job". */
  noun: string;
  /** "jobs", for "Your promoted jobs". */
  plural: string;
  /** The verb this vertical's product line uses: Boost a job, Feature a provider. */
  verb: string;
  /** Sentence explaining what a promotion does for *this* entity specifically. */
  benefit: string;
  /** An Ionicons name, matching the icon the vertical already uses elsewhere. */
  icon: string;
  /** Where the entity itself lives, so a promotion row can link back to it. */
  entityRoute: (id: string) => string;
  /**
   * Whether this target's promotions are subject to review before they run.
   *
   * False everywhere today — B15 activates on capture. Kept as a field rather
   * than a constant because MON-GAP-006 is the contract that would set it, and
   * when it lands this table is the only thing that changes.
   */
  requiresApproval: boolean;
}

/**
 * The eight targets, in the order the monetization dashboard offers them.
 *
 * `requiresApproval` is false on all eight and is not a placeholder: it is the
 * honest reading of a backend that has no review state for a placement.
 */
export const PROMOTION_TARGETS: Record<PromotionTargetKey, PromotionTarget> = {
  provider: {
    key: 'provider',
    subjectType: 'Provider',
    noun: 'service',
    plural: 'services',
    verb: 'Feature',
    benefit: 'Appear at the top of your category directory and in more local searches.',
    icon: 'briefcase-outline',
    entityRoute: (id) => `/provider/${id}`,
    requiresApproval: false,
  },
  job: {
    key: 'job',
    subjectType: 'Job',
    noun: 'job',
    plural: 'jobs',
    verb: 'Boost',
    benefit: 'Reach more candidates near the workplace and stay higher in job results for longer.',
    icon: 'business-outline',
    entityRoute: (id) => `/job/${id}`,
    requiresApproval: false,
  },
  housing: {
    key: 'housing',
    subjectType: 'HousingListing',
    noun: 'property',
    plural: 'properties',
    verb: 'Feature',
    benefit: 'Show above standard listings for people searching in your area.',
    icon: 'home-outline',
    entityRoute: (id) => `/housing/${id}`,
    requiresApproval: false,
  },
  marketplace: {
    key: 'marketplace',
    subjectType: 'MarketplaceListing',
    noun: 'listing',
    plural: 'listings',
    verb: 'Boost',
    benefit: 'Higher search priority and more local reach while your item is still available.',
    icon: 'pricetag-outline',
    entityRoute: (id) => `/marketplace/${id}`,
    requiresApproval: false,
  },
  guide: {
    key: 'guide',
    subjectType: 'Guide',
    noun: 'guide',
    plural: 'guides',
    verb: 'Sponsor',
    benefit: 'Surface your guide to newcomers arriving in the country it covers.',
    icon: 'book-outline',
    entityRoute: (id) => `/guide/${id}`,
    requiresApproval: false,
  },
  update: {
    key: 'update',
    subjectType: 'Update',
    noun: 'update',
    plural: 'updates',
    verb: 'Sponsor',
    benefit: 'Reach more of your community with a time-sensitive announcement.',
    icon: 'megaphone-outline',
    entityRoute: (id) => `/update/${id}`,
    requiresApproval: false,
  },
  event: {
    key: 'event',
    subjectType: 'Event',
    noun: 'event',
    plural: 'events',
    verb: 'Sponsor',
    benefit: 'Show first in the community events rail in the run-up to the date.',
    icon: 'calendar-outline',
    entityRoute: (id) => `/community-life/event/${id}`,
    requiresApproval: false,
  },
  organization: {
    key: 'organization',
    subjectType: 'Organization',
    noun: 'organisation',
    plural: 'organisations',
    verb: 'Promote',
    benefit: 'Put your organisation in front of people looking for community support.',
    icon: 'people-outline',
    entityRoute: (id) => `/community-life/org/${id}`,
    requiresApproval: false,
  },
};

/** Ordered, for lists. Object key order is not a contract; this is. */
export const PROMOTION_TARGET_ORDER: PromotionTargetKey[] = [
  'marketplace',
  'job',
  'housing',
  'provider',
  'event',
  'guide',
  'update',
  'organization',
];

/** The target for a wire subject type, or null for one this build has no screen for. */
export function targetForSubjectType(
  subjectType: string | null | undefined
): PromotionTarget | null {
  if (!subjectType) return null;
  const found = Object.values(PROMOTION_TARGETS).find(
    (target) => target.subjectType === subjectType
  );
  return found ?? null;
}

/** The target for a route parameter, or null. */
export function targetForKey(key: string | null | undefined): PromotionTarget | null {
  if (!key) return null;
  return PROMOTION_TARGETS[key as PromotionTargetKey] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion packages — the catalogue, arranged
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One buyable option, one-to-one with a `MonetizationProduct`.
 *
 * Everything here is read from the product. `pricePerDay` is the single derived
 * value and it is derived by integer division on `minorUnits` — see
 * `derivePricePerDay` in `lib/monetization-catalog.ts` — because it is a
 * comparison aid the member reads, not a figure anybody is charged.
 */
export interface PromotionOption {
  /** The product code. What `POST /purchases` is given. */
  code: string;
  productId: string;
  name: string;
  description: string;
  category: MonetizationCategory;
  /** Null when a pricing policy decides the price at purchase time. */
  price: Money | null;
  /** Null on an open-ended product. */
  durationDays: number | null;
  placementKind: PlacementKind | null;
  /** 1.0 is no change. What a ranking consumer weights the subject by. */
  priorityWeight: number;
  isRenewable: boolean;
  isAvailable: boolean;
  unavailableReasonCode: string | null;
  /** A sentence a member can act on. Present whenever `isAvailable` is false. */
  unavailableReason: string | null;
  sortOrder: number;
  /**
   * Price ÷ duration, for comparing a 7-day option against a 30-day one.
   * Null when either operand is missing. Never sent anywhere.
   */
  pricePerDay: Money | null;
}

/**
 * A family of options that differ only in how long they run.
 *
 * B15 has no package concept — it serves products, and `mp-boost-7` and
 * `mp-feature-14` are two of them. Grouping by `placementKind` is the arrangement
 * that matches how somebody actually chooses: first *what kind of visibility*,
 * then *for how long*. A package with one option renders as a single card and
 * the duration step is skipped.
 */
export interface PromotionPackage {
  /** Derived: the placement kind, or the category when a product has no kind. */
  id: string;
  name: string;
  description: string;
  placementKind: PlacementKind | null;
  category: MonetizationCategory;
  /** Sorted by duration ascending, then price. Never empty. */
  options: PromotionOption[];
  /** The cheapest available option, for the "from £x" line. Null when none is available. */
  cheapest: PromotionOption | null;
  /** The highest priority weight in the package. What the package promises. */
  bestPriorityWeight: number;
  /** False when every option in the package is unavailable. */
  hasAvailableOption: boolean;
  /** Where a subject bought through this package is shown. Read from `placementKind`. */
  placementDescription: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotions — a placement, in the member's terms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the member calls "a promotion I'm running".
 *
 * A `Placement` plus the purchase that paid for it, when the purchase is known.
 * The backend keeps them apart — a placement is financial state and a purchase
 * is a payment record — and joins them only inside `MonetizationPurchase`. The
 * management screens need both, so the join is made here and made once.
 */
export interface Promotion {
  placementId: string;
  subjectType: MonetizationSubjectType;
  subjectId: string;
  /** Null when this build has no screen for the subject type. */
  target: PromotionTarget | null;
  kind: PlacementKind;
  status: PlacementStatus;
  isActive: boolean;
  priorityWeight: number;
  productCode: string;
  countryCode: string | null;
  /** Whether the buyer has asked it to renew itself when the window closes. */
  autoRenewEnabled: boolean;
  /**
   * When the buyer paused it, or null. While it is set the clock is stopped, so
   * `endsAt` is a date that will move — see `daysRemaining`, which is null for a
   * paused promotion rather than counting down to a deadline that will not come.
   */
  pausedAt: string | null;
  startsAt: string;
  /** Null on an open-ended placement. Stale while `pausedAt` is set. */
  endsAt: string | null;
  /** The purchase that paid for it, when it is in the caller's purchase list. */
  purchase: MonetizationPurchase | null;
  /** What was actually paid. Null when the purchase is not known. */
  paid: Money | null;
  /**
   * Whole days remaining, floor. Null when open-ended or already finished.
   * A display figure — the backend's `endsAt` is authoritative.
   */
  daysRemaining: number | null;
  /** Whether it lapses within the expiry window and a renewal is worth offering. */
  isExpiringSoon: boolean;
  /** Whether the product it came from may be bought again. Read from the catalogue. */
  isRenewable: boolean;
}

/** How the management screens bucket promotions. */
export type PromotionFilter = 'all' | 'active' | 'scheduled' | 'ended';

// ─────────────────────────────────────────────────────────────────────────────
// Subscription audiences — one plan surface for six products
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who a plan is sold to.
 *
 * `SubscriptionPlan.audienceType` is an open string the backend sets; the mock
 * catalogue uses `Member` and `Provider` today. The six audiences the phase
 * brief names are declared here with the wire value each maps to, so the plan
 * screens are one screen parameterised rather than six screens duplicated.
 *
 * A plan whose `audienceType` matches none of these still renders — under
 * `business`, the general commercial surface — rather than disappearing.
 */
export type SubscriptionAudienceKey =
  | 'member'
  | 'business'
  | 'organization'
  | 'creator'
  | 'recruiter'
  | 'landlord'
  | 'seller';

export interface SubscriptionAudience {
  key: SubscriptionAudienceKey;
  /** The `audienceType` values this surface claims. Matched case-insensitively. */
  wireValues: string[];
  title: string;
  /** One line on who this is for. */
  subtitle: string;
  icon: string;
  /** What somebody on this plan is trying to do. Drives the benefit copy. */
  outcome: string;
  /** Entitlement keys this audience's plans are expected to differ on. */
  headlineEntitlements: string[];
}

export const SUBSCRIPTION_AUDIENCES: Record<SubscriptionAudienceKey, SubscriptionAudience> = {
  member: {
    key: 'member',
    wireValues: ['Member', 'Personal'],
    title: 'Personal',
    subtitle: 'For everyday members getting settled.',
    icon: 'person-outline',
    outcome: 'Post more, reach further, and get help faster.',
    headlineEntitlements: ['listings.concurrent', 'support.priority', 'placements.discount'],
  },
  business: {
    key: 'business',
    wireValues: ['Business', 'Provider'],
    title: 'Business',
    subtitle: 'For providers and businesses serving the community.',
    icon: 'briefcase-outline',
    outcome: 'Be found first by people who need what you do.',
    headlineEntitlements: [
      'listings.concurrent',
      'analytics.advanced',
      'profile.verified_badge',
      'placements.discount',
    ],
  },
  organization: {
    key: 'organization',
    wireValues: ['Organization', 'Organisation', 'Nonprofit'],
    title: 'Organisation',
    subtitle: 'For community groups, charities and cultural hubs.',
    icon: 'people-outline',
    outcome: 'Reach your community and keep members coming back.',
    headlineEntitlements: ['events.concurrent', 'analytics.advanced', 'members.broadcast'],
  },
  creator: {
    key: 'creator',
    wireValues: ['Creator', 'Contributor'],
    title: 'Creator',
    subtitle: 'For people writing guides and community updates.',
    icon: 'create-outline',
    outcome: 'Grow your audience and understand what lands.',
    headlineEntitlements: ['analytics.advanced', 'guides.publish', 'placements.discount'],
  },
  recruiter: {
    key: 'recruiter',
    wireValues: ['Recruiter', 'Employer'],
    title: 'Recruiter',
    subtitle: 'For employers hiring from the community.',
    icon: 'people-circle-outline',
    outcome: 'Fill roles faster with candidates who are already here.',
    headlineEntitlements: ['jobs.concurrent', 'applications.export', 'analytics.advanced'],
  },
  landlord: {
    key: 'landlord',
    wireValues: ['Landlord', 'Host'],
    title: 'Landlord',
    subtitle: 'For hosts and landlords listing property.',
    icon: 'home-outline',
    outcome: 'Let rooms faster to people who will actually turn up.',
    headlineEntitlements: ['housing.concurrent', 'analytics.advanced', 'placements.discount'],
  },
  seller: {
    key: 'seller',
    wireValues: ['Seller', 'Merchant'],
    title: 'Seller',
    subtitle: 'For people selling regularly in the marketplace.',
    icon: 'pricetag-outline',
    outcome: 'Sell more, with less time spent relisting.',
    headlineEntitlements: ['listings.concurrent', 'placements.discount', 'analytics.advanced'],
  },
};

export const SUBSCRIPTION_AUDIENCE_ORDER: SubscriptionAudienceKey[] = [
  'member',
  'business',
  'creator',
  'organization',
  'recruiter',
  'landlord',
  'seller',
];

export function audienceForKey(key: string | null | undefined): SubscriptionAudience | null {
  if (!key) return null;
  return SUBSCRIPTION_AUDIENCES[key as SubscriptionAudienceKey] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans, arranged for comparison
// ─────────────────────────────────────────────────────────────────────────────

/** What a plan card and a comparison column both need. */
export interface PlanView {
  plan: SubscriptionPlan;
  audience: SubscriptionAudience;
  /** True when this is the caller's current plan. */
  isCurrent: boolean;
  /**
   * Whether the member may start this plan's trial.
   *
   * `trialDays > 0` is necessary and not sufficient: B15 refuses
   * `financial.subscription.trial_used` to somebody who has held the plan
   * before, and `renewalCount > 0` on a subscription of the same code is the
   * signal this client has. Offering a trial that is then taken away at the
   * last step is worse than not offering it.
   */
  canStartTrial: boolean;
  /** Higher tier than the current plan by price within the same interval. Null when not comparable. */
  relativeToCurrent: 'upgrade' | 'downgrade' | 'same' | null;
  /** Entitlements this plan has that the current one does not. Empty when there is no current plan. */
  gainedEntitlements: Entitlement[];
  /** Entitlements the current plan has that this one does not. The downgrade warning. */
  lostEntitlements: Entitlement[];
}

/** The rows of a plan comparison table. One row per distinct entitlement key. */
export interface PlanComparisonRow {
  key: string;
  /** "Concurrent listings", from `listings.concurrent`. */
  label: string;
  /**
   * Per plan code, for the plans that grant it: the entitlement's value, or null
   * when it is granted without one. A plan that does **not** grant the key is
   * absent from the record — `'plan-x' in values` is the inclusion test, because
   * null already means "included, no value" and one key cannot mean both.
   */
  values: Record<string, string | null>;
  /** Whether any plan includes it. A row no plan has is not rendered. */
  isDifferentiator: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The entitlement keys this client knows how to explain.
 *
 * The list is **not** exhaustive and is not treated as such: an unknown key is
 * rendered from its own dotted name rather than hidden, which is the property
 * B15 designed `entitlements[]` to have — an operator adds a plan and it appears
 * without a client release. This table only makes the known ones read better.
 */
export const ENTITLEMENT_LABELS: Record<string, { label: string; description: string }> = {
  'listings.concurrent': {
    label: 'Live listings',
    description: 'How many marketplace listings you can have running at once.',
  },
  'jobs.concurrent': {
    label: 'Live job posts',
    description: 'How many jobs you can advertise at the same time.',
  },
  'housing.concurrent': {
    label: 'Live property listings',
    description: 'How many properties you can list at the same time.',
  },
  'events.concurrent': {
    label: 'Live events',
    description: 'How many events you can have published at once.',
  },
  'guides.publish': {
    label: 'Publish guides',
    description: 'Write and publish guides for your community.',
  },
  'messaging.basic': {
    label: 'Messaging',
    description: 'Message other members about listings and posts.',
  },
  'analytics.advanced': {
    label: 'Advanced analytics',
    description: 'Audience breakdowns, trends over time and per-listing performance.',
  },
  'analytics.export': {
    label: 'Export analytics',
    description: 'Download your performance data.',
  },
  'applications.export': {
    label: 'Export applications',
    description: 'Download candidate applications for your own records.',
  },
  'members.broadcast': {
    label: 'Broadcast to members',
    description: 'Send an update to everyone following your organisation.',
  },
  'placements.discount': {
    label: 'Promotion discount',
    description: 'Money off every promotion and boost you buy.',
  },
  'profile.verified_badge': {
    label: 'Verified badge',
    description: 'A badge on your profile showing you are a verified business.',
  },
  'support.priority': {
    label: 'Priority support',
    description: 'Your questions go to the front of the queue.',
  },
};

/** A feature the app gates on an entitlement. */
export interface GatedFeature {
  /** The entitlement key the backend serves. */
  entitlementKey: string;
  title: string;
  /** Why somebody would want it. Shown on the locked state. */
  pitch: string;
  /** What is included, as bullets. */
  includes: string[];
  icon: string;
}

/**
 * The features Phase 6 gates.
 *
 * Every key here is a key that appears on a real plan in the certified
 * catalogue. A gate on a key no plan grants would be a gate nobody can ever
 * pass.
 */
export const GATED_FEATURES: Record<string, GatedFeature> = {
  'analytics.advanced': {
    entitlementKey: 'analytics.advanced',
    title: 'Advanced analytics',
    pitch: 'See who is finding you, where they come from, and what makes them get in touch.',
    includes: [
      'Views, saves and enquiries over time',
      'Where your audience is, by country and neighbourhood',
      'Which of your listings performs best',
      'How your promotions changed your reach',
    ],
    icon: 'stats-chart-outline',
  },
  'analytics.export': {
    entitlementKey: 'analytics.export',
    title: 'Export your data',
    pitch: 'Take your performance figures into your own spreadsheet or accounts.',
    includes: ['Download any report', 'Full history, not just the last month'],
    icon: 'download-outline',
  },
  'placements.discount': {
    entitlementKey: 'placements.discount',
    title: 'Promotion discount',
    pitch: 'Every boost and feature you buy costs less on a paid plan.',
    includes: ['Applied automatically at checkout', 'Stacks with seasonal offers'],
    icon: 'pricetag-outline',
  },
  'profile.verified_badge': {
    entitlementKey: 'profile.verified_badge',
    title: 'Verified business badge',
    pitch: 'Show people you are a real, checked business before they message you.',
    includes: ['A badge on your profile and every listing', 'Higher placement in trust-sorted results'],
    icon: 'shield-checkmark-outline',
  },
  'members.broadcast': {
    entitlementKey: 'members.broadcast',
    title: 'Broadcast to your members',
    pitch: 'Reach everyone following your organisation in one post.',
    includes: ['One update, delivered to every follower', 'Read counts for each broadcast'],
    icon: 'megaphone-outline',
  },
  'applications.export': {
    entitlementKey: 'applications.export',
    title: 'Export applications',
    pitch: 'Move candidates into your own hiring process without retyping anything.',
    includes: ['Every application, with attachments', 'Keep your records after a job closes'],
    icon: 'document-text-outline',
  },
};

/**
 * The result of asking whether the member may use something.
 *
 * `isAvailable` is **advisory**. §25: the client never treats its own answer as
 * authoritative — it decides what to draw, and the server re-authorises every
 * action it permits on the request that follows.
 */
export interface EntitlementDecision {
  key: string;
  isAvailable: boolean;
  /** The raw entitlement value when granted with one — `"15"`, `"unlimited"`, `"10%"`. */
  value: string | null;
  /** Null when granted, or when nothing in the catalogue grants it. */
  requiredPlan: SubscriptionPlan | null;
  /** Why it is unavailable, in a sentence. Null when available. */
  reason: string | null;
  /**
   * Whether a subscription is what stands in the way.
   *
   * False when the member is unverified, offline or restricted — those need a
   * different action than "upgrade", and an upgrade button shown to somebody
   * whose real problem is verification is a button that takes their money and
   * still refuses them.
   */
  isUpgradePath: boolean;
}

/**
 * A limit and what has been used against it.
 *
 * `limit` is real — the entitlement value the backend serves. `consumed` is
 * **not**: no usage counter exists (MON-GAP-008), so it is null against the
 * real backend and populated only by the development adapter. A meter with a
 * null `consumed` renders the ceiling and says the usage figure is not available
 * rather than drawing an empty bar, which would read as "none used".
 */
export interface UsageLimit {
  key: string;
  label: string;
  /** Null when the entitlement grants the capability without a ceiling. */
  limit: number | null;
  /** True for `"unlimited"`. */
  isUnlimited: boolean;
  /**
   * How many are used, or null when nobody measured it.
   *
   * Null is **not** zero, and MON-GAP-008 exists because the two used to be
   * indistinguishable here. `GET /financial/entitlements/me` resolves the
   * ceiling from the plan and the consumption from whichever vertical owns the
   * thing being counted, so a metered key nobody reported against arrives with a
   * limit and a null.
   */
  consumed: number | null;
  /**
   * Whether a consumption figure was actually reported.
   *
   * The field a meter branches on. `consumed === null` says the same thing, but
   * a screen reading it as a falsy number draws an empty bar — which claims
   * "none used", a statement no part of the platform made.
   */
  isMeasured: boolean;
  /**
   * What happens at the ceiling: `Refuse`, `Queue` or `Overage`. Null when the
   * server did not say.
   *
   * A meter showing 15/15 without this tells a member their next listing will
   * fail when in fact it may simply cost them money.
   */
  atLimitBehaviour: string | null;
  /** `consumed / limit`, 0–1. Null whenever either operand is. */
  ratio: number | null;
  /** Whether the member is at or over the ceiling. Null when unknown. */
  isAtLimit: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing
// ─────────────────────────────────────────────────────────────────────────────

/** Which monetization product a charge paid for. Derived from the transaction. */
export type BillingChargeKind =
  | 'subscription'
  | 'promotion'
  | 'campaign'
  | 'other';

/**
 * One line in billing history.
 *
 * Assembled from `Transaction` — a real, certified record of money that actually
 * moved. It is deliberately not an invoice: invoices do not exist (MON-GAP-009)
 * and calling this one would imply a tax breakdown and a document that the
 * platform cannot produce.
 */
export interface BillingCharge {
  transactionId: string;
  kind: BillingChargeKind;
  description: string;
  amount: Money;
  status: string;
  occurredAt: string;
  /** For deep-linking to the thing that was bought, when the transaction names it. */
  subjectType: string | null;
  subjectId: string | null;
  /** The underlying record, for the detail screen. */
  transaction: Transaction;
}

/** A billing cycle, in the member's words. */
export interface BillingCycleView {
  interval: BillingInterval;
  /** "every month", "every year". Used mid-sentence. */
  phrase: string;
  /** "month", "year". Used after a slash in a price. */
  unit: string;
  /** How many of those make a year, for a per-month comparison. Null for Lifetime. */
  periodsPerYear: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

/** One thing the member should probably do next, on the monetization home. */
export interface MonetizationAction {
  id: string;
  label: string;
  hint: string;
  icon: string;
  route: string;
  /** Draws the action as the primary card rather than a row. */
  isPrimary?: boolean;
  /** Whether the destination is gap-backed, so the row can carry a marker. */
  gapKey?: string;
}

/**
 * Everything the monetization dashboard shows, assembled from real reads.
 *
 * Each field names where it came from, because the honest classification in the
 * readiness report depends on it being clear which of these survives a
 * production build.
 */
export interface MonetizationOverview {
  /** `GET /financial/subscriptions/me`. Null on the free plan, which is not an error. */
  subscription: Subscription | null;
  /** `GET /financial/subscriptions/plans`. */
  plans: SubscriptionPlan[];
  /** `GET /financial/placements/me`, joined to `GET /financial/purchases`. */
  promotions: Promotion[];
  /** Promotions lapsing inside the expiry window. */
  expiring: Promotion[];
  /** `GET /financial/purchases?status=Pending`. */
  pendingPurchases: MonetizationPurchase[];
  /** `GET /financial/wallets/me/transactions`, filtered to monetization types. */
  recentCharges: BillingCharge[];
  /** Resolved from the subscription's entitlements. */
  entitlements: Entitlement[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports, so a monetization screen has one import
// ─────────────────────────────────────────────────────────────────────────────

export type {
  BillingInterval,
  Entitlement,
  MonetizationCategory,
  MonetizationProduct,
  MonetizationPurchase,
  MonetizationSubjectType,
  Money,
  Placement,
  PlacementKind,
  PlacementStatus,
  Subscription,
  SubscriptionPlan,
};
