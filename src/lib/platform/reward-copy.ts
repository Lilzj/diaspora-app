// ─────────────────────────────────────────────────────────────────────────────
// What XP, reward points and wallet credit are — one account of it
//
// Three different things share words on these screens. Reputation XP is a
// standing in the community; reward points are a balance that can become
// wallet credit where conversion is offered; credit is money in the wallet.
// Each screen used to describe them in its own words, and nothing anywhere
// said that XP is not points. The statements live here so every screen says
// the same thing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reputation XP. True today: nothing moves XP into Financial, and
 * `FinancialArchitectureTests` keeps Financial from referencing Trust at all.
 */
export const XP_IS_NOT_MONEY =
  'Reputation XP measures your standing in the community. It is not money, and it cannot be converted.';

/**
 * Reward points. Where they come from is the audit's §4.2: the sign-up bonus,
 * creator milestones and challenges, Academy courses and staff grants — not
 * content activity, which earns XP. Says *where conversion is available*
 * because on most deployments it is not, and the screens say why.
 */
export const POINTS_ARE_NOT_XP =
  'Reward points are not the same as reputation XP. They come from Diaspora’s programmes — the sign-up bonus, creator milestones and challenges, and Academy courses.';

export const POINTS_CAN_CONVERT =
  'Where conversion is available, points can become wallet credit. The rate and the minimum are shown before you convert.';

/**
 * Wallet credit made from points. **Deliberately silent on what credit can be
 * used for and when.** D-7 is a hold whose length the server publishes, so a
 * fixed sentence here would go stale; `creditHoldSentence` says it from the
 * terms. The convert screen said "Credit can be spent on the platform" while
 * the FAQ said the wallet "is a record, not a balance"; neither is what this
 * says.
 */
export const CREDIT_IS_ONE_WAY =
  'Converted points become credit in your wallet, and cannot be turned back into points.';

/**
 * How long converted credit is held (D-7), from the server's terms. A conversion
 * cannot be undone, so a member reads this before confirming, not only on the
 * receipt. Null when there is nothing to state: no hold, or a server that does
 * not send one.
 */
export function creditHoldSentence(holdDays: number | null): string | null {
  if (!holdDays) return null;

  const days = holdDays === 1 ? '1 day' : `${holdDays.toLocaleString()} days`;

  return `The credit can be spent or withdrawn ${days} after you convert.`;
}
