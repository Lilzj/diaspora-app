// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — A referral code at sign-up (rewards step 3c, CS-C3)
//
// A member who joins through an invitation brings the inviter's code, from a
// `?ref=` link or typed in. The server checks only its shape — letters and
// digits, up to 32 — and refuses anything else with a 400, so the field keeps
// to that shape as it is typed rather than letting the member reach the end of
// the flow to be told. Whether the code belongs to anybody is the referral
// programme's question, and it answers in silence either way.
// ─────────────────────────────────────────────────────────────────────────────

/** The server's limit. Longer than any code the programme issues. */
export const REFERRAL_CODE_MAX_LENGTH = 32;

/** Letters and digits only, upper-cased and cut to the limit. Empty when there is nothing left. */
export function normaliseReferralCode(input: string | null | undefined): string {
  if (typeof input !== 'string') return '';

  return input
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, REFERRAL_CODE_MAX_LENGTH);
}
