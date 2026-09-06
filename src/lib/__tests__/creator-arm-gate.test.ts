// ─────────────────────────────────────────────────────────────────────────────
// A hook's gate has to match the arm it reads
//
// ── The defect, twice in one file ────────────────────────────────────────────
//
// `useCreatorAnalytics` called the certified analytics route and gated it on
// `areCreatorGapsEnabled()` — false in a release build. The route answered 200
// the whole time; the screen told members their figures were not measured yet.
// `creator-summary-certified.test.ts` documents that one.
//
// `useCreatorRevenue` was the same shape waiting to happen: the moment its query
// function moved onto `creator-earning-api.ts`, the `const enabled =
// areCreatorGapsEnabled()` line above it would have switched the revenue
// dashboard off for every member on a real build, and every test would still
// have passed — because in a test build the flag is true.
//
// That is the whole difficulty. **The gate is only wrong in the builds no test
// runs in.** A unit test of the hook cannot see it, a screen test cannot see it,
// and a typecheck cannot see it. It is visible in the source and nowhere else,
// so this reads the source.
//
// ── The rule ────────────────────────────────────────────────────────────────
//
// A hook whose data comes only from the certified client must not gate itself on
// the gap flag. There is no matching assertion in the other direction, and
// deliberately so: the gap client calls `assertEnabled` inside every request, so
// a gap-armed hook is switched off in a release build whether its `enabled:`
// mentions the flag or not. Asserting it here would be asserting a second copy
// of a guarantee that already holds, and the first version of this check did
// exactly that and reported a mutation — which has no `enabled` option at all —
// as a defect.
//
// ── Why it strips comments first ────────────────────────────────────────────
//
// The first version did not, and reported `useCreatorCertificates` as gated on
// the flag: the phrase appears in the *doc comment of the next hook down*, and a
// naive slice from one `export function` to the next swallows it. A guard that
// cries wolf on prose gets muted, so this parses code only.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

const HOOKS = path.join(process.cwd(), 'src', 'hooks', 'creator-economy.ts');

const GAP_FLAG = 'areCreatorGapsEnabled()';

/** The file with block and line comments removed, so prose cannot be read as code. */
function code(): string {
  return fs
    .readFileSync(HOOKS, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

interface Hook {
  name: string;
  body: string;
}

/** Every exported hook, sliced from its own declaration to the next one. */
function hooks(): Hook[] {
  const lines = code().split('\n');
  const found: { name: string; at: number }[] = [];

  lines.forEach((line: string, index: number) => {
    const match = /^export (?:async )?function (use[A-Za-z0-9_]*)\s*\(/.exec(line);
    if (match) found.push({ name: match[1], at: index });
  });

  return found.map((entry, index) => ({
    name: entry.name,
    body: lines.slice(entry.at, found[index + 1]?.at ?? lines.length).join('\n'),
  }));
}

/** Reads the certified client and nothing else. */
function isCertifiedOnly(hook: Hook): boolean {
  return hook.body.includes('certifiedApi.') && !hook.body.includes('gapApi.');
}

describe('the creator hooks gate on the arm they actually read', () => {
  it('finds the hooks at all', () => {
    // Guards the guard. Every assertion below is over a filtered list, and an
    // empty one passes by vacuity — which is how a source sweep goes quietly
    // blind after a rename, an import alias or a move to another file.
    const all = hooks();

    expect(all.length).toBeGreaterThan(30);
    expect(all.filter(isCertifiedOnly).length).toBeGreaterThan(20);
    expect(all.some((hook) => hook.name === 'useCreatorRevenue')).toBe(true);
    expect(all.some((hook) => hook.name === 'useCreatorEarnings')).toBe(true);
  });

  it('reads the certified client without the gap flag anywhere near it', () => {
    const offenders = hooks()
      .filter(isCertifiedOnly)
      .filter((hook) => hook.body.includes(GAP_FLAG))
      .map((hook) => hook.name);

    // `areCreatorGapsEnabled()` is false in a release build. A certified read
    // behind it is a capability the platform serves and the app refuses to ask
    // for — and it fails in exactly the builds members use and no test runs in.
    expect(offenders).toEqual([]);
  });

  it('keeps revenue and earnings on the certified arm', () => {
    // Named explicitly rather than left to the sweep. These two moved off the
    // development arm when CREATOR-GAP-008 closed, and a revert would put a
    // simulated breakdown back under a heading that says it is real.
    const named = hooks().filter(
      (hook) => hook.name === 'useCreatorRevenue' || hook.name === 'useCreatorEarnings'
    );

    expect(named).toHaveLength(2);

    for (const hook of named) {
      expect(hook.body).toContain('certifiedApi.');
      expect(hook.body).not.toContain('gapApi.');
      expect(hook.body).not.toContain(GAP_FLAG);
    }
  });

  it('does not let the revenue screen re-mark served figures as simulated', () => {
    // The other half of the same mistake. `<SimulatedFigure>` gates on the build
    // rather than on the register, so it cannot be silenced by closing a gap —
    // it has to be removed at the call site, and this is what notices it coming
    // back.
    // Comments stripped, for the reason in the header — and because the first
    // run of this assertion failed on the screen's *own* explanation of why the
    // markers were removed. A guard that reads prose as code fails whether the
    // prose agrees with it or not.
    const screen = fs
      .readFileSync(path.join(process.cwd(), 'src', 'app', 'creator', 'revenue.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ 	]*\/\/.*$/gm, '');

    expect(screen).toContain('RevenueBreakdown');
    expect(screen).not.toContain('<SimulatedFigure');
    expect(screen).not.toContain('<PartiallyRealNotice');
  });
});
