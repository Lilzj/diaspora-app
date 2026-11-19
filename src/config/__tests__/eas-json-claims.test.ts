// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — prose in src/config may not describe eas.json alone
// (FSEC-005)
//
// ── The defect this exists for ──────────────────────────────────────────────
//
// `gap-preview.ts` is the one switch deciding whether a build may simulate a
// backend capability, and its header stated three safety properties. Two were
// about `eas.json`, and both had stopped being true:
//
//   * *"set in `eas.json` on the `preview` profile only"* — removed from
//     `preview` on 20 October 2026, deliberately, because testers were
//     reporting simulated balances as bugs.
//   * *"`eas.json` gives `production` an explicit empty `env` block so its
//     absence is visible rather than inferred"* — the profile has two entries,
//     so the absence is inferred after all.
//
// The **net posture was never unsafe**: no profile sets the flag, and two
// suites have asserted that since 20 October. What rotted was the explanation,
// and an explanation that confidently describes a property it no longer has is
// worse than no explanation, because it stops the next reader checking.
//
// ── What this asserts, and what it cannot ───────────────────────────────────
//
// It cannot read prose. What it can do is make the *shape* of the claim
// checkable: **a file under `src/config` that mentions `eas.json` in a comment
// must also name a test that reads `eas.json`**, and that test must exist and
// must really read it.
//
// So the rule is not "this sentence is true" — nothing here can know that. It
// is "you may not describe that file without pointing at the thing that checks
// it", which is the habit whose absence caused the drift. A sentence with a
// test beside it is a sentence somebody can falsify in one click; the two above
// had nowhere to look.
//
// Generated twins (`*.production.ts`) are excluded. They are produced from the
// sources this rule already covers, so holding both would make the generator's
// output a second thing to keep in step — which is the species of problem, not
// a fix for it.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const {
  readFileSync,
  readdirSync,
  existsSync,
}: {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirectoryEntry[];
  existsSync(path: string): boolean;
} = require('fs');
const {
  join,
  relative,
}: {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
} = require('path');

/** `src/`, from `src/config/__tests__`. */
const SOURCE_ROOT = join(__dirname, '..', '..');
const CONFIG_ROOT = join(SOURCE_ROOT, 'config');
const REPO_ROOT = join(SOURCE_ROOT, '..');

/**
 * Scanned alongside `src/config`, added 19 Nov 2026 with FSEC-009.
 *
 * `app.config.js` is the one file outside `src/config` whose whole purpose is
 * reading the environment and describing build profiles, so it is exactly where
 * a claim about `eas.json` goes stale. It earned its place immediately: the
 * FSEC-009 change states there that no profile sets the cleartext variable, and
 * that sentence is only worth anything because a test asserts it.
 */
const ALSO_SCANNED = ['app.config.js'];

/** A comment line, which is the only place this rule looks. */
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/;

/**
 * `lib/__tests__/gap-preview.test.ts` and the like, written inside a comment.
 *
 * One character class and one quantifier for the directory part, rather than
 * the nested `(?:[\w.-]+\/)*` this was first written as. `security/detect-unsafe-regex`
 * flagged that shape and was right to: nested quantifiers backtrack
 * exponentially, and this runs over every comment line in `src/config`.
 */
const TEST_REFERENCE = /([\w./-]*__tests__\/[\w.-]+\.test\.tsx?)/g;

function scannedFiles(): string[] {
  return [
    ...configFiles(CONFIG_ROOT),
    ...ALSO_SCANNED.map((name) => join(REPO_ROOT, name)).filter((path) => existsSync(path)),
  ];
}

function configFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') found.push(...configFiles(path));
      continue;
    }

    // Generated twins are excluded; see the header.
    if (/\.tsx?$/.test(entry.name) && !/\.production\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

/**
 * A cited test path, resolved.
 *
 * Accepts both spellings, because the natural one depends on where the citing
 * file lives: a module under `src/config` writes `lib/__tests__/x.test.ts`, and
 * `app.config.js` at the repository root writes `src/config/__tests__/x.test.ts`.
 * Demanding one of them would make the rule reject a correct citation for being
 * written from the wrong place, which is how a guard gets switched off.
 */
function resolveTest(reference: string): string | null {
  for (const base of [SOURCE_ROOT, REPO_ROOT]) {
    const candidate = join(base, reference);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

interface Claimant {
  readonly file: string;
  readonly lines: number;
  readonly tests: readonly string[];
}

function claimants(): Claimant[] {
  const found: Claimant[] = [];

  for (const path of scannedFiles()) {
    const source = readFileSync(path, 'utf8');
    const commented = source.split('\n').filter((line) => COMMENT.test(line));
    const mentions = commented.filter((line) => line.includes('eas.json'));

    if (mentions.length === 0) continue;

    const tests = new Set<string>();
    for (const line of commented) {
      for (const match of line.matchAll(TEST_REFERENCE)) tests.add(match[1]);
    }

    found.push({
      file: relative(REPO_ROOT, path).replace(/\\/g, '/'),
      lines: mentions.length,
      tests: [...tests],
    });
  }

  return found;
}

describe('prose about eas.json names the test that checks it', () => {
  let found: Claimant[] = [];

  beforeAll(() => {
    found = claimants();
  });

  it('found the file it was written for', () => {
    // The canary. A sweep that matches nothing reports a clean codebase, and
    // this one is asserting that a set is empty — so it says out loud which
    // file it did find, and fails if the scan stops seeing it.
    const files = found.map((c) => c.file);

    expect(files).toContain('src/config/gap-preview.ts');
    expect(found.find((c) => c.file === 'src/config/gap-preview.ts')?.lines).toBeGreaterThan(0);

    // And the file added to the scan on 19 Nov 2026, which describes which
    // build profile sets what and is therefore the other place a claim about
    // `eas.json` goes stale.
    expect(files).toContain('app.config.js');
  });

  it('every test it points at exists', () => {
    const missing: string[] = [];

    for (const claimant of found) {
      for (const test of claimant.tests) {
        if (resolveTest(test) === null) {
          missing.push(`${claimant.file} names ${test}, which does not exist`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('every file describing eas.json points at a test that reads it', () => {
    // **At least one**, not all. A file may cite several tests for several
    // claims — `gap-preview.ts` cites `production-mock-gate.test.ts` for the
    // three build shapes, which has nothing to do with `eas.json` and should
    // not have to. Requiring every reference to read the file was this rule's
    // first draft, and it failed on a correct citation.
    const silent = found
      .filter(
        (claimant) =>
          !claimant.tests.some((test) => {
            const path = resolveTest(test);
            return path !== null && readFileSync(path, 'utf8').includes('eas.json');
          })
      )
      .map((claimant) => claimant.file);

    expect(silent).toEqual([]);
  });

  it('and one of them asserts the thing that actually matters', () => {
    // The shape rule above would be satisfied by a test that reads `eas.json`
    // and checks the API base URL. The property the switch depends on is
    // narrower: no profile may carry the simulation flag. Asserted here so the
    // chain from prose to guarantee has no decorative link in it.
    const referenced = found.flatMap((c) => c.tests);
    const asserting = referenced.filter((test) => {
      const path = resolveTest(test);
      if (path === null) return false;
      const source = readFileSync(path, 'utf8');
      return (
        source.includes('EXPO_PUBLIC_ENABLE_GAP_PREVIEW') && source.includes('build.production')
      );
    });

    expect(asserting.length).toBeGreaterThan(0);
  });
});
