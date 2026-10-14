// ─────────────────────────────────────────────────────────────────────────────
// No British defaults in runtime code (14 Oct 2026)
//
// The owner's rule: this is a global app, and nothing may assume London, the
// UK, sterling or British Summer Time. Before this guard, a volunteer
// opportunity was filed in London whenever the location store was empty, every
// event series was created in 'BST' (not even an IANA zone), a payout account
// was opened in GB for anybody whose location had not loaded, and wallets,
// donations and campaigns fell back to GBP. Each of those was a one-token
// fallback that typechecked and passed its tests.
//
// The replacements: the member's residence (`user.residenceCountry`), their
// currency (`useMemberCurrency`), the device zone (`deviceTimeZone`), a town
// from `<TownPicker>`, and symbols from `currencySymbol` / `formatPrice` in
// `lib/money.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const path = require('path') as {
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
};

const ROOTS = ['src/app', 'src/lib'];

/** Runtime source only: no tests, no fixtures. */
function runtimeFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'mocks' || entry.name === '__mocks__') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        found.push(path.relative(process.cwd(), full).split('\\').join('/'));
      }
    }
  };
  for (const root of ROOTS) walk(path.join(process.cwd(), root));
  return found;
}

/** A file's code with its comments removed, so a note about the old default is allowed. */
function code(file: string): string {
  return fs
    .readFileSync(path.join(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line: string) => !/^\s*(\/\/|\*|\{\/\*)/.test(line))
    .join('\n');
}

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "?? 'London'", pattern: /(\?\?|\|\|)\s*['"]London['"]/ },
  { label: "timezone: 'BST'", pattern: /timezone:\s*['"]BST['"]/ },
  { label: "?? 'GB'", pattern: /(\?\?|\|\|)\s*['"]GB['"]/ },
  { label: "?? 'GBP'", pattern: /(\?\?|\|\|)\s*['"]GBP['"]/ },
  { label: "=== 'GBP' ? '£' : '$'", pattern: /===\s*['"]GBP['"]\s*\?\s*['"]£['"]\s*:\s*['"]\$['"]/ },
];

describe('no hard-coded British defaults in runtime code', () => {
  const files = runtimeFiles();

  it('reads the files it claims to guard', () => {
    // A guard that finds nothing passes. Pin the population first.
    expect(files.length).toBeGreaterThan(300);
    expect(files).toEqual(
      expect.arrayContaining([
        'src/app/community-life/volunteer/create.tsx',
        'src/app/community-life/series/create.tsx',
        'src/app/wallet/payout-accounts.tsx',
        'src/lib/event-wire.ts',
        'src/lib/trustEngine.ts',
      ])
    );
    expect(files.some((file) => file.includes('/mocks/') || file.includes('__tests__'))).toBe(false);
  });

  it.each(FORBIDDEN)('each pattern catches the defect it names: $label', ({ pattern }) => {
    const samples = [
      "cityName: city ?? 'London',",
      "timezone: 'BST',",
      "countryCode: country ?? 'GB',",
      "const currency = wallet?.currency ?? 'GBP';",
      "`${event.currency === 'GBP' ? '£' : '$'}${event.price}`",
    ];
    expect(samples.some((sample) => pattern.test(sample))).toBe(true);
  });

  it.each(FORBIDDEN)('no runtime file contains $label', ({ pattern }) => {
    const offenders = files.filter((file) => pattern.test(code(file)));
    expect(offenders).toEqual([]);
  });
});
