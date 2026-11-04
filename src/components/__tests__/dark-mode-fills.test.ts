/**
 * Colour is an accent, never a fill — Android UAT, 3 Nov 2026.
 *
 * In dark mode the Content Health status cards, the Provider analytics tiles,
 * the selected areas on the creator profile and the Wallet, Grow, Creator
 * Studio and Trust & Safety cards on My Profile stayed pale. The titles on
 * those cards are `text-content-primary`, which correctly turns near-white in
 * dark mode, so on a fill that stayed pale they disappeared.
 *
 * The cause is one kind of class, 613 times across 166 files: a palette step
 * (`bg-amber-50`, `border-emerald-200`, `text-blue-800`, `bg-[#E6F4EA]`,
 * `tokens.color.primary[50]`) is a fixed colour, while only the semantic tokens
 * resolve through the CSS variables in `global.css` and change with the scheme.
 * `success.surface` and its siblings were fixed too, although their dark values
 * sat unused in `tailwind.config.js`.
 *
 * The rule now: a card, pill or panel takes a neutral surface in both modes,
 * and colour stays in what is small — the text, a dot, an icon, a border that
 * is not pastel. Status text uses the status tokens, which lighten in dark
 * mode. This test lists anything that cannot follow the scheme.
 */

// `@types/node` is not a dependency of this app, so these come through
// `require`, as in the other source-reading tests.
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs') as {
  readdirSync: (p: string, o: { withFileTypes: true }) => Array<{ name: string; isDirectory: () => boolean }>;
  readFileSync: (p: string, enc: string) => string;
};
const path = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
};

const SRC = path.join(process.cwd(), 'src');

const PALETTE =
  'primary|secondary|accent|amber|emerald|orange|rose|red|green|blue|teal|purple|yellow|' +
  'indigo|sky|pink|lime|cyan|violet|fuchsia|slate|gray|zinc|stone|neutral';

/** A class, not preceded by `dark:` (a `dark:` sibling is fine by definition). */
const cls = (body: string) => new RegExp(`(?<![\\w-]|dark:)(?:(?:active|hover|focus):)?${body}(?:/\\d+)?(?![\\w-])`, 'g');

const RULES: { name: string; pattern: RegExp; keep?: (match: RegExpMatchArray) => boolean }[] = [
  { name: 'pastel fill', pattern: cls(`bg-(?:${PALETTE})-(?:50|100|200)`) },
  { name: 'status fill', pattern: cls('bg-(?:success|warning|error|info)-surface') },
  { name: 'pastel border', pattern: cls(`border-(?:${PALETTE})-(?:50|100|200)`) },
  // Dark palette text disappears on a dark surface. `primary-600` is the one
  // shade that reads on both, and is left alone.
  { name: 'dark text shade', pattern: cls(`text-(?:${PALETTE})-(?:600|700|800|900)`), keep: (m) => m[0].endsWith('text-primary-600') },
  {
    name: 'light hex fill',
    pattern: /(?<![\w-]|dark:)(?:bg|border)-\[#([0-9A-Fa-f]{6})\]/g,
    keep: (m) => {
      const hex = m[1];
      const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
      return 0.299 * r + 0.587 * g + 0.114 * b <= 200;
    },
  },
  { name: 'pastel token', pattern: /tokens\.color\.(?:primary|secondary|accent)\[(?:50|100|200)\]/g },
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Comments are prose about colours, not colours. */
function code(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('dark mode', () => {
  it('has no colour that cannot follow the scheme', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const text = code(file);
      for (const rule of RULES) {
        for (const match of text.matchAll(rule.pattern)) {
          if (rule.keep?.(match)) continue;
          offenders.push(`${path.relative(SRC, file)}: ${rule.name} ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('gives the status colours a dark value', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'global.css'), 'utf8');
    const config = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.js'), 'utf8');

    for (const tone of ['success', 'warning', 'error', 'info']) {
      expect(config).toContain(`default: 'rgb(var(--color-${tone}) / <alpha-value>)'`);
      // Once in :root and once under prefers-color-scheme: dark.
      expect(css.split(`--color-${tone}:`).length - 1).toBe(2);
    }
  });
});

describe('a status fill with white text on it', () => {
  // `*-default` lightens in dark mode, which is right for text and wrong for a
  // button: white on #F87171 or #4ADE80 does not read. Those use `*-solid`.
  it('uses the fixed shade', () => {
    const button = fs.readFileSync(path.join(SRC, 'components', 'Button.tsx'), 'utf8');
    const config = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.js'), 'utf8');

    expect(button).toContain("danger: 'bg-error-solid");
    for (const [tone, hex] of [['success', '#16A34A'], ['warning', '#D97706'], ['error', '#DC2626'], ['info', '#2563EB']]) {
      expect(config).toMatch(new RegExp(`${tone}: \{[^}]*?solid: '${hex}'`));
    }
  });
});

// The welcome screen's feature pills passed their tints as props
// (`pillBg="#FFF3EB"`), and many screens wrote dark text as `text-[#0D7C66]` or
// chose an inline `color: '#1F2937'` in a ternary: none of those is a class the
// first rule can see.
describe('hex colours written out', () => {
  const luminance = (hex: string) => {
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  /** Where a fixed colour is the point, with the reason. */
  const ALLOWED: Record<string, string> = {
    // Reading mode sets its own page (sepia, light) whatever the scheme.
    [path.join('app', 'guide', '[id].tsx')]: 'reading-mode themes',
    // The theme's own definitions.
    [path.join('design-system', 'tokens.ts')]: 'palette definitions',
    // Picks its own dark value for each banner (`isDark ? … : …`).
    [path.join('providers', 'notification-provider.tsx')]: 'chooses per scheme',
    // A warm ring behind the lock icon; nothing is written on it.
    [path.join('components', 'FeatureGate.tsx')]: 'decorative badge',
  };
  const outside = (file: string) =>
    !Object.keys(ALLOWED).includes(path.relative(SRC, file))
    && !path.relative(SRC, file).startsWith(path.join('lib', 'maps'))
    && !path.relative(SRC, file).startsWith('mocks');

  it('writes no dark text as a hex class', () => {
    const offenders = sourceFiles(SRC).filter(outside).flatMap((file) =>
      [...code(file).matchAll(/(?<![\w-])text-\[#([0-9A-Fa-f]{6})\]/g)]
        .filter((match) => luminance(match[1]) < 140)
        .map((match) => `${path.relative(SRC, file)}: ${match[0]}`));

    expect(offenders).toEqual([]);
  });

  it('passes no light fill as a string', () => {
    const FILL = /\b(backgroundColor|borderColor|bgColor|pillBg|pillBorder|background|bg|border|surface)\b\s*[:=]/;
    const offenders = sourceFiles(SRC).filter(outside).flatMap((file) =>
      code(file).split('\n').flatMap((line) =>
        FILL.test(line)
          ? [...line.matchAll(/['"]#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})['"]/g)]
            .filter((match) => !/^f{3}(f{3})?$/i.test(match[1]) && luminance(match[1]) > 200)
            .map((match) => `${path.relative(SRC, file)}: ${line.trim().slice(0, 80)} (${match[0]})`)
          : []));

    expect(offenders).toEqual([]);
  });
});
