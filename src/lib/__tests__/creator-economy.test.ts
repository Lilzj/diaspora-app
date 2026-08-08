// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy domain logic tests (Frontend Phase 7)
//
// `lib/creator-economy.ts` is display logic and nothing else. These tests exist
// to keep it that way: several of them assert an *absence* — that no function
// here decides a status, computes a progress figure, or turns points into
// money — because the way that discipline erodes is one helpful-looking helper
// at a time.
// ─────────────────────────────────────────────────────────────────────────────

import {
  PERIOD_LABELS,
  clampPercentage,
  describeMetricChange,
  describeProgress,
  fingerprintRange,
  formatCount,
  formatPoints,
  humanise,
  isRangeQueryable,
  orderMilestones,
  presentChallengeState,
  presentCreatorStatus,
  presentEarningState,
  presentGrantApplicationState,
  presentMilestoneState,
  presentSignupBonusState,
  presentSponsoredState,
  presentVerificationState,
} from '../creator-economy';
import {
  ANALYTICS_PERIODS,
  CREATOR_CHALLENGE_STATES,
  CREATOR_EARNING_STATES,
  CREATOR_MILESTONE_STATES,
  CREATOR_STATUSES,
  CREATOR_VERIFICATION_STATES,
  GRANT_APPLICATION_STATES,
  SIGNUP_BONUS_STATES,
  SPONSORED_CONTENT_STATES,
} from '@/types/creator-economy';
import type { CreatorMetric, CreatorMilestone } from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// Status presentation
// ─────────────────────────────────────────────────────────────────────────────

describe('status presentation covers every known state and survives unknown ones', () => {
  const cases = [
    ['creator status', CREATOR_STATUSES, presentCreatorStatus],
    ['verification state', CREATOR_VERIFICATION_STATES, presentVerificationState],
    ['milestone state', CREATOR_MILESTONE_STATES, presentMilestoneState],
    ['challenge state', CREATOR_CHALLENGE_STATES, presentChallengeState],
    ['earning state', CREATOR_EARNING_STATES, presentEarningState],
    ['grant application state', GRANT_APPLICATION_STATES, presentGrantApplicationState],
    ['sponsored state', SPONSORED_CONTENT_STATES, presentSponsoredState],
    ['signup bonus state', SIGNUP_BONUS_STATES, presentSignupBonusState],
  ] as const;

  it.each(cases)('gives every known %s a label, an icon and a sentence', (_name, states, present) => {
    for (const state of states) {
      const presentation = present(state);

      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.icon.length).toBeGreaterThan(0);
      // §38: never colour alone. The description is what a screen reader gets,
      // and a one-word description is not a sentence somebody can act on.
      expect(presentation.description.length).toBeGreaterThan(10);
    }
  });

  it.each(cases)('renders an unknown %s rather than throwing', (_name, _states, present) => {
    // A deployment ahead of the app in the store will send a member a state
    // this build has never heard of. It must render.
    const presentation = present('SomeFutureStateNobodyAnticipated');

    expect(presentation.label).toBe('Some future state nobody anticipated');
    expect(presentation.tone).toBe('neutral');
    expect(presentation.icon.length).toBeGreaterThan(0);
  });
});

describe('the tones carry the meaning the brief requires', () => {
  it('never presents a pending earning as a good outcome', () => {
    // §17: pending revenue must not read as money the member has.
    expect(presentEarningState('Pending').tone).toBe('warning');
    expect(presentEarningState('Available').tone).toBe('success');
    expect(presentEarningState('Pending').description).toMatch(/cannot withdraw/i);
  });

  it('distinguishes a suspended creator from a restricted one', () => {
    expect(presentCreatorStatus('Suspended').tone).toBe('error');
    expect(presentCreatorStatus('Restricted').tone).toBe('warning');
  });

  it('does not explain why a signup bonus was blocked', () => {
    // A fraud refusal that names the check it tripped is a map for getting
    // round it. The copy must stay vague.
    const description = presentSignupBonusState('Blocked').description;

    expect(description).not.toMatch(/fraud|risk|device|duplicate|velocity/i);
    expect(description).toMatch(/support/i);
  });

  it('marks a completed milestone as claimable rather than done', () => {
    // The reward is paid on the claim, so "Completed" must invite the action.
    expect(presentMilestoneState('Completed').label).toBe('Ready to claim');
    expect(presentMilestoneState('Claimed').label).toBe('Claimed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

describe('progress is presented, never computed', () => {
  it('uses the served percentage even when it disagrees with current over target', () => {
    // The whole point. A weighted milestone reports 62% at 34 of 50; a client
    // that divided would draw 68% and disagree with the server on screen.
    const progress = { current: 34, target: 50, percentage: 62, unit: 'answers' };

    expect(clampPercentage(progress.percentage)).toBe(62);
    expect(describeProgress(progress, 'Community helper')).toContain('62 percent');
    expect(describeProgress(progress, 'Community helper')).toContain('34 answers of 50 answers');
  });

  it('clamps a nonsensical percentage rather than breaking a layout', () => {
    expect(clampPercentage(140)).toBe(100);
    expect(clampPercentage(-20)).toBe(0);
    expect(clampPercentage(Number.NaN)).toBe(0);
    expect(clampPercentage(undefined)).toBe(0);
    expect(clampPercentage(null)).toBe(0);
  });

  it('describes progress as a sentence a screen reader can use', () => {
    const description = describeProgress(
      { current: 7, target: 10, percentage: 70 },
      'Ten guides'
    );

    expect(description).toBe('Ten guides: 7 of 10. 70 percent complete.');
  });
});

describe('milestone ordering puts the actionable ones first', () => {
  const milestone = (
    id: string,
    state: CreatorMilestone['state'],
    sortOrder: number
  ): CreatorMilestone => ({
    milestoneId: id,
    key: id,
    title: id,
    description: '',
    state,
    progress: { current: 0, target: 1, percentage: 0 },
    sortOrder,
  });

  it('surfaces a completed unclaimed milestone above everything else', () => {
    const ordered = orderMilestones([
      milestone('locked', 'Locked', 10),
      milestone('claimed', 'Claimed', 20),
      milestone('completed', 'Completed', 90),
      milestone('in-progress', 'InProgress', 30),
      milestone('almost', 'AlmostComplete', 40),
    ]);

    expect(ordered.map((item) => item.milestoneId)).toEqual([
      'completed',
      'almost',
      'in-progress',
      'claimed',
      'locked',
    ]);
  });

  it('respects the platform’s sortOrder within a group rather than sorting by title', () => {
    const ordered = orderMilestones([
      milestone('zebra', 'InProgress', 10),
      milestone('apple', 'InProgress', 20),
    ]);

    expect(ordered.map((item) => item.milestoneId)).toEqual(['zebra', 'apple']);
  });

  it('does not mutate the array it was given', () => {
    const input = [milestone('a', 'Locked', 10), milestone('b', 'Completed', 20)];
    const before = input.map((item) => item.milestoneId);

    orderMilestones(input);

    expect(input.map((item) => item.milestoneId)).toEqual(before);
  });

  it('puts an unknown state last rather than dropping it', () => {
    const ordered = orderMilestones([
      milestone('unknown', 'SomeNewState' as CreatorMilestone['state'], 10),
      milestone('completed', 'Completed', 20),
    ]);

    expect(ordered).toHaveLength(2);
    expect(ordered[1].milestoneId).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Analytics periods
// ─────────────────────────────────────────────────────────────────────────────

describe('analytics periods', () => {
  it('labels every period the type declares', () => {
    for (const period of ANALYTICS_PERIODS) {
      expect(PERIOD_LABELS[period]).toBeTruthy();
    }
  });

  it('fingerprints a named period as itself', () => {
    expect(fingerprintRange({ period: '30d' })).toBe('30d');
  });

  it('keeps a custom range distinct from a named one covering the same days', () => {
    // The server may bucket them differently, so they must not share a cache
    // entry.
    const custom = fingerprintRange({ period: 'custom', from: '2026-01-01', to: '2026-01-31' });

    expect(custom).not.toBe('30d');
    expect(custom).toBe('custom:2026-01-01:2026-01-31');
  });

  it('will not query an incomplete or inverted custom range', () => {
    expect(isRangeQueryable({ period: '7d' })).toBe(true);
    expect(isRangeQueryable({ period: 'custom', from: '2026-01-01', to: null })).toBe(false);
    expect(isRangeQueryable({ period: 'custom', from: null, to: '2026-01-31' })).toBe(false);
    expect(isRangeQueryable({ period: 'custom', from: '2026-02-01', to: '2026-01-01' })).toBe(false);
    expect(isRangeQueryable({ period: 'custom', from: '2026-01-01', to: '2026-01-31' })).toBe(true);
  });
});

describe('metric change presentation', () => {
  const metric = (overrides: Partial<CreatorMetric>): CreatorMetric => ({
    key: 'views',
    label: 'Views',
    value: 100,
    format: 'count',
    higherIsBetter: true,
    ...overrides,
  });

  it('returns nothing when the server sent no comparison', () => {
    expect(describeMetricChange(metric({ changePercentage: undefined }))).toBeNull();
  });

  it('reads a rise as good when higher is better', () => {
    expect(describeMetricChange(metric({ changePercentage: 12.4 }))).toEqual({
      text: '+12%',
      tone: 'success',
    });
  });

  it('reads a rise as bad when higher is worse', () => {
    // A 30% rise in reports received is not good news, and colouring every
    // increase green would tell a creator their worst week was their best.
    expect(
      describeMetricChange(
        metric({ key: 'reports', label: 'Reports', changePercentage: 30, higherIsBetter: false })
      )
    ).toEqual({ text: '+30%', tone: 'warning' });
  });

  it('reads a fall as good when higher is worse', () => {
    expect(
      describeMetricChange(
        metric({ key: 'reports', changePercentage: -30, higherIsBetter: false })
      )
    ).toEqual({ text: '−30%', tone: 'success' });
  });

  it('treats a change under half a percent as no change', () => {
    expect(describeMetricChange(metric({ changePercentage: 0.2 }))).toEqual({
      text: 'No change',
      tone: 'neutral',
    });
  });

  it('keeps a decimal on a small change and drops it on a large one', () => {
    expect(describeMetricChange(metric({ changePercentage: 4.25 }))?.text).toBe('+4.3%');
    expect(describeMetricChange(metric({ changePercentage: 41.6 }))?.text).toBe('+42%');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

describe('formatting', () => {
  it('abbreviates counts without losing the order of magnitude', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_000)).toBe('1.0K');
    expect(formatCount(12_480)).toBe('12K');
    expect(formatCount(1_500_000)).toBe('1.5M');
    expect(formatCount(Number.NaN)).toBe('0');
  });

  it('never renders points without their unit', () => {
    // §10: a bare number beside a currency figure is how somebody comes to
    // believe they have £1,240 rather than 1,240 points.
    expect(formatPoints(1_240)).toBe('1,240 points');
    expect(formatPoints(1)).toBe('1 point');
    expect(formatPoints(0)).toBe('0 points');
  });

  it('never renders points with a currency symbol', () => {
    const rendered = formatPoints(500);

    expect(rendered).not.toMatch(/[£$€¥]/);
  });

  it('turns a server enum member into passable English', () => {
    expect(humanise('MoreInformationRequired')).toBe('More information required');
    expect(humanise('PendingPayment')).toBe('Pending payment');
    expect(humanise('signed_up')).toBe('Signed up');
    expect(humanise('')).toBe('');
  });
});
