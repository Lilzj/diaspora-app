// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Entitlement tests (Frontend Phase 6)
//
// §11's abstraction is the single place a premium capability is decided, so it
// is the single place a mistake locks somebody out of something they paid for.
// These tests concentrate on the cases that do exactly that:
//
//   * A subscription in its grace period still grants access.
//   * A cancelled subscription grants access until the paid period ends.
//   * An unparsable limit is *unknown*, not unlimited.
//   * A member who cannot subscribe is never shown an upgrade path.
//   * A trial is not offered to somebody the backend would refuse.
// ─────────────────────────────────────────────────────────────────────────────

import {
  annualisedMinorUnits,
  buildPlanComparison,
  canStartTrial,
  cheapestPlanGranting,
  decideEntitlement,
  describeEntitlement,
  describeEntitlementValue,
  effectiveEntitlements,
  entitlementValue,
  gainedEntitlements,
  getUsageLimit,
  hasEntitlement,
  isFeatureAvailable,
  lostEntitlements,
  parseLimitValue,
  planRelation,
  requiresUpgrade,
} from '../entitlements';
import { fromMinorUnits } from '../money';
import type { Entitlement, Subscription, SubscriptionPlan } from '@/types/financial';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');

function plan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  return {
    planId: 'plan-1',
    code: 'plus',
    name: 'Plus',
    description: 'More reach.',
    tier: 'Premium',
    interval: 'Monthly',
    price: gbp(499),
    isFree: false,
    trialDays: 14,
    audienceType: 'Member',
    countryCode: null,
    entitlements: [
      { key: 'listings.concurrent', value: '15' },
      { key: 'analytics.advanced', value: null },
    ],
    sortOrder: 20,
    ...overrides,
  };
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    subscriptionId: 'sub-1',
    planCode: 'plus',
    tier: 'Premium',
    status: 'Active',
    interval: 'Monthly',
    grantsAccess: true,
    entitlements: [
      { key: 'listings.concurrent', value: '15' },
      { key: 'analytics.advanced', value: null },
    ],
    currentPeriodStart: '2026-07-01T00:00:00Z',
    currentPeriodEnd: '2026-08-01T00:00:00Z',
    trialEndsAt: null,
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    renewalCount: 2,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('reading an entitlement set', () => {
  const set: Entitlement[] = [
    { key: 'analytics.advanced', value: null },
    { key: 'listings.concurrent', value: '15' },
  ];

  it('finds a key that is present', () => {
    expect(hasEntitlement(set, 'analytics.advanced')).toBe(true);
    expect(isFeatureAvailable(set, 'listings.concurrent')).toBe(true);
  });

  it('does not find one that is absent', () => {
    expect(hasEntitlement(set, 'analytics.export')).toBe(false);
  });

  it('is case-insensitive, because a casing change must not silently revoke access', () => {
    expect(hasEntitlement(set, 'Analytics.Advanced')).toBe(true);
    expect(hasEntitlement(set, '  listings.concurrent  ')).toBe(true);
  });

  it('treats an empty or absent set as granting nothing', () => {
    expect(hasEntitlement([], 'analytics.advanced')).toBe(false);
    expect(hasEntitlement(undefined, 'analytics.advanced')).toBe(false);
    expect(hasEntitlement(null, 'analytics.advanced')).toBe(false);
  });

  it('returns the value where there is one and null where there is not', () => {
    expect(entitlementValue(set, 'listings.concurrent')).toBe('15');
    expect(entitlementValue(set, 'analytics.advanced')).toBeNull();
    expect(entitlementValue(set, 'nothing.here')).toBeNull();
  });
});

describe('which entitlements are actually in force', () => {
  it('grants nothing for a member with no subscription — the free plan is not an error', () => {
    expect(effectiveEntitlements(null)).toEqual([]);
    expect(effectiveEntitlements(undefined)).toEqual([]);
  });

  it('keeps granting through a grace period, because a retried payment is not a revocation', () => {
    const grace = subscription({
      status: 'GracePeriod',
      grantsAccess: true,
      graceEndsAt: '2026-08-05T00:00:00Z',
    });

    expect(effectiveEntitlements(grace)).toHaveLength(2);
    expect(hasEntitlement(effectiveEntitlements(grace), 'analytics.advanced')).toBe(true);
  });

  it('keeps granting after a cancellation until the paid period ends', () => {
    const cancelled = subscription({ status: 'Cancelled', cancelAtPeriodEnd: true, grantsAccess: true });
    expect(effectiveEntitlements(cancelled)).toHaveLength(2);
  });

  it('grants nothing once the backend says access has stopped', () => {
    const expired = subscription({ status: 'Expired', grantsAccess: false });
    expect(effectiveEntitlements(expired)).toEqual([]);
  });

  it('reads grantsAccess rather than the status word', () => {
    // A status this build has never seen, with access granted. The client must
    // not lock somebody out because a deployment added an enum member.
    const unknown = subscription({ status: 'PromotionalHold', grantsAccess: true });
    expect(effectiveEntitlements(unknown)).toHaveLength(2);
  });
});

describe('parsing a limit', () => {
  it('reads a plain integer', () => {
    expect(parseLimitValue('15')).toEqual({ limit: 15, isUnlimited: false });
  });

  it('recognises unlimited in the forms the catalogue uses', () => {
    expect(parseLimitValue('unlimited')).toEqual({ limit: null, isUnlimited: true });
    expect(parseLimitValue('  Unlimited ')).toEqual({ limit: null, isUnlimited: true });
  });

  it('treats a percentage as not a limit — "10%" is a discount, not a ceiling', () => {
    expect(parseLimitValue('10%')).toEqual({ limit: null, isUnlimited: false });
  });

  it('treats anything unrecognised as unknown rather than unbounded', () => {
    // The dangerous default. An unparsable value read as unlimited would be the
    // client granting itself something the backend never said.
    expect(parseLimitValue('a few')).toEqual({ limit: null, isUnlimited: false });
    expect(parseLimitValue('')).toEqual({ limit: null, isUnlimited: false });
    expect(parseLimitValue(null)).toEqual({ limit: null, isUnlimited: false });
    expect(parseLimitValue(undefined)).toEqual({ limit: null, isUnlimited: false });
  });
});

describe('usage limits', () => {
  const set: Entitlement[] = [{ key: 'listings.concurrent', value: '15' }];

  it('reports the ceiling and no consumption when no counter exists — MON-GAP-008', () => {
    const usage = getUsageLimit(set, 'listings.concurrent');

    expect(usage.limit).toBe(15);
    expect(usage.consumed).toBeNull();
    // A null ratio is what stops the meter drawing an empty bar, which would
    // read as "none used" — a claim nobody made.
    expect(usage.ratio).toBeNull();
    expect(usage.isAtLimit).toBeNull();
  });

  it('fills in the consumption when a counter is supplied', () => {
    const usage = getUsageLimit(set, 'listings.concurrent', [
      {
        key: 'listings.concurrent',
        limit: 15,
        consumed: 11,
        remaining: 4,
        periodStart: '2026-07-01T00:00:00Z',
        periodEnd: null,
        atLimitBehaviour: 'Refuse',
      },
    ]);

    expect(usage.consumed).toBe(11);
    expect(usage.ratio).toBeCloseTo(11 / 15);
    expect(usage.isAtLimit).toBe(false);
  });

  it('flags the at-limit state', () => {
    const usage = getUsageLimit(set, 'listings.concurrent', [
      {
        key: 'listings.concurrent',
        limit: 15,
        consumed: 15,
        remaining: 0,
        periodStart: '2026-07-01T00:00:00Z',
        periodEnd: null,
        atLimitBehaviour: 'Refuse',
      },
    ]);

    expect(usage.isAtLimit).toBe(true);
    expect(usage.ratio).toBe(1);
  });

  it("prefers the counter's own limit when it disagrees with the plan document", () => {
    const usage = getUsageLimit(set, 'listings.concurrent', [
      {
        key: 'listings.concurrent',
        limit: 20,
        consumed: 5,
        remaining: 15,
        periodStart: '2026-07-01T00:00:00Z',
        periodEnd: null,
        atLimitBehaviour: 'Refuse',
      },
    ]);

    expect(usage.limit).toBe(20);
  });

  it('never draws a bar past full', () => {
    const usage = getUsageLimit(set, 'listings.concurrent', [
      {
        key: 'listings.concurrent',
        limit: 15,
        consumed: 40,
        remaining: 0,
        periodStart: '2026-07-01T00:00:00Z',
        periodEnd: null,
        atLimitBehaviour: 'Overage',
      },
    ]);

    expect(usage.ratio).toBe(1);
    expect(usage.isAtLimit).toBe(true);
  });
});

describe('explaining an entitlement', () => {
  it('uses the known label where there is one', () => {
    expect(describeEntitlement('analytics.advanced').label).toBe('Advanced analytics');
  });

  it('unpacks an unknown key rather than hiding it, so a new plan needs no client release', () => {
    expect(describeEntitlement('exports.bulk_csv').label).toBe('Exports Bulk Csv');
    expect(describeEntitlement('exports.bulk_csv').description).toBeNull();
  });

  it('renders a granted-with-no-value entitlement as included', () => {
    expect(describeEntitlementValue(null)).toBe('Included');
    expect(describeEntitlementValue('')).toBe('Included');
    expect(describeEntitlementValue('unlimited')).toBe('Unlimited');
    expect(describeEntitlementValue('15')).toBe('15');
  });
});

describe('deciding what to draw', () => {
  const plans = [
    plan({ code: 'free', name: 'Free', isFree: true, price: gbp(0), entitlements: [], trialDays: 0 }),
    plan({ code: 'plus', name: 'Plus', price: gbp(499) }),
    plan({
      code: 'pro',
      name: 'Pro',
      price: gbp(1499),
      entitlements: [
        { key: 'listings.concurrent', value: 'unlimited' },
        { key: 'analytics.advanced', value: null },
        { key: 'analytics.export', value: null },
      ],
    }),
  ];

  it('says yes when the member has it', () => {
    const decision = decideEntitlement({
      key: 'analytics.advanced',
      entitlements: [{ key: 'analytics.advanced', value: null }],
      plans,
    });

    expect(decision.isAvailable).toBe(true);
    expect(decision.requiredPlan).toBeNull();
    expect(decision.isUpgradePath).toBe(false);
  });

  it('names the cheapest plan that would grant it', () => {
    const decision = decideEntitlement({ key: 'analytics.advanced', entitlements: [], plans });

    expect(decision.isAvailable).toBe(false);
    expect(decision.requiredPlan?.code).toBe('plus');
    expect(decision.isUpgradePath).toBe(true);
    expect(decision.reason).toContain('Plus');
  });

  it('offers no upgrade path to somebody who cannot subscribe', () => {
    // The case that matters: an unverified or restricted member cannot fix this
    // by paying, and a pay button shown to them takes their money and still
    // refuses them.
    const decision = decideEntitlement({
      key: 'analytics.advanced',
      entitlements: [],
      plans,
      canSubscribe: false,
    });

    expect(decision.isAvailable).toBe(false);
    expect(decision.isUpgradePath).toBe(false);
    expect(requiresUpgrade({ key: 'analytics.advanced', entitlements: [], plans, canSubscribe: false })).toBeNull();
  });

  it('offers no upgrade path when nothing in the catalogue grants it', () => {
    const decision = decideEntitlement({ key: 'nothing.grants.this', entitlements: [], plans });

    expect(decision.requiredPlan).toBeNull();
    expect(decision.isUpgradePath).toBe(false);
  });

  it('ranks candidate plans by price, not by order in the array', () => {
    expect(cheapestPlanGranting(plans, 'analytics.advanced')?.code).toBe('plus');
    expect(cheapestPlanGranting(plans, 'analytics.export')?.code).toBe('pro');
  });

  it('does not rank across currencies, because the platform never converts', () => {
    const mixed = [
      plan({ code: 'eur', price: fromMinorUnits(100, 'EUR', 2, '€'), sortOrder: 5 }),
      plan({ code: 'gbp', price: gbp(499), sortOrder: 9 }),
    ];

    // Asked for GBP: only the GBP plan is comparable, so it wins even though the
    // EUR one has a smaller number.
    expect(cheapestPlanGranting(mixed, 'analytics.advanced', 'GBP')?.code).toBe('gbp');
    // Asked for a currency neither plan is in: falls back to the operator's own
    // ordering rather than comparing incomparable numbers.
    expect(cheapestPlanGranting(mixed, 'analytics.advanced', 'USD')?.code).toBe('eur');
  });
});

describe('comparing plans', () => {
  const free = plan({ code: 'free', isFree: true, price: gbp(0), entitlements: [{ key: 'messaging.basic', value: null }] });
  const plus = plan({ code: 'plus', price: gbp(499) });
  const pro = plan({
    code: 'pro',
    price: gbp(1499),
    entitlements: [
      { key: 'listings.concurrent', value: 'unlimited' },
      { key: 'analytics.advanced', value: null },
      { key: 'messaging.basic', value: null },
    ],
  });

  it('distinguishes "granted with no value" from "not included"', () => {
    const rows = buildPlanComparison([free, plus]);
    const analytics = rows.find((row) => row.key === 'analytics.advanced')!;

    // Present with a null value on the plan that grants it…
    expect('plus' in analytics.values).toBe(true);
    expect(analytics.values.plus).toBeNull();
    // …and absent entirely from the plan that does not. Collapsing the two would
    // put a checkmark in every cell.
    expect('free' in analytics.values).toBe(false);
  });

  it('marks a row every plan grants identically as not a differentiator', () => {
    const rows = buildPlanComparison([plus, pro]);
    const analytics = rows.find((row) => row.key === 'analytics.advanced')!;
    const listings = rows.find((row) => row.key === 'listings.concurrent')!;

    expect(analytics.isDifferentiator).toBe(false);
    // 15 against unlimited: same key, different values, so it differentiates.
    expect(listings.isDifferentiator).toBe(true);
  });

  it('puts the shared rows first and the differentiators after them', () => {
    const rows = buildPlanComparison([plus, pro]);
    const firstDifferentiator = rows.findIndex((row) => row.isDifferentiator);
    const lastShared = rows.map((row) => row.isDifferentiator).lastIndexOf(false);

    expect(lastShared).toBeLessThan(firstDifferentiator);
  });
});

describe('ranking a move between plans', () => {
  it('calls a move from no plan an upgrade', () => {
    expect(planRelation(null, plan({ price: gbp(499) }))).toBe('upgrade');
  });

  it('calls a move from no plan to a free plan neither', () => {
    expect(planRelation(null, plan({ isFree: true, price: gbp(0) }))).toBe('same');
  });

  it('normalises across intervals before comparing', () => {
    const monthly = plan({ code: 'm', interval: 'Monthly', price: gbp(499) });
    const yearly = plan({ code: 'y', interval: 'Yearly', price: gbp(4900) });

    // £4.99 × 12 = £59.88 a year against £49 a year: the yearly plan is cheaper,
    // so it is a downgrade by price even though its number is larger.
    expect(annualisedMinorUnits(monthly)).toBe(5988);
    expect(annualisedMinorUnits(yearly)).toBe(4900);
    expect(planRelation(monthly, yearly)).toBe('downgrade');
  });

  it('refuses to rank across currencies', () => {
    const gbpPlan = plan({ code: 'a', price: gbp(499) });
    const eurPlan = plan({ code: 'b', price: fromMinorUnits(499, 'EUR', 2, '€') });

    expect(planRelation(gbpPlan, eurPlan)).toBeNull();
  });

  it('refuses to annualise a lifetime plan rather than inventing a lifespan', () => {
    expect(annualisedMinorUnits(plan({ interval: 'Lifetime', price: gbp(9900) }))).toBeNull();
    expect(planRelation(plan({ price: gbp(499) }), plan({ code: 'life', interval: 'Lifetime' }))).toBeNull();
  });

  it('reports what a move gains and loses', () => {
    const from: Entitlement[] = [
      { key: 'listings.concurrent', value: '15' },
      { key: 'support.priority', value: null },
    ];
    const to: Entitlement[] = [
      { key: 'listings.concurrent', value: 'unlimited' },
      { key: 'analytics.export', value: null },
    ];

    expect(gainedEntitlements(from, to).map((entry) => entry.key)).toEqual(['analytics.export']);
    expect(lostEntitlements(from, to).map((entry) => entry.key)).toEqual(['support.priority']);
  });
});

describe('offering a trial', () => {
  it('offers one on a plan that has days and a member with no subscription', () => {
    expect(canStartTrial(plan({ trialDays: 14 }), null)).toBe(true);
  });

  it('offers nothing on a plan with no trial', () => {
    expect(canStartTrial(plan({ trialDays: 0 }), null)).toBe(false);
  });

  it('offers one for a different plan than the member currently holds', () => {
    expect(canStartTrial(plan({ code: 'pro', trialDays: 30 }), subscription({ planCode: 'plus' }))).toBe(true);
  });

  it('does not re-offer a trial the backend would refuse as already used', () => {
    // B15 answers `financial.subscription.trial_used`. Offering it anyway and
    // having it taken away at the confirmation step is worse than not offering.
    const held = subscription({ planCode: 'plus', renewalCount: 3, status: 'Active' });
    expect(canStartTrial(plan({ code: 'plus', trialDays: 14 }), held)).toBe(false);
  });

  it('still offers one to somebody currently inside their first trial of that plan', () => {
    const trialing = subscription({ planCode: 'plus', renewalCount: 0, status: 'Trial' });
    expect(canStartTrial(plan({ code: 'plus', trialDays: 14 }), trialing)).toBe(true);
  });
});
