// ─────────────────────────────────────────────────────────────────────────────
// Reading a number of places
//
// The organiser types a capacity and it decides whether other members can join
// an event. Coercion is the danger here, not rejection: `parseInt('twelve')` is
// NaN and `parseInt('12.9')` is 12, so a lenient parse sets a limit nobody
// typed — and the second does it silently, with a plausible-looking number.
//
// Zero is refused rather than read as uncapped. An organiser who wants nobody
// to come cancels the event; one who types 0 has made a mistake, and reading it
// as "unlimited" is the worst available guess.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCapacity } from '../event-capacity-prompt';

describe('a number of places', () => {
  it.each([
    ['1', 1],
    ['12', 12],
    ['500', 500],
    ['  25  ', 25],
  ])('accepts %s', (input, expected) => {
    expect(parseCapacity(input)).toBe(expected);
  });
});

describe('what it refuses rather than coerces', () => {
  it.each([
    ['twelve'],
    ['12.9'],
    ['12abc'],
    ['-5'],
    ['0'],
    [''],
    ['   '],
    ['1e3'],
    ['١٢'],
  ])('refuses %s', (input) => {
    expect(parseCapacity(input)).toBe('invalid');
  });

  it('refuses a decimal that would round to something plausible', () => {
    // The dangerous one: parseInt gives 12, which looks like a deliberate
    // answer and is not the one that was typed.
    expect(parseCapacity('12.9')).toBe('invalid');
  });

  it('refuses zero rather than treating it as no limit', () => {
    // Null is uncapped and zero is an event nobody may join. Conflating them
    // would silently open an event the organiser meant to close, or close one
    // they meant to open.
    expect(parseCapacity('0')).toBe('invalid');
    expect(parseCapacity('0')).not.toBeNull();
  });

  it('refuses a number too large to be a count of seats', () => {
    expect(parseCapacity('999999999999999999999')).toBe('invalid');
  });
});
