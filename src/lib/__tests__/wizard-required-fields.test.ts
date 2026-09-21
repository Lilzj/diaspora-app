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
 * Every `<Button …>` and `<TouchableOpacity …>` opening tag in a source file.
 *
 * **Brace-aware, because `=>` is not the end of a tag.** A handler written
 * inline — `onPress={() => { … }}` — contains a `>` that a naive scan reads as
 * the end of the element, which then appears to carry no `disabled` prop. The
 * housing wizard writes it exactly that way, so the first version of the rule
 * below reported that the screen it was written for had no advancing button at
 * all.
 *
 * Depth is counted over braces only: a `>` at depth zero closes the tag, and
 * every arrow lives inside one.
 */
function openingTags(source: string): string[] {
  const tags: string[] = [];

  for (const opener of ['<Button', '<TouchableOpacity']) {
    for (let at = source.indexOf(opener); at !== -1; at = source.indexOf(opener, at + 1)) {
      let depth = 0;

      for (let cursor = at; cursor < source.length; cursor += 1) {
        const character = source[cursor];

        if (character === '{') depth += 1;
        else if (character === '}') depth -= 1;
        else if (character === '>' && depth === 0) {
          tags.push(source.slice(at, cursor + 1));
          break;
        }
      }
    }
  }

  return tags;
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
  {
    name: 'marketplace',
    file: ['marketplace', 'create.tsx'],
    // Every rule that used to be a `showAlert` after the member tapped Next.
    // The price fields are conditional on the intent — a giveaway states none,
    // a wanted advert states a range — so they appear here as all three names.
    fields: [
      'Listing intent',
      'Product category',
      'Product title',
      'Description',
      'Lowest price',
      'Highest price',
      'Price',
      'City',
      'Neighbourhood or area',
      'Cover image',
    ],
  },
];

/** Not yet converted. Each line is a debt, and the list is meant to empty. */
const PENDING: { name: string; file: string[]; note: string }[] = [
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
  /**
   * **The button that advances, not merely some button.** Converting the
   * marketplace, the gate went onto Publish — which is on the last step — while
   * "Next Step" was a bare `TouchableOpacity` with no `disabled` at all. The
   * popups had just been removed from `handleNext`, so for a few minutes a
   * member could have walked all seven steps with every field empty. It was
   * caught by reading the footer, which is not a thing to rely on.
   *
   * The two wizards write this differently — one calls `handleNext`, the other
   * steps `currentStep` inside a multi-line arrow — so the tag is found by
   * reading opening tags rather than by matching a shape.
   */
  it('gates whatever moves the member forward', () => {
    const advancing = openingTags(source).filter(
      (tag) => /handleNext|setCurrentStep\(currentStep \+ 1\)/.test(tag)
    );

    expect(advancing.length).toBeGreaterThan(0);

    for (const tag of advancing) {
      expect(tag).toMatch(/disabled=\{[^}]*stillNeeded/);
    }
  });

  it('gates on the declaration rather than a second set of rules', () => {
    expect(source).toMatch(/disabled=\{[^}]*stillNeeded\.length > 0/);
    expect(source).not.toMatch(/disabled=\{\s*\(currentStep === 0/);
  });

  it('tells the member which field is still missing', () => {
    expect(source).toMatch(/Still needed: \$?\{?stillNeeded\.join/);
  });

  /**
   * A dialog after the fact is the thing this replaced. Finding out a field was
   * required by filling in everything else, tapping a button and reading a
   * popup is how a member ends up hunting a seven-step form.
   */
  it('does not refuse by popup after the member has already tapped', () => {
    expect(source).not.toContain("title: 'Required Field'");
  });
});

/**
 * The debt, counted. This does not fail — it exists so the number is visible
 * and so removing a wizard from `PENDING` without converting it is a deliberate
 * act rather than an oversight.
 */
describe('the wizards still to convert', () => {
  it('are the two named here, and each one still exists', () => {
    expect(PENDING).toHaveLength(2);

    for (const wizard of PENDING) {
      expect(sourceOf(...wizard.file).length).toBeGreaterThan(0);
    }
  });

  it('have not quietly been converted without being moved off the list', () => {
    const converted = PENDING.filter((wizard) => sourceOf(...wizard.file).includes('const stillNeeded'));

    expect(converted.map((wizard) => wizard.name)).toEqual([]);
  });
});
