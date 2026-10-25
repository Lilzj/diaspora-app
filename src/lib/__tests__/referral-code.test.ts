// ─────────────────────────────────────────────────────────────────────────────
// A referral code at sign-up keeps to the server's shape — 25 Oct 2026 (CS-C3)
//
// The server refuses anything but letters and digits, up to 32, with a 400 at
// the end of a five-screen flow. The field keeps to that shape as it is typed.
// ─────────────────────────────────────────────────────────────────────────────

import { normaliseReferralCode, REFERRAL_CODE_MAX_LENGTH } from '../referral-code';

describe('normaliseReferralCode', () => {
  it('upper-cases a code and keeps only letters and digits', () => {
    expect(normaliseReferralCode(' ab12-cd 34 ')).toBe('AB12CD34');
  });

  it('cuts a code to the server limit', () => {
    expect(normaliseReferralCode('A'.repeat(40))).toHaveLength(REFERRAL_CODE_MAX_LENGTH);
  });

  it.each([undefined, null, '', '---'])('reads %p as no code', (input) => {
    expect(normaliseReferralCode(input as string | null | undefined)).toBe('');
  });
});
