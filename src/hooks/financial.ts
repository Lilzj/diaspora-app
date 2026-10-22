// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial hooks (Backend Phase B15)
//
// TanStack Query owns every piece of server-owned financial state. Zustand owns
// none of it. §24 of the brief is explicit and the reason is not stylistic: a
// balance copied into a global store is a balance that keeps rendering after it
// stops being true, and there is no way to tell by looking at it.
//
// Three behaviours are implemented here rather than in each screen:
//
//   **Reads are cached, writes never are.** A financial mutation's result is
//   applied to the cache only when the backend has reported a state; nothing
//   optimistically credits a wallet.
//
//   **Reconciliation, not optimism.** `usePaymentReconciliation` polls a
//   payment while its status says the outcome is not yet known, and stops the
//   moment it is. A success screen is driven by `Captured`/`Settled` arriving
//   from the server, never by a 200 on the request that started the payment.
//
//   **Mutations do not retry.** `retry: 0` on every one. The client re-sending
//   a payment is the client deciding to charge twice; the idempotency key is
//   there so a *member's* retry is safe, not so the app can retry silently.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import * as api from '@/lib/financial-api';
import { financialKeys } from '@/lib/financial-api';
import { FinancialError, offlineError, shouldRetryQuery } from '@/lib/financial-errors';
import { paymentNeedsReconciliation, presentPaymentStatus } from '@/lib/financial-status';
import { resolveFinancialAccess, type FinancialAccess } from '@/lib/financial-access';
import { useConnectivityStore } from '@/lib/connectivity';
import { acquireIdempotencyKey, releaseIdempotencyKey, type OperationScope } from '@/lib/idempotency';
import { useAuthStore } from '@/store/auth';
import { resolveCurrency } from '@/lib/money';
import type {
  ActivateSubscriptionRequest,
  CreateContributionRequest,
  CreateDonationRequest,
  CreatePaymentIntentRequest,
  CreateDepositRequest,
  CreateWithdrawalRequest,
  PaymentIntent,
  PurchaseProductRequest,
  RegisterPayoutDestinationRequest,
  PayoutOnboardingResponse,
  RegisterPayoutIdentityRequest,
  StartPayoutOnboardingRequest,
  Wallet,
  Withdrawal,
} from '@/types/financial';

// ─────────────────────────────────────────────────────────────────────────────
// Cache policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long a balance may be shown without re-asking.
 *
 * Thirty seconds. Long enough that moving between wallet tabs does not refetch
 * on every push; short enough that a member who has just been paid sees it
 * without pulling to refresh. Anything longer and the screen is quoting a
 * number that a payment made on another device has already changed.
 */
const BALANCE_STALE_MS = 30_000;

/**
 * Reference data — currency symbols, exponents, deployment capabilities —
 * changes when a deployment is reconfigured, which is to say almost never.
 * An hour, and it is still refetched on a cold start.
 */
const REFERENCE_STALE_MS = 60 * 60 * 1000;

/** Catalogue prices can change under a repricing policy. Five minutes. */
const CATALOG_STALE_MS = 5 * 60 * 1000;

const readOptions = {
  retry: shouldRetryQuery,
  staleTime: BALANCE_STALE_MS,
} as const;

/** Mutations never retry. See the header. */
const mutationOptions = { retry: 0 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this member may do, mirroring B15's permission ladder.
 *
 * Advisory only: it decides what to draw, and every action it permits is
 * re-authorised by the server on the request that follows.
 */
export function useFinancialAccess(): FinancialAccess {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  return useMemo(
    () => resolveFinancialAccess(accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );
}

/** Whether financial *writes* may be attempted at all right now. */
export function useCanTransact(): { canTransact: boolean; blockedBy: FinancialError | null } {
  const access = useFinancialAccess();
  const isOnline = useConnectivityStore((state) => state.isOnline);

  return useMemo(() => {
    if (!isOnline) return { canTransact: false, blockedBy: offlineError('Paying') };
    if (!access.canPay) return { canTransact: false, blockedBy: null };
    return { canTransact: true, blockedBy: null };
  }, [isOnline, access.canPay]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deployment reference data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this deployment can actually do.
 *
 * Read before any payment sheet is drawn. An empty `gateways` array is the
 * "not configured" state §4-D requires be rendered honestly rather than hidden
 * behind a spinner that never resolves.
 */
export function useFinancialCapabilities() {
  return useQuery({
    queryKey: financialKeys.capabilities(),
    queryFn: api.fetchCapabilities,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });
}

/** Symbols and exponents. One formatter for the whole app reads this. */
export function useCurrencies() {
  return useQuery({
    queryKey: financialKeys.currencies(),
    queryFn: api.fetchCurrencies,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });
}

/** Exponent and symbol for one currency, from the catalogue. */
export function useCurrencyFacts(code: string): { exponent: number; symbol: string | null } {
  const { data } = useCurrencies();
  return useMemo(() => resolveCurrency(code, data), [code, data]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every wallet the caller holds.
 *
 * An empty array is a legitimate answer — a member whose verification has not
 * been approved has no financial identity yet — and the wallet screen renders
 * that as an explanation rather than as an error or as "£0.00".
 */
export function useWallets(currency?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.wallet(currency),
    queryFn: () => api.fetchWallets(currency),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

/**
 * The wallet the dashboard leads with.
 *
 * `Primary` in the member's own currency if there is one, otherwise the first
 * primary wallet, otherwise the first wallet at all. Never the platform's
 * clearing or revenue wallets — the backend already withholds those, and this
 * is belt and braces on a number that would be meaningless if it appeared.
 */
export function usePrimaryWallet(preferredCurrency?: string): {
  wallet: Wallet | null;
  wallets: Wallet[];
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
} {
  const query = useWallets();

  const wallets = useMemo(
    () => (query.data ?? []).filter((item) => item.walletType !== 'Clearing' && item.ownerType !== 'Platform'),
    [query.data]
  );

  const wallet = useMemo(() => {
    if (wallets.length === 0) return null;
    if (preferredCurrency) {
      const matched = wallets.find(
        (item) => item.walletType === 'Primary' && item.currency === preferredCurrency.toUpperCase()
      );
      if (matched) return matched;
    }
    return wallets.find((item) => item.walletType === 'Primary') ?? wallets[0];
  }, [wallets, preferredCurrency]);

  return {
    wallet,
    wallets,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

/**
 * The statement, cursor-paged by ledger sequence.
 *
 * This is the only financial surface B15 paginates on the wire, and it is
 * therefore the surface the transactions screen points at when somebody wants
 * to go further back than one page. `afterSequence` is an opaque handle as far
 * as this client is concerned: it comes from the previous page and goes back
 * unmodified.
 */
export function useLedger(walletId: string | undefined, entryType?: string) {
  const access = useFinancialAccess();

  return useInfiniteQuery({
    queryKey: financialKeys.ledger(walletId ?? 'none', entryType),
    queryFn: ({ pageParam }) =>
      api.fetchLedger(walletId!, {
        afterSequence: pageParam ?? undefined,
        entryType,
        pageSize: 25,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(walletId) && access.canReadWallet,
    ...readOptions,
  });
}

/**
 * The caller's transactions.
 *
 * One page. `GET /wallets/me/transactions` binds `type` and `pageSize` only —
 * the underlying query supports keyset paging and the endpoint does not expose
 * it — so there is no second page to ask for. GAP-06.
 */
export function useTransactions(type?: string, pageSize = 50) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.transactions(type),
    queryFn: () => api.fetchTransactions({ type, pageSize }),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────────────────────

export function usePaymentIntent(paymentIntentId: string | undefined) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.payment(paymentIntentId ?? 'none'),
    queryFn: () => api.fetchPaymentIntent(paymentIntentId!),
    enabled: Boolean(paymentIntentId) && access.canReadPayments,
    retry: shouldRetryQuery,
    // A payment's status is the one number that must never be served stale.
    staleTime: 0,
  });
}

export function usePaymentHistory(status?: string, take = 50) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.paymentHistory(status),
    queryFn: () => api.fetchPaymentHistory({ status, take }),
    enabled: access.canReadPayments,
    ...readOptions,
  });
}

/**
 * How often to ask again while a payment is in flight.
 *
 * Backing off matters: a gateway that is slow is usually slow for tens of
 * seconds, and a client hammering `GET /payment-intents/{id}` every two seconds
 * for two minutes is sixty requests against a rate limiter B17 configured for
 * ordinary traffic. Two seconds for the first few attempts covers the common
 * case where the simulator answers immediately; then it stretches.
 */
function reconciliationInterval(attempt: number): number {
  if (attempt < 5) return 2_000;
  if (attempt < 12) return 5_000;
  return 15_000;
}

/** Stop asking after five minutes and hand over to the member. */
const RECONCILIATION_CEILING_MS = 5 * 60 * 1000;

export interface ReconciliationState {
  payment: PaymentIntent | undefined;
  /** Still asking. */
  isReconciling: boolean;
  /** Gave up asking while the outcome was still unknown. */
  hasTimedOut: boolean;
  isLoading: boolean;
  error: FinancialError | null;
  /** Ask again now. What the "Check again" button calls. */
  checkNow: () => void;
}

/**
 * Watches a payment until the backend says what happened.
 *
 * This is §22's answer to an uncertain outcome. The rule it enforces is that
 * "Payment successful" is a thing only the server may say: the caller renders
 * success when `presentPaymentStatus(payment.status).isSettled`, and while that
 * is false the screen says the status is being confirmed.
 *
 * Timing out is a state, not an error. After five minutes the polling stops and
 * `hasTimedOut` is set, so the screen can say "this is taking longer than usual,
 * we will notify you" — which is true, because `billing.payment.failed` and the
 * receipt notifications arrive through B13 regardless of whether the app is
 * open.
 */
export function usePaymentReconciliation(paymentIntentId: string | undefined): ReconciliationState {
  const query = usePaymentIntent(paymentIntentId);
  const queryClient = useQueryClient();

  const startedAt = useRef<number | null>(null);
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = query.data?.status;
  const needsMore = status ? paymentNeedsReconciliation(status) : false;

  // Reset the clock whenever the payment being watched changes, so navigating
  // from one pending payment to another does not inherit the first one's
  // exhausted budget.
  useEffect(() => {
    startedAt.current = null;
    attempts.current = 0;
  }, [paymentIntentId]);

  const timedOut =
    startedAt.current !== null && Date.now() - startedAt.current > RECONCILIATION_CEILING_MS;

  useEffect(() => {
    if (!paymentIntentId || !needsMore || timedOut) return;

    if (startedAt.current === null) startedAt.current = Date.now();

    const delay = reconciliationInterval(attempts.current);
    timer.current = setTimeout(() => {
      attempts.current += 1;
      queryClient.invalidateQueries({ queryKey: financialKeys.payment(paymentIntentId) });
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `query.dataUpdatedAt` re-arms the timer after each answer.
  }, [paymentIntentId, needsMore, timedOut, query.dataUpdatedAt, queryClient]);

  // A payment that reached a settled state has moved money: the balance, the
  // statement and the transaction list are all now wrong in the cache.
  const settled = status ? presentPaymentStatus(status).isSettled : false;
  useEffect(() => {
    if (settled) invalidateAfterMoneyMoved(queryClient);
  }, [settled, queryClient]);

  const checkNow = useCallback(() => {
    if (!paymentIntentId) return;
    startedAt.current = Date.now();
    attempts.current = 0;
    queryClient.invalidateQueries({ queryKey: financialKeys.payment(paymentIntentId) });
  }, [paymentIntentId, queryClient]);

  return {
    payment: query.data,
    isReconciling: needsMore && !timedOut,
    hasTimedOut: needsMore && timedOut,
    isLoading: query.isLoading,
    error: (query.error as FinancialError) ?? null,
    checkNow,
  };
}

/**
 * Everything a completed financial operation invalidates.
 *
 * Called once, from the places that know money moved, rather than spelled out
 * at each mutation — the set is the same every time and a mutation that
 * remembered four of the five would leave a screen showing an old balance.
 */
export function invalidateAfterMoneyMoved(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });
  queryClient.invalidateQueries({ queryKey: financialKeys.transactions() });
  queryClient.invalidateQueries({ queryKey: financialKeys.payments() });
  queryClient.invalidateQueries({ queryKey: financialKeys.purchases() });
  queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
  queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
  queryClient.invalidateQueries({ queryKey: financialKeys.subscription() });
}

/**
 * Starts a payment, carrying an idempotency key that survives a retry.
 *
 * The key is acquired inside the mutation function rather than passed in, so
 * every caller gets the protection without having to remember it, and so a
 * second tap while the first request is still open reuses the same key.
 */
export function useCreatePaymentIntent(scope: OperationScope) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreatePaymentIntentRequest, 'idempotencyKey'>) => {
      const idempotencyKey = await acquireIdempotencyKey(scope);
      return api.createPaymentIntent({ ...request, idempotencyKey });
    },
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      // Deliberately not `invalidateAfterMoneyMoved`: creating an intent moves
      // nothing. The balance is untouched until a capture is reported.
      if (presentPaymentStatus(payment.status).isTerminal) {
        void releaseIdempotencyKey(scope);
      }
    },
  });
}

export function useAuthorizePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ paymentIntentId, clientContext }: { paymentIntentId: string; clientContext?: string }) =>
      api.authorizePayment(paymentIntentId, clientContext),
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
    },
  });
}

export function useCapturePayment(scope?: OperationScope) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ paymentIntentId, amount }: { paymentIntentId: string; amount?: number }) =>
      api.capturePayment(paymentIntentId, amount),
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      if (presentPaymentStatus(payment.status).isSettled) {
        invalidateAfterMoneyMoved(queryClient);
      }
      if (scope && presentPaymentStatus(payment.status).isTerminal) {
        void releaseIdempotencyKey(scope);
      }
    },
  });
}

export function useCancelPayment(scope?: OperationScope) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (paymentIntentId: string) => api.cancelPayment(paymentIntentId),
    onSuccess: (payment) => {
      queryClient.setQueryData(financialKeys.payment(payment.paymentIntentId), payment);
      if (scope) void releaseIdempotencyKey(scope);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue, purchases, placements
// ─────────────────────────────────────────────────────────────────────────────

export function useCatalog(params: api.CatalogParams = {}, enabled = true) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.catalog(params),
    queryFn: () => api.fetchCatalog(params),
    // Browsing the catalogue is a Limited-tier read; buying is Verified.
    enabled: enabled && access.tier >= 2,
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function usePurchases(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.purchases(status),
    queryFn: () => api.fetchPurchases({ status }),
    enabled: access.tier >= 2,
    ...readOptions,
  });
}

/**
 * Buys a catalogue product.
 *
 * The response carries the placement it granted and the payment it needs, so a
 * caller can go straight to reconciliation without a second round trip. The
 * idempotency scope defaults to product-plus-subject, which makes a double tap
 * one purchase — the correct reading, because nobody boosts the same listing
 * twice within a minute on purpose.
 */
/**
 * Buys a catalogue product, and takes the payment as far as the gateway.
 *
 * ── Two calls, for the same reason a deposit needs two ───────────────────────
 *
 * `POST /catalog/purchases` answers with an intent in `Draft` and no gateway
 * provider: nothing has been asked of Stripe or Flutterwave yet.
 * `POST /payment-intents/{id}/authorize` is what hands it over.
 *
 * This hook did only the first call. `useCreateDeposit` two hundred lines below
 * has done both since it was written, and says why in its own comment — the
 * purchase path simply never got the second one. The first purchase ever made
 * on the deployment proved it: the campaign reached `PendingPayment`, the
 * purchase reached `Pending`, and the payment intent sat in `Draft` with
 * `GatewayProvider` null while the app showed "Confirming your payment" for as
 * long as anyone cared to watch. Nothing errored, because nothing failed — the
 * gateway was never asked.
 *
 * This is every purchase, not only advertising: marketplace promotions,
 * donations, subscriptions and boosts all buy through here.
 *
 * The idempotency key is released only at a terminal state, so a member who
 * taps twice gets one purchase, and a failed authorise is safe to retry — the
 * create replays to the same intent and the authorise runs again against it.
 */
export function usePurchaseProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<PurchaseProductRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'purchase',
        subject: `${request.productCode}:${request.subjectId ?? 'self'}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const purchase = await api.purchaseProduct({ ...request, idempotencyKey });

      // The gateway call. Without it the member waits on a payment nobody has
      // been asked to take.
      //
      // Only when the purchase actually needs one: a product settled from the
      // wallet, or granted outright, completes without a payment intent, and
      // authorising a settled intent would be a second write for nothing.
      const payment =
        purchase.payment && !isPaymentSettled(purchase.payment.status)
          ? await api.authorizePayment(purchase.payment.paymentIntentId)
          : purchase.payment;

      const settled = { ...purchase, payment: payment ?? null };

      // Terminal purchases release the key so a genuine second purchase later
      // is not refused as a duplicate of this one.
      if (settled.status === 'Completed' || settled.status === 'Failed' || settled.status === 'Cancelled') {
        await releaseIdempotencyKey(scope);
      }
      return settled;
    },
    onSuccess: (purchase) => {
      if (purchase.payment) {
        queryClient.setQueryData(financialKeys.payment(purchase.payment.paymentIntentId), purchase.payment);
      }
      queryClient.invalidateQueries({ queryKey: financialKeys.purchases() });
      if (purchase.status === 'Completed') invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useMyPlacements(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.myPlacements(status),
    queryFn: () => api.fetchMyPlacements({ status }),
    enabled: access.tier >= 2,
    ...readOptions,
  });
}

/**
 * Is this subject paid for, and until when.
 *
 * The route every other surface actually needs, and the reason a marketplace
 * card can show a "Promoted" chip without Marketplace knowing that money
 * exists.
 */
export function useSubjectPlacements(subjectType: string | undefined, subjectId: string | undefined) {
  return useQuery({
    queryKey: financialKeys.subjectPlacements(subjectType ?? 'none', subjectId ?? 'none'),
    queryFn: () => api.fetchSubjectPlacements(subjectType!, subjectId!),
    enabled: Boolean(subjectType && subjectId),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function useCancelPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ placementId, reason }: { placementId: string; reason?: string }) =>
      api.cancelPlacement(placementId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.placements() });
    },
  });
}

/**
 * Quotes a coupon.
 *
 * A mutation rather than a query because the endpoint is a POST and because
 * redeeming a credit bonus through the same route has an effect. Screens use it
 * for the quote and read `isApplicable` — a code that does nothing is refused
 * with a reason rather than silently applied as zero.
 */
export function useRedeemPromotion() {
  return useMutation({
    ...mutationOptions,
    mutationFn: api.redeemPromotion,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export function useSubscriptionPlans(audience?: string, country?: string) {
  return useQuery({
    queryKey: financialKeys.plans(audience, country),
    queryFn: () => api.fetchSubscriptionPlans({ audience, country }),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

/** The caller's subscription, or null for the free plan. Null is not an error. */
export function useMySubscription() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.subscription(),
    queryFn: api.fetchMySubscription,
    enabled: access.tier >= 2,
    ...readOptions,
  });
}

export function useActivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<ActivateSubscriptionRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = { operation: 'subscription', subject: request.planCode };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const subscription = await api.activateSubscription({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return subscription;
    },
    onSuccess: (subscription) => {
      queryClient.setQueryData(financialKeys.subscription(), subscription);
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ subscriptionId, reason }: { subscriptionId: string; reason?: string }) =>
      api.cancelSubscription(subscriptionId, reason),
    onSuccess: (subscription) => {
      queryClient.setQueryData(financialKeys.subscription(), subscription);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Giving
// ─────────────────────────────────────────────────────────────────────────────

export function useDonationCauses(country?: string, supportKind?: string) {
  return useQuery({
    queryKey: financialKeys.causes(country, supportKind),
    queryFn: () => api.fetchDonationCauses({ country, supportKind }),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function useContributionFunds(country?: string) {
  return useQuery({
    queryKey: financialKeys.funds(country),
    queryFn: () => api.fetchContributionFunds({ country }),
    staleTime: CATALOG_STALE_MS,
    retry: shouldRetryQuery,
  });
}

export function useGivingHistory(take = 50) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.giving(),
    queryFn: () => api.fetchGivingHistory({ take }),
    enabled: access.canReadGiving,
    ...readOptions,
  });
}

/**
 * Gives money.
 *
 * The idempotency scope carries the amount as its discriminator, because giving
 * £10 twice to the same cause is something people do on purpose and refusing
 * the second as a duplicate would be wrong. Two identical amounts within the
 * key's ten-minute window still collapse — which is the double-tap case, and
 * the one worth protecting.
 */
export function useCreateDonation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateDonationRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'donation',
        subject: request.causeCode ?? `${request.beneficiaryType}:${request.beneficiaryId ?? 'platform'}`,
        discriminator: `${request.amount}${request.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const donation = await api.createDonation({ ...request, idempotencyKey });

      // **The gateway call.** Creating a donation opens a payment intent in
      // `Draft` and hands it to nobody. Without this the intent has no gateway
      // reference, no `nextAction` for `PaymentSheet` to open, and no provider
      // has been asked for the money — while the screen says "we are confirming
      // this with the payment provider", which is a sentence about a request
      // that was never made. The donation then sits `Pending` for ever, no
      // capture fires, and nothing downstream of it happens: no ledger
      // transaction, and no creator earning.
      //
      // Same omission the purchase path had, and the deposit path never did.
      // Guarded the same way: a donation settled from the wallet needs no
      // authorisation, and authorising a settled intent is a write for nothing.
      const payment =
        donation.payment && !isPaymentSettled(donation.payment.status)
          ? await api.authorizePayment(donation.payment.paymentIntentId)
          : donation.payment;

      const settled = { ...donation, payment: payment ?? null };

      if (settled.status !== 'Pending') await releaseIdempotencyKey(scope);
      return settled;
    },
    onSuccess: (donation) => {
      if (donation.payment) {
        queryClient.setQueryData(financialKeys.payment(donation.payment.paymentIntentId), donation.payment);
      }
      queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
      if (donation.status === 'Completed') invalidateAfterMoneyMoved(queryClient);
    },
  });
}

/**
 * Contributes money, goods, time or skills.
 *
 * Four of the five kinds move no money at all, so a completed non-monetary
 * contribution invalidates the giving history and nothing else — invalidating a
 * balance because somebody pledged six Saturdays would be refetching for a
 * number that cannot have changed.
 */
export function useCreateContribution() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateContributionRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'contribution',
        subject: request.fundCode,
        discriminator: `${request.kind}:${request.amount ?? request.pledgeQuantity ?? 0}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const contribution = await api.createContribution({ ...request, idempotencyKey });

      // The same gateway call, and the same omission. A contribution of goods,
      // time or skills opens no payment intent at all, so the guard below is
      // what keeps this correct for the three quarters of this form that never
      // involve money.
      const payment =
        contribution.payment && !isPaymentSettled(contribution.payment.status)
          ? await api.authorizePayment(contribution.payment.paymentIntentId)
          : contribution.payment;

      const settled = { ...contribution, payment: payment ?? null };

      if (settled.status !== 'Pending') await releaseIdempotencyKey(scope);
      return settled;
    },
    onSuccess: (contribution) => {
      if (contribution.payment) {
        queryClient.setQueryData(
          financialKeys.payment(contribution.payment.paymentIntentId),
          contribution.payment
        );
      }
      queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
      queryClient.invalidateQueries({ queryKey: financialKeys.funds() });
      if (contribution.kind === 'Monetary' && contribution.status === 'Completed') {
        invalidateAfterMoneyMoved(queryClient);
      }
    },
  });
}

// ── Withdrawals and payout destinations ──────────────────────────────────────
//
// Real routes, replacing the simulated flow that stood in while no settlement
// provider existed. The shapes changed with them — `gross`/`net` rather than
// `amount`/`netAmount`, `Reversed` in the status union, `isCancellable` decided
// by the server rather than inferred — and `types/financial.ts` notes each one.

/**
 * Whether the deployment can pay this member out at all, and where to.
 *
 * Reads `payoutsEnabled` rather than "is a provider registered": a settlement
 * adapter with an empty capability matrix can pay nobody, and offering a
 * withdraw button on the strength of registration alone produces a screen that
 * refuses every amount.
 */
/**
 * The member's contribution points. The wallet shows the balance on its
 * Rewards action.
 *
 * Not whether they can be converted. `canConvert` here is only "not held and
 * not empty" — it knows nothing of the rate, the deployment switch, the
 * account or the minimum — and the server documents it as superseded. Whether
 * a member may convert, and why not, is `terms.member`, read by
 * `useConversionPolicy`. The wallet used to gate its Rewards action on this
 * flag and explain every refusal as a missing rate.
 */
export function useRewardPointsBalance() {
  return useQuery({
    queryKey: financialKeys.rewardPoints(),
    queryFn: api.fetchRewardPointsBalance,
    retry: shouldRetryQuery,
  });
}

export function usePayoutAvailability() {
  const capabilities = useFinancialCapabilities();

  return useMemo(
    () => ({
      isAvailable: capabilities.data?.payoutsEnabled ?? false,
      countries: capabilities.data?.payoutCountries ?? [],
      isLoading: capabilities.isLoading,
    }),
    [capabilities.data, capabilities.isLoading]
  );
}

/** Everywhere this member can send money. Masked labels and server-issued ids only. */
export function usePayoutDestinations() {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.payoutDestinations(),
    queryFn: api.fetchPayoutDestinations,
    enabled: access.canPay,
    ...readOptions,
  });
}

export function useRegisterPayoutDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: RegisterPayoutDestinationRequest) =>
      api.registerPayoutDestination(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/**
 * Starts the provider — setup for a payout account.
 *
 * **Invalidates the destination list on success even though the member has not
 * finished.** The account exists at the provider from the moment onboarding
 * opens and the server records it right then, so a list that did not refresh
 * would show nothing while the member was half-way through setting it up.
 */
export function useStartPayoutOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: StartPayoutOnboardingRequest) => api.startPayoutOnboarding(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/** Records an address a provider knows the member by. See `registerPayoutIdentity`. */
export function useRegisterPayoutIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (request: RegisterPayoutIdentityRequest) => api.registerPayoutIdentity(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/** Asks the provider whether a destination is payable yet. Only ever verifies. */
export function useRefreshPayoutDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (destinationId: string) => api.refreshPayoutDestination(destinationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

export function useRemovePayoutDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (destinationId: string) => api.removePayoutDestination(destinationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.payoutDestinations() });
    },
  });
}

/**
 * Limits and fees. `country` changes the answer — policy resolves
 * most-specific-first — so it is part of the key rather than a detail.
 */
// ── Deposits ─────────────────────────────────────────────────────────────────
//
// The real routes, replacing `financial-gaps`' simulated deposit. See the note
// on `createDeposit` in `financial-api` for why the gap that guarded these is
// no longer true.

export function useDepositLimits(currency: string, country?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.depositLimits(currency, country),
    queryFn: () => api.fetchDepositLimits(currency, country),
    enabled: access.canPay && Boolean(currency),
    ...readOptions,
  });
}

export function useDeposits(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: [...financialKeys.deposits(), status ?? 'all'],
    queryFn: () => api.fetchDeposits(status),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

/**
 * Starts a top-up, and takes it as far as the payment page.
 *
 * **Two calls, because creating a deposit does not reach the gateway.** `POST
 * /wallets/me/deposits` answers with an intent in `Draft` and `nextAction:
 * null` — no provider has been asked for anything yet. `POST
 * /payment-intents/{id}/authorize` is what hands it to the adapter and comes
 * back `Pending` carrying the hosted Checkout URL. Reading `nextAction` off the
 * create would find nothing, every time, and leave the member on a screen with
 * no way to pay. Proven against the live deployment rather than inferred.
 *
 * The idempotency key is acquired before the create and released only once the
 * intent reaches a terminal state, so a member who taps twice — or whose first
 * response was lost — gets one deposit rather than two. A failed authorise is
 * therefore safe to retry: the create replays to the same intent and the
 * authorise runs again against it.
 *
 * **Nothing here credits a balance.** The wallet moves when the capture lands.
 * Invalidating the balance on success would show money that has not arrived,
 * which is the one thing a wallet must never do.
 */
export function useCreateDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateDepositRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'deposit',
        subject: request.currency,
        discriminator: `${request.amount}:${request.methodKind}`,
      };

      const idempotencyKey = await acquireIdempotencyKey(scope);
      const created = await api.createDeposit({ ...request, idempotencyKey });

      // The gateway call. Without it there is no payment page.
      const intent = await api.authorizePayment(created.paymentIntentId);

      if (isPaymentSettled(intent.status)) {
        await releaseIdempotencyKey(scope);
      }

      return intent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.deposits() });
    },
  });
}

/**
 * Watches one deposit until it stops moving.
 *
 * A member comes back from a hosted Checkout with nothing to say whether the
 * callback has landed yet, so the authoritative answer is a read. It stops on a
 * terminal status rather than polling for ever.
 */
export function useDepositReconciliation(paymentIntentId: string | undefined) {
  return useQuery({
    queryKey: [...financialKeys.deposits(), paymentIntentId ?? 'none'],
    queryFn: () => api.fetchPaymentIntent(paymentIntentId!),
    enabled: Boolean(paymentIntentId),
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isPaymentSettled(status) ? false : 3_000;
    },
  });
}

/**
 * Whether a payment has stopped moving.
 *
 * `Authorized` is deliberately NOT settled: with manual capture the money is
 * held and the platform has still to take it, so a screen that stopped watching
 * there would report a held payment as a finished one.
 */
export function isPaymentSettled(status: string): boolean {
  return status === 'Captured'
    || status === 'Settled'
    || status === 'Failed'
    || status === 'Cancelled'
    || status === 'Refunded'
    || status === 'Expired';
}

export function useWithdrawalLimits(currency: string, country?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.withdrawalLimits(currency, country),
    queryFn: () => api.fetchWithdrawalLimits(currency, country),
    enabled: access.canPay && Boolean(currency),
    ...readOptions,
  });
}

export function useWithdrawals(status?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: [...financialKeys.withdrawals(), status ?? 'all'],
    queryFn: () => api.fetchWithdrawals(status),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

/**
 * Raises a withdrawal.
 *
 * The idempotency key is acquired before the call and released only once the
 * withdrawal reaches a terminal state, so a member who taps twice — or whose
 * first response was lost — gets one withdrawal rather than two. `retry: 0`
 * still applies: the client re-sending this is the client deciding to pay
 * twice, and the key exists to make the *member's* retry safe.
 */
export function useCreateWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<CreateWithdrawalRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'withdrawal',
        subject: request.destinationId,
        discriminator: `${request.amount}${request.currency}`,
      };

      const idempotencyKey = await acquireIdempotencyKey(scope);
      const withdrawal = await api.createWithdrawal({ ...request, idempotencyKey });

      if (isWithdrawalSettled(withdrawal.status)) {
        await releaseIdempotencyKey(scope);
      }

      return withdrawal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.withdrawals() });

      // A withdrawal holds the money the moment it is raised — the balance is
      // stale before anything settles.
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

export function useCancelWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (withdrawalId: string) => api.cancelWithdrawal(withdrawalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financialKeys.withdrawals() });
      invalidateAfterMoneyMoved(queryClient);
    },
  });
}

/**
 * Whether a withdrawal has stopped moving.
 *
 * `Reversed` is terminal and is money that went out and came back — the client
 * could not express it at all while the status union was the simulated one.
 */
export function isWithdrawalSettled(status: string): boolean {
  return status === 'Completed'
    || status === 'Failed'
    || status === 'Cancelled'
    || status === 'Reversed';
}

/**
 * Polls one withdrawal while its outcome is still moving, and stops when it is
 * not.
 *
 * **`Processing` is polled, not treated as done.** It means a settlement
 * provider has the instruction and the outcome is unknown — which is exactly
 * the state a member is staring at the screen for. A withdrawal can sit there
 * for a while: if the provider's answer was lost, the platform holds the money
 * until something establishes what happened, so this backs off rather than
 * hammering, and gives up after a bounded number of attempts rather than
 * polling for ever.
 */
export function useWithdrawalReconciliation(withdrawalId: string | undefined) {
  const queryClient = useQueryClient();
  const attempts = useRef(0);

  const query = useQuery({
    queryKey: financialKeys.withdrawal(withdrawalId ?? 'none'),
    queryFn: () => api.fetchWithdrawal(withdrawalId!),
    enabled: Boolean(withdrawalId),
    retry: shouldRetryQuery,
    staleTime: 0,
  });

  const status = query.data?.status;
  const pending = Boolean(status) && !isWithdrawalSettled(status!);

  useEffect(() => {
    if (!withdrawalId || !pending || attempts.current > 30) {
      return;
    }

    const timer = setTimeout(
      () => {
        attempts.current += 1;
        queryClient.invalidateQueries({ queryKey: financialKeys.withdrawal(withdrawalId) });
      },
      attempts.current < 5 ? 2_000 : 5_000
    );

    return () => clearTimeout(timer);
  }, [withdrawalId, pending, query.dataUpdatedAt, queryClient]);

  const checkNow = useCallback(() => {
    if (!withdrawalId) {
      return;
    }

    queryClient.invalidateQueries({ queryKey: financialKeys.withdrawal(withdrawalId) });
  }, [withdrawalId, queryClient]);

  return {
    withdrawal: query.data as Withdrawal | undefined,
    isReconciling: pending,
    isLoading: query.isLoading,
    error: query.error as FinancialError | null,
    checkNow,
  };
}
