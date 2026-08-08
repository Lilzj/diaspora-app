// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Pricing tests (Frontend Phase 6)
//
// §7: no monetary figure is written into a screen, and no price is computed on
// the device. The tests that matter are the ones that would catch a regression
// of either rule:
//
//   * Every non-numeric state produces a sentence, not a blank or a zero.
//   * A discount comes from the backend's quote and is never subtracted here.
//   * The one derived figure — a per-period comparison — is integer arithmetic
//     on minor units and is never anybody's charge.
// ─────────────────────────────────────────────────────────────────────────────

import {
  annualSaving,
  describeBillingCycle,
  describeTrial,
  foreignCurrencyNote,
  isForeignCurrency,
  pricePerMonth,
  resolvePrice,
  type PricingContextValue,
} from '../pricing';
import { fromMinorUnits } from '../money';
import type { PromotionQuote, SubscriptionPlan } from '@/types/financial';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');
const eur = (minor: number) => fromMinorUnits(minor, 'EUR', 2, '€');

const context: PricingContextValue = {
  locale: 'en-GB',
  conversionEnabled: false,
  preferredCurrency: 'GBP',
};

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
    entitlements: [],
    sortOrder: 20,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the six price states', () => {
  it('renders a known price', () => {
    const view = resolvePrice({ price: gbp(999) }, context);

    expect(view.state).toBe('available');
    expect(view.formatted).toContain('9.99');
    expect(view.effective).toEqual(gbp(999));
    expect(view.isActionable).toBe(true);
  });

  it('says "free" rather than "£0.00" for a free plan', () => {
    // A price of zero and a free plan read differently, and B15 distinguishes
    // them with `isFree`.
    const view = resolvePrice({ price: gbp(0), isFree: true }, context);

    expect(view.state).toBe('free');
    expect(view.formatted).toBe('Free');
    expect(view.isActionable).toBe(true);
  });

  it('says the price is set at checkout when the backend sends none', () => {
    // B15 serves a null price when a policy decides the figure for this request.
    // That is a documented state, not missing data.
    const view = resolvePrice({ price: null }, context);

    expect(view.state).toBe('at-checkout');
    expect(view.formatted).toBe('Price at checkout');
    expect(view.isActionable).toBe(true);
    expect(view.note).toBeTruthy();
  });

  it('renders a loading state that is not a blank', () => {
    const view = resolvePrice({ isLoading: true }, context);

    expect(view.state).toBe('loading');
    expect(view.formatted).not.toBe('');
    expect(view.isActionable).toBe(false);
  });

  it("keeps the backend's own explanation on an unavailable product", () => {
    const view = resolvePrice(
      {
        price: gbp(4999),
        isAvailable: false,
        unavailableReason: 'Premium placement is available to sellers with at least three completed sales.',
      },
      context
    );

    expect(view.state).toBe('unavailable');
    expect(view.isActionable).toBe(false);
    // Rendered verbatim: B15 writes these to be actionable and paraphrasing
    // would lose the threshold that tells somebody what to do next.
    expect(view.note).toContain('three completed sales');
    expect(view.spoken).toContain('three completed sales');
  });

  it('renders an error state rather than an empty price', () => {
    const view = resolvePrice({ isError: true }, context);

    expect(view.state).toBe('error');
    expect(view.formatted).toBe('Price unavailable');
    expect(view.isActionable).toBe(false);
  });

  it('puts the error before the loading state, because an error is the more useful answer', () => {
    const view = resolvePrice({ isError: true, isLoading: true }, context);
    expect(view.state).toBe('error');
  });

  it('puts an explicit refusal before a price', () => {
    const view = resolvePrice({ price: gbp(999), isAvailable: false }, context);
    expect(view.state).toBe('unavailable');
  });
});

describe('discounts', () => {
  const quote = (overrides: Partial<PromotionQuote> = {}): PromotionQuote => ({
    code: 'SPRING25',
    isApplicable: true,
    listPrice: gbp(2000),
    discount: gbp(500),
    payable: gbp(1500),
    refusalCode: null,
    ...overrides,
  });

  it("takes the payable figure from the backend's quote and does not subtract", () => {
    const view = resolvePrice({ price: gbp(2000), quote: quote() }, context);

    expect(view.effective).toEqual(gbp(1500));
    expect(view.original).toEqual(gbp(2000));
    expect(view.discount).toEqual(gbp(500));
    expect(view.discountLabel).toContain('SPRING25');
  });

  it('ignores a quote the backend refused rather than applying it as zero', () => {
    // A code that silently does nothing is worse than one that is refused, which
    // is why `PromotionQuoteResponse` carries a refusal code at all.
    const view = resolvePrice(
      { price: gbp(2000), quote: quote({ isApplicable: false, refusalCode: 'promotion.not_applicable' }) },
      context
    );

    expect(view.effective).toEqual(gbp(2000));
    expect(view.discount).toBeNull();
    expect(view.formattedOriginal).toBeNull();
  });

  it('does not draw a strike-through for a zero discount', () => {
    const view = resolvePrice({ price: gbp(2000), quote: quote({ discount: gbp(0), payable: gbp(2000) }) }, context);

    expect(view.discount).toBeNull();
    expect(view.formattedOriginal).toBeNull();
  });

  it('says both figures aloud, because a strike-through is invisible to a screen reader', () => {
    const view = resolvePrice({ price: gbp(2000), quote: quote() }, context);

    expect(view.spoken).toContain('reduced from');
    // The spoken form uses currency names rather than the U+2212 minus and the
    // symbol, both of which some engines skip.
    expect(view.spoken.toLowerCase()).toContain('pound');
  });
});

describe('billing cycles', () => {
  it('describes the four known intervals', () => {
    expect(describeBillingCycle('Monthly')).toMatchObject({ unit: 'month', periodsPerYear: 12 });
    expect(describeBillingCycle('Quarterly')).toMatchObject({ unit: 'quarter', periodsPerYear: 4 });
    expect(describeBillingCycle('Yearly')).toMatchObject({ unit: 'year', periodsPerYear: 1 });
    expect(describeBillingCycle('Lifetime')).toMatchObject({ unit: 'lifetime', periodsPerYear: null });
  });

  it('renders an interval this build has never seen from the value itself', () => {
    // `BillingInterval` is an open string. Falling back to "monthly" would tell
    // somebody on a new interval the wrong thing about their own money.
    const cycle = describeBillingCycle('Weekly');
    expect(cycle.unit).toBe('weekly');
    expect(cycle.phrase).toBe('weekly');
  });
});

describe('comparison figures', () => {
  it('expresses a yearly plan per month, truncated', () => {
    // £49.00 a year ÷ 12 = £4.0833…, truncated to £4.08. Never charged; the
    // screen that shows it says "about".
    const monthly = pricePerMonth(plan({ interval: 'Yearly', price: gbp(4900) }));
    expect(monthly?.minorUnits).toBe(408);
  });

  it('gives a monthly plan the same figure it already shows', () => {
    expect(pricePerMonth(plan({ interval: 'Monthly', price: gbp(499) }))?.minorUnits).toBe(499);
  });

  it('declines to express a lifetime plan per month', () => {
    expect(pricePerMonth(plan({ interval: 'Lifetime', price: gbp(9900) }))).toBeNull();
  });

  it('declines for a free plan, where the figure would be a meaningless zero', () => {
    expect(pricePerMonth(plan({ isFree: true, price: gbp(0) }))).toBeNull();
  });

  it('reports a yearly saving against the monthly equivalent', () => {
    const yearly = plan({ code: 'y', interval: 'Yearly', price: gbp(4900) });
    const monthly = plan({ code: 'm', interval: 'Monthly', price: gbp(499) });

    // £59.88 monthly against £49.00 yearly: an 18% saving.
    expect(annualSaving(yearly, monthly)).toBeCloseTo(0.1817, 3);
  });

  it('reports no saving where the yearly plan is not cheaper', () => {
    const yearly = plan({ code: 'y', interval: 'Yearly', price: gbp(9900) });
    const monthly = plan({ code: 'm', interval: 'Monthly', price: gbp(499) });

    expect(annualSaving(yearly, monthly)).toBeNull();
  });

  it('refuses to compute a saving across currencies', () => {
    const yearly = plan({ code: 'y', interval: 'Yearly', price: eur(4900) });
    const monthly = plan({ code: 'm', interval: 'Monthly', price: gbp(499) });

    expect(annualSaving(yearly, monthly)).toBeNull();
  });
});

describe('trials', () => {
  it('states what is free and what happens afterwards', () => {
    const trial = describeTrial(plan({ trialDays: 14, price: gbp(499), interval: 'Monthly' }), context);

    expect(trial?.headline).toBe('14 days free');
    // The second half is the one the pattern usually omits, and the omission is
    // what produces the charge nobody expected.
    expect(trial?.afterwards).toContain('4.99');
    expect(trial?.afterwards).toContain('every month');
    expect(trial?.afterwards.toLowerCase()).toContain('cancel');
  });

  it('offers nothing for a plan with no trial', () => {
    expect(describeTrial(plan({ trialDays: 0 }), context)).toBeNull();
  });
});

describe('foreign currency', () => {
  it('recognises a price the member cannot pay from their wallet', () => {
    expect(isForeignCurrency(eur(999), context)).toBe(true);
    expect(isForeignCurrency(gbp(999), context)).toBe(false);
  });

  it('says the platform will not convert, because it will not', () => {
    const note = foreignCurrencyNote(eur(999), context);

    expect(note).toContain('EUR');
    expect(note).toContain('does not convert');
  });

  it('says only which currency is charged where conversion is enabled', () => {
    const note = foreignCurrencyNote(eur(999), { ...context, conversionEnabled: true });

    expect(note).toContain('EUR');
    expect(note).not.toContain('does not convert');
  });

  it('says nothing when the member has no wallet to compare against', () => {
    expect(foreignCurrencyNote(eur(999), { ...context, preferredCurrency: null })).toBeNull();
  });
});
