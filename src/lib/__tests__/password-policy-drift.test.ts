// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the client's password rules against the server's
//
// ── The defect this exists for ──────────────────────────────────────────────
//
// `MIN_PASSWORD_LENGTH` read `8` while `PasswordPolicyOptions.MinimumLength`
// read `12`, under a comment in the client file asserting the two were "kept in
// step". They were not, and nothing noticed: both repositories compiled, every
// test passed, and the disagreement only surfaced when a member on the recovery
// screen — already locked out — was shown "At least 8 characters", typed eight,
// and was refused by the server for being under twelve.
//
// The composition rules were worse. The server requires an upper case letter, a
// lower case letter and a digit; the client mentioned none of them, so the
// member met the length rule, was refused, met the next, and was refused again.
//
// A comment claiming two numbers agree is not a check. This is.
//
// ── Why the client mirrors the policy at all ────────────────────────────────
//
// Because the server will not tell it. `PasswordPolicyDescriptor` exists on the
// backend for exactly this purpose — its own summary says "so clients can show
// requirements up front instead of guessing from rejection messages" — and is
// exposed on no endpoint. Until it is served, the client holds a copy, and a
// copy is only safe while something fails when it drifts.
//
// ── Reading the backend rather than a fixture ───────────────────────────────
//
// Same mechanism as the three sibling drift checks: the backend checkout is
// found via `DIASPORA_BACKEND_PATH`, or beside this repository, and the suite
// skips when it is absent so CI on this repository alone stays green. A fixture
// copied from the backend would drift in exactly the way this file exists to
// catch.
// ─────────────────────────────────────────────────────────────────────────────

import { MIN_PASSWORD_LENGTH, PASSWORD_RULES } from '../password-policy';

// Required locally with narrow signatures, exactly as the sibling drift checks
// do. Adding `"node"` to `types` in `tsconfig.json` would compile these imports
// and break twenty other assertions: `@types/node` declares its own `globalThis`
// and shadows the ambient React Native declaration that gives the boundary
// suites `__DEV__`.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

function resolveBackendSourceRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(__dirname, '..', '..', '..', '..', 'diaspora-backend');

  const sourceRoot = join(candidate, 'src');
  return existsSync(sourceRoot) ? sourceRoot : null;
}

const BACKEND_SOURCE_ROOT = resolveBackendSourceRoot();

const OPTIONS_FILE = BACKEND_SOURCE_ROOT
  ? join(
      BACKEND_SOURCE_ROOT,
      'Diaspora.Infrastructure',
      'Identity',
      'Options',
      'PasswordPolicyOptions.cs'
    )
  : null;

const describeWhenBackendPresent =
  OPTIONS_FILE && existsSync(OPTIONS_FILE) ? describe : describe.skip;

describeWhenBackendPresent('the client mirrors the server’s password policy', () => {
  // Read in `beforeAll`, never in the describe body. Jest runs a skipped
  // describe's body to collect its tests, so a read here ran with no backend
  // checkout — `readFileSync(null)` — and failed the whole file in CI instead
  // of skipping it.
  let source = '';
  beforeAll(() => {
    source = readFileSync(OPTIONS_FILE as string, 'utf8');
  });

  /** `public int MinimumLength { get; set; } = 12;` */
  function intDefault(property: string): number | null {
    const match = new RegExp(
      `public\\s+int\\s+${property}\\s*\\{[^}]*\\}\\s*=\\s*(\\d+)\\s*;`
    ).exec(source);
    return match ? Number(match[1]) : null;
  }

  /**
   * `public bool RequireUppercase { get; set; } = true;` — and the bare
   * `public bool RequireNonAlphanumeric { get; set; }`, which has no initialiser
   * and so no trailing semicolon. Requiring one returned null for the single
   * property whose default is false, which the guard above caught.
   */
  function boolDefault(property: string): boolean | null {
    const match = new RegExp(
      `public\\s+bool\\s+${property}\\s*\\{[^}]*\\}(?:\\s*=\\s*(true|false)\\s*;)?`
    ).exec(source);
    if (!match) return null;
    return match[1] === 'true';
  }

  it('parses the options file at all', () => {
    // Guards the guard. Every assertion below is of the form "the parsed value
    // equals the client's", and a parser returning null for everything would
    // make them all vacuous — which is how a drift check goes quietly blind
    // after an unrelated rename on the other side.
    expect(intDefault('MinimumLength')).not.toBeNull();
    expect(boolDefault('RequireUppercase')).not.toBeNull();
    expect(boolDefault('RequireLowercase')).not.toBeNull();
    expect(boolDefault('RequireDigit')).not.toBeNull();
    expect(boolDefault('RequireNonAlphanumeric')).not.toBeNull();
  });

  it('uses the server’s minimum length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(intDefault('MinimumLength'));
  });

  it('shows a rule for every composition requirement the server enforces', () => {
    const shown = new Set(PASSWORD_RULES.map((rule) => rule.key));

    const required: [string, boolean | null][] = [
      ['uppercase', boolDefault('RequireUppercase')],
      ['lowercase', boolDefault('RequireLowercase')],
      ['digit', boolDefault('RequireDigit')],
      ['symbol', boolDefault('RequireNonAlphanumeric')],
    ];

    // Enforced but not shown: the member meets every rule on screen and is
    // refused anyway, with no way to know what for.
    const missing = required
      .filter(([, isRequired]) => isRequired === true)
      .map(([key]) => key)
      .filter((key) => !shown.has(key));

    // Shown but not enforced: the member is turned away from a password the
    // platform would have accepted.
    const invented = required
      .filter(([, isRequired]) => isRequired === false)
      .map(([key]) => key)
      .filter((key) => shown.has(key));

    expect({ missing, invented }).toEqual({ missing: [], invented: [] });
  });

  it('agrees with the server on what counts as each character class', () => {
    // The server uses `char.IsUpper`, `char.IsLower` and `char.IsDigit`, which
    // are the Unicode categories Lu, Ll and Nd. An ASCII-only client rule would
    // refuse a password the server accepts — and would do it to exactly the
    // members this platform is for.
    const rule = (key: string) => PASSWORD_RULES.find((entry) => entry.key === key);

    expect(rule('uppercase')?.isMet('Ω')).toBe(true);
    expect(rule('lowercase')?.isMet('ω')).toBe(true);
    expect(rule('digit')?.isMet('٧')).toBe(true);

    expect(rule('uppercase')?.isMet('ω')).toBe(false);
    expect(rule('lowercase')?.isMet('Ω')).toBe(false);
    expect(rule('digit')?.isMet('seven')).toBe(false);
  });
});
