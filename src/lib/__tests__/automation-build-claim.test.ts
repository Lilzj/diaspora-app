// ─────────────────────────────────────────────────────────────────────────────
// A screen must not contradict itself.
//
// UAT-136. Automation settings rendered, in this order and on one screen:
//
//     Storing your automations            READY
//     Running them automatically          READY
//     Running them at set times           READY
//     Keeping a record of what ran        READY
//     Watching your saved searches        READY
//     Notifying you                       READY
//     Adding to your phone's calendar     READY
//
//     THIS BUILD
//     Automations are not available in this build yet.
//
// Both halves were drawn from the same render. The seven rows read
// `useAutomationSupport()`, which derives each flag from the deployment's own
// capability and catalogue documents. The sentence underneath read
// `areAutomationGapsEnabled()`, which is false in every release build.
//
// That flag answers "is the gap scaffolding compiled in" — it was never an
// answer to "does the platform run automations", and on this deployment it does:
// `Diaspora.Modules.Automation` serves 24 routes and `AutomationSchedulerWorker`
// is a registered BackgroundService.
//
// Same shape as the wallet in UAT-134, and the same rule: gate on what the
// deployment reports, never on a build flag. The narrower point here is that
// when one screen states a fact twice, both statements have to come from the
// same source, or one of them will eventually be wrong.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/** A file's code with its comments removed. See `password-auth.test.ts`. */
function read(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((line: string) => !/^\s*(\/\/|\*|\{\/\*)/.test(line))
    .join(String.fromCharCode(10));
}

const SETTINGS = read('src', 'app', 'automation', 'settings.tsx');

describe('automation settings says one thing about itself', () => {
  it('derives the build claim from the served capability', () => {
    expect(SETTINGS).toMatch(
      /const automationsRun =\s*\n?\s*\(support\?\.hasRegistry \?\? false\) && \(support\?\.hasExecutionEngine \?\? false\)/
    );
  });

  it('reads the same two fields the capability rows render', () => {
    // This is the property that makes the contradiction impossible rather than
    // merely fixed: if the rows and the sentence disagree tomorrow, it will be
    // because someone changed both.
    expect(SETTINGS).toMatch(/available=\{support\?\.hasRegistry \?\? false\}/);
    expect(SETTINGS).toMatch(/available=\{support\?\.hasExecutionEngine \?\? false\}/);
  });

  it('no longer denies automations on the strength of a build flag', () => {
    expect(SETTINGS).not.toMatch(/Automations are not available in this build yet/);
  });

  it('still says so when the deployment genuinely serves nothing', () => {
    // The denial is kept — it just has to be earned. Removing it outright would
    // trade a false denial for a false claim, which is the worse direction.
    expect(SETTINGS).toMatch(/Automations are not available yet/);
    expect(SETTINGS).toMatch(/automationsRun\s*\n?\s*\?/);
  });

  it('still marks a simulated build unmissably', () => {
    // §57 is untouched by this: a preview build must go on saying so, and that
    // branch is still decided by the flag, which is the one question the flag
    // does answer.
    expect(SETTINGS).toMatch(/areAutomationGapsEnabled\(\)/);
    expect(SETTINGS).toMatch(/Automations in this build are simulated/);
  });
});
