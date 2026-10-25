// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — DTOs for UNSUPPORTED financial capabilities
//
// ⚠ NONE OF THESE TYPES CORRESPOND TO A CERTIFIED BACKEND CONTRACT. ⚠
//
// They are the shapes this client would need if B15 grew deposits, withdrawals
// and creator rewards. They are written the way B15 writes its own contracts —
// `Money` rather than a number, an open status string, an idempotency key on
// every mutation, a receipt reference on every completion — so that when a
// backend phase implements these, the argument about naming has already been
// had and the diff is a route change rather than a redesign.
//
// Kept in a separate file from `types/financial.ts` on purpose: the import path
// is the boundary. Anything importing from here is touching something the
// platform cannot actually do, and that is visible at the top of the file
// rather than buried in a comment three hundred lines down.
//
// See `src/config/financial-gaps.ts` for what is missing and why.
// ─────────────────────────────────────────────────────────────────────────────

import type { Money, PaymentMethodKind } from './financial';

// ── Deposits (GAP: deposit) ──────────────────────────────────────────────────

export const DEPOSIT_STATUSES = [
  'Pending', 'Processing', 'Completed', 'Failed', 'Cancelled',
] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number] | (string & {});

/** What `POST /wallets/me/deposits` would answer. */
export interface Deposit {
  depositId: string;
  walletId: string;
  status: DepositStatus;
  amount: Money;
  /** What the platform charged to process it. Zero on every simulated deposit. */
  fee: Money;
  /** What actually reaches the wallet: `amount` less `fee`. */
  credited: Money;
  methodKind: PaymentMethodKind;
  /** The payment intent this deposit rides on, when there is one. */
  paymentIntentId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  receiptReference: string;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateDepositRequest {
  /** Major units, as every B15 request DTO takes. */
  amount: number;
  currency: string;
  methodKind: PaymentMethodKind;
  countryCode?: string;
  idempotencyKey?: string;
}

/**
 * The bounds a deposit has to respect. A backend owns these — a client that
 * hard-coded a minimum would be a client that disagrees with the server the
 * first time somebody changes it.
 */
export interface DepositLimits {
  currency: string;
  minimum: Money;
  maximum: Money;
  /** What is left of today's allowance. Null when there is no daily cap. */
  remainingToday?: Money | null;
  supportedMethods: PaymentMethodKind[];
}

// ── Withdrawals (GAP: withdrawal) ────────────────────────────────────────────

export const WITHDRAWAL_STATUSES = [
  'Requested', 'Pending', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Rejected',
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number] | (string & {});

/**
 * A payout destination.
 *
 * **Note what is absent.** No account number, no sort code, no IBAN, no
 * mobile-money MSISDN in full. A destination is identified by a server-issued
 * id and described by a masked label the server produced. §10 of the phase
 * brief forbids storing payout credentials in client persistence, and the way
 * to guarantee that is for the client never to hold them in the first place —
 * so even this hypothetical contract does not return them.
 */
export interface PayoutDestination {
  destinationId: string;
  /** `BankAccount` or `MobileMoney`. */
  kind: string;
  /** What the member sees: "Barclays ••••4417". Produced by the server. */
  maskedLabel: string;
  currency: string;
  countryCode?: string | null;
  /** Whether the destination has been verified and may receive money. */
  isVerified: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface Withdrawal {
  withdrawalId: string;
  walletId: string;
  destinationId: string;
  /** Denormalised so a history row renders without a second request. */
  destinationLabel: string;
  status: WithdrawalStatus;
  amount: Money;
  fee: Money;
  /** What arrives at the destination: `amount` less `fee`. */
  netAmount: Money;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Why staff refused it, when they did. */
  rejectionReason?: string | null;
  receiptReference: string;
  /** When the money is expected to land. An estimate, and labelled as one. */
  expectedArrivalAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface CreateWithdrawalRequest {
  amount: number;
  currency: string;
  destinationId: string;
  idempotencyKey?: string;
}

export interface WithdrawalLimits {
  currency: string;
  minimum: Money;
  maximum: Money;
  /** What the platform would charge. Shown before confirmation, never after. */
  fee: Money;
  /** What is left of this period's allowance. */
  remainingThisPeriod?: Money | null;
  /** Verification the member still has to complete. Empty when they may withdraw. */
  outstandingRequirements: string[];
}

// ── Creator rewards (GAP: rewards) ───────────────────────────────────────────

/** How points were earned. Mirrors the vocabulary the reputation engine already uses. */
export const REWARD_SOURCES = [
  'GuidePublished', 'GuideHelpfulVote', 'UpdatePublished', 'ReviewWritten',
  'VerificationCompleted', 'ReferralJoined', 'CommunityContribution', 'ModeratorAction',
  'SeasonalBonus',
] as const;
export type RewardSource = (typeof REWARD_SOURCES)[number] | (string & {});

/** A points balance. Points are a count — never money, and never a `Money`. */
export interface RewardBalance {
  /** Points available to convert or spend. */
  available: number;
  /** Points earned but not yet released — a helpful vote inside its review window. */
  pending: number;
  lifetimeEarned: number;
  lifetimeConverted: number;
  /**
   * Points spent on rewards, net of refunds. With the two above it accounts for
   * the balance: earned − converted − spent. Optional for the simulated arm,
   * which predates it.
   */
  lifetimeSpent?: number;
  /** The next threshold that unlocks something, when there is one. */
  nextThreshold?: number | null;
  nextThresholdLabel?: string | null;
  updatedAt: string;
}

export interface RewardHistoryEntry {
  entryId: string;
  source: RewardSource;
  /** Negative when points were spent or converted. */
  points: number;
  reason: string;
  /** What earned it — a guide id, a review id. Never rendered raw. */
  subjectType?: string | null;
  subjectId?: string | null;
  occurredAt: string;
}

export interface RewardHistoryPage {
  entries: RewardHistoryEntry[];
  nextCursor?: string | null;

  /**
   * The entries already shown at `nextCursor`, which the next request must
   * exclude. The boundary instant is inclusive on this route, so without these
   * the next page starts with the entry this one ended on.
   */
  excludeIds?: string[];

  hasMore: boolean;
}

/**
 * The rules of conversion, owned entirely by the server.
 *
 * §12 of the brief: "Do not calculate conversion rates locally if the backend
 * owns the conversion rules." Everything needed to *render* a conversion is
 * here, and the preview below is still asked for rather than computed, because
 * a client that multiplies points by a rate it was told is a client that will
 * disagree with the server about a rounding boundary.
 */
export interface RewardConversionPolicy {
  /** Whether conversion is open to this member right now. */
  isEligible: boolean;
  /**
   * Why not, when they are not: the server's sentence where it sent one
   * (`terms.member.reasonMessage`), else its code.
   */
  ineligibleReason?: string | null;
  /** Why not, as the server's code. */
  ineligibleCode?: string | null;
  /** How many points make one minor unit of `currency`. Display only. */
  pointsPerMinorUnit: number;
  /**
   * How many points make one whole unit of `currency` — what the rate line
   * shows. From the currency's own exponent, not `pointsPerMinorUnit × 100`.
   */
  pointsPerMajorUnit: number;
  currency: string;
  /** Minor units in one unit of `currency`. */
  exponent: number;
  symbol: string | null;
  minimumPoints: number;
  /** The most this member may convert in one go right now. */
  maximumPoints: number;
  // No `feePercentage`. Conversion has no fee anywhere in the platform, and the
  // screen asserted " · no fee" from a field the hook set to zero.
  availablePoints: number;
}

/** What `POST /rewards/conversions/preview` would answer. Never computed on the device. */
export interface RewardConversionPreview {
  /** What was asked for. */
  points: number;
  /**
   * What would actually leave the balance: the fewest points that buy the
   * credit. Points worth less than one minor unit stay with the member, so this
   * can be less than `points`.
   */
  pointsUsed: number;
  /** What the points are worth before any fee. */
  grossValue: Money;
  fee: Money;
  /** What would land in the wallet. */
  netValue: Money;
  isValid: boolean;
  /** A code the client can translate. Null when valid. */
  refusalCode?: string | null;
  refusalMessage?: string | null;
}

/** `Holding`: converted, with the credit pending until its hold ends (D-7). */
export const CONVERSION_STATUSES = ['Pending', 'Completed', 'Holding', 'Failed'] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number] | (string & {});

export interface RewardConversion {
  conversionId: string;
  status: ConversionStatus;
  points: number;
  grossValue: Money;
  fee: Money;
  netValue: Money;
  /** The wallet credit this produced, when it produced one. */
  transactionId?: string | null;
  receiptReference: string;
  createdAt: string;
  completedAt?: string | null;
  /** When a `Holding` conversion's credit can be spent or withdrawn. */
  availableAt?: string | null;
}

export interface CreateConversionRequest {
  points: number;
  idempotencyKey?: string;
}
