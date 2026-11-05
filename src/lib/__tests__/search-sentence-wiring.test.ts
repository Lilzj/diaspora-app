// ─────────────────────────────────────────────────────────────────────────────
// Where the search sentence is wired (owner, 5 Nov 2026)
//
// The Home bar was a button that opened Discover empty. It now takes the
// sentence, reads it, finds its place, and opens Discover already filtered;
// Discover says what it understood and can clear it. The town names come from
// GeoNames, whose licence asks for credit.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

function source(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');
}

describe('the Home search bar', () => {
  const home = source('app', '(tabs)', 'index.tsx');

  it('is a field the member types a sentence into and submits', () => {
    expect(home).toMatch(/<TextInput[\s\S]*?returnKeyType="search"[\s\S]*?onSubmitEditing=\{submitSearch\}/);
    // The bar itself, under its tour spotlight, is the field and no longer a button.
    expect(home).toMatch(/spotlightKey="search_button"[^>]*>\s*<View/);
  });

  it('the quick chips open the tab they name, not always Providers', () => {
    expect(home).toMatch(/label="Find Jobs"[^\n]*params: \{ tab: 'Jobs' \}/);
    expect(home).toMatch(/label="Find Housing"[^\n]*params: \{ tab: 'Housing' \}/);
    expect(home).toMatch(/label="Find Services"[^\n]*params: \{ tab: 'Providers' \}/);
  });

  it('says when the place is outside the member country, and opens nothing', () => {
    expect(home).toMatch(/search\.place\?\.kind === 'outside'/);
    expect(home).toContain('outsideMessage(');
    expect(home).toContain('testID="home-search-outside"');
    expect(home).toMatch(/Search in \$\{homeCountryName\} instead/);
    expect(home).toContain('searchAtHome(outsideNotice.search,');
  });

  it('reads the sentence, finds its place, and opens Discover with it', () => {
    expect(home).toContain('resolveSearch(readSearch(');
    expect(home).toContain('sentenceParams(search, String(Date.now()))');
    expect(home).toContain("pathname: '/(tabs)/discover'");
  });
});

describe('Discover', () => {
  const discover = source('app', '(tabs)', 'discover.tsx');

  it('reads the sentence from its route, and searches its place for this search only', () => {
    expect(discover).toContain('sentenceFromParams(params)');
    expect(discover).toContain('sentenceScope(sentence)');
    expect(discover).toMatch(/const scope = sentenceArea \?\? storeScope;/);
  });

  it('applies the filters the sentence named', () => {
    expect(discover).toContain('setBedroomsCount(read.minBedrooms)');
    expect(discover).toContain('setHomeTypes(read.homeTypes)');
    expect(discover).toContain('setSelectedJobType(read.jobType)');
    expect(discover).toMatch(/homeTypes,\s*\n\s*\}\),/);
  });

  it('says what it understood, and can clear it', () => {
    expect(discover).toContain('describeSentence(sentence,');
    expect(discover).toContain('accessibilityLabel="Clear this search"');
  });
});

describe('the credit GeoNames asks for', () => {
  it('is on the About screen', () => {
    const about = source('app', 'settings', 'about.tsx');

    expect(about).toContain('GeoNames');
    expect(about).toContain('CC BY 4.0');
  });
});
