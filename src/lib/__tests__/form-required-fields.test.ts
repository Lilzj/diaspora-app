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

import { screenSource } from './support/screen-files';

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
  // A screen is read whole: its route and every part it composes from (FSOLID-001).
  return screenSource(path.join(process.cwd(), 'src', 'app', ...segments));
}

/** A screen that walks a member through steps belongs to the other file. */
const STEPS_THROUGH = /\bset(?:Current)?(?:Step|ActiveStep|StepIndex)\s*\(/;

/** Somewhere it collects what a member types. */
const COLLECTS = /<TextInput|<Input[\s>]/;

/**
 * Somewhere it sends it.
 *
 * **This under-matched, and FSOLID-002 is how that showed.** It knew three
 * spellings — a TanStack mutation, a mutation's `mutateAsync`, and a direct
 * `apiClient.post|put|patch` — and after that row moved thirteen screens behind
 * the api layer, two declared screens stopped matching any of them. The screens
 * had not stopped sending; they had stopped sending *in a spelling this knew*.
 *
 * Adding the fourth spelling — awaiting a domain verb from the boundary —
 * found **seven more screens the sweep had never seen**, every one of them
 * already sending through a `*-api` module rather than through `apiClient`. A
 * detector that recognises one transport and calls the absence of it "not a
 * form" fails open, and silently: it reports nothing rather than reporting
 * less. They are in `PENDING` below, which is what that list is for.
 */
const SENDS =
  /useMutation|mutateAsync|apiClient\.(?:post|put|patch)|\bawait\s+(?:create|submit|save|send|publish|register|search)[A-Z]\w*\(/;

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

      const source = screenSource(path.join(directory, entry.name));

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
    name: 'change the sign-in email',
    file: ['profile', 'change-email.tsx'],
    // The password and the address, and an address that could be one and is
    // not already the account's. Each is said beside its field or the button.
    gate: /!canSubmit/,
    tells: /Still needed: \{stillNeeded\.join/,
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
    name: 'start or change a community initiative',
    file: ['community', '[slug]', 'initiatives', 'edit.tsx'],
    // Title and description are refused blank by the server
    // (`CommunityInitiative.Create`/`Revise`); the target date is optional.
    gate: /stillNeeded\.length > 0/,
    tells: /Still needed: \{stillNeeded\.join/,
  },
  {
    name: "post an initiative's progress update",
    file: ['community', '[slug]', 'initiatives', '[initiativeId].tsx'],
    // `CommunityInitiativeUpdate.Post` refuses a blank title or body.
    gate: /stillNeeded\.length > 0/,
    tells: /Still needed: \{stillNeeded\.join/,
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

/**
 * Not yet done, and checked in both directions below.
 *
 * **These seven were found when `SENDS` learned its fourth spelling** (see the
 * note on it). Each collects typed input and sends it through a `*-api` module;
 * none ever went through `apiClient` directly, so the sweep had never seen any
 * of them and each has been unexamined for as long as this file has existed.
 *
 * They are recorded rather than examined here because gating a form's submit
 * button on what the form holds is a change to that screen, and seven of them
 * is a phase rather than a footnote to FSOLID-002. Listing them is the point:
 * an unexamined form that nothing names is indistinguishable from one that does
 * not exist.
 */
const PENDING: { name: string; file: string[]; note: string }[] = [
  {
    name: 'one-time passcode',
    file: ['(auth)', 'otp.tsx'],
    note: 'Sends a code the member types. Whether it refuses an incomplete code before asking is unexamined.',
  },
  {
    name: 'access gateway',
    file: ['access-gateway.tsx'],
    note: 'Collects and submits; never seen by this sweep because it goes through the trust module.',
  },
  {
    name: 'edit an event',
    file: ['community-life', 'event', 'edit', '[id].tsx'],
    note: 'The create form is gated and examined; its edit twin has never been.',
  },
  {
    name: 'edit an organisation',
    file: ['community-life', 'org', 'edit', '[id].tsx'],
    note: 'As above, and the same pair: register is examined, edit is not.',
  },
  {
    name: 'edit a guide',
    file: ['guide', 'edit', '[id].tsx'],
    note: 'Sends through the guides module. Unexamined.',
  },
  {
    name: 'post an update',
    file: ['update', 'create.tsx'],
    note: 'Collects a body and posts it through the community module. Unexamined.',
  },
  {
    name: 'verify a country',
    file: ['verification', 'country.tsx'],
    note: 'Submits an identity claim through the trust module. Unexamined, and the most consequential of the seven.',
  },
];

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
