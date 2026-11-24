// ─────────────────────────────────────────────────────────────────────────────
// Every cross-repository suite is named in DRIFT_SUITES (FSOLID-008)
//
// ── What this closes ────────────────────────────────────────────────────────
//
// The `contract-drift` job in `.github/workflows/ci.yml` checks out the backend
// and runs a **named list** of suites. Everything else runs in
// `static-and-unit`, which has no backend checkout, where
// `support/backend-checkout` returns `null` and the suite skips.
//
// So a suite that reads the backend and is not named in `DRIFT_SUITES` does not
// run anywhere. It is written, it is committed, it passes locally beside a
// sibling checkout, and in CI it is a quiet `describe.skip` inside a green job.
// That is FBL-001 exactly — eleven suites skipping unnoticed — reachable again
// by nothing worse than forgetting one line of YAML.
//
// ── Why the job's own counting step cannot see it ───────────────────────────
//
// That step runs `jest --listTests "$DRIFT_SUITES"` and fails unless the count
// is the number written beside it. It catches a suite **renamed or deleted**:
// the list names something that no longer exists, the count falls, the job
// fails.
//
// It cannot catch a suite **added**. An eighteenth cross-repository suite that
// nobody lists leaves the count at seventeen, so the step passes, the job passes,
// and the new suite skips. The count knows how many names resolve; it does not
// know how many suites there are. This file is that direction, and it is
// derived from the filesystem rather than from a second list, because a list
// checked against a list is two things to keep in step.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const {
  readdirSync,
  readFileSync,
}: {
  readdirSync(p: string, o: { withFileTypes: true }): DirectoryEntry[];
  readFileSync(p: string, e: string): string;
} = require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

/**
 * An *import* of the module every cross-repository suite finds the backend
 * through — not a mention of its name.
 *
 * The first version of this file matched the bare string, and the first thing
 * it reported was itself: the comment above names the module half a dozen
 * times without ever calling it. A detector that cannot tell a dependency from
 * a reference reports every file that discusses the rule, and a rule whose
 * first finding is a false one gets an exemption written for it, which is how
 * the next real finding gets exempted too.
 */
const CHECKOUT_IMPORT = /(?:from|require\()\s*['"][^'"]*support\/backend-checkout['"]/;

/** Test files, as paths relative to the repository root with forward slashes. */
function testFilesUnder(directory: string, prefix: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      found.push(...testFilesUnder(join(directory, entry.name), relative));
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      found.push(relative);
    }
  }

  return found;
}

const ALL_TESTS = testFilesUnder(SRC, 'src');

const CROSS_REPOSITORY = ALL_TESTS.filter((file) =>
  CHECKOUT_IMPORT.test(readFileSync(join(ROOT, file), 'utf8'))
);

/** The alternatives inside `DRIFT_SUITES: '(a|b|c)'`. */
function driftSuitePattern(): string[] {
  const declaration = /DRIFT_SUITES:\s*'\(([^)]+)\)'/.exec(WORKFLOW);

  if (declaration === null) {
    throw new Error(
      'ci.yml no longer declares DRIFT_SUITES as a parenthesised alternation. This file reads ' +
        'that declaration to check it covers every cross-repository suite; a shape it cannot ' +
        'parse is a reason to fix the pattern here, not to stop checking.'
    );
  }

  return declaration[1].split('|');
}

const NAMED = driftSuitePattern();

/** The count the job asserts: `if [ "$found" -ne 17 ]`. */
function declaredSuiteCount(): number {
  const assertion = /if \[ "\$found" -ne (\d+) \]; then/.exec(WORKFLOW);

  if (assertion === null) {
    throw new Error('ci.yml no longer carries the suite-count assertion this file checks.');
  }

  return Number(assertion[1]);
}

describe('the contract-drift job runs every suite that reads the backend', () => {
  // The canaries. Everything below is a statement about two sets, and both are
  // read off disk: a walk that returned nothing, or a `readFileSync` that
  // matched nothing, would make every assertion below true of the empty set.
  // These numbers are floors well under the real figures, not targets.
  it('finds the test tree', () => {
    expect(ALL_TESTS.length).toBeGreaterThan(300);
  });

  it('finds the suites that read the backend checkout', () => {
    expect(CROSS_REPOSITORY.length).toBeGreaterThan(10);
  });

  it('parses the workflow declaration', () => {
    expect(NAMED.length).toBeGreaterThan(10);
  });

  // The rule. A suite importing `support/backend-checkout` has a backend
  // checkout as a precondition, which only the `contract-drift` job provides.
  it.each(CROSS_REPOSITORY)(
    'names %s in DRIFT_SUITES',
    (file: string) => {
      // Add the suite's distinguishing name to DRIFT_SUITES in
      // .github/workflows/ci.yml and bump the count beside it.
      expect(NAMED.some((name) => file.includes(name))).toBe(true);
    }
  );

  // The other direction, which the job's counting step gets right by accident:
  // it counts files, so one name matching two suites and another matching none
  // still totals correctly. Checked per name here.
  it.each(NAMED)(
    'the DRIFT_SUITES entry %s matches a suite',
    (name: string) => {
      expect(ALL_TESTS.filter((file) => file.includes(name))).toHaveLength(1);
    }
  );

  it('asserts the number of suites it actually has', () => {
    const matched = ALL_TESTS.filter((file) => NAMED.some((name) => file.includes(name)));

    expect(declaredSuiteCount()).toBe(matched.length);
  });
});
