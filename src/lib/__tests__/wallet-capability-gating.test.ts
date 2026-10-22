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
  });

  it('does not decide any money action from the gap preview flag alone', () => {
    // `gapsEnabled` may still open the simulated flow for a preview build, but it
    // must never be the only thing consulted, or a release build denies a served
    // capability again.
    for (const gate of ['canDeposit', 'payoutsEnabled']) {
      expect(WALLET).toMatch(new RegExp(`${gate} \\|\\| gapsEnabled`));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A member can always reach their own points — 22 Oct 2026 (step 2, S2-6).
//
// The Rewards action was gated on the balance's `canConvert`, which is false
// below the minimum as well as when conversion is off, and explained either as
// "this deployment has not published a rate". `/wallet/rewards` is a read of
// the member's own balance and history and works whatever conversion does; it
// says for itself whether, and why not, conversion is open. So the action is
// not a capability gate at all. This used to require the gate (by regex); it
// now requires that there is none.
// ─────────────────────────────────────────────────────────────────────────────

describe('the wallet’s Rewards action', () => {
  const rewards = WALLET.match(/<QuickAction\s+icon="sparkles-outline"\s+label="Rewards"[\s\S]*?\/>/)?.[0] ?? '';

  it('is found, so the checks below are about it', () => {
    expect(rewards).not.toBe('');
  });

  it('always opens the points screen', () => {
    expect(rewards).toMatch(/onPress=\{\(\) => router\.push\('\/wallet\/rewards'\)\}/);
  });

  it('is never disabled and never explains itself away', () => {
    expect(rewards).not.toMatch(/disabled=/);
    expect(rewards).not.toMatch(/explainUnavailable/);
    expect(WALLET).not.toMatch(/has not published a rate/);
  });

  it('shows the member their points rather than reading a conversion flag', () => {
    expect(rewards).toMatch(/detail=/);
    expect(WALLET).not.toMatch(/rewardBalance\.data\?\.canConvert/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A refusal is an object, and its truthiness is not the question.
//
// `checkAccess` answers `{ allowed, ... }` — always an object, never null. A
// screen that branches on the value itself renders `AccessGate` every time, and
// `AccessGate` draws nothing when access is allowed. The result is a header
// above an empty page: no error, no crash, no failing test, and `tsc` is happy
// because the object is a valid truthy expression.
//
// Written after `wallet/payout-accounts.tsx` shipped exactly that and was found
// by opening it on a device. Every other call site in the application already
// gates on `.allowed`; this keeps it that way.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

describe('every screen gates on the refusal, not on its existence', () => {
  const readdirSync: (path: string, options: { withFileTypes: true }) => {
    name: string;
    isDirectory(): boolean;
  }[] = require('fs').readdirSync;
  const joinPath: (...parts: string[]) => string = require('path').join;

  function screens(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? screens(joinPath(directory, entry.name))
        : entry.name.endsWith('.tsx')
          ? [joinPath(directory, entry.name)]
          : []
    );
  }

  it('reads `.allowed` on every refusal it renders a gate for', () => {
    // **Deliberately not a search for the wrong shape.** The first cut of this
    // matched `refusal ?` and `if (refusal)` and produced eighteen false
    // positives on screens that were correct — there are too many ways to
    // write the same branch. What every correct screen does have is the field:
    // it asks `.allowed` somewhere. The broken one never mentioned it, because
    // it was branching on the object.
    const appRoot = joinPath(__dirname, '..', '..', 'app');

    const offenders = screens(appRoot).flatMap((path) => {
      const source = fs
        .readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');

      // The name each file gives its refusal, taken from the JSX, so a screen
      // using two is checked on both.
      const names = [...source.matchAll(/<AccessGate\s+refusal=\{(\w+)\}/g)]
        .map((match) => match[1]);

      return names
        .filter((name) => !source.includes(`${name}.allowed`))
        .map((name) => `${path} (${name})`);
    });

    expect(offenders).toEqual([]);
  });
});
