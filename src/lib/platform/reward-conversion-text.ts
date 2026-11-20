/**
 * A member's sentence for the server's reason a conversion is refused.
 *
 * **The one map.** The convert screen kept a table of its own, and the two
 * disagreed with each other and with the server: each expected a code the
 * server never sends (`conversion_rate_missing`, `no_published_rate`) and
 * neither knew the ones it does. These are the codes `RewardConversionPricer`
 * and its terms actually produce (22 Oct 2026).
 *
 * The server now sends its own sentence with the terms (`member.reasonMessage`),
 * and a reason that is already a sentence is shown as it is. The table is for a
 * bare code — a server from before the sentence, or a code with no message.
 * Unknown codes get a plain fallback, never the code itself (20 Oct 2026).
 */
const REASONS: Readonly<Record<string, string>> = {
  'financial.rewards.conversion_not_supported':
    'Turning points into wallet credit is not switched on where you are yet. Your points are safe.',
  'financial.rewards.currency_not_offered': 'Points convert into a different currency here.',
  'financial.account.not_eligible':
    'Verify your identity before converting points into money. Your points are safe in the meantime.',
  'financial.account.restricted': 'This account cannot convert points right now.',
  // A hold. Says that it is one, and that the member can ask for a review
  // (RWD-14, CS-4a), and no more, as the server does.
  'financial.rewards.not_eligible':
    'Conversion is paused on your account. You can ask us to review it.',
  'financial.rewards.below_minimum': 'You do not have enough points to convert yet.',
  'financial.rewards.above_maximum': 'That is more points than can be converted at once.',
  'financial.rewards.daily_limit_reached': 'You have converted as much as you can today.',
  'financial.rewards.insufficient_points': 'That is more points than you hold.',
  // The rewards pot is empty (D-6). The server's own words, and the points stay.
  'financial.rewards.budget_exhausted': 'Conversions are paused for now. Your points are safe.',
};

export function conversionReasonText(reason: string | null | undefined): string {
  if (!reason) return 'Conversion is not available on your account.';

  const known = REASONS[reason];
  if (known) return known;

  return /^[a-z0-9_.-]+$/i.test(reason) && reason.includes('.')
    ? 'Conversion is not available on your account right now.'
    : reason;
}
