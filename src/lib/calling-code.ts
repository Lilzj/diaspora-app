// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Calling codes, and what a phone number can prove
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// The sign-in screen used to carry a dropdown of seven hard-coded countries,
// defaulting to Mauritius, guessed at from the device's timezone. Three things
// were wrong with that at once: a global platform whose sign-in offers seven
// calling codes cannot be signed into from the other 183; a timezone is a device
// setting, not a location; and the member was being asked to state something the
// number they were about to type already says.
//
// A phone number in E.164 carries its own country. Nobody needs to be asked.
//
// ── What a number can and cannot prove ───────────────────────────────────────
//
// This module is also where the platform's residence rule lives, so the limit of
// that rule belongs here in plain sight:
//
//   * 176 of the 190 countries in the reference list have a calling code that no
//     other country shares. For those, the code identifies the country.
//   * `+1` is shared by twelve — the United States, Canada, Jamaica, Barbados and
//     the rest of the North American Numbering Plan.
//   * `+7` is shared by Russia and Kazakhstan.
//
// So `matchesCountry` answers "is this number from the same calling area as that
// country", which for 176 countries is the same question and for 14 is weaker.
// Distinguishing Canada from the United States needs area codes, which the
// reference list does not carry — and inventing a partial table here would make
// the check look stronger than it is, which is worse than the honest limit.
//
// Phone verification is not the platform's residence proof in any case. That is
// `/verification/country`, which takes documents. This rule exists so that the
// number a member verifies is at least consistent with where they say they live,
// rather than a number in the country they left.
// ─────────────────────────────────────────────────────────────────────────────

import { allCountries, type CountryItem } from '@/mocks/countries';

/** The country that a calling code belongs to, when exactly one does. */
export interface CallingCodeMatch {
  callingCode: string;
  /** Every country sharing this calling code, in reference-list order. */
  countries: CountryItem[];
  /** True when exactly one country uses it, so the number identifies a country. */
  isUnambiguous: boolean;
}

/**
 * Calling codes longest-first.
 *
 * The order is the whole point: `+1` and `+123` would otherwise resolve by
 * whichever happened to be compared first. Nothing in the current reference list
 * is a prefix of another entry, but that is a property of today's data rather
 * than a guarantee, and a lookup that only works by accident is one edit from
 * not working.
 */
const CODES_LONGEST_FIRST: string[] = Array.from(
  new Set(allCountries.map((country) => country.callingCode))
).sort((left, right) => right.length - left.length);

/** Digits only. Both sides of every comparison go through this. */
function digits(value: string): string {
  return value.replace(/\D+/g, '');
}

/**
 * The calling code for an ISO 3166-1 alpha-2 country, or null.
 *
 * Null rather than a guess: a caller that cannot find a country's code needs to
 * say so, and a default would silently attach the wrong country to a number.
 */
export function callingCodeForCountry(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;

  const wanted = countryCode.trim().toUpperCase();
  const found = allCountries.find((country) => country.code.toUpperCase() === wanted);

  return found?.callingCode ?? null;
}

/** The country row for an ISO alpha-2 code, or null. */
export function countryByCode(countryCode: string | null | undefined): CountryItem | null {
  if (!countryCode) return null;

  const wanted = countryCode.trim().toUpperCase();

  return allCountries.find((country) => country.code.toUpperCase() === wanted) ?? null;
}

/**
 * Splits an E.164 number into its calling code and the national part.
 *
 * Returns null when no known calling code matches, which is the honest answer for
 * a half-typed number — and the reason a caller should never render the result of
 * this without checking it.
 */
export function splitE164(phoneNumber: string | null | undefined): {
  callingCode: string;
  nationalNumber: string;
} | null {
  if (!phoneNumber) return null;

  const bare = digits(phoneNumber);
  if (bare.length === 0) return null;

  for (const code of CODES_LONGEST_FIRST) {
    const prefix = digits(code);

    if (prefix.length > 0 && bare.startsWith(prefix)) {
      return { callingCode: code, nationalNumber: bare.slice(prefix.length) };
    }
  }

  return null;
}

/** Which country or countries a number's calling code belongs to. */
export function matchCallingCode(phoneNumber: string | null | undefined): CallingCodeMatch | null {
  const split = splitE164(phoneNumber);
  if (!split) return null;

  const countries = allCountries.filter(
    (country) => country.callingCode === split.callingCode
  );

  return {
    callingCode: split.callingCode,
    countries,
    isUnambiguous: countries.length === 1,
  };
}

/**
 * Whether a number belongs to the calling area of a country.
 *
 * The platform's residence rule, and the reason the registration flow fixes the
 * calling code to the country of residence rather than offering a list: a member
 * from Nigeria living in Britain verifies a British number. Verifying the Nigerian
 * number they kept would leave the platform holding a proof of nothing while the
 * Trust Centre presents phone verification as a step towards country standing.
 *
 * For `+1` and `+7` this is a calling-area match rather than a country match. See
 * the header — the weaker answer is deliberate and is not smoothed over.
 */
export function matchesCountry(
  phoneNumber: string | null | undefined,
  countryCode: string | null | undefined
): boolean {
  const expected = callingCodeForCountry(countryCode);
  if (!expected) return false;

  const split = splitE164(phoneNumber);
  if (!split) return false;

  return split.callingCode === expected;
}

/**
 * Builds an E.164 number from a calling code and whatever the member typed.
 *
 * Leading zeros are dropped from the national part. A British member writes their
 * own number `07700 900123` without thinking about it, and `+4407700900123` is not
 * a number — it is a support ticket that looks like a backend fault.
 */
export function composeE164(callingCode: string, nationalNumber: string): string {
  const code = digits(callingCode);
  const national = digits(nationalNumber).replace(/^0+/, '');

  return `+${code}${national}`;
}

/**
 * A display form: the calling code, a space, then the national digits.
 *
 * Deliberately not locale-grouped. Grouping rules differ per country and getting
 * them subtly wrong makes a correct number look mistyped, which is worse than
 * showing it plainly.
 */
export function formatE164(phoneNumber: string | null | undefined): string {
  const split = splitE164(phoneNumber);
  if (!split) return phoneNumber ?? '';

  return `${split.callingCode} ${split.nationalNumber}`;
}

/**
 * The shortest national number worth submitting.
 *
 * Not a validity check — real minimum lengths are per country and the server holds
 * the authoritative rule. This exists only to keep the Continue button off until
 * there is something plausible to send, which is the difference between a member
 * being told "that is not a number" by the server and never being able to tell
 * whether the button is broken.
 */
export const MIN_NATIONAL_DIGITS = 6;
