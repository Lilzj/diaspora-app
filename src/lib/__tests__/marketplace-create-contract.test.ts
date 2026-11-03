// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the marketplace create payload (Remediation)
//
// `CreateListingRequest` declares `Title`, `Description`, `CategoryKey` and
// `CountryCode` as `required`, and this payload supplied two. C# `required`
// means System.Text.Json **refuses the body before any handler runs**, so every
// submission 400'd — and nine further keys were discarded by the model binder
// without comment.
//
// Comments are stripped before asserting, for the reason an earlier wave named:
// *documenting a removed lie must not be indistinguishable from committing it.*
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
  fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'marketplace', 'create.tsx'), 'utf8')
);

describe('the marketplace create payload', () => {
  it('sends every field CreateListingRequest marks required', () => {
    for (const required of ['title:', 'description:', 'categoryKey', 'countryCode:']) {
      expect(SOURCE).toContain(required);
    }
  });

  it('sends a catalogue key, not the client’s own category id', () => {
    // The two vocabularies were never the same — `phones` vs `mobile-phones`,
    // `laptops` vs `computers`. `african_food` could not have matched anything
    // under any normalisation: it carries an underscore where every seeded key
    // uses a hyphen.
    //
    // Since 13 Oct 2026 the screen lists the server's own taxonomy and sends
    // its keys, the subcategory's when one was chosen. The client table above
    // remains only to translate drafts saved with the old ids.
    expect(SOURCE).toContain('useMarketplaceCategories()');
    expect(SOURCE).toContain('subcategory || category');
    expect(SOURCE).not.toContain('mockMarketplaceCategories');
    const CATEGORIES = fs.readFileSync(
      path.join(process.cwd(), 'src', 'lib', 'marketplace-categories.ts'),
      'utf8'
    );
    expect(CATEGORIES).toContain("african_food: 'imported-groceries'");
  });

  it('maps the six intents onto the five listing types the contract names', () => {
    // `Exchange / Swap` and `Donation` have no counterpart; `Auction` is
    // "a recognised name and is refused", so nothing here can produce it.
    expect(SOURCE).toContain('toListingType');
    expect(SOURCE).not.toContain('intent,\n      category,');
  });

  it('uses the field names the route binds', () => {
    expect(SOURCE).toContain('isNegotiable:');
    expect(SOURCE).toContain('offersDelivery:');
    expect(SOURCE).toContain('offersPickup:');
    expect(SOURCE).not.toContain('deliveryAvailable:');
    expect(SOURCE).not.toContain('pickupOnly:');
  });

  it('sends no nested location block', () => {
    expect(SOURCE).not.toContain('location: {');
    expect(SOURCE).toContain('cityName: cityName');
  });

  it('sends no fabricated seller identity or verifications', () => {
    // The sharpest thing this remediation found in a payload. None of it
    // reached the server — the DTO has no `seller` member — but it was
    // assembled on every submission, including two `countryVerifications` each
    // carrying `isVerified: true`, an arrival year and a residence figure.
    //
    // Fabricated *trust* data, on the object a buyer uses to decide whether a
    // stranger is safe to meet.
    expect(SOURCE).not.toContain('seller: {');
    expect(SOURCE).not.toContain('user-123');
    expect(SOURCE).not.toContain('countryVerifications');
    expect(SOURCE).not.toContain('Amara Kone');
  });

  it('sends no status the DTO has no member for', () => {
    // "A draft is allowed to be incomplete — a seller photographs the thing
    // before they know what to charge for it."
    expect(SOURCE).not.toContain("status: 'Active'");
  });

  it('prefills the country without silently defaulting it', () => {
    expect(SOURCE).toContain('residenceCountry');
    expect(SOURCE).not.toContain("countryCode: 'GB'");
  });
});

/**
 * Step 6 asked for a phone number and offered three ways to be reached, wrote
 * both into the draft, restored them — and sent neither. The two have
 * different homes and the wizard was missing both: the preference belongs on
 * the listing, where `ConversationReferenceResponse` carries it to a buyer
 * opening a thread, and the number belongs on the seller profile, which is
 * where `SellerProfileResponse.Phone` serves it from.
 *
 * So every listing on the platform carried the handler's fallback, `InApp`,
 * whatever its seller chose. What the wire does with them is
 * `seller-contact.test.ts`; this is the half a wire test cannot see.
 */
describe('the contact details step 6 collects', () => {
  it('sends the preference on the listing it was asked about', () => {
    expect(SOURCE).toContain('contactPreference: toContactPreference(preferredContactMethod)');
  });

  it('maps onto the members ContactPreference actually has', () => {
    // `InApp`, `Phone`, `Email` and `Any`. The form offers three of the four,
    // and a value outside them is refused rather than defaulted.
    expect(SOURCE).toContain("return 'Phone'");
    expect(SOURCE).toContain("return 'Email'");
    expect(SOURCE).toContain("return 'InApp'");
  });

  /**
   * The number has nowhere to go on a listing — `CreateListingRequest` has no
   * phone field — so it travels to the profile instead, and only when it
   * differs from what is stored there.
   */
  it('sends the number to the seller profile, not the listing', () => {
    expect(SOURCE).toContain('fetchMySellerContact');
    expect(SOURCE).toContain('contact:');
    expect(SOURCE).toContain("heldContact?.phone");
    expect(SOURCE).not.toMatch(/\n\s+contactPhone:/);
  });

  it('files under the residence, and picks category and town with the shared controls', () => {
    // 14 Oct 2026: no country question, one dropdown with search for every
    // category, one town search; the city no longer defaults to London.
    expect(SOURCE).toContain('const countryCode = residenceCountry ??');
    expect(SOURCE).not.toContain('setCountryCode');
    expect(SOURCE).toMatch(/<SearchableSelect[\s\S]*key: cat\.key/);
    expect(SOURCE).toContain('<TownPicker');
    expect(SOURCE).not.toContain("useState('London')");
  });

  // 14 Oct 2026: the place catalogue is retired; a listing is filed by the
  // picked town's coordinates. Never required, never half a pair.
  it('sends latitude/longitude from the town choice, and no areaId', () => {
    expect(SOURCE).toMatch(/setTownPin\(coordinatesOf\(town\)\)/);
    expect(SOURCE).toContain('const townPoint = ownPinOrTown(null, cityName, townPin);');
    expect(SOURCE).toContain('latitude: townPoint?.latitude');
    expect(SOURCE).toContain('longitude: townPoint?.longitude');
    expect(SOURCE).not.toMatch(/areaId/);
  });
});
