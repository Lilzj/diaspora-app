// `src/lib/reference/countries.ts` is generated from the backend's country
// table. This is the check that it still matches.
//
// The Location module owns the catalogue and the server decides registration
// eligibility, so the backend's table is the authority. The client keeps a copy
// because the registration funnel — `choose-country`, `choose-origin`,
// `eligibility-error` — runs before the member has a token and every Location
// route requires authorisation, so those screens cannot fetch it. A copy that
// cannot be fetched has to be derived, and this is what makes "derived" mean
// something: regenerate with `node scripts/generate-countries.js`.
//
// Skipped where the backend repository is not beside this one, like the other
// contract drift suites (`DIASPORA_BACKEND_PATH` overrides the location). It
// runs in the `contract-drift` job, which checks the backend out — a
// cross-repository check that does not run has not passed (FBL-001).

import { allCountries } from '../reference/countries';
import { backendSourceRoot } from './support/backend-checkout';

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

const generator = require('../../../scripts/generate-countries') as {
  parseCountryTable: (source: string) => { code: string; name: string; callingCode: string }[];
  flagFor: (code: string) => string;
};

// The suite reads the table through the generator's own parser rather than a
// second pattern of its own. Two parsers would be two chances to disagree with
// the file, and the one in the script is the one whose output ships.
const SOURCE_ROOT = backendSourceRoot();
const describeWhenBackendPresent = SOURCE_ROOT ? describe : describe.skip;

function backendTable(): { code: string; name: string; callingCode: string }[] {
  const file = join(
    SOURCE_ROOT as string,
    'Diaspora.Modules.Location',
    'Persistence',
    'Seeding',
    'WorldCountryData.cs'
  );

  return generator.parseCountryTable(readFileSync(file, 'utf8'));
}

describeWhenBackendPresent('the bundled country list matches the backend table', () => {
  // The canary. Everything below compares the client's list against whatever
  // the parser returns, and two empty lists are equal: a pattern that stopped
  // matching would turn this suite into a tautology that passes. The parser
  // throws on a short parse for the same reason; this asserts the result.
  it('reads a country table of a plausible size', () => {
    expect(backendTable().length).toBeGreaterThan(150);
  });

  it('carries exactly the backend entries, in the backend order', () => {
    const expected = backendTable().map((row) => ({
      code: row.code,
      name: row.name,
      flag: generator.flagFor(row.code),
      callingCode: row.callingCode,
    }));

    // Run `node scripts/generate-countries.js` when this fails. Edit the
    // backend's WorldCountryData.cs when the country is the thing that changed.
    expect(allCountries).toEqual(expected);
  });

  // Asserted on its own so the failure names the real cause. The flag is not
  // stored on either side: Unicode encodes every ISO alpha-2 code as the pair
  // of regional indicator symbols for its letters, so it is computed. A flag
  // typed in by hand would be caught by the comparison above, but reported as
  // "the whole list differs".
  it('derives every flag from the country code', () => {
    for (const country of allCountries) {
      expect(country.flag).toBe(generator.flagFor(country.code));
    }
  });

  it('names each country once', () => {
    const codes = allCountries.map((country) => country.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});
