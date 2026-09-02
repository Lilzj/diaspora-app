// ─────────────────────────────────────────────────────────────────────────────
// No screen calls a hook after an early return.
//
// This crashed the app. `wallet/index.tsx` guarded on a permission refusal and
// returned early, and `useRewardPointsBalance()` sat below that guard. On a cold
// start the auth store rehydrates asynchronously, so the screen rendered once
// refused — twelve hooks — and once allowed — thirteen — and React aborted the
// whole tree:
//
//     Error: Rendered more hooks than during the previous render.
//       at WalletScreen
//
// It typechecked. 4,617 tests passed. It shipped in a release APK and was found
// by opening the wallet on a device.
//
// ── Why a test rather than a lint rule ───────────────────────────────────────
//
// `react-hooks/rules-of-hooks` exists precisely for this and would have caught
// it. This repository has no ESLint configuration at all, so that rule has never
// run. Adopting ESLint across a codebase this size is its own piece of work;
// until then this closes the specific hole that cost a crash, in the same
// source-reading style as the rest of this directory.
//
// The scan is deliberately narrow. It flags only a hook assigned at the top
// level of a component body when an early return has already been seen in that
// same body, and it resets at every top-level function so a sub-component
// defined further down the file is judged on its own. A return inside a
// `useCallback` or `useMemo` body is deeper than the guard and is not an early
// return.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): {
    name: string;
    isDirectory(): boolean;
  }[];
};
const path = require('path') as { join(...segments: string[]): string };

const SCREENS = path.join(process.cwd(), 'src', 'app');

function screenFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...screenFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      found.push(full);
    }
  }

  return found;
}

interface Violation {
  file: string;
  line: number;
  code: string;
  guardedAt: number;
}

const HOOK = /\buse[A-Z]\w*\s*\(/;

function violations(file: string, source: string): Violation[] {
  const found: Violation[] = [];

  let depth = 0;
  let guardDepth: number | null = null;
  let earlyReturn: number | null = null;

  const lines = source.split(String.fromCharCode(10));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const delta = (line.split('{').length - 1) - (line.split('}').length - 1);

    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      depth += delta;
      continue;
    }

    // A hook assigned at the top level of a body that has already bailed out.
    if (
      depth === 1
      && earlyReturn !== null
      && HOOK.test(trimmed)
      && /^(const|let|var)\s/.test(trimmed)
    ) {
      found.push({ file, line: i + 1, code: trimmed.slice(0, 100), guardedAt: earlyReturn });
    }

    if (depth === 1 && /^if\s*\(/.test(trimmed) && line.includes('{')) {
      guardDepth = depth;
    }

    if (guardDepth !== null && depth >= guardDepth && /^return\b/.test(trimmed)) {
      earlyReturn = i + 1;
    }

    depth += delta;

    if (guardDepth !== null && depth < guardDepth) guardDepth = null;

    // A new top-level function is a fresh body: a guard in the previous one says
    // nothing about this one.
    if (depth <= 0) {
      earlyReturn = null;
      guardDepth = null;
    }
  }

  return found;
}

describe('no screen calls a hook after an early return', () => {
  const files = screenFiles(SCREENS);

  it('finds screens to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every screen calls all of its hooks unconditionally', () => {
    const offences = files.flatMap((file) =>
      violations(file, fs.readFileSync(file, 'utf8'))
    );

    const report = offences.map(
      (offence) =>
        `${offence.file.replace(process.cwd(), '')}:${offence.line} `
        + `— hook runs only on renders that get past the early return at `
        + `line ${offence.guardedAt}\n      ${offence.code}`
    );

    expect(report).toEqual([]);
  });

  it('the scan can actually see a violation', () => {
    // A guard that never fails is a guard nobody notices has stopped working.
    const planted = [
      'export default function Broken() {',
      '  const a = useOne();',
      '  if (!a) {',
      '    return null;',
      '  }',
      '  const b = useTwo();',
      '  return b;',
      '}',
    ].join(String.fromCharCode(10));

    const found = violations('planted.tsx', planted);

    expect(found).toHaveLength(1);
    expect(found[0].code).toContain('useTwo');
    expect(found[0].guardedAt).toBe(4);
  });

  it('does not flag a hook in a sub-component defined below a guarded screen', () => {
    // The reason the scan resets at every top-level function. Without it, every
    // card component under a screen looked like a violation — 218 of them.
    const planted = [
      'export default function Screen() {',
      '  const a = useOne();',
      '  if (!a) {',
      '    return null;',
      '  }',
      '  return null;',
      '}',
      '',
      'function Card() {',
      '  const { tokens } = useTheme();',
      '  return tokens;',
      '}',
    ].join(String.fromCharCode(10));

    expect(violations('planted.tsx', planted)).toEqual([]);
  });

  it('does not flag a return inside a callback passed to a hook', () => {
    const planted = [
      'export default function Screen() {',
      '  const a = useMemo(() => {',
      '    if (x) {',
      '      return 1;',
      '    }',
      '    return 2;',
      '  }, [x]);',
      '  const b = useTwo();',
      '  return b;',
      '}',
    ].join(String.fromCharCode(10));

    expect(violations('planted.tsx', planted)).toEqual([]);
  });
});
