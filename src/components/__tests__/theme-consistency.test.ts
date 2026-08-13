/**
 * A colour a member sees must be able to change with the colour scheme.
 *
 * Two ways of writing a colour cannot:
 *
 *   1. `lightTokens.color.…` in a rendered style. The name says light, and it
 *      stays light. The audit found this on `Input`, `Button`, `Skeleton` and
 *      the message composer — so once the surfaces followed the scheme into
 *      dark, the *text inside the fields* was still near-black on near-black.
 *
 *   2. A light surface hex written straight into an inline `style`. Classes
 *      resolve through CSS custom properties and follow the scheme; an inline
 *      style object has no class for the media query to reach, so
 *      `backgroundColor: '#FFFFFF'` is white for ever.
 *
 * Both are source-level defects — "somebody wrote a colour that cannot move" —
 * so this reads the source rather than rendering 252 screens twice.
 *
 * White *foregrounds* are deliberately not covered. `color: '#FFFFFF'` and
 * `text-white` sit on filled brand and status backgrounds, which do not change
 * with the scheme, so white is correct there under both.
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

const SRC: string = path.join(__filename, '..', '..', '..');

/**
 * `design-system/` is where both token sets are defined and where the active
 * one is chosen, so naming them there is the point rather than a violation.
 */
const TOKEN_HOME = /^design-system\//;

/**
 * The map providers draw cluster markers as a coloured pin with a white ring.
 * That ring sits on map tiles, not on an application surface, and the
 * convention for a map pin is a white ring under either scheme — so here the
 * literal is the correct answer rather than an oversight.
 */
const EXEMPT = new Set<string>([
  'lib/maps/providers/canvas-map.tsx',
  'lib/maps/providers/native-map.tsx',
]);

/** Light surfaces and hairlines. Anything painting one of these is pinned. */
const LIGHT_SURFACE = /#(FFFFFF|FFF|F9FAFB|F8F9FC|F3F4F6|F3F4F8|F5F5F5|E5E7EB|E5E7EF|EEEEEE|F1F5F9|FAFAFA|FAF9F9)\b/i;

/** Only background and border properties — white foregrounds are exempt. */
const SURFACE_PROP =
  /(backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor)\s*:\s*'([^']+)'/;

/**
 * Near-black text. The mirror of the rule above: white text is fine because it
 * sits on a fill that does not move, but *dark* text is only ever legible on a
 * light surface, so writing it as a literal pins the surface with it.
 */
const DARK_TEXT = /#(0F1117|111827|000000|000|1F2937|272A35|374151|3A3D4A|4B5268|4B5563|6B7280)\b/i;
const TEXT_PROP = /\bcolor\s*:\s*'([^']+)'/;

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

/** Strips comments so a colour named in prose is not a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('theme consistency', () => {
  const pinnedTokens: string[] = [];
  const pinnedSurfaces: string[] = [];
  const pinnedText: string[] = [];

  beforeAll(() => {
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      if (TOKEN_HOME.test(rel)) continue;
      if (EXEMPT.has(rel)) continue;

      const source = stripComments(fs.readFileSync(file, 'utf8'));

      if (/\b(light|dark)Tokens\s*\./.test(source)) pinnedTokens.push(rel);

      for (const line of source.split('\n')) {
        const surface = line.match(SURFACE_PROP);
        if (surface && LIGHT_SURFACE.test(surface[2])) {
          pinnedSurfaces.push(`${rel} — ${surface[1]}: ${surface[2]}`);
        }
        const text = line.match(TEXT_PROP);
        if (text && DARK_TEXT.test(text[1])) {
          pinnedText.push(`${rel} — color: ${text[1]}`);
        }
      }
    }
  });

  it('reads colours from the active token set, never from the light one by name', () => {
    expect(pinnedTokens).toEqual([]);
  });

  it('has no light surface written as a hex literal in an inline style', () => {
    expect(pinnedSurfaces).toEqual([]);
  });

  it('has no near-black text written as a hex literal in an inline style', () => {
    expect(pinnedText).toEqual([]);
  });
});
