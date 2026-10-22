// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Money tests (Frontend Phase 5)
//
// The tests that matter most in this phase. Every other financial bug shows up
// as a wrong screen; a money bug shows up as a wrong number that somebody acts
// on.
//
// Three properties are asserted rather than sampled:
//
//   * arithmetic never touches a float
//   * a currency mismatch refuses rather than converts
//   * an exponent other than 2 is handled correctly, because JPY and KWD exist
//     and nobody on the team will notice by hand-testing in GBP
// ─────────────────────────────────────────────────────────────────────────────

import {
  CurrencyMismatchError,
  absolute,
  add,
  amountPlaceholder,
  compare,
  describeMoney,
  equals,
  formatMoney,
  fromMajorUnits,
  fromMinorUnits,
  isNegative,
  isSafeMinorUnits,
  isZero,
  moneyFromMajor,
  negate,
  parseAmountInput,
  pointsPerMajorUnit,
  progressRatio,
  resolveCurrency,
  subtract,
  sum,
  toMajorUnits,
  toRequestAmount,
  zeroLike,
} from '../money';
import type { CurrencyFact } from '@/types/financial';

const CATALOGUE: CurrencyFact[] = [
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', exponent: 2, isActive: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', exponent: 0, isActive: true },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', exponent: 3, isActive: true },
];

const gbp = (minorUnits: number) => fromMinorUnits(minorUnits, 'GBP', 2, '£');
const jpy = (minorUnits: number) => fromMinorUnits(minorUnits, 'JPY', 0, '¥');

describe('construction', () => {
  it('derives the display amount from exact minor units', () => {
    expect(gbp(14750).amount).toBe(147.5);
    expect(gbp(14750).minorUnits).toBe(14750);
  });

  it('handles a zero-exponent currency without inventing decimals', () => {
    expect(jpy(1500).amount).toBe(1500);
    expect(jpy(1500).exponent).toBe(0);
  });

  it('handles a three-exponent currency', () => {
    const dinar = fromMinorUnits(1234, 'KWD', 3, 'KD');
    expect(dinar.amount).toBeCloseTo(1.234, 5);
  });

  it('upper-cases the currency code', () => {
    expect(fromMinorUnits(100, 'gbp', 2).currency).toBe('GBP');
  });

  it('truncates a fractional minor-unit count rather than storing it', () => {
    // Minor units are integers by definition. A fractional one is a bug
    // upstream, and carrying it would put a fraction of a penny on a ledger.
    expect(fromMinorUnits(100.7, 'GBP', 2).minorUnits).toBe(100);
  });
});

describe('fromMajorUnits', () => {
  it('rounds to the currency exponent', () => {
    expect(fromMajorUnits(10.005, 'GBP', 2).minorUnits).toBe(1001);
    expect(fromMajorUnits(10.004, 'GBP', 2).minorUnits).toBe(1000);
  });

  it('rounds negatives away from zero, so a refund matches the charge it reverses', () => {
    // `Math.round(-0.5)` is -0 in JavaScript, which would make a −£0.005 refund
    // £0.00 while the matching +£0.005 charge became £0.01.
    expect(fromMajorUnits(-10.005, 'GBP', 2).minorUnits).toBe(-1001);
    expect(fromMajorUnits(-0.005, 'GBP', 2).minorUnits).toBe(-1);
  });

  it('does not accumulate float error across the whole range', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004. In minor units it is 30.
    const total = add(fromMajorUnits(0.1, 'GBP', 2), fromMajorUnits(0.2, 'GBP', 2));
    expect(total.minorUnits).toBe(30);
    expect(total.amount).toBe(0.3);
  });

  it('survives a long chain of additions exactly', () => {
    let running = gbp(0);
    for (let index = 0; index < 1000; index += 1) {
      running = add(running, fromMajorUnits(0.01, 'GBP', 2));
    }
    expect(running.minorUnits).toBe(1000);
    expect(running.amount).toBe(10);
  });
});

describe('parseAmountInput', () => {
  it('parses a plain decimal', () => {
    expect(parseAmountInput('12.34', 'GBP', 2)?.minorUnits).toBe(1234);
  });

  it('ignores thousands separators and spaces', () => {
    expect(parseAmountInput('1,250.00', 'GBP', 2)?.minorUnits).toBe(125000);
    expect(parseAmountInput(' 42 ', 'GBP', 2)?.minorUnits).toBe(4200);
  });

  it('returns null for empty input', () => {
    expect(parseAmountInput('', 'GBP', 2)).toBeNull();
  });

  it('returns null for anything that is not a number', () => {
    expect(parseAmountInput('abc', 'GBP', 2)).toBeNull();
    expect(parseAmountInput('1.2.3', 'GBP', 2)).toBeNull();
    expect(parseAmountInput('£10', 'GBP', 2)).toBeNull();
  });

  it('accepts a partially typed decimal, so a field does not fight the keyboard', () => {
    expect(parseAmountInput('10.', 'GBP', 2)?.minorUnits).toBe(1000);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts on integers', () => {
    expect(add(gbp(1000), gbp(250)).minorUnits).toBe(1250);
    expect(subtract(gbp(1000), gbp(250)).minorUnits).toBe(750);
  });

  it('allows a negative result, because a balance can go negative', () => {
    expect(subtract(gbp(100), gbp(250)).minorUnits).toBe(-150);
    expect(isNegative(subtract(gbp(100), gbp(250)))).toBe(true);
  });

  it('refuses to combine two currencies', () => {
    expect(() => add(gbp(100), jpy(100))).toThrow(CurrencyMismatchError);
    expect(() => subtract(gbp(100), jpy(100))).toThrow(CurrencyMismatchError);
    expect(() => compare(gbp(100), jpy(100))).toThrow(CurrencyMismatchError);
  });

  it('names both currencies in the refusal', () => {
    expect(() => add(gbp(100), jpy(100))).toThrow(/GBP.*JPY|JPY.*GBP/);
  });

  it('sums a list and refuses a mixed one', () => {
    expect(sum([gbp(100), gbp(250), gbp(50)])?.minorUnits).toBe(400);
    expect(sum([])).toBeNull();
    expect(() => sum([gbp(100), jpy(100)])).toThrow(CurrencyMismatchError);
  });

  it('negates and takes absolutes', () => {
    expect(negate(gbp(500)).minorUnits).toBe(-500);
    expect(absolute(gbp(-500)).minorUnits).toBe(500);
  });

  it('compares within a currency', () => {
    expect(compare(gbp(100), gbp(200))).toBe(-1);
    expect(compare(gbp(200), gbp(100))).toBe(1);
    expect(compare(gbp(100), gbp(100))).toBe(0);
  });

  it('treats equality as currency plus value', () => {
    expect(equals(gbp(100), gbp(100))).toBe(true);
    expect(equals(gbp(100), fromMinorUnits(100, 'USD', 2))).toBe(false);
  });

  it('builds a zero in the same shape', () => {
    const zero = zeroLike(gbp(14750));
    expect(isZero(zero)).toBe(true);
    expect(zero.currency).toBe('GBP');
    expect(zero.exponent).toBe(2);
  });
});

describe('safety', () => {
  it('flags a value JavaScript cannot represent exactly', () => {
    expect(isSafeMinorUnits(14750)).toBe(true);
    expect(isSafeMinorUnits(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isSafeMinorUnits(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
  });
});

describe('request conversion', () => {
  it('sends major units, as every B15 request DTO expects', () => {
    expect(toRequestAmount(gbp(14750))).toBe(147.5);
    expect(toRequestAmount(jpy(1500))).toBe(1500);
  });

  it('round-trips through the request representation exactly', () => {
    const original = gbp(999);
    const returned = fromMajorUnits(toRequestAmount(original), 'GBP', 2);
    expect(returned.minorUnits).toBe(original.minorUnits);
  });

  it('converts minor to major without accumulating error', () => {
    expect(toMajorUnits(1, 2)).toBe(0.01);
    expect(toMajorUnits(999999, 2)).toBe(9999.99);
    expect(toMajorUnits(1500, 0)).toBe(1500);
  });
});

describe('formatting', () => {
  it('uses the server-supplied symbol', () => {
    expect(formatMoney(gbp(14750))).toContain('£');
    expect(formatMoney(jpy(1500))).toContain('¥');
  });

  it('falls back to the code when the catalogue has no symbol', () => {
    const obscure = fromMinorUnits(1000, 'XAF', 2, null);
    expect(formatMoney(obscure)).toContain('XAF');
  });

  it('shows the code on request, for lists that mix currencies', () => {
    expect(formatMoney(gbp(14750), { showCode: true })).toContain('GBP');
  });

  it('renders the currency exponent, not a fixed two decimals', () => {
    expect(formatMoney(jpy(1500), { locale: 'en-GB' })).toBe('¥1,500');
    expect(formatMoney(gbp(14750), { locale: 'en-GB' })).toBe('£147.50');
  });

  it('marks a negative amount with a sign rather than only a colour', () => {
    expect(formatMoney(gbp(-500), { locale: 'en-GB' })).toMatch(/^−/);
  });

  it('adds an explicit plus only when asked', () => {
    expect(formatMoney(gbp(500), { locale: 'en-GB', signed: true })).toBe('+£5.00');
    expect(formatMoney(gbp(500), { locale: 'en-GB' })).toBe('£5.00');
  });

  it('gives a placeholder matching the currency precision', () => {
    expect(amountPlaceholder(2)).toBe('0.00');
    expect(amountPlaceholder(0)).toBe('0');
    expect(amountPlaceholder(3)).toBe('0.000');
  });
});

describe('accessible description', () => {
  it('speaks the currency rather than relying on a symbol', () => {
    const spoken = describeMoney(gbp(14750), { locale: 'en-GB' });
    expect(spoken.toLowerCase()).toContain('pound');
  });

  it('says "minus" rather than depending on a glyph a screen reader may skip', () => {
    expect(describeMoney(gbp(-500), { locale: 'en-GB' }).startsWith('minus')).toBe(true);
  });
});

describe('currency catalogue', () => {
  it('resolves exponent and symbol from the served catalogue', () => {
    expect(resolveCurrency('JPY', CATALOGUE)).toEqual({ exponent: 0, symbol: '¥' });
    expect(resolveCurrency('KWD', CATALOGUE)).toEqual({ exponent: 3, symbol: 'KD' });
  });

  it('falls back honestly for an unknown currency', () => {
    // Two minor digits is right for most of ISO 4217, and a null symbol makes
    // the fallback visible — the code prints instead of a wrong symbol.
    expect(resolveCurrency('XYZ', CATALOGUE)).toEqual({ exponent: 2, symbol: null });
    expect(resolveCurrency('GBP', undefined)).toEqual({ exponent: 2, symbol: null });
  });

  it('builds money from the catalogue', () => {
    expect(moneyFromMajor(15, 'JPY', CATALOGUE).minorUnits).toBe(15);
    expect(moneyFromMajor(15, 'GBP', CATALOGUE).minorUnits).toBe(1500);
  });
});

describe('progressRatio', () => {
  it('reports how far a fundraising total has come', () => {
    expect(progressRatio(gbp(5000), gbp(10000))).toBe(0.5);
  });

  it('returns null with no target, rather than a full bar', () => {
    // `raised / 0` is Infinity, which renders as 100% — the opposite of the
    // truth for a cause that has raised nothing against no goal.
    expect(progressRatio(gbp(5000), null)).toBeNull();
    expect(progressRatio(gbp(5000), gbp(0))).toBeNull();
    expect(progressRatio(null, gbp(10000))).toBeNull();
  });

  it('refuses a cross-currency ratio', () => {
    expect(progressRatio(gbp(5000), jpy(10000))).toBeNull();
  });

  it('clamps an over-funded cause to one', () => {
    expect(progressRatio(gbp(20000), gbp(10000))).toBe(1);
  });
});

// ── Plain-number prices (14 Oct 2026) ────────────────────────────────────────
//
// The one symbol lookup shared by events, listings, campaigns and map pins. It
// replaced `code === 'GBP' ? '£' : '$'` and eight copied switch tables.
describe('currencySymbol and formatPrice', () => {
  const { currencySymbol, formatPrice } = require('../money') as typeof import('../money');

  it('prefers the symbol the server sent', () => {
    expect(currencySymbol('MUR', 'Rs')).toBe('Rs');
  });

  it('knows the platform currencies and prints the code for any other', () => {
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('mur')).toBe('Rs ');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('XOF')).toBe('XOF ');
  });

  it('prints nothing rather than a guessed symbol when there is no currency', () => {
    expect(currencySymbol(undefined)).toBe('');
    expect(currencySymbol(null)).toBe('');
    expect(formatPrice(25, undefined)).toBe('25');
  });

  it('shows decimals only when the amount has them', () => {
    expect(formatPrice(25, 'GBP', { locale: 'en-GB' })).toBe('£25');
    expect(formatPrice(12.5, 'USD', { locale: 'en-US' })).toBe('$12.50');
    expect(formatPrice(1250, 'MUR', { locale: 'en-GB' })).toBe('Rs 1,250');
  });
});

/**
 * The conversion rate line wrote `pointsPerMinorUnit × 100` points to one unit:
 * right for pounds, a hundred times out for yen, ten times for dinars.
 */
describe('pointsPerMajorUnit', () => {
  it('reads a two-decimal currency as before', () => {
    // 0.5 pence a point: 200 points to the pound.
    expect(pointsPerMajorUnit(0.5, 2)).toBe(200);
  });

  it('reads a currency with no minor unit', () => {
    // 0.5 yen a point: 2 points to the yen, not 200.
    expect(pointsPerMajorUnit(0.5, 0)).toBe(2);
  });

  it('reads a three-decimal currency', () => {
    // 1 fils a point: 1,000 points to the dinar, not 100.
    expect(pointsPerMajorUnit(1, 3)).toBe(1_000);
  });

  it('is zero when nothing converts', () => {
    expect(pointsPerMajorUnit(0, 2)).toBe(0);
    expect(pointsPerMajorUnit(-1, 2)).toBe(0);
  });
});
