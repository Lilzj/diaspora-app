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

  /**
   * **The shape was right and every value was fiction.** The assertion above
   * passed from the day it was written while the screen posted
   * `High-speed Internet, Washing Machine, Heating` — the field's own default,
   * split on commas — as amenity keys. The catalogue's keys are slugs, so the
   * server answered `AmenityNotFound`, which is a 404, and refused the listing.
   * A landlord who never touched the field still could not post: on
   * 21 Sep 2026 production held one landlord profile and nought listings.
   *
   * A key has to come from somewhere that can only produce real keys, so this
   * pins the source rather than the shape.
   */
  it('takes amenity keys from the catalogue, never from something typed', () => {
    expect(SOURCE).toContain('amenities: amenityKeys.map((key) => ({ key }))');

    // The catalogue is read, so the options offered are the ones that resolve.
    expect(SOURCE).toContain('fetchHousingAmenities');

    // And the free-text field is gone rather than merely unused.
    expect(SOURCE).not.toContain('amenitiesText');
    expect(SOURCE).not.toContain('Amenities (comma-separated)');
  });

  it('prefills the country without silently defaulting it', () => {
    expect(SOURCE).toContain('residenceCountry');
    expect(SOURCE).not.toContain("countryCode: 'GB'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The rent period (Android UAT, 31 Aug 2026)
//
// `RentPeriod` is `string?` on the DTO — optional — so the request-binding
// check, which compares the payload against the contract's `required` members,
// passed it. The server does not treat it as optional when a rent is present:
//
//     if (request.RentAmount is null)
//         return Result.Success(HousingPrice.OnApplication(…));
//
//     if (!Enum.TryParse<RentPeriod>(request.RentPeriod, ignoreCase: true, out var period)
//         || period == RentPeriod.None)
//         return Result.Failure<HousingPrice>(HousingErrors.PriceRequired);
//
// A missing period with a rent present is a **failure**, and the failure it
// returns names the wrong field: `housing.price.required`, rendered to the
// member as "State the rent, or mark the price as on application" — while they
// are looking at the rent they just typed.
//
// Confirmed on the deployment with three identical payloads: rent without a
// period 400'd, rent with `PerMonth` created, and no rent at all created. The
// effect was that **the only housing listings this screen could publish were
// ones with no price**.
//
// This is the case optional-field drift checking cannot see: a field the
// contract permits to be absent and the handler requires to be present.
// ─────────────────────────────────────────────────────────────────────────────

describe('the housing rent period', () => {
  it('is sent whenever a rent is sent', () => {
    expect(SOURCE).toContain('rentPeriod:');
  });

  it('uses a member of the RentPeriod enum, not the form label', () => {
    // The enum is PerNight | PerWeek | PerMonth | PerQuarter | PerYear |
    // PerStay. "Monthly" is the label on the field and parses to nothing.
    expect(SOURCE).toMatch(/rentPeriod:\s*rent\s*\?\s*'PerMonth'/);
    expect(SOURCE).not.toMatch(/rentPeriod:\s*'?Monthly'?/);
  });

  it('omits the period when there is no rent, so the listing is on application', () => {
    // `HousingPrice.OnApplication` is only reached when RentAmount is null, and
    // sending a period alongside no rent would be describing a price that does
    // not exist.
    expect(SOURCE).toMatch(/rentPeriod:\s*rent\s*\?\s*'PerMonth'\s*:\s*undefined/);
  });
});
