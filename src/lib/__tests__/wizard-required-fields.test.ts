// ─────────────────────────────────────────────────────────────────────────────
// A field the server requires is a field the form requires — 21 Sep 2026
//
// Watched on a device: a landlord filled in seven steps of the housing wizard,
// tapped Publish, and got "Diaspora could not save your listing." The listing
// was refused with a 400 because `summary` was blank —
// `CreateHousingListingRequest` marks it `required` and
// `HousingDescription.Create` refuses it empty — and step 2's Next button gated
// on `!title || !description`, never on the summary. Nothing in the seven steps
// had said the field mattered, and the refusal did not name it.
//
// **This is the rule, and it is meant to grow.** Every wizard declares what
// each step needs; this file holds those declarations against the fields the
// server will not accept a request without. A screen that adds a step, or the
// platform that adds a required field, fails here rather than at a member's
// Publish button.
//
// Two halves, deliberately:
//
//   the gate       the Next button must refuse to advance. Source-level,
//                  because jsdom cannot press a button through seven steps.
//
//   the telling    the member must be told which field, by name. A disabled
//                  button with no explanation is why somebody scrolls a form
//                  hunting for what they missed.
//
// Wizards not yet converted are listed in `PENDING` with what they are missing,
// so the gap is a number that goes down rather than a thing nobody wrote down.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

function sourceOf(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', 'app', ...segments), 'utf8');
}

/**
 * A wizard that declares its required fields per step.
 *
 * `fields` are the labels the member reads. They are checked as text because
 * that is what the member is shown; a label that changes without the list
 * changing is a message naming a field that no longer exists.
 */
const CONVERTED: { name: string; file: string[]; fields: string[] }[] = [
  {
    name: 'housing',
    file: ['housing', 'create.tsx'],
    // `CreateHousingListingRequest` marks Title, Summary, AccommodationTypeKey
    // and CountryCode required; the handler additionally refuses a blank
    // description, a listing with no area, and a price it cannot build. The
    // cover image is required to publish rather than to advance.
    fields: [
      'Property category',
      'Listing title',
      'One-line summary',
      'Description',
      'Neighbourhood or area',
      'Address line',
      'Monthly rent',
      'Phone number',
      'Cover image',
    ],
  },
];

/** Not yet converted. Each line is a debt, and the list is meant to empty. */
const PENDING: { name: string; file: string[]; note: string }[] = [
  {
    name: 'marketplace',
    file: ['marketplace', 'create.tsx'],
    note: 'gates inline; refuses with an alert rather than naming the field on the step',
  },
  {
    name: 'provider directory',
    file: ['(tabs)', 'post.tsx'],
    note: 'gates inline',
  },
  {
    name: 'guide',
    file: ['guide', 'create.tsx'],
    note: 'gates inline',
  },
];

describe.each(CONVERTED)('the $name wizard', ({ file, fields }) => {
  const source = sourceOf(...file);

  it('declares what every step needs rather than hiding it in a boolean', () => {
    expect(source).toContain('const requiredByStep');
    expect(source).toContain('const stillNeeded');
  });

  it('requires every field the server will not accept a request without', () => {
    for (const field of fields) {
      expect(source).toContain(`label: '${field}'`);
    }
  });

  /**
   * The gate reads the declaration. An inline expression beside it would be a
   * second set of rules, and the two would part company the first time one was
   * edited — which is exactly how `summary` came to be required by the server
   * and optional on the form.
   */
  it('gates the button on that declaration and nothing else', () => {
    expect(source).toContain('disabled={stillNeeded.length > 0}');
    expect(source).not.toMatch(/disabled=\{\s*\(currentStep === 0/);
  });

  it('tells the member which field is still missing', () => {
    expect(source).toContain('Still needed: {stillNeeded.join');
  });
});

/**
 * The debt, counted. This does not fail — it exists so the number is visible
 * and so removing a wizard from `PENDING` without converting it is a deliberate
 * act rather than an oversight.
 */
describe('the wizards still to convert', () => {
  it('are the three named here, and each one still exists', () => {
    expect(PENDING).toHaveLength(3);

    for (const wizard of PENDING) {
      expect(sourceOf(...wizard.file).length).toBeGreaterThan(0);
    }
  });

  it('have not quietly been converted without being moved off the list', () => {
    const converted = PENDING.filter((wizard) => sourceOf(...wizard.file).includes('const stillNeeded'));

    expect(converted.map((wizard) => wizard.name)).toEqual([]);
  });
});
