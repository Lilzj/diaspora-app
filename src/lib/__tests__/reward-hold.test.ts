// ─────────────────────────────────────────────────────────────────────────────
// A held member can ask for a review — 26 Oct 2026 (RWD-14, CS-4a)
//
// A hold told the member to contact support, and there was nothing to contact.
// The server now takes an appeal of a points hold, filed against the member
// themselves, and an approved one lifts the hold. These are the three small
// rules the screens share: what a hold looks like, where asking goes, and how
// the appeals screen reads what it was opened with.
// ─────────────────────────────────────────────────────────────────────────────

import { appealPrefill, isRewardHold, rewardHoldReviewRoute } from '../reward-hold';

describe('isRewardHold', () => {
  it('is the code the server sends only for a held account', () => {
    expect(isRewardHold('financial.rewards.not_eligible')).toBe(true);
  });

  it.each([null, undefined, '', 'financial.rewards.below_minimum', 'financial.account.not_eligible'])(
    'is not %p',
    (code) => {
      expect(isRewardHold(code as string | null | undefined)).toBe(false);
    }
  );
});

describe('rewardHoldReviewRoute', () => {
  it('opens the appeals screen to appeal the member’s own hold', () => {
    expect(rewardHoldReviewRoute('member-1')).toEqual({
      pathname: '/profile/appeals',
      params: { type: 'RewardHold', targetId: 'member-1' },
    });
  });
});

describe('appealPrefill', () => {
  it('reads the type and target the screen was opened with', () => {
    expect(appealPrefill({ type: 'RewardHold', targetId: 'member-1' })).toEqual({
      type: 'RewardHold',
      targetId: 'member-1',
    });
  });

  it('ignores a type the server does not take', () => {
    expect(appealPrefill({ type: 'Refund', targetId: 'x' })).toBeNull();
  });

  it('is nothing when the screen was opened plainly', () => {
    expect(appealPrefill({})).toBeNull();
  });
});
