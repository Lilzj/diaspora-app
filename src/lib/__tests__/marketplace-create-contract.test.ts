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
    expect(SOURCE).toContain('toListingCategoryKey');
    expect(SOURCE).toContain("african_food: 'imported-groceries'");
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
