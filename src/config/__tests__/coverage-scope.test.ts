// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what the coverage figure is over (FBL-006)
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `collectCoverageFrom` was an allow-list naming individual `lib` modules,
// individual `config` files and a `components/{area}` glob per phase, built up
// over eleven phases. It had no entry for `src/hooks` and none for `src/app`.
//
// Two different problems in one list, and only one of them was reasoned.
//
// The screens' exclusion is argued in the config and the argument is good. The
// hooks' exclusion carried no reasoning at all, and 35 files holding the React
// Query keys, the cache invalidation, the optimistic updates and the mutation
// error handling were simply not in the denominator. Measured for the first
// time on 19 Nov 2026: **14.6% of 4,205 statements**. `src/utils` was missing
// the same way, and it already had its own tests.
//
// The deeper problem is the shape. An allow-list **of files** fails the way the
// backend's seeder registry failed before ADR-018: a module added later is
// invisible until somebody remembers to list it, and nothing says so. The
// headline moved from 72.25% of 10,178 statements to 59.05% of 19,766 — the
// same tests, a denominator that had been quietly chosen to flatter.
//
// ── What this file holds ────────────────────────────────────────────────────
//
// Not a coverage threshold: there is none yet, deliberately. This holds the
// *scope* — that the directories carrying logic are globbed rather than listed,
// and that every top-level directory under `src` is either measured or named
// here with the reason it is not. A new `src/services` would otherwise arrive
// unmeasured and nothing would mention it.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const { readdirSync }: { readdirSync(p: string, o: { withFileTypes: true }): DirectoryEntry[] } =
  require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

const config: { collectCoverageFrom: string[] } = require(join(ROOT, 'jest.config.js'));

const PATTERNS = config.collectCoverageFrom;
const INCLUDED = PATTERNS.filter((pattern) => !pattern.startsWith('!'));
const EXCLUDED = PATTERNS.filter((pattern) => pattern.startsWith('!'));

/** The directories whose logic must be globbed, never listed file by file. */
const GLOBBED = ['lib', 'hooks', 'config', 'utils'];

/**
 * Top-level directories under `src` that coverage does not measure, and why.
 *
 * Each is a decision. Adding a directory here is how you say "not measured";
 * leaving one out of both this and the patterns is how the next unmeasured
 * tree gets noticed.
 */
const NOT_MEASURED: Record<string, string> = {
  app: 'Screens. They are compositions of the modules above, and covering them would measure how much of a ScrollView rendered. 298 files and 97,364 lines, excluded since Phase 5 with that reasoning stated in jest.config.js.',
  build: 'Generated production stubs. Their coverage would measure the generator rather than anything written by hand.',
  types: 'Type declarations. No runtime statements to cover.',
  'design-system': 'Tokens and presentational primitives, with no branching worth a percentage.',
  providers: 'React context providers: composition, in the same sense the screens are.',
};

describe('what the coverage figure is over', () => {
  it('loads a configuration with patterns at all — the canary', () => {
    // Everything below reads this array. An empty or missing one would satisfy
    // several of the assertions by vacuity.
    expect(INCLUDED.length).toBeGreaterThan(10);
    expect(EXCLUDED.length).toBeGreaterThan(0);
  });

  it.each(GLOBBED)('measures src/%s by glob rather than by name', (directory) => {
    expect(INCLUDED).toContain(`src/${directory}/**/*.ts`);
  });

  it('names no individual file inside a globbed directory', () => {
    // The anti-regression rule, and the whole reason this file exists. A list
    // of files is a list somebody has to remember to add to; the eleven-phase
    // version of this config is what that looks like after eleven phases.
    const listed = INCLUDED.filter((pattern) => {
      const match = /^src\/([^/]+)\/(.+)$/.exec(pattern);
      return match !== null && GLOBBED.includes(match[1]) && !match[2].startsWith('**');
    });

    expect(listed).toEqual([]);
  });

  it('leaves the test files and the generated twins out', () => {
    expect(EXCLUDED).toContain('!**/__tests__/**');
    expect(EXCLUDED).toContain('!src/config/*.production.ts');
  });

  it('does not measure the screens, which is a decision and not an omission', () => {
    // Stated as an assertion so the decision is somewhere a reader can check,
    // rather than only in prose. The reasoning is in `NOT_MEASURED` above and
    // in jest.config.js.
    expect(INCLUDED.some((pattern) => pattern.startsWith('src/app/'))).toBe(false);
    expect(NOT_MEASURED.app.length).toBeGreaterThan(60);
  });

  it('accounts for every top-level directory under src', () => {
    const directories = readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // The canary for this rule: a readdir that returned nothing would make the
    // comparison below trivially true.
    expect(directories.length).toBeGreaterThan(8);

    const measured = new Set(
      INCLUDED.map((pattern) => /^src\/([^/]+)\//.exec(pattern)?.[1]).filter(Boolean) as string[]
    );

    const unaccounted = directories
      .filter((name) => !measured.has(name) && !(name in NOT_MEASURED))
      .sort();

    expect(unaccounted).toEqual([]);
  });

  it('keeps a reason with every directory it does not measure', () => {
    const directories = new Set(
      readdirSync(SRC, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    );

    for (const [name, reason] of Object.entries(NOT_MEASURED)) {
      // A reason for a directory that no longer exists is a reason nobody will
      // ever read, so the list retires itself.
      expect(directories.has(name)).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});
