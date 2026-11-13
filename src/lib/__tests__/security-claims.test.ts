// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — no screen claims a security control the server lacks
//
// ── The defect this exists for (FSEC-002) ───────────────────────────────────
//
// `profile/account-security.tsx` told the member:
//
//     Phone Verification (SMS OTP)
//     Link a phone number for SMS multi-factor login checks        ✓ Configured
//
// Sign-in has no second factor. `LoginCommandHandler` verifies the password,
// applies lockout bookkeeping, calls `EnsureCanAuthenticate` and issues a token
// pair — no challenge, no partially-authenticated response, no OTP step. A
// member reading that screen concluded two factors protected an account that
// holds a balance and processes payouts.
//
// "✓ Configured" was a second falsehood in the same row: a hardcoded string.
// `AccessState.PhoneVerificationPending` **allows authentication**, so the app
// asserted the phone was configured to precisely the members whose phone was
// not, while linking them to /verification/phone to go and configure it.
//
// ── Why this is not a snapshot test ─────────────────────────────────────────
//
// The audit asked for "a test that snapshots this screen's copy". A snapshot
// catches *change*, which is the wrong thing: the copy was wrong the day it was
// written, and a snapshot taken that day would have frozen the lie and failed
// on the correction. What is actually checkable is the *claim class* — copy
// that ties a multi-factor control to signing in — and that rule holds for
// every screen rather than for one.
//
// ── The condition under which this rule should be lifted ────────────────────
//
// It encodes a fact about the server, not a style preference: sign-in is
// single-factor. When optional TOTP or SMS at sign-in is built (FSEC-002
// remediation 2 / BSEC-007 wave 1), this rule stops being true and should be
// replaced — not suppressed — by one asserting that the row's state is read
// from the server. Until then, a screen saying otherwise is a security
// misrepresentation, and this is what notices.
// ─────────────────────────────────────────────────────────────────────────────

// Required locally with narrow signatures, as the sibling suites do: adding
// `"node"` to `types` in `tsconfig.json` makes `@types/node` shadow the ambient
// React Native `globalThis` and breaks twenty boundary assertions.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const readdirSync: (path: string, options: object) => Array<{
  name: string;
  isDirectory: () => boolean;
}> = require('fs').readdirSync;
const join: (...parts: string[]) => string = require('path').join;
const relative: (from: string, to: string) => string = require('path').relative;

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SCREENS = join(REPO_ROOT, 'src', 'app');
const COMPONENTS = join(REPO_ROOT, 'src', 'components');

/** A control that is only meaningful as a *second* factor. */
const MULTI_FACTOR = /multi-?factor|two-?factor|\b2FA\b|\bMFA\b/gi;

/**
 * Signing in, as copy writes it. Word-bounded and space-or-hyphen separated so
 * `handleLogin` and `signIn()` do not match — `\blogin\b` cannot match inside
 * `handleLogin`, because the character before `L` is a word character.
 */
const SIGNING_IN = /\blogin\b|\blog in\b|\bsign-?in\b|\bsign in\b|\bsigning in\b|\bsigns in\b/i;

/**
 * How close the two have to be to read as one claim. The defect string is 52
 * characters end to end; 120 covers a claim split across a wrapped JSX line
 * without reaching into unrelated copy further down the file.
 */
const WINDOW = 120;

/**
 * The file with its comments removed, whitespace collapsed.
 *
 * Comments are not shown to the member, and the first version of this suite
 * failed on the comment in `account-security.tsx` that quotes the removed copy
 * in order to explain it. A rule that forbids *describing* a defect would make
 * every file that documents one unfixable — so the scan reads what ships.
 *
 * Block comments go first, which also removes the `//` inside any of them.
 * A line comment then runs to the newline, so this must happen before the
 * whitespace collapse. Truncating a `https://…` inside a string literal is
 * acceptable here: no claim this rule looks for survives in a URL.
 */
function visibleCopy(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');
}

function tsxFilesUnder(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...tsxFilesUnder(path));
      continue;
    }

    if (entry.name.endsWith('.tsx')) found.push(path);
  }

  return found;
}

describe('no screen claims a security control the server does not enforce', () => {
  const files = [...tsxFilesUnder(SCREENS), ...tsxFilesUnder(COMPONENTS)];

  it('found screens to check', () => {
    // A scan that matched nothing would pass this whole suite for the wrong
    // reason — the failure mode the backend's own empty-table rule exists for.
    expect(files.length).toBeGreaterThan(50);
  });

  it('nothing ties a multi-factor control to signing in', () => {
    const offences: string[] = [];

    for (const file of files) {
      const source = visibleCopy(file);

      MULTI_FACTOR.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = MULTI_FACTOR.exec(source)) !== null) {
        const from = Math.max(0, match.index - WINDOW);
        const window = source.slice(from, match.index + match[0].length + WINDOW);

        if (SIGNING_IN.test(window)) {
          offences.push(`${relative(REPO_ROOT, file)}: …${window.trim()}…`);
        }
      }
    }

    expect(offences).toEqual([]);
  });
});

describe('the account security screen states phone verification as fact', () => {
  const SCREEN = join(SCREENS, 'profile', 'account-security.tsx');
  const source = visibleCopy(SCREEN);

  it('reads the verified state from the member rather than asserting it', () => {
    expect(source).toContain('state.user?.isPhoneVerified');
  });

  it('shows "Configured" only under that state', () => {
    const badge = source.indexOf('✓ Configured');
    expect(badge).toBeGreaterThan(-1);

    // The hardcoded literal is the defect. It is only honest inside the branch
    // that checked, so `isPhoneVerified` must be the nearest thing before it.
    const preceding = source.slice(Math.max(0, badge - 200), badge);
    expect(preceding).toContain('isPhoneVerified');
  });

  it('describes what the code actually does', () => {
    // Step-up (BSEC-007) gates CreateWithdrawalCommand and the three payout
    // destination commands. That is the claim the copy may make, and
    // step-up-claims-drift.test.ts is what holds the server to it.
    expect(source).toContain('withdrawals');
  });
});
