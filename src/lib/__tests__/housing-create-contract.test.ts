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
    // Since 13 Oct 2026 the key is chosen from the server's own list
    // (`/housing/accommodation-types`) instead of guessed from a label.
    expect(SOURCE).toContain('fetchAccommodationTypes()');
    expect(SOURCE).toContain('onPress={() => setPropertyType(type.key)}');
    expect(SOURCE).not.toContain('PROPERTY_TYPES');
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

  it('offers furnishing and lease length as the server names them', () => {
    // "6 Months", "1 Year", "Flexible", "Short-let" and "Partially Furnished"
    // were not values the server has; its parser filed each as unspecified.
    expect(SOURCE).toContain('fetchHousingListingOptions()');
    expect(SOURCE).not.toContain('FURNISHING_OPTIONS');
    expect(SOURCE).not.toContain('LEASE_DURATION_OPTIONS');
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

  /**
   * **The pin was always sent and never chosen.** `coordinates` defaulted to
   * `{ latitude: 51.4702, longitude: -0.0691 }` — Peckham — and the payload
   * carried it whether or not the picker had been opened, so a Mauritius flat
   * posted from an untouched form was pinned in London. Opening the picker did
   * not rescue it: it waited a second and assigned the *city centre* by name,
   * so every Port Louis property landed on one point. The listing created on
   * 21 Sep 2026 stored `-20.164200, 57.502900` and was filed under
   * `/MU/port-louis/port-louis/ward-iv`, which is the city hall.
   *
   * Forward geocoding is not reachable in a production build, so an address
   * cannot be turned into a coordinate. The device's own position is the only
   * honest source, and no pin at all is honest too.
   */
  it('sends a pin only when the member gave one, and never a hardcoded place', () => {
    // No coordinate literals: a pin is read from the device or omitted.
    expect(SOURCE).not.toMatch(/latitude:\s*-?\d+\.\d+/);
    expect(SOURCE).not.toMatch(/longitude:\s*-?\d+\.\d+/);

    // And the payload omits it rather than defaulting it: `undefined` drops the
    // key from the body, and keeps the literal enumerable for the drift check.
    expect(SOURCE).toContain('latitude: coordinates?.latitude');
    expect(SOURCE).toContain('longitude: coordinates?.longitude');
    expect(SOURCE).toContain('resolveDeviceLocationProvider');
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

/**
 * Step 5 asked for a phone number, an email address and a preferred channel,
 * wrote all three into the draft, restored them when the draft came back — and
 * sent none of them anywhere. `CreateHousingListingRequest` has no contact
 * fields at all; they live on the landlord profile, which this screen was
 * already opening with a display name and a country and nothing else.
 *
 * What the wire does with them is `landlord-contact.test.ts`. What this file
 * holds is the half that failed: the screen has to hand them over. A payload
 * key cannot express that, because the destination is not the payload.
 */
describe('the contact details step 5 collects', () => {
  it('reaches the landlord profile rather than the listing', () => {
    expect(SOURCE).toContain('contact: contactChanges');

    // On the listing it would bind to nothing and be discarded in silence,
    // which is a quieter version of the defect this replaced.
    expect(SOURCE).not.toMatch(/\n\s+contactPhone:/);
    expect(SOURCE).not.toMatch(/\n\s+contactEmail:/);
  });

  /**
   * Read before written. `PATCH /housing/landlords/me` coalesces against what
   * is stored, so a screen that sent its fields without knowing them would
   * overwrite a returning landlord's details with whatever was on the form —
   * and the form is empty until somebody types.
   */
  it('knows what the platform already holds before it changes anything', () => {
    expect(SOURCE).toContain('fetchMyLandlordContact');
    expect(SOURCE).toContain('setHeldContact');
    expect(SOURCE).toContain('heldContact?.phoneNumber');
  });

  /**
   * The platform keeps one bit: whether a browsing member sees the details.
   * WhatsApp against a phone call against email was a choice between three
   * things stored identically.
   */
  it('offers the choice the platform keeps, and no other', () => {
    expect(SOURCE).toContain('publishContact');
    expect(SOURCE).not.toContain('preferredContactMethod');
    expect(SOURCE).not.toContain("'whatsapp'");
  });
});
