// ─────────────────────────────────────────────────────────────────────────────
// No call site may treat `response.data.data` as an array
//
// ── Why a static guard rather than more unit tests ───────────────────────────
//
// `platform-envelope.ts` has warned about this in prose since Wave B: "Most
// screens assumed `response.data.data` was a bare array and called `.filter` /
// `.slice` on it directly… against a paged route `data` is an object and
// `.filter` is not a function — a crash rather than a wrong number."
//
// The prose did not stop it happening five more times. On 22 Aug 2026 a device
// walkthrough found, in one sitting:
//
//   · `store/conversation.ts`          — the inbox; crashed the app on launch
//                                        for any member with a conversation
//   · `store/conversation.ts`          — the message thread; every conversation
//                                        opened blank
//   · `store/conversation.ts`          — conversation search
//   · `lib/community-life-api.ts`      — events and organisations browse
//   · `app/job/[id].tsx`               — "Similar jobs", silently empty
//   · `components/GlobalLocationSelector.tsx` — location search
//
// Every one typechecked, because `response.data` is `any` at these call sites,
// and every one had green unit tests, because the fixtures were already arrays.
// Types cannot see it and mocks agree with it, so the check has to be textual.
//
// ── What this permits ────────────────────────────────────────────────────────
//
// Reading `response.data.data` is fine — most routes answer a single object
// there. What is banned is *treating the result as a list*: chaining an array
// method onto it, annotating it `T[]`, or mapping the variable it was assigned
// to a few lines later. Those sites must go through `readPage` / `toList`,
// which accept a bare array **and** a page, so they stay correct whichever
// shape the route settles on.
// ─────────────────────────────────────────────────────────────────────────────

// `require` rather than an import, matching `palette-classes.test.ts` — the test
// runs under Jest, where these exist, while `tsc --noEmit` stays clean without
// adding `"node"` to the tsconfig `types` field, which breaks `__DEV__` in other
// suites.
/* eslint-disable @typescript-eslint/no-var-requires */
declare const __filename: string;
declare const require: (id: string) => unknown;

const fs = require('fs') as {
  readdirSync: (p: string) => string[];
  readFileSync: (p: string, enc: string) => string;
  statSync: (p: string) => { isDirectory: () => boolean };
};
const path = require('path') as { join: (...parts: string[]) => string };

const SRC: string = path.join(__filename, '..', '..', '..');

const ARRAY_CALL =
  '(map|filter|slice|forEach|reduce|find|some|every|length|concat|sort|flatMap|join|includes)';

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

interface Offence {
  file: string;
  line: number;
  source: string;
  why: string;
}

function findOffences(): Offence[] {
  const offences: Offence[] = [];

  for (const file of sourceFiles(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    lines.forEach((line: string, i: number) => {
      if (!line.includes('.data.data')) return;

      const trimmed = line.trim();
      // The prose in this repo quotes the pattern constantly; comments are not code.
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

      const after = line.split('.data.data')[1] ?? '';
      const chained = new RegExp(`\\.${ARRAY_CALL}\\b`).test(after);

      const beforeAssignment = line.split('=')[0];
      const annotatedArray = beforeAssignment.includes('[]');

      let mappedLater = false;
      const declaration = /(?:const|let|var)\s+(\w+)[^=]*=\s*[^;]*\.data\.data/.exec(line);
      if (declaration) {
        const usage = new RegExp(`\\b${declaration[1]}\\.${ARRAY_CALL}\\b`);
        mappedLater = lines.slice(i + 1, i + 16).some((next: string) => usage.test(next));
      }

      if (chained || annotatedArray || mappedLater) {
        offences.push({
          file: file.slice(SRC.length + 1).replace(/\\/g, '/'),
          line: i + 1,
          source: trimmed.slice(0, 120),
          why: [
            chained && 'array method chained directly',
            annotatedArray && 'annotated as an array',
            mappedLater && 'the variable is mapped/filtered below',
          ]
            .filter(Boolean)
            .join('; '),
        });
      }
    });
  }

  return offences;
}

describe('`response.data.data` is never treated as a list', () => {
  it('finds no call site that assumes the envelope holds a bare array', () => {
    const offences = findOffences();

    const report = offences
      .map((o) => `  ${o.file}:${o.line}  (${o.why})\n      ${o.source}`)
      .join('\n');

    expect(
      offences.length === 0
        ? ''
        : `${offences.length} call site(s) treat \`response.data.data\` as an array.\n` +
            `A paged route puts the list at \`data.items\`, so this is an empty screen ` +
            `or a crash, not a wrong number.\nUse \`readPage\`/\`toList\` from ` +
            `'@/lib/platform-envelope' — both accept a bare array too.\n\n${report}`,
    ).toBe('');
  });

  it('detects the pattern it is meant to detect', () => {
    // A guard that cannot fail is a guard that proves nothing. This exercises
    // the same predicate the sweep uses, on each of the three shapes the real
    // defects took.
    const chained = 'const a = res.data.data.filter((x) => x);';
    const annotated = 'const b: Job[] = res.data.data;';
    const inert = 'const c = res.data.data;';

    const isArrayContext = (line: string) =>
      new RegExp(`\\.${ARRAY_CALL}\\b`).test(line.split('.data.data')[1] ?? '') ||
      line.split('=')[0].includes('[]');

    expect(isArrayContext(chained)).toBe(true);
    expect(isArrayContext(annotated)).toBe(true);
    expect(isArrayContext(inert)).toBe(false);
  });
});
