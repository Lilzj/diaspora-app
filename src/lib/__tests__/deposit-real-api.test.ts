// ─────────────────────────────────────────────────────────────────────────────
// Adding money runs against the real platform.
//
// The screen used to call `/financial-gap/v0` and was unreachable in a release
// build, because "the certified B15 platform has no member-facing deposit
// route". That stopped being true: `POST /financial/wallets/me/deposits` is
// served and credits the wallet when the payment captures.
//
// What was genuinely missing was never the route — it was a charge adapter.
// `IPaymentGateway` had one implementation, `SimulatedPaymentGateway`, excluded
// outside Development, so a production deployment could open an intent and had
// nothing to charge it with. `StripePaymentGateway` is that adapter, and it
// answers with a hosted Checkout URL on `nextAction` because the client has no
// payment SDK to confirm a client secret with.
//
// The three properties pinned here are the ones whose absence would each be a
// separate way of lying to a member about their own money.
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

const SCREEN = read('src', 'app', 'wallet', 'add-money.tsx');
const API = read('src', 'lib', 'financial-api.ts');
const HOOKS = read('src', 'hooks', 'financial.ts');

describe('the deposit flow calls the real platform', () => {
  it('the client hits the served routes', () => {
    expect(API).toMatch(/'post', '\/wallets\/me\/deposits'/);
    expect(API).toMatch(/'\/wallets\/me\/deposits'/);
    expect(API).toMatch(/'\/wallets\/me\/deposits\/limits'/);
  });

  it('the screen no longer imports the simulated client', () => {
    // The whole point. A screen that still reached for financial-gaps would be
    // unreachable in a release build however well the backend worked.
    expect(SCREEN).not.toMatch(/from '@\/hooks\/financial-gaps'/);
    expect(SCREEN).not.toMatch(/useGapFeaturesEnabled/);
    expect(SCREEN).not.toMatch(/GapUnavailableView/);
    expect(SCREEN).toMatch(/from '@\/hooks\/financial'/);
  });
});

describe('it never shows money that has not arrived', () => {
  it('reports what was captured, not what was authorised', () => {
    // With manual capture the money is held and the platform has still to take
    // it. Showing the authorised amount as the wallet figure would have a member
    // close the app believing their balance had moved.
    expect(SCREEN).toMatch(/label="Added to your wallet" value=\{intent\.captured\}/);
  });

  it('treats an authorised intent as still in flight', () => {
    expect(SCREEN).toMatch(/case 'Authorized':/);
    expect(SCREEN).toMatch(/needsReconciliation: true/);
  });

  it('does not invalidate the balance when the deposit is merely started', () => {
    // The wallet moves on capture. An optimistic invalidation here would refetch
    // a balance that has not changed and teach members to distrust the number.
    const mutation = HOOKS.slice(
      HOOKS.indexOf('export function useCreateDeposit'),
      HOOKS.indexOf('export function useDepositReconciliation')
    );

    expect(mutation).toMatch(/invalidateQueries\(\{ queryKey: financialKeys\.deposits\(\) \}\)/);
    expect(mutation).not.toMatch(/invalidateAfterMoneyMoved/);
  });

  it('does not count Authorized as settled', () => {
    const settled = HOOKS.slice(
      HOOKS.indexOf('export function isPaymentSettled'),
      HOOKS.indexOf('export function isPaymentSettled') + 400
    );

    expect(settled).toMatch(/'Captured'/);
    expect(settled).not.toMatch(/'Authorized'/);
  });
});

describe('it gates on the deployment, never on a build flag', () => {
  it('reads both facts that decide whether a top-up can happen', () => {
    // A provider to charge with, AND the deposit feature switched on.
    // Financial:EnableDeposits is a plain bool with no initializer, so a screen
    // that read only the provider list would offer a button that always 503s.
    expect(SCREEN).toMatch(/const depositsEnabled = limits\?\.isEnabled \?\? false/);
    expect(SCREEN).toMatch(/const canDeposit = supportedMethods\.length > 0 && depositsEnabled/);
  });

  it('distinguishes the two reasons in words', () => {
    expect(SCREEN).toMatch(/No way to take a payment yet/);
    expect(SCREEN).toMatch(/Adding money is switched off/);
  });

  it('takes its payment methods from the live capability report', () => {
    expect(SCREEN).toMatch(/capabilities\.data\?\.supportedMethods/);
  });

  it('invents no limit of its own', () => {
    // Every bound is optional on the wire, and each is compared only where the
    // server actually sent it — asserting a ceiling nobody configured would
    // refuse an amount the platform would have accepted.
    expect(SCREEN).toMatch(/limits\.minimum && isLessThan/);
    expect(SCREEN).toMatch(/limits\.maximum && isGreaterThan/);
  });
});

describe('the payment challenge is opened safely', () => {
  it('opens only plain HTTPS', () => {
    // A payment flow is the highest-value phishing surface the app has: a member
    // has already decided to pay and is expecting to be sent somewhere.
    expect(SCREEN).toMatch(/function isSafeChallengeUrl/);
    expect(SCREEN).toMatch(/\^https:\\\/\\\//);
    expect(SCREEN).toMatch(/isSafeChallengeUrl\(intent\.nextAction\)/);
  });

  it('never opens a URL it has not checked', () => {
    const opens = SCREEN.match(/Linking\.openURL\([^)]*\)/g) ?? [];
    expect(opens.length).toBeGreaterThan(0);

    for (const call of opens) {
      expect(call).toMatch(/challengeUrl|intent\.nextAction/);
    }
  });
});
