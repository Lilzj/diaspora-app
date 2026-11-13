// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what a production bundle is allowed to contain (FSEC-004)
//
// ── The defect this test is the memory of ───────────────────────────────────
//
// `src/mocks/index.ts` has refused to install its adapter in a release build
// since Remediation Rule 5, and `production-mock-gate.test.ts` proves it still
// does. That gate decides *behaviour*: a production binary talks to the real
// backend.
//
// It never decided *presence*. `app/_layout.tsx` imported `@/mocks` statically,
// so the module, its 32-module closure, ~1.7 MB of fixtures and
// `axios-mock-adapter` — a devDependency — were compiled into the shipped
// bytecode regardless. Measured on the 13 Nov 2026 Android export: the mock
// adapter's own startup strings and ten of ten sampled fixture strings were in
// `entry-*.hbc`.
//
// ── The part that is easy to get wrong, and was ─────────────────────────────
//
// A guard at the call site does not remove anything. Metro collects
// dependencies from the AST at transform time, before any minifier evaluates
// `if (false)`, so a `require()` or an `import()` inside unreachable code is
// still an edge and the module is still bundled.
//
// This is not theory. `src/store/auth.ts` has carried
//
//     if (areSimulatedFeaturesEnabled()) {
//       require('@/mocks/automation-gap-data').resetAutomationState();
//     }
//
// since 20 Oct 2026, with a comment stating that the `require` is what keeps
// the module out of production bundles. All ten sampled strings from that
// module were in the baseline export. The guard was right about behaviour and
// the comment was wrong about the bundle, for three weeks, because nothing
// measured it. FSEC-001's lesson in a different costume: a claim nothing checks
// is a claim that drifts.
//
// So the swap happens at **resolution**, in `metro.config.js`, and the register
// of what is swapped lives in `scripts/production-stubs.js`.
//
// ── What this file can and cannot prove ─────────────────────────────────────
//
// It cannot prove the bundle. Jest does not run Metro, and exporting one takes
// minutes. What it proves is everything that decides the bundle: the register
// is consistent, each stub answers every name production code actually imports,
// `metro.config.js` still performs the swap and still chains NativeWind's
// resolver, and — the one that matters most over time — **no new production
// reach into `src/mocks` has appeared** that neither a stub nor this list
// accounts for.
//
// The bundle itself is checked by exporting one:
//
//     npx expo export --platform android --output-dir /tmp/bundle
//     grep -c "Initializing API mocks" /tmp/bundle/_expo/static/js/android/*.hbc
//
// That grep must return 0. Note that Hermes stores a pure-ASCII string in its
// one-byte table and anything containing an em dash or a curly quote in UTF-16,
// so a phrase chosen for a grep must be plain ASCII or the search quietly finds
// nothing and looks like a pass.
// ─────────────────────────────────────────────────────────────────────────────

// `require`d locally with the narrowest signature that works, rather than
// `import { readFileSync } from 'fs'`. Adding "node" to tsconfig's `types`
// shadows the ambient React Native `__DEV__` declaration and breaks twenty
// boundary suites — the same reason `production-mock-gate.test.ts` and
// `gap-disclosure-regression.test.ts` do it this way.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const readdirSync: (
  path: string,
  options: { withFileTypes: true }
) => { name: string; isDirectory(): boolean }[] = require('fs').readdirSync;
const join: (...parts: string[]) => string = require('path').join;
const resolvePath: (...parts: string[]) => string = require('path').resolve;

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

type RegisterEntry = { kind: 'stub' | 'twin'; module: string; stub: string; reason: string };

const register = require('../../../scripts/production-stubs') as {
  DEV_ONLY_MODULES: RegisterEntry[];
  stubFor: (resolvedPath: string | null | undefined, rootDir: string) => string | null;
  maySimulate: (context: { dev?: boolean }) => boolean;
};

const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

/** Every `.ts`/`.tsx` under `src`, excluding test directories. */
function productionSources(dir: string = SRC, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      productionSources(full, found);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(full);
    }
  }
  return found;
}

/** The names a module imports from `specifier`, across every import spelling. */
function importedNames(source: string, specifier: string): string[] {
  const names: string[] = [];
  const escaped = specifier.replace(/[/\-]/g, (c) => `\\${c}`);
  const patterns = [
    new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${escaped}'`, 'g'),
    new RegExp(`require\\('${escaped}'\\)\\s*as\\s*\\{([^}]*)\\}`, 'g'),
    new RegExp(`\\{([^}]*)\\}\\s*=\\s*require\\('${escaped}'\\)`, 'g'),
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      for (const part of match[1].split(',')) {
        // `resetAutomationState: () => void` in a cast, `foo as bar` in an
        // import — the name is whatever comes first.
        const name = part.trim().split(/[\s:]/)[0];
        if (name && name !== 'type') names.push(name);
      }
    }
  }
  return [...new Set(names)];
}

describe('the dev-only module register', () => {
  it('names files that exist, on both sides of every swap', () => {
    expect(register.DEV_ONLY_MODULES.length).toBeGreaterThan(0);

    for (const entry of register.DEV_ONLY_MODULES) {
      expect(existsSync(join(ROOT, entry.module))).toBe(true);
      expect(existsSync(join(ROOT, entry.stub))).toBe(true);
      expect(entry.reason).toMatch(/FSEC-004|FSEC-003/);
      expect(['stub', 'twin']).toContain(entry.kind);
    }
  });

  it('covers both findings, so neither half can be deleted unnoticed', () => {
    const kinds = register.DEV_ONLY_MODULES.map((entry) => entry.kind);
    expect(kinds).toContain('stub');
    expect(kinds).toContain('twin');
  });

  it('maps a resolved path to its stub, and leaves everything else alone', () => {
    for (const entry of register.DEV_ONLY_MODULES) {
      const resolved = resolvePath(ROOT, entry.module);
      expect(register.stubFor(resolved, ROOT)).toBe(resolvePath(ROOT, entry.stub));
    }

    expect(register.stubFor(resolvePath(ROOT, 'src/lib/apiClient.ts'), ROOT)).toBeNull();
    expect(register.stubFor(resolvePath(ROOT, 'src/mocks/countries.ts'), ROOT)).toBeNull();
    expect(register.stubFor(null, ROOT)).toBeNull();
  });

  it('swaps in a production bundle, and never in a development or preview one', () => {
    const flag = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    try {
      delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

      expect(register.maySimulate({ dev: true })).toBe(true);
      expect(register.maySimulate({ dev: false })).toBe(false);

      // An internal test build is a release bundle that opted in. It must keep
      // the adapter, or every internal APK becomes untestable — the third of
      // the three build shapes `production-mock-gate.test.ts` covers.
      process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = '1';
      expect(register.maySimulate({ dev: false })).toBe(true);
    } finally {
      if (flag === undefined) delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
      else process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = flag;
    }
  });

  it('fails safe if Metro ever stops reporting `dev` on the resolution context', () => {
    // Back to today's behaviour — the mocks ship, which is a finding — rather
    // than stripping the adapter out of development builds, which no unit test
    // would catch because jest never runs Metro.
    const flag = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    try {
      delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
      expect(register.maySimulate({})).toBe(true);
    } finally {
      if (flag !== undefined) process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = flag;
    }
  });
});

describe('every stub answers what production code asks of it', () => {
  // Stubs only. A twin is the same module with material removed, so its surface
  // is its source's by construction; `production-registers-drift.test.ts` is
  // what holds that. A stub is hand-written, which is where a name can go
  // missing — and it would go missing as a runtime crash in a release binary
  // and nowhere else, because jest and tsc both see the real module.
  for (const entry of register.DEV_ONLY_MODULES.filter((e) => e.kind === 'stub')) {
    it(entry.module, () => {
      // `src/mocks/index.ts` is imported as `@/mocks`; everything else as the
      // path without its extension.
      const alias = entry.module
        .replace(/^src\//, '@/')
        .replace(/\/index\.tsx?$/, '')
        .replace(/\.tsx?$/, '');

      const asked = new Set<string>();
      for (const file of productionSources()) {
        if (file.startsWith(join(SRC, 'mocks'))) continue;
        if (file.startsWith(join(SRC, 'build'))) continue;
        for (const name of importedNames(readFileSync(file, 'utf8'), alias)) {
          asked.add(name);
        }
      }

      // If nothing asks for it any more the entry is dead weight, and leaving
      // it behind is how a register stops describing the codebase.
      expect(asked.size).toBeGreaterThan(0);

      const stub = readFileSync(join(ROOT, entry.stub), 'utf8');
      for (const name of asked) {
        expect(stub).toContain(`export function ${name}(`);
      }
    });
  }
});

describe('metro.config.js', () => {
  // A source assertion, and the only honest one available: requiring the config
  // here would pull Metro and NativeWind into the jest-expo environment, and
  // what needs proving is the wiring rather than the resolver's behaviour,
  // which the register's own tests above cover directly.
  const config = read('metro.config.js');

  it('performs the swap from the shared register', () => {
    expect(config).toContain("require(\"./scripts/production-stubs\")");
    expect(config).toContain('maySimulate(context)');
    expect(config).toContain('stubFor(');
  });

  it('chains the inner resolver rather than replacing it', () => {
    // NativeWind sets its own `resolveRequest`. Assigning over it turns off
    // Tailwind's CSS interop, which fails as styling that silently stops
    // applying rather than as an error.
    expect(config).toContain('const inner = config.resolver.resolveRequest');
    expect(config).toContain('(inner ?? context.resolveRequest)');
  });
});

describe('what production code may reach inside src/mocks', () => {
  // The class guard. Each entry below is a module under `src/mocks` that
  // non-test code imports directly, with the reason it is allowed to ship. A
  // new import that is not on this list fails, which is the point: the next
  // fixture to reach a screen should have to argue for itself.
  const ALLOWED: Record<string, string> = {
    countries:
      'The ISO country list with flags and calling codes. Reference data that ' +
      'thirteen screens need, misfiled under src/mocks by history rather than ' +
      'by nature. Nothing about it is simulated.',
    data:
      'The language and category lists. Reference data, same as countries.',
    'explore-data':
      'mockTutorials, read by the search screen. Fixture content on a ' +
      'production surface — tracked separately; it is a disclosure question, ' +
      'not a bundle-shape one.',
    'automation-gap-data':
      'Reached only by store/auth.ts, guarded, and resolved to a stub in a ' +
      'production bundle. On the dev-only register.',
    '': 'src/mocks/index.ts — the adapter entry point. On the dev-only register.',
  };

  it('reaches only the modules this list accounts for', () => {
    const reached = new Map<string, string[]>();
    const pattern = /['"]@\/mocks(?:\/([a-z0-9/-]+))?['"]/g;

    for (const file of productionSources()) {
      if (file.startsWith(join(SRC, 'mocks'))) continue;
      const source = readFileSync(file, 'utf8');
      // Drop comments, so a header that quotes an old import is not a reach.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(code)) !== null) {
        const moduleName = match[1] ?? '';
        reached.set(moduleName, [...(reached.get(moduleName) ?? []), file]);
      }
    }

    const unexpected = [...reached.keys()].filter((name) => !(name in ALLOWED));
    expect({ unexpected, where: unexpected.map((n) => reached.get(n)) }).toEqual({
      unexpected: [],
      where: [],
    });
  });

  it('has not left an entry on the list that nothing reaches any more', () => {
    const code = productionSources()
      .filter((file) => !file.startsWith(join(SRC, 'mocks')))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

    for (const name of Object.keys(ALLOWED)) {
      const needle = name === '' ? "'@/mocks'" : `'@/mocks/${name}'`;
      expect({ name, present: code.includes(needle) }).toEqual({ name, present: true });
    }
  });
});
