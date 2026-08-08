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
  'Guide', 'Update', 'Community',
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

/** `PlacementStatus`. */
export const PLACEMENT_STATUSES = [
  'Scheduled', 'Active', 'Expired', 'Cancelled', 'Refunded',
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
  /** False everywhere today. No settlement engine ships in B15. */
  payoutsEnabled: boolean;
  fraudAssessmentEnabled: boolean;
  searchProjectionEnabled: boolean;
}

// ── The platform envelope ────────────────────────────────────────────────────

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
  errorCode?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}
