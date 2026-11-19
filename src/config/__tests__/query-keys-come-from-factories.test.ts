// ─────────────────────────────────────────────────────────────────────────────
// A query key is never typed at a call site (FARCH-003)
//
// ── What this closes ────────────────────────────────────────────────────────
//
// Report 8 recorded FARCH-003 as "five of eight large domains have no query-key
// factory". That is not what the repository contains. There are **28** exported
// key factories, and all five of the named domains have one — `financialKeys`,
// `communityLifeKeys`, `communitySocialKeys`, `guideKeys`, `creatorGapKeys`.
// What the audit saw was that only three of them live at
// `lib/{domain}/query-keys.ts`; the rest sit in `lib/{domain}-api.ts`. That is a
// question about where files go, and it belongs to FARCH-002.
//
// The real defect was next to it. **95 call sites built a key by hand on a root
// a factory already owned** — a `useQuery` writing its own array, a mutation
// typing out the prefix it wanted to invalidate. Two of them were wrong:
//
//   * four Community Life hub rails read `['community-programme', 'hub', …]`
//     and no mutation could reach them, because every invalidation named the
//     family the factory owned and React Query matches a prefix positionally;
//   * `usePublishOrganization` invalidated `['community-life', 'organization',
//     id]` — singular — which nothing in the codebase reads or writes. The
//     factory's key is `['community-life', 'organizations', id]`. It was
//     harmless only because the next line invalidated the plural prefix, which
//     is broader than it needs to be.
//
// Neither was detectable. A key that matches nothing throws nothing, logs
// nothing and fails no test: the symptom is a list that does not refresh, which
// looks like the network being slow.
//
// ── Why this is a rule about roots rather than about all literals ───────────
//
// A key written by hand on a root **nobody owns** is a domain that has not been
// given a factory yet. That is worth knowing but it is not a correctness
// problem: there is no second spelling to disagree with. The danger is two
// spellings of one key, so the rule is exactly that — a literal is a failure
// when a factory already owns its root.
//
// ── Why it reads the filesystem ─────────────────────────────────────────────
//
// A list of known offenders checked against a list of allowed ones is two
// things to keep in step, and the second one rots. The factories and their
// roots are derived here from the source, so adding a factory extends the rule
// automatically and no new domain starts out exempt.
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
const { join, relative, sep }: {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
} = require('path');

const SOURCE_ROOT = join(__dirname, '..', '..');

/** `export const somethingKeys = {` — the one shape every factory in this app uses. */
const FACTORY = /^export const ([a-zA-Z]+Keys)\b/m;

/** The first string in any array literal: a candidate key root. */
const ROOT_IN = /\[\s*'([a-z][a-z0-9:_-]*)'/g;

/** `queryKey: ['root', …` — a key written out rather than asked for. */
const SITE = /queryKey:\s*\[\s*'([a-z][a-z0-9:_-]*)'/g;

interface Offence {
  readonly file: string;
  readonly line: number;
  readonly root: string;
  readonly owners: readonly string[];
}

function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        found.push(path);
      }
    }
  };

  walk(SOURCE_ROOT);
  return found.sort();
}

/** Every key root some factory owns, mapped to the factories that own it. */
export function ownedRoots(files: readonly string[]): {
  roots: Map<string, string[]>;
  factoryFiles: Set<string>;
} {
  const roots = new Map<string, string[]>();
  const factoryFiles = new Set<string>();

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const declaration = FACTORY.exec(text);
    if (!declaration) continue;

    factoryFiles.add(file);
    const body = text.slice(declaration.index);
    ROOT_IN.lastIndex = 0;
    let match = ROOT_IN.exec(body);
    while (match !== null) {
      const owners = roots.get(match[1]) ?? [];
      if (!owners.includes(declaration[1])) owners.push(declaration[1]);
      roots.set(match[1], owners);
      match = ROOT_IN.exec(body);
    }
  }

  return { roots, factoryFiles };
}

/**
 * The literals in one file that sit on an owned root.
 *
 * Exported so the rule can be pointed at a string rather than at the
 * repository — see the control cases below. A rule only ever run over a tree
 * that satisfies it is a rule nobody has seen work.
 */
export function offencesIn(
  text: string,
  roots: Map<string, string[]>,
  file = '<memory>'
): Offence[] {
  const found: Offence[] = [];
  SITE.lastIndex = 0;
  let match = SITE.exec(text);

  while (match !== null) {
    const owners = roots.get(match[1]);
    if (owners) {
      found.push({
        file,
        line: text.slice(0, match.index).split('\n').length,
        root: match[1],
        owners,
      });
    }
    match = SITE.exec(text);
  }

  return found;
}

const FILES = sourceFiles();
const { roots: ROOTS, factoryFiles: FACTORY_FILES } = ownedRoots(FILES);

describe('the rule can see the codebase it is about', () => {
  it('finds the source tree', () => {
    expect(FILES.length).toBeGreaterThan(900);
  });

  it('finds the key factories', () => {
    expect(FACTORY_FILES.size).toBeGreaterThanOrEqual(25);
  });

  it('derives the roots they own', () => {
    expect(ROOTS.size).toBeGreaterThanOrEqual(30);
  });

  it.each([
    ['community-programme', 'communityProgrammeKeys'],
    ['community-life', 'communityLifeKeys'],
    ['maps', 'mapKeys'],
    ['guides', 'guideKeys'],
    ['financial', 'financialKeys'],
  ])('knows %s belongs to %s', (root, factory) => {
    expect(ROOTS.get(root)).toContain(factory);
  });
});

describe('the rule catches what it claims to catch', () => {
  it('flags a hand-written key on an owned root', () => {
    const offences = offencesIn(
      "const q = useQuery({ queryKey: ['community-programme', 'hub', 'campaigns'] });",
      ROOTS
    );

    expect(offences).toHaveLength(1);
    expect(offences[0].root).toBe('community-programme');
  });

  it('flags the exact shape that stranded the hub rails', () => {
    const offences = offencesIn(
      [
        "const campaigns = useQuery({",
        "  queryKey: ['community-programme', 'hub', 'campaigns', countryCode ?? 'any'],",
        '});',
      ].join('\n'),
      ROOTS
    );

    expect(offences).toHaveLength(1);
    expect(offences[0].line).toBe(2);
  });

  it('flags the singular key that matched nothing', () => {
    expect(
      offencesIn("queryKey: ['community-life', 'organization', id],", ROOTS)
    ).toHaveLength(1);
  });

  it('does not flag a key asked for from its factory', () => {
    expect(
      offencesIn('queryKey: communityProgrammeKeys.hubCampaigns(countryCode),', ROOTS)
    ).toHaveLength(0);
  });

  it('does not flag a literal on a root no factory owns', () => {
    expect(ROOTS.has('not-a-real-domain')).toBe(false);
    expect(offencesIn("queryKey: ['not-a-real-domain', 'list'],", ROOTS)).toHaveLength(0);
  });
});

describe('no call site types a key a factory already owns', () => {
  it('finds none anywhere in src', () => {
    const offences: Offence[] = [];

    for (const file of FILES) {
      if (FACTORY_FILES.has(file)) continue;
      if (file.split(sep).includes('__tests__')) continue;
      offences.push(
        ...offencesIn(readFileSync(file, 'utf8'), ROOTS, relative(SOURCE_ROOT, file))
      );
    }

    expect(
      offences.map(
        (offence) =>
          `${offence.file}:${offence.line} builds a '${offence.root}' key by hand; ` +
          `${offence.owners.join(' / ')} owns that root`
      )
    ).toEqual([]);
  });
});
