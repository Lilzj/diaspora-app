// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Store selector stability
//
// One property, for every Zustand store in the application:
//
//     **A selector passed to a store hook must return a stable reference.**
//
// ── The bug this exists to prevent, which shipped once ───────────────────────
//
// Zustand v5 subscribes through `useSyncExternalStore`, which compares
// snapshots by **reference**. v4's automatic shallow comparison was removed. A
// selector that builds an object or an array therefore returns a new snapshot
// on every render, React re-renders to catch up, and that produces another one.
//
// React reports it as:
//
//     "The result of getSnapshot should be cached to avoid an infinite loop"
//
// and then throws:
//
//     "Maximum update depth exceeded"
//
// which renders as a **blank screen**.
//
// That is exactly what happened with `selectCommunityFilterSelection` passed to
// `useCommunityContextStore`. It blanked the app immediately after sign-in,
// because the home tab renders `<CommunitySelectorSheet>`, which calls
// `useCommunityContext()`. It survived a typecheck, 3,050 unit tests and a
// production export, because **every one of those tests a shape rather than a
// subscription** — the selector is correct as a pure function and only wrong as
// a live subscription.
//
// ── Why this is a source scan and not a render test ──────────────────────────
//
// A render test proves one component is safe today. This proves the property
// for every call site at once, including ones nobody has written yet, and it
// catches the *named* selector form that a regex over inline arrows misses —
// which is precisely how the original slipped through.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): {
    name: string;
    isDirectory(): boolean;
  }[];
};
const path = require('path') as {
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Source with comments blanked, preserving line numbers.
 *
 * Required, not tidiness: the fix for this very bug documents the forbidden
 * call in prose, and a scanner that read comments would flag the explanation of
 * why the code no longer does it. Replaced with spaces rather than removed so
 * reported line numbers still point at real code.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));
}

/** The argument text of every `useSomethingStore(...)` call, with its location. */
function storeSelectorCalls(rawSource: string, file: string) {
  const source = stripComments(rawSource);
  const calls: { arg: string; line: number; file: string }[] = [];
  const re = /use[A-Za-z0-9_]*Store\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source))) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
      const char = source[i];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      i += 1;
    }
    const arg = source.slice(match.index + match[0].length, i - 1).trim();
    if (arg.length === 0) continue; // whole-store read — a stable reference
    calls.push({
      arg,
      line: source.slice(0, match.index).split('\n').length,
      file,
    });
  }

  return calls;
}

const ROOT = path.join(process.cwd(), 'src');
const FILES = sourceFiles(ROOT);

/**
 * Names of exported functions this codebase knows allocate.
 *
 * `selectCommunityFilterSelection` is the one that shipped the bug. It stays
 * exported because reading it once through `getState()` is legitimate; what is
 * forbidden is passing it to a store hook, and this list is how that is
 * enforced by name rather than by inspecting its body from another file.
 */
const ALLOCATING_SELECTORS = ['selectCommunityFilterSelection'];

describe('no store subscription uses an allocating selector', () => {
  it('finds store calls to check — the scan itself is not vacuous', () => {
    const total = FILES.reduce(
      (count, file) => count + storeSelectorCalls(fs.readFileSync(file, 'utf8'), file).length,
      0
    );

    // Guards against the scan silently matching nothing after a refactor and
    // reporting success for the wrong reason.
    expect(total).toBeGreaterThan(20);
  });

  it('no inline selector builds a new object or array', () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      for (const call of storeSelectorCalls(fs.readFileSync(file, 'utf8'), file)) {
        if (!call.arg.includes('=>')) continue;
        if (call.arg.includes('useShallow')) continue;

        const body = call.arg.slice(call.arg.indexOf('=>') + 2).trim();

        const buildsLiteral = /^\(?\s*[{[]/.test(body);
        const allocatesViaMethod =
          /\.(map|filter|slice|concat|sort|reduce|flatMap|entries|keys|values)\s*\(/.test(body);

        if (buildsLiteral || allocatesViaMethod) {
          offenders.push(
            `${path.relative(process.cwd(), call.file).split(path.sep).join('/')}:${call.line} — ${body.replace(/\s+/g, ' ').slice(0, 90)}`
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no known-allocating named selector is passed to a store hook', () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      for (const call of storeSelectorCalls(fs.readFileSync(file, 'utf8'), file)) {
        // The form the original bug took: a bare identifier, not an arrow.
        // A regex over inline arrows cannot see this, which is why it shipped.
        const bare = call.arg.replace(/\s+/g, '');
        if (ALLOCATING_SELECTORS.includes(bare)) {
          offenders.push(
            `${path.relative(process.cwd(), call.file).split(path.sep).join('/')}:${call.line} — ${bare}`
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('selectCommunityFilterSelection is still correct as a pure function', () => {
  // The fix moved the derivation; it did not change what the shape should be.
  // These assert the behaviour survived, so a future edit cannot quietly change
  // the scope resolution while making the reference stable.
  const {
    selectCommunityFilterSelection,
  } = require('@/store/community-context') as {
    selectCommunityFilterSelection: (state: {
      mode: string;
      activeCommunityId: string | null;
      selectedCommunityIds: string[];
    }) => { mode: string; communityIds?: string[] };
  };

  it('SELECTED_COMMUNITY carries the active id', () => {
    expect(
      selectCommunityFilterSelection({
        mode: 'SELECTED_COMMUNITY',
        activeCommunityId: 'ng',
        selectedCommunityIds: [],
      })
    ).toEqual({ mode: 'SELECTED_COMMUNITY', communityIds: ['ng'] });
  });

  it('SELECTED_COMMUNITY with no active id carries an empty list, not every community', () => {
    // `none` is not `all` — the distinction Phase 13's scope module is built on.
    expect(
      selectCommunityFilterSelection({
        mode: 'SELECTED_COMMUNITY',
        activeCommunityId: null,
        selectedCommunityIds: ['ng'],
      })
    ).toEqual({ mode: 'SELECTED_COMMUNITY', communityIds: [] });
  });

  it('CROSS_COMMUNITY carries the explicit selection', () => {
    expect(
      selectCommunityFilterSelection({
        mode: 'CROSS_COMMUNITY',
        activeCommunityId: 'ng',
        selectedCommunityIds: ['ng', 'gh'],
      })
    ).toEqual({ mode: 'CROSS_COMMUNITY', communityIds: ['ng', 'gh'] });
  });

  it('every other mode carries no ids', () => {
    for (const mode of ['ALL_COMMUNITIES', 'PRIMARY_COMMUNITY', 'INTERESTED_COMMUNITIES']) {
      expect(
        selectCommunityFilterSelection({
          mode,
          activeCommunityId: 'ng',
          selectedCommunityIds: ['ng'],
        })
      ).toEqual({ mode });
    }
  });

  it('allocates a new reference every call — which is why it must not be subscribed to', () => {
    const state = {
      mode: 'SELECTED_COMMUNITY',
      activeCommunityId: 'ng',
      selectedCommunityIds: [],
    };

    // The property that made it unsafe, asserted directly so the reason this
    // whole file exists stays visible rather than becoming folklore.
    expect(selectCommunityFilterSelection(state)).not.toBe(
      selectCommunityFilterSelection(state)
    );
  });
});
