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
    fields: ['Country', 'Category', 'Guide title', 'Guide content'],
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
  {
    name: 'event',
    file: ['community-life', 'event', 'create.tsx'],
    note:
      'Title, summary, description and address line are each refused by the ' +
      'platform and each announced in a "Validation Error" alert after the tap.',
  },
  {
    name: 'organization',
    file: ['community-life', 'org', 'create.tsx'],
    note: 'Name, summary, description and address line — the same four alerts.',
  },
  {
    name: 'job',
    file: ['job', 'create.tsx'],
    note:
      '`jobPostingFormProblem` already holds the rules and already knows the ' +
      'step. It is called from `next` and shown as an alert titled "Not yet" ' +
      'rather than read before the member taps.',
  },
  {
    name: 'swap',
    file: ['marketplace', 'swap-create.tsx'],
    note:
      'Closer still: `problem` is computed during render and then ignored ' +
      'until the tap, when the same value becomes an alert.',
  },
  {
    name: 'campaign',
    file: ['monetization', 'campaigns', 'create.tsx'],
    note:
      'Half the rule already holds — `canAdvance` really does disable the ' +
      'button. It is a boolean, so the member gets a dead grey control and no ' +
      'name for what is missing, which is the half that leaves somebody ' +
      'scrolling a form hunting for it.',
  },
  {
    name: 'diaspora verification',
    file: ['verification', 'diaspora.tsx'],
    note:
      'A selfie and a document are required and refused after the fact, one ' +
      'of them with "Please fill in all details." — which names no detail.',
  },
  {
    name: 'identity verification',
    file: ['verification', 'identity.tsx'],
    note:
      'Steps are named states rather than numbers and it collects two ' +
      'captures, not typed fields. Needs deciding on its own terms rather ' +
      'than converting by rote.',
  },
  {
    name: 'phone verification',
    file: ['verification', 'phone.tsx'],
    note:
      'Two states, a number then a code. The buttons gate on `isLoading` ' +
      'alone, so both can be sent empty.',
  },
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
