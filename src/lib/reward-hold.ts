import { APPEAL_TYPE_VALUES } from '@/lib/trust-api';
import type { AppealType } from '@/types/trust';

/**
 * A held member can ask for a review (RWD-14, CS-4a, 26 Oct 2026).
 *
 * A hold told the member to contact support, and there was nothing to contact.
 * The server takes an appeal of a points hold, filed against the member
 * themselves, and an approved appeal lifts the hold. The points screens offer
 * it; the appeals screen files it.
 */

/** The code the server sends for a held points account, and for nothing else. */
export const REWARD_HOLD_CODE = 'financial.rewards.not_eligible';

export function isRewardHold(code: string | null | undefined): boolean {
  return code === REWARD_HOLD_CODE;
}

/** Where "Ask for a review" goes: the appeals screen, appealing the member's own hold. */
export function rewardHoldReviewRoute(memberId: string) {
  return {
    pathname: '/profile/appeals' as const,
    params: { type: 'RewardHold' as const, targetId: memberId },
  };
}

/**
 * What the appeals screen was opened with, or null when it was opened plainly.
 * A type the server does not take is ignored rather than filed.
 */
export function appealPrefill(params: {
  type?: string | string[];
  targetId?: string | string[];
}): { type: AppealType; targetId: string } | null {
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const targetId = Array.isArray(params.targetId) ? params.targetId[0] : params.targetId;

  if (!type || !(APPEAL_TYPE_VALUES as readonly string[]).includes(type)) return null;

  return { type: type as AppealType, targetId: targetId ?? '' };
}
