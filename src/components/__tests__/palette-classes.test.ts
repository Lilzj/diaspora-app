/**
 * A colour class that does not exist paints nothing.
 *
 * Tailwind emits a rule only for the keys in the palette. `text-neutral-450`,
 * `text-neutral-805`, `border-neutral-250` and seventeen more steps like them
 * were never in it — so the element got no colour and fell back to the
 * platform default, which on Android is black.
 *
 * In light mode that looked deliberate: black text on a white card reads as a
 * heading. It only became visible as a defect in dark mode, where the same
 * fallback is black text on a dark surface. 274 occurrences across the app,
 * and nothing in the type system, the linter or the test suite had anything to
 * say about any of them — `className` is a string.
 *
 * So this test is the thing that says something. It does not care what the
 * class means; it only asserts that every palette class named in the source is
 * a key the config can actually resolve.
 */

// `@types/node` is not a dependency of this app, so these are pulled in through
// `require` rather than an import — the test runs under Jest, where they exist,
// while `tsc --noEmit` stays clean without adding a type package for one file.
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs') as {
  readdirSync: (p: string, o: { withFileTypes: true }) => Array<{ name: string; isDirectory: () => boolean }>;
  readFileSync: (p: string, enc: string) => string;
};
const path = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
};

declare const __filename: string;
declare const require: (id: string) => unknown;

const SRC: string = path.join(__filename, '..', '..', '..');
const CONFIG = require(path.join(SRC, '..', 'tailwind.config.js')) as {
  theme: { extend: { colors: Record<string, unknown> } };
};

const PALETTES = CONFIG.theme.extend.colors;

/** `bg-`, `text-`, `border-` … anything that takes a colour. */
const COLOUR_CLASS =
  /\b(?:bg|text|border|divide|ring|placeholder|shadow|from|via|to)-([a-zA-Z]+)-(\d+)\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('palette classes', () => {
  const missing: string[] = [];

  beforeAll(() => {
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      const source = fs.readFileSync(file, 'utf8');

      for (const match of source.matchAll(COLOUR_CLASS)) {
        const [full, family, step] = match;

        // Only families this config actually defines as a numbered scale.
        // `text-2xl`, `border-2` and Tailwind's own greys are not ours to
        // police — the first two are not colours and the third resolves in
        // Tailwind's default theme.
        const palette = PALETTES[family];
        if (!palette || typeof palette !== 'object') continue;

        if (!(step in (palette as Record<string, unknown>))) {
          missing.push(`${rel} — ${full}`);
        }
      }
    }
  });

  it('names only steps the palette defines', () => {
    // Deduplicated by class so the failure reads as a list of typos rather
    // than a list of files.
    const byClass = [...new Set(missing.map((m) => m.split('— ')[1]))].sort();
    expect({ classes: byClass, occurrences: missing.length }).toEqual({
      classes: [],
      occurrences: 0,
    });
  });
});
