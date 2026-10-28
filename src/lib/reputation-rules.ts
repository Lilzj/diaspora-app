// ─────────────────────────────────────────────────────────────────────────────
// "How to earn XP", from the rules the server pays — 22 Oct 2026
//
// The reputation screen said: "Contribute local guides (+50 XP), confirm
// alerts (+15 XP), upload residency documents (+100 XP), and receive helpful
// community votes (+10 XP)." Only the first figure was right. Confirming pays
// the *author*, not the member who confirms, and five, not fifteen; residency
// is thirty; a helpful vote is two. Nothing on the device knew any of it.
//
// These rows are built from `GET /trust/reputation/rules`, so the copy changes
// when the rules do. With no rules — loading, or a server from before the
// route — the screen says what earns XP without saying how much.
// ─────────────────────────────────────────────────────────────────────────────

import type { WireReputationRule } from '@/types/trust';

/** One line of "How to earn XP" or "What lowers it". */
export interface ReputationRuleRow {
  actionType: string;
  label: string;
  /** "+50 XP", "−75 XP". */
  amount: string;
  /** "once", "once per country", "up to 3 a day", or null when it may count again. */
  limit: string | null;
}

/** What the screen says when it has no rules to quote. No figures, so nothing to be wrong. */
export const HOW_TO_EARN_WITHOUT_RULES =
  'Publishing guides, verifying who you are and where you live, and contributions other members find helpful all earn XP.';

function rowOf(rule: WireReputationRule): ReputationRuleRow {
  const sign = rule.points < 0 ? '−' : '+';

  let limit: string | null = null;
  if (rule.maxOccurrences === 1) {
    limit = rule.isCountryScoped ? 'once per country' : 'once';
  } else if (rule.dailyCap != null && rule.dailyCap > 0) {
    // A budget, not a gap: a second guide ten minutes after the first earns
    // too (REP-09). Said, because a member publishing a fourth would otherwise
    // wonder where its XP went.
    limit = rule.dailyCap === 1 ? 'once a day' : `up to ${rule.dailyCap} a day`;
  }

  return {
    actionType: rule.actionType,
    label: rule.label,
    amount: `${sign}${Math.abs(rule.points)} XP`,
    limit,
  };
}

function byPointsThenLabel(a: WireReputationRule, b: WireReputationRule): number {
  return Math.abs(b.points) - Math.abs(a.points) || a.label.localeCompare(b.label);
}

/** The largest awards, biggest first — four by default, so the box stays a summary. */
export function waysToEarn(rules: readonly WireReputationRule[], limit = 4): ReputationRuleRow[] {
  return rules
    .filter((rule) => rule.points > 0)
    .sort(byPointsThenLabel)
    .slice(0, limit)
    .map(rowOf);
}

/** Every penalty, the largest first. There are few, and a member should see all of them. */
export function waysToLose(rules: readonly WireReputationRule[]): ReputationRuleRow[] {
  return rules
    .filter((rule) => rule.points < 0)
    .sort(byPointsThenLabel)
    .map(rowOf);
}
