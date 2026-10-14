// Place search is global (14 Oct 2026): every place a member searches for comes
// from Google, in any country. The platform's own place list only ever covered
// the countries it was loaded with (Mauritius and two UK cities), so nothing a
// member types may be searched against it.

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...parts), 'utf8');

describe('place search', () => {
  it('the location sheet asks Google for regions, not the place list', () => {
    const sheet = read('components', 'GlobalLocationSelector.tsx');
    expect(sheet).toContain('regionsOnly: true');
    expect(sheet).not.toContain("'/location/search'");
  });

  it('the town picker asks Google for towns, with no place-list fallback', () => {
    const towns = read('lib', 'town-search.ts');
    expect(towns).toContain('townsOnly: true');
    expect(towns).not.toContain("'/location/search'");
  });
});
