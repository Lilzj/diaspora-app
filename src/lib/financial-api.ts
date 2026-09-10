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
  ChangeSubscriptionPlanRequest,
  CreateDepositRequest,
  CreatePaymentIntentRequest,
  CreateWithdrawalRequest,
  CurrencyFact,
  Donation,
  DonationCause,
  EntitlementSnapshot,
  FinancialCapabilities,
  GivingHistory,
  LedgerPage,
  MonetizationProduct,
  Money,
  MonetizationPurchase,
  PaymentIntent,
  PayoutDestination,
  PayoutOnboardingResponse,
  RegisterPayoutIdentityRequest,
  StartPayoutOnboardingRequest,
  Placement,
  PlanChangePreview,
  PlatformEnvelope,
  PromotionQuote,
  PurchaseProductRequest,
  RedeemPromotionRequest,
  RegisterPayoutDestinationRequest,
  RenewPlacementRequest,
  Subscription,
  SubscriptionPlan,
  Transaction,
  UpcomingCharge,
  Wallet,
  Withdrawal,
  WithdrawalLimits,
} from '@/types/financial';
import type { RewardConversionPreview } from '@/types/financial-gaps';

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

  rewardPoints: () => ['financial', 'rewards', 'me'] as const,
  rewardConversionTerms: (currency?: string) =>
    ['financial', 'rewards', 'conversion', currency ?? 'default'] as const,

  payments: () => ['financial', 'payments'] as const,
  paymentHistory: (status?: string) => ['financial', 'payments', 'history', status ?? 'all'] as const,
  payment: (id: string) => ['financial', 'payments', id] as const,

  catalog: (params?: CatalogParams) => ['financial', 'catalog', params ?? {}] as const,
  purchases: (status?: string) => ['financial', 'purchases', status ?? 'all'] as const,
  placements: () => ['financial', 'placements'] as const,
  myPlacements: (status?: string) => ['financial', 'placements', 'me', status ?? 'all'] as const,
  placement: (placementId: string) => ['financial', 'placements', placementId] as const,
  subjectPlacements: (subjectType: string, subjectId: string) =>
    ['financial', 'placements', subjectType, subjectId] as const,

  subscription: () => ['financial', 'subscription'] as const,
  plans: (audience?: string, country?: string) =>
    ['financial', 'subscription', 'plans', audience ?? 'all', country ?? 'all'] as const,
  /**
   * The change preview is keyed by target plan because it *is* per-plan: a
   * member comparing three plans issues three previews, and collapsing them
   * under one key would show the third member the first plan's proration.
   */
  changePreview: (subscriptionId: string, planCode: string) =>
    ['financial', 'subscription', subscriptionId, 'change-preview', planCode] as const,
  upcomingCharges: () => ['financial', 'subscription', 'upcoming'] as const,

  /**
   * Sits under `subscription()` deliberately — every entitlement is granted by a
   * plan, so anything that invalidates the subscription must invalidate this.
   */
  entitlements: () => ['financial', 'subscription', 'entitlements'] as const,

  /**
   * Withdrawals sit under `wallets()` because every one of them moves a balance:
   * raising one holds money, completing one spends it, and cancelling one gives
   * it back. A caller invalidating the wallet root must see all three.
   */
  deposits: () => ['financial', 'wallets', 'deposits'] as const,
  depositLimits: (currency: string, country?: string) =>
    ['financial', 'wallets', 'deposits', 'limits', currency, country ?? 'any'] as const,

  withdrawals: () => ['financial', 'wallets', 'withdrawals'] as const,
  withdrawal: (withdrawalId: string) =>
    ['financial', 'wallets', 'withdrawals', withdrawalId] as const,
  withdrawalLimits: (currency: string, country?: string) =>
    ['financial', 'wallets', 'withdrawals', 'limits', currency, country ?? 'any'] as const,

  /**
   * Destinations are *not* under `wallets()`: registering one moves no money, and
   * a payment invalidating the wallet root should not refetch a list that cannot
   * have changed.
   */
  payoutDestinations: () => ['financial', 'payout-destinations'] as const,

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

/** One placement. The route `billing.placement.activated` deep-links to. */
export function fetchPlacement(placementId: string): Promise<Placement> {
  return read<Placement>(`/placements/${placementId}`);
}

/** Stops a placement. Whether money comes back is the refund-window policy's decision. */
export function cancelPlacement(placementId: string, reason?: string): Promise<Placement> {
  return write<Placement>('delete', `/placements/${placementId}`, undefined, reason ? { reason } : undefined);
}

// ── Placement lifecycle (B15.1) — MON-GAP-004 and MON-GAP-005 ────────────────
//
// Four routes this client simulated until now. Two notes about their shapes,
// both of which a caller gets wrong by assuming symmetry:
//
//  · **Renew answers a purchase, not a placement.** `RenewPlacementCommand` is
//    `ICommand<MonetizationPurchaseResponse>` — it records a purchase, creates a
//    `PaymentIntent`, and hands both back with the placement nested under
//    `.placement`. The intent is created, never captured, so the renewal has
//    *not* happened when this call returns. The extended window lands when the
//    payment captures, exactly as a first purchase does.
//  · **Pause, resume and auto-renew answer a placement** and move no money, so
//    their result is authoritative the moment it arrives.
//
// Idempotency is body-only on renew — `CatalogEndpoints.cs:184` reads
// `request.IdempotencyKey` and no handler in this module inspects a header. The
// other three take no key because they are naturally idempotent on the state
// they set.

/**
 * Extends a placement rather than opening a second one.
 *
 * The difference the member's money notices: re-purchasing produces a second
 * placement starting when the first ends, because the platform refuses
 * overlaps; renewing moves the end of the one that already exists.
 *
 * **The returned purchase is not a completed renewal.** Read
 * `purchase.payment.status` — `Draft` and `Pending` both mean nothing has been
 * charged yet — and reconcile before telling anybody the promotion is extended.
 * Omitting `productCode` buys the same product again, which is what renewing
 * usually means; the server refuses when the product is no longer on sale, is
 * not renewable, or has no duration to extend.
 */
export function renewPlacement(
  placementId: string,
  request: RenewPlacementRequest = {}
): Promise<MonetizationPurchase> {
  return write<MonetizationPurchase>('post', `/placements/${placementId}/renew`, request);
}

/**
 * Records whether a placement should renew itself when its window closes.
 *
 * A stored preference, not a subscription: the renewal still buys the product
 * again at whatever it costs then. What it removes is the member having to be
 * holding their phone at the right moment.
 */
export function setPlacementAutoRenew(placementId: string, enabled: boolean): Promise<Placement> {
  return write<Placement>('put', `/placements/${placementId}/auto-renew`, { enabled });
}

/**
 * Stops delivery and stops the clock. The paused days are banked.
 *
 * Not the same operation as cancelling and re-buying, which loses the remaining
 * paid time — which is why this client never presented that as a pause.
 */
export function pausePlacement(placementId: string): Promise<Placement> {
  return write<Placement>('post', `/placements/${placementId}/pause`);
}

/** Starts it again and extends the window by exactly the paused duration. */
export function resumePlacement(placementId: string): Promise<Placement> {
  return write<Placement>('post', `/placements/${placementId}/resume`);
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

// ── Plan change (B15.1) — MON-GAP-003 ────────────────────────────────────────

/**
 * What changing plan would cost and what it would change.
 *
 * `planCode` is a query parameter, not a body — this is a GET
 * (`SubscriptionEndpoints.cs:83`), and it is a read rather than a reservation:
 * calling it changes nothing and does not hold the quoted price.
 *
 * Every figure here is server-computed on purpose. A client multiplying a plan
 * price by the remaining fraction of a period disagrees with the server at the
 * first rounding boundary, and the figure it gets wrong is the one it charges.
 */
export function previewSubscriptionChange(
  subscriptionId: string,
  planCode: string
): Promise<PlanChangePreview> {
  return read<PlanChangePreview>(`/subscriptions/${subscriptionId}/change/preview`, { planCode });
}

/**
 * Moves a subscription to another plan.
 *
 * An upgrade takes effect now and charges the difference; a downgrade waits for
 * the period boundary, because somebody who paid for the month keeps the month.
 * The server decides which of the two this is — the client must not infer it
 * from a price comparison and must render `effectiveAt` from the preview.
 *
 * Idempotency is body-only: `SubscriptionEndpoints.cs:118` reads
 * `request.IdempotencyKey`, and nothing in this module inspects a header.
 */
export function changeSubscriptionPlan(
  subscriptionId: string,
  request: ChangeSubscriptionPlanRequest
): Promise<Subscription> {
  return write<Subscription>('post', `/subscriptions/${subscriptionId}/change`, request);
}

/**
 * The next charge on each of the caller's subscriptions.
 *
 * **A list.** `GetUpcomingChargesQuery` is `IQuery<IReadOnlyList<...>>`; the
 * route name is singular and the payload is not, and a caller reading `.amount`
 * off it gets `undefined`.
 *
 * Priced by the server rather than forecast on the device: a promotion, a trial
 * or a repricing policy all change the figure, so multiplying a plan price would
 * be right most months and wrong on exactly the ones somebody notices.
 */
export function fetchUpcomingCharges(): Promise<UpcomingCharge[]> {
  return read<UpcomingCharge[]>('/subscriptions/me/upcoming');
}

// ── Entitlements (B15.1) — MON-GAP-008 ───────────────────────────────────────

/**
 * What the caller is entitled to, and how much of it they have used.
 *
 * Self only; there is no variant taking a user id, deliberately — an entitlement
 * snapshot is a financial fact about a named person and a route that accepted an
 * id is one somebody would eventually pass somebody else's.
 *
 * **A counter with no `consumed` means "not measured", never zero.** The ceiling
 * comes from the plan and the consumption comes from whichever vertical owns the
 * thing being counted, so a limit nobody reports against arrives with a ceiling
 * and a null. Rendering that as an empty bar claims "none used", which is a
 * statement no part of the platform made.
 */
export function fetchMyEntitlements(): Promise<EntitlementSnapshot> {
  return read<EntitlementSnapshot>('/entitlements/me');
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

// ── Rewards, read side (Remediation Wave C-01) ───────────────────────────────
//
// `financial-gaps.ts` records rewards as `owner: 'future-evolution'`, on the
// grounds that "the module has no occurrence of 'points' at all". That was true
// when written. `/api/v1/financial/rewards/*` now exists, and the three reads
// below work **regardless of the deployment switches** — unlike conversion
// itself, which needs `EnableRewardConversion` and a published rate and is
// therefore still refused on most deployments.
//
// That distinction is the whole reason only the reads move here. A member can
// now be shown their real points balance and told honestly why conversion is
// unavailable, which is strictly better than a simulation of both. The write
// (`POST /rewards/conversions`) stays on the development arm until a deployment
// enables it.
//
// ── The one field that would have been wrong ─────────────────────────────────
//
// The client's simulated policy carries `pointsPerMinorUnit` — "how many points
// make one minor unit". The server publishes `minorUnitsPerPoint` — "how many
// minor units one point is worth". **They are reciprocals.** Mapping one onto
// the other by name similarity would misprice every conversion by a factor of
// the rate squared, in a direction that looks plausible on screen. The types
// below name the field as the wire names it and convert once, here.

/** `RewardBalanceResponse`. Points are a `long` count and carry no currency, by contract. */
export interface RewardPointsBalance {
  balance: number;
  lifetimeEarned: number;
  lifetimeConverted: number;
  canConvert: boolean;
  resolvedAt: string;
}

/** `RewardEntryResponse`. `points` is always positive; `isConversion` says which direction. */
export interface RewardLedgerEntry {
  entryId: string;
  points: number;
  isConversion: boolean;
  source: string;
  occurredAt: string;
}

/** `RewardConversionTermsResponse`. */
export interface RewardConversionTerms {
  isEnabled: boolean;
  /** e.g. `financial.rewards.conversion_not_supported`. Present when `isEnabled` is false. */
  disabledReason?: string | null;
  currency: string;
  /**
   * Minor units one point is worth — **not** points per minor unit.
   *
   * A point worth 0.5 pence is `0.5` here and would be `2` under the client's
   * old `pointsPerMinorUnit`. See the section header.
   */
  minorUnitsPerPoint: number;
  minimumPoints: number;
  maximumPoints?: number | null;
  dailyMaximumPoints?: number | null;
  dailyRemainingPoints?: number | null;
  policyVersion?: string | null;
}

/** The member's points balance. Zeros rather than a 404 when they have no reward account. */
export function fetchRewardPointsBalance(): Promise<RewardPointsBalance> {
  return read<RewardPointsBalance>('/rewards/me');
}

/**
 * How the points were earned, newest first.
 *
 * Paged by `before`/`take` rather than a cursor — this route takes no
 * `excludeIds`, unlike its deposit and withdrawal siblings, so the caller pages
 * on `occurredAt` alone.
 */
export function fetchRewardPointsHistory(
  params: { before?: string; take?: number } = {}
): Promise<RewardLedgerEntry[]> {
  return read<RewardLedgerEntry[]>('/rewards/me/history', params);
}

/**
 * The conversion rules, owned entirely by the server.
 *
 * `isEnabled` is false on a deployment with conversion switched off *or* with no
 * published rate, and `disabledReason` says which. A screen that reads this can
 * tell a member why rather than showing them a converter that refuses.
 */
export function fetchRewardConversionTerms(
  params: { currency?: string; country?: string } = {}
): Promise<RewardConversionTerms> {
  return read<RewardConversionTerms>('/rewards/conversion', params);
}

/**
 * What converting these points would do, as the platform prices it.
 *
 * **The write side used to stay on the development arm** "until a deployment
 * enables it", because conversion needs `EnableRewardConversion` and a
 * published rate. That reasoning had one flaw: a simulated preview cannot tell
 * a member their deployment has conversion switched off. The route can, and
 * does — `isPermitted` false with a `refusalCode`, rather than an exception.
 *
 * So this asks the platform and renders its answer, refusal included. Reading
 * the platform's decision beats re-deriving it from a build flag, which is what
 * left the convert screen rendering a header over an empty body.
 */
export async function previewRewardConversion(
  points: number,
  currency: string,
  countryCode?: string
): Promise<RewardConversionPreview> {
  const wire = await write<RewardConversionPreviewWire>(
    'post',
    '/rewards/conversions/preview',
    { points, currency, countryCode }
  );

  const zero: Money = { ...wire.credit, minorUnits: 0, amount: 0 };

  return {
    points: wire.points,
    // **There is no fee on this contract.** The client's type carries one
    // because the simulation did; the platform prices a conversion as a single
    // credit. Zero is what it is, not a placeholder.
    grossValue: wire.credit,
    fee: zero,
    netValue: wire.credit,
    isValid: wire.isPermitted,
    refusalCode: wire.refusalCode ?? null,
    refusalMessage: wire.refusalMessage ?? null,
  };
}

/** `RewardConversionPreviewResponse`. */
interface RewardConversionPreviewWire {
  points: number;
  credit: Money;
  minorUnitsPerPoint: number;
  isPermitted: boolean;
  refusalCode?: string | null;
  refusalMessage?: string | null;
  policyVersion?: string | null;
}

/**
 * Converts points to wallet balance.
 *
 * `idempotencyKey` is uniquely indexed by the platform, so a double-tapped
 * button converts once. A deployment with conversion off refuses this with
 * `financial.rewards.conversion_not_supported` — a real refusal a member can
 * be shown, rather than a thrown gap error with no message.
 */
export async function convertRewardPoints(request: {
  points: number;
  currency: string;
  countryCode?: string;
  idempotencyKey?: string;
}): Promise<RewardConversionResult> {
  const wire = await write<RewardConversionWire>('post', '/rewards/conversions', request);

  return {
    conversionId: wire.conversionId,
    points: wire.points,
    credited: wire.credited,
    minorUnitsPerPoint: wire.minorUnitsPerPoint,
    transactionId: wire.transactionId ?? null,
    convertedAt: wire.convertedAt,
  };
}

/** `RewardConversionResponse`. */
interface RewardConversionWire {
  conversionId: string;
  points: number;
  credited: Money;
  minorUnitsPerPoint: number;
  policyVersion?: string | null;
  transactionId?: string | null;
  convertedAt: string;
}

export interface RewardConversionResult {
  conversionId: string;
  points: number;
  /** What landed in the wallet. */
  credited: Money;
  /** The rate as applied, never recomputed from today's policy. */
  minorUnitsPerPoint: number;
  /** The ledger transaction the credit landed in. The audit handle. */
  transactionId: string | null;
  convertedAt: string;
}

// ── Deposits ─────────────────────────────────────────────────────────────────
//
// These replace `financial-gap-api`'s simulated deposit. The gap existed because
// "the certified B15 platform has no member-facing deposit route" — which was
// true when it was written and is not any more: `/wallets/me/deposits` is
// served, and its own summary is "Starts a top-up. The wallet is credited when
// the payment captures, never before."
//
// A deposit answers with a `PaymentIntent`, not a bespoke deposit record, and
// that is the useful part: `nextAction` carries the hosted Checkout URL the
// member has to open, and the balance moves when the capture lands — never on
// the strength of this response.

/**
 * Starts a top-up.
 *
 * **Classified `mutating`, so a transport failure is indeterminate rather than
 * failed.** A deposit whose response was lost may exist, and the caller's next
 * move is to read the list — never to retry blindly. Pass `idempotencyKey` and
 * a retry is safe anyway: the server answers a repeated key with the original
 * intent.
 */
export function createDeposit(request: CreateDepositRequest): Promise<PaymentIntent> {
  return write<PaymentIntent>('post', '/wallets/me/deposits', request);
}

/** The caller's own deposits, newest first. */
export function fetchDeposits(status?: string): Promise<PaymentIntent[]> {
  return read<PaymentIntent[]>('/wallets/me/deposits', status ? { status } : undefined);
}

/**
 * Limits and fees for adding money in a currency.
 *
 * Same shape as the withdrawal limits, and read for the same reason: a minimum,
 * a maximum and a daily cap are exactly the figures a client would otherwise
 * hard-code, and every one of them comes from a versioned policy row.
 */
export function fetchDepositLimits(
  currency: string,
  country?: string
): Promise<WithdrawalLimits> {
  return read<WithdrawalLimits>('/wallets/me/deposits/limits', { currency, country });
}

// ── Withdrawals and payout destinations ──────────────────────────────────────
//
// `WithdrawalEndpoints.cs`. Every route below refuses with a specific code when
// the deployment cannot serve it — `financial.payout.country_unsupported`,
// `…method_unsupported`, `…provider_onboarding_required` and five more — and the
// screen renders the reason rather than a generic failure. See
// `financial-errors.ts`.

/**
 * Raises a payout and holds the money behind it.
 *
 * **Classified `mutating`, so a transport failure is indeterminate rather than
 * failed.** A withdrawal whose response was lost may exist, and the caller's
 * next move is to read the list — never to retry blindly. Pass
 * `idempotencyKey` and a retry is safe anyway: the server answers a repeated
 * key with the original withdrawal.
 */
export function createWithdrawal(request: CreateWithdrawalRequest): Promise<Withdrawal> {
  return write<Withdrawal>('post', '/wallets/me/withdrawals', request);
}

/** The caller's own withdrawals, newest first. */
export function fetchWithdrawals(status?: string): Promise<Withdrawal[]> {
  return read<Withdrawal[]>('/wallets/me/withdrawals', status ? { status } : undefined);
}

/** One withdrawal. The authoritative read after an indeterminate create. */
export function fetchWithdrawal(withdrawalId: string): Promise<Withdrawal> {
  return read<Withdrawal>(`/withdrawals/${withdrawalId}`);
}

/**
 * Calls off a withdrawal that nobody has picked up yet.
 *
 * Refused once a settlement provider has taken the instruction — releasing a
 * hold on money that may already be in flight is how a platform pays twice.
 * `isCancellable` on the withdrawal says whether this will be accepted.
 */
export function cancelWithdrawal(withdrawalId: string): Promise<Withdrawal> {
  return write<Withdrawal>('post', `/withdrawals/${withdrawalId}/cancel`);
}

/**
 * Limits and fees for a currency.
 *
 * `country` is the member's, and it changes the answer: limits are resolved
 * most-specific-first, so a country with its own policy gets it.
 */
export function fetchWithdrawalLimits(
  currency: string,
  country?: string
): Promise<WithdrawalLimits> {
  return read<WithdrawalLimits>('/wallets/me/withdrawals/limits', { currency, country });
}

/** Everywhere the caller can send money. */
export function fetchPayoutDestinations(): Promise<PayoutDestination[]> {
  return read<PayoutDestination[]>('/payout-destinations');
}

/**
 * Registers somewhere money can be sent.
 *
 * **Carries no credential.** The account number goes to the settlement provider
 * through its own flow and never reaches this platform; what is stored here is
 * a masked label and the provider's own token.
 */
export function registerPayoutDestination(
  request: RegisterPayoutDestinationRequest
): Promise<PayoutDestination> {
  return write<PayoutDestination>('post', '/payout-destinations', request);
}

/**
 * Opens or resumes the provider — own setup and answers where to send the member.
 *
 * **Carries no credential and returns no page.** What comes back is a URL to
 * open on the provider — site, single-use and short-lived. Storing it and
 * reopening it later sends somebody to a spent link.
 */
export function startPayoutOnboarding(
  request: StartPayoutOnboardingRequest
): Promise<PayoutOnboardingResponse> {
  return write<PayoutOnboardingResponse>('post', '/payout-destinations/onboarding', request);
}

/**
 * Asks the provider whether a destination is payable yet.
 *
 * **The member — own route to being verified**, rather than waiting on staff for
 * something the provider already knows. It can only verify, never unverify.
 */
export function refreshPayoutDestination(destinationId: string): Promise<PayoutDestination> {
  return write<PayoutDestination>(
    'post', `/payout-destinations/${destinationId}/refresh`);
}

/**
 * Records an address a payout provider already knows the member by.
 *
 * **The other half of adding an account.** Where onboarding hands off to a
 * hosted page, this is a form — because an email or a phone number is an
 * address, not a credential.
 */
export function registerPayoutIdentity(
  request: RegisterPayoutIdentityRequest
): Promise<PayoutDestination> {
  return write<PayoutDestination>('post', '/payout-destinations/identity', request);
}

/** Removes a destination. Existing withdrawals against it are unaffected. */
export function removePayoutDestination(destinationId: string): Promise<void> {
  return write<void>('delete', `/payout-destinations/${destinationId}`);
}
