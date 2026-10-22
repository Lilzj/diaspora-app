// ─────────────────────────────────────────────────────────────────────────────
// The one map from a conversion refusal to a sentence — 22 Oct 2026
//
// Two tables disagreed with each other and with the server: each knew a code
// the server never sends (`conversion_rate_missing`, `no_published_rate`) and
// neither knew the ones it does. These are the codes `RewardConversionPricer`
// and its terms actually produce.
// ─────────────────────────────────────────────────────────────────────────────

import { conversionReasonText } from '../reward-conversion-text';

const SERVED_CODES = [
  'financial.rewards.conversion_not_supported',
  'financial.rewards.currency_not_offered',
  'financial.account.not_eligible',
  'financial.account.restricted',
  'financial.rewards.not_eligible',
  'financial.rewards.below_minimum',
  'financial.rewards.above_maximum',
  'financial.rewards.daily_limit_reached',
  'financial.rewards.insufficient_points',
];

const GENERIC = 'Conversion is not available on your account right now.';

describe('conversionReasonText', () => {
  it.each(SERVED_CODES)('has its own words for %s', (code) => {
    const text = conversionReasonText(code);

    expect(text).not.toBe(GENERIC);
    expect(text).not.toMatch(/financial\./);
    expect(text).toMatch(/\.$/);
  });

  it('says only that a hold is a hold, as the server does', () => {
    expect(conversionReasonText('financial.rewards.not_eligible')).toBe(
      'Conversion is paused on your account. Contact support if you think this is a mistake.'
    );
  });

  it('shows the server’s own sentence as it is', () => {
    expect(conversionReasonText('You need at least 500 points to convert. You have 320.')).toBe(
      'You need at least 500 points to convert. You have 320.'
    );
  });

  it('never shows a code it does not know, including the two the server never sent', () => {
    expect(conversionReasonText('financial.rewards.conversion_rate_missing')).toBe(GENERIC);
    expect(conversionReasonText('financial.rewards.no_published_rate')).toBe(GENERIC);
  });

  it('has a plain sentence for no reason at all', () => {
    expect(conversionReasonText(null)).toBe('Conversion is not available on your account.');
    expect(conversionReasonText('')).toBe('Conversion is not available on your account.');
  });
});
