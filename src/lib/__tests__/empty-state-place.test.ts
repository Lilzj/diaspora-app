// ─────────────────────────────────────────────────────────────────────────────
// A sentence that names a place has to survive a place with no name.
//
// UAT-133. Discover's empty state read `No {label} match in {city}`, and `city`
// came straight from `activeLocation.cityName`. A country-precision location has
// no city — which is exactly what UAT-104's fix made possible and correct — so a
// member in Mauritius was shown:
//
//     No providers match in
//
// A sentence that stops mid-phrase. The same shape as UAT-123's
// "Explore Mauritius · ▾" and "Address:  · Quatre Bornes": a label built by
// concatenating a field that is now legitimately empty.
//
// The rule this holds is that the empty state changes shape rather than trailing
// off, and that it never interpolates a bare `cityName`.
// ─────────────────────────────────────────────────────────────────────────────

import { screenSource } from './support/screen-files';
import { withoutComments } from './support/source-text';

const path = require('path') as { join(...segments: string[]): string };

/** A file's code with its comments removed. See `password-auth.test.ts`. */
function read(...segments: string[]): string {
  // A screen is read whole: its route and every part it composes from (FSOLID-001).
  return withoutComments(screenSource(path.join(process.cwd(), ...segments)));
}

const DISCOVER = read('src', 'app', '(tabs)', 'discover.tsx');

describe('an empty state does not trail off', () => {
  it('never drops a bare cityName into the sentence', () => {
    // `cityName` is empty for a country-precision location, which is the whole
    // point of that precision existing.
    expect(DISCOVER).not.toMatch(/match in \{city\}/);
    expect(DISCOVER).not.toMatch(/city=\{activeLocation\.cityName\}/);
  });

  it('changes shape when there is nothing to name', () => {
    // Two sentences, not one with a hole in it.
    expect(DISCOVER).toMatch(/No \$\{label\} match in \$\{place\}/);
    expect(DISCOVER).toMatch(/No \$\{label\} match nearby/);
  });

  it('falls back through city, then country, then nothing', () => {
    // A member with a city sees the city; one with only a country sees the
    // country; one with neither gets the shorter sentence rather than a blank.
    // Since 15 Sep 2026 the city is the one the search actually used: a
    // country-wide search names the country even when a town is known. Since
    // 5 Nov 2026 the country is the one a search sentence named ("jobs in
    // Nigeria"), else the member's, and still nothing when neither is known.
    expect(DISCOVER).toMatch(
      /scopeCountryName =\s*sentence\?\.place\?\.kind === 'country' \? sentence\.place\.name : activeLocation\.countryName\?\.trim\(\)\s*\|\|\s*''/
    );
    expect(DISCOVER).toMatch(
      /emptyStatePlace = scope\.kind === 'country' \? scopeCountryName : scope\.cityName \|\| scopeCountryName;/
    );
  });

  it('does not tell the member to search "in this city" when there is no city', () => {
    // The hint under the heading had the same assumption baked into it.
    expect(DISCOVER).not.toMatch(/nearby in this city/);
  });
});
