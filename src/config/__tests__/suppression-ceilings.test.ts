// ─────────────────────────────────────────────────────────────────────────────
// A rule set to `error` may only ever have fewer suppressions (FSEC-007 / FARCH-001)
//
// ── What the ratchet does not cover ─────────────────────────────────────────
//
// `eslint-suppressions.json` is ESLint's own bulk-suppression file and it is a
// two-way ratchet: a new violation fails the build, and an entry for a
// violation that no longer exists fails it too. That is a good mechanism and it
// has one hole — `npm run lint:baseline` runs `--suppress-all`, which absorbs
// *everything* currently failing into the file. It exists for adopting a rule
// on a legacy tree, which is exactly what it was used for. Run again to make a
// red build green, it silently re-suppresses whatever the ratchet just caught.
//
// So the ratchet protects the file's contents and nothing protects the file
// itself. This does.
//
// ── Why ceilings rather than zero ───────────────────────────────────────────
//
// The audit named two rules and asked for them as errors *with zero
// violations*. `@typescript-eslint/no-floating-promises` reached zero on
// 19 Nov 2026 — 199 of them, none by suppression. `react-hooks/exhaustive-deps`
// has not: 61 remain, and each one is a judgement about whether an effect
// should re-run, not a mechanical edit.
//
// A ceiling records that difference honestly and still only moves one way. When
// a rule reaches zero its ceiling becomes 0 and this test is what keeps it
// there; until then the number may only be lowered, and lowering it is the
// whole of the remaining work.
//
// Both of the audit's rules reached zero on 19 Nov 2026. The entries that
// remain are debt that arrived with the linter rather than from any finding,
// recorded here so it cannot grow back.
//
// The error-level rules are read from the config itself rather than listed
// here, so a rule promoted to `error` with suppressions still on it fails this
// test rather than quietly arriving unprotected.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

const { readFileSync }: { readFileSync(p: string, e: string): string } = require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

const ROOT = join(__dirname, '..', '..', '..');

interface SuppressionEntry {
  count?: number;
}

type Suppressions = Record<string, Record<string, SuppressionEntry | number>>;

const suppressions: Suppressions = JSON.parse(
  readFileSync(join(ROOT, 'eslint-suppressions.json'), 'utf8')
);

/**
 * The config is required rather than scanned, because a regex over its source
 * reads only the spellings it was written for — and the one that matters here
 * is "set to error in one block and off in another", which a scan sees as two
 * unrelated matches.
 */
interface ConfigBlock {
  rules?: Record<string, unknown>;
  files?: string[];
}

const config = require(join(ROOT, 'eslint.config.js')) as ConfigBlock[];

/** Rules set to `error` for production files — a test-only override is not one. */
function errorRules(): string[] {
  const found = new Set<string>();

  for (const block of config) {
    const isTestOverride = (block.files ?? []).some((pattern) => pattern.includes('test'));
    if (isTestOverride) continue;

    for (const [rule, setting] of Object.entries(block.rules ?? {})) {
      const level = Array.isArray(setting) ? setting[0] : setting;
      if (level === 'error' || level === 2) found.add(rule);
    }
  }

  return [...found].sort();
}

function suppressed(rule: string): number {
  let total = 0;

  for (const rules of Object.values(suppressions)) {
    const entry = rules[rule];
    if (entry === undefined) continue;
    total += typeof entry === 'number' ? entry : (entry.count ?? 0);
  }

  return total;
}

/**
 * The most this rule may still have suppressed. Only ever edited downwards, and
 * the test below is what makes that true rather than customary.
 */
const CEILING: Record<string, number> = {
  // The two the audit named, both at zero: 199 floating promises and 61
  // dependency arrays, none of them re-suppressed. These two zeroes are what
  // FSEC-007 and FARCH-001 asked for, and this file is what keeps them.
  '@typescript-eslint/no-floating-promises': 0,
  'react-hooks/exhaustive-deps': 0,
  // ── FSOLID-006, the third rule the audit named ──────────────────────────
  //
  // 105 `any` usages, reviewed one at a time on 20 Nov 2026. 71 went and 34
  // stayed; these are the 33 still here, and why:
  //
  //   13  app/marketplace/[id].tsx     the six companion lists. The API types
  //                                    them `unknown[]` on purpose -- the
  //                                    published contract has no such members
  //                                    and only the development fixture fills
  //                                    them -- so typing this screen would
  //                                    assert the fixture's shape as if it
  //                                    were the contract. Removing the six
  //                                    sections is the real fix and it is a
  //                                    product decision, which the API module
  //                                    says in as many words.
  //
  //   13  four API row mappers and     `(row: any) => Typed` at a wire the
  //       `saved-resolver`             platform does not describe. The honest
  //                                    form is `unknown` plus a declared
  //                                    shape per mapper; that is work, not a
  //                                    judgement, and it is the next bite.
  //
  //    5  the create screens'          a draft restored from device storage,
  //       draft singletons             which may predate the current shape --
  //                                    `marketplace/create.tsx` carries a
  //                                    comment about a field that changed
  //                                    meaning in October. The stored value
  //                                    genuinely is not the current type.
  //
  //    2  one each in `JobCard`        a wire read defensively and a fixture
  //       and `creator-workspace`      builder. The third, in the community
  //                                    life mock handler, was
  //                                    `const calendarItems: any[]`; it went
  //                                    on 23 Nov 2026, when the calendar
  //                                    mock was rebuilt from the wire type
  //                                    (RMD-008).
  //
  // The rule is an error, so a new one fails the build. This number may only
  // go down, and the test below is what makes that true.
  '@typescript-eslint/no-explicit-any': 33,
  // Debt that came with the linter rather than from the audit, recorded so it
  // cannot grow. Not named by any finding.
  'react-hooks/refs': 81,
  'react-hooks/set-state-in-effect': 75,
  'react/no-unescaped-entities': 24,
  'react-hooks/purity': 15,
  'react-hooks/immutability': 9,
  'react-hooks/preserve-manual-memoization': 6,
  'react-hooks/static-components': 4,
  'react-hooks/globals': 2,
  'react-hooks/use-memo': 1,
};

describe('suppressions for error-level rules', () => {
  // The canary. Everything below iterates the error rules, and an empty list
  // would make every assertion vacuously true — which is how a config this
  // test cannot parse would read as a clean bill of health.
  it('finds the rules the config sets to error', () => {
    expect(errorRules().length).toBeGreaterThan(2);
  });

  // Only rules that actually carry suppressions need a ceiling. The config sets
  // dozens to `error` through its presets, and a rule nothing is suppressed for
  // needs no entry here — it is already at zero and the ratchet keeps it there.
  it('every error-level rule with suppressions has a ceiling', () => {
    const unlisted = errorRules().filter((rule) => suppressed(rule) > 0 && !(rule in CEILING));

    // Add it with its current count, then work that count down.
    expect(unlisted).toEqual([]);
  });

  // The other direction: an entry here must name a rule the config really does
  // treat as an error, or the ceiling is guarding nothing.
  it.each(Object.keys(CEILING))('%s is an error-level rule', (rule: string) => {
    expect(errorRules()).toContain(rule);
  });

  it.each(Object.entries(CEILING))(
    '%s has no more than %i suppressions left',
    (rule: string, ceiling: number) => {
      expect(suppressed(rule)).toBeLessThanOrEqual(ceiling);
    }
  );

  it.each(Object.entries(CEILING))(
    '%s does not have a ceiling higher than it needs',
    (rule: string, ceiling: number) => {
      // The other half of the ratchet: once the count drops, the ceiling drops
      // with it. Without this the number stays where someone first wrote it and
      // the rule can creep back up to it unnoticed.
      expect(suppressed(rule)).toBe(Math.min(suppressed(rule), ceiling));
      expect(ceiling).toBe(suppressed(rule));
    }
  );

  // Stated on their own because they are the two the audit named, and because
  // the fix was 260 individual decisions rather than one `--suppress-rule`.
  it('no longer suppresses a single floating promise', () => {
    expect(suppressed('@typescript-eslint/no-floating-promises')).toBe(0);
  });

  it('no longer suppresses a single dependency array', () => {
    expect(suppressed('react-hooks/exhaustive-deps')).toBe(0);
  });
});
