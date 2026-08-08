// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Financial API integration tests (Frontend Phase 5)
//
// The real API client, against the real mock handlers, over the real axios
// adapter. Nothing is stubbed between `fetchWallets()` and the JSON the handler
// returns, so these tests exercise:
//
//   * the route strings, exactly as `Diaspora.Modules.Financial/Api/*.cs` maps
//     them
//   * the `{ data, meta }` envelope being unwrapped
//   * RFC 9457 problem documents becoming `FinancialError`s with their codes
//   * cursor paging over the ledger
//   * idempotent replay returning the original rather than a second record
//
// A route typo here is a runtime 404 in production. This is where it is caught.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupFinancialMocks } from '@/mocks/handlers/financial';
import { FinancialError } from '../financial-errors';
import * as api from '../financial-api';
import { useAuthStore } from '@/store/auth';

let mock: MockAdapter;
let teardownMocks: () => void;

beforeAll(() => {
  // No `delayResponse`: these assert contract shape, not timing.
  mock = new MockAdapter(apiClient);
  teardownMocks = setupFinancialMocks(mock);
  mock.onAny().reply(404, { title: 'No handler', status: 404 });

  useAuthStore.getState().login(
    { userId: 'user-current', fullName: 'Test Member', role: 'Member', accountState: 'DiasporaVerified' },
    'test-token'
  );
});

afterAll(() => {
  // The simulated gateway schedules capture six seconds out. Cancelling those
  // timers stops one test's payment settling in the middle of another, and
  // stops the worker hanging after the last assertion.
  teardownMocks();
  mock.restore();
  useAuthStore.getState().logout();
});

describe('deployment capabilities', () => {
  it('reports what this deployment can actually do', async () => {
    const capabilities = await api.fetchCapabilities();

    expect(capabilities.gateways).toContain('Simulator');
    // Both false everywhere today, per B15. A client that assumed otherwise
    // would offer a withdrawal the platform cannot perform.
    expect(capabilities.payoutsEnabled).toBe(false);
    expect(capabilities.currencyConversionEnabled).toBe(false);
    expect(capabilities.supportedMethods.length).toBeGreaterThan(0);
  });

  it('serves the currency catalogue with exponents', async () => {
    const currencies = await api.fetchCurrencies();

    expect(currencies.find((c) => c.code === 'GBP')?.exponent).toBe(2);
    expect(currencies.find((c) => c.code === 'JPY')?.exponent).toBe(0);
    expect(currencies.find((c) => c.code === 'KWD')?.exponent).toBe(3);
  });
});

describe('wallet', () => {
  it('returns every wallet the caller holds', async () => {
    const wallets = await api.fetchWallets();

    expect(wallets.length).toBeGreaterThan(0);
    expect(wallets[0]).toMatchObject({
      walletType: expect.any(String),
      status: expect.any(String),
      currency: 'GBP',
    });
  });

  it('serves all five balances, not one', async () => {
    const [wallet] = await api.fetchWallets();

    for (const field of ['available', 'pending', 'reserved', 'lifetimeCredits', 'lifetimeDebits'] as const) {
      expect(wallet[field]).toMatchObject({
        amount: expect.any(Number),
        minorUnits: expect.any(Number),
        currency: expect.any(String),
        exponent: expect.any(Number),
      });
    }
  });

  it('narrows to one currency', async () => {
    const wallets = await api.fetchWallets('GBP');
    expect(wallets.every((wallet) => wallet.currency === 'GBP')).toBe(true);
  });

  it('answers 404 for a wallet the caller does not hold', async () => {
    // A 403 would confirm the wallet exists. The backend answers 404 so an
    // identifier cannot be used to probe.
    await expect(api.fetchLedger('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      kind: 'notFound',
      code: 'financial.wallet.not_found',
    });
  });
});

describe('ledger paging', () => {
  it('pages by sequence and hands back a cursor', async () => {
    const [wallet] = await api.fetchWallets();

    const first = await api.fetchLedger(wallet.walletId, { pageSize: 5 });
    expect(first.entries).toHaveLength(5);
    expect(first.hasMore).toBe(true);
    expect(typeof first.nextCursor).toBe('number');

    const second = await api.fetchLedger(wallet.walletId, {
      pageSize: 5,
      afterSequence: first.nextCursor!,
    });

    // Strictly older, and no overlap: the cursor is exclusive.
    const firstSequences = first.entries.map((entry) => entry.sequence);
    const secondSequences = second.entries.map((entry) => entry.sequence);
    expect(Math.max(...secondSequences)).toBeLessThan(Math.min(...firstSequences));
  });

  it('orders newest first', async () => {
    const [wallet] = await api.fetchWallets();
    const page = await api.fetchLedger(wallet.walletId, { pageSize: 10 });

    const sequences = page.entries.map((entry) => entry.sequence);
    expect(sequences).toEqual([...sequences].sort((left, right) => right - left));
  });

  it('carries a stored balanceAfter on every entry', async () => {
    const [wallet] = await api.fetchWallets();
    const page = await api.fetchLedger(wallet.walletId, { pageSize: 5 });

    for (const entry of page.entries) {
      expect(entry.balanceAfter).toMatchObject({ minorUnits: expect.any(Number) });
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(['Debit', 'Credit']).toContain(entry.direction);
    }
  });

  it('filters by entry type', async () => {
    const [wallet] = await api.fetchWallets();
    const page = await api.fetchLedger(wallet.walletId, { entryType: 'Refund' });

    expect(page.entries.every((entry) => entry.entryType === 'Refund')).toBe(true);
  });
});

describe('transactions', () => {
  it('returns the caller history', async () => {
    const transactions = await api.fetchTransactions();
    expect(transactions.length).toBeGreaterThan(0);
  });

  it('filters by type', async () => {
    const refunds = await api.fetchTransactions({ type: 'Refund' });
    expect(refunds.every((item) => item.transactionType === 'Refund')).toBe(true);
  });

  it('includes a failed transaction, so the UI has one to render', async () => {
    const transactions = await api.fetchTransactions();
    expect(transactions.some((item) => item.status === 'Failed')).toBe(true);
  });
});

describe('payment lifecycle', () => {
  it('starts a payment as Pending — never captured on creation', async () => {
    const payment = await api.createPaymentIntent({
      amount: 12.5,
      currency: 'GBP',
      methodKind: 'Card',
      description: 'Test payment',
      idempotencyKey: 'test-key-lifecycle-1',
    });

    // The whole §22 rule in one assertion: a 200 on create is not a payment.
    expect(payment.status).toBe('Pending');
    expect(payment.captured.minorUnits).toBe(0);
    expect(payment.amount.minorUnits).toBe(1250);
  });

  it('returns the original payment when the same idempotency key is replayed', async () => {
    const key = 'test-key-replay-1';
    const request = {
      amount: 20,
      currency: 'GBP',
      methodKind: 'Card' as const,
      description: 'Replay test',
      idempotencyKey: key,
    };

    const first = await api.createPaymentIntent(request);
    const second = await api.createPaymentIntent(request);

    // One payment, not two. This is what makes a member's retry safe.
    expect(second.paymentIntentId).toBe(first.paymentIntentId);
  });

  it('refuses a zero amount with the specific code', async () => {
    await expect(
      api.createPaymentIntent({
        amount: 0, currency: 'GBP', methodKind: 'Card', description: 'Nothing',
      })
    ).rejects.toMatchObject({ code: 'financial.amount.invalid', kind: 'validation' });
  });

  it('refuses an unsupported payment method', async () => {
    await expect(
      api.createPaymentIntent({
        amount: 10, currency: 'GBP', methodKind: 'ManualTransfer', description: 'x',
      })
    ).rejects.toMatchObject({ code: 'financial.payment.method_unsupported' });
  });

  it('authorises then captures, and only capture moves money', async () => {
    const created = await api.createPaymentIntent({
      amount: 30, currency: 'GBP', methodKind: 'Card', description: 'Capture test',
      idempotencyKey: 'test-key-capture-1',
    });

    const authorized = await api.authorizePayment(created.paymentIntentId);
    expect(authorized.status).toBe('Authorized');
    expect(authorized.captured.minorUnits).toBe(0);

    const captured = await api.capturePayment(created.paymentIntentId);
    expect(captured.status).toBe('Captured');
    expect(captured.captured.minorUnits).toBe(3000);
    expect(captured.refundableRemaining.minorUnits).toBe(3000);
  });

  it('refuses a second authorise as an invalid transition', async () => {
    const created = await api.createPaymentIntent({
      amount: 15, currency: 'GBP', methodKind: 'Card', description: 'Transition test',
      idempotencyKey: 'test-key-transition-1',
    });

    await api.authorizePayment(created.paymentIntentId);

    await expect(api.authorizePayment(created.paymentIntentId)).rejects.toMatchObject({
      code: 'financial.payment.transition_invalid',
      kind: 'conflict',
    });
  });

  it('refuses to cancel a captured payment', async () => {
    const created = await api.createPaymentIntent({
      amount: 18, currency: 'GBP', methodKind: 'Card', description: 'Cancel test',
      idempotencyKey: 'test-key-cancel-1',
    });
    await api.capturePayment(created.paymentIntentId);

    await expect(api.cancelPayment(created.paymentIntentId)).rejects.toMatchObject({
      code: 'financial.payment.transition_invalid',
    });
  });

  it('answers 404 for an unknown payment', async () => {
    await expect(api.fetchPaymentIntent('pi-does-not-exist')).rejects.toMatchObject({
      kind: 'notFound',
      code: 'financial.payment.not_found',
    });
  });

  it('serves a partially refunded payment with a non-zero remainder', async () => {
    const payment = await api.fetchPaymentIntent('pi-partial-0003');

    expect(payment.refunded.minorUnits).toBeGreaterThan(0);
    expect(payment.refundableRemaining.minorUnits).toBeGreaterThan(0);
    expect(payment.refunds).toHaveLength(1);
    expect(payment.refunds[0].status).toBe('Succeeded');
  });

  it('refuses a member-initiated refund with 403 — refunds are staff-only', async () => {
    // GAP-05. The member-facing refund UI is read-only because of this.
    await expect(
      api.issueRefund('pi-partial-0003', { reason: 'RequestedByPayer' })
    ).rejects.toMatchObject({ kind: 'forbidden', code: 'financial.forbidden' });
  });
});

describe('catalogue and purchases', () => {
  it('filters the catalogue by subject type', async () => {
    const products = await api.fetchCatalog({ subjectType: 'MarketplaceListing' });

    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.subjectType === 'MarketplaceListing')).toBe(true);
  });

  it('serves an unavailable product with a reason rather than hiding it', async () => {
    const products = await api.fetchCatalog({ subjectType: 'MarketplaceListing' });
    const unavailable = products.find((product) => !product.isAvailable);

    expect(unavailable).toBeDefined();
    expect(unavailable!.unavailableReason).toBeTruthy();
    expect(unavailable!.unavailableReasonCode).toBeTruthy();
  });

  it('creates a placement Scheduled, not Active — activation waits for capture', async () => {
    const purchase = await api.purchaseProduct({
      productCode: 'mp-boost-7',
      subjectType: 'MarketplaceListing',
      subjectId: 'listing-under-test-1',
      idempotencyKey: 'test-key-purchase-1',
    });

    expect(purchase.status).toBe('Pending');
    expect(purchase.placement?.status).toBe('Scheduled');
    expect(purchase.placement?.isActive).toBe(false);
    expect(purchase.payment?.status).toBe('Pending');
  });

  it('refuses to buy an ineligible product', async () => {
    await expect(
      api.purchaseProduct({
        productCode: 'mp-premium-30',
        subjectType: 'MarketplaceListing',
        subjectId: 'listing-under-test-2',
      })
    ).rejects.toMatchObject({ code: 'financial.product.not_eligible' });
  });

  it('refuses a product that does not match the subject', async () => {
    await expect(
      api.purchaseProduct({
        productCode: 'mp-boost-7',
        subjectType: 'Event',
        subjectId: 'event-1',
      })
    ).rejects.toMatchObject({ code: 'financial.product.subject_mismatch' });
  });

  it('refuses an overlapping placement', async () => {
    // pl-0001 is an active Boost on this listing in the seed.
    await expect(
      api.purchaseProduct({
        productCode: 'mp-boost-7',
        subjectType: 'MarketplaceListing',
        subjectId: 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64',
      })
    ).rejects.toMatchObject({ code: 'financial.placement.overlaps', kind: 'conflict' });
  });

  it('answers whether a subject is paid for', async () => {
    const placements = await api.fetchSubjectPlacements(
      'MarketplaceListing',
      'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64'
    );

    expect(placements.some((placement) => placement.isActive)).toBe(true);
  });
});

describe('promotions', () => {
  it('quotes an applicable code with a discount', async () => {
    const quote = await api.redeemPromotion({ code: 'WELCOME10', productCode: 'mp-boost-7' });

    expect(quote.isApplicable).toBe(true);
    expect(quote.discount.minorUnits).toBeGreaterThan(0);
    // The payable figure comes from the server, not from list minus discount.
    expect(quote.payable.minorUnits).toBe(quote.listPrice.minorUnits - quote.discount.minorUnits);
  });

  it('refuses an unknown code by name rather than silently doing nothing', async () => {
    await expect(api.redeemPromotion({ code: 'NOPE' })).rejects.toMatchObject({
      code: 'financial.promotion.not_found',
    });
  });

  it('distinguishes expired from exhausted', async () => {
    await expect(api.redeemPromotion({ code: 'EXPIRED2024' })).rejects.toMatchObject({
      code: 'financial.promotion.expired',
    });
    await expect(api.redeemPromotion({ code: 'USEDUP' })).rejects.toMatchObject({
      code: 'financial.promotion.exhausted',
    });
  });
});

describe('subscriptions', () => {
  it('serves plans with entitlements rather than feature blurbs', async () => {
    const plans = await api.fetchSubscriptionPlans();

    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(Array.isArray(plan.entitlements)).toBe(true);
      expect(plan.price).toMatchObject({ minorUnits: expect.any(Number) });
    }
  });

  it('serves the current subscription, grace period and all', async () => {
    const subscription = await api.fetchMySubscription();

    expect(subscription).not.toBeNull();
    expect(subscription!.status).toBe('GracePeriod');
    // The state that is easy to get wrong: not reassuring, but access continues.
    expect(subscription!.grantsAccess).toBe(true);
  });

  it('refuses a second subscription while one is active', async () => {
    await expect(api.activateSubscription({ planCode: 'pro-yearly' })).rejects.toMatchObject({
      code: 'financial.subscription.already_active',
    });
  });

  it('cancels at period end rather than immediately', async () => {
    const current = await api.fetchMySubscription();
    const cancelled = await api.cancelSubscription(current!.subscriptionId);

    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    // Somebody who has paid for the month keeps the month.
    expect(cancelled.grantsAccess).toBe(true);
  });
});

describe('giving', () => {
  it('serves causes, most of which take more than money', async () => {
    const causes = await api.fetchDonationCauses();

    expect(causes.length).toBeGreaterThan(0);
    expect(causes.some((cause) => !cause.acceptedKinds.includes('Monetary'))).toBe(true);
  });

  it('filters causes by support kind', async () => {
    const volunteering = await api.fetchDonationCauses({ supportKind: 'VolunteerService' });
    expect(volunteering.every((cause) => cause.acceptedKinds.includes('VolunteerService'))).toBe(true);
  });

  it('refuses money to a cause that does not take it', async () => {
    await expect(
      api.createDonation({
        amount: 10, currency: 'GBP', causeCode: 'winter-clothing-drive',
      })
    ).rejects.toMatchObject({ code: 'financial.contribution.kind_not_accepted' });
  });

  it('creates a donation Pending with a receipt reference', async () => {
    const donation = await api.createDonation({
      amount: 25,
      currency: 'GBP',
      causeCode: 'student-bursary-fund',
      idempotencyKey: 'test-key-donation-1',
    });

    expect(donation.status).toBe('Pending');
    expect(donation.receiptReference).toMatch(/^DN-/);
    expect(donation.payment?.status).toBe('Pending');
  });

  it('stores no donor identifier on an anonymous donation', async () => {
    const donation = await api.createDonation({
      amount: 5,
      currency: 'GBP',
      causeCode: 'student-bursary-fund',
      isAnonymous: true,
      idempotencyKey: 'test-key-donation-anon-1',
    });

    // Absent, not hidden behind a flag — which is why it cannot appear in the
    // donor's own history afterwards.
    expect(donation.donorUserId).toBeNull();
    expect(donation.isAnonymous).toBe(true);
  });

  it('completes a non-monetary contribution immediately, with no payment', async () => {
    const contribution = await api.createContribution({
      fundCode: 'winter-support',
      kind: 'VolunteerService',
      pledgeQuantity: 6,
      pledgeUnit: 'hours',
      idempotencyKey: 'test-key-pledge-1',
    });

    expect(contribution.status).toBe('Completed');
    expect(contribution.payment).toBeNull();
    expect(contribution.amount).toBeNull();
    expect(contribution.pledgeQuantity).toBe(6);
  });

  it('refuses a monetary contribution with no amount', async () => {
    await expect(
      api.createContribution({ fundCode: 'winter-support', kind: 'Monetary' })
    ).rejects.toMatchObject({ code: 'financial.contribution.amount_required' });
  });

  it('refuses a pledge with no quantity', async () => {
    await expect(
      api.createContribution({ fundCode: 'winter-support', kind: 'Goods' })
    ).rejects.toMatchObject({ code: 'financial.contribution.pledge_required' });
  });

  it('refuses a kind the fund does not accept', async () => {
    await expect(
      api.createContribution({
        fundCode: 'skills-mentoring', kind: 'Goods', pledgeQuantity: 3, pledgeUnit: 'boxes',
      })
    ).rejects.toMatchObject({ code: 'financial.contribution.kind_not_accepted' });
  });

  it('omits anonymous gifts from the giving history', async () => {
    const history = await api.fetchGivingHistory();

    expect(history.donations.every((donation) => !donation.isAnonymous)).toBe(true);
    expect(typeof history.nonMonetaryContributionCount).toBe('number');
  });
});

describe('error translation', () => {
  it('turns every refusal into a FinancialError with its code intact', async () => {
    await expect(api.fetchPaymentIntent('nope')).rejects.toBeInstanceOf(FinancialError);
  });

  it('classifies a mutation refusal as determinate — the server answered', async () => {
    try {
      await api.createPaymentIntent({
        amount: -5, currency: 'GBP', methodKind: 'Card', description: 'x',
      });
      throw new Error('should have refused');
    } catch (cause) {
      const error = cause as FinancialError;
      expect(error.isIndeterminate).toBe(false);
    }
  });
});
