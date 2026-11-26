/**
 * No component's props grow past the widest there is (FSOLID-005).
 *
 * The audit counted 199 `*Props` types with a median in the low single digits
 * and five outliers: `DiasporaMapProps` (27), `MapSurfaceProps` (20) and three
 * screen shells (19, 19, 18). The shells were wide because each took its load
 * state and its availability as ten flat props; the map because viewport,
 * overlays, interaction and chrome were one list. Grouped by concern, the
 * widest `*Props` type is 13 members, and this holds every one to that.
 *
 * Members are counted as the audit counted them: a type's own members, read
 * with the TypeScript parser. A prop that is itself a group counts once, which
 * is the point: the caller sees one name for one concern. The ceiling is a
 * width a type may not grow past, not a target, and it only comes down.
 */

// Node's globals declared locally, as no-fabricated-values does: adding "node"
// to the tsconfig `types` field breaks `__DEV__` in other suites.
declare const __dirname: string;
declare const require: (id: string) => unknown;

const fs = require('fs') as {
  readdirSync: (p: string, options: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[];
  readFileSync: (p: string, enc: string) => string;
};
const path = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
};
const ts = require('typescript') as typeof import('typescript');

/** The widest `*Props` type once FSOLID-005 landed: `CommentNodeProps`. Lower it as types narrow. */
const CEILING = 13;

/** `src/`, from `src/lib/__tests__`. */
const SOURCE_ROOT = path.join(__dirname, '..', '..');

interface PropsType {
  readonly name: string;
  readonly file: string;
  readonly members: number;
}

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'mocks') yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

function membersOf(node: import('typescript').Node): number | null {
  if (ts.isInterfaceDeclaration(node)) return node.members.length;

  if (ts.isTypeAliasDeclaration(node)) {
    if (ts.isTypeLiteralNode(node.type)) return node.type.members.length;
    if (ts.isIntersectionTypeNode(node.type)) {
      return node.type.types
        .filter(ts.isTypeLiteralNode)
        .reduce((sum, literal) => sum + literal.members.length, 0);
    }
  }

  return null;
}

function propsTypes(): PropsType[] {
  const found: PropsType[] = [];

  for (const file of sourceFiles(SOURCE_ROOT)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: import('typescript').Node): void => {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text.endsWith('Props')) {
        const members = membersOf(node);
        if (members !== null) {
          found.push({ name: node.name.text, file: path.relative(SOURCE_ROOT, file).split(path.sep).join('/'), members });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return found;
}

const FOUND = propsTypes();

it('finds the props types it holds to the ceiling', () => {
  // Canary: a scan that stopped finding types would pass any ceiling.
  expect(FOUND.length).toBeGreaterThanOrEqual(200);
  expect(FOUND.map((type) => type.name)).toEqual(
    expect.arrayContaining(['DiasporaMapProps', 'MapSurfaceProps', 'CommunityScreenProps', 'CommentNodeProps'])
  );
});

it(`holds every props type to ${CEILING} members`, () => {
  const wider = FOUND.filter((type) => type.members > CEILING).map(
    (type) => `${type.name} (${type.file}) has ${type.members}`
  );

  // Every offender at once, not the first: a list is what the fix needs.
  expect(wider).toEqual([]);
});

it('keeps the ceiling at the widest type, so it cannot drift up unnoticed', () => {
  // A ceiling above every type would admit growth to it without failing. When
  // the widest type narrows, lower CEILING with it.
  expect(Math.max(...FOUND.map((type) => type.members))).toBe(CEILING);
});
