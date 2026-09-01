// ─────────────────────────────────────────────────────────────────────────────
// A capability the platform serves must not be denied by a compile-time flag.
//
// UAT-134. The wallet's four quick actions were gated on `areGapFeaturesEnabled()`,
// which is false in every release build. So a member on the real deployment was
// told:
//
//     "Adding money to your Diaspora wallet is not something the platform can do yet"
//     "Diaspora cannot send money to a bank account yet"
//     "Contribution points and reward conversion are not part of Diaspora yet"
//
// All three were false as statements about the platform. The backend serves
// `POST/GET /financial/wallets/me/deposits`, the whole withdrawal path including
// `payout-destinations` and `withdrawals/limits`, and `/financial/rewards/*` —
// verified 200 against the live deployment. The withdrawal screen was already
// wired to the real client; only the button in front of it was lying.
//
// What was true is narrower and more useful: this deployment has `gateways: []`
// and `payoutsEnabled: false`, and reward conversion answers `isEnabled: false`
// with a reason. The platform reports its own capabilities accurately, and the
// client was not reading them.
//
// So the rule is: gate on what the deployment says it can do, never on a build
// flag. The button then lights up when a provider is connected rather than when
// somebody remembers to ship a binary — which is the same lesson the automation
// remediation learned when a static table said 59 capabilities were missing that
// the deployment was already running.
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

const WALLET = read('src', 'app', 'wallet', 'index.tsx');

describe('the wallet gates on what the deployment can do', () => {
  it('reads the live capability report for each money action', () => {
    expect(WALLET).toMatch(/const payoutsEnabled = capabilities\.data\?\.payoutsEnabled/);
    expect(WALLET).toMatch(/const canDeposit = \(capabilities\.data\?\.supportedMethods/);
    expect(WALLET).toMatch(/const canConvertRewards = rewardBalance\.data\?\.canConvert/);
  });

  it('no longer claims the platform cannot do these things', () => {
    // Each of these sentences was false on a deployment that serves the routes.
    expect(WALLET).not.toMatch(/not something the platform can do yet/);
    expect(WALLET).not.toMatch(/cannot send money to a bank account yet/);
    expect(WALLET).not.toMatch(/not part of Diaspora yet/);
  });

  it('says which of the two reasons is actually true', () => {
    // "No provider is connected" is a different fact from "this does not exist",
    // and it is the one an operator can act on.
    expect(WALLET).toMatch(/No payment method is connected/);
    expect(WALLET).toMatch(/No payout rail is connected/);
    expect(WALLET).toMatch(/switched off on this deployment/);
  });

  it('does not decide any money action from the gap preview flag alone', () => {
    // `gapsEnabled` may still open the simulated flow for a preview build, but it
    // must never be the only thing consulted, or a release build denies a served
    // capability again.
    for (const gate of ['canDeposit', 'payoutsEnabled', 'canConvertRewards']) {
      expect(WALLET).toMatch(new RegExp(`${gate} \\|\\| gapsEnabled`));
    }
  });
});
