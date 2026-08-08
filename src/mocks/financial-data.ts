// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial seed data (Backend Phase B15)
//
// Shapes mirror `Diaspora.Modules.Financial.Contracts.V1.Responses` exactly.
// The handlers in `handlers/financial.ts` build responses from this; nothing
// here is a display string the server would not send.
//
// The seed is chosen to exercise the states a wallet screen has to survive
// rather than to look tidy in a screenshot: a pending balance that is not zero,
// a reserved balance held against something outstanding, a failed payment, a
// partially refunded payment, a placement that has already expired, a
// subscription in its grace period, and a non-monetary contribution with no
// amount at all. A seed where everything succeeded is a seed that never finds
// the bug in the failure path.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ContributionFund,
  CurrencyFact,
  DonationCause,
  FinancialCapabilities,
  LedgerEntry,
  MonetizationProduct,
  Money,
  PaymentIntent,
  Placement,
  Subscription,
  SubscriptionPlan,
  Transaction,
  Wallet,
} from '@/types/financial';

// ── Currency catalogue ───────────────────────────────────────────────────────

export const MOCK_CURRENCIES: CurrencyFact[] = [
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', exponent: 2, isActive: true },
  { code: 'EUR', name: 'Euro', symbol: '€', exponent: 2, isActive: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', exponent: 2, isActive: true },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', exponent: 2, isActive: true },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', exponent: 2, isActive: true },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', exponent: 2, isActive: true },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: 'Rs', exponent: 2, isActive: true },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', exponent: 2, isActive: true },
  // Non-two-exponent entries are in the seed on purpose. A formatter that only
  // ever sees exponent 2 is a formatter nobody has tested.
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0, isActive: true },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', exponent: 3, isActive: false },
];

const SYMBOLS: Record<string, string> = Object.fromEntries(
  MOCK_CURRENCIES.map((entry) => [entry.code, entry.symbol])
);

const EXPONENTS: Record<string, number> = Object.fromEntries(
  MOCK_CURRENCIES.map((entry) => [entry.code, entry.exponent])
);

/** Builds a `MoneyResponse` the way `FinancialMapper` does: from minor units out. */
export function money(minorUnits: number, currency = 'GBP'): Money {
  const exponent = EXPONENTS[currency] ?? 2;
  return {
    minorUnits,
    currency,
    exponent,
    amount: minorUnits / 10 ** exponent,
    symbol: SYMBOLS[currency] ?? null,
  };
}

// ── Deployment capabilities ──────────────────────────────────────────────────

/**
 * What the shipped deployment reports.
 *
 * `payoutsEnabled` and `currencyConversionEnabled` are false because B15 says
 * they are false everywhere today — a mock that reported true would be a mock
 * teaching the client a lie it cannot discover until production.
 *
 * The gateway is named `Simulator` because that is what B15 ships: "No type in
 * the assembly names a vendor; the shipped gateway is a simulator."
 */
export const MOCK_CAPABILITIES: FinancialCapabilities = {
  gateways: ['Simulator'],
  supportedMethods: ['Card', 'MobileMoney', 'Wallet', 'Credit', 'BankTransfer'],
  currencies: MOCK_CURRENCIES.filter((entry) => entry.isActive),
  currencyConversionEnabled: false,
  payoutsEnabled: false,
  fraudAssessmentEnabled: false,
  searchProjectionEnabled: false,
};

// ── Identifiers ──────────────────────────────────────────────────────────────

export const MOCK_ACCOUNT_ID = 'a1f3c8d2-4b6e-4c19-9f27-8d3e5a7b1c40';
export const MOCK_WALLET_ID = 'b2e4d9a1-7c58-4a3f-8e16-2d9f4c7a3b58';
export const MOCK_PROMO_WALLET_ID = 'c3f5ea b2-8d69-4b40-9f27-3ea05d8b4c69'.replace(' ', '');

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Wallets ──────────────────────────────────────────────────────────────────

/**
 * Two wallets: the member's primary and a promotional one holding granted
 * credit. B15 provisions the second when credit is granted, and a wallet screen
 * that assumed one wallet would show the wrong total the first time somebody is
 * compensated for anything.
 */
export const MOCK_WALLETS: Wallet[] = [
  {
    walletId: MOCK_WALLET_ID,
    accountId: MOCK_ACCOUNT_ID,
    walletType: 'Primary',
    ownerType: 'Personal',
    status: 'Active',
    currency: 'GBP',
    available: money(14750),
    // Non-zero on purpose: "£147.50, of which £22 is still clearing" is a
    // different sentence from "£169.50" and only one of them is honest.
    pending: money(2200),
    reserved: money(4500),
    lifetimeCredits: money(63400),
    lifetimeDebits: money(41950),
    entryCount: 27,
    lastEntryAt: hoursAgo(5),
    statusReason: null,
  },
  {
    walletId: MOCK_PROMO_WALLET_ID,
    accountId: MOCK_ACCOUNT_ID,
    walletType: 'Promotional',
    ownerType: 'Personal',
    status: 'Active',
    currency: 'GBP',
    available: money(1000),
    pending: money(0),
    reserved: money(0),
    lifetimeCredits: money(1000),
    lifetimeDebits: money(0),
    entryCount: 1,
    lastEntryAt: daysAgo(12),
    statusReason: null,
  },
];

// ── Ledger ───────────────────────────────────────────────────────────────────

/**
 * The statement, newest first, with a stored `balanceAfter` on every row.
 *
 * `balanceAfter` runs backwards consistently from the wallet's current
 * available balance, because B15 stores it rather than recomputing it: "a
 * statement whose running total is recalculated is a statement that changes
 * when the code does."
 */
export const MOCK_LEDGER: LedgerEntry[] = [
  {
    entryId: 'le-0027', transactionId: 'tx-0014', sequence: 27,
    entryType: 'Hold', direction: 'Debit', bucket: 'Reserved',
    amount: money(4500), balanceAfter: money(14750),
    reason: 'Held against a pending marketplace payment',
    actorType: 'System', source: 'System',
    policyVersion: null, correlationId: 'corr-9f21',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    externalReference: null, occurredAt: hoursAgo(5),
  },
  {
    entryId: 'le-0026', transactionId: 'tx-0013', sequence: 26,
    entryType: 'Refund', direction: 'Credit', bucket: 'Available',
    amount: money(1200), balanceAfter: money(19250),
    reason: 'Partial refund — event cancelled by the organiser',
    actorType: 'Staff', source: 'Operator',
    policyVersion: 'refund.window@3', correlationId: 'corr-7c83',
    subjectType: 'Event', subjectId: 'f7a2b591-3c4d-4e8f-a916-7b2d5c8e1f30',
    externalReference: 'RF-2K93M', occurredAt: daysAgo(2),
  },
  {
    entryId: 'le-0025', transactionId: 'tx-0012', sequence: 25,
    entryType: 'Purchase', direction: 'Debit', bucket: 'Available',
    amount: money(999), balanceAfter: money(18050),
    reason: 'Boosted listing — 7 days',
    actorType: 'Member', source: 'Api',
    policyVersion: 'boost.pricing@2', correlationId: 'corr-4d17',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    externalReference: null, occurredAt: daysAgo(4),
  },
  {
    entryId: 'le-0024', transactionId: 'tx-0011', sequence: 24,
    entryType: 'Donation', direction: 'Debit', bucket: 'Available',
    amount: money(2500), balanceAfter: money(19049),
    reason: 'Donation to University Student Bursary Fund',
    actorType: 'Member', source: 'Api',
    policyVersion: null, correlationId: 'corr-1a58',
    subjectType: null, subjectId: null,
    externalReference: 'DN-84K2P', occurredAt: daysAgo(6),
  },
  {
    entryId: 'le-0023', transactionId: 'tx-0010', sequence: 23,
    entryType: 'Commission', direction: 'Debit', bucket: 'Available',
    amount: money(340), balanceAfter: money(21549),
    reason: 'Platform commission on a marketplace sale',
    actorType: 'System', source: 'System',
    policyVersion: 'marketplace.commission@2', correlationId: 'corr-6b92',
    subjectType: 'MarketplaceListing', subjectId: 'e52d7a29-1b3c-4f86-9d47-6a2e8b5c3f71',
    externalReference: null, occurredAt: daysAgo(9),
  },
  {
    entryId: 'le-0022', transactionId: 'tx-0010', sequence: 22,
    entryType: 'Payment', direction: 'Credit', bucket: 'Available',
    amount: money(6800), balanceAfter: money(21889),
    reason: 'Marketplace sale — Dining table, 6 chairs',
    actorType: 'Gateway', source: 'Webhook',
    policyVersion: null, correlationId: 'corr-6b92',
    subjectType: 'MarketplaceListing', subjectId: 'e52d7a29-1b3c-4f86-9d47-6a2e8b5c3f71',
    externalReference: 'PI-3F81Q', occurredAt: daysAgo(9),
  },
  {
    entryId: 'le-0021', transactionId: 'tx-0009', sequence: 21,
    entryType: 'Subscription', direction: 'Debit', bucket: 'Available',
    amount: money(499), balanceAfter: money(15089),
    reason: 'Diaspora Plus — monthly',
    actorType: 'System', source: 'System',
    policyVersion: 'subscription.pricing@1', correlationId: 'corr-2e46',
    subjectType: 'Member', subjectId: MOCK_ACCOUNT_ID,
    externalReference: null, occurredAt: daysAgo(14),
  },
  {
    entryId: 'le-0020', transactionId: 'tx-0008', sequence: 20,
    entryType: 'Bonus', direction: 'Credit', bucket: 'Available',
    amount: money(1000), balanceAfter: money(15588),
    reason: 'Welcome credit — thank you for verifying',
    actorType: 'Staff', source: 'Operator',
    policyVersion: null, correlationId: 'corr-8f30',
    subjectType: null, subjectId: null,
    externalReference: null, occurredAt: daysAgo(21),
  },
  {
    entryId: 'le-0019', transactionId: 'tx-0007', sequence: 19,
    entryType: 'CommunityContribution', direction: 'Debit', bucket: 'Available',
    amount: money(1500), balanceAfter: money(14588),
    reason: 'Contribution to the Winter Support Fund',
    actorType: 'Member', source: 'Api',
    policyVersion: null, correlationId: 'corr-5c71',
    subjectType: null, subjectId: null,
    externalReference: 'CN-51T7X', occurredAt: daysAgo(28),
  },
  {
    entryId: 'le-0018', transactionId: 'tx-0006', sequence: 18,
    entryType: 'Release', direction: 'Credit', bucket: 'Available',
    amount: money(3200), balanceAfter: money(16088),
    reason: 'Hold released — housing reservation withdrawn',
    actorType: 'System', source: 'System',
    policyVersion: null, correlationId: 'corr-3a94',
    subjectType: 'HousingListing', subjectId: 'a83f2c76-5e91-4b28-8d64-3f7a1c9e5b02',
    externalReference: null, occurredAt: daysAgo(35),
  },
  {
    entryId: 'le-0017', transactionId: 'tx-0005', sequence: 17,
    entryType: 'Fee', direction: 'Debit', bucket: 'Available',
    amount: money(150), balanceAfter: money(12888),
    reason: 'Featured listing service fee',
    actorType: 'System', source: 'System',
    policyVersion: 'platform.fee@1', correlationId: 'corr-7d25',
    subjectType: 'MarketplaceListing', subjectId: 'b94e3d87-6f02-4c39-9e75-4a8b2d6f7c13',
    externalReference: null, occurredAt: daysAgo(41),
  },
  {
    entryId: 'le-0016', transactionId: 'tx-0004', sequence: 16,
    entryType: 'Credit', direction: 'Credit', bucket: 'Available',
    amount: money(5000), balanceAfter: money(13038),
    reason: 'Compensation — delayed verification review',
    actorType: 'Staff', source: 'Operator',
    policyVersion: null, correlationId: 'corr-9e18',
    subjectType: null, subjectId: null,
    externalReference: null, occurredAt: daysAgo(52),
  },
];

// ── Transactions ─────────────────────────────────────────────────────────────

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    transactionId: 'tx-0015', transactionType: 'Payment', status: 'Pending',
    amount: money(4500),
    description: 'Vintage armchair — deposit',
    reason: 'Marketplace purchase awaiting seller confirmation',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    countryCode: 'GB', policyVersion: null, entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: hoursAgo(5), completedAt: null,
  },
  {
    transactionId: 'tx-0014', transactionType: 'Payment', status: 'Failed',
    amount: money(1800),
    description: 'Community event ticket',
    reason: 'The payment provider declined the card',
    subjectType: 'Event', subjectId: 'c17e4b92-8d35-4a67-b019-5f2c8a4d7e61',
    countryCode: 'GB', policyVersion: null, entryCount: 0,
    reversedByTransactionId: null,
    occurredAt: daysAgo(1), completedAt: null,
  },
  {
    transactionId: 'tx-0013', transactionType: 'Refund', status: 'Completed',
    amount: money(1200),
    description: 'Refund — Lagos Business Mixer',
    reason: 'Event cancelled by the organiser',
    subjectType: 'Event', subjectId: 'f7a2b591-3c4d-4e8f-a916-7b2d5c8e1f30',
    countryCode: 'GB', policyVersion: 'refund.window@3', entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: daysAgo(2), completedAt: daysAgo(2),
  },
  {
    transactionId: 'tx-0012', transactionType: 'Purchase', status: 'Completed',
    amount: money(999),
    description: 'Boosted listing — 7 days',
    reason: 'Monetization product purchased',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    countryCode: 'GB', policyVersion: 'boost.pricing@2', entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: daysAgo(4), completedAt: daysAgo(4),
  },
  {
    transactionId: 'tx-0011', transactionType: 'Donation', status: 'Completed',
    amount: money(2500),
    description: 'University Student Bursary Fund',
    reason: 'Donation completed',
    subjectType: null, subjectId: null,
    countryCode: 'GB', policyVersion: null, entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: daysAgo(6), completedAt: daysAgo(6),
  },
  {
    transactionId: 'tx-0010', transactionType: 'Payment', status: 'Completed',
    amount: money(6800),
    description: 'Dining table, 6 chairs',
    reason: 'Marketplace sale settled',
    subjectType: 'MarketplaceListing', subjectId: 'e52d7a29-1b3c-4f86-9d47-6a2e8b5c3f71',
    countryCode: 'GB', policyVersion: 'marketplace.commission@2', entryCount: 4,
    reversedByTransactionId: null,
    occurredAt: daysAgo(9), completedAt: daysAgo(9),
  },
  {
    transactionId: 'tx-0009', transactionType: 'Subscription', status: 'Completed',
    amount: money(499),
    description: 'Diaspora Plus — monthly',
    reason: 'Subscription renewal',
    subjectType: 'Member', subjectId: MOCK_ACCOUNT_ID,
    countryCode: 'GB', policyVersion: 'subscription.pricing@1', entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: daysAgo(14), completedAt: daysAgo(14),
  },
  {
    transactionId: 'tx-0008', transactionType: 'Bonus', status: 'Completed',
    amount: money(1000),
    description: 'Welcome credit',
    reason: 'Thank you for verifying your account',
    subjectType: null, subjectId: null,
    countryCode: 'GB', policyVersion: null, entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: daysAgo(21), completedAt: daysAgo(21),
  },
  {
    transactionId: 'tx-0007', transactionType: 'CommunityContribution', status: 'Completed',
    amount: money(1500),
    description: 'Winter Support Fund',
    reason: 'Community contribution completed',
    subjectType: null, subjectId: null,
    countryCode: 'GB', policyVersion: null, entryCount: 2,
    reversedByTransactionId: null,
    occurredAt: daysAgo(28), completedAt: daysAgo(28),
  },
  {
    transactionId: 'tx-0006', transactionType: 'Adjustment', status: 'Reversed',
    amount: money(3200),
    description: 'Housing reservation hold',
    reason: 'Reversed after the reservation was withdrawn',
    subjectType: 'HousingListing', subjectId: 'a83f2c76-5e91-4b28-8d64-3f7a1c9e5b02',
    countryCode: 'GB', policyVersion: null, entryCount: 2,
    reversedByTransactionId: 'tx-0006-r',
    occurredAt: daysAgo(35), completedAt: daysAgo(35),
  },
];

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * The payments a member can open from their history.
 *
 * `pi-partial` is partially refunded — a case the UI must render as neither
 * "paid" nor "refunded" but as both, with a refundable remainder that is not
 * zero and not the full amount.
 */
export const MOCK_PAYMENTS: PaymentIntent[] = [
  {
    paymentIntentId: 'pi-pending-0001',
    status: 'Pending',
    amount: money(4500), captured: money(0), refunded: money(0),
    refundableRemaining: money(0),
    methodKind: 'Card',
    description: 'Vintage armchair — deposit',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    provider: 'Simulator', nextAction: null,
    failureCode: null, failureMessage: null,
    attemptCount: 1, refunds: [],
    expiresAt: daysAhead(1),
    authorizedAt: null, capturedAt: null, createdAt: hoursAgo(5),
  },
  {
    paymentIntentId: 'pi-failed-0002',
    status: 'Failed',
    amount: money(1800), captured: money(0), refunded: money(0),
    refundableRemaining: money(0),
    methodKind: 'Card',
    description: 'Community event ticket',
    subjectType: 'Event', subjectId: 'c17e4b92-8d35-4a67-b019-5f2c8a4d7e61',
    provider: 'Simulator', nextAction: null,
    failureCode: 'card_declined',
    failureMessage: 'The card issuer declined this payment.',
    attemptCount: 2, refunds: [],
    expiresAt: daysAgo(1),
    authorizedAt: null, capturedAt: null, createdAt: daysAgo(1),
  },
  {
    paymentIntentId: 'pi-partial-0003',
    status: 'Captured',
    amount: money(3000), captured: money(3000), refunded: money(1200),
    refundableRemaining: money(1800),
    methodKind: 'Card',
    description: 'Lagos Business Mixer — 2 tickets',
    subjectType: 'Event', subjectId: 'f7a2b591-3c4d-4e8f-a916-7b2d5c8e1f30',
    provider: 'Simulator', nextAction: null,
    failureCode: null, failureMessage: null,
    attemptCount: 1,
    refunds: [
      {
        refundId: 'rf-0001', amount: money(1200),
        reason: 'PolicyRule', status: 'Succeeded',
        note: 'One of two tickets refunded after the organiser reduced capacity.',
        issuedAt: daysAgo(2),
      },
    ],
    expiresAt: daysAgo(10),
    authorizedAt: daysAgo(12), capturedAt: daysAgo(12), createdAt: daysAgo(12),
  },
  {
    paymentIntentId: 'pi-settled-0004',
    status: 'Settled',
    amount: money(999), captured: money(999), refunded: money(0),
    refundableRemaining: money(999),
    methodKind: 'Wallet',
    description: 'Boosted listing — 7 days',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    provider: 'Simulator', nextAction: null,
    failureCode: null, failureMessage: null,
    attemptCount: 1, refunds: [],
    expiresAt: daysAgo(3),
    authorizedAt: daysAgo(4), capturedAt: daysAgo(4), createdAt: daysAgo(4),
  },
];

// ── Catalogue ────────────────────────────────────────────────────────────────

/**
 * Prices come from here, never from a screen.
 *
 * `mp-premium-30` is deliberately unavailable, with both a machine-readable
 * code and a sentence — the state `MonetizationProductResponse.unavailableReason`
 * exists for, and the reason a member sees a greyed-out product with an
 * explanation instead of a product that silently vanishes.
 */
export const MOCK_PRODUCTS: MonetizationProduct[] = [
  {
    productId: 'prod-0001', code: 'mp-boost-7',
    name: 'Boost for 7 days',
    description: 'Higher search priority and more local reach for a week.',
    category: 'BoostedListing', subjectType: 'MarketplaceListing', status: 'Active',
    price: money(999), durationDays: 7,
    placementKind: 'Boost', priorityWeight: 1.6,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0002', code: 'mp-feature-14',
    name: 'Feature for 14 days',
    description: 'Your listing appears in the featured rail for two weeks.',
    category: 'FeaturedListing', subjectType: 'MarketplaceListing', status: 'Active',
    price: money(2499), durationDays: 14,
    placementKind: 'Featured', priorityWeight: 2.0,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 20,
  },
  {
    productId: 'prod-0003', code: 'mp-premium-30',
    name: 'Premium listing — 30 days',
    description: 'Top placement, a premium badge and priority in every rail.',
    category: 'PremiumListing', subjectType: 'MarketplaceListing', status: 'Active',
    price: money(4999), durationDays: 30,
    placementKind: 'Premium', priorityWeight: 3.0,
    isRenewable: true,
    isAvailable: false,
    unavailableReasonCode: 'financial.product.not_eligible',
    unavailableReason: 'Premium placement is available to sellers with at least three completed sales.',
    sortOrder: 30,
  },
  {
    productId: 'prod-0004', code: 'housing-highlight-14',
    name: 'Highlight for 14 days',
    description: 'Your property appears above standard listings in the area.',
    category: 'HousingHighlight', subjectType: 'HousingListing', status: 'Active',
    price: money(1999), durationDays: 14,
    placementKind: 'Spotlight', priorityWeight: 1.8,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0005', code: 'event-feature-7',
    name: 'Feature this event',
    description: 'Your event is shown first in the community events rail for a week.',
    category: 'FeaturedEvent', subjectType: 'Event', status: 'Active',
    price: money(1499), durationDays: 7,
    placementKind: 'Featured', priorityWeight: 1.9,
    isRenewable: false, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0006', code: 'job-boost-14',
    name: 'Boost this job for 14 days',
    description: 'Reach more candidates near the workplace.',
    category: 'BoostedJob', subjectType: 'Job', status: 'Active',
    price: money(2999), durationDays: 14,
    placementKind: 'Boost', priorityWeight: 1.7,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0007', code: 'provider-feature-30',
    name: 'Featured provider — 30 days',
    description: 'Your profile appears at the top of your category directory.',
    category: 'FeaturedProvider', subjectType: 'Provider', status: 'Active',
    price: money(3999), durationDays: 30,
    placementKind: 'Featured', priorityWeight: 2.2,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0008', code: 'guide-promo-7',
    name: 'Promote this guide',
    description: 'Your guide is surfaced to newcomers in the country it covers.',
    category: 'CreatorPromotion', subjectType: 'Guide', status: 'Active',
    price: money(799), durationDays: 7,
    placementKind: 'Spotlight', priorityWeight: 1.5,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },

  // Phase 6 added five more so that all eight promotable subject types have a
  // catalogue behind them. Without them the marketplace and housing flows had
  // options and the update, organisation and provider flows opened onto an empty
  // list — which would have hidden the states those screens need to render.
  {
    productId: 'prod-0009', code: 'mp-boost-30',
    name: 'Boost for 30 days',
    description: 'A month of higher search priority and more local reach.',
    category: 'BoostedListing', subjectType: 'MarketplaceListing', status: 'Active',
    price: money(2999), durationDays: 30,
    placementKind: 'Boost', priorityWeight: 1.6,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 11,
  },
  {
    productId: 'prod-0010', code: 'update-promo-3',
    name: 'Sponsor this update',
    description: 'Your announcement reaches more of your community while it still matters.',
    category: 'CreatorPromotion', subjectType: 'Update', status: 'Active',
    price: money(599), durationDays: 3,
    placementKind: 'Spotlight', priorityWeight: 1.4,
    isRenewable: false, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0011', code: 'org-promo-30',
    name: 'Promote your organisation',
    description: 'Your organisation is shown to people looking for community support nearby.',
    category: 'FeaturedOrganization', subjectType: 'Organization', status: 'Active',
    price: money(2499), durationDays: 30,
    placementKind: 'Featured', priorityWeight: 1.8,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 10,
  },
  {
    productId: 'prod-0012', code: 'provider-premium-90',
    name: 'Premium provider — 90 days',
    description: 'Top placement in your directory, a premium badge and priority in every rail.',
    category: 'PremiumProvider', subjectType: 'Provider', status: 'Active',
    price: money(9999), durationDays: 90,
    placementKind: 'Premium', priorityWeight: 3.0,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 20,
  },
  {
    productId: 'prod-0013', code: 'housing-highlight-30',
    name: 'Highlight for 30 days',
    description: 'A month above standard listings for people searching your area.',
    category: 'HousingHighlight', subjectType: 'HousingListing', status: 'Active',
    price: money(3499), durationDays: 30,
    placementKind: 'Spotlight', priorityWeight: 1.8,
    isRenewable: true, isAvailable: true,
    unavailableReasonCode: null, unavailableReason: null, sortOrder: 11,
  },
];

// ── Placements ───────────────────────────────────────────────────────────────

export const MOCK_PLACEMENTS: Placement[] = [
  {
    placementId: 'pl-0001',
    subjectType: 'MarketplaceListing', subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
    kind: 'Boost', status: 'Active', isActive: true,
    priorityWeight: 1.6, productCode: 'mp-boost-7',
    countryCode: 'GB', policyVersion: 'boost.pricing@2',
    startsAt: daysAgo(4), endsAt: daysAhead(3),
  },
  {
    placementId: 'pl-0002',
    subjectType: 'MarketplaceListing', subjectId: 'b94e3d87-6f02-4c39-9e75-4a8b2d6f7c13',
    kind: 'Featured', status: 'Expired', isActive: false,
    priorityWeight: 2.0, productCode: 'mp-feature-14',
    countryCode: 'GB', policyVersion: 'boost.pricing@1',
    startsAt: daysAgo(45), endsAt: daysAgo(31),
  },
  {
    placementId: 'pl-0003',
    subjectType: 'Event', subjectId: 'c17e4b92-8d35-4a67-b019-5f2c8a4d7e61',
    kind: 'Featured', status: 'Scheduled', isActive: false,
    priorityWeight: 1.9, productCode: 'event-feature-7',
    countryCode: 'GB', policyVersion: null,
    startsAt: daysAhead(2), endsAt: daysAhead(9),
  },
];

// ── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Plans render their entitlements, never their names — "the client renders
 * capabilities, not plan names, so a new plan needs no client release".
 */
export const MOCK_PLANS: SubscriptionPlan[] = [
  {
    planId: 'plan-0001', code: 'free',
    name: 'Diaspora', description: 'Everything a member needs to get settled.',
    tier: 'Free', interval: 'Monthly', price: money(0), isFree: true,
    trialDays: 0, audienceType: 'Member', countryCode: null,
    entitlements: [
      { key: 'listings.concurrent', value: '3' },
      { key: 'guides.publish', value: null },
      { key: 'messaging.basic', value: null },
    ],
    sortOrder: 10,
  },
  {
    planId: 'plan-0002', code: 'plus-monthly',
    name: 'Diaspora Plus', description: 'More reach for people who post regularly.',
    tier: 'Premium', interval: 'Monthly', price: money(499), isFree: false,
    trialDays: 14, audienceType: 'Member', countryCode: null,
    entitlements: [
      { key: 'listings.concurrent', value: '15' },
      { key: 'analytics.advanced', value: null },
      { key: 'placements.discount', value: '10%' },
      { key: 'support.priority', value: null },
    ],
    sortOrder: 20,
  },
  {
    planId: 'plan-0003', code: 'pro-yearly',
    name: 'Diaspora Professional', description: 'For providers and businesses serving the community.',
    tier: 'Professional', interval: 'Yearly', price: money(9900), isFree: false,
    trialDays: 30, audienceType: 'Provider', countryCode: null,
    entitlements: [
      { key: 'listings.concurrent', value: 'unlimited' },
      { key: 'analytics.advanced', value: null },
      { key: 'analytics.export', value: null },
      { key: 'placements.discount', value: '25%' },
      { key: 'profile.verified_badge', value: null },
      { key: 'support.priority', value: null },
    ],
    sortOrder: 30,
  },
];

/**
 * A subscription in its grace period.
 *
 * The state B15 sets "while a failed renewal is being retried and access
 * continues" — and the one a subscription screen most easily gets wrong, since
 * `grantsAccess` is true while the status is anything but reassuring.
 */
export const MOCK_SUBSCRIPTION: Subscription = {
  subscriptionId: 'sub-0001',
  planCode: 'plus-monthly',
  tier: 'Premium',
  status: 'GracePeriod',
  interval: 'Monthly',
  grantsAccess: true,
  entitlements: [
    { key: 'listings.concurrent', value: '15' },
    { key: 'analytics.advanced', value: null },
    { key: 'placements.discount', value: '10%' },
    { key: 'support.priority', value: null },
  ],
  currentPeriodStart: daysAgo(14),
  currentPeriodEnd: daysAhead(16),
  trialEndsAt: null,
  graceEndsAt: daysAhead(3),
  cancelAtPeriodEnd: false,
  renewalCount: 3,
};

// ── Giving ───────────────────────────────────────────────────────────────────

/**
 * The causes that replace `MOCK_CAUSES` in `app/marketplace/donation-causes.tsx`.
 *
 * The shapes are B15's, and the content is the client's original mock, because
 * the backend's alignment report says so explicitly: "The mock's shape was the
 * specification, so the swap is a data-source change rather than a redesign."
 *
 * Three of the five support types are non-monetary, which is the point the
 * backend built `ContributionKind` around: a donation model that assumed a
 * payment would make most of this screen unrepresentable.
 */
export const MOCK_CAUSES: DonationCause[] = [
  {
    causeId: 'cause-0001', code: 'winter-clothing-drive',
    title: 'Refugee Winter Clothing Drive',
    description:
      'We are collecting warm clothes, blankets and shoes for newly arrived refugees in South London. All sizes welcome — especially children.',
    beneficiaryType: 'Organization', beneficiaryId: 'org-0001',
    organizerName: 'South London Diaspora Community Centre',
    urgency: 'Urgent',
    acceptedKinds: ['Goods', 'VolunteerService', 'Supplies'],
    raised: null, target: null,
    supporterCount: 23, isVerified: true, isActive: true,
    countryCode: 'GB', locationLabel: 'Brixton, London',
    contactPhone: '+447900000001', contactWhatsapp: '+447900000001',
    mediaReference: 'media/causes/winter-clothing',
  },
  {
    causeId: 'cause-0002', code: 'student-bursary-fund',
    title: 'University Student Bursary Fund',
    description:
      'Raising funds to help diaspora university students who cannot afford tuition or rent this semester. Any amount helps.',
    beneficiaryType: 'Organization', beneficiaryId: 'org-0002',
    organizerName: 'Nigerian Students Union UK',
    urgency: 'High',
    acceptedKinds: ['Monetary'],
    raised: money(486000), target: money(1000000),
    supporterCount: 45, isVerified: true, isActive: true,
    countryCode: 'GB', locationLabel: 'London, UK',
    contactPhone: '+447900000002', contactWhatsapp: '+447900000002',
    mediaReference: 'media/causes/bursary',
  },
  {
    causeId: 'cause-0003', code: 'food-bank-volunteers',
    title: 'Community Food Bank Volunteers',
    description:
      'We need volunteers every Saturday to help sort and distribute food parcels at our Peckham food bank. Training provided.',
    beneficiaryType: 'Organization', beneficiaryId: 'org-0003',
    organizerName: 'Mama Africa Community Trust',
    urgency: 'Ongoing',
    acceptedKinds: ['VolunteerService', 'Supplies', 'Goods'],
    raised: null, target: null,
    supporterCount: 18, isVerified: true, isActive: true,
    countryCode: 'GB', locationLabel: 'Peckham, London',
    contactPhone: '+447900000003', contactWhatsapp: '+447900000003',
    mediaReference: 'media/causes/food-bank',
  },
  {
    causeId: 'cause-0004', code: 'legal-clinic-support',
    title: 'Free Immigration Legal Clinic',
    description:
      'Our monthly clinic gives free immigration advice. We need qualified advisers, translators and funds for room hire.',
    beneficiaryType: 'Community', beneficiaryId: null,
    organizerName: 'Diaspora Legal Aid Network',
    urgency: 'Moderate',
    acceptedKinds: ['Monetary', 'ProfessionalSkills', 'VolunteerService'],
    raised: money(127500), target: money(300000),
    supporterCount: 31, isVerified: true, isActive: true,
    countryCode: 'GB', locationLabel: 'Manchester, UK',
    contactPhone: '+447900000004', contactWhatsapp: null,
    mediaReference: 'media/causes/legal-clinic',
  },
  {
    causeId: 'cause-0005', code: 'funeral-support-adeyemi',
    title: 'Repatriation Support for the Adeyemi Family',
    description:
      'Helping a family return their father home for burial. The community has already covered half the cost.',
    beneficiaryType: 'Member', beneficiaryId: 'user-0042',
    organizerName: 'Tunde Adeyemi',
    urgency: 'Urgent',
    acceptedKinds: ['Monetary'],
    raised: money(215000), target: money(400000),
    supporterCount: 67, isVerified: false, isActive: true,
    countryCode: 'GB', locationLabel: 'Birmingham, UK',
    contactPhone: null, contactWhatsapp: '+447900000005',
    mediaReference: null,
  },
];

export const MOCK_FUNDS: ContributionFund[] = [
  {
    fundId: 'fund-0001', code: 'winter-support',
    name: 'Winter Support Fund',
    description: 'Heating grants, warm clothing and hot meals for members through the coldest months.',
    urgency: 'High',
    acceptedKinds: ['Monetary', 'Goods', 'Supplies', 'VolunteerService'],
    raised: money(842000), target: money(1500000),
    contributorCount: 214, isActive: true,
    countryCode: 'GB', mediaReference: 'media/funds/winter', sortOrder: 10,
  },
  {
    fundId: 'fund-0002', code: 'newcomer-welcome',
    name: 'Newcomer Welcome Fund',
    description: 'Starter packs, travel cards and first-week essentials for people who have just arrived.',
    urgency: 'Ongoing',
    acceptedKinds: ['Monetary', 'Goods', 'Supplies'],
    raised: money(316500), target: money(500000),
    contributorCount: 98, isActive: true,
    countryCode: 'GB', mediaReference: 'media/funds/welcome', sortOrder: 20,
  },
  {
    fundId: 'fund-0003', code: 'skills-mentoring',
    name: 'Skills & Mentoring Programme',
    description: 'Professionals giving time to help members find work in their field.',
    urgency: 'Moderate',
    acceptedKinds: ['ProfessionalSkills', 'VolunteerService', 'Monetary'],
    raised: money(74000), target: null,
    contributorCount: 52, isActive: true,
    countryCode: null, mediaReference: null, sortOrder: 30,
  },
];
