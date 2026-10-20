// -----------------------------------------------------------------------------
// A real route gated on the preview flag does not ship
//
// `areSimulatedFeaturesEnabled()` is true under `__DEV__`, and in a release build
// only when EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1. `eas.json` sets that on the
// `preview` profile and **not** on `production`. Every gap flag in this codebase
// (`areMultiCommunityGapsEnabled`, `areAnalyticsGapsEnabled`, …) is that one.
//
// So a query that reads a REAL route but keeps a gap flag in its `enabled` works
// in every development build and every preview APK anybody tests — and never runs
// in the build that ships. Found 11 Sep 2026:
//
//   - `useCommunityDirectory`, `useCommunity`, `useMembershipSet` and
//     `useCommunityCapabilities` moved to `community-entity-api` — "the six that
//     are real now" — and kept the gate. In production: no directory, no
//     community page, no memberships, every capability false.
//   - `useAnalyticsDataset`'s inventory query, headed "The certified half — Real
//     counts", gated on the same flag.
//
// `gap-adapter-reachability.test.ts` guards the mirror image — a hook still
// calling a GAP adapter for a capability the register says is connected. It
// could not see this shape, because these hooks had already been repointed.
// -----------------------------------------------------------------------------

const fs = require('fs') as {
  readFileSync(p: string, e: string): string;
  readdirSync(p: string): string[];
};
const path = require('path') as { join(...s: string[]): string };

const HOOKS = path.join(process.cwd(), 'src', 'hooks');

/** A gap flag call, or the underlying one. */
const GAP_FLAG = /\bare\w*GapsEnabled\(\)|areSimulatedFeaturesEnabled\(\)/;

interface QueryBlock {
  file: string;
  hook: string;
  queryFn: string;
  enabled: string;
}

/** The text of a balanced `{ … }` starting at `open`. */
function balanced(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

/**
 * The value of a top-level `key` in an object literal's text.
 *
 * **Both spellings.** `enabled: x` and the shorthand `enabled,`. The first version read only
 * the colon form, and every one of the four community hooks this file exists for writes
 * `enabled,` — so, run against the code before the fix, it found the analytics query and
 * missed all four. The shorthand's value is the local of the same name, which the taint
 * analysis then follows.
 */
function property(objectText: string, key: string): string | null {
  if (new RegExp(`\\n\\s*${key}\\s*[,}]`).test(objectText)) return key;

  const at = objectText.search(new RegExp(`\\n\\s*${key}:`));
  if (at < 0) return null;
  const start = objectText.indexOf(':', at) + 1;
  let depth = 0;
  for (let i = start; i < objectText.length; i++) {
    const c = objectText[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) return objectText.slice(start, i);
      depth--;
    } else if (c === ',' && depth === 0) return objectText.slice(start, i);
  }
  return objectText.slice(start);
}

function importsOf(src: string) {
  const gapAliases = new Set<string>();
  const realAliases = new Set<string>();
  const realNames = new Set<string>();
  const gapNames = new Set<string>();

  for (const m of src.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]@\/lib\/([^'"]+)['"]/g)) {
    (/gap/i.test(m[2]) ? gapAliases : realAliases).add(m[1]);
  }

  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/([^'"]+)['"]/g)) {
    const target = /gap/i.test(m[2]) ? gapNames : realNames;
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      target.add(trimmed.split(/\s+as\s+/).pop()!.trim());
    }
  }

  return { gapAliases, realAliases, realNames, gapNames };
}

function queryBlocks(): QueryBlock[] {
  const blocks: QueryBlock[] = [];

  for (const file of fs.readdirSync(HOOKS).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(HOOKS, file), 'utf8');
    const hooks = [...src.matchAll(/^export function (use\w+)/gm)];

    hooks.forEach((hook, i) => {
      const body = src.slice(hook.index, i + 1 < hooks.length ? hooks[i + 1].index : src.length);

      for (const m of body.matchAll(/use(?:Infinite)?Query\(\s*\{/g)) {
        const objectText = balanced(body, body.indexOf('{', m.index));
        blocks.push({
          file,
          hook: hook[1],
          queryFn: property(objectText, 'queryFn') ?? '',
          enabled: property(objectText, 'enabled') ?? 'true',
        });
      }
    });
  }

  return blocks;
}

/**
 * A local name used as a free identifier — not after a `.` or inside a longer name.
 *
 * The first version used a bare word boundary, and `options.enabled` then read as the
 * local `enabled` — flagging `useAnalyticsDataset`'s content query, whose `wanted` never
 * touches the flag. A probe that fails on correct code is as unusable as one that passes
 * on broken code.
 */
function freeName(name: string): RegExp {
  return new RegExp(`(?<![.\\w$])${name}(?![\\w$])`);
}

/** Local names in a hook body whose value depends on a gap flag, transitively. */
function taintedLocals(body: string): Set<string> {
  const tainted = new Set<string>();
  const assignments = [...body.matchAll(/\bconst\s+(\w+)\s*=\s*([^;]+);/g)];

  let grew = true;
  while (grew) {
    grew = false;
    for (const [, name, value] of assignments) {
      if (tainted.has(name)) continue;
      const dependsOnFlag =
        GAP_FLAG.test(value) || [...tainted].some((t) => freeName(t).test(value));
      if (dependsOnFlag) {
        tainted.add(name);
        grew = true;
      }
    }
  }

  return tainted;
}

function offenders(): string[] {
  const found: string[] = [];

  for (const file of fs.readdirSync(HOOKS).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(HOOKS, file), 'utf8');
    const { gapAliases, realAliases, realNames, gapNames } = importsOf(src);
    const hooks = [...src.matchAll(/^export function (use\w+)/gm)];

    hooks.forEach((hook, i) => {
      const body = src.slice(hook.index, i + 1 < hooks.length ? hooks[i + 1].index : src.length);
      const tainted = taintedLocals(body);

      for (const m of body.matchAll(/use(?:Infinite)?Query\(\s*\{/g)) {
        const objectText = balanced(body, body.indexOf('{', m.index));
        const queryFn = property(objectText, 'queryFn') ?? '';
        const enabled = property(objectText, 'enabled') ?? 'true';

        const callsGap =
          [...gapAliases].some((a) => new RegExp(`\\b${a}\\.\\w+\\(`).test(queryFn)) ||
          [...gapNames].some((n) => new RegExp(`\\b${n}\\(`).test(queryFn));

        const callsReal =
          [...realAliases].some((a) => new RegExp(`\\b${a}\\.\\w+\\(`).test(queryFn)) ||
          [...realNames].some((n) => /^(fetch|search|read|list|get)/.test(n) &&
            new RegExp(`\\b${n}\\(`).test(queryFn));

        // A query that can reach a gap adapter is allowed its flag — that is what the flag is
        // for. One that only reaches a real route is not.
        if (callsGap || !callsReal) continue;

        const gated =
          GAP_FLAG.test(enabled) || [...tainted].some((t) => freeName(t).test(enabled));

        if (gated) found.push(`${file} ${hook[1]}: enabled = ${enabled.trim().replace(/\s+/g, ' ')}`);
      }
    });
  }

  return found;
}

describe('a query over a real route runs in the build that ships', () => {
  it('can see the queries it checks', () => {
    // A sweep that parses nothing passes for the wrong reason. Infinite queries
    // too: the first version scanned `useQuery(` alone, and the community members
    // list is a `useInfiniteQuery` — a gate on it would have passed unseen.
    const blocks = queryBlocks();
    expect(blocks.some((b) => b.hook === 'useCommunityMembers')).toBe(true);
    expect(blocks.length).toBeGreaterThan(60);
    expect(blocks.some((b) => b.hook === 'useCommunityCapabilities')).toBe(true);
    expect(blocks.find((b) => b.hook === 'useCommunityCapabilities')!.queryFn).toMatch(
      /fetchCapabilities\(/
    );
  });

  it('never gates a real route on the preview flag', () => {
    expect(offenders()).toEqual([]);
  });
});

describe('the production build profile really lacks the flag', () => {
  // The premise. If production ever sets EXPO_PUBLIC_ENABLE_GAP_PREVIEW, simulated screens
  // ship to members, which is a different and worse problem than the one above.
  // Since 20 Oct 2026 the test profile (`preview`) lacks it too: testers saw
  // simulated balances and organisations and reported them as bugs. Test builds
  // show exactly what production shows.
  it('is set for neither the test build nor production', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'eas.json'), 'utf8'));

    expect(eas.build.preview.env?.EXPO_PUBLIC_ENABLE_GAP_PREVIEW).toBeUndefined();
    expect(eas.build.production.env?.EXPO_PUBLIC_ENABLE_GAP_PREVIEW).toBeUndefined();
  });
});
