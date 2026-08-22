// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the housing create payload (Remediation)
//
// `src/app/housing/create.tsx` could not create a listing.
// `CreateHousingListingRequest` declares `Title`, `Summary`,
// `AccommodationTypeKey` and `CountryCode` as `required`, and the payload
// supplied one of the four. C# `required` means System.Text.Json **refuses the
// body before any handler runs**, so every submission 400'd — and it sent
// thirteen further keys the DTO does not declare, each discarded by the model
// binder without comment.
//
// Invisible to every wave that verified responses, because there was no response
// to inspect. Found by the request-binding check, which compares what leaves the
// device against the DTO the route binds.
//
// Comments are stripped before asserting. An earlier wave named why:
// *documenting a removed lie must not be indistinguishable from committing it* —
// and the first version of the sibling event test failed on its own comment
// explaining what the screen used to say.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

const SOURCE = withoutComments(
  fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'housing', 'create.tsx'), 'utf8')
);

describe('the housing create payload', () => {
  it('sends every field CreateHousingListingRequest marks required', () => {
    for (const required of ['title:', 'summary:', 'accommodationTypeKey', 'countryCode:']) {
      expect(SOURCE).toContain(required);
    }
  });

  it('sends one catalogue key rather than two client concepts', () => {
    // The form asks "Rent or Share?" then "what kind of property?"; the server
    // has a single `AccommodationTypeKey` and matches it **by key** — an
    // unrecognised value is refused, never defaulted.
    expect(SOURCE).toContain('toAccommodationTypeKey');
    expect(SOURCE).not.toContain('listingType,\n      propertyType,');
  });

  it('flattens the fields the DTO declares flat', () => {
    // `rent`/`currency`/`deposit`/`billsIncluded` are not the names the route
    // binds. Each was discarded silently, so a listing was created — when it
    // could be created at all — with no rent on it.
    expect(SOURCE).toContain('rentAmount:');
    expect(SOURCE).toContain('currencyCode:');
    expect(SOURCE).toContain('depositAmount:');
    expect(SOURCE).toContain('utilitiesIncluded:');
    expect(SOURCE).toContain('furnishedStatus:');
  });

  it('sends no nested location block', () => {
    // The DTO declares `CityName`, `RegionName`, `AddressLine1`, `Latitude` and
    // `Longitude` at the top level. A nested `location` matched nothing.
    expect(SOURCE).not.toContain('location: {');
    expect(SOURCE).toContain('addressLine1:');
  });

  it('sends no fabricated host identity', () => {
    // The single worst thing in the old payload. The DTO has no `host` member,
    // so none of it reached the server — but it was assembled on every
    // submission: a hardcoded provider id, a hardcoded name, a hardcoded
    // "isVerified: true" and a hardcoded 4.9 rating. The host is the
    // authenticated caller and the server knows who that is.
    expect(SOURCE).not.toContain('host: {');
    expect(SOURCE).not.toContain('user-123');
    expect(SOURCE).not.toContain('Amara Kone');
    expect(SOURCE).not.toContain('reputationLevel:');
  });

  it('sends no invented distance', () => {
    // `distanceKm: 0.8` — a distance from nobody, on a listing nobody had
    // searched for.
    expect(SOURCE).not.toContain('distanceKm: 0.8');
  });

  it('shapes amenities and house rules as the DTO declares them', () => {
    // `HousingAmenityRequest` is `{ key, … }` and `HouseRuleRequest` is
    // `{ text, order }`. Two arrays of bare strings bound to neither.
    expect(SOURCE).toContain('.map((key) => ({ key }))');
    expect(SOURCE).toContain('.map((text, order) => ({ text, order }))');
  });

  it('prefills the country without silently defaulting it', () => {
    expect(SOURCE).toContain('residenceCountry');
    expect(SOURCE).not.toContain("countryCode: 'GB'");
  });
});
