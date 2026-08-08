// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial API client (Backend Phase B15)
//
// Thin wrappers over `/api/v1/financial`. Every route below exists in
// `Diaspora.Modules.Financial/Api/*.cs`; every parameter below is one the
// endpoint actually binds. Where a query object supports more than its endpoint
// exposes — `GetTransactionsQuery` accepts `Before`/`ExcludeIds` and
// `WalletEndpoints.cs:61` binds neither — the wrapper reflects the *endpoint*,
// and the difference is written up in the gap report rather than sent hopefully.
//
// Responses are unwrapped from the platform's `{ data, meta }` envelope here so
// callers see payloads. Failures are converted to `FinancialError` here so
// callers never inspect an `AxiosError`, and so the read/mutation distinction
// that drives reconciliation is made once per route rather than per call site.
//
// Staff-only routes (`POST /wallets`, `PUT /wallets/{id}/status`, `/operations/
// *`, and refunds) are deliberately absent: this is the member client, and a
// wrapper for an endpoint no screen may call is a wrapper somebody eventually
// calls. The one exception is `issueRefund`, included because the refund UI has
// to know it exists and be able to say who may use it — see the gap report.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toFinancialError } from './financial-errors';
import type {
  ActivateSubscriptionRequest,
  Contribution,
  ContributionFund,
  CreateContributionRequest,
  CreateDonationRequest,
  CreatePaymentIntentRequest,
  CurrencyFact,
  Donation,
  DonationCause,
  FinancialCapabilities,
  GivingHistory,
  LedgerPage,
  MonetizationProduct,
  MonetizationPurchase,
  PaymentIntent,
  Placement,
  PlatformEnvelope,
  PromotionQuote,
  PurchaseProductRequest,
  RedeemPromotionRequest,
  Subscription,
  SubscriptionPlan,
  Transaction,
  Wallet,
} from '@/types/financial';

const ROOT = '/financial';

// ── Query keys ───────────────────────────────────────────────────────────────

/**
 * Stable keys, so a mutation invalidates exactly what it changed.
 *
 * `wallets()` sits above everything a payment moves: any completed financial
 * operation changes a balance and a statement, and invalidating the root is
 * both correct and cheaper to reason about than enumerating children.
 */
export const financialKeys = {
  all: ['financial'] as const,

  capabilities: () => ['financial', 'capabilities'] as const,
  currencies: () => ['financial', 'currencies'] as const,

  wallets: () => ['financial', 'wallets'] as const,
  wallet: (currency?: string) => ['financial', 'wallets', currency ?? 'all'] as const,
  ledger: (walletId: string, entryType?: string) =>
    ['financial', 'wallets', walletId, 'ledger', entryType ?? 'all'] as const,
  transactions: (type?: string) => ['financial', 'transactions', type ?? 'all'] as const,

  payments: () => ['financial', 'payments'] as const,
  paymentHistory: (status?: string) => ['financial', 'payments', 'history', status ?? 'all'] as const,
  payment: (id: string) => ['financial', 'payments', id] as const,

  catalog: (params?: CatalogParams) => ['financial', 'catalog', params ?? {}] as const,
  purchases: (status?: string) => ['financial', 'purchases', status ?? 'all'] as const,
  placements: () => ['financial', 'placements'] as const,
  myPlacements: (status?: string) => ['financial', 'placements', 'me', status ?? 'all'] as const,
  subjectPlacements: (subjectType: string, subjectId: string) =>
    ['financial', 'placements', subjectType, subjectId] as const,

  subscription: () => ['financial', 'subscription'] as const,
  plans: (audience?: string, country?: string) =>
    ['financial', 'subscription', 'plans', audience ?? 'all', country ?? 'all'] as const,

  giving: () => ['financial', 'giving'] as const,
  causes: (country?: string, supportKind?: string) =>
    ['financial', 'giving', 'causes', country ?? 'all', supportKind ?? 'all'] as const,
  funds: (country?: string) => ['financial', 'giving', 'funds', country ?? 'all'] as const,
};

// ── Transport ────────────────────────────────────────────────────────────────

function unwrap<T>(payload: PlatformEnvelope<T>): T {
  return payload.data;
}

/** Anything acceptable as a query string. `object` rather than an index signature so a plain interface can be passed. */
type QueryParams = Record<string, unknown> | object;

async function read<T>(path: string, params?: QueryParams): Promise<T> {
  try {
    const response = await apiClient.get<PlatformEnvelope<T>>(`${ROOT}${path}`, { params });
    return unwrap(response.data);
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write goes through here, and every write is classified `mutating`, so a
 * transport failure becomes an *indeterminate* outcome rather than a failed
 * one. Nothing in this file decides that a payment failed; only a subsequent
 * read of the payment's authoritative status does.
 */
async function write<T>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: QueryParams
): Promise<T> {
  try {
    const url = `${ROOT}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<PlatformEnvelope<T>>(url, { params })
        : method === 'put'
          ? await apiClient.put<PlatformEnvelope<T>>(url, body, { params })
          : await apiClient.post<PlatformEnvelope<T>>(url, body, { params });
    return unwrap(response.data);
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ── Deployment capabilities ──────────────────────────────────────────────────

/**
 * What this deployment can actually do. Read before any payment sheet is drawn:
 * `supportedMethods` decides which methods are offered, and `gateways` being
 * empty means no payment can be started at all — a state the UI has to render
 * as "not configured" rather than as a failure the member caused.
 */
export function fetchCapabilities(): Promise<FinancialCapabilities> {
  return read<FinancialCapabilities>('/capabilities');
}

/** Symbol and exponent for every currency the platform formats. */
export function fetchCurrencies(): Promise<CurrencyFact[]> {
  return read<CurrencyFact[]>('/currencies');
}

// ── Wallet ───────────────────────────────────────────────────────────────────

/**
 * Every wallet the caller holds. An empty array is a legitimate answer — a
 * member whose verification has not been approved has no financial identity
 * yet — and is not an error.
 */
export function fetchWallets(currency?: string): Promise<Wallet[]> {
  return read<Wallet[]>('/wallets/me', currency ? { currency } : undefined);
}

export interface LedgerParams {
  /** The previous page's `nextCursor`. Omit for the first page. */
  afterSequence?: number;
  pageSize?: number;
  /** A `LedgerEntryType` name. */
  entryType?: string;
}

/** A page of a wallet's statement, newest first. The only cursor-paged financial route. */
export function fetchLedger(walletId: string, params: LedgerParams = {}): Promise<LedgerPage> {
  return read<LedgerPage>(`/wallets/${walletId}/ledger`, params);
}

/**
 * The caller's transaction history.
 *
 * The endpoint binds `type` and `pageSize` only. There is no cursor on the
 * wire, so this returns one page and the client cannot ask for a second — see
 * `frontend-financial-gap-report.md`, GAP-06. The statement (above) is the
 * paginated surface, and the transactions screen offers it as the way to go
 * further back.
 */
export function fetchTransactions(params: { type?: string; pageSize?: number } = {}): Promise<Transaction[]> {
  return read<Transaction[]>('/wallets/me/transactions', params);
}

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * Starts a payment. No instrument is sent: a card number, token or mandate is
 * collected by the gateway adapter's own SDK and never travels through the
 * platform, which is why the platform cannot store or log one.
 */
export function createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
  return write<PaymentIntent>('post', '/payment-intents', request);
}

/** Hands the payment to a gateway. May answer with a challenge in `nextAction`. */
export function authorizePayment(
  paymentIntentId: string,
  clientContext?: string
): Promise<PaymentIntent> {
  return write<PaymentIntent>(
    'post',
    `/payment-intents/${paymentIntentId}/authorize`,
    undefined,
    clientContext ? { clientContext } : undefined
  );
}

/** Takes the money and posts it to the ledger. Omitting the amount captures everything authorised. */
export function capturePayment(paymentIntentId: string, amount?: number): Promise<PaymentIntent> {
  return write<PaymentIntent>('post', `/payment-intents/${paymentIntentId}/capture`, { amount });
}

/** Stops a payment that has not been captured. */
export function cancelPayment(paymentIntentId: string): Promise<PaymentIntent> {
  return write<PaymentIntent>('post', `/payment-intents/${paymentIntentId}/cancel`);
}

/**
 * Gives money back. **Staff only** — the permission is
 * `financial:payments:manage:any`, Admin role. A member calling this gets a 403,
 * which is why the member-facing refund UI is read-only. GAP-05.
 */
export function issueRefund(
  paymentIntentId: string,
  request: { amount?: number; reason: string; note?: string }
): Promise<PaymentIntent> {
  return write<PaymentIntent>('post', `/payment-intents/${paymentIntentId}/refunds`, request);
}

/**
 * One payment with its attempts counted and its refunds listed. **This is the
 * authoritative payment state** and the only thing that may drive a success
 * screen — never the HTTP status of the call that started it.
 */
export function fetchPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
  return read<PaymentIntent>(`/payment-intents/${paymentIntentId}`);
}

/** The caller's payments. `status` narrows to one `PaymentIntentStatus`. */
export function fetchPaymentHistory(params: { status?: string; take?: number } = {}): Promise<PaymentIntent[]> {
  return read<PaymentIntent[]>('/payment-intents', params);
}

// ── Catalogue, purchases and placements ──────────────────────────────────────

export interface CatalogParams {
  subjectType?: string;
  subjectId?: string;
  category?: string;
  /** The endpoint's parameter is `country`, not `countryCode`. */
  country?: string;
}

/**
 * What the caller can buy, with a reason on anything they cannot.
 * Prices come from here. Nothing in this client hard-codes one.
 */
export function fetchCatalog(params: CatalogParams = {}): Promise<MonetizationProduct[]> {
  return read<MonetizationProduct[]>('/catalog', params);
}

/** Buys a premium feature, a placement or a credit bundle. One shape for every surface. */
export function purchaseProduct(request: PurchaseProductRequest): Promise<MonetizationPurchase> {
  return write<MonetizationPurchase>('post', '/purchases', request);
}

export function fetchPurchases(params: { status?: string; take?: number } = {}): Promise<MonetizationPurchase[]> {
  return read<MonetizationPurchase[]>('/purchases', params);
}

/** What a coupon would do, or why it would do nothing. */
export function redeemPromotion(request: RedeemPromotionRequest): Promise<PromotionQuote> {
  return write<PromotionQuote>('post', '/promotions/redeem', request);
}

/** Is this thing paid for, and until when. Answerable without knowing what a listing is. */
export function fetchSubjectPlacements(subjectType: string, subjectId: string): Promise<Placement[]> {
  return read<Placement[]>(`/placements/${subjectType}/${subjectId}`);
}

export function fetchMyPlacements(params: { status?: string; take?: number } = {}): Promise<Placement[]> {
  return read<Placement[]>('/placements/me', params);
}

/** Stops a placement. Whether money comes back is the refund-window policy's decision. */
export function cancelPlacement(placementId: string, reason?: string): Promise<Placement> {
  return write<Placement>('delete', `/placements/${placementId}`, undefined, reason ? { reason } : undefined);
}

// ── Subscriptions ────────────────────────────────────────────────────────────

/** The plan catalogue. Render the entitlements, never the plan name. */
export function fetchSubscriptionPlans(params: { audience?: string; country?: string } = {}): Promise<SubscriptionPlan[]> {
  return read<SubscriptionPlan[]>('/subscriptions/plans', params);
}

/** The caller's subscription, or null for the free plan. */
export function fetchMySubscription(): Promise<Subscription | null> {
  return read<Subscription | null>('/subscriptions/me');
}

export function activateSubscription(request: ActivateSubscriptionRequest): Promise<Subscription> {
  return write<Subscription>('post', '/subscriptions', request);
}

/**
 * Stops it renewing. Access continues to the end of the paid period unless
 * `immediately` is set, which is staff-driven and never sent by this client:
 * somebody who has paid for the month keeps the month.
 */
export function cancelSubscription(
  subscriptionId: string,
  reason?: string
): Promise<Subscription> {
  return write<Subscription>('post', `/subscriptions/${subscriptionId}/cancel`, {
    reason,
    immediately: false,
  });
}

// ── Giving ───────────────────────────────────────────────────────────────────

/** Causes somebody can give to. Most take more than money. */
export function fetchDonationCauses(params: { country?: string; supportKind?: string } = {}): Promise<DonationCause[]> {
  return read<DonationCause[]>('/donations/causes', params);
}

/**
 * Gives money. An anonymous donation stores no donor identifier at all — which
 * is why it cannot then appear in the donor's own history, and why the receipt
 * reference is the only handle they will ever have on it.
 */
export function createDonation(request: CreateDonationRequest): Promise<Donation> {
  return write<Donation>('post', '/donations', request);
}

/** The community funds. All five kinds of support by default. */
export function fetchContributionFunds(params: { country?: string } = {}): Promise<ContributionFund[]> {
  return read<ContributionFund[]>('/contributions/funds', params);
}

/** Contributes money, goods, time or skills. Four of the five kinds move no money. */
export function createContribution(request: CreateContributionRequest): Promise<Contribution> {
  return write<Contribution>('post', '/contributions', request);
}

/** The caller's donations and contributions. Anonymous gifts are absent by construction. */
export function fetchGivingHistory(params: { take?: number } = {}): Promise<GivingHistory> {
  return read<GivingHistory>('/giving/me', params);
}
