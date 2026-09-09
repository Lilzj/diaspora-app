// ─────────────────────────────────────────────────────────────────────────────
// The organisation create payload
//
// `src/app/community-life/org/create.tsx` could not create an organisation.
// `CreateOrganizationRequest` declares four `required` members — `Name`,
// `Summary`, `OrganizationTypeKey`, `CountryCode` — and the payload supplied
// **one**. The form spread its whole state and added a `status`:
//
//     category, name, description, mission, services, cityName, areaName,
//     addressLine, phone, whatsapp, email, website, openingHours,
//     verificationDocument, hasMembershipPlans, status, media
//
// `Summary` and `CountryCode` had no field on the form at all;
// `OrganizationTypeKey` went as `category` carrying a display name like
// "Associations"; and `addressLine`, `openingHours`, `verificationDocument`,
// `hasMembershipPlans` and `status` are not members of the request. C#
// `required` means System.Text.Json **refuses the body before any handler
// runs**, so every save and every publish 400'd and the screen said "Failed to
// register community hub" — which reads as a network problem.
//
// That is why the platform has no organisations on it. Not that nobody tried:
// nobody could succeed.
//
// The identical defect the event create had, on the sibling screen, found the
// same way — by trying to use it. These assertions read the source rather than
// driving four wizard steps to reach one object; what must not regress is the
// **shape of the body**, and that is legible in the source.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/**
 * The screen's source with its comments removed.
 *
 * Same reason as the event equivalent: documenting a removed lie must not be
 * indistinguishable from committing it. This file's own header names every
 * wrong field, and a check that read prose would fail on the explanation.
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
    path.join(process.cwd(), 'src', 'app', 'community-life', 'org', 'create.tsx'),
    'utf8'
  )
);

describe('the organisation create payload carries what the request requires', () => {
  it.each([
    ['name', 'the organisation is nothing without one'],
    ['summary', 'required, and the form had no field for it'],
    ['organizationTypeKey', 'required; `category` is a display name, not a key'],
    ['countryCode', 'required, and the form had no field for it'],
  ])('sends %s (%s)', (field) => {
    expect(SOURCE).toMatch(new RegExp(`\\b${field}:`));
  });

  it('translates the display category into a catalogue key', () => {
    // The client's `OrgCategory` is a display vocabulary — "Associations",
    // "Churches" — and the platform's keys are `cultural-association`,
    // `place-of-worship`. Sending one where the other is expected is refused.
    expect(SOURCE).toContain('toOrganizationTypeKey(formData.category)');
  });

  it('nests the contact details, which is how the request carries them', () => {
    expect(SOURCE).toMatch(/contact:\s*\{/);
    expect(SOURCE).toContain('whatsApp:');
  });
});

describe('it does not send fields the request has no member for', () => {
  it.each([
    ['status', 'not a member; creating always produces a draft'],
    ['addressLine', 'not a member of the create request'],
    ['openingHours', 'set later, through its own route'],
    ['verificationDocument', 'not a member'],
    ['hasMembershipPlans', 'not a member'],
  ])('does not send %s (%s)', (field) => {
    // Scoped to the payload builder: these are still form state, and some are
    // still rendered. What must not happen is putting them in the body.
    const builder = SOURCE.slice(
      SOURCE.indexOf('const buildPayload'),
      SOURCE.indexOf('const missingRequired')
    );

    expect(builder).not.toMatch(new RegExp(`\\b${field}:`));
  });

  it('no longer spreads the whole form into the body', () => {
    // `{ ...rest, status, media }` is what sent eleven fields the server had
    // never heard of, and omitted three it insists on.
    expect(SOURCE).not.toMatch(/\.\.\.rest/);
  });
});

describe('a refusal says what was wrong with it', () => {
  it('checks the required fields before asking', () => {
    // A required field the form never asked for produces an error the member
    // cannot act on, which is what this screen did for every submission it
    // ever made.
    expect(SOURCE).toContain('missingRequired');
  });

  it('reads the platform detail rather than a fixed sentence', () => {
    expect(SOURCE).toMatch(/response\?\.data\?\.detail/);
    expect(SOURCE).not.toContain('Failed to register community hub');
    expect(SOURCE).not.toContain('Failed to save draft.');
  });

  it('does not claim the organisation is live when it is a draft', () => {
    // Creating produces a draft; publishing is its own route and the client
    // does not call it yet. The copy must not imply otherwise.
    expect(SOURCE).toMatch(/draft/i);
  });
});
