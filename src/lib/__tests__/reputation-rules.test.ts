// ─────────────────────────────────────────────────────────────────────────────
// "How to earn XP" from the served rules — 22 Oct 2026
//
// The screen said guides +50, confirming alerts +15, residency documents +100,
// helpful votes +10. The server pays 50, nothing to the confirmer (five to the
// author), 30 and 2. These rows come from `GET /trust/reputation/rules` now.
// ─────────────────────────────────────────────────────────────────────────────

import { waysToEarn, waysToLose } from '../reputation-rules';
import type { WireReputationRule } from '@/types/trust';

function rule(
  actionType: string,
  label: string,
  points: number,
  extra: Partial<WireReputationRule> = {}
): WireReputationRule {
  return {
    actionType,
    label,
    dimension: points < 0 ? 'trust' : 'contribution',
    points,
    maxOccurrences: null,
    cooldownHours: null,
    isCountryScoped: false,
    ...extra,
  };
}

const SERVED: WireReputationRule[] = [
  rule('GuidePublished', 'Guides published', 50, { cooldownHours: 1, isCountryScoped: true }),
  rule('CommentWritten', 'Comments written', 2, { maxOccurrences: 250 }),
  rule('GovernmentIdVerified', 'Government ID verified', 40, { dimension: 'verification', maxOccurrences: 1 }),
  rule('CountryVerified', 'Countries verified', 30, {
    dimension: 'verification',
    maxOccurrences: 1,
    isCountryScoped: true,
  }),
  rule('GuideApproved', 'Guides approved', 25, { isCountryScoped: true }),
  rule('ProviderVerified', 'Professional or business verified', 25, { dimension: 'verification', maxOccurrences: 1 }),
  rule('ContentRemoved', 'Content removed by moderation', -25),
  rule('ViolationRecorded', 'Policy violations', -75),
];

describe('waysToEarn', () => {
  it('lists the four largest awards at the points the server pays', () => {
    expect(waysToEarn(SERVED)).toEqual([
      { actionType: 'GuidePublished', label: 'Guides published', amount: '+50 XP', limit: null },
      { actionType: 'GovernmentIdVerified', label: 'Government ID verified', amount: '+40 XP', limit: 'once' },
      {
        actionType: 'CountryVerified',
        label: 'Countries verified',
        amount: '+30 XP',
        limit: 'once per country',
      },
      // A tie at 25 goes to the label, so the order is stable.
      { actionType: 'GuideApproved', label: 'Guides approved', amount: '+25 XP', limit: null },
    ]);
  });

  it('never includes a penalty', () => {
    expect(waysToEarn(SERVED, 100).every((row) => row.amount.startsWith('+'))).toBe(true);
  });

  it('is empty with no rules, so the screen falls back to a sentence without figures', () => {
    expect(waysToEarn([])).toEqual([]);
  });

  it('leaves the rules it was given in their order', () => {
    const before = SERVED.map((entry) => entry.actionType);
    waysToEarn(SERVED);
    expect(SERVED.map((entry) => entry.actionType)).toEqual(before);
  });
});

describe('waysToLose', () => {
  it('lists every penalty, the largest first', () => {
    expect(waysToLose(SERVED)).toEqual([
      { actionType: 'ViolationRecorded', label: 'Policy violations', amount: '−75 XP', limit: null },
      {
        actionType: 'ContentRemoved',
        label: 'Content removed by moderation',
        amount: '−25 XP',
        limit: null,
      },
    ]);
  });
});
