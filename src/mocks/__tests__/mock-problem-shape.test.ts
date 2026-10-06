// Every mock error carries the platform's `code`.
//
// The platform writes the error code in `code` (`PlatformProblem.Enrich`) and the
// client reads it there. Mocks that answered `{ message }` or put the code only in
// `title` made development builds show a different error from production for the
// same refusal: on 6 Oct 2026 Google Calendar said "That request could not be
// completed" in development and "Not available on Diaspora yet" in production.
// 63 inline replies and two helpers were converted to `platformProblem`.
//
// This reads the handler sources rather than running them, so it sees every
// branch, including ones no test drives.

// Typed by hand: this project ships no Node type definitions (see
// `conversation-own-messages.test.tsx` for the same pattern).
const fs = require('fs') as {
  readFileSync(p: string, e: string): string;
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const path = require('path') as { join(...s: string[]): string; relative(a: string, b: string): string };

const MOCKS = path.join(process.cwd(), 'src', 'mocks');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** The index just past the `}` closing the object that opens at `open`. */
function closeOf(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

interface ErrorReply {
  file: string;
  line: number;
  body: string;
}

/** Every literal `[4xx|5xx, { ... }]` reply in the mocks. */
function literalErrorReplies(): ErrorReply[] {
  const found: ErrorReply[] = [];
  for (const file of sources(MOCKS)) {
    const text = fs.readFileSync(file, 'utf8');
    const pattern = /\[\s*[45]\d\d\s*,\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const open = text.indexOf('{', match.index);
      found.push({
        file: path.relative(MOCKS, file),
        line: text.slice(0, match.index).split('\n').length,
        body: text.slice(open, closeOf(text, open)),
      });
    }
  }
  return found;
}

function platformProblemCalls(): number {
  return sources(MOCKS).reduce(
    (count, file) => count + (fs.readFileSync(file, 'utf8').match(/platformProblem\(/g) ?? []).length,
    0
  );
}

describe('mock error replies', () => {
  it('finds the replies it is checking (a sweep that finds nothing passes for nothing)', () => {
    // The helpers in analytics, automation, community, creator, financial and
    // the others are literal replies; the converted inline ones are calls.
    expect(literalErrorReplies().length).toBeGreaterThanOrEqual(10);
    expect(platformProblemCalls()).toBeGreaterThanOrEqual(60);
  });

  it('every literal error reply carries `code`', () => {
    const missing = literalErrorReplies()
      .filter((reply) => !/\bcode\b/.test(reply.body))
      .map((reply) => `${reply.file}:${reply.line}`);

    expect(missing).toEqual([]);
  });

  it('no mock answers with `{ message }`, a shape the platform never sends', () => {
    const shaped = literalErrorReplies()
      .filter((reply) => /^\{\s*message\s*:/.test(reply.body))
      .map((reply) => `${reply.file}:${reply.line}`);

    expect(shaped).toEqual([]);
  });
});
