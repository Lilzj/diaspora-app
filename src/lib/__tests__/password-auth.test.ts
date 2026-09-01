// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — sign-in by email and password, and the password lifecycle
//
// ── What this replaced, and why ─────────────────────────────────────────────
//
// Sign-in was `POST /auth/otp/start` followed by `POST /auth/otp/sign-in`: two
// calls and **an SMS on every single sign-in**. A password costs nothing to
// deliver, so SMS is now spent only on phone verification — the one thing a
// message actually proves, and a once-per-account event rather than a
// once-per-session one.
//
// It also removed a single point of failure. While the deployment was pointed
// at the Africa's Talking sandbox, the sandbox accepted every code and
// delivered none, so **nobody could sign in at all** (UAT-101). Sign-in no
// longer depends on a message arriving.
//
// ── The second half: the password had no lifecycle ──────────────────────────
//
// `POST /auth/change-password`, `/auth/forgot-password` and
// `/auth/reset-password` were all deployed and answering, and **nothing in the
// application called any of them**. No change-password screen, no recovery
// screen, no "Forgot" link anywhere in `src/app`.
//
// That was survivable while the password was never needed. It stopped being
// survivable when `settings/delete-account` began requiring it: the password was
// set once at registration, never used to sign in, never changeable and never
// recoverable — so a member who forgot it, which is the *expected* outcome
// rather than the edge case, could not delete their own account (UAT-127).
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/** A file's code with its comments removed. See `registration-flow.test.ts`. */
function read(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .filter((line: string) => !/^\s*(\/\/|\*)/.test(line))
    .join(String.fromCharCode(10));
}

const AUTH_API = read('src', 'lib', 'auth-api.ts');
const AUTH_TYPES = read('src', 'types', 'auth.ts');
const LOGIN = read('src', 'app', '(auth)', 'login.tsx');
const FORGOT = read('src', 'app', '(auth)', 'forgot-password.tsx');
const RESET = read('src', 'app', '(auth)', 'reset-password.tsx');
const CHANGE = read('src', 'app', 'profile', 'change-password.tsx');
const SECURITY = read('src', 'app', 'profile', 'account-security.tsx');
const REGISTER_SUBMIT = read('src', 'app', '(auth)', 'enable-location.tsx');

describe('the client speaks the email contract', () => {
  it('registration sends an email address', () => {
    // It was collected by `register.tsx` and required to submit, and then
    // dropped: this call never sent it, so every account was created with a
    // null email. Harmless while sign-in was a code; fatal once the address
    // became the credential.
    expect(AUTH_TYPES).toMatch(/email: string;/);
    expect(REGISTER_SUBMIT).toMatch(/email:/);
  });

  it('the login body carries an email, not a phone number', () => {
    // Scoped to the interface body. A `[\s\S]*?` from the interface name runs on
    // past the closing brace into the next declaration, so a `phoneNumber` on an
    // unrelated type would fail this for the wrong reason.
    const body = AUTH_TYPES.split('interface PasswordLoginRequestBody')[1]?.split('}')[0] ?? '';

    expect(body).toMatch(/email: string;/);
    expect(body).not.toMatch(/phoneNumber/);
  });
});

describe('the sign-in screen', () => {
  it('signs in with a password rather than requesting a code', () => {
    expect(LOGIN).toMatch(/loginWithPassword/);
    expect(LOGIN).not.toMatch(/sendOtp|startOtpSignIn/);
  });

  it('lets the member see what they typed', () => {
    // A password field with no reveal is the largest single cause of "wrong
    // password" on a phone keyboard.
    expect(LOGIN).toMatch(/secureTextEntry=\{!isPasswordVisible\}/);
    expect(LOGIN).toMatch(/eye-off-outline/);
  });

  it('does not guess which half of the credentials was wrong', () => {
    // The server answers "no such address" and "wrong password" identically, in
    // the same time, so the endpoint cannot be used to discover who has
    // registered. A screen that guessed would undo that.
    expect(LOGIN).not.toMatch(/No account with that email|That password is wrong/);
    expect(LOGIN).toMatch(/do not match an account/);
  });

  it('offers recovery', () => {
    expect(LOGIN).toMatch(/forgot-password/);
  });
});

describe('the password lifecycle exists at all', () => {
  it.each([
    ['forgotPassword', /export async function forgotPassword/],
    ['resetPassword', /export async function resetPassword/],
    ['changePassword', /export async function changePassword/],
  ])('auth-api exports %s', (_name, pattern) => {
    expect(AUTH_API).toMatch(pattern);
  });

  it.each([
    ['forgot-password', /\$\{ROOT\}\/forgot-password/],
    ['reset-password', /\$\{ROOT\}\/reset-password/],
    ['change-password', /\$\{ROOT\}\/change-password/],
  ])('and calls the deployed %s route', (_name, pattern) => {
    expect(AUTH_API).toMatch(pattern);
  });

  it('change-password is authenticated and the other two are not', () => {
    // Recovery is for somebody who cannot sign in, so it must not require a
    // bearer. Changing a password is for somebody who is signed in, so it must.
    expect(AUTH_API).toMatch(/forgot-password[\s\S]{0,400}?anonymous: true/);
    expect(AUTH_API).toMatch(/change-password[\s\S]{0,400}?anonymous: false/);
  });

  it('every screen is reachable', () => {
    expect(LOGIN).toMatch(/\/\(auth\)\/forgot-password/);
    expect(FORGOT).toMatch(/\/\(auth\)\/reset-password/);
    expect(SECURITY).toMatch(/\/profile\/change-password/);
  });
});

describe('recovery tells the truth about where the code goes', () => {
  it('the screen names no channel of its own', () => {
    // Where the code goes is the deployment's decision: `EmailOtpDeliveryService`
    // carries recovery codes when `Email:Resend:ApiKey` is set, and the SMS
    // transport carries them when it is not. A screen that hard-codes either one
    // is wrong on half the deployments — and it was, until the email adapter
    // landed. The server's sentence is the single place that names the channel.
    expect(FORGOT).not.toMatch(/Check your phone/);
    expect(FORGOT).not.toMatch(/we will text/i);
    expect(FORGOT).not.toMatch(/check your inbox/i);

    // The screen that redeems the code is the same rule. It said "the six-digit
    // code we texted you", which is wrong on any deployment with an email
    // provider configured -- and that is now the default one.
    expect(RESET).not.toMatch(/texted you/i);
    expect(RESET).not.toMatch(/by SMS/i);
  });

  it('it shows the server sentence rather than writing its own', () => {
    // So the two cannot disagree about where the code went.
    expect(FORGOT).toMatch(/setAcknowledgement\(result\.message/);
  });

  it('it does not confirm whether the account exists', () => {
    expect(FORGOT).not.toMatch(/We found your account|That account exists/);
  });
});

describe('reset says what it is about to do', () => {
  it('warns that every session ends', () => {
    // `reset-password` revokes all sessions. A member should know that before
    // they press the button, not after their other device signs itself out.
    expect(RESET).toMatch(/signs you out everywhere/i);
  });

  it('returns to sign-in rather than into the app', () => {
    // There is no session left to continue with.
    expect(RESET).toMatch(/router\.replace\(\{ pathname: '\/\(auth\)\/login'/);
  });

  it('refuses a mismatch before submitting', () => {
    expect(RESET).toMatch(/passwordsMatch/);
    expect(RESET).toMatch(/do not match/);
  });
});

describe('change-password protects the account from the handset', () => {
  it('requires the current password', () => {
    // Without it, anyone holding an unlocked phone with a live session could
    // change the password and lock the owner out of their own account.
    expect(CHANGE).toMatch(/currentPassword/);
    expect(CHANGE).toMatch(/currentPassword\.length > 0/);
  });

  it('refuses a new password identical to the old one', () => {
    expect(CHANGE).toMatch(/isDifferent/);
  });

  it('does not promise that other devices are unaffected', () => {
    // The server answered "Your password has been changed. 14 other session(s)
    // were signed out." The screen first claimed the opposite. A screen that
    // describes an outcome the platform did not produce is the exact defect
    // class this release was audited for.
    expect(CHANGE).not.toMatch(/other devices are not affected/i);
    expect(CHANGE).toMatch(/Every other device will be signed out/);
  });

  it('reports the server count rather than a generic line', () => {
    expect(CHANGE).toMatch(/result\.message/);
  });

  it('shows the server refusal rather than flattening it', () => {
    // The server distinguishes a wrong current password from a policy refusal
    // and from a previously-used one, and names which in its message.
    expect(CHANGE).toMatch(/isIntegrationError\(cause\)/);
  });
});

describe('one password rule, not four', () => {
  it('every screen reads the shared minimum', () => {
    const policy = read('src', 'lib', 'password-policy.ts');
    expect(policy).toMatch(/export const MIN_PASSWORD_LENGTH/);

    for (const screen of [RESET, CHANGE, read('src', 'app', '(auth)', 'register.tsx')]) {
      expect(screen).toMatch(/MIN_PASSWORD_LENGTH/);
    }
  });

  it('no screen hard-codes its own length', () => {
    // A reset screen that accepted seven characters where registration demands
    // eight would let a member set a password the server then refuses — on the
    // one screen whose job is to unblock them.
    for (const screen of [RESET, CHANGE]) {
      expect(screen).not.toMatch(/length >= 8/);
    }
  });
});

describe('SMS is spent only where it earns its cost', () => {
  it('phone verification still uses it', () => {
    // The point was never to remove SMS. It was to stop paying for it on every
    // sign-in when it only proves something once.
    expect(AUTH_API).toMatch(/verify-phone/);
    expect(AUTH_API).toMatch(/resend-otp/);
  });

  it('but sign-in does not', () => {
    expect(LOGIN).not.toMatch(/otp/i);
  });
});
