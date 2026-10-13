// ─────────────────────────────────────────────────────────────────────────────
// Members never choose a currency (owner's decision, 13 Oct 2026)
//
// Every price a member enters is in the currency of their country of
// residence. Six create forms offered a GBP/MUR/USD/EUR/NGN/GHS chip row, and
// four of them defaulted to GBP, so a member in Mauritius who did not notice
// it published rents and menus in pounds.
// ─────────────────────────────────────────────────────────────────────────────

import { currencyForResidence, FALLBACK_CURRENCY } from '@/lib/member-currency';

const fs = require('fs') as {
  readFileSync(p: string, e: string): string;
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const path = require('path') as { join(...s: string[]): string };

function screens(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : screens(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('currencyForResidence', () => {
  it.each([
    ['MU', 'MUR'],
    ['NG', 'NGN'],
    ['GH', 'GHS'],
    ['GB', 'GBP'],
    ['mu', 'MUR'],
  ])('%s prices in %s', (country, currency) => {
    expect(currencyForResidence(country)).toEqual(
      expect.objectContaining({ code: currency, isKnown: true }),
    );
  });

  it('falls back openly for a country the platform has no currency for', () => {
    expect(currencyForResidence('AQ')).toEqual(
      expect.objectContaining({ code: FALLBACK_CURRENCY, isKnown: false }),
    );
    expect(currencyForResidence(null).isKnown).toBe(false);
  });
});

describe('the app', () => {
  const all = screens(path.join(process.cwd(), 'src', 'app'));

  it('scans the screens it claims to', () => {
    // A sweep that finds nothing passes; pin that it found the forms it is about.
    const names = all.map((file) => file.replace(/\\/g, '/'));
    for (const form of [
      'app/(tabs)/post.tsx',
      'app/marketplace/create.tsx',
      'app/housing/create.tsx',
      'app/job/create.tsx',
      'app/community-life/campaign/create.tsx',
    ]) {
      expect(names.some((name) => name.endsWith(form))).toBe(true);
    }
  });

  it('offers no currency list for a member to choose from', () => {
    const offenders = all.filter((file) => /const CURRENCIES\s*=/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('hard-codes no pounds into what a member is asked', () => {
    // Comments are stripped: several describe the defect this guards against.
    const code = (file: string) =>
      fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
    const offenders = all.filter((file) => /in pounds|priceCurrency: [^\n]*'GBP'/.test(code(file)));
    expect(offenders).toEqual([]);
  });
});
