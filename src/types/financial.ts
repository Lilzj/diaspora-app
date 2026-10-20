// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial types (Backend Phase B15)
//
// A field-for-field mirror of `Diaspora.Modules.Financial.Contracts.V1`, in the
// camelCase the platform's JSON serializer emits. Nothing here is invented: if a
// property is absent from this file it is absent from the certified contract,
// and the gap is written down in `frontend-financial-gap-report.md` rather than
// filled in with a plausible-looking field.
//
// Two conventions carried from the backend and worth stating once:
//
//   * Every status is an open `string`, not a union of literals. The backend
//     serializes enums by name and its own contract documents say a client
//     "switches on" them — but a client that narrows to a closed union stops
//     compiling the day the platform adds a member, and stops *rendering* the
//     day a deployment is ahead of the app in the store. The known members are
//     declared as `const` arrays below so the mapping tables are exhaustive
//     where it matters and the type stays open where it must.
//
//   * Money is never a number. `Money` carries `minorUnits` — the exact stored
//     value — alongside the derived `amount`. Every arithmetic operation in
//     this client runs on `minorUnits`; `amount` is for display only. See
//     `src/lib/money.ts`.
// ─────────────────────────────────────────────────────────────────────────────

// ── Money ────────────────────────────────────────────────────────────────────

/** `MoneyResponse`. The exact value is `minorUnits`; `amount` is derived. */
export interface Money {
  /** The figure a card renders. Derived from `minorUnits` by the server. */
  amount: number;
  /** ISO 4217, upper case. Never converted by this platform. */
  currency: string;
  /** The exact stored value: a count of the currency's smallest unit. */
  minorUnits: number;
  /** Minor digits. 2 for GBP, 0 for JPY, 3 for KWD. */
  exponent: number;
  /** What to render in front of the amount. Null when the catalogue has none. */
  symbol?: string | null;
}

/** `CurrencyResponse` — `GET /financial/currencies`. */
export interface CurrencyFact {
  code: string;
  name: string;
  symbol: string;
  exponent: number;
  isActive: boolean;
}

// ── Wallet ───────────────────────────────────────────────────────────────────

/** `WalletStatus`. */
export const WALLET_STATUSES = ['Pending', 'Active', 'Frozen', 'Closed'] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number] | (string & {});

/** `WalletType`. `Clearing` is nominal and never served to a member. */
export const WALLET_TYPES = ['Primary', 'Escrow', 'Revenue', 'Promotional', 'Clearing'] as const;
export type WalletType = (typeof WALLET_TYPES)[number] | (string & {});

/** `FinancialAccountType`. */
export const OWNER_TYPES = ['Personal', 'Organization', 'Provider', 'Business', 'Platform'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number] | (string & {});

/** `WalletResponse`. Five balances, because "you have £40" and "£40 of which £15 is held" differ. */
export interface Wallet {
  walletId: string;
  accountId: string;
  walletType: WalletType;
  ownerType: OwnerType;
  status: WalletStatus;
  currency: string;
  available: Money;
  pending: Money;
  reserved: Money;
  lifetimeCredits: Money;
  lifetimeDebits: Money;
  /** How many ledger entries this wallet has. Also the newest sequence number. */
  entryCount: number;
  lastEntryAt?: string | null;
  /** Why the wallet is frozen, when it is. */
  statusReason?: string | null;
}

// ── Ledger ───────────────────────────────────────────────────────────────────

/** `LedgerEntryType`. */
export const LEDGER_ENTRY_TYPES = [
  'Debit', 'Credit', 'Hold', 'Release', 'Refund', 'Adjustment', 'Commission', 'Bonus',
  'Promotion', 'Subscription', 'Donation', 'CommunityContribution', 'Fee', 'Reversal',
  'InternalTransfer', 'Purchase', 'Payout', 'Payment',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number] | (string & {});

export type LedgerDirection = 'Debit' | 'Credit' | (string & {});
export type LedgerBucket = 'Available' | 'Pending' | 'Reserved' | (string & {});
export type FinancialActorType = 'Member' | 'Staff' | 'System' | 'Gateway' | (string & {});
export type FinancialSource = 'Api' | 'Webhook' | 'System' | 'Operator' | 'Migration' | (string & {});

/** `LedgerEntryResponse`. Append-only; `balanceAfter` is stored, never recomputed on read. */
export interface LedgerEntry {
  entryId: string;
  transactionId: string;
  /** Position in this wallet's statement. Gapless, and what paging uses. */
  sequence: number;
  entryType: LedgerEntryType;
  /** From the owner's point of view. */
  direction: LedgerDirection;
  bucket: LedgerBucket;
  amount: Money;
  balanceAfter: Money;
  /** Why, in words. Never empty. */
  reason: string;
  actorType: FinancialActorType;
  source: FinancialSource;
  /** The policy version that decided the amount, when a policy did. */
  policyVersion?: string | null;
  correlationId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  externalReference?: string | null;
  occurredAt: string;
}

/** `LedgerPageResponse`. The only cursor-paginated financial surface on the wire. */
export interface LedgerPage {
  walletId: string;
  entries: LedgerEntry[];
  /** Pass as `afterSequence` for the next page. Null when there are no more. */
  nextCursor?: number | null;
  hasMore: boolean;
}

// ── Transactions ─────────────────────────────────────────────────────────────

/** `TransactionType`. */
export const TRANSACTION_TYPES = [
  'Payment', 'Withdrawal', 'Refund', 'Credit', 'Bonus', 'Subscription', 'Promotion',
  'InternalTransfer', 'Donation', 'CommunityContribution', 'Fee', 'Commission', 'Reversal',
  'Adjustment', 'Purchase', 'Payout',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number] | (string & {});

/** `TransactionStatus`. Four members — the backend has no `Cancelled` transaction. */
export const TRANSACTION_STATUSES = ['Pending', 'Completed', 'Failed', 'Reversed'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number] | (string & {});

/** `TransactionResponse`. */
export interface Transaction {
  transactionId: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  amount: Money;
  description: string;
  reason: string;
  subjectType?: string | null;
  subjectId?: string | null;
  countryCode?: string | null;
  policyVersion?: string | null;
  entryCount: number;
  /** Set when a compensating transaction undid this one. */
  reversedByTransactionId?: string | null;
  occurredAt: string;
  completedAt?: string | null;
}

// ── Payments ─────────────────────────────────────────────────────────────────

/** `PaymentIntentStatus`. The full lifecycle. */
export const PAYMENT_STATUSES = [
  'Draft', 'Pending', 'Authorized', 'Captured', 'Settled', 'Failed', 'Cancelled', 'Refunded',
  'Expired',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number] | (string & {});

/** `PaymentMethodKind`. Which of these a deployment accepts comes from `/capabilities`. */
export const PAYMENT_METHOD_KINDS = [
  'Card', 'BankTransfer', 'MobileMoney', 'Wallet', 'ManualTransfer', 'Credit',
] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number] | (string & {});

/** `RefundReason`. */
export const REFUND_REASONS = [
  'RequestedByPayer', 'Duplicate', 'Fraudulent', 'NotDelivered', 'PolicyRule', 'Goodwill',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number] | (string & {});

/** `RefundStatus`. */
export const REFUND_STATUSES = ['Pending', 'Succeeded', 'Failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number] | (string & {});

/** `RefundResponse`. Always nested inside a payment — there is no refund endpoint of its own. */
export interface Refund {
  refundId: string;
  amount: Money;
  reason: RefundReason;
  status: RefundStatus;
  note?: string | null;
  issuedAt: string;
}

/** `PaymentIntentResponse`. The authoritative payment state; never inferred from an HTTP 200. */
export interface PaymentIntent {
  paymentIntentId: string;
  status: PaymentStatus;
  amount: Money;
  captured: Money;
  refunded: Money;
  /** What is still refundable. */
  refundableRemaining: Money;
  methodKind: PaymentMethodKind;
  description: string;
  subjectType?: string | null;
  subjectId?: string | null;
  /** The adapter that handled it. Never a client's business, but useful in support. */
  provider?: string | null;
  /** What the client must do next. Opaque; hand it to the adapter's SDK. */
  nextAction?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  attemptCount: number;
  refunds: Refund[];
  expiresAt: string;
  authorizedAt?: string | null;
  capturedAt?: string | null;
  createdAt: string;
}

/** `CreatePaymentIntentRequest`. No instrument travels through the platform, ever. */
export interface CreatePaymentIntentRequest {
  /** Major units, as every client card already renders a price. */
  amount: number;
  currency: string;
  methodKind: PaymentMethodKind;
  description: string;
  subjectType?: string;
  subjectId?: string;
  countryCode?: string;
  /** Uniquely indexed server-side, so a double-tapped pay button is refused by the database. */
  idempotencyKey?: string;
}

/** `CapturePaymentRequest`. Null amount captures everything authorised. */
export interface CapturePaymentRequest {
  amount?: number;
}

/** `IssueRefundRequest`. Staff-only on the wire — see the gap report. */
export interface IssueRefundRequest {
  amount?: number;
  reason: RefundReason;
  note?: string;
}

// ── Monetization catalogue ───────────────────────────────────────────────────

/** `MonetizationSubjectType`. The eight content types plus Member and Community. */
export const MONETIZATION_SUBJECT_TYPES = [
  'Member', 'MarketplaceListing', 'HousingListing', 'Job', 'Provider', 'Organization', 'Event',
  'Guide', 'Update', 'Community', 'Campaign',
] as const;
export type MonetizationSubjectType = (typeof MONETIZATION_SUBJECT_TYPES)[number] | (string & {});

/** `MonetizationProductCategory`. */
export const MONETIZATION_CATEGORIES = [
  'PremiumListing', 'FeaturedListing', 'BoostedListing', 'PremiumProvider', 'FeaturedProvider',
  'PremiumOrganization', 'FeaturedOrganization', 'FeaturedEvent', 'BoostedJob', 'HousingHighlight',
  'CreatorPromotion', 'DonationPackage', 'ContributionPackage', 'SubscriptionPlan', 'CreditBundle',
  'Campaign',
] as const;
export type MonetizationCategory = (typeof MONETIZATION_CATEGORIES)[number] | (string & {});

/** `PlacementKind`. The first four are Marketplace's own vocabulary, unchanged. */
export const PLACEMENT_KINDS = [
  'Featured', 'Bump', 'Spotlight', 'CategoryHighlight', 'Boost', 'Premium',
] as const;
export type PlacementKind = (typeof PLACEMENT_KINDS)[number] | (string & {});

/**
 * `PlacementStatus`.
 *
 * `Paused` was added by B15.1 alongside `POST /placements/{id}/pause`, and its
 * own backend documentation states the arithmetic the client must not reinvent:
 * a pause banks the remaining days and resuming extends `endsAt` by exactly the
 * paused duration, rather than restarting the clock. Cancelling and re-buying is
 * a different thing and loses the banked time.
 */
export const PLACEMENT_STATUSES = [
  'Scheduled', 'Active', 'Paused', 'Expired', 'Cancelled', 'Refunded',
] as const;
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number] | (string & {});

/** `PurchaseStatus`. */
export const PURCHASE_STATUSES = [
  'Pending', 'Completed', 'Failed', 'Refunded', 'Cancelled',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number] | (string & {});

/** `MonetizationProductResponse`. Prices come from here — never hard-coded in the client. */
export interface MonetizationProduct {
  productId: string;
  code: string;
  name: string;
  description: string;
  category: MonetizationCategory;
  subjectType: MonetizationSubjectType;
  status: string;
  /** Null when a pricing policy decides the price for this request. */
  price?: Money | null;
  durationDays?: number | null;
  placementKind?: PlacementKind | null;
  priorityWeight: number;
  isRenewable: boolean;
  /** Whether the caller may buy it right now. */
  isAvailable: boolean;
  /** A code the client can translate. Null when available. */
  unavailableReasonCode?: string | null;
  /** A sentence a member can act on. Null when available. */
  unavailableReason?: string | null;
  sortOrder: number;
}

/** `PlacementResponse`. Financial state — deliberately not the verticals' `isFeatured`. */
export interface Placement {
  placementId: string;
  subjectType: MonetizationSubjectType;
  subjectId: string;
  kind: PlacementKind;
  status: PlacementStatus;
  /** Whether it is in force right now. */
  isActive: boolean;
  /** What a ranking consumer should weight the subject by. 1.0 is no change. */
  priorityWeight: number;
  productCode: string;
  countryCode?: string | null;
  policyVersion?: string | null;
  /**
   * Whether the buyer has asked for it to renew itself.
   *
   * A stored preference rather than a subscription: renewal still buys the
   * product again at whatever it costs then. Required on the wire
   * (`PlacementResponse.AutoRenewEnabled`), so a placement read before B15.1
   * shipped is the only way this is absent.
   */
  autoRenewEnabled: boolean;
  /**
   * When the buyer paused it. Null unless paused; the clock is stopped while it
   * is set, which is why `endsAt` alone does not tell a screen when delivery
   * actually ends.
   */
  pausedAt?: string | null;
  startsAt: string;
  /** When it lapses. Null on an open-ended placement. */
  endsAt?: string | null;
}

/** `MonetizationPurchaseResponse`. */
export interface MonetizationPurchase {
  purchaseId: string;
  productCode: string;
  category: MonetizationCategory;
  status: PurchaseStatus;
  subjectType: MonetizationSubjectType;
  subjectId: string;
  listPrice: Money;
  discount: Money;
  paid: Money;
  promotionCode?: string | null;
  policyVersion?: string | null;
  paymentIntentId?: string | null;
  placement?: Placement | null;
  payment?: PaymentIntent | null;
  createdAt: string;
  completedAt?: string | null;
}

/** `PurchaseProductRequest`. One request shape for every monetizable surface. */
export interface PurchaseProductRequest {
  productCode: string;
  subjectType?: MonetizationSubjectType;
  subjectId?: string;
  promotionCode?: string;
  methodKind?: PaymentMethodKind;
  countryCode?: string;
  idempotencyKey?: string;
  /** Null starts the placement as soon as the payment captures. */
  startsAt?: string;
}

// ── Promotions ───────────────────────────────────────────────────────────────

/** `PromotionQuoteResponse`. A coupon that silently does nothing is worse than one refused. */
export interface PromotionQuote {
  code: string;
  isApplicable: boolean;
  listPrice: Money;
  discount: Money;
  payable: Money;
  /** A code the client can translate. Null when applicable. */
  refusalCode?: string | null;
}

/** `PromotionRedemptionResponse`. */
export interface PromotionRedemption {
  redemptionId: string;
  code: string;
  discount: Money;
  productCode?: string | null;
  /** Uses this member has left. Null when unlimited. */
  remainingUses?: number | null;
  redeemedAt: string;
}

export interface RedeemPromotionRequest {
  code: string;
  productCode?: string;
  countryCode?: string;
}

// ── Subscriptions ────────────────────────────────────────────────────────────

/** `SubscriptionStatus`. */
export const SUBSCRIPTION_STATUSES = [
  'Trial', 'Active', 'GracePeriod', 'Suspended', 'Expired', 'Cancelled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number] | (string & {});

export type BillingInterval = 'Monthly' | 'Quarterly' | 'Yearly' | 'Lifetime' | (string & {});

/** `EntitlementResponse`. The client renders capabilities, never plan names. */
export interface Entitlement {
  /** Lower case, dotted. `listings.concurrent`, `analytics.advanced`. */
  key: string;
  /** A limit or a setting. Null means the capability is simply granted. */
  value?: string | null;
}

/** `SubscriptionPlanResponse`. */
export interface SubscriptionPlan {
  planId: string;
  code: string;
  name: string;
  description: string;
  tier: string;
  interval: BillingInterval;
  price: Money;
  isFree: boolean;
  trialDays: number;
  audienceType: string;
  countryCode?: string | null;
  entitlements: Entitlement[];
  sortOrder: number;
}

/** `SubscriptionResponse`. */
export interface Subscription {
  subscriptionId: string;
  planCode: string;
  tier: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  /** Whether the subscriber currently gets what they subscribed to. */
  grantsAccess: boolean;
  entitlements: Entitlement[];
  currentPeriodStart: string;
  /** Null on a lifetime plan. */
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  /** Set while a failed renewal is being retried and access continues. */
  graceEndsAt?: string | null;
  cancelAtPeriodEnd: boolean;
  renewalCount: number;
}

export interface ActivateSubscriptionRequest {
  planCode: string;
  /** Refused when this member has held this plan before. */
  withTrial?: boolean;
  methodKind?: PaymentMethodKind;
  promotionCode?: string;
  countryCode?: string;
  idempotencyKey?: string;
}

export interface CancelSubscriptionRequest {
  reason?: string;
  /** End access now rather than at the end of the paid period. Staff-driven. */
  immediately?: boolean;
}

// ── Plan change, upcoming charges, entitlement snapshot (B15.1) ──────────────
//
// The four contracts below are the certified shapes behind MON-GAP-003, -008 and
// -009. They are written from `Diaspora.Modules.Financial/Contracts/V1/Responses/
// SubscriptionChangeResponses.cs` and `EntitlementSnapshotResponse.cs` rather
// than from the register entries that asked for them, because two of the
// registers guessed and guessed differently from what shipped — see
// `UsageCounter` below, whose gap twin in `types/monetization-gaps.ts` declares
// `consumed` non-null and therefore cannot express the one distinction the real
// route exists to make.

/** `ChangeSubscriptionPlanRequest`. Body-only idempotency; no header is read. */
export interface ChangeSubscriptionPlanRequest {
  planCode: string;
  methodKind?: PaymentMethodKind;
  countryCode?: string;
  idempotencyKey?: string;
}

/**
 * `PlanChangePreviewResponse` — what changing plan would cost and change.
 *
 * Server-computed for an arithmetic reason rather than a policy one: a client
 * that multiplies a plan price by the remaining fraction of a period disagrees
 * with the server at the first rounding boundary, and the figure it gets wrong
 * is the one it charges somebody.
 *
 * `isPermitted` is the field a confirmation button must read. A preview can come
 * back describing a change the platform will refuse, and `refusalCode` /
 * `refusalMessage` are then populated.
 */
export interface PlanChangePreview {
  fromPlanCode: string;
  toPlanCode: string;
  /** `Upgrade`, `Downgrade` or `IntervalChange`. */
  kind: 'Upgrade' | 'Downgrade' | 'IntervalChange' | (string & {});
  /** Charged now. Zero for a downgrade, which waits for the period boundary. */
  dueNow: Money;
  /** What the unused remainder of the current period was worth. */
  proratedCredit: Money;
  /** What the next ordinary charge will be. */
  nextChargeAmount: Money;
  nextChargeAt?: string | null;
  /** Now for an upgrade, the period end for a downgrade. */
  effectiveAt: string;
  gainedEntitlementKeys: string[];
  lostEntitlementKeys: string[];
  isPermitted: boolean;
  refusalCode?: string | null;
  refusalMessage?: string | null;
  /** The proration policy version that decided the figures. */
  policyVersion?: string | null;
}

/**
 * `UpcomingChargeResponse` — the next charge on a subscription.
 *
 * `GET /financial/subscriptions/me/upcoming` answers a **list**, not one of
 * these. A member may hold more than one subscription and the route does not
 * choose between them.
 */
export interface UpcomingCharge {
  subscriptionId: string;
  planCode: string;
  /** Priced by the policy engine now, not forecast from the plan price. */
  amount: Money;
  chargeAt: string;
  /**
   * False when nothing will be charged — a cancellation is pending, or the plan
   * is free. `amount` is then zero and `chargeAt` is when access ends instead,
   * so a screen that renders this as a charge date is wrong in both halves.
   */
  willRenew: boolean;
  policyVersion?: string | null;
}

// ── Invoices — `InvoiceResponse` (MON-GAP-009, served since backend 9d0caaf) ──

/**
 * `Paid`, `PartiallyRefunded` or `Refunded`, read from the payment when the
 * invoice is read. The server calls it an open string, so a screen must render
 * one it does not know rather than mapping it to one it does.
 */
export type InvoiceStatus = 'Paid' | 'PartiallyRefunded' | 'Refunded' | (string & {});

/** `Purchase`, `Subscription` or `Payment` — the record the lines were drawn from. */
export type InvoiceKind = 'Purchase' | 'Subscription' | 'Payment' | (string & {});

/** `InvoiceLineResponse`. A discount is a line with a negative total. */
export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: Money;
  total: Money;
  subjectType?: string | null;
  subjectId?: string | null;
}

/** `InvoiceTaxLineResponse`. The server never produces one today. */
export interface InvoiceTaxLine {
  label: string;
  amount: Money;
}

/**
 * `InvoiceResponse` — one issued invoice, for money the platform kept.
 *
 * **Tax is zero with no label because nothing the invoice is drawn from records
 * tax.** Purchases, subscriptions and payments store a price, a discount and
 * what was paid, never a rate, so `tax` is zero, `taxLabel` null and `taxLines`
 * empty. A screen says no tax was recorded; it never names a "VAT" the server
 * did not.
 */
export interface Invoice {
  invoiceId: string;
  /** `DSP-2026-000123`. Sequential per platform per year, never per member. */
  number: string;
  status: InvoiceStatus;
  kind: InvoiceKind;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  subtotal: Money;
  tax: Money;
  taxLabel?: string | null;
  taxLines: InvoiceTaxLine[];
  total: Money;
  /** What has since been returned against the payment. Zero when nothing has. */
  refunded: Money;
  issuedAt: string;
  paidAt?: string | null;
  paymentIntentId?: string | null;
  /**
   * The printable HTML, as a path on the API origin **including** `/api/v1`.
   * Owner only, with the bearer token — not a link a browser can open.
   */
  documentUrl: string;
}

// ── Saved payment methods — `SavedPaymentMethodResponse` ─────────────────────

/**
 * A reusable instrument the platform holds for a member.
 *
 * **The platform holds none, so every list of these is empty.** Card details
 * are entered on the provider's checkout page for each payment and nothing
 * reusable is kept. The shape carries only what identifies an instrument to its
 * owner — never a card number or a provider token.
 */
export interface SavedPaymentMethod {
  id: string;
  /** A `PaymentMethodKind`: `Card`, `BankTransfer`, `MobileMoney`… */
  kind: string;
  brand?: string | null;
  last4?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  isDefault: boolean;
  addedAt: string;
}

/**
 * `UsageCounterResponse` — one limit and what is left of it.
 *
 * **`consumed` is nullable and that is the whole point of the contract.** Null
 * means nobody measured it; it does not mean zero. A meter that renders an empty
 * bar for an unmeasured counter is making a specific claim — "none used" — that
 * nobody on the server side made.
 *
 * `atLimitBehaviour` is likewise not optional decoration. Some limits refuse,
 * some queue, some charge for the overage, and a meter showing 15/15 without
 * saying which tells a member their next listing will fail when in fact it will
 * cost them money.
 */
export interface UsageCounter {
  key: string;
  /** The ceiling, from the plan. Null when the entitlement is a capability. */
  limit: number | null;
  /** How many are used. **Null means nobody measured it — not zero.** */
  consumed: number | null;
  /** Limit minus consumed, when both are known. */
  remaining: number | null;
  /** `Refuse`, `Queue` or `Overage`. Null when the server did not say. */
  atLimitBehaviour?: 'Refuse' | 'Queue' | 'Overage' | (string & {}) | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

/**
 * `EntitlementSnapshotResponse` — everything a member is entitled to, resolved
 * server-side.
 *
 * The ceiling is Financial's and the consumption is not, and the response says
 * which is which by leaving the second out where no vertical reported it.
 */
export interface EntitlementSnapshot {
  entitlements: Entitlement[];
  counters: UsageCounter[];
  /** Which plan granted them. Null when the member is on the free tier. */
  sourcePlanCode?: string | null;
  subscriptionId?: string | null;
  /** When the entitlements lapse if nothing renews. */
  validUntil?: string | null;
  resolvedAt: string;
}

/** `RenewPlacementRequest`. Body-only idempotency; no header is read. */
export interface RenewPlacementRequest {
  /** Omit to buy the same product again, which is what renewing usually means. */
  productCode?: string;
  methodKind?: PaymentMethodKind;
  countryCode?: string;
  idempotencyKey?: string;
}

// ── Giving ───────────────────────────────────────────────────────────────────

/** `ContributionKind`. Four of the five move no money at all. */
export const CONTRIBUTION_KINDS = [
  'Monetary', 'Goods', 'VolunteerService', 'ProfessionalSkills', 'Supplies',
] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number] | (string & {});

/** `ContributionUrgency`. */
export const CONTRIBUTION_URGENCIES = ['Urgent', 'High', 'Moderate', 'Ongoing'] as const;
export type ContributionUrgency = (typeof CONTRIBUTION_URGENCIES)[number] | (string & {});

/** `BeneficiaryType`. */
export const BENEFICIARY_TYPES = [
  'Member', 'Organization', 'Community', 'Fund', 'Platform',
] as const;
export type BeneficiaryType = (typeof BENEFICIARY_TYPES)[number] | (string & {});

/** `GivingStatus`. */
export const GIVING_STATUSES = [
  'Pending', 'Completed', 'Failed', 'Refunded', 'Cancelled',
] as const;
export type GivingStatus = (typeof GIVING_STATUSES)[number] | (string & {});

/** `DonationCauseResponse`. Replaces the client's `MOCK_CAUSES`. */
export interface DonationCause {
  causeId: string;
  code: string;
  title: string;
  description: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryId?: string | null;
  organizerName: string;
  urgency: ContributionUrgency;
  /** Most causes take more than one kind of support. */
  acceptedKinds: ContributionKind[];
  raised?: Money | null;
  target?: Money | null;
  /** Everybody who gave anything, monetary or not. */
  supporterCount: number;
  isVerified: boolean;
  isActive: boolean;
  countryCode?: string | null;
  locationLabel?: string | null;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  /** A Media reference, never a URL. */
  mediaReference?: string | null;
}

/** `DonationResponse`. */
export interface Donation {
  donationId: string;
  /** Absent on an anonymous donation. Never a placeholder. */
  donorUserId?: string | null;
  isAnonymous: boolean;
  beneficiaryType: BeneficiaryType;
  beneficiaryId?: string | null;
  causeCode?: string | null;
  amount: Money;
  status: GivingStatus;
  message?: string | null;
  /** The donor's own copy of the record, and an anonymous donor's only key to it. */
  receiptReference: string;
  countryCode?: string | null;
  payment?: PaymentIntent | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateDonationRequest {
  /** Major units. */
  amount: number;
  currency: string;
  causeCode?: string;
  /** Required when no cause is named. */
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  isAnonymous?: boolean;
  message?: string;
  methodKind?: PaymentMethodKind;
  countryCode?: string;
  idempotencyKey?: string;
  /** Declared and not scheduled by the backend in this phase. */
  recurringIntervalMonths?: number;
}

/** `ContributionFundResponse`. */
export interface ContributionFund {
  fundId: string;
  code: string;
  name: string;
  description: string;
  urgency: ContributionUrgency;
  acceptedKinds: ContributionKind[];
  raised: Money;
  target?: Money | null;
  /** Everybody who has given anything, monetary or not. */
  contributorCount: number;
  isActive: boolean;
  countryCode?: string | null;
  mediaReference?: string | null;
  sortOrder: number;
}

/** `ContributionResponse`. */
export interface Contribution {
  contributionId: string;
  fundCode: string;
  contributorUserId?: string | null;
  isAnonymous: boolean;
  kind: ContributionKind;
  status: GivingStatus;
  /** Null for every kind except `Monetary`. */
  amount?: Money | null;
  /** How much of what, for a non-monetary contribution. */
  pledgeQuantity?: number | null;
  pledgeUnit?: string | null;
  pledgeDescription?: string | null;
  message?: string | null;
  receiptReference: string;
  countryCode?: string | null;
  payment?: PaymentIntent | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateContributionRequest {
  fundCode: string;
  kind: ContributionKind;
  /** Required for `Monetary`, ignored otherwise. */
  amount?: number;
  currency?: string;
  /** Required for the four non-monetary kinds. */
  pledgeQuantity?: number;
  pledgeUnit?: string;
  pledgeDescription?: string;
  isAnonymous?: boolean;
  message?: string;
  methodKind?: PaymentMethodKind;
  countryCode?: string;
  idempotencyKey?: string;
}

/** `GivingHistoryResponse` — `GET /financial/giving/me`. */
export interface GivingHistory {
  donations: Donation[];
  contributions: Contribution[];
  /** Counted separately because they have no amount and totalling them would invent one. */
  nonMonetaryContributionCount: number;
}

// ── Deployment capabilities ──────────────────────────────────────────────────

/** `FinancialCapabilitiesResponse` — what *this deployment* can actually do. */
export interface FinancialCapabilities {
  /** The adapters registered in this deployment, by name. */
  gateways: string[];
  supportedMethods: PaymentMethodKind[];
  currencies: CurrencyFact[];
  /** False everywhere today. The platform never converts. */
  currencyConversionEnabled: boolean;
  /**
   * Whether this deployment can actually pay somebody — a settlement provider
   * registered **and** a capability matrix that can route. Registration alone is
   * not coverage, and reporting it as such would have this client offer a
   * withdrawal screen that refuses every amount.
   */
  payoutsEnabled: boolean;
  /**
   * The countries money can actually reach: supported, enabled, and with a
   * registered adapter behind them. Empty when `payoutsEnabled` is false.
   * ISO 3166-1 alpha-2, sorted.
   */
  payoutCountries: string[];
  fraudAssessmentEnabled: boolean;
  searchProjectionEnabled: boolean;
}

// ── The platform envelope ────────────────────────────────────────────────────

// ── Withdrawals and payout destinations ──────────────────────────────────────
//
// Real contracts, served by `WithdrawalEndpoints.cs`. These replace the
// simulated shapes that lived in `types/financial-gaps.ts` while no settlement
// provider existed; the differences are not cosmetic and are noted per field.

/**
 * `WithdrawalStatus`. Six states, and every one is a state the money is
 * genuinely in.
 *
 * **`Reversed` is new to this client and matters to a member**: a payout that
 * went out and came back — a bounced transfer, a recalled payment. The
 * simulated union could not express it, so a reversal would have rendered as
 * whatever the fallback branch did.
 *
 * **`Pending` and `Rejected` are gone.** Neither exists server-side. `Pending`
 * was a guess at the gap between `Requested` and `Processing`, and `Rejected`
 * duplicated `Failed` with a staff flavour the contract never carried.
 */
export const WITHDRAWAL_STATUSES = [
  'Requested', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Reversed',
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number] | (string & {});

/**
 * `PayoutDestinationResponse`. Somewhere money can be sent.
 *
 * **Note what is absent.** No account number, no sort code, no IBAN, no
 * mobile-money number. A destination is a server-issued id and a masked label
 * the server produced; the credential itself lives with the settlement
 * provider, and a platform that never holds one cannot leak one.
 */
export interface PayoutDestination {
  destinationId: string;
  /** `BankAccount`, `MobileMoney`, `Card` or `ProviderManaged`. */
  kind: string;
  /** What the member sees: "Barclays ••••4417". Server-produced. Was `maskedLabel`. */
  label: string;
  currency: string;
  /**
   * ISO 3166-1 alpha-2. **The router reads the payout country off this**, never
   * off the withdrawal request, so a destination without one cannot be paid to.
   */
  countryCode?: string | null;
  /** Whether a provider has confirmed it. */
  isVerified: boolean;
  /** Verified and not removed. What actually gates a withdrawal. */
  isUsable: boolean;
  createdAt: string;
  verifiedAt?: string | null;
}

/**
 * `WithdrawalResponse`. One request to take money off the platform.
 *
 * `gross`, `fee` and `net` are three stored figures rather than two and an
 * assumption — a member told they will receive ninety-eight pounds receives
 * ninety-eight pounds even if the platform reprices withdrawals tomorrow.
 */
export interface Withdrawal {
  withdrawalId: string;
  destinationId: string;
  /** Denormalised so a history row renders without a second request. */
  destinationLabel: string;
  status: WithdrawalStatus;
  /** What leaves the balance. Was `amount`. */
  gross: Money;
  fee: Money;
  /** What arrives. Was `netAmount`. */
  net: Money;
  /**
   * Whether the member may still call it off — server-decided, not inferred
   * from the status. Once a provider has taken the instruction the answer is
   * no, because releasing a hold on money that may be in flight is how a
   * platform pays somebody twice.
   */
  isCancellable: boolean;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Was `createdAt`. */
  requestedAt: string;
  processingStartedAt?: string | null;
  completedAt?: string | null;
}

/** `CreateWithdrawalRequest`. */
/**
 * `CreateDepositRequest`. Adding money to your own balance.
 *
 * **No wallet identifier and no user identifier**, deliberately: a deposit
 * credits the primary wallet on the account the intent is opened against,
 * resolved from the caller. There is no field that could point at somebody
 * else's balance.
 *
 * Not to be confused with the identically named type in `types/financial-gaps`,
 * which belongs to the simulated flow this replaced.
 */
export interface CreateDepositRequest {
  amount: number;
  currency: string;
  methodKind: PaymentMethodKind;
  /** The member's, and it changes the limits and the fee. */
  countryCode?: string | null;
  /**
   * Optional, and the thing that makes a double-tapped Add money button one
   * deposit. Scoped to the caller server-side.
   */
  idempotencyKey?: string;
}

export interface CreateWithdrawalRequest {
  amount: number;
  currency: string;
  destinationId: string;
  /**
   * Optional, and the thing that makes a double-tapped withdraw button one
   * withdrawal. Scoped to the caller server-side.
   */
  idempotencyKey?: string;
}

/** `RegisterPayoutDestinationRequest`. Carries no credential — see `PayoutDestination`. */
/**
 * `StartPayoutOnboardingRequest`. Beginning a provider — own setup.
 *
 * **No credential, by design.** The member types their bank details into the
 * provider — pages; this carries only where they are and what they will be paid
 * in, which is what the provider needs to open the right kind of account.
 */
export interface StartPayoutOnboardingRequest {
  currency: string;
  /** ISO 3166-1 alpha-2. The provider opens the account here and cannot move it. */
  countryCode: string;
  /** Where the provider returns the member. Absent uses the app — deep link. */
  returnUrl?: string | null;
}

/**
 * `PayoutOnboardingResponse`. Where to send a member to finish setting up.
 *
 * **A URL to open, not a page to render, and not one to keep.** The link is
 * single-use and short-lived: one kept and reopened later is spent. Ask again
 * rather than storing it.
 */
export interface PayoutOnboardingResponse {
  /** False when the provider refused. `reason` says why, in the member — words. */
  started: boolean;
  url?: string | null;
  /** The destination this opened, recorded before the member has finished. */
  destinationId?: string | null;
  provider?: string | null;
  reason?: string | null;
  /**
   * True when this country is served by a provider that wants an address, not
   * a setup page.
   *
   * **Two shapes of "add an account", and only the matrix knows which.** Stripe
   * Connect hands the member to its own hosted pages; PayPal pays to an email
   * or phone number they already have. When this is true `url` is absent and
   * nothing has been created — collect the address and post it.
   */
  requiresIdentity?: boolean;
  /** What to ask for, in the member — words. "your PayPal email address". */
  identityHint?: string | null;
}

/**
 * `RegisterPayoutIdentityRequest`. An address a provider knows the member by.
 *
 * **Not a credential, which is why it may be typed.** An email or phone number
 * names where money arrives, the way a postal address does; it cannot move
 * anything on its own. An account number can, and appears in no request this
 * platform accepts.
 *
 * The provider is deliberately absent: which one an address is registered
 * against is the payout matrix — answer for the member — country, not a claim
 * a client gets to make about where somebody — money goes.
 */
export interface RegisterPayoutIdentityRequest {
  identity: string;
  currency: string;
  countryCode: string;
}

export interface RegisterPayoutDestinationRequest {
  kind: string;
  label: string;
  currency: string;
  countryCode?: string | null;
  /** Which settlement provider issued `providerToken`. */
  provider?: string | null;
  /** The provider's own handle for the destination. Never an account number. */
  providerToken?: string | null;
}

/**
 * `MovementLimitsResponse`. What the member may take out, and what it costs.
 *
 * Every figure is nullable because a deployment need not set one — an absent
 * maximum is "no ceiling we know of", which is different from a ceiling of
 * zero, and the two must not render alike.
 */
export interface WithdrawalLimits {
  /** False when the deployment cannot pay out at all. `disabledReason` says why. */
  isEnabled: boolean;
  disabledReason?: string | null;
  currency: string;
  minimum?: Money | null;
  maximum?: Money | null;
  dailyMaximum?: Money | null;
  /** What is left of today's allowance. */
  dailyRemaining?: Money | null;
  /**
   * The fee's two components, published so a screen can show what will arrive
   * without a round trip per keystroke. **The server recomputes and stores its
   * own figure at request time** — these are for display, and
   * `estimateWithdrawalFee` mirrors the server's arithmetic exactly so the two
   * do not disagree in front of a member.
   */
  flatFee?: Money | null;
  /** A percentage, not a fraction: 2.5 means 2.5%. */
  feePercentage?: number | null;
  /** What the member could withdraw right now, after holds. */
  available?: Money | null;
}

/** Every endpoint answers `{ data, meta }`. */
export interface PlatformEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * RFC 9457 problem document, plus the platform's `errorCode` extension. Financial
 * codes are namespaced `financial.*` and declared in `FinancialErrorCodes`.
 */
export interface ProblemDocument {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /**
   * The platform's error code.
   *
   * **Named `code`, and only ever `code`.** `PlatformProblem.Enrich` writes
   * `problem.Extensions["code"]`, and nothing in the platform has ever written
   * `errorCode`. This type declared `errorCode`, so the lookup that reads it
   * found nothing on every error the app has ever shown.
   */
  code?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}
