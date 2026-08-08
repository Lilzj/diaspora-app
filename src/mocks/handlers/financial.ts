// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial mock handlers (Backend Phase B15)
//
// Mirrors `/api/v1/financial` closely enough that a screen written against the
// mock works unchanged against the server: the same routes, the same `{ data }`
// envelope, the same cursor shape, the same refusals, and — importantly — the
// same *timing*. A payment intent here does not become `Captured` in the same
// tick it was created; it goes `Pending`, and a client that only works because
// the mock answered instantly is a client that breaks against a real gateway.
//
// **Every route below exists in the certified backend.** Routes for capabilities
// the backend does not have live in `financial-gaps.ts` under a different URL
// prefix, and are labelled there.
//
// The refusals matter as much as the successes: an expired coupon, an
// ineligible product, an insufficient balance and a declined card are all
// reachable from the seed, so a screen's error handling is exercised before it
// ships rather than after.
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import {
  MOCK_CAPABILITIES,
  MOCK_CAUSES,
  MOCK_CURRENCIES,
  MOCK_FUNDS,
  MOCK_LEDGER,
  MOCK_PAYMENTS,
  MOCK_PLACEMENTS,
  MOCK_PLANS,
  MOCK_PRODUCTS,
  MOCK_SUBSCRIPTION,
  MOCK_TRANSACTIONS,
  MOCK_WALLETS,
  MOCK_WALLET_ID,
  money,
} from '../financial-data';
import type {
  Contribution,
  Donation,
  LedgerEntry,
  MonetizationPurchase,
  PaymentIntent,
  Placement,
  Subscription,
  Transaction,
  Wallet,
} from '@/types/financial';

const ROOT = '/financial';

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

/** The platform's envelope. Every financial response is wrapped exactly like this. */
function ok(data: unknown): MockReply {
  return [200, { data }];
}

/**
 * An RFC 9457 problem document with the platform's `errorCode` extension —
 * byte-compatible with what `PlatformResults` produces, so the client's error
 * mapping is exercised by the mock rather than only in production.
 */
function problem(status: number, errorCode: string, detail: string, title?: string): MockReply {
  return [
    status,
    {
      type: `https://docs.diaspora.app/errors/${errorCode}`,
      title: title ?? 'Request refused',
      status,
      detail,
      errorCode,
    },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

/** `PI-XXXXX`, the shape B15's receipt references take. */
function reference(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const body = Array.from({ length: 5 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');
  return `${prefix}-${body}`;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Registers the certified financial routes.
 *
 * Returns a teardown that cancels the simulated gateway's pending timers.
 * Without it a test run holds the Node process open for six seconds after the
 * last assertion — and, worse, a payment scheduled by one test can settle
 * during another. The app never calls it; Jest does.
 */
export function setupFinancialMocks(mock: MockAdapter): () => void {
  /** Every timer the simulated gateway has scheduled, so it can be cancelled. */
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const schedule = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      callback();
    }, delayMs);
    pendingTimers.add(timer);
    return timer;
  };

  // ── Session state ────────────────────────────────────────────────────────
  // Mutable, so a mocked run behaves like a real one: a payment that captures
  // stays captured, a boost that is bought appears in the placements list, and
  // a balance that is debited does not spring back on the next render.

  let wallets: Wallet[] = MOCK_WALLETS.map((wallet) => ({ ...wallet }));
  let ledger: LedgerEntry[] = MOCK_LEDGER.map((entry) => ({ ...entry }));
  let transactions: Transaction[] = MOCK_TRANSACTIONS.map((item) => ({ ...item }));
  let payments: PaymentIntent[] = MOCK_PAYMENTS.map((item) => ({ ...item, refunds: [...item.refunds] }));
  let placements: Placement[] = MOCK_PLACEMENTS.map((item) => ({ ...item }));
  let purchases: MonetizationPurchase[] = [];
  let donations: Donation[] = [];
  let contributions: Contribution[] = [];
  let subscription: Subscription | null = { ...MOCK_SUBSCRIPTION };

  /** Idempotency keys already seen, so a replayed request returns the original. */
  const idempotency = new Map<string, unknown>();

  /**
   * Advances a payment the way a gateway would: not instantly.
   *
   * Six seconds is long enough that the reconciliation path is genuinely
   * exercised — the client polls, shows "confirming", and then settles — and
   * short enough that nobody developing against it loses patience.
   */
  const CAPTURE_DELAY_MS = 6000;

  function schedulePaymentProgression(paymentIntentId: string, outcome: 'capture' | 'fail' = 'capture') {
    schedule(() => {
      const payment = payments.find((item) => item.paymentIntentId === paymentIntentId);
      if (!payment || payment.status !== 'Pending') return;

      if (outcome === 'fail') {
        payment.status = 'Failed';
        payment.failureCode = 'card_declined';
        payment.failureMessage = 'The card issuer declined this payment.';
        payment.attemptCount += 1;
        return;
      }

      payment.status = 'Captured';
      payment.captured = payment.amount;
      payment.refundableRemaining = payment.amount;
      payment.authorizedAt = nowIso();
      payment.capturedAt = nowIso();

      postCapture(payment);
    }, CAPTURE_DELAY_MS);
  }

  /** Writes the ledger entry and transaction a capture produces. */
  function postCapture(payment: PaymentIntent) {
    const primary = wallets.find((wallet) => wallet.walletId === MOCK_WALLET_ID);
    if (!primary || payment.amount.currency !== primary.currency) return;

    const nextSequence = (ledger[0]?.sequence ?? 0) + 1;
    const balanceAfter = money(primary.available.minorUnits - payment.amount.minorUnits, primary.currency);

    const transactionId = newId('tx');

    ledger = [
      {
        entryId: newId('le'),
        transactionId,
        sequence: nextSequence,
        entryType: 'Payment',
        direction: 'Debit',
        bucket: 'Available',
        amount: payment.amount,
        balanceAfter,
        reason: payment.description,
        actorType: 'Gateway',
        source: 'Webhook',
        policyVersion: null,
        correlationId: payment.paymentIntentId,
        subjectType: payment.subjectType ?? null,
        subjectId: payment.subjectId ?? null,
        externalReference: payment.paymentIntentId,
        occurredAt: nowIso(),
      },
      ...ledger,
    ];

    transactions = [
      {
        transactionId,
        transactionType: 'Payment',
        status: 'Completed',
        amount: payment.amount,
        description: payment.description,
        reason: 'Payment captured',
        subjectType: payment.subjectType ?? null,
        subjectId: payment.subjectId ?? null,
        countryCode: 'GB',
        policyVersion: null,
        entryCount: 2,
        reversedByTransactionId: null,
        occurredAt: nowIso(),
        completedAt: nowIso(),
      },
      ...transactions,
    ];

    primary.available = balanceAfter;
    primary.lifetimeDebits = money(
      primary.lifetimeDebits.minorUnits + payment.amount.minorUnits,
      primary.currency
    );
    primary.entryCount += 1;
    primary.lastEntryAt = nowIso();
  }

  function createPayment(input: {
    amountMinor: number;
    currency: string;
    methodKind: string;
    description: string;
    subjectType?: string | null;
    subjectId?: string | null;
  }): PaymentIntent {
    const amount = money(input.amountMinor, input.currency);
    const payment: PaymentIntent = {
      paymentIntentId: newId('pi'),
      status: 'Pending',
      amount,
      captured: money(0, input.currency),
      refunded: money(0, input.currency),
      refundableRemaining: money(0, input.currency),
      methodKind: input.methodKind,
      description: input.description,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      provider: 'Simulator',
      nextAction: null,
      failureCode: null,
      failureMessage: null,
      attemptCount: 1,
      refunds: [],
      expiresAt: inMinutes(30),
      authorizedAt: null,
      capturedAt: null,
      createdAt: nowIso(),
    };
    payments = [payment, ...payments];
    return payment;
  }

  // Amounts ending in .13 always decline. A deterministic way to reach the
  // failure path from the UI without editing the mock — the same trick the
  // gateway simulators use, and worth having because the failure screen is the
  // one nobody sees by accident.
  const declines = (minorUnits: number) => minorUnits % 100 === 13;

  // ── Reference data ───────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/capabilities`).reply(() => ok(MOCK_CAPABILITIES));
  mock.onGet(`${ROOT}/currencies`).reply(() => ok(MOCK_CURRENCIES));

  // ── Wallet ───────────────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/wallets/me`).reply((config) => {
    const currency = config.params?.currency as string | undefined;
    const visible = currency
      ? wallets.filter((wallet) => wallet.currency === currency.toUpperCase())
      : wallets;
    return ok(visible);
  });

  mock.onGet(new RegExp(`${ROOT}/wallets/[^/]+/ledger$`)).reply((config) => {
    const walletId = /wallets\/([^/]+)\/ledger/.exec(config.url ?? '')?.[1];

    if (!wallets.some((wallet) => wallet.walletId === walletId)) {
      // 404 rather than 403, so an identifier cannot be used to discover
      // whether somebody else's wallet exists. The backend's own reasoning.
      return problem(404, 'financial.wallet.not_found', 'That wallet could not be found.');
    }

    const afterSequence = config.params?.afterSequence as number | undefined;
    const pageSize = (config.params?.pageSize as number | undefined) ?? 25;
    const entryType = config.params?.entryType as string | undefined;

    let entries = ledger.filter((entry) => !entryType || entry.entryType === entryType);
    entries = [...entries].sort((left, right) => right.sequence - left.sequence);

    if (afterSequence !== undefined && afterSequence !== null) {
      entries = entries.filter((entry) => entry.sequence < Number(afterSequence));
    }

    const page = entries.slice(0, pageSize);
    const hasMore = entries.length > pageSize;

    return ok({
      walletId,
      entries: page,
      nextCursor: hasMore ? page[page.length - 1]?.sequence : null,
      hasMore,
    });
  });

  mock.onGet(`${ROOT}/wallets/me/transactions`).reply((config) => {
    const type = config.params?.type as string | undefined;
    const pageSize = (config.params?.pageSize as number | undefined) ?? 25;

    const filtered = transactions.filter((item) => !type || item.transactionType === type);
    return ok(filtered.slice(0, pageSize));
  });

  // ── Payments ─────────────────────────────────────────────────────────────

  mock.onPost(`${ROOT}/payment-intents`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      // The replay path. B15 indexes the key uniquely and answers with the
      // original rather than creating a second payment — which is precisely
      // what makes a member's retry safe.
      return ok(idempotency.get(body.idempotencyKey));
    }

    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return problem(422, 'financial.amount.invalid', 'Enter an amount greater than zero.');
    }

    if (!MOCK_CAPABILITIES.supportedMethods.includes(body.methodKind)) {
      return problem(
        422,
        'financial.payment.method_unsupported',
        'That payment method is not available in this country.'
      );
    }

    const exponent = MOCK_CURRENCIES.find((c) => c.code === body.currency)?.exponent ?? 2;
    const amountMinor = Math.round(body.amount * 10 ** exponent);

    const payment = createPayment({
      amountMinor,
      currency: body.currency,
      methodKind: body.methodKind,
      description: body.description,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
    });

    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, payment);

    schedulePaymentProgression(payment.paymentIntentId, declines(amountMinor) ? 'fail' : 'capture');

    return ok(payment);
  });

  mock.onGet(new RegExp(`${ROOT}/payment-intents/[^/]+$`)).reply((config) => {
    const id = /payment-intents\/([^/?]+)/.exec(config.url ?? '')?.[1];
    const payment = payments.find((item) => item.paymentIntentId === id);

    if (!payment) {
      return problem(404, 'financial.payment.not_found', 'That payment could not be found.');
    }
    return ok(payment);
  });

  mock.onPost(new RegExp(`${ROOT}/payment-intents/[^/]+/authorize$`)).reply((config) => {
    const id = /payment-intents\/([^/]+)\/authorize/.exec(config.url ?? '')?.[1];
    const payment = payments.find((item) => item.paymentIntentId === id);

    if (!payment) return problem(404, 'financial.payment.not_found', 'That payment could not be found.');
    if (payment.status !== 'Pending') {
      return problem(
        409,
        'financial.payment.transition_invalid',
        'This payment has already moved on.'
      );
    }

    payment.status = 'Authorized';
    payment.authorizedAt = nowIso();
    return ok(payment);
  });

  mock.onPost(new RegExp(`${ROOT}/payment-intents/[^/]+/capture$`)).reply((config) => {
    const id = /payment-intents\/([^/]+)\/capture/.exec(config.url ?? '')?.[1];
    const payment = payments.find((item) => item.paymentIntentId === id);

    if (!payment) return problem(404, 'financial.payment.not_found', 'That payment could not be found.');
    if (payment.status !== 'Authorized' && payment.status !== 'Pending') {
      return problem(409, 'financial.payment.transition_invalid', 'This payment cannot be captured.');
    }

    payment.status = 'Captured';
    payment.captured = payment.amount;
    payment.refundableRemaining = payment.amount;
    payment.capturedAt = nowIso();
    postCapture(payment);

    return ok(payment);
  });

  mock.onPost(new RegExp(`${ROOT}/payment-intents/[^/]+/cancel$`)).reply((config) => {
    const id = /payment-intents\/([^/]+)\/cancel/.exec(config.url ?? '')?.[1];
    const payment = payments.find((item) => item.paymentIntentId === id);

    if (!payment) return problem(404, 'financial.payment.not_found', 'That payment could not be found.');
    if (payment.status === 'Captured' || payment.status === 'Settled') {
      return problem(
        409,
        'financial.payment.transition_invalid',
        'This payment has already been taken and cannot be cancelled.'
      );
    }

    payment.status = 'Cancelled';
    return ok(payment);
  });

  /**
   * Refunds are staff-only on the wire — `financial:payments:manage:any`, Admin
   * role. The mock enforces that, so the member-facing refund UI is developed
   * against the 403 it will actually receive rather than against a success it
   * will never see. GAP-05.
   */
  mock.onPost(new RegExp(`${ROOT}/payment-intents/[^/]+/refunds$`)).reply(() =>
    problem(
      403,
      'financial.forbidden',
      'Refunds are issued by Diaspora staff. Contact support to request one.'
    )
  );

  mock.onGet(`${ROOT}/payment-intents`).reply((config) => {
    const status = config.params?.status as string | undefined;
    const take = (config.params?.take as number | undefined) ?? 25;

    const filtered = payments.filter((item) => !status || item.status === status);
    return ok(filtered.slice(0, take));
  });

  // ── Catalogue, purchases, placements ─────────────────────────────────────

  mock.onGet(`${ROOT}/catalog`).reply((config) => {
    const subjectType = config.params?.subjectType as string | undefined;
    const category = config.params?.category as string | undefined;

    const filtered = MOCK_PRODUCTS.filter(
      (product) =>
        (!subjectType || product.subjectType === subjectType) &&
        (!category || product.category === category)
    ).sort((left, right) => left.sortOrder - right.sortOrder);

    return ok(filtered);
  });

  mock.onPost(`${ROOT}/purchases`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    const product = MOCK_PRODUCTS.find((item) => item.code === body.productCode);
    if (!product) {
      return problem(404, 'financial.product.not_found', 'That option is no longer available.');
    }
    if (!product.isAvailable) {
      return problem(
        422,
        product.unavailableReasonCode ?? 'financial.product.not_eligible',
        product.unavailableReason ?? 'You cannot buy this yet.'
      );
    }
    if (body.subjectType && body.subjectType !== product.subjectType) {
      return problem(
        422,
        'financial.product.subject_mismatch',
        'That option does not apply to this item.'
      );
    }

    // A placement that overlaps a running one is refused, exactly as the
    // aggregate does — otherwise a member buys a second boost that does nothing.
    const overlapping = placements.find(
      (placement) =>
        placement.isActive &&
        placement.subjectId === body.subjectId &&
        placement.kind === product.placementKind
    );
    if (overlapping) {
      return problem(
        409,
        'financial.placement.overlaps',
        'This item already has a promotion running. Wait for it to finish, or cancel it first.'
      );
    }

    const listPrice = product.price ?? money(0);
    const discount = evaluatePromotion(body.promotionCode, listPrice.minorUnits);
    const paid = money(Math.max(0, listPrice.minorUnits - discount), listPrice.currency);

    const payment = paid.minorUnits > 0
      ? createPayment({
          amountMinor: paid.minorUnits,
          currency: paid.currency,
          methodKind: body.methodKind ?? 'Card',
          description: product.name,
          subjectType: body.subjectType ?? product.subjectType,
          subjectId: body.subjectId,
        })
      : null;

    const placement: Placement | null = product.placementKind
      ? {
          placementId: newId('pl'),
          subjectType: body.subjectType ?? product.subjectType,
          subjectId: body.subjectId ?? 'self',
          kind: product.placementKind,
          // Scheduled, not Active. B15 activates on capture and only on capture.
          status: 'Scheduled',
          isActive: false,
          priorityWeight: product.priorityWeight,
          productCode: product.code,
          countryCode: body.countryCode ?? 'GB',
          policyVersion: 'boost.pricing@2',
          startsAt: body.startsAt ?? nowIso(),
          endsAt: product.durationDays
            ? new Date(Date.now() + product.durationDays * 86400000).toISOString()
            : null,
        }
      : null;

    if (placement) placements = [placement, ...placements];

    const purchase: MonetizationPurchase = {
      purchaseId: newId('pu'),
      productCode: product.code,
      category: product.category,
      status: 'Pending',
      subjectType: body.subjectType ?? product.subjectType,
      subjectId: body.subjectId ?? 'self',
      listPrice,
      discount: money(discount, listPrice.currency),
      paid,
      promotionCode: body.promotionCode ?? null,
      policyVersion: 'boost.pricing@2',
      paymentIntentId: payment?.paymentIntentId ?? null,
      placement,
      payment,
      createdAt: nowIso(),
      completedAt: null,
    };

    purchases = [purchase, ...purchases];
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, purchase);

    if (payment) {
      schedulePaymentProgression(payment.paymentIntentId);

      // The purchase completes and the placement activates on capture — and
      // only on capture. That ordering is the whole of B15's one-paragraph
      // summary and the mock reproduces it rather than shortcutting it.
      schedule(() => {
        const settled = payments.find((item) => item.paymentIntentId === payment.paymentIntentId);
        if (settled?.status !== 'Captured') return;

        purchase.status = 'Completed';
        purchase.completedAt = nowIso();

        if (placement) {
          placement.status = 'Active';
          placement.isActive = true;
        }
      }, CAPTURE_DELAY_MS + 500);
    }

    return ok(purchase);
  });

  mock.onGet(`${ROOT}/purchases`).reply((config) => {
    const status = config.params?.status as string | undefined;
    return ok(purchases.filter((item) => !status || item.status === status));
  });

  /** The three coupons the seed knows, and what each one is for. */
  function evaluatePromotion(code: string | undefined, listMinorUnits: number): number {
    if (!code) return 0;
    switch (code.toUpperCase()) {
      case 'WELCOME10':
        return Math.round(listMinorUnits * 0.1);
      case 'DIASPORA25':
        return Math.round(listMinorUnits * 0.25);
      case 'FIRSTBOOST':
        return listMinorUnits;
      default:
        return 0;
    }
  }

  mock.onPost(`${ROOT}/promotions/redeem`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');
    const code = (body.code as string | undefined)?.toUpperCase() ?? '';

    const product = MOCK_PRODUCTS.find((item) => item.code === body.productCode);
    const listPrice = product?.price ?? money(0);

    const known = ['WELCOME10', 'DIASPORA25', 'FIRSTBOOST', 'EXPIRED2024', 'USEDUP'];
    if (!known.includes(code)) {
      return problem(404, 'financial.promotion.not_found', 'That code was not recognised.');
    }
    if (code === 'EXPIRED2024') {
      return problem(422, 'financial.promotion.expired', 'That code has expired.');
    }
    if (code === 'USEDUP') {
      return problem(422, 'financial.promotion.exhausted', 'That code has been fully used.');
    }

    const discount = evaluatePromotion(code, listPrice.minorUnits);

    return ok({
      code,
      isApplicable: discount > 0,
      listPrice,
      discount: money(discount, listPrice.currency),
      payable: money(Math.max(0, listPrice.minorUnits - discount), listPrice.currency),
      refusalCode: discount > 0 ? null : 'financial.promotion.not_applicable',
    });
  });

  mock.onGet(`${ROOT}/placements/me`).reply((config) => {
    const status = config.params?.status as string | undefined;
    return ok(placements.filter((item) => !status || item.status === status));
  });

  mock.onGet(new RegExp(`${ROOT}/placements/[A-Za-z]+/[^/]+$`)).reply((config) => {
    const match = /placements\/([A-Za-z]+)\/([^/?]+)/.exec(config.url ?? '');
    if (!match) return ok([]);

    const [, subjectType, subjectId] = match;
    return ok(
      placements.filter(
        (item) => item.subjectType === subjectType && item.subjectId === subjectId
      )
    );
  });

  mock.onDelete(new RegExp(`${ROOT}/placements/[^/]+$`)).reply((config) => {
    const id = /placements\/([^/?]+)/.exec(config.url ?? '')?.[1];
    const placement = placements.find((item) => item.placementId === id);

    if (!placement) {
      return problem(404, 'financial.placement.not_found', 'That promotion could not be found.');
    }
    if (!placement.isActive && placement.status !== 'Scheduled') {
      return problem(409, 'financial.placement.not_active', 'That promotion is not running.');
    }

    placement.status = 'Cancelled';
    placement.isActive = false;
    placement.endsAt = nowIso();
    return ok(placement);
  });

  // ── Subscriptions ────────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/subscriptions/plans`).reply(() => ok(MOCK_PLANS));

  mock.onGet(`${ROOT}/subscriptions/me`).reply(() => ok(subscription));

  mock.onPost(`${ROOT}/subscriptions`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    const plan = MOCK_PLANS.find((item) => item.code === body.planCode);
    if (!plan) return problem(404, 'financial.plan.not_found', 'That plan could not be found.');

    if (subscription && subscription.status !== 'Cancelled' && subscription.status !== 'Expired') {
      return problem(
        409,
        'financial.subscription.already_active',
        'You already have an active plan.'
      );
    }

    // A trial is refused to a returning subscriber — otherwise the trial is a
    // recurring discount rather than a trial.
    const withTrial = body.withTrial !== false && plan.trialDays > 0 && !hasHeldPlanBefore(plan.code);

    subscription = {
      subscriptionId: newId('sub'),
      planCode: plan.code,
      tier: plan.tier,
      status: withTrial ? 'Trial' : 'Active',
      interval: plan.interval,
      grantsAccess: true,
      entitlements: plan.entitlements,
      currentPeriodStart: nowIso(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      trialEndsAt: withTrial
        ? new Date(Date.now() + plan.trialDays * 86400000).toISOString()
        : null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      renewalCount: 0,
    };

    heldPlans.add(plan.code);
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, subscription);

    return ok(subscription);
  });

  const heldPlans = new Set<string>([MOCK_SUBSCRIPTION.planCode]);
  const hasHeldPlanBefore = (code: string) => heldPlans.has(code);

  mock.onPost(new RegExp(`${ROOT}/subscriptions/[^/]+/cancel$`)).reply((config) => {
    const id = /subscriptions\/([^/]+)\/cancel/.exec(config.url ?? '')?.[1];

    if (!subscription || subscription.subscriptionId !== id) {
      return problem(404, 'financial.subscription.not_found', 'That subscription could not be found.');
    }

    // Cancelling stops the renewal; access continues to the end of the paid
    // period. Somebody who has paid for the month keeps the month.
    subscription = { ...subscription, cancelAtPeriodEnd: true };
    return ok(subscription);
  });

  // ── Giving ───────────────────────────────────────────────────────────────

  mock.onGet(`${ROOT}/donations/causes`).reply((config) => {
    const country = config.params?.country as string | undefined;
    const supportKind = config.params?.supportKind as string | undefined;

    return ok(
      MOCK_CAUSES.filter(
        (cause) =>
          cause.isActive &&
          (!country || !cause.countryCode || cause.countryCode === country) &&
          (!supportKind || cause.acceptedKinds.includes(supportKind))
      )
    );
  });

  mock.onPost(`${ROOT}/donations`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return problem(422, 'financial.amount.invalid', 'Enter an amount greater than zero.');
    }

    if (body.causeCode) {
      const cause = MOCK_CAUSES.find((item) => item.code === body.causeCode);
      if (!cause) return problem(404, 'financial.cause.not_found', 'That cause could not be found.');
      if (!cause.isActive) {
        return problem(422, 'financial.cause.inactive', 'That cause is no longer accepting support.');
      }
      if (!cause.acceptedKinds.includes('Monetary')) {
        return problem(
          422,
          'financial.contribution.kind_not_accepted',
          'This cause is not accepting money. See what it does need.'
        );
      }
    }

    const exponent = MOCK_CURRENCIES.find((c) => c.code === body.currency)?.exponent ?? 2;
    const amountMinor = Math.round(body.amount * 10 ** exponent);

    const payment = createPayment({
      amountMinor,
      currency: body.currency,
      methodKind: body.methodKind ?? 'Card',
      description: body.causeCode ? `Donation — ${body.causeCode}` : 'Donation',
      subjectType: null,
      subjectId: null,
    });

    const donation: Donation = {
      donationId: newId('dn'),
      // An anonymous donation stores no donor identifier at all. Not hidden
      // behind a flag — absent, which is why it cannot appear in the donor's
      // own history and why the receipt reference is their only handle on it.
      donorUserId: body.isAnonymous ? null : 'user-current',
      isAnonymous: Boolean(body.isAnonymous),
      beneficiaryType: body.beneficiaryType ?? 'Fund',
      beneficiaryId: body.beneficiaryId ?? null,
      causeCode: body.causeCode ?? null,
      amount: money(amountMinor, body.currency),
      status: 'Pending',
      message: body.message ?? null,
      receiptReference: reference('DN'),
      countryCode: body.countryCode ?? 'GB',
      payment,
      createdAt: nowIso(),
      completedAt: null,
    };

    donations = [donation, ...donations];
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, donation);

    schedulePaymentProgression(payment.paymentIntentId, declines(amountMinor) ? 'fail' : 'capture');

    schedule(() => {
      const settled = payments.find((item) => item.paymentIntentId === payment.paymentIntentId);
      donation.status = settled?.status === 'Captured' ? 'Completed' : 'Failed';
      donation.completedAt = settled?.status === 'Captured' ? nowIso() : null;
    }, CAPTURE_DELAY_MS + 500);

    return ok(donation);
  });

  mock.onGet(`${ROOT}/contributions/funds`).reply((config) => {
    const country = config.params?.country as string | undefined;
    return ok(
      MOCK_FUNDS.filter(
        (fund) => fund.isActive && (!country || !fund.countryCode || fund.countryCode === country)
      )
    );
  });

  mock.onPost(`${ROOT}/contributions`).reply((config) => {
    const body = JSON.parse(config.data ?? '{}');

    if (body.idempotencyKey && idempotency.has(body.idempotencyKey)) {
      return ok(idempotency.get(body.idempotencyKey));
    }

    const fund = MOCK_FUNDS.find((item) => item.code === body.fundCode);
    if (!fund) return problem(404, 'financial.fund.not_found', 'That fund could not be found.');
    if (!fund.isActive) return problem(422, 'financial.fund.inactive', 'That fund is closed.');
    if (!fund.acceptedKinds.includes(body.kind)) {
      return problem(
        422,
        'financial.contribution.kind_not_accepted',
        'This fund does not accept that kind of support.'
      );
    }

    // Four of the five kinds have no amount, and the refusals say which pair
    // was expected rather than silently storing a zero.
    const isMonetary = body.kind === 'Monetary';

    if (isMonetary && (typeof body.amount !== 'number' || body.amount <= 0)) {
      return problem(422, 'financial.contribution.amount_required', 'Enter an amount to give.');
    }
    if (!isMonetary && (typeof body.pledgeQuantity !== 'number' || body.pledgeQuantity <= 0)) {
      return problem(
        422,
        'financial.contribution.pledge_required',
        'Say how much you are pledging — for example, 6 hours or 3 boxes.'
      );
    }

    const exponent = MOCK_CURRENCIES.find((c) => c.code === body.currency)?.exponent ?? 2;
    const amountMinor = isMonetary ? Math.round(body.amount * 10 ** exponent) : 0;

    const payment = isMonetary
      ? createPayment({
          amountMinor,
          currency: body.currency ?? 'GBP',
          methodKind: body.methodKind ?? 'Card',
          description: `Contribution — ${fund.name}`,
        })
      : null;

    const contribution: Contribution = {
      contributionId: newId('cn'),
      fundCode: fund.code,
      contributorUserId: body.isAnonymous ? null : 'user-current',
      isAnonymous: Boolean(body.isAnonymous),
      kind: body.kind,
      // A non-monetary pledge is complete the moment it is made: there is no
      // payment to wait for, and leaving it Pending would be waiting for
      // something that is never going to happen.
      status: isMonetary ? 'Pending' : 'Completed',
      amount: isMonetary ? money(amountMinor, body.currency ?? 'GBP') : null,
      pledgeQuantity: isMonetary ? null : body.pledgeQuantity,
      pledgeUnit: isMonetary ? null : (body.pledgeUnit ?? null),
      pledgeDescription: body.pledgeDescription ?? null,
      message: body.message ?? null,
      receiptReference: reference('CN'),
      countryCode: body.countryCode ?? 'GB',
      payment,
      createdAt: nowIso(),
      completedAt: isMonetary ? null : nowIso(),
    };

    contributions = [contribution, ...contributions];
    if (body.idempotencyKey) idempotency.set(body.idempotencyKey, contribution);

    if (payment) {
      schedulePaymentProgression(payment.paymentIntentId, declines(amountMinor) ? 'fail' : 'capture');
      schedule(() => {
        const settled = payments.find((item) => item.paymentIntentId === payment.paymentIntentId);
        contribution.status = settled?.status === 'Captured' ? 'Completed' : 'Failed';
        contribution.completedAt = settled?.status === 'Captured' ? nowIso() : null;
      }, CAPTURE_DELAY_MS + 500);
    }

    return ok(contribution);
  });

  mock.onGet(`${ROOT}/giving/me`).reply((config) => {
    const take = (config.params?.take as number | undefined) ?? 25;

    // Anonymous gifts are absent by construction, not filtered out for display:
    // the server stored no donor identifier, so it cannot find them either.
    const visibleDonations = donations.filter((item) => !item.isAnonymous).slice(0, take);
    const visibleContributions = contributions.filter((item) => !item.isAnonymous).slice(0, take);

    return ok({
      donations: visibleDonations,
      contributions: visibleContributions,
      nonMonetaryContributionCount: visibleContributions.filter((item) => item.kind !== 'Monetary').length,
    });
  });

  return () => {
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
  };
}
