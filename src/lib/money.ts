// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Money (Backend Phase B15)
//
// The one place this client is allowed to do arithmetic on money, and it does
// all of it on `minorUnits` — a 64-bit integer count of the currency's smallest
// unit, which is what B15's ledger actually stores. `Money.amount` is a derived
// display figure and is never an operand here.
//
// Why that matters in one line: `0.1 + 0.2 === 0.30000000000000004`, and a
// checkout that adds a £0.10 fee to a £0.20 item and shows £0.30 while sending
// £0.30000000000000004 is a checkout that eventually charges the wrong number.
//
// What this module deliberately does NOT do:
//
//   * Convert between currencies. B15 declares `IExchangeRateProvider` with no
//     implementation and returns `financial.conversion.not_supported` from any
//     surface that would need one. `add`/`subtract` refuse a currency mismatch
//     rather than guessing a rate.
//   * Compute totals the backend already owns. Wallet balances, purchase
//     discounts, refundable remainders and revenue rollups all arrive computed.
//     `sum` exists for genuinely client-side arrangements — a basket the client
//     assembled — and nothing else.
//   * Price anything. Prices come from `/catalog` and `/subscriptions/plans`.
// ─────────────────────────────────────────────────────────────────────────────

import type { CurrencyFact, Money } from '@/types/financial';

/** Thrown when two amounts in different currencies would have to be combined. */
export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: string,
    readonly right: string
  ) {
    super(`Cannot combine ${left} and ${right}. The Diaspora platform never converts currencies.`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * `Number.MAX_SAFE_INTEGER` is 9,007,199,254,740,991 — about 90 trillion pounds
 * in pence. The backend stores a signed 64-bit integer, which is wider, so a
 * value could in principle arrive that JavaScript cannot represent exactly.
 * Checking is cheap and the alternative is silent corruption of a balance.
 */
export function isSafeMinorUnits(minorUnits: number): boolean {
  return Number.isSafeInteger(minorUnits);
}

// ── Construction ─────────────────────────────────────────────────────────────

/**
 * Builds a `Money` from an exact minor-unit count. Use this, not the major-unit
 * variant, whenever the value came from the server.
 */
export function fromMinorUnits(
  minorUnits: number,
  currency: string,
  exponent: number,
  symbol?: string | null
): Money {
  const whole = Math.trunc(minorUnits);
  return {
    minorUnits: whole,
    currency: currency.toUpperCase(),
    exponent,
    amount: toMajorUnits(whole, exponent),
    symbol: symbol ?? null,
  };
}

/**
 * Builds a `Money` from a figure a person typed. Rounds half-away-from-zero at
 * the currency's exponent, which is what a member expects when they type
 * "10.005" into a field showing two decimals.
 *
 * This is the only entry point where a float becomes money, and it exists
 * because a text input produces a string. Everything downstream is integers.
 */
export function fromMajorUnits(
  amount: number,
  currency: string,
  exponent: number,
  symbol?: string | null
): Money {
  const factor = 10 ** exponent;
  // `Math.round` breaks ties toward +Infinity, which rounds -0.5 to -0 rather
  // than -1 and makes a refund a penny different from the charge it reverses.
  const scaled = amount * factor;
  const minorUnits =
    scaled < 0 ? -Math.round(Math.abs(scaled)) : Math.round(scaled);

  return fromMinorUnits(minorUnits, currency, exponent, symbol);
}

/**
 * Parses free text from an amount field. Returns null for anything that is not
 * a plain decimal number — a caller showing a validation message needs to know
 * the difference between "nothing typed" and "typed nonsense", so callers pass
 * their own empty check first.
 */
export function parseAmountInput(
  input: string,
  currency: string,
  exponent: number,
  symbol?: string | null
): Money | null {
  const cleaned = input.replace(/[\s,]/g, '');
  if (cleaned.length === 0) return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;

  return fromMajorUnits(parsed, currency, exponent, symbol);
}

/** A zero amount in the same currency and precision as `like`. */
export function zeroLike(like: Pick<Money, 'currency' | 'exponent' | 'symbol'>): Money {
  return fromMinorUnits(0, like.currency, like.exponent, like.symbol);
}

// ── Arithmetic. Integers only. ───────────────────────────────────────────────

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return fromMinorUnits(
    left.minorUnits + right.minorUnits,
    left.currency,
    left.exponent,
    left.symbol
  );
}

export function subtract(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return fromMinorUnits(
    left.minorUnits - right.minorUnits,
    left.currency,
    left.exponent,
    left.symbol
  );
}

/**
 * Adds up amounts the client itself assembled. Throws on a mixed-currency list
 * rather than returning a number that looks like a total and is not one.
 */
export function sum(amounts: Money[]): Money | null {
  if (amounts.length === 0) return null;
  return amounts.reduce((running, next) => add(running, next));
}

export function negate(value: Money): Money {
  return fromMinorUnits(-value.minorUnits, value.currency, value.exponent, value.symbol);
}

export function absolute(value: Money): Money {
  return fromMinorUnits(Math.abs(value.minorUnits), value.currency, value.exponent, value.symbol);
}

export function isZero(value: Money): boolean {
  return value.minorUnits === 0;
}

export function isNegative(value: Money): boolean {
  return value.minorUnits < 0;
}

export function isPositive(value: Money): boolean {
  return value.minorUnits > 0;
}

/** -1, 0 or 1. Throws on a currency mismatch — an ordering across currencies is meaningless. */
export function compare(left: Money, right: Money): number {
  assertSameCurrency(left, right);
  if (left.minorUnits < right.minorUnits) return -1;
  if (left.minorUnits > right.minorUnits) return 1;
  return 0;
}

export function isGreaterThan(left: Money, right: Money): boolean {
  return compare(left, right) > 0;
}

export function isLessThan(left: Money, right: Money): boolean {
  return compare(left, right) < 0;
}

export function equals(left: Money, right: Money): boolean {
  return left.currency === right.currency && left.minorUnits === right.minorUnits;
}

// ── Conversion between representations ───────────────────────────────────────

/**
 * Minor units as a major-unit number. Exact for every value inside
 * `Number.MAX_SAFE_INTEGER`, because the division is by a power of ten applied
 * once rather than accumulated.
 */
export function toMajorUnits(minorUnits: number, exponent: number): number {
  if (exponent === 0) return minorUnits;
  return minorUnits / 10 ** exponent;
}

/**
 * The value to put in a request body. B15's request DTOs take **major units** —
 * `CreatePaymentIntentRequest.Amount` is a `decimal` — so this is the one place
 * the client hands back a non-integer, and it does so from the exact integer
 * rather than from a float it has been carrying around.
 */
export function toRequestAmount(value: Money): number {
  return toMajorUnits(value.minorUnits, value.exponent);
}

// ── Formatting ───────────────────────────────────────────────────────────────

export interface FormatMoneyOptions {
  /**
   * Show the ISO code instead of the symbol. Used where two currencies can
   * appear in one list and "£" against "$" is less clear than "GBP"/"USD".
   */
  showCode?: boolean;
  /** Force a leading `+` on positive values. Statements use it; balances do not. */
  signed?: boolean;
  /** Render `1,250.00` as `1.25K`. Off by default: a balance is never abbreviated. */
  compact?: boolean;
  /** BCP-47 tag. Defaults to the device locale. */
  locale?: string;
}

/**
 * Formats an amount for display.
 *
 * The symbol comes from the server (`Money.symbol`, sourced from the currency
 * catalogue) rather than a table in this file. `JobCard.tsx:75` hard-codes two
 * currencies and prints the raw code for every other one; that table would have
 * been copied into every card in this phase and the copies would have drifted.
 *
 * `Intl.NumberFormat` does the digit grouping and the decimal separator, so a
 * French-locale device sees `1 250,00 €` and a British one `£1,250.00` from the
 * same `Money`. Grouping is a presentation choice; the value is unchanged.
 */
export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
  const { showCode = false, signed = false, compact = false, locale } = options;

  const magnitude = Math.abs(toMajorUnits(value.minorUnits, value.exponent));
  const negative = value.minorUnits < 0;

  const digits = compact && magnitude >= 1000 ? undefined : value.exponent;

  let body: string;
  try {
    body = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits ?? 1,
      notation: compact && magnitude >= 1000 ? 'compact' : 'standard',
    }).format(magnitude);
  } catch {
    // Hermes ships a trimmed ICU on some Android builds. A balance must render
    // even where `Intl` refuses, so fall back to a fixed-point string.
    body = magnitude.toFixed(value.exponent);
  }

  const unit = showCode || !value.symbol ? `${value.currency} ` : value.symbol;
  const sign = negative ? '−' : signed ? '+' : '';

  return `${sign}${unit}${body}`;
}

/**
 * What a screen reader says. `formatMoney` produces "£1,250.00", which VoiceOver
 * and TalkBack render acceptably but not reliably across locales — and the
 * minus sign above is U+2212, which some engines skip entirely, turning a debit
 * into a credit for anybody who cannot see the row's colour.
 *
 * Section 28 of the phase brief is explicit that no status may be communicated
 * through colour alone. This is the amount half of that rule.
 */
export function describeMoney(value: Money, options: { locale?: string } = {}): string {
  const magnitude = Math.abs(toMajorUnits(value.minorUnits, value.exponent));
  const negative = value.minorUnits < 0;

  let body: string;
  try {
    body = new Intl.NumberFormat(options.locale, {
      style: 'currency',
      currency: value.currency,
      currencyDisplay: 'name',
      minimumFractionDigits: value.exponent,
      maximumFractionDigits: value.exponent,
    }).format(magnitude);
  } catch {
    body = `${magnitude.toFixed(value.exponent)} ${value.currency}`;
  }

  return negative ? `minus ${body}` : body;
}

/**
 * The placeholder a text input shows — `0.00` for GBP, `0` for JPY, `0.000` for
 * KWD. Reading it off the currency's exponent means an amount field is correct
 * in a currency nobody on the team has tested.
 */
export function amountPlaceholder(exponent: number): string {
  return exponent === 0 ? '0' : `0.${'0'.repeat(exponent)}`;
}

// ── Currency catalogue helpers ───────────────────────────────────────────────

/**
 * Resolves a currency's exponent and symbol from `GET /financial/currencies`.
 * Falls back to two minor digits and no symbol, which is right for the large
 * majority of ISO 4217 and visibly wrong (the code prints instead of a symbol)
 * for the rest — an honest fallback rather than a confident one.
 */
export function resolveCurrency(
  code: string,
  catalogue: CurrencyFact[] | undefined
): { exponent: number; symbol: string | null } {
  const normalised = code.toUpperCase();
  const found = catalogue?.find((entry) => entry.code === normalised);
  return { exponent: found?.exponent ?? 2, symbol: found?.symbol ?? null };
}

/** Builds a `Money` for a currency whose facts come from the catalogue. */
export function moneyFromMajor(
  amount: number,
  code: string,
  catalogue: CurrencyFact[] | undefined
): Money {
  const { exponent, symbol } = resolveCurrency(code, catalogue);
  return fromMajorUnits(amount, code, exponent, symbol);
}

// ── Percentages, for display only ────────────────────────────────────────────

/**
 * How far a fundraising total has come, 0–1. Returns null when the target is
 * zero or absent, because a progress bar with no target is a bar with no
 * meaning — and `raised / 0` is `Infinity`, which renders as a full bar.
 */
export function progressRatio(raised: Money | null | undefined, target: Money | null | undefined): number | null {
  if (!raised || !target || target.minorUnits <= 0) return null;
  if (raised.currency !== target.currency) return null;
  return Math.min(1, Math.max(0, raised.minorUnits / target.minorUnits));
}
