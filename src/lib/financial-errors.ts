// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial error model (Backend Phase B15)
//
// One mapping from "something went wrong" to "here is what the member should
// read and what the app should do next". Financial refusals are not
// interchangeable: `financial.wallet.insufficient_funds` is the member's to fix,
// `financial.account.restricted` is a support ticket, `financial.ledger.
// unbalanced` is a bug, and `financial.fraud.review` is a hold. B15 declares
// seventy-odd codes precisely so a client can tell them apart, and a client that
// collapsed them into "Payment failed" would be throwing that away.
//
// The three questions every caller asks are answered as fields rather than by
// re-inspecting the error at each call site:
//
//   isRetryable   — may the same request be sent again as-is?
//   isTerminal    — is the operation definitively over?
//   isIndeterminate — did the money possibly move anyway?
//
// The last one is the important one. A timeout on `POST /payment-intents/{id}/
// capture` is *not* a failure; it is an unknown, and §22 of the brief forbids
// reporting either outcome until the backend has been asked again. Errors with
// `isIndeterminate` drive the reconciliation path, never a failure screen.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import type { ProblemDocument } from '@/types/financial';

// ── The error codes B15 declares, verbatim ───────────────────────────────────

export const FinancialErrorCodes = {
  // Authorisation
  NotAuthenticated: 'financial.not_authenticated',
  Forbidden: 'financial.forbidden',

  // Financial identity
  AccountNotFound: 'financial.account.not_found',
  AccountExists: 'financial.account.already_exists',
  AccountRestricted: 'financial.account.restricted',
  AccountClosed: 'financial.account.closed',
  AccountImmutable: 'financial.account.immutable',
  AccountNotEligible: 'financial.account.not_eligible',

  // Wallets
  WalletNotFound: 'financial.wallet.not_found',
  WalletExists: 'financial.wallet.already_exists',
  WalletFrozen: 'financial.wallet.frozen',
  WalletClosed: 'financial.wallet.closed',
  WalletHasHeldFunds: 'financial.wallet.has_held_funds',
  InsufficientFunds: 'financial.wallet.insufficient_funds',

  // Money
  AmountInvalid: 'financial.amount.invalid',
  CurrencyInvalid: 'financial.currency.invalid',
  CurrencyMismatch: 'financial.currency.mismatch',
  CurrencyNotSupported: 'financial.currency.not_supported',

  // Ledger and transactions
  LedgerUnbalanced: 'financial.ledger.unbalanced',
  LedgerEmptyPosting: 'financial.ledger.empty_posting',
  TransactionNotFound: 'financial.transaction.not_found',
  TransactionNotPending: 'financial.transaction.not_pending',
  TransactionNotReversible: 'financial.transaction.not_reversible',
  TransactionDuplicate: 'financial.transaction.duplicate',

  // Payments
  PaymentIntentNotFound: 'financial.payment.not_found',
  PaymentIntentExpired: 'financial.payment.expired',
  PaymentTransitionInvalid: 'financial.payment.transition_invalid',
  PaymentAuthorizationFailed: 'financial.payment.authorization_failed',
  PaymentCaptureFailed: 'financial.payment.capture_failed',
  PaymentGatewayUnavailable: 'financial.payment.gateway_unavailable',
  PaymentGatewayUnknown: 'financial.payment.gateway_unknown',
  PaymentMethodUnsupported: 'financial.payment.method_unsupported',
  WebhookSignatureInvalid: 'financial.webhook.signature_invalid',
  WebhookUnrecognized: 'financial.webhook.unrecognized',

  // Refunds
  RefundNotAllowed: 'financial.refund.not_allowed',
  RefundExceedsCaptured: 'financial.refund.exceeds_captured',

  // Policy
  PolicyNotFound: 'financial.policy.not_found',
  PolicyDuplicate: 'financial.policy.duplicate',
  PolicyImmutable: 'financial.policy.immutable',
  PolicyUnresolved: 'financial.policy.unresolved',
  PolicyParameterMissing: 'financial.policy.parameter_missing',

  // Monetization catalogue
  ProductNotFound: 'financial.product.not_found',
  ProductDuplicate: 'financial.product.duplicate',
  ProductRetired: 'financial.product.retired',
  ProductNotEligible: 'financial.product.not_eligible',
  ProductSubjectMismatch: 'financial.product.subject_mismatch',
  PurchaseNotFound: 'financial.purchase.not_found',
  PurchaseAlreadySettled: 'financial.purchase.already_settled',

  // Placements
  PlacementNotFound: 'financial.placement.not_found',
  PlacementOverlaps: 'financial.placement.overlaps',
  PlacementNotActive: 'financial.placement.not_active',
  PlacementDurationInvalid: 'financial.placement.duration_invalid',

  // Subscriptions
  PlanNotFound: 'financial.plan.not_found',
  PlanDuplicate: 'financial.plan.duplicate',
  SubscriptionNotFound: 'financial.subscription.not_found',
  SubscriptionAlreadyActive: 'financial.subscription.already_active',
  SubscriptionNotCancellable: 'financial.subscription.not_cancellable',
  SubscriptionTrialUsed: 'financial.subscription.trial_used',

  // Promotions
  PromotionNotFound: 'financial.promotion.not_found',
  PromotionDuplicate: 'financial.promotion.duplicate',
  PromotionExpired: 'financial.promotion.expired',
  PromotionExhausted: 'financial.promotion.exhausted',
  PromotionNotApplicable: 'financial.promotion.not_applicable',
  PromotionAlreadyRedeemed: 'financial.promotion.already_redeemed',
  PromotionCountryRestricted: 'financial.promotion.country_restricted',

  // Credit
  CreditGrantNotFound: 'financial.credit.not_found',
  CreditGrantRevoked: 'financial.credit.revoked',
  CreditGrantExpired: 'financial.credit.expired',

  // Giving
  CauseNotFound: 'financial.cause.not_found',
  CauseInactive: 'financial.cause.inactive',
  CauseDuplicate: 'financial.cause.duplicate',
  DonationNotFound: 'financial.donation.not_found',
  FundNotFound: 'financial.fund.not_found',
  FundInactive: 'financial.fund.inactive',
  FundDuplicate: 'financial.fund.duplicate',
  ContributionNotFound: 'financial.contribution.not_found',
  ContributionKindNotAccepted: 'financial.contribution.kind_not_accepted',
  ContributionAmountRequired: 'financial.contribution.amount_required',
  ContributionPledgeRequired: 'financial.contribution.pledge_required',

  // Fraud and rate limiting
  FraudRefused: 'financial.fraud.refused',
  FraudReview: 'financial.fraud.review',
  RateLimited: 'financial.rate_limited',

  // Declared unsupported, on purpose
  ConversionNotSupported: 'financial.conversion.not_supported',
  PayoutNotSupported: 'financial.payout.not_supported',
} as const;

export type FinancialErrorCode =
  (typeof FinancialErrorCodes)[keyof typeof FinancialErrorCodes];

/** Where a failure came from, when the server never answered. */
export type FinancialFailureKind =
  | 'refused'          // the server answered and said no
  | 'unauthenticated'  // 401 — the session is over
  | 'forbidden'        // 403 — tier or permission
  | 'notFound'         // 404
  | 'conflict'         // 409 — usually a duplicate or a state race
  | 'validation'       // 400/422
  | 'rateLimited'      // 429
  | 'server'           // 5xx other than 503
  | 'unavailable'      // 503 / maintenance / circuit open
  | 'network'          // the request never reached anybody
  | 'timeout'          // it may have reached somebody
  | 'offline'          // the device knows it has no connection
  | 'unknown';

export interface FinancialErrorShape {
  kind: FinancialFailureKind;
  /** `financial.*` when the server named one. */
  code?: string;
  httpStatus?: number;
  /** A sentence to put in front of the member. Never contains an identifier. */
  message: string;
  /** A second line offering the next step, when there is one. */
  hint?: string;
  /** Whether re-sending the identical request is sane. */
  isRetryable: boolean;
  /** Whether the operation is definitively over. */
  isTerminal: boolean;
  /**
   * Whether money may have moved despite the error. Drives reconciliation
   * instead of a failure screen — §22's "Payment status is being confirmed".
   */
  isIndeterminate: boolean;
  /** Field-level messages from a 422, when the server sent them. */
  fieldErrors?: Record<string, string[]>;
}

export class FinancialError extends Error implements FinancialErrorShape {
  readonly kind: FinancialFailureKind;
  readonly code?: string;
  readonly httpStatus?: number;
  readonly hint?: string;
  readonly isRetryable: boolean;
  readonly isTerminal: boolean;
  readonly isIndeterminate: boolean;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(shape: FinancialErrorShape) {
    super(shape.message);
    this.name = 'FinancialError';
    this.kind = shape.kind;
    this.code = shape.code;
    this.httpStatus = shape.httpStatus;
    this.hint = shape.hint;
    this.isRetryable = shape.isRetryable;
    this.isTerminal = shape.isTerminal;
    this.isIndeterminate = shape.isIndeterminate;
    this.fieldErrors = shape.fieldErrors;
  }
}

// ── Per-code copy ────────────────────────────────────────────────────────────

interface CodeCopy {
  message: string;
  hint?: string;
  retryable?: boolean;
  terminal?: boolean;
}

/**
 * What each refusal says to the person holding the phone.
 *
 * Codes absent from this table fall through to a message derived from the HTTP
 * status. That is deliberate: a deployment ahead of the app in the store can
 * return a code this build has never seen, and the honest response is a generic
 * sentence rather than a blank screen.
 */
const CODE_COPY: Record<string, CodeCopy> = {
  [FinancialErrorCodes.NotAuthenticated]: {
    message: 'Your session has ended.',
    hint: 'Sign in again to see your wallet.',
    terminal: true,
  },
  [FinancialErrorCodes.Forbidden]: {
    message: 'This action is not available on your account.',
    hint: 'Completing Diaspora verification unlocks payments.',
    terminal: true,
  },
  [FinancialErrorCodes.AccountNotFound]: {
    message: 'You do not have a Diaspora wallet yet.',
    hint: 'A wallet opens automatically once your verification is approved.',
    terminal: true,
  },
  [FinancialErrorCodes.AccountRestricted]: {
    message: 'Your account is under review, so payments are paused.',
    hint: 'You can still see your balance and history. Support can tell you more.',
    terminal: true,
  },
  [FinancialErrorCodes.AccountClosed]: {
    message: 'This financial account is closed.',
    terminal: true,
  },
  [FinancialErrorCodes.AccountNotEligible]: {
    message: 'Your account cannot make this payment yet.',
    hint: 'Verification has to be approved before money can move.',
    terminal: true,
  },
  [FinancialErrorCodes.WalletNotFound]: {
    message: 'That wallet could not be found.',
    terminal: true,
  },
  [FinancialErrorCodes.WalletFrozen]: {
    message: 'Your wallet is frozen, so it cannot send money.',
    hint: 'Money can still arrive. Contact support to have the freeze reviewed.',
    terminal: true,
  },
  [FinancialErrorCodes.WalletClosed]: {
    message: 'This wallet is closed.',
    terminal: true,
  },
  [FinancialErrorCodes.InsufficientFunds]: {
    message: 'There is not enough in your wallet for this.',
    hint: 'Choose another payment method to continue.',
    terminal: true,
  },
  [FinancialErrorCodes.AmountInvalid]: {
    message: 'That amount cannot be used.',
    hint: 'Enter an amount greater than zero.',
  },
  [FinancialErrorCodes.CurrencyMismatch]: {
    message: 'The currencies do not match.',
    hint: 'Diaspora never converts between currencies.',
    terminal: true,
  },
  [FinancialErrorCodes.CurrencyNotSupported]: {
    message: 'That currency is not accepted here.',
    terminal: true,
  },
  [FinancialErrorCodes.ConversionNotSupported]: {
    message: 'Diaspora does not convert between currencies.',
    hint: 'Pay in the currency the price is listed in.',
    terminal: true,
  },
  [FinancialErrorCodes.PayoutNotSupported]: {
    message: 'Withdrawals are not available on Diaspora yet.',
    hint: 'Money in your wallet can be spent on the platform.',
    terminal: true,
  },
  [FinancialErrorCodes.TransactionDuplicate]: {
    message: 'This has already been submitted.',
    hint: 'We are showing you the original — you have not been charged twice.',
    terminal: true,
  },
  [FinancialErrorCodes.PaymentIntentNotFound]: {
    message: 'That payment could not be found.',
    terminal: true,
  },
  [FinancialErrorCodes.PaymentIntentExpired]: {
    message: 'This payment took too long and has expired.',
    hint: 'Start it again — nothing was charged.',
    terminal: true,
  },
  [FinancialErrorCodes.PaymentTransitionInvalid]: {
    message: 'This payment has already moved on.',
    hint: 'Refreshing will show you where it stands now.',
    terminal: true,
  },
  [FinancialErrorCodes.PaymentAuthorizationFailed]: {
    message: 'Your payment was not authorised.',
    hint: 'Try a different payment method.',
  },
  [FinancialErrorCodes.PaymentCaptureFailed]: {
    message: 'The payment could not be completed.',
    hint: 'We are checking with the payment provider.',
  },
  [FinancialErrorCodes.PaymentGatewayUnavailable]: {
    message: 'The payment provider is not responding.',
    hint: 'Nothing has been charged. Try again shortly.',
    retryable: true,
  },
  [FinancialErrorCodes.PaymentGatewayUnknown]: {
    message: 'No payment provider is configured for this deployment.',
    hint: 'This is a setup problem rather than something you can fix.',
    terminal: true,
  },
  [FinancialErrorCodes.PaymentMethodUnsupported]: {
    message: 'That payment method is not available here.',
    hint: 'Pick another method to continue.',
    terminal: true,
  },
  [FinancialErrorCodes.RefundNotAllowed]: {
    message: 'This payment cannot be refunded.',
    terminal: true,
  },
  [FinancialErrorCodes.RefundExceedsCaptured]: {
    message: 'That is more than was actually paid.',
    terminal: true,
  },
  [FinancialErrorCodes.PolicyUnresolved]: {
    message: 'We could not work out the price for this.',
    hint: 'Nothing has been charged. Please try again later.',
  },
  [FinancialErrorCodes.ProductNotFound]: {
    message: 'That option is no longer available.',
    terminal: true,
  },
  [FinancialErrorCodes.ProductRetired]: {
    message: 'That option has been withdrawn.',
    terminal: true,
  },
  [FinancialErrorCodes.ProductNotEligible]: {
    message: 'You cannot buy this yet.',
    hint: 'The listing explains what unlocks it.',
    terminal: true,
  },
  [FinancialErrorCodes.ProductSubjectMismatch]: {
    message: 'That option does not apply to this item.',
    terminal: true,
  },
  [FinancialErrorCodes.PurchaseAlreadySettled]: {
    message: 'This purchase is already complete.',
    terminal: true,
  },
  [FinancialErrorCodes.PlacementOverlaps]: {
    message: 'This item already has a promotion running.',
    hint: 'Wait for it to finish, or cancel it first.',
    terminal: true,
  },
  [FinancialErrorCodes.PlacementNotActive]: {
    message: 'That promotion is not running.',
    terminal: true,
  },
  [FinancialErrorCodes.SubscriptionAlreadyActive]: {
    message: 'You already have an active plan.',
    terminal: true,
  },
  [FinancialErrorCodes.SubscriptionTrialUsed]: {
    message: 'You have used the trial for this plan before.',
    hint: 'You can still subscribe without a trial.',
    terminal: true,
  },
  [FinancialErrorCodes.SubscriptionNotCancellable]: {
    message: 'This plan cannot be cancelled right now.',
    terminal: true,
  },
  [FinancialErrorCodes.PromotionNotFound]: {
    message: 'That code was not recognised.',
    terminal: true,
  },
  [FinancialErrorCodes.PromotionExpired]: {
    message: 'That code has expired.',
    terminal: true,
  },
  [FinancialErrorCodes.PromotionExhausted]: {
    message: 'That code has been fully used.',
    terminal: true,
  },
  [FinancialErrorCodes.PromotionNotApplicable]: {
    message: 'That code does not apply to this purchase.',
    terminal: true,
  },
  [FinancialErrorCodes.PromotionAlreadyRedeemed]: {
    message: 'You have already used that code.',
    terminal: true,
  },
  [FinancialErrorCodes.PromotionCountryRestricted]: {
    message: 'That code is not valid in your country.',
    terminal: true,
  },
  [FinancialErrorCodes.CauseNotFound]: {
    message: 'That cause could not be found.',
    terminal: true,
  },
  [FinancialErrorCodes.CauseInactive]: {
    message: 'That cause is no longer accepting support.',
    terminal: true,
  },
  [FinancialErrorCodes.FundInactive]: {
    message: 'That fund is closed.',
    terminal: true,
  },
  [FinancialErrorCodes.ContributionKindNotAccepted]: {
    message: 'This fund does not accept that kind of support.',
    hint: 'The fund lists what it needs.',
    terminal: true,
  },
  [FinancialErrorCodes.ContributionAmountRequired]: {
    message: 'Enter an amount to give.',
  },
  [FinancialErrorCodes.ContributionPledgeRequired]: {
    message: 'Say how much you are pledging.',
    hint: 'For example, 6 hours or 3 boxes.',
  },
  [FinancialErrorCodes.FraudRefused]: {
    message: 'This payment was stopped by our security checks.',
    hint: 'Nothing was charged. Contact support if you think this is wrong.',
    terminal: true,
  },
  [FinancialErrorCodes.FraudReview]: {
    message: 'This payment is being reviewed.',
    hint: 'We will let you know as soon as the review finishes.',
    terminal: true,
  },
  [FinancialErrorCodes.RateLimited]: {
    message: 'Too many attempts in a short time.',
    hint: 'Wait a moment and try again.',
    retryable: true,
  },
  [FinancialErrorCodes.LedgerUnbalanced]: {
    message: 'Something went wrong on our side and nothing was charged.',
    hint: 'Please try again. If it keeps happening, contact support.',
  },
};

// ── Classification ───────────────────────────────────────────────────────────

/** Whether a *method* is safe to have possibly executed twice. */
export type RequestSafety = 'read' | 'mutating';

/**
 * Turns anything thrown by the API layer into a `FinancialError`.
 *
 * `safety` decides how an unanswered request is classified. A read that times
 * out is a retry; a mutation that times out is an *unknown outcome*, and this
 * function is where that distinction is made rather than at forty call sites.
 */
export function toFinancialError(
  cause: unknown,
  safety: RequestSafety = 'read'
): FinancialError {
  if (cause instanceof FinancialError) return cause;

  const mutating = safety === 'mutating';

  if (axios.isAxiosError(cause)) {
    const status = cause.response?.status;
    const problem = extractProblem(cause.response?.data);

    // No response at all: the request may or may not have arrived.
    if (!cause.response) {
      const timedOut = cause.code === 'ECONNABORTED' || cause.code === 'ETIMEDOUT';
      return new FinancialError({
        kind: timedOut ? 'timeout' : 'network',
        message: timedOut
          ? mutating
            ? 'We did not hear back in time.'
            : 'That took too long.'
          : 'No connection.',
        hint: mutating
          ? 'We are checking whether it went through. Do not try again yet.'
          : 'Check your connection and pull down to refresh.',
        isRetryable: !mutating,
        isTerminal: false,
        // A mutation with no answer is the textbook indeterminate case.
        isIndeterminate: mutating,
      });
    }

    return fromStatusAndCode(status, problem, mutating);
  }

  if (cause instanceof Error) {
    return new FinancialError({
      kind: 'unknown',
      message: 'Something went wrong.',
      hint: 'Please try again.',
      isRetryable: !mutating,
      isTerminal: false,
      isIndeterminate: false,
    });
  }

  return new FinancialError({
    kind: 'unknown',
    message: 'Something went wrong.',
    isRetryable: false,
    isTerminal: false,
    isIndeterminate: false,
  });
}

function extractProblem(body: unknown): ProblemDocument | undefined {
  if (!body || typeof body !== 'object') return undefined;
  return body as ProblemDocument;
}

function fromStatusAndCode(
  status: number | undefined,
  problem: ProblemDocument | undefined,
  mutating: boolean
): FinancialError {
  const code = typeof problem?.errorCode === 'string' ? problem.errorCode : undefined;
  const copy = code ? CODE_COPY[code] : undefined;
  const fieldErrors = problem?.errors;

  const kind = kindForStatus(status);

  // A 5xx or 503 on a mutation is the second indeterminate case: the server may
  // have committed the transaction and failed on the way back out.
  const indeterminate = mutating && (kind === 'server' || kind === 'unavailable');

  if (copy) {
    return new FinancialError({
      kind,
      code,
      httpStatus: status,
      message: copy.message,
      hint: copy.hint,
      isRetryable: copy.retryable ?? (!mutating && retryableStatus(status)),
      isTerminal: copy.terminal ?? false,
      isIndeterminate: indeterminate,
      fieldErrors,
    });
  }

  const fallback = FALLBACK_COPY[kind];
  return new FinancialError({
    kind,
    code,
    httpStatus: status,
    // A validation problem's `detail` is written for a person; other statuses'
    // details are written for an operator and are not shown.
    message: kind === 'validation' && typeof problem?.detail === 'string'
      ? problem.detail
      : fallback.message,
    hint: fallback.hint,
    isRetryable: retryableStatus(status) && !mutating,
    isTerminal: fallback.terminal ?? false,
    isIndeterminate: indeterminate,
    fieldErrors,
  });
}

function kindForStatus(status: number | undefined): FinancialFailureKind {
  switch (status) {
    case 400:
    case 422:
      return 'validation';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 429:
      return 'rateLimited';
    case 503:
      return 'unavailable';
    default:
      if (status && status >= 500) return 'server';
      if (status && status >= 400) return 'refused';
      return 'unknown';
  }
}

function retryableStatus(status: number | undefined): boolean {
  if (!status) return true;
  return status === 429 || status === 503 || status >= 500;
}

const FALLBACK_COPY: Record<FinancialFailureKind, CodeCopy> = {
  refused: { message: 'That request was refused.' },
  unauthenticated: {
    message: 'Your session has ended.',
    hint: 'Sign in again to continue.',
    terminal: true,
  },
  forbidden: {
    message: 'This is not available on your account.',
    hint: 'Completing Diaspora verification unlocks payments.',
    terminal: true,
  },
  notFound: { message: 'We could not find that.', terminal: true },
  conflict: {
    message: 'This has already been handled.',
    hint: 'Refresh to see where it stands.',
    terminal: true,
  },
  validation: { message: 'Please check what you entered.' },
  rateLimited: {
    message: 'Too many attempts in a short time.',
    hint: 'Wait a moment and try again.',
    retryable: true,
  },
  server: {
    message: 'Something went wrong on our side.',
    hint: 'Please try again shortly.',
    retryable: true,
  },
  unavailable: {
    message: 'Payments are briefly unavailable.',
    hint: 'We are working on it. Try again in a few minutes.',
    retryable: true,
  },
  network: {
    message: 'No connection.',
    hint: 'Check your connection and try again.',
    retryable: true,
  },
  timeout: { message: 'That took too long.', retryable: true },
  offline: {
    message: 'You are offline.',
    hint: 'Payments need a connection. Your balance below may be out of date.',
  },
  unknown: { message: 'Something went wrong.', retryable: true },
};

/** The error a screen shows when a financial action is attempted with no connection. */
export function offlineError(action: string): FinancialError {
  return new FinancialError({
    kind: 'offline',
    message: 'You are offline.',
    hint: `${action} needs a connection. Nothing has been sent.`,
    isRetryable: false,
    isTerminal: false,
    isIndeterminate: false,
  });
}

/**
 * Whether TanStack Query should retry this failure automatically.
 *
 * Reads retry; mutations never do. A financial mutation that retried itself
 * would be the client deciding to send money twice, and the fact that B15
 * indexes idempotency keys uniquely is a safety net rather than a licence.
 */
export function shouldRetryQuery(failureCount: number, cause: unknown): boolean {
  if (failureCount >= 2) return false;
  const error = cause instanceof FinancialError ? cause : toFinancialError(cause, 'read');
  return error.isRetryable && !error.isTerminal;
}
