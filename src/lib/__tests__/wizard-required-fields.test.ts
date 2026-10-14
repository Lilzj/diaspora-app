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

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
};
const path = require('path') as { join(...segments: string[]): string };

function sourceOf(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', 'app', ...segments), 'utf8');
}

/**
 * A file under `src` that is not a screen.
 *
 * Some wizards keep their requirements in the module that already owns the
 * step's rules, so the label a member reads and the sentence explaining it come
 * from one place. The rule follows the declaration rather than insisting it sit
 * in the screen — where it would be a second copy of rules that already exist.
 */
function moduleSourceOf(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');
}

/**
 * Every screen under `src/app` that walks a member through steps.
 *
 * Found by the thing that makes it a wizard rather than by a list somebody
 * maintains, because a list somebody maintains is the thing that goes stale.
 *
 * <p>
 * <b>The first version of this went stale anyway, and said so cheerfully.</b>
 * It matched the literal <code>setCurrentStep(currentStep + 1)</code>, which is
 * how four screens are written and how nine others are not — they call the
 * state <code>step</code>, or <code>stepIndex</code>, or advance with
 * <code>prev =&gt; prev + 1</code>, or step through keys rather than numbers.
 * So the debt list sat empty and the file reported every wizard converted while
 * nine of the thirteen were invisible to it. A derived list is only as honest
 * as the thing deriving it.
 * </p>
 * <p>
 * It now matches any step setter at all, and deliberately over-collects: a
 * screen that merely holds a step is caught too. Over-collecting is the safe
 * direction, because everything caught has to be converted or written down
 * with a reason — a state machine that collects no fields is a decision
 * somebody made, not a screen nobody looked at.
 * </p>
 */
function wizardFiles(): string[] {
  const root = path.join(process.cwd(), 'src', 'app');
  const found: string[] = [];

  const walk = (directory: string, prefix: string[]) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }) as DirEntry[]) {
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(path.join(directory, entry.name), [...prefix, entry.name]);
        continue;
      }

      if (!entry.name.endsWith('.tsx')) continue;

      const source = fs.readFileSync(path.join(directory, entry.name), 'utf8');

      if (/\bset(?:Current)?(?:Step|ActiveStep|StepIndex)\s*\(/.test(source)) {
        found.push([...prefix, entry.name].join('/'));
      }
    }
  };

  walk(root, []);

  return found;
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
 * The button that goes forward, in every spelling this application uses.
 *
 * <p>
 * Six screens call a handler — `handleNext`, `nextStep`, `next` — and three
 * step the state inline. What they have in common is only that they move
 * forward, so the shapes are listed, and <b>the Back buttons must not match</b>:
 * `setStep(step - 1)`, `setCurrentStep(currentStep - 1)` and
 * `setStep(STEPS[index - 1].key)` all sit in the same footers.
 * </p>
 * <p>
 * A wizard written with a seventh spelling fails rather than passes, because
 * the rule below requires at least one advancing tag to be found. That is
 * deliberate: this file has already once reported success by recognising
 * nothing.
 * </p>
 */
const ADVANCES = /handleNext|nextStep|onPress=\{next\}|set(?:Current)?Step\([^)]*\+ 1/;

/**
 * A wizard that declares its required fields per step.
 *
 * `fields` are the labels the member reads. They are checked as text because
 * that is what the member is shown; a label that changes without the list
 * changing is a message naming a field that no longer exists.
 */
const CONVERTED: {
  name: string;
  file: string[];
  fields: string[];
  /** Where the labels are declared, under `src`, when that is not the screen. */
  labelsIn?: string[];
  /**
   * The controls that move a member on, when `ADVANCES` cannot see them.
   *
   * Two screens step through named states rather than numbers — there is no
   * `+ 1` anywhere in them and no `handleNext` — so the shape that finds a
   * forward button everywhere else finds nothing there. Naming them per screen
   * keeps the rule strict rather than loosening `ADVANCES` until it also
   * matches the Back buttons sitting in the same footers.
   */
  advancesVia?: RegExp;
}[] = [
  {
    name: 'housing',
    file: ['housing', 'create.tsx'],
    // `CreateHousingListingRequest` marks Title, Summary, AccommodationTypeKey
    // and CountryCode required; the handler additionally refuses a blank
    // description and a price it cannot build, and files the home by its town. The
    // cover image is required to publish rather than to advance.
    fields: [
      'Property category',
      'Listing title',
      'One-line summary',
      'Description',
      // Since 14 Oct 2026: no neighbourhood (the server never required one).
      // The country comes from residence, and is named only when it is absent.
      'Country of residence',
      'Town or city',
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
  {
    name: 'provider directory',
    file: ['(tabs)', 'post.tsx'],
    // `RegisterProviderRequest` marks Name, ProviderType and Category required.
    // The type is not asked for — the wizard offers one kind of listing and
    // sends `Business` — so these two are what the member supplies. Its other
    // five steps are genuinely optional and declare an empty list, which is a
    // step somebody decided about rather than one nobody looked at.
    fields: ['Business or service name', 'At least one category'],
  },
  {
    name: 'guide',
    file: ['guide', 'create.tsx'],
    // No Country: since 14 Oct 2026 a guide is filed under the residence country, unasked.
    fields: ['Category', 'Guide title', 'Guide content'],
  },
  {
    name: 'diaspora verification',
    file: ['verification', 'diaspora.tsx'],
    // Step 0 was not gated at all: `nextStep` opened with a bare `return` and
    // the button stayed live, so an unanswered document type met a control
    // that did nothing and said nothing.
    fields: [
      'Document Type',
      'My Nationality',
      'Current Residence Country',
      'Issue Country',
      'Document ID Number',
      'Document scan',
      'Selfie',
    ],
  },
  {
    name: 'identity verification',
    file: ['verification', 'identity.tsx'],
    // Both buttons already refused and neither said why. The capture step has
    // two different things it could be waiting for, one of them a row of
    // country chips under the photograph just uploaded.
    advancesVia: /setStep\('selfie'\)|handleSubmit/,
    fields: ['Document photo', 'Where was it issued?', 'Selfie'],
  },
  {
    name: 'phone verification',
    file: ['verification', 'phone.tsx'],
    // The rule existed inside `handleRequestOtp`, so the only way to learn it
    // was to press a live button. Both controls here send a code, so both
    // read the declaration.
    advancesVia: /handleRequestOtp/,
    fields: ['New phone number'],
  },
  {
    name: 'event',
    file: ['community-life', 'event', 'create.tsx'],
    // The country and the date were required only by `missingRequired`, which
    // runs at Publish — six steps after the member last saw either of them.
    fields: [
      'Event Title',
      'One-line summary',
      'Description',
      'Date',
      'Start Time',
      'End Time',
      'Country of residence (set it on your profile)',
      'Address Line',
    ],
  },
  {
    name: 'organization',
    file: ['community-life', 'org', 'create.tsx'],
    // No country here: this form has no country field at all. It is filled
    // from the member's residence, so it cannot be named as a missing field —
    // it is said at Publish, with the place it can actually be set.
    fields: ['Organization Name', 'One-line summary', 'Description', 'Address Line'],
  },
  {
    name: 'job',
    file: ['job', 'create.tsx'],
    // Pay is optional on a posting and vacancies default to one, so neither is
    // here. What is left is what `PostJobCommand` will not accept without.
    // The country is not a field since 14 Oct 2026 (the member's residence),
    // so it is named as theirs when the account has none.
    labelsIn: ['lib', 'job-postings-api.ts'],
    fields: ['Category', 'Job title', 'Description', 'Country of residence'],
  },
  {
    name: 'swap',
    file: ['marketplace', 'swap-create.tsx'],
    // Declared in the module that already held the step's rules, so that
    // "Still needed: Photo" and "Add a photo of your item." cannot drift
    // apart. The screen reads it; it does not restate it.
    labelsIn: ['lib', 'swap-listings.ts'],
    fields: [
      'Item title',
      'Description',
      'Category',
      'Photo',
      'What you would take',
      'Top-up amount',
      'Country of residence (set it on your profile)',
      'Town',
    ],
  },
  {
    name: 'campaign',
    file: ['monetization', 'campaigns', 'create.tsx'],
    // This one already refused. What it did not do was say what for, and the
    // creative step has three fields it could have been. The audience step
    // declares an empty list on purpose — an empty audience is "everybody".
    fields: ['Campaign name', 'Campaign goal', 'Headline', 'Body', 'Button text', 'A budget'],
  },
];

/**
 * Not yet converted.
 *
 * <p>
 * <b>This was empty, and the emptiness was a measurement error.</b> It read
 * empty from 21 Sep 2026 until the sweep above was widened on 24 Sep, because
 * the sweep matched one spelling of advancing a step and nine screens use
 * another. Four wizards converted out of four looked like finished work; it was
 * four out of thirteen.
 * </p>
 */
const PENDING: { name: string; file: string[]; note: string }[] = [
];

/**
 * Screens that step, and ask for nothing.
 *
 * <p>
 * The widened sweep deliberately over-collects, and over-collecting means some
 * of what it catches is not a form at all. Listing those here rather than as
 * debt keeps the debt number honest — but the claim has to be checked, or this
 * becomes the place wizards are quietly parked. Each entry names a `proof`:
 * something that must remain in the source for "nothing is required" to still
 * be true. Take the proof away and the screen fails here.
 * </p>
 */
const NOTHING_REQUIRED: { name: string; file: string[]; why: string; proof: RegExp }[] = [
  {
    name: 'community onboarding',
    file: ['community', 'onboarding.tsx'],
    why:
      'Every step offers Skip, and `finish` treats every answer as optional — ' +
      'a primary community is written only `if (primaryChoice)`, interests are ' +
      'a list that may be empty, and preferences start from defaults. There is ' +
      'no field to gate on because there is no field the member must supply.',
    proof: /accessibilityLabel="Skip this step/,
  },
];

describe.each(CONVERTED)('the $name wizard', ({ file, fields, labelsIn, advancesVia }) => {
  const source = sourceOf(...file);
  const declaration = labelsIn ? moduleSourceOf(...labelsIn) : source;

  it('declares what every step needs rather than hiding it in a boolean', () => {
    expect(source).toContain('const requiredByStep');
    expect(source).toContain('const stillNeeded');
  });

  it('requires every field the server will not accept a request without', () => {
    for (const field of fields) {
      expect(declaration).toContain(`label: '${field}'`);
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
    const advancing = openingTags(source).filter((tag) => (advancesVia ?? ADVANCES).test(tag));

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
describe('every wizard in the application', () => {
  it('has not quietly been converted without being moved off the debt list', () => {
    const converted = PENDING.filter((wizard) =>
      sourceOf(...wizard.file).includes('const stillNeeded')
    );

    expect(converted.map((wizard) => wizard.name)).toEqual([]);
  });

  /**
   * **The rule that stops this file going stale.** Converting four wizards is
   * worth little if the fifth is written next week and nobody adds it here, so
   * the list is derived rather than trusted: anything under `src/app` that
   * steps a `currentStep` is a wizard, and it is either converted or a named
   * debt. A new one fails until somebody decides which.
   */
  /**
   * **The sweep has to be able to see what is already written down.**
   *
   * <p>
   * Everything below trusts `wizardFiles`, and a sweep that matches nothing
   * makes every one of those rules pass: no wizard is unaccounted for if no
   * wizard is found. That is not a hypothetical. Widening the sweep on 24 Sep
   * 2026 went out with `\b` written as an escape Python had already turned
   * into a backspace byte, the regex matched no file in the application, and
   * the suite went green reporting every wizard accounted for.
   * </p>
   * <p>
   * So the sweep is checked against the list rather than only the list against
   * the sweep. Both directions, or neither means anything.
   * </p>
   */
  it('can see every wizard already written down', () => {
    const found = new Set(wizardFiles());

    const declared = [...CONVERTED, ...PENDING, ...NOTHING_REQUIRED].map((wizard) =>
      wizard.file.join('/')
    );

    expect(declared.filter((file) => !found.has(file))).toEqual([]);
  });

  it('is either converted, a named debt, or a screen that asks for nothing', () => {
    const known = new Set(
      [...CONVERTED, ...PENDING, ...NOTHING_REQUIRED].map((wizard) =>
        wizard.file.join('/')
      )
    );

    const unaccounted = wizardFiles().filter((file) => !known.has(file));

    expect(unaccounted).toEqual([]);
  });

  it.each(NOTHING_REQUIRED)(
    'the $name screen still asks for nothing',
    ({ file, proof }) => {
      expect(sourceOf(...file)).toMatch(proof);
    }
  );
});
