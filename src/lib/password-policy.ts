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
// ── This is the *client's* floor, not the policy ────────────────────────────
//
// The server owns the real policy: length, history, and whether the password
// resembles the member's own name, phone number or email address. It refuses
// with a message naming what is wrong, and every screen here shows that message
// rather than trying to predict it. What this constant does is stop the
// obviously-too-short submission before it costs a round trip.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shortest password any screen will submit.
 *
 * Kept in step with the server's `PasswordPolicyOptions.MinimumLength`. If the
 * two ever disagree the server wins, and the member sees its refusal.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Whether a password is long enough to be worth sending.
 *
 * Deliberately the only check. Composition rules — an upper case, a digit, a
 * symbol — are the server's, and duplicating them here would mean maintaining
 * two policies and showing the member whichever one this build happened to
 * carry.
 */
export function isLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
