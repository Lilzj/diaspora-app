/**
 * @jest-environment node
 *
 * The dependency audit gate's stale-reason rule — FSEC-001.
 *
 * This suite exists because the defect it guards against was mine, and it was
 * invisible. On 16 November 2026, 21 of the 22 entries in
 * `dependency-audit-baseline.json` read "Cleared by the Expo SDK upgrade."
 * while still being carried. They had not been cleared; they had survived it.
 * The sentence was written on 13 November as a forecast, and `--write-baseline`
 * carried it forward by key into a file stamped with a fresh date, so the claim
 * looked newer than the fact that disproved it.
 *
 * Nothing failed. That is the whole reason this is a test and not a comment —
 * the audit's own root-cause finding was a repository that asserted things in
 * prose and checked none of them.
 */

const { resolvedClaim, RESOLVED_CLAIMS } = require('../dependency-audit');
const baseline = require('../../dependency-audit-baseline.json');

// The two that actually shipped, verbatim. The second is why a grep for
// "Cleared by the Expo SDK" found 20 rather than 21: the wording differs in the
// middle, so a guessed prefix missed it and the real count came from a parser.
const SHIPPED = [
  'Prebuild and config-plugin tooling (expo, @expo/config-plugins, expo-sharing, the '
    + 'React Native jest preset). Not imported by app code, so not in the bundle. '
    + 'Cleared by the Expo SDK upgrade.',
  'Build and development tooling: react-native > react-devtools-core, the DevTools shell '
    + 'the Metro dev server starts. Not imported by app code, so not in the bundle. The '
    + 'exposure is the build machine, which is where the signing key lives. Cleared by the '
    + 'React Native version that comes with the Expo SDK upgrade.',
];

const CLAIMS_RESOLUTION = [
  'Cleared by the Expo SDK upgrade.',
  'Fixed in 4.3.2.',
  'Resolved by the toolchain sweep.',
  'Remediated with the override.',
  'Patched once expo-router@58 landed.',
  'This has been resolved upstream.',
  'It was cleared when the lockfile was regenerated.',
  'The advisory is now fixed.',
  'No longer reported after the bump.',
  'No longer applies to this tree.',
  'Gone after the SDK upgrade.',
  'Will be cleared by the next SDK.',
  'Will fix once expo-router goes to 58.',
];

// Each of these says something that stays true, or fails visibly, for as long
// as the entry is carried. The last three are real text from the committed
// baseline and the FSEC-001 ledger row.
const STATES_A_PROPERTY = [
  'Not imported by app code, so not in the bundle.',
  'The only fix is expo-router@58, which is an SDK migration rather than a bump.',
  'Reached solely through the Tailwind build chain; NativeWind compiles styles at build time.',
  'The exposure is the build machine, which is where the signing key lives.',
  'Fixing this requires a major version bump across six peers.',
  'Prebuild and config-plugin tooling (expo, @expo/config-plugins, expo-sharing, the '
    + 'React Native jest preset). Not imported by app code, so not in the bundle. Still '
    + 'carried after the Expo SDK 58 upgrade of 16 November 2026, which cleared 38 '
    + 'advisories but not this one.',
  'Tailwind build chain (tailwindcss > postcss). NativeWind compiles styles at build '
    + 'time; not imported by app code and not in the bundle.',
];

describe('resolvedClaim', () => {
  it.each(SHIPPED)('flags the sentence that actually shipped: %s', (reason) => {
    expect(resolvedClaim(reason)).not.toBeNull();
  });

  it.each(CLAIMS_RESOLUTION)('flags a claim of resolution: %s', (reason) => {
    const claim = resolvedClaim(reason);
    expect(claim).not.toBeNull();
    // The matched phrase is quoted back at the author, so it has to be the part
    // that is wrong rather than the whole sentence.
    expect(reason.toLowerCase()).toContain(claim.toLowerCase());
  });

  it.each(STATES_A_PROPERTY)('leaves a property alone: %s', (reason) => {
    expect(resolvedClaim(reason)).toBeNull();
  });

  it('treats a missing reason as no claim, leaving that to the TODO rule', () => {
    expect(resolvedClaim(undefined)).toBeNull();
    expect(resolvedClaim(null)).toBeNull();
    expect(resolvedClaim('')).toBeNull();
  });

  // A pattern that matches nothing is worse than no pattern, because it reads
  // as cover. One was written during this very change: a shell heredoc
  // collapsed `\b` to a literal backspace and dropped `\s`, leaving five
  // regexes that compiled cleanly and matched nothing at all.
  it('has no dead pattern — every rule in RESOLVED_CLAIMS catches something', () => {
    expect(RESOLVED_CLAIMS.length).toBeGreaterThan(0);

    const unused = RESOLVED_CLAIMS.filter(
      (pattern) => !CLAIMS_RESOLUTION.some((reason) => pattern.test(reason))
    );

    expect(unused.map(String)).toEqual([]);
  });

  it('has no pattern that fires on a property', () => {
    const overreaching = RESOLVED_CLAIMS.filter((pattern) =>
      STATES_A_PROPERTY.some((reason) => pattern.test(reason))
    );

    expect(overreaching.map(String)).toEqual([]);
  });
});

describe('the committed baseline', () => {
  // Asserted first, because every expectation below it is vacuous on an empty
  // array and would pass just as happily against a deleted file.
  it('carries entries to check', () => {
    expect(Array.isArray(baseline.accepted)).toBe(true);
    expect(baseline.accepted.length).toBeGreaterThan(0);
  });

  it('has no entry claiming it was already cleared', () => {
    const offenders = baseline.accepted
      .map((entry) => ({ key: entry.package + ' ' + entry.id, claim: resolvedClaim(entry.accepted) }))
      .filter((row) => row.claim !== null)
      .map((row) => row.key + ': ' + row.claim);

    expect(offenders).toEqual([]);
  });

  it('has no entry left as a TODO', () => {
    const todos = baseline.accepted
      .filter((entry) => /^TODO/.test(String(entry.accepted || 'TODO')))
      .map((entry) => entry.package + ' ' + entry.id);

    expect(todos).toEqual([]);
  });
});
