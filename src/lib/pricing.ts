// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Pricing (Frontend Phase 6)
//
// §7: no monetary figure is written into a screen. Every price the monetization
// surface renders comes through here, and everything here comes from a backend
// response — `MonetizationProduct.price`, `SubscriptionPlan.price`,
// `PromotionQuote.payable`, `MonetizationPurchase.paid`.
//
// The module's job is to answer one question honestly in all of its states:
// *what will this cost?* There are six answers and only one of them is a number:
//
//   `free`         The plan is free. Not "£0.00" — a price of zero and a free
//                  plan read differently, and B15 distinguishes them with
//                  `SubscriptionPlan.isFree`.
//   `available`    A price is known. Render it.
//   `at-checkout`  `price` is null because a pricing policy decides at purchase
//                  time. B15 documents this state; it is not missing data.
//   `loading`      The catalogue has not answered yet.
//   `unavailable`  The catalogue answered and this cannot be bought. There is a
//                  reason and it is shown.
//   `error`        The catalogue could not be read at all.
//
// A screen that renders "—" for four of those has told the member nothing. A
// screen that renders "£0.00" for any of them has told them something false.
//
// **Nothing here computes a payable amount.** A discount is displayed from the
// backend's own `PromotionQuote`, never applied by subtraction on the device;
// the one arithmetic operation in this file is the per-period comparison figure,
// which is a display aid and is never sent anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { describeMoney, formatMoney, fromMinorUnits } from './money';
import { periodsPerYear } from './entitlements';
import type { BillingCycleView } from '@/types/monetization';
import type { BillingInterval, Money, PromotionQuote, SubscriptionPlan } from '@/types/financial';

export type PriceState =
  | 'free'
  | 'available'
  | 'at-checkout'
  | 'loading'
  | 'unavailable'
  | 'error';

/**
 * A price, ready to render.
 *
 * `formatted` is what goes on screen; `spoken` is what a screen reader says.
 * They differ deliberately — §32 forbids conveying anything through presentation
 * alone, and `formatMoney` uses U+2212 for a minus sign, which some engines skip
 * entirely and turn a credit into a debit for anybody who cannot see the colour.
 */
export interface PriceView {
  state: PriceState;
  /** The list price before any discount. Null unless `state` is `available`. */
  original: Money | null;
  /** What will actually be charged. Equal to `original` when nothing is off. */
  effective: Money | null;
  /** What comes off, from the backend's quote. Null when nothing does. */
  discount: Money | null;
  /** "Code SPRING25 applied", "Plus member discount". Null when there is no discount. */
  discountLabel: string | null;
  /** The rendered price, or the sentence that stands in for one. */
  formatted: string;
  /** The struck-through original, when a discount applies. Null otherwise. */
  formattedOriginal: string | null;
  /** A full sentence for a screen reader. Never relies on the strike-through. */
  spoken: string;
  /** "Price is set at checkout", "First 14 days free". Null when there is nothing to add. */
  note: string | null;
  /** Whether a member can act on this. False for loading, unavailable and error. */
  isActionable: boolean;
}

export interface PricingContextValue {
  /** BCP-47. Drives grouping and the decimal separator. */
  locale: string | undefined;
  /**
   * Whether the deployment converts currencies. False everywhere today —
   * `FinancialCapabilities.currencyConversionEnabled` — so a price in another
   * currency is shown in that currency with its ISO code rather than converted.
   */
  conversionEnabled: boolean;
  /** The currency the member's own wallet is in, when they have one. */
  preferredCurrency: string | null;
}

const DEFAULT_CONTEXT: PricingContextValue = {
  locale: undefined,
  conversionEnabled: false,
  preferredCurrency: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Building a price view
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvePriceInput {
  /** The list price from the catalogue. Null means the policy prices it at checkout. */
  price?: Money | null;
  /** The backend's quote, when a promotion code has been applied. */
  quote?: PromotionQuote | null;
  /** True while the catalogue is in flight. */
  isLoading?: boolean;
  /** True when the catalogue read failed. */
  isError?: boolean;
  /** False when the product cannot be bought right now. */
  isAvailable?: boolean;
  /** The backend's sentence explaining why not. */
  unavailableReason?: string | null;
  /** For a plan: `isFree` distinguishes "free" from "costs zero". */
  isFree?: boolean;
  /** Appended to `formatted` — "/month", "for 7 days". */
  suffix?: string | null;
  /** Extra sentence. A trial, a renewal note. */
  note?: string | null;
}

/**
 * The one entry point. Every price on the monetization surface goes through it.
 *
 * The ordering of the checks is the ordering of what a member most needs to
 * know: an error before a loading state, an explicit refusal before a price, and
 * a discount only once there is something to discount.
 */
export function resolvePrice(
  input: ResolvePriceInput,
  context: PricingContextValue = DEFAULT_CONTEXT
): PriceView {
  const { locale } = context;
  const suffix = input.suffix ? ` ${input.suffix}` : '';

  if (input.isError) {
    return {
      state: 'error',
      original: null,
      effective: null,
      discount: null,
      discountLabel: null,
      formatted: 'Price unavailable',
      formattedOriginal: null,
      spoken: 'The price could not be loaded. Try again.',
      note: input.note ?? null,
      isActionable: false,
    };
  }

  if (input.isLoading) {
    return {
      state: 'loading',
      original: null,
      effective: null,
      discount: null,
      discountLabel: null,
      formatted: 'Loading…',
      formattedOriginal: null,
      spoken: 'Loading the price.',
      note: null,
      isActionable: false,
    };
  }

  if (input.isAvailable === false) {
    return {
      state: 'unavailable',
      original: input.price ?? null,
      effective: null,
      discount: null,
      discountLabel: null,
      formatted: 'Not available',
      formattedOriginal: null,
      spoken: input.unavailableReason ?? 'This is not available to buy at the moment.',
      note: input.unavailableReason ?? null,
      isActionable: false,
    };
  }

  if (input.isFree) {
    return {
      state: 'free',
      original: null,
      effective: null,
      discount: null,
      discountLabel: null,
      formatted: 'Free',
      formattedOriginal: null,
      spoken: 'Free. There is nothing to pay.',
      note: input.note ?? null,
      isActionable: true,
    };
  }

  // B15 serves a null price when a pricing policy decides the figure for this
  // particular request. That is a documented state, not missing data, and
  // saying so is better than a spinner that never resolves.
  if (!input.price) {
    return {
      state: 'at-checkout',
      original: null,
      effective: null,
      discount: null,
      discountLabel: null,
      formatted: 'Price at checkout',
      formattedOriginal: null,
      spoken: 'The price for this is worked out at checkout.',
      note: input.note ?? 'The exact price is confirmed before you pay.',
      isActionable: true,
    };
  }

  // The discount comes from the backend's quote and the payable figure with it.
  // Nothing here subtracts one Money from another to arrive at a price.
  const quoteApplies = Boolean(input.quote?.isApplicable);
  const discount = quoteApplies ? input.quote!.discount : null;
  const effective = quoteApplies ? input.quote!.payable : input.price;
  const original = input.price;

  const hasDiscount = Boolean(discount && discount.minorUnits > 0);

  return {
    state: 'available',
    original,
    effective,
    discount: hasDiscount ? discount : null,
    discountLabel: hasDiscount && input.quote ? `Code ${input.quote.code} applied` : null,
    formatted: `${formatMoney(effective, { locale })}${suffix}`,
    formattedOriginal: hasDiscount ? formatMoney(original, { locale }) : null,
    spoken: hasDiscount
      ? `${describeMoney(effective, { locale })}${suffix}, reduced from ${describeMoney(original, { locale })}.`
      : `${describeMoney(effective, { locale })}${suffix}.`,
    note: input.note ?? null,
    isActionable: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing cycles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A billing interval in words.
 *
 * B15's `BillingInterval` is an open string, so an unrecognised value renders
 * from the value itself — lower-cased and used as both phrase and unit — rather
 * than falling back to "monthly" and telling somebody on a new interval the
 * wrong thing about their own money.
 */
export function describeBillingCycle(interval: BillingInterval): BillingCycleView {
  switch (interval) {
    case 'Monthly':
      return { interval, phrase: 'every month', unit: 'month', periodsPerYear: 12 };
    case 'Quarterly':
      return { interval, phrase: 'every three months', unit: 'quarter', periodsPerYear: 4 };
    case 'Yearly':
      return { interval, phrase: 'every year', unit: 'year', periodsPerYear: 1 };
    case 'Lifetime':
      return { interval, phrase: 'once', unit: 'lifetime', periodsPerYear: null };
    default: {
      const word = String(interval).toLowerCase();
      return { interval, phrase: word, unit: word, periodsPerYear: periodsPerYear(String(interval)) };
    }
  }
}

/**
 * A yearly plan's price expressed per month, so it can be compared with a
 * monthly one.
 *
 * Integer division on `minorUnits`, truncated — the same reason and the same
 * direction as `derivePricePerDay`. A comparison aid, never a charge: nobody is
 * ever billed this figure, and the screen that shows it says "about".
 */
export function pricePerMonth(plan: SubscriptionPlan): Money | null {
  const periods = periodsPerYear(plan.interval);
  if (periods === null || periods <= 0) return null;
  if (plan.isFree) return null;

  const monthly = Math.trunc((plan.price.minorUnits * periods) / 12);
  return fromMinorUnits(monthly, plan.price.currency, plan.price.exponent, plan.price.symbol);
}

/**
 * What a plan saves against paying monthly for the same tier, as a ratio.
 *
 * Returns null unless both plans are in the same currency and both intervals are
 * annualisable — the platform never converts, and a saving computed across a
 * conversion would be a saving nobody can verify.
 */
export function annualSaving(
  plan: SubscriptionPlan,
  monthlyEquivalent: SubscriptionPlan | null | undefined
): number | null {
  if (!monthlyEquivalent) return null;
  if (plan.price.currency !== monthlyEquivalent.price.currency) return null;

  const planPeriods = periodsPerYear(plan.interval);
  const monthlyPeriods = periodsPerYear(monthlyEquivalent.interval);
  if (planPeriods === null || monthlyPeriods === null) return null;

  const planYear = plan.price.minorUnits * planPeriods;
  const monthlyYear = monthlyEquivalent.price.minorUnits * monthlyPeriods;
  if (monthlyYear <= 0 || planYear >= monthlyYear) return null;

  return (monthlyYear - planYear) / monthlyYear;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trials
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a trial offer says.
 *
 * Both halves are stated: what is free, and what happens when it stops. §32
 * requires a clear confirmation before a financial action, and "start free
 * trial" without the second half is the pattern that produces the charge nobody
 * expected.
 */
export function describeTrial(
  plan: SubscriptionPlan,
  context: PricingContextValue = DEFAULT_CONTEXT
): { headline: string; afterwards: string } | null {
  if (plan.trialDays <= 0) return null;

  const cycle = describeBillingCycle(plan.interval);
  const price = formatMoney(plan.price, { locale: context.locale });

  return {
    headline: `${plan.trialDays} days free`,
    afterwards: `Then ${price} ${cycle.phrase}. Cancel any time before it ends and you pay nothing.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a price is in a currency the member cannot pay from their wallet.
 *
 * The platform never converts, so this is a real constraint rather than a
 * nicety: a GBP wallet cannot fund a EUR purchase, and the payment sheet's
 * method picker will already have refused. Surfacing it at the price keeps
 * somebody from choosing a package they cannot buy.
 */
export function isForeignCurrency(
  price: Money | null | undefined,
  context: PricingContextValue
): boolean {
  if (!price || !context.preferredCurrency) return false;
  return price.currency !== context.preferredCurrency.toUpperCase();
}

/** The note that goes with a foreign-currency price. Null when there is none. */
export function foreignCurrencyNote(
  price: Money | null | undefined,
  context: PricingContextValue
): string | null {
  if (!isForeignCurrency(price, context)) return null;
  return context.conversionEnabled
    ? `Charged in ${price!.currency}.`
    : `Charged in ${price!.currency}. Diaspora does not convert currencies, so your ${context.preferredCurrency} wallet cannot pay for this.`;
}
