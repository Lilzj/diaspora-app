// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the event create payload (Remediation)
//
// `src/app/community-life/event/create.tsx` could not create an event.
// `CreateEventRequest` declares six `required` members — `Title`, `Summary`,
// `CategoryKey`, `StartsAt`, `EndsAt`, `CountryCode` — and the payload supplied
// exactly one. C# `required` means System.Text.Json **refuses the body before
// any handler runs**, so every publish and every draft-save 400'd and the screen
// reported "Failed to publish event", which reads as a network problem.
//
// It survived every earlier wave because those verified *responses*, and there
// was no response to inspect. Wave E even edited this payload — correcting
// `coverImage` → `media` and leaving a comment about "a property the server has
// no field for, discarded silently" — and did not read the other five fields.
//
// These assertions read the screen's source rather than rendering it: the payload
// is built inside the component from wizard state, and driving six steps of a
// wizard to reach one object would test the wizard. What must not regress is the
// **shape of the body**, and that is legible in the source.
//
// The complementary check lives in `backend-request-binding-drift.test.ts`, which
// compares what leaves the device against the parsed C# DTO for the flows in its
// ledger.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/**
 * The screen's source with its comments removed.
 *
 * Necessary, and the reason is a finding in its own right: the first version of
 * this file asserted `not.toContain('Failed to publish event')` and **failed on
 * the comment explaining that the screen used to say it.**
 *
 * An earlier wave met the same trap and named it — *documenting a removed lie
 * must not be indistinguishable from committing it.* A source assertion that
 * reads comments cannot tell the difference between code that does the wrong
 * thing and prose explaining that it no longer does, so the honest record of a
 * defect would have to be deleted to satisfy a test about the code beneath it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

const SOURCE = withoutComments(
  fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'community-life', 'event', 'create.tsx'),
    'utf8'
  )
);

describe('the event create payload', () => {
  it('sends every field CreateEventRequest marks required', () => {
    // Six members, and the reason each one is named individually rather than
    // asserted as a set: a future edit that drops one would otherwise pass by
    // adding another.
    for (const required of [
      'title:',
      'summary:',
      'categoryKey:',
      'startsAt:',
      'endsAt:',
      'countryCode:',
    ]) {
      expect(SOURCE).toContain(required);
    }
  });

  it('sends the catalogue key, not the display category', () => {
    // The seeded catalogue holds 17 lower-kebab keys. The client's 28 display
    // strings normalise onto a real key for **6 of them** by accident; a write
    // with an unrecognised key is `EventCategoryNotFound` → 404.
    expect(SOURCE).toContain('toEventCategoryKey(formData.category)');
  });

  it('no longer sends date, time or endTime as wire fields', () => {
    // `StartsAt`/`EndsAt` are `DateTimeOffset`. A wall clock and a zone are not
    // an instant, and the DTO declares no field for either half.
    expect(SOURCE).not.toContain('date: formData.date');
    expect(SOURCE).not.toContain('time: formData.time');
    expect(SOURCE).not.toContain('endTime: formData.endTime');
  });

  it('composes instants through the platform’s only wall-clock converter', () => {
    // The same function `event/[id].tsx` uses for a reminder's `subjectMoment`,
    // so a created event and a reminder set on it cannot disagree across a
    // daylight-saving boundary. A second `new Date(...)` here would be a second
    // set of DST bugs, found separately, twice a year.
    expect(SOURCE).toContain('convertToInstant');
  });

  it('sends no price, because the server has no field for one', () => {
    // "Paid events and ticketing are explicitly out of scope, and a price field
    // would be the first half of a payment system." The two inputs that were
    // here collected an amount, showed it back on the confirm step, and dropped
    // it — so an event advertised at £15 published as free.
    expect(SOURCE).not.toContain("updateField('price'");
    expect(SOURCE).not.toContain("updateField('currency'");
    expect(SOURCE).toContain('isFree: formData.isFree');
  });

  it('does not send a status the DTO has no member for', () => {
    // The route's own summary: "Lands as a private draft whatever this says."
    // Sending `status: 'Published'` asked for something the contract does not
    // offer, and the screen then navigated to a success page.
    expect(SOURCE).not.toContain("buildPayload('Published')");
    expect(SOURCE).not.toContain("buildPayload('Draft')");
  });

  it('does not claim the event is published', () => {
    // Creation lands a private draft. Saying otherwise is the defect this
    // remediation exists to remove, and this screen previously said it twice.
    expect(SOURCE).not.toContain('Failed to publish event');
    expect(SOURCE).toContain('Saved as a draft');
  });

  it('refuses before sending when a required field is missing', () => {
    // A required field the form never asked for produces a 400 the member
    // cannot act on — which is what this screen did for every submission it
    // ever made.
    expect(SOURCE).toContain('missingRequired');
  });

  it("files the event in the member's residence, without silently defaulting it", () => {
    // Since 14 Oct 2026 the country is never asked: it is the member's verified
    // residence. Wave A had to remove `|| 'GB'` fallbacks from registration, so
    // there is still no default — a member with no residence is told so.
    expect(SOURCE).toContain('residenceCountry');
    expect(SOURCE).toContain('countryCode: residenceCountry');
    expect(SOURCE).not.toContain("updateField('countryCode'");
    expect(SOURCE).not.toContain("countryCode: 'GB'");
    expect(SOURCE).toContain("label: 'Country of residence (set it on your profile)'");
  });

  it('picks the town and the event type with the shared controls', () => {
    expect(SOURCE).toContain('<TownPicker');
    expect(SOURCE).toContain("updateField('cityName', town.cityName)");
    expect(SOURCE).toContain('<SearchableSelect');
  });
});
