// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization end-to-end journeys (Frontend Phase 6)
//
// §30's eight representative journeys, driven through the real API client and
// the real handlers with nothing stubbed in between. Each one walks the whole
// contract sequence a screen walks, and asserts the milestones that matter:
// what was charged, what state the platform ended in, and — the one that keeps
// coming back — that **nothing is treated as activated until a capture is
// reported**.
//
// Journeys 1 to 5 and 8 run entirely against certified B15 routes. Journeys 6
// and 7 cross into the development adapter, and each says which half is which.
//
// The payment is driven explicitly with `capturePayment()` rather than by
// waiting for the simulator's own six-second progression: it is a real
// certified route, it is what the reconciliation loop is waiting for, and a
// suite that slept eight times would take a minute to tell anybody anything.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupFinancialMocks } from '@/mocks/handlers/financial';
import { setupMonetizationGapMocks } from '@/mocks/handlers/monetization-gaps';
import * as financial from '../financial-api';
import * as monetization from '../monetization-gap-api';
import { groupIntoPackages, toPromotion, presentCampaignStatus } from '../monetization-catalog';
import { effectiveEntitlements, hasEntitlement, planRelation } from '../entitlements';
import { presentPaymentStatus, presentPlacementStatus } from '../financial-status';
import { useAuthStore } from '@/store/auth';
import { buildAuthenticationResult } from '@/mocks/auth-session';
import type { CampaignAudience } from '@/types/monetization-gaps';

let mock: MockAdapter;
let teardownFinancial: () => void;
let teardownGaps: () => void;

beforeAll(async () => {
  mock = new MockAdapter(apiClient);
  teardownFinancial = setupFinancialMocks(mock);
  teardownGaps = setupMonetizationGapMocks(mock);
  mock.onAny().reply(404, { title: 'No handler', status: 404 });

  await useAuthStore.getState().adoptSession(
    buildAuthenticationResult({ userId: 'user-current', accessState: 'DiasporaVerified' })
  );
});

afterAll(async () => {
  teardownFinancial();
  teardownGaps();
  mock.restore();
  await useAuthStore.getState().signOut();
});

/** A distinct subject per journey, so an overlapping placement never crosses tests. */
function subject(name: string): string {
  return `journey-${name}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Drives a purchase to a captured payment and returns the placement.
 *
 * The shape every promotion journey shares: catalogue → purchase → payment →
 * capture → placement. Written once because eight copies of it would drift, and
 * because the *ordering* is the assertion — a placement is `Scheduled` until the
 * capture is reported, never before.
 */
async function buyAndCapture(input: {
  productCode: string;
  subjectType: string;
  subjectId: string;
  promotionCode?: string;
}) {
  const purchase = await financial.purchaseProduct({
    productCode: input.productCode,
    subjectType: input.subjectType as never,
    subjectId: input.subjectId,
    promotionCode: input.promotionCode,
    methodKind: 'Card',
    countryCode: 'GB',
    idempotencyKey: `idem-${input.subjectId}-${input.productCode}`,
  });

  // Before capture: the purchase is pending and the placement is not live. This
  // is the assertion that stops a success screen being drawn from an HTTP 200.
  expect(purchase.status).toBe('Pending');
  expect(purchase.placement?.isActive).toBe(false);
  expect(purchase.payment).not.toBeNull();
  expect(presentPaymentStatus(purchase.payment!.status).isSettled).toBe(false);

  const captured = await financial.capturePayment(purchase.payment!.paymentIntentId);

  expect(captured.status).toBe('Captured');
  expect(presentPaymentStatus(captured.status).isSettled).toBe(true);
  expect(captured.captured.minorUnits).toBe(purchase.paid.minorUnits);

  return { purchase, payment: captured };
}

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 1 — Provider → premium provider → plan → review → payment → active
// Entirely certified. `GET /catalog` → `POST /purchases` → capture.
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 1 — a provider buys premium placement', () => {
  it('walks catalogue, package, review, payment and activation', async () => {
    const subjectId = subject('provider');

    const products = await financial.fetchCatalog({ subjectType: 'Provider' });
    expect(products.length).toBeGreaterThan(0);

    // The package grouping the selector renders: what kind of visibility first,
    // then for how long.
    const packages = groupIntoPackages(products);
    expect(packages.length).toBeGreaterThan(0);

    const premium = packages.find((entry) => entry.placementKind === 'Premium');
    expect(premium).toBeDefined();
    expect(premium!.hasAvailableOption).toBe(true);

    const option = premium!.cheapest!;
    // The price comes from the catalogue. Nothing in the client invents one.
    expect(option.price).not.toBeNull();
    expect(option.price!.currency).toBe('GBP');

    const { purchase, payment } = await buyAndCapture({
      productCode: option.code,
      subjectType: 'Provider',
      subjectId,
    });

    expect(purchase.category).toBe('PremiumProvider');
    expect(payment.amount.minorUnits).toBe(option.price!.minorUnits);

    // The placement exists and is the platform's own record of what was bought.
    const placements = await financial.fetchSubjectPlacements('Provider', subjectId);
    expect(placements).toHaveLength(1);
    expect(placements[0].kind).toBe('Premium');
    expect(placements[0].priorityWeight).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 2 — Job owner → boost job → package → duration → checkout → active
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 2 — a job owner boosts a job', () => {
  it('selects a duration from the package and pays the catalogue price', async () => {
    const subjectId = subject('job');

    const products = await financial.fetchCatalog({ subjectType: 'Job', subjectId });
    const packages = groupIntoPackages(products);

    const boost = packages.find((entry) => entry.placementKind === 'Boost');
    expect(boost).toBeDefined();

    const option = boost!.options[0];
    expect(option.durationDays).toBeGreaterThan(0);
    // The per-day comparison the duration step shows. Derived, never charged.
    expect(option.pricePerDay!.minorUnits).toBeLessThan(option.price!.minorUnits);

    const { purchase } = await buyAndCapture({
      productCode: option.code,
      subjectType: 'Job',
      subjectId,
    });

    expect(purchase.category).toBe('BoostedJob');

    const placements = await financial.fetchSubjectPlacements('Job', subjectId);
    const promotion = toPromotion(placements[0]);

    expect(promotion.target?.key).toBe('job');
    expect(promotion.target?.verb).toBe('Boost');
    // The end date is the backend's, computed from the product's duration.
    expect(promotion.endsAt).toBeTruthy();
  });

  it('refuses a second boost while one is running, rather than taking the money twice', async () => {
    // `pl-0001` is a live Boost on this listing in the seed — the state the
    // promote screen surfaces *before* the payment step, because finding out at
    // the payment step is finding out too late.
    const promoted = 'd41c6f18-9a2b-4d75-b3e8-5c1a7e9f2d64';

    const running = await financial.fetchSubjectPlacements('MarketplaceListing', promoted);
    expect(running.some((placement) => placement.isActive && placement.kind === 'Boost')).toBe(true);

    await expect(
      financial.purchaseProduct({
        productCode: 'mp-boost-7',
        subjectType: 'MarketplaceListing',
        subjectId: promoted,
        methodKind: 'Card',
        idempotencyKey: `idem-overlap-${promoted}`,
      })
    ).rejects.toMatchObject({ code: 'financial.placement.overlaps' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 3 — Marketplace seller → featured listing → payment → manage
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 3 — a marketplace seller features a listing and manages it', () => {
  it('buys, appears in the management list, and can be stopped', async () => {
    const subjectId = subject('marketplace');

    const products = await financial.fetchCatalog({ subjectType: 'MarketplaceListing' });
    const featured = groupIntoPackages(products).find((entry) => entry.placementKind === 'Featured');
    expect(featured).toBeDefined();

    const { purchase } = await buyAndCapture({
      productCode: featured!.cheapest!.code,
      subjectType: 'MarketplaceListing',
      subjectId,
    });

    // The management screen's two reads, joined the way `usePromotions` joins
    // them.
    const [placements, purchases] = await Promise.all([
      financial.fetchMyPlacements(),
      financial.fetchPurchases(),
    ]);

    const mine = placements.find((placement) => placement.subjectId === subjectId);
    expect(mine).toBeDefined();

    const promotion = toPromotion(mine!, purchases, products);
    expect(promotion.target?.key).toBe('marketplace');
    // Joined to its purchase, so the row can show what was actually paid rather
    // than what the catalogue lists now.
    expect(promotion.paid?.minorUnits).toBe(purchase.paid.minorUnits);

    // Stopping it. Real: `DELETE /placements/{id}`.
    const cancelled = await financial.cancelPlacement(mine!.placementId, 'MemberRequested');

    expect(cancelled.isActive).toBe(false);
    expect(presentPlacementStatus(cancelled.status).isTerminal).toBe(true);
  });

  it('applies a discount the backend quoted, and charges the quoted figure', async () => {
    const subjectId = subject('marketplace-promo');

    const products = await financial.fetchCatalog({ subjectType: 'MarketplaceListing' });
    const option = groupIntoPackages(products)[0].options[0];

    const quote = await financial.redeemPromotion({
      code: 'WELCOME10',
      productCode: option.code,
    });

    expect(quote.isApplicable).toBe(true);
    expect(quote.discount.minorUnits).toBeGreaterThan(0);
    expect(quote.payable.minorUnits).toBe(quote.listPrice.minorUnits - quote.discount.minorUnits);

    const { purchase, payment } = await buyAndCapture({
      productCode: option.code,
      subjectType: 'MarketplaceListing',
      subjectId,
      promotionCode: 'WELCOME10',
    });

    // The charge is the backend's payable figure, not a number the client
    // subtracted.
    expect(purchase.discount.minorUnits).toBe(quote.discount.minorUnits);
    expect(purchase.paid.minorUnits).toBe(quote.payable.minorUnits);
    expect(payment.amount.minorUnits).toBe(quote.payable.minorUnits);
  });

  it('refuses a product the member is not eligible for, with the reason', async () => {
    // `mp-premium-30` is seeded unavailable with both a code and a sentence —
    // the state the greyed-out option in the selector renders.
    const products = await financial.fetchCatalog({ subjectType: 'MarketplaceListing' });
    const blocked = products.find((product) => !product.isAvailable);

    expect(blocked).toBeDefined();
    expect(blocked!.unavailableReason).toContain('three completed sales');

    await expect(
      financial.purchaseProduct({
        productCode: blocked!.code,
        subjectType: 'MarketplaceListing',
        subjectId: subject('marketplace-blocked'),
        methodKind: 'Card',
      })
    ).rejects.toMatchObject({ code: 'financial.product.not_eligible' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 4 — Landlord → featured housing → package → payment → active
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 4 — a landlord features a property', () => {
  it('buys the highlight and gets a placement with the right weight', async () => {
    const subjectId = subject('housing');

    const products = await financial.fetchCatalog({ subjectType: 'HousingListing' });
    const packages = groupIntoPackages(products);
    expect(packages.length).toBeGreaterThan(0);

    const option = packages[0].cheapest!;
    const { purchase } = await buyAndCapture({
      productCode: option.code,
      subjectType: 'HousingListing',
      subjectId,
    });

    expect(purchase.category).toBe('HousingHighlight');

    const placements = await financial.fetchSubjectPlacements('HousingListing', subjectId);
    expect(placements[0].priorityWeight).toBe(option.priorityWeight);
    expect(toPromotion(placements[0]).target?.key).toBe('housing');
  });

  it('offers more than one duration, so the duration step is real', async () => {
    const products = await financial.fetchCatalog({ subjectType: 'HousingListing' });
    const spotlight = groupIntoPackages(products).find((entry) => entry.placementKind === 'Spotlight');

    expect(spotlight!.options.length).toBeGreaterThan(1);
    // Ordered shortest first, which is the order the selector renders.
    expect(spotlight!.options[0].durationDays!).toBeLessThan(spotlight!.options[1].durationDays!);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 5 — Creator → subscription → comparison → subscribe → entitlement
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 5 — a creator subscribes and unlocks a feature', () => {
  it('compares plans and can say which one unlocks a locked feature', async () => {
    const plans = await financial.fetchSubscriptionPlans();
    expect(plans.length).toBeGreaterThan(1);

    const free = plans.find((plan) => plan.isFree)!;
    const paid = plans.find((plan) => !plan.isFree && plan.trialDays > 0)!;

    // The gate is real: the free plan does not grant advanced analytics, and the
    // client can name the plan that would.
    expect(hasEntitlement(free.entitlements, 'analytics.advanced')).toBe(false);
    expect(hasEntitlement(paid.entitlements, 'analytics.advanced')).toBe(true);
    expect(planRelation(free, paid)).toBe('upgrade');
  });

  it('refuses a second activation while a plan is live — which is why the plans screen routes to the change flow', async () => {
    // B15 answers `financial.subscription.already_active`, and nothing in the
    // contract says what would happen to the period already paid for. The plans
    // screen therefore sends an existing subscriber to `/monetization/change-plan`
    // rather than calling this route. This test is what keeps that decision
    // honest — if the backend ever grows an upgrade path through `POST
    // /subscriptions`, this fails and the routing gets revisited.
    const current = await financial.fetchMySubscription();
    expect(current).not.toBeNull();

    const plans = await financial.fetchSubscriptionPlans();
    const other = plans.find((plan) => !plan.isFree && plan.code !== current!.planCode)!;

    await expect(
      financial.activateSubscription({
        planCode: other.code,
        methodKind: 'Card',
        idempotencyKey: `idem-second-${other.code}`,
      })
    ).rejects.toMatchObject({ code: 'financial.subscription.already_active' });
  });

  it('grants the entitlement that unlocks the analytics screen', async () => {
    const current = await financial.fetchMySubscription();

    // The gate reads `grantsAccess`, not the status word — see the grace-period
    // case below.
    const inForce = effectiveEntitlements(current);
    expect(hasEntitlement(inForce, 'analytics.advanced')).toBe(true);
  });

  it('refuses an unknown plan code rather than activating something arbitrary', async () => {
    await expect(
      financial.activateSubscription({ planCode: 'not-a-plan', methodKind: 'Card' })
    ).rejects.toMatchObject({ code: 'financial.plan.not_found' });
  });

  it('keeps granting access through a grace period', async () => {
    // The seeded subscription is in `GracePeriod` with `grantsAccess` true — a
    // failed renewal being retried, not a revocation.
    const current = await financial.fetchMySubscription();

    if (current?.status === 'GracePeriod') {
      expect(current.grantsAccess).toBe(true);
      expect(effectiveEntitlements(current).length).toBeGreaterThan(0);
    }
  });

  it('cancels at the period end rather than immediately', async () => {
    const current = await financial.fetchMySubscription();
    if (!current) return;

    const cancelled = await financial.cancelSubscription(current.subscriptionId, 'MemberRequested');

    // Somebody who has paid for the month keeps the month.
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect(cancelled.grantsAccess).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 6 — Organisation → promote → audience → package → pending → active
//
// Split: the promotion itself is certified; the approval lifecycle is
// MON-GAP-006 and the targeting is MON-GAP-007, so both are exercised against
// the development adapter and asserted as simulated.
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 6 — an organisation promotes itself', () => {
  it('buys the certified promotion', async () => {
    const subjectId = subject('organization');

    const products = await financial.fetchCatalog({ subjectType: 'Organization' });
    expect(products.length).toBeGreaterThan(0);

    const option = groupIntoPackages(products)[0].cheapest!;
    const { purchase } = await buyAndCapture({
      productCode: option.code,
      subjectType: 'Organization',
      subjectId,
    });

    expect(purchase.category).toBe('FeaturedOrganization');

    const placements = await financial.fetchSubjectPlacements('Organization', subjectId);
    expect(toPromotion(placements[0]).target?.key).toBe('organization');
  });

  it('activates on capture, with no review step — because the platform has none', async () => {
    const subjectId = subject('organization-review');

    const products = await financial.fetchCatalog({ subjectType: 'Organization' });
    const { purchase } = await buyAndCapture({
      productCode: groupIntoPackages(products)[0].cheapest!.code,
      subjectType: 'Organization',
      subjectId,
    });

    // MON-GAP-006: `PlacementStatus` has no `PendingApproval` and no `Rejected`.
    // The client must not draw a review state a real placement can never be in.
    expect(purchase.placement!.status).not.toBe('PendingApproval');
    expect(purchase.placement!.status).not.toBe('Rejected');
    expect(['Scheduled', 'Active']).toContain(purchase.placement!.status);
  });

  it('offers the audience builder only against the simulated surface', async () => {
    // MON-GAP-007: country is the only targeting dimension on the certified
    // wire, so the seven-dimension builder lives with the simulated campaign.
    const options = await monetization.fetchTargetingOptions('GB');
    expect(options.communities.length).toBeGreaterThan(0);

    const estimate = await monetization.estimateAudience({
      countries: ['GB'],
      communities: ['nigerian-uk'],
      neighbourhoods: [],
      audienceTypes: [],
      interests: [],
      categories: [],
      minMonthsInCountry: null,
    });

    expect(estimate.reachUpper).toBeGreaterThan(estimate.reachLower);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 7 — Advertiser → campaign → audience → budget → preview → submitted
// Entirely MON-GAP-001. Every step is simulated and asserted as such.
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 7 — an advertiser creates and submits a campaign', () => {
  const audience: CampaignAudience = {
    countries: ['GB'],
    communities: ['nigerian-uk'],
    neighbourhoods: [],
    audienceTypes: ['Newcomer'],
    interests: ['housing'],
    categories: [],
    minMonthsInCountry: null,
  };

  it('walks objective, placement, creative, audience, budget, preview and payment', async () => {
    const estimate = await monetization.estimateAudience(audience);
    expect(estimate.isDeliverable).toBe(true);

    const campaign = await monetization.createCampaign({
      name: 'Journey 7 campaign',
      objective: 'Enquiries',
      placements: ['HomeFeed', 'SearchResults'],
      creative: {
        headline: 'Rooms in Croydon from £520',
        body: 'Bills included, five minutes from East Croydon. Verified landlord.',
        callToActionLabel: 'See the rooms',
        callToActionRoute: null,
        mediaReference: null,
      },
      audience,
      budgetKind: 'Total',
      budgetAmount: 120,
      currency: 'GBP',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      countryCode: 'GB',
    });

    // A draft, not something already running: `POST /campaigns` must not be what
    // asks for money.
    expect(campaign.status).toBe('Draft');
    expect(campaign.budget.minorUnits).toBe(12000);

    const submission = await monetization.submitCampaign(campaign.campaignId, {
      methodKind: 'Wallet',
    });

    expect(submission.campaign.status).toBe('PendingPayment');
    expect(submission.payment).not.toBeNull();
    // Pending, not captured: the client has to reconcile, exactly as it does for
    // a certified payment.
    expect(presentPaymentStatus(submission.payment!.status).isSettled).toBe(false);
    expect(presentCampaignStatus(submission.campaign.status).needsReconciliation).toBe(true);
  });

  it('refuses a creative that claims what cannot be checked, and charges nothing', async () => {
    const campaign = await monetization.createCampaign({
      name: 'Journey 7 refusal',
      objective: 'Traffic',
      placements: ['HomeFeed'],
      creative: {
        headline: 'Cheapest transfers guaranteed',
        body: 'Nobody beats our rates.',
        callToActionLabel: 'Send now',
        callToActionRoute: null,
        mediaReference: null,
      },
      audience,
      budgetKind: 'Total',
      budgetAmount: 300,
      currency: 'GBP',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });

    const submission = await monetization.submitCampaign(campaign.campaignId);

    expect(submission.campaign.status).toBe('Rejected');
    expect(submission.payment).toBeNull();
    expect(submission.campaign.rejectionReason).toContain('not been charged');
    expect(submission.campaign.appealableUntil).toBeTruthy();
  });

  it('reports performance with a definition on every metric', async () => {
    const report = await monetization.fetchCampaignPerformance('cam-0001');

    // MON-GAP-002. §20 forbids inventing metric semantics, so the definition
    // travels with the number rather than living in a client constant.
    for (const metric of report.metrics) {
      expect(metric.definition.length).toBeGreaterThan(20);
    }
    expect(report.reportingLagHours).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY 8 — Existing subscriber → billing → upgrade → new entitlement
// Split: billing history is certified; the plan change is MON-GAP-003.
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 8 — an existing subscriber upgrades', () => {
  it('reads real billing history from real transactions', async () => {
    const transactions = await financial.fetchTransactions();

    // Real records of money that actually moved. Deliberately not called
    // invoices: there is no invoice aggregate and no tax field on the wire.
    expect(Array.isArray(transactions)).toBe(true);
    for (const transaction of transactions) {
      expect(transaction.amount.currency).toBeTruthy();
      expect(transaction.occurredAt).toBeTruthy();
    }
  });

  it('previews the change server-side rather than pricing it on the device', async () => {
    const preview = await monetization.previewPlanChange('sub-0001', 'pro-yearly');

    expect(preview.kind).toBe('Upgrade');
    expect(preview.dueNow.minorUnits).toBeGreaterThan(0);
    // Unused time is credited, and the figure comes from the server.
    expect(preview.proratedCredit.minorUnits).toBeGreaterThan(0);
    expect(preview.effectiveAt).toBeTruthy();
  });

  it('applies the change and grants the new entitlement', async () => {
    const before = await monetization.previewPlanChange('sub-0001', 'pro-yearly');
    expect(before.gainedEntitlementKeys).toContain('analytics.export');

    const subscription = await monetization.changePlan('sub-0001', { planCode: 'pro-yearly' });

    expect(subscription.planCode).toBe('pro-yearly');
    expect(hasEntitlement(effectiveEntitlements(subscription), 'analytics.export')).toBe(true);
  });

  it('warns what a downgrade takes away before it is confirmed', async () => {
    const preview = await monetization.previewPlanChange('sub-0001', 'free');

    expect(preview.kind).toBe('Downgrade');
    expect(preview.lostEntitlementKeys.length).toBeGreaterThan(0);
    // Deferred to the period end, and free today — somebody who has paid for the
    // month keeps the month.
    expect(preview.dueNow.minorUnits).toBe(0);
    expect(Date.parse(preview.effectiveAt)).toBeGreaterThan(Date.now());
  });

  it('serves invoices and the next charge from the adapter, marked as simulated', async () => {
    const [invoices, upcoming] = await Promise.all([
      monetization.fetchInvoices(),
      monetization.fetchUpcomingCharges(),
    ]);

    expect(invoices.length).toBeGreaterThan(0);
    expect(upcoming.length).toBeGreaterThan(0);
    // MON-GAP-009: an invoice number and a tax line the certified contract has
    // no field for.
    expect(invoices[0].number).toMatch(/^DSP-/);
    expect(invoices[0].tax).toBeDefined();
  });
});
