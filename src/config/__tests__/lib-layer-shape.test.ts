// ─────────────────────────────────────────────────────────────────────────────
// `src/lib` is directories, not a pile of files (FARCH-002 / FSOLID-004)
//
// ── What this closes ────────────────────────────────────────────────────────
//
// Reports 8 and 6 recorded the same finding twice: *"`src/lib` is a 491-file,
// 157,819-line layer carrying four unrelated concerns"* and *"`src/lib` is a
// 491-file flat namespace mixing API clients, domain logic, adapters, formatters
// and platform shims"*.
//
// The count was of the whole tree **including `__tests__`**, which held 281 of
// those files. The flat namespace was 126 production modules, not 491 — still
// too many to find anything in, and the four concerns were real:
//
//   * what talks to the server, and what its failures mean;
//   * one module per backend surface, plus the adapters that turn a wire shape
//     into the shape this application draws;
//   * rules and decisions that would hold on any device;
//   * the device and presentation edge.
//
// Those are now `transport/`, `api/`, `domain/` and `platform/`. Nothing else
// changed: no behaviour, no exports, no cache keys — 1,420 module specifiers
// were repointed and the compiler checked every one.
//
// ── Why the rule is "no files" rather than "these four directories" ─────────
//
// The audit's own remediation asks for per-domain directories too —
// `src/lib/{domain}/` with `api.ts`, `query-keys.ts`, `access.ts` — one domain
// at a time. Eleven already exist and `src/lib/creator/` holds its own
// `*-api.ts`. A rule naming only the four concerns would forbid that next step.
//
// So the rule is the condition the two rows actually describe: **a module does
// not live at the top of `src/lib`**. Where it lives below that is a design
// question this file deliberately leaves open.
//
// The directory is the cheapest possible guard and the only one that holds: a
// file count would pass while the same 126 modules sat in one directory named
// something else, and a list of allowed names would be a second thing to keep
// in step with the first.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

const {
  readdirSync,
}: {
  readdirSync(p: string, o: { withFileTypes: true }): DirectoryEntry[];
} = require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

const LIB = join(__dirname, '..', '..', 'lib');

/** The four concerns the two rows name, as directories. */
const CONCERNS = ['api', 'domain', 'platform', 'transport'] as const;

/**
 * The module files directly inside a directory listing.
 *
 * Exported so the rule can be run over a listing rather than over the
 * repository — a rule only ever run over a tree that satisfies it is a rule
 * nobody has seen work.
 */
export function looseModules(entries: readonly DirectoryEntry[]): string[] {
  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function entries(path: string): DirectoryEntry[] {
  return readdirSync(path, { withFileTypes: true });
}

const fake = (name: string, directory: boolean): DirectoryEntry => ({
  name,
  isDirectory: () => directory,
  isFile: () => !directory,
});

describe('the rule catches what it claims to catch', () => {
  it('flags a module left at the top level', () => {
    expect(looseModules([fake('domain', true), fake('money.ts', false)])).toEqual([
      'money.ts',
    ]);
  });

  it('flags a .tsx as readily as a .ts', () => {
    expect(looseModules([fake('useThing.tsx', false)])).toEqual(['useThing.tsx']);
  });

  it('does not flag a directory, whatever it is called', () => {
    expect(looseModules([fake('api', true), fake('money.ts', true)])).toEqual([]);
  });

  it('does not flag a file that is not a module', () => {
    expect(looseModules([fake('README.md', false), fake('data.json', false)])).toEqual([]);
  });
});

describe('src/lib holds directories, not modules', () => {
  it('has no module at its top level', () => {
    expect(looseModules(entries(LIB))).toEqual([]);
  });

  it.each(CONCERNS)('has a %s directory', (concern) => {
    const found = entries(LIB).find((entry) => entry.name === concern);
    expect(found?.isDirectory()).toBe(true);
  });

  it.each(CONCERNS)('%s actually holds modules', (concern) => {
    // So the rule cannot be satisfied by emptying the four concerns into some
    // other flat directory.
    expect(looseModules(entries(join(LIB, concern))).length).toBeGreaterThan(0);
  });

  it('still leaves room for the per-domain directories the audit asks for next', () => {
    const directories = entries(LIB)
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    // Eleven domain directories predate this split and are untouched by it.
    expect(directories.length).toBeGreaterThan(CONCERNS.length + 5);
    expect(directories).toEqual(expect.arrayContaining(['analytics', 'maps', 'community']));
  });
});
