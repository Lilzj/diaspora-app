// ─────────────────────────────────────────────────────────────────────────────
// A form that refuses has to say what for — 24 Sep 2026
//
// The companion to `wizard-required-fields.test.ts`, for the screens that do
// not step. Same rule, same two halves:
//
//   the gate       the button must refuse while the form is incomplete, and
//                  refuse on something the form holds — not merely on
//                  `isPending`, which refuses for a second while the request
//                  is in flight and is not a rule about fields at all.
//
//   the telling    the member must be able to tell what it is waiting for
//                  without pressing anything.
//
// **The second half is the one that was missing everywhere.** Of the twelve
// forms below, one had no gate at all; most of the rest already refused
// correctly and explained nothing. A disabled button with no reason beside it
// is why somebody scrolls a form hunting for what they missed, and on a screen
// where a request costs money or is the only route back into the product, it is
// worse than that.
//
// A form here is derived, not listed: anything under `src/app` that collects
// typed input and sends it. A screen written next week is caught by the same
// sweep and fails until somebody decides which list it belongs on.
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

/** A screen that walks a member through steps belongs to the other file. */
const STEPS_THROUGH = /\bset(?:Current)?(?:Step|ActiveStep|StepIndex)\s*\(/;

/** Somewhere it collects what a member types. */
const COLLECTS = /<TextInput|<Input[\s>]/;

/** Somewhere it sends it. */
const SENDS = /useMutation|mutateAsync|apiClient\.(?:post|put|patch)/;

/**
 * Every screen under `src/app` that collects typed input and sends it, and is
 * not a wizard.
 */
function formFiles(): string[] {
  const root = path.join(process.cwd(), 'src', 'app');
  const found: string[] = [];

  const walk = (directory: string, prefix: string[]) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }) as DirEntry[]) {
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') {
          walk(path.join(directory, entry.name), [...prefix, entry.name]);
        }
        continue;
      }

      if (!entry.name.endsWith('.tsx')) continue;

      const source = fs.readFileSync(path.join(directory, entry.name), 'utf8');

      if (STEPS_THROUGH.test(source)) continue;
      if (!COLLECTS.test(source) || !SENDS.test(source)) continue;

      found.push([...prefix, entry.name].join('/'));
    }
  };

  walk(root, []);

  return found;
}

/** Every `disabled={…}` in a file, brace-aware, as its inner expression. */
function disabledExpressions(source: string): string[] {
  const found: string[] = [];
  const opener = 'disabled={';

  for (let at = source.indexOf(opener); at !== -1; at = source.indexOf(opener, at + 1)) {
    let depth = 1;

    for (let cursor = at + opener.length; cursor < source.length; cursor += 1) {
      const character = source[cursor];

      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          found.push(source.slice(at + opener.length, cursor));
          break;
        }
      }
    }
  }

  return found;
}

/**
 * A form that refuses, and says so.
 *
 * `gate` must appear inside some `disabled={…}`: proof the button reads the
 * form rather than only a pending flag. `tells` must appear in the source: the
 * words the member gets. A form may omit `tells` only with a `why` — and the
 * only `why` accepted so far is that the form is a single field beside a single
 * button, where there is nothing to be ambiguous about.
 */
const FORMS: {
  name: string;
  file: string[];
  gate: RegExp;
  tells?: RegExp;
  why?: string;
}[] = [
  {
    name: 'appeal a restriction',
    file: ['profile', 'appeals.tsx'],
    gate: /!canSubmit/,
    tells: /Still needed: \{stillNeeded\.join/,
  },
  {
    name: 'write a review',
    file: ['write-review.tsx'],
    // Not a field list: `buildReviewRequest` answers with the reason there can
    // be no request at all, which covers a rating of none and a review nobody
    // could file. Both are now known before the member writes anything.
    gate: /built\.refusal !== undefined/,
    tells: /\{built\.refusal\.message\}/,
  },
  {
    name: 'donate',
    file: ['wallet', 'donate.tsx'],
    gate: /!canContinue/,
    tells: /Still needed: an amount/,
  },
  {
    name: 'contribute to a campaign',
    file: ['wallet', 'contribute.tsx'],
    gate: /!canSubmit/,
    tells: /Still needed: \{isMonetary/,
  },
  {
    name: 'agree a viewing time',
    file: ['housing', 'viewings.tsx'],
    gate: /scheduleProblem !== null/,
    tells: /\{scheduleProblem\}/,
  },
  {
    name: "an event's capacity",
    file: ['community-life', 'event', '[id].tsx'],
    gate: /capacityProblem !== null/,
    tells: /\{capacityProblem\}/,
  },
  {
    name: 'build an automation',
    file: ['automation', 'create.tsx'],
    // This one already did it, under different names and before the rule
    // existed: `validateDraft` produces issues, `issuesForStep` splits them per
    // step, an `IssueList` renders them where they belong, and `canSaveDraft`
    // gates on the same value. Listed rather than changed.
    gate: /!canSave/,
    tells: /<IssueList issues=\{issuesForStep/,
  },
  {
    name: 'convert reward points',
    file: ['wallet', 'rewards', 'convert.tsx'],
    // The platform quotes the conversion and says why one is refused; the
    // screen prints that sentence rather than composing its own.
    gate: /!quote\?\.isValid/,
    tells: /quote\.refusalMessage/,
  },
  {
    name: 'decide an advertising campaign',
    file: ['monetization', 'campaigns', 'reviews.tsx'],
    gate: /!canReject/,
    // Rejecting takes a note and approving does not. The asymmetry is written
    // where it is met, on the field itself.
    tells: /required to reject/,
  },
  {
    name: 'appeal a campaign decision',
    file: ['monetization', 'campaigns', '[id].tsx'],
    gate: /appealNote\.trim\(\)\.length === 0/,
    why: 'One field and one button, with the placeholder asking for exactly it.',
  },
  {
    name: 'register a payout identity',
    file: ['wallet', 'payout-accounts.tsx'],
    gate: /identity\.trim\(\)\.length === 0/,
    why: 'One field and one button. Nothing else on the form can be what is missing.',
  },
];

/**
 * Screens the sweep catches that are not forms.
 *
 * The sweep deliberately over-collects — a search box is typed input and a
 * screen that filters is a screen that sends — so what it catches wrongly is
 * listed with a `proof` that must remain true.
 */
const NOT_A_FORM: { name: string; file: string[]; why: string; proof: RegExp }[] = [
  {
    name: 'discover',
    file: ['(tabs)', 'discover.tsx'],
    why:
      'The typed input is a search box and the button the sweep finds is "load ' +
      'more". Nothing here is submitted for a member to get wrong; an empty ' +
      'search is a legitimate search.',
    proof: /state === 'failed' \? `Try again/,
  },
];

/** Not yet done. Empty, and checked in both directions below. */
const PENDING: { name: string; file: string[]; note: string }[] = [];

describe.each(FORMS)('$name', ({ file, gate, tells, why }) => {
  const source = sourceOf(...file);

  /**
   * **On something the form holds.** `disabled={isPending}` is not a rule about
   * fields — it refuses for the second the request is in flight and permits
   * everything else, which is what "Agree this time" did on an empty day and an
   * empty time.
   */
  it('refuses on what the form holds, not merely on a request in flight', () => {
    const expressions = disabledExpressions(source);

    expect(expressions.length).toBeGreaterThan(0);
    expect(expressions.filter((expression) => gate.test(expression))).not.toEqual([]);
  });

  it('says what it is waiting for', () => {
    if (!tells) {
      // A form may be silent only where silence cannot mislead, and only with
      // the reason written down.
      expect(why).toBeTruthy();
      return;
    }

    expect(source).toMatch(tells);
  });
});

describe.each(NOT_A_FORM)('$name', ({ file, proof }) => {
  it('is still not a form', () => {
    expect(sourceOf(...file)).toMatch(proof);
  });
});

describe('every form in the application', () => {
  /**
   * **Both directions.** A sweep that matches nothing satisfies every rule of
   * the shape "nothing is unaccounted for", which is exactly how the wizard
   * guard reported four of thirteen screens converted earlier today. So the
   * sweep is also checked against the list.
   */
  it('can see every form already written down', () => {
    const found = new Set(formFiles());

    const declared = [...FORMS, ...NOT_A_FORM, ...PENDING].map((form) => form.file.join('/'));

    expect(declared.filter((file) => !found.has(file))).toEqual([]);
  });

  it('is either done, not a form, or a named debt', () => {
    const known = new Set(
      [...FORMS, ...NOT_A_FORM, ...PENDING].map((form) => form.file.join('/'))
    );

    expect(formFiles().filter((file) => !known.has(file))).toEqual([]);
  });

  it('does not list a wizard, which the other guard owns', () => {
    const wizards = formFiles().filter((file) => STEPS_THROUGH.test(sourceOf(...file.split('/'))));

    expect(wizards).toEqual([]);
  });
});
