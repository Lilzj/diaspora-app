/**
 * Reading a number of places an organiser typed.
 *
 * **Coercion is the danger here, not rejection.** `parseInt('twelve')` is `NaN`
 * and `parseInt('12.9')` is `12` — a lenient parse sets a limit nobody typed,
 * and the second does it silently with a plausible-looking number. A capacity
 * is a count of seats, so anything that is not a positive whole number is
 * refused rather than turned into one.
 *
 * **Zero is refused rather than read as uncapped.** Null is no limit; zero is an
 * event nobody may join. An organiser who wants nobody to come cancels the
 * event, and one who types 0 has made a mistake — reading it as "unlimited" is
 * the worst available guess.
 *
 * This began as an `Alert.prompt` and the repository's own alert-consistency
 * guard refused it: the application raises everything through its designed
 * modal, and `Alert.prompt` is iOS-only besides, so Android would have been
 * offered a dialog that could not take a number. The parsing is the part worth
 * keeping and testing; asking for the value belongs on the screen.
 */
export function parseCapacity(input: string): number | null | 'invalid' {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return 'invalid';
  }

  // Whole ASCII digits only. Not a check on the parsed value: `Number('12abc')`
  // is NaN but `parseInt` would take the 12, and " 12 " should still be twelve.
  if (!/^\d+$/.test(trimmed)) {
    return 'invalid';
  }

  const value = Number(trimmed);

  if (!Number.isSafeInteger(value) || value <= 0) {
    return 'invalid';
  }

  return value;
}
