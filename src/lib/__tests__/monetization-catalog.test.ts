// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Catalogue arrangement tests (Frontend Phase 6)
//
// The transformation between what B15 serves — a flat `MonetizationProduct[]`
// and a flat `Placement[]` — and what the UI renders. Pure functions, so these
// are the cheapest tests in the phase and the ones that catch the most.
//
// The cases chosen are the ones where the arrangement could quietly lie: a
// package whose cheapest option is unavailable, a promotion whose purchase is
// missing, a countdown that says zero, and a campaign status this build has
// never seen.
// ─────────────────────────────────────────────────────────────────────────────

import {
  daysUntil,
  derivePricePerDay,
  describePlacementKind,
  filterPromotions,
  groupIntoPackages,
  isCampaignEditable,
  isCampaignRunnable,
  presentCampaignStatus,
  promotionBucket,
  toPromotion,
  toPromotions,
} from '../monetization-catalog';
import { fromMinorUnits } from '../money';
import { targetForKey, targetForSubjectType } from '@/types/monetization';
import type { MonetizationProduct, MonetizationPurchase, Placement } from '@/types/financial';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');

function product(overrides: Partial<MonetizationProduct> = {}): MonetizationProduct {
  return {
    productId: 'prod-1',
    code: 'mp-boost-7',
    name: 'Boost for 7 days',
    description: 'Higher search priority.',
    category: 'BoostedListing',
    subjectType: 'MarketplaceListing',
    status: 'Active',
    price: gbp(999),
    durationDays: 7,
    placementKind: 'Boost',
    priorityWeight: 1.6,
    isRenewable: true,
    isAvailable: true,
    unavailableReasonCode: null,
    unavailableReason: null,
    sortOrder: 10,
    ...overrides,
  };
}

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    placementId: 'pl-1',
    subjectType: 'MarketplaceListing',
    subjectId: 'listing-1',
    kind: 'Boost',
    status: 'Active',
    isActive: true,
    priorityWeight: 1.6,
    productCode: 'mp-boost-7',
    countryCode: 'GB',
    policyVersion: null,
    startsAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('per-day price', () => {
  it('divides in minor units and truncates', () => {
    // 999 ÷ 7 = 142.71…, truncated to 142p. Understating is the safe direction
    // for a figure labelled "about" and never charged.
    expect(derivePricePerDay(gbp(999), 7)?.minorUnits).toBe(142);
  });

  it('is exact for a clean division', () => {
    expect(derivePricePerDay(gbp(2800), 14)?.minorUnits).toBe(200);
  });

  it('gives nothing when either operand is missing', () => {
    expect(derivePricePerDay(null, 7)).toBeNull();
    expect(derivePricePerDay(gbp(999), null)).toBeNull();
    expect(derivePricePerDay(gbp(999), 0)).toBeNull();
  });

  it('refuses a negative price rather than producing a negative rate', () => {
    expect(derivePricePerDay(gbp(-999), 7)).toBeNull();
  });
});

describe('grouping a catalogue into packages', () => {
  const products = [
    product({ code: 'mp-boost-7', durationDays: 7, price: gbp(999), sortOrder: 10 }),
    product({ code: 'mp-boost-30', durationDays: 30, price: gbp(2999), sortOrder: 11 }),
    product({
      code: 'mp-feature-14',
      name: 'Feature for 14 days',
      category: 'FeaturedListing',
      placementKind: 'Featured',
      durationDays: 14,
      price: gbp(2499),
      priorityWeight: 2,
      sortOrder: 20,
    }),
  ];

  it('groups by placement kind, so somebody chooses what before how long', () => {
    const packages = groupIntoPackages(products);

    expect(packages).toHaveLength(2);
    expect(packages[0].id).toBe('Boost');
    expect(packages[0].options).toHaveLength(2);
    expect(packages[1].id).toBe('Featured');
  });

  it("keeps the operator's own ordering rather than imposing the client's", () => {
    const packages = groupIntoPackages(products);
    // Boost's lowest sortOrder is 10, Featured's is 20.
    expect(packages.map((entry) => entry.id)).toEqual(['Boost', 'Featured']);
  });

  it('orders options by duration', () => {
    const packages = groupIntoPackages(products);
    expect(packages[0].options.map((option) => option.durationDays)).toEqual([7, 30]);
  });

  it('names the package after the placement kind, not the shortest product', () => {
    // "Boost", not "Boost for 7 days" — the duration is the next step, not part
    // of the package's identity.
    expect(groupIntoPackages(products)[0].name).toBe('Boost');
  });

  it('reports the cheapest *available* option, not simply the cheapest', () => {
    const packages = groupIntoPackages([
      product({ code: 'cheap', price: gbp(500), durationDays: 7, isAvailable: false }),
      product({ code: 'dear', price: gbp(2000), durationDays: 30 }),
    ]);

    expect(packages[0].cheapest?.code).toBe('dear');
    expect(packages[0].hasAvailableOption).toBe(true);
  });

  it('marks a package with nothing available, rather than hiding it', () => {
    // B15 sends `unavailableReason` so a member sees a greyed-out option with an
    // explanation instead of one that has silently vanished.
    const packages = groupIntoPackages([
      product({
        isAvailable: false,
        unavailableReason: 'Available to sellers with at least three completed sales.',
      }),
    ]);

    expect(packages[0].hasAvailableOption).toBe(false);
    expect(packages[0].cheapest).toBeNull();
    expect(packages[0].options[0].unavailableReason).toContain('three completed sales');
  });

  it('reports the best visibility the package offers', () => {
    const packages = groupIntoPackages([
      product({ code: 'a', priorityWeight: 1.6 }),
      product({ code: 'b', priorityWeight: 2.4, durationDays: 30 }),
    ]);

    expect(packages[0].bestPriorityWeight).toBe(2.4);
  });

  it('falls back to the category for a product with no placement kind', () => {
    const packages = groupIntoPackages([product({ placementKind: null, category: 'CreditBundle' })]);
    expect(packages[0].id).toBe('CreditBundle');
  });

  it('handles an empty catalogue without throwing', () => {
    expect(groupIntoPackages([])).toEqual([]);
  });

  it('carries the per-day figure onto every priced option', () => {
    const packages = groupIntoPackages(products);
    expect(packages[0].options[0].pricePerDay?.minorUnits).toBe(142);
  });
});

describe('describing where a promotion appears', () => {
  it('explains each of the six certified placement kinds', () => {
    for (const kind of ['Featured', 'Bump', 'Spotlight', 'CategoryHighlight', 'Boost', 'Premium'] as const) {
      const described = describePlacementKind(kind);
      expect(described.label.length).toBeGreaterThan(0);
      expect(described.where.length).toBeGreaterThan(0);
      expect(described.icon.length).toBeGreaterThan(0);
    }
  });

  it('falls back rather than throwing on a kind this build has never seen', () => {
    const described = describePlacementKind('SuperFeatured' as never);
    expect(described.label).toBe('Promotion');
    expect(described.where.length).toBeGreaterThan(0);
  });
});

describe('joining placements to purchases', () => {
  const purchase: MonetizationPurchase = {
    purchaseId: 'pur-1',
    productCode: 'mp-boost-7',
    category: 'BoostedListing',
    status: 'Completed',
    subjectType: 'MarketplaceListing',
    subjectId: 'listing-1',
    listPrice: gbp(999),
    discount: gbp(0),
    paid: gbp(999),
    promotionCode: null,
    policyVersion: null,
    paymentIntentId: 'pi-1',
    placement: placement(),
    payment: null,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  it('matches by placement id when the purchase carries one', () => {
    const promotion = toPromotion(placement(), [purchase]);
    expect(promotion.purchase?.purchaseId).toBe('pur-1');
    expect(promotion.paid).toEqual(gbp(999));
  });

  it('matches by product and subject when it does not', () => {
    const promotion = toPromotion(placement(), [{ ...purchase, placement: null }]);
    expect(promotion.purchase?.purchaseId).toBe('pur-1');
  });

  it('renders without a price rather than borrowing one from the catalogue', () => {
    // The catalogue price is what a product costs *now*; it may not be what was
    // charged after a discount, and showing it as "paid" would be a wrong figure
    // on a financial record.
    const promotion = toPromotion(placement(), []);

    expect(promotion.purchase).toBeNull();
    expect(promotion.paid).toBeNull();
  });

  it('resolves the frontend target from the wire subject type', () => {
    const promotion = toPromotion(placement({ subjectType: 'HousingListing' }));
    expect(promotion.target?.key).toBe('housing');
    expect(promotion.target?.verb).toBe('Feature');
  });

  it('leaves the target null for a subject type this build has no screen for', () => {
    const promotion = toPromotion(placement({ subjectType: 'Community' }));
    expect(promotion.target).toBeNull();
  });

  it('defaults renewability to true when the catalogue is not loaded', () => {
    // Absent from the catalogue means unknown, not un-renewable: offering a
    // renewal the purchase step can still refuse beats hiding one that works.
    expect(toPromotion(placement(), [], []).isRenewable).toBe(true);
  });

  it('reads renewability from the catalogue when it is', () => {
    const promotion = toPromotion(placement(), [], [product({ isRenewable: false })]);
    expect(promotion.isRenewable).toBe(false);
  });
});

describe('countdowns', () => {
  const now = Date.parse('2026-08-07T12:00:00Z');

  it('counts whole days to a future date', () => {
    expect(daysUntil('2026-08-10T12:00:00Z', now)).toBe(3);
  });

  it('returns a negative for a date already past, rather than clamping', () => {
    // "−2" and "0" mean different things on an expiry screen.
    expect(daysUntil('2026-08-05T12:00:00Z', now)).toBe(-2);
  });

  it('gives nothing for an absent or unparsable date', () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil(undefined, now)).toBeNull();
    expect(daysUntil('not a date', now)).toBeNull();
  });

  it('flags a promotion inside the expiry window', () => {
    const promotion = toPromotion(
      placement({ endsAt: '2026-08-09T12:00:00Z' }),
      [],
      [],
      now
    );

    expect(promotion.daysRemaining).toBe(2);
    expect(promotion.isExpiringSoon).toBe(true);
  });

  it('does not flag one comfortably in the future', () => {
    const promotion = toPromotion(placement({ endsAt: '2026-08-20T12:00:00Z' }), [], [], now);

    expect(promotion.daysRemaining).toBe(13);
    expect(promotion.isExpiringSoon).toBe(false);
  });

  it('does not flag an inactive placement, however close its end date', () => {
    const promotion = toPromotion(
      placement({ isActive: false, status: 'Cancelled', endsAt: '2026-08-08T12:00:00Z' }),
      [],
      [],
      now
    );

    expect(promotion.isExpiringSoon).toBe(false);
  });

  it('leaves the countdown null on an open-ended placement', () => {
    const promotion = toPromotion(placement({ endsAt: null }), [], [], now);

    expect(promotion.daysRemaining).toBeNull();
    expect(promotion.isExpiringSoon).toBe(false);
  });
});

describe('bucketing promotions', () => {
  const active = placement({ placementId: 'a', isActive: true, status: 'Active' });
  const scheduled = placement({
    placementId: 's',
    isActive: false,
    status: 'Scheduled',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const expired = placement({ placementId: 'e', isActive: false, status: 'Expired' });
  const cancelled = placement({ placementId: 'c', isActive: false, status: 'Cancelled' });

  const promotions = toPromotions([active, scheduled, expired, cancelled]);

  it('puts each placement in exactly one bucket', () => {
    expect(promotionBucket(promotions.find((entry) => entry.placementId === 'a')!)).toBe('active');
    expect(promotionBucket(promotions.find((entry) => entry.placementId === 's')!)).toBe('scheduled');
    expect(promotionBucket(promotions.find((entry) => entry.placementId === 'e')!)).toBe('ended');
    // Cancelled, Expired and Refunded all read as "finished" to a member.
    expect(promotionBucket(promotions.find((entry) => entry.placementId === 'c')!)).toBe('ended');
  });

  it('filters to a bucket', () => {
    expect(filterPromotions(promotions, 'active')).toHaveLength(1);
    expect(filterPromotions(promotions, 'ended')).toHaveLength(2);
    expect(filterPromotions(promotions, 'all')).toHaveLength(4);
  });

  it('sorts newest first', () => {
    const ordered = toPromotions([
      placement({ placementId: 'old', startsAt: '2026-01-01T00:00:00Z' }),
      placement({ placementId: 'new', startsAt: '2026-08-01T00:00:00Z' }),
    ]);

    expect(ordered[0].placementId).toBe('new');
  });
});

describe('campaign status presentation', () => {
  it('gives every declared status a label, an icon and a full sentence', () => {
    const statuses = [
      'Draft',
      'PendingPayment',
      'Submitted',
      'UnderReview',
      'Approved',
      'Scheduled',
      'Active',
      'Paused',
      'Completed',
      'Rejected',
      'Cancelled',
      'Failed',
    ] as const;

    for (const status of statuses) {
      const presented = presentCampaignStatus(status);

      expect(presented.label.length).toBeGreaterThan(0);
      expect(presented.icon.length).toBeGreaterThan(0);
      // §32 forbids conveying a state through colour alone, and the badge's own
      // label is two words — so the description has to be a sentence.
      expect(presented.description.length).toBeGreaterThan(presented.label.length);
    }
  });

  it('keeps polling on a status this build has never seen', () => {
    // A deployment ahead of the app. Rendering it as in-progress and continuing
    // to reconcile is the correct degradation.
    const presented = presentCampaignStatus('AwaitingCreativeReview');

    expect(presented.isTerminal).toBe(false);
    expect(presented.needsReconciliation).toBe(true);
  });

  it('marks the terminal states terminal', () => {
    expect(presentCampaignStatus('Completed').isTerminal).toBe(true);
    expect(presentCampaignStatus('Rejected').isTerminal).toBe(true);
    expect(presentCampaignStatus('Cancelled').isTerminal).toBe(true);
    expect(presentCampaignStatus('Failed').isTerminal).toBe(true);
    expect(presentCampaignStatus('Active').isTerminal).toBe(false);
  });

  it('does not call a rejection settled — no money changed hands', () => {
    expect(presentCampaignStatus('Rejected').isSettled).toBe(false);
    expect(presentCampaignStatus('Active').isSettled).toBe(true);
  });

  it('allows editing only a draft or a refused campaign', () => {
    expect(isCampaignEditable('Draft')).toBe(true);
    expect(isCampaignEditable('Rejected')).toBe(true);
    expect(isCampaignEditable('Active')).toBe(false);
    expect(isCampaignEditable('Completed')).toBe(false);
  });

  it('allows pause and resume only on something that runs', () => {
    expect(isCampaignRunnable('Active')).toBe(true);
    expect(isCampaignRunnable('Paused')).toBe(true);
    expect(isCampaignRunnable('Scheduled')).toBe(true);
    expect(isCampaignRunnable('Draft')).toBe(false);
    expect(isCampaignRunnable('Completed')).toBe(false);
  });
});

describe('promotion targets', () => {
  it('resolves all eight from their route key', () => {
    for (const key of [
      'provider',
      'job',
      'housing',
      'marketplace',
      'guide',
      'update',
      'event',
      'organization',
    ]) {
      expect(targetForKey(key)).not.toBeNull();
    }
  });

  it('resolves all eight from the wire subject type', () => {
    for (const subjectType of [
      'Provider',
      'Job',
      'HousingListing',
      'MarketplaceListing',
      'Guide',
      'Update',
      'Event',
      'Organization',
    ]) {
      expect(targetForSubjectType(subjectType)).not.toBeNull();
    }
  });

  it('returns null rather than guessing for an unknown subject', () => {
    expect(targetForSubjectType('Spaceship')).toBeNull();
    expect(targetForKey(undefined)).toBeNull();
    expect(targetForSubjectType(null)).toBeNull();
  });

  it('maps each target to a distinct wire subject type', () => {
    const keys = ['provider', 'job', 'housing', 'marketplace', 'guide', 'update', 'event', 'organization'];
    const wire = keys.map((key) => targetForKey(key)!.subjectType);

    expect(new Set(wire).size).toBe(keys.length);
  });
});
