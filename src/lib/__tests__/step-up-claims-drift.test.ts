// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the server still enforces what the security screen says
//
// ── Why this suite exists ───────────────────────────────────────────────────
//
// FSEC-002 was a screen asserting a control the server did not have. The fix
// replaced the false claim with a true one:
//
//     Receives the codes that confirm withdrawals and changes to where your
//     money goes
//
// That is true because BSEC-007 landed step-up authentication — an SMS code to
// the registered phone, required before the four commands that move money or
// change its destination. A true claim is only as durable as the control behind
// it, and nothing in this repository would notice the attribute being removed
// over in the other one. The lie would come back without anybody editing this
// screen.
//
// `security-claims.test.ts` is the half that holds the *client* to the copy and
// runs on every pull request. This is the half that holds the *server* to the
// control, and it runs wherever the backend checkout is reachable.
//
// ── Reading the backend rather than a fixture ───────────────────────────────
//
// Same mechanism as the eleven sibling drift checks: the checkout is found via
// `DIASPORA_BACKEND_PATH` or beside this repository, not configured and absent
// skips, configured and absent fails. A fixture copied from the backend would
// drift in exactly the way this file exists to catch.
// ─────────────────────────────────────────────────────────────────────────────

import { backendSourceRoot } from './support/backend-checkout';

// Required locally with narrow signatures, as the sibling drift checks do:
// adding `"node"` to `types` in `tsconfig.json` makes `@types/node` shadow the
// ambient React Native `globalThis` and breaks twenty boundary assertions.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

const BACKEND_SOURCE_ROOT = backendSourceRoot();

const WITHDRAWAL_CONTRACTS = BACKEND_SOURCE_ROOT
  ? join(
      BACKEND_SOURCE_ROOT,
      'Diaspora.Modules.Financial',
      'Application',
      'Withdrawals',
      'WithdrawalContracts.cs'
    )
  : null;

const SCREEN = join(__dirname, '..', '..', 'app', 'profile', 'account-security.tsx');

/**
 * What the copy promises, and the scope each one is gated by.
 *
 * Naming the scope as well as the command is deliberate: moving a command from
 * `Withdrawal` to `PayoutDestination` would keep it gated but change which
 * grant unlocks it, and the member's mental model — "the code I just entered to
 * withdraw" — is per scope.
 */
const GATED: ReadonlyArray<readonly [command: string, scope: string]> = [
  ['CreateWithdrawalCommand', 'Withdrawal'],
  ['RegisterPayoutDestinationCommand', 'PayoutDestination'],
  ['RegisterPayoutIdentityCommand', 'PayoutDestination'],
  ['RefreshPayoutDestinationCommand', 'PayoutDestination'],
];

const describeWhenBackendPresent =
  WITHDRAWAL_CONTRACTS && existsSync(WITHDRAWAL_CONTRACTS) ? describe : describe.skip;

describeWhenBackendPresent('the server enforces the step-up the screen promises', () => {
  // Read in `beforeAll`, never in the describe body: Jest runs a skipped
  // describe's body to collect its tests, so a read here would run with no
  // backend checkout and fail the file instead of skipping it.
  let declarations = new Map<string, string>();

  beforeAll(() => {
    const source = readFileSync(WITHDRAWAL_CONTRACTS as string, 'utf8');

    // Everything from the end of the previous declaration up to and including
    // this one. Attributes sit *above* the record they decorate, so a record's
    // block is the text that precedes it — slicing forward instead gave each
    // record its successor's attributes, and three of these four assertions
    // failed while the fourth passed by coincidence, its neighbour carrying the
    // same scope.
    const pattern = /public\s+sealed\s+record\s+(\w+)/g;
    let previousEnd = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      declarations.set(match[1], source.slice(previousEnd, pattern.lastIndex));
      previousEnd = pattern.lastIndex;
    }
  });

  it('parses the contracts file at all', () => {
    // Without this, every assertion below would pass vacuously if the file
    // moved or the record syntax changed — a suite proving nothing while green.
    expect(declarations.size).toBeGreaterThan(3);

    for (const [command] of GATED) {
      expect(declarations.has(command)).toBe(true);
    }
  });

  it.each(GATED)('%s still requires step-up, scope %s', (command, scope) => {
    const block = declarations.get(command) ?? '';

    expect(block).toContain(`[RequiresStepUp(StepUpScopes.${scope})]`);
  });

  it('the screen is the thing these back', () => {
    // If the copy stops mentioning withdrawals, this suite is guarding a claim
    // nobody makes any more and should be re-read rather than left running.
    const copy = readFileSync(SCREEN, 'utf8');

    expect(copy).toContain('withdrawals');
  });
});
