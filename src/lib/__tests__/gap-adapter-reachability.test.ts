// ─────────────────────────────────────────────────────────────────────────────
// A gap the register calls closed, that the client still reads from the adapter
//
// Two mechanisms, each correct, that combine into silence.
//
// **One.** `CommunityGapNotice` — and its financial twin — return null the
// moment an entry says `backendStatus: 'connected'`. A member does not need to
// be told about a hole that has been filled. Right.
//
// **Two.** Every gap adapter call goes through `assertEnabled(gapKey)`, and the
// hooks that wrap them carry `enabled: areXGapsEnabled()` — false in any build
// without `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. A disabled query answers with
// nothing and no error. Also right.
//
// Put them together on a hook nobody repointed and the screen shows an empty
// state with the explanation suppressed. That is how the announcements feed and
// the impact view came to render nothing at all, for as long as the register
// had been accurate about the backend — the register being *right* is what
// silenced them.
//
// This walks the whole client rather than one module: eight gap adapters and
// twelve registers, resolved by import path so a real hook and a gap hook of
// the same name are not confused (they exist — `useDeposits` is both).
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as {
  readFileSync(p: string, e: string): string;
  readdirSync(p: string, o?: object): string[];
  statSync(p: string): { isDirectory(): boolean };
  existsSync(p: string): boolean;
};
const path = require('path') as {
  join(...s: string[]): string;
  relative(a: string, b: string): string;
  basename(p: string, e?: string): string;
};

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

/**
 * Hooks that read a connected gap adapter **and are meant to**.
 *
 * Each needs a reason that says why the member is not left with silence. A new
 * entry here should be rare; the usual answer is to repoint the hook.
 */
const ALLOWED: Record<string, string> = {
  useDonateToCampaign:
    'The donation itself goes through B15. The gap call only labels it against ' +
    'the campaign, is wrapped in try/catch and is deliberately swallowed — a ' +
    'reporting gap, never a money gap.',
  useCreatorLesson:
    'Falls back to the adapter only without a courseId. With one it reads the ' +
    'certified route, and `enabled` accounts for both.',
};

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const ALL = walk(SRC);
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

/** Every gap adapter function, and the gap key it asserts on. */
function adapterKeys(): Map<string, string> {
  const found = new Map<string, string>();

  for (const p of ALL.filter((f) => /-gap-api\.ts$/.test(f))) {
    const mod = path.basename(p, '.ts');
    const s = read(p);
    const fns = [...s.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)];

    fns.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < fns.length ? fns[i + 1].index! : s.length;
      const body = s.slice(start, end);

      const key =
        /(?:read|write|readList|readPage)\s*<[^>]*>\(\s*'([A-Za-z0-9_]+)'/.exec(body) ??
        /assertEnabled\('([A-Za-z0-9_]+)'\)/.exec(body) ??
        /(?:read|write|readList)\(\s*'([A-Za-z0-9_]+)'/.exec(body);

      if (key) found.set(`${mod}.${m[1]}`, key[1]);
    });
  }

  return found;
}

/** Every register entry that claims the backend is there. */
function connectedKeys(): Set<string> {
  const connected = new Set<string>();

  for (const p of ALL.filter((f) => /[/\\]config[/\\][a-z-]+-gaps\.ts$/.test(f))) {
    const s = read(p);
    const entries = [...s.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*): \{/gm)];

    entries.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < entries.length ? entries[i + 1].index! : s.length;
      if (/backendStatus: 'connected'/.test(s.slice(start, end))) connected.add(m[1]);
    });
  }

  return connected;
}

describe('the sweep can see what it is looking for', () => {
  // A probe that finds nothing passes for the wrong reason. These pin the
  // parse itself, so a rename in either file fails here rather than quietly
  // emptying the check below.
  it('resolves gap keys for the adapters', () => {
    expect(adapterKeys().size).toBeGreaterThan(100);
  });

  it('reads backendStatus out of the registers', () => {
    expect(connectedKeys().size).toBeGreaterThan(50);
  });

  it('finds the hook files it means to walk', () => {
    expect(ALL.filter((f) => /[/\\]hooks[/\\]/.test(f)).length).toBeGreaterThan(5);
  });
});

describe('no screen reads a gap adapter the register calls connected', () => {
  const keys = adapterKeys();
  const connected = connectedKeys();

  /** hook name -> { gapKey, module } for hooks touching a connected adapter. */
  const suspect = new Map<string, { key: string; module: string }>();

  for (const p of ALL.filter((f) => /[/\\]hooks[/\\]/.test(f))) {
    const s = read(p);
    const aliases = [
      ...s.matchAll(/import \* as ([A-Za-z0-9_]+) from '[^']*\/([a-z-]+-gap-api)'/g),
    ];
    if (aliases.length === 0) continue;

    const hooks = [...s.matchAll(/^export function (use[A-Za-z0-9_]+)/gm)];

    hooks.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < hooks.length ? hooks[i + 1].index! : s.length;
      const body = s.slice(start, end);

      for (const [, alias, mod] of aliases) {
        for (const call of body.matchAll(
          new RegExp(`\\b${alias}\\.([A-Za-z0-9_]+)`, 'g')
        )) {
          const key = keys.get(`${mod}.${call[1]}`);
          if (key && connected.has(key)) {
            suspect.set(m[1], { key, module: rel(p) });
          }
        }
      }
    });
  }

  /** Screens importing `hook` from exactly `module`. */
  function consumers(hook: string, module: string): string[] {
    const stem = path.basename(module, '.ts');

    return ALL.filter((p) => {
      const r = rel(p);
      if (!r.startsWith('src/app/') && !r.startsWith('src/components/')) return false;

      for (const m of read(p).matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']*)'/g)) {
        if (!m[2].endsWith(stem)) continue;
        if (new RegExp(`\\b${hook}\\b`).test(m[1])) return true;
      }
      return false;
    }).map(rel);
  }

  it('leaves no hook reachable from a screen reading a silenced gap', () => {
    const offenders: string[] = [];

    for (const [hook, { key, module }] of suspect) {
      if (ALLOWED[hook]) continue;

      const used = consumers(hook, module);
      if (used.length > 0) {
        offenders.push(`${hook} [${key}] in ${module}\n      used by ${used.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps a written reason for each exception', () => {
    // An allow-list nobody has to justify becomes a place to hide things.
    for (const [hook, reason] of Object.entries(ALLOWED)) {
      expect(suspect.has(hook)).toBe(true);
      expect(reason.length).toBeGreaterThan(60);
    }
  });
});
