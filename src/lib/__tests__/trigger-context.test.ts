// ─────────────────────────────────────────────────────────────────────────────
// The dry run that could not fail and could not pass
//
// `POST /automations/simulate` has carried a `sampleSubjectId` since it shipped,
// documented as "an optional real subject to evaluate against, so a dry run
// borrows real state". Two ends of one contract, each correct on its own terms:
//
//   **The platform** copied the identifier onto the trigger context and left
//   every other field at its default — `Values` included, which that record's
//   own summary calls "the entire surface a condition can be answered from".
//
//   **The client** never sent one, and threw the whole response away besides:
//   `await automationApi.simulateAutomation(draft)` with the result unassigned,
//   kept only as a boolean. Its comment said the call was "asked only for the
//   audience, which is the one part a client genuinely cannot know" — and the
//   audience came from a different call entirely.
//
// So the platform answered wrongly and the client discarded the answer unread.
// Neither half was visible from the other, and the member saw a test result
// that said, of a rule checking an event's country: *"This trigger does not
// carry the information the 'country' check needs."* It carries it.
//
// Confirmed against the deployed platform on 10 Sep 2026 in both directions —
// SKIPPED with those words before, COMPLETED with `matched: true` after, and a
// wrong country still correctly reported as "did not match" rather than as
// unevaluable.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const source = (...segments: string[]) =>
  fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');

const BLOCK_COMMENT = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
const LINE_COMMENT = new RegExp('//[^\\n]*', 'g');

const stripped = (...segments: string[]) =>
  source(...segments).replace(BLOCK_COMMENT, ' ').replace(LINE_COMMENT, ' ');

describe('the subject reaches the platform', () => {
  const client = stripped('lib', 'automation', 'certified-client.ts');

  it('sends sampleSubjectId when there is one', () => {
    expect(client).toMatch(/sampleSubjectId\s*\?\s*\{\s*sampleSubjectId\s*\}/);
  });

  it('omits it rather than sending null', () => {
    // `Guid?` binds a missing field to null and an explicit null the same way,
    // but an omitted optional is the one that cannot be read as "no subject,
    // and I mean it" by a future handler that starts distinguishing them.
    expect(client).not.toMatch(/sampleSubjectId:\s*sampleSubjectId\s*\?\?\s*null/);
  });

  it('reads one route, not thirteen', () => {
    expect(client).toMatch(/get<AutomationTriggerContext>\('\/trigger-context'/);
  });
});

describe('the builder can name a subject', () => {
  const screen = stripped('app', 'automation', 'create.tsx');

  it('passes the chosen subject to the test', () => {
    expect(screen).toMatch(/mutateAsync\(\{ draft, sampleSubjectId: testSubjectId \}\)/);
  });

  it('re-tests when the subject changes', () => {
    // Without `testSubjectId` in the dependency list the handler closes over
    // the first subject chosen and every later test re-runs the first one —
    // silently, because a stale closure produces a plausible result.
    expect(screen).toMatch(/\[draft, simulator, testSubjectId\]/);
  });

  it('renders the picker', () => {
    expect(screen).toMatch(/<TestSubjectPicker/);
  });
});

describe('the picker only offers what the platform can answer', () => {
  const picker = stripped('components', 'automation', 'TestSubjectPicker.tsx');

  it('shows nothing for a trigger with no subject source', () => {
    // Hidden, not disabled — the rule the rest of this phase follows. A member
    // is not shown a control that cannot do anything.
    expect(picker).toMatch(/if \(!isPickable \|\| options\.length === 0\) \{\s*return null;/);
  });

  it('sends the identifier the platform resolves, not a slug', () => {
    // `toEvent` maps `id: wire.eventId ?? wire.id ?? ''`, so `event.id` is the
    // GUID. A slug here would be refused server-side where nobody is looking.
    expect(picker).toMatch(/id: event\.id/);
    expect(picker).not.toMatch(/event\.slug/);
  });

  it('names the checks rather than quoting their values', () => {
    // `answers` carries every key including the sensitive ones; `values` omits
    // those. Rendering `values` here would print figures the run record itself
    // withholds.
    expect(picker).toMatch(/context\.answers\.join/);
    expect(picker).not.toMatch(/context\.values/);
  });
});

describe('the platform’s verdicts are used, and only where they are better', () => {
  const hook = stripped('hooks', 'automation.ts');
  const body = hook.slice(
    hook.indexOf('export function useAutomationSimulation'),
    hook.indexOf('export function useTriggerContext')
  );

  it('no longer discards the response', () => {
    expect(body).toMatch(/const result = await automationApi\.simulateAutomation\(/);
  });

  it('takes the server’s conditions only when a subject was sent', () => {
    // Without one the platform knows nothing the phone does not, and its
    // "not tested, there was no real subject" is the same fact the local
    // simulation states in better words.
    expect(body).toMatch(/if \(sampleSubjectId && result\.run\.conditionOutcomes\.length > 0\)/);
  });

  it('does not claim an action would run under a failed check', () => {
    // The platform's own response ships this disagreement: `wouldHaveDone` is
    // built from the draft's actions whatever the run did, so a SKIPPED run
    // still lists what it "would have done".
    expect(body).toMatch(/wouldHaveDone: blocked \? \[\] : result\.wouldHaveDone/);
  });

  it('still runs the local simulation, so a test works offline', () => {
    expect(body).toMatch(/const result = simulate\(draft, simulationContext\)/);
    expect(body).toMatch(/serverEvaluated = false/);
  });
});

describe('the register stops describing thirteen routes', () => {
  const register = source('config', 'automation-gaps.ts');

  it('declares the contract that exists', () => {
    const declared = register.match(/endpoint: 'GET \/automations\/trigger-context'/g) ?? [];

    expect(declared.length).toBe(13);
  });

  it('declares none of the ones that never did', () => {
    // Six of the thirteen named a path parameter their own endpoint had no
    // room for — `request: 'jobId: string'` against `/triggers/jobs/context`.
    expect(register).not.toMatch(/endpoint: 'GET \/automations\/triggers\/[a-z]*\/?\{?[a-zA-Z]*\}?\/?context'/);
  });
});
