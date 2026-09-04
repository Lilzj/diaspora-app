// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — what the client will accept as a password
//
// ── Why this is shared ──────────────────────────────────────────────────────
//
// `MIN_PASSWORD_LENGTH` lived as a `const` inside `app/(auth)/register.tsx`.
// That was fine while registration was the only screen that took a password.
// Sign-in with an email address and a password added three more — recovery,
// reset and change — and four copies of a rule about what counts as an
// acceptable password is four chances for them to disagree.
//
// A disagreement here is not cosmetic. A reset screen that accepts seven
// characters when registration demands eight lets a member set a password the
// server then refuses, on a screen whose whole job is to unblock them.
//
// ── That is not a hypothetical. It shipped. ─────────────────────────────────
//
// This constant read `8` while the server's floor was `12`, under a comment
// saying the two were kept in step. They were not. A member resetting their
// password was shown "At least 8 characters", typed eight, and was refused by
// the server for being under twelve — on the recovery screen, which is the
// worst possible place to be given a rule you were not told about.
//
// A comment asserting two numbers agree is not a check. `password-policy-drift`
// is: it reads `PasswordPolicyOptions.cs` out of the backend repository and
// fails when this file and that file disagree.
//
// ── This mirrors the server's rules; the server still owns them ─────────────
//
// An earlier version of this file deliberately held *only* the length, on the
// reasoning that duplicating composition rules means maintaining two policies.
// The reasoning was sound and the outcome was worse: the server requires an
// upper case letter, a lower case letter and a digit, the client mentioned
// none of them, so a member met the length rule and was refused anyway — then
// met that rule and was refused for the next one. Requirements discovered one
// rejection at a time.
//
// So the rules are mirrored here and shown up front, and the drift check is
// what makes the mirror safe. The server remains the authority: it validates
// every password itself, and where it refuses, screens show *its* message
// rather than guessing.
//
// The real fix is one step further and needs a backend change:
// `PasswordPolicyDescriptor` already exists on the server — "so clients can
// show requirements up front instead of guessing from rejection messages" — and
// is exposed on no endpoint. Serve it and this file becomes a fallback for the
// first paint rather than a second copy of the policy.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shortest password any screen will submit.
 *
 * Mirrors the server's `PasswordPolicyOptions.MinimumLength`, and
 * `password-policy-drift` fails if it stops matching.
 */
export const MIN_PASSWORD_LENGTH = 12;

/** One requirement, phrased for a member rather than for a validator. */
export interface PasswordRule {
  key: string;
  /** Shown in the requirement list. Reads as a thing to do, not a complaint. */
  label: string;
  isMet: (password: string) => boolean;
}

/**
 * Every rule a member can see themselves satisfy while typing.
 *
 * The character classes match the server's exactly: it uses `char.IsUpper`,
 * `char.IsLower` and `char.IsDigit`, which are the Unicode categories `Lu`,
 * `Ll` and `Nd` — so `\p{Lu}`, `\p{Ll}` and `\p{Nd}` under the `u` flag agree
 * with it for non-Latin scripts too. `[A-Z]` would not, and would refuse a
 * password the server accepts.
 *
 * The server's other rules are deliberately absent, because a member cannot
 * check them against a list while typing: a common-password blocklist, a
 * refusal of passwords containing their own name or phone number, and the last
 * five hashes. Those surface as the server's own refusal message.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    key: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    isMet: (password) => password.length >= MIN_PASSWORD_LENGTH,
  },
  {
    key: 'lowercase',
    label: 'A lower case letter',
    isMet: (password) => /\p{Ll}/u.test(password),
  },
  {
    key: 'uppercase',
    label: 'An upper case letter',
    isMet: (password) => /\p{Lu}/u.test(password),
  },
  {
    key: 'digit',
    label: 'A number',
    isMet: (password) => /\p{Nd}/u.test(password),
  },
];

/**
 * Whether a password is long enough to be worth sending.
 *
 * Kept because three screens already call it, and because length is still the
 * rule worth naming on its own — it is the one the server's own comment calls
 * "the single most effective defence against offline cracking".
 */
export function isLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/** The rules this password does not yet satisfy, in the order shown. */
export function unmetPasswordRules(password: string): readonly PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.isMet(password));
}

/**
 * Whether every rule the client can check is satisfied.
 *
 * Not "whether the server will accept it" — it may still refuse for a reason
 * no list can show. This only stops a submission that is certain to fail.
 */
export function meetsPasswordRules(password: string): boolean {
  return unmetPasswordRules(password).length === 0;
}
