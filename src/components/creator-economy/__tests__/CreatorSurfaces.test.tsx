// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator component tests (Frontend Phase 7)
//
// The assertions concentrate on the rules the brief is written about, because
// they are the ones a well-meaning refactor breaks:
//
//   §10  Points are a count. No component renders them with a currency symbol,
//        and no component can render points and money through the same path.
//   §17  Pending revenue is never presented as available money.
//   §22  A milestone's completion is served, and the card offers the claim only
//        when the server says it is claimable.
//   §34  Anything with no backend behind it says so on the screen.
//   §38  Nothing is carried by colour alone, every progress indicator has a
//        spoken form, and every state has a word as well as a tone.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { CreatorGapNotice, PartiallyRealNotice, SimulatedFigure } from '../CreatorGapNotice';
import {
  CreatorProgressBar,
  CreatorStatusChip,
  RequirementList,
  StatTile,
} from '../CreatorPrimitives';
import { MilestoneCard, RewardPill } from '../ProgrammeCards';
import { PointsBalanceCard, RevenueHeadline, ReferralStats } from '../EconomyPanels';
import { CourseProgressBar, LessonViewer } from '../AcademyComponents';
import { presentCreatorStatus, presentEarningState } from '@/lib/creator-economy';
import { fromMinorUnits } from '@/lib/money';
import type {
  CreatorMetric,
  CreatorMilestone,
  CreatorPoints,
  CreatorReferralProgramme,
  LessonBlock,
} from '@/types/creator-economy';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap markers — §34
// ─────────────────────────────────────────────────────────────────────────────

describe('a surface with no backend says so', () => {
  it('names the missing contract in a development build', () => {
    // Fixture note: this asserts the notice *renders*, so it needs a gap that is
    // still open. The one it used was marked `backendStatus: 'connected'` once the
    // capability shipped, at which point the notice correctly renders nothing.
    renderWithTheme(<CreatorGapNotice gapKey="revenue" />);

    expect(screen.getByText(/Preview · not connected/i)).toBeTruthy();
    expect(screen.getByText(/CREATOR-GAP-008/)).toBeTruthy();
  });

  it('renders nothing at all for a gap key that does not exist', () => {
    // A typo must not produce an empty warning box that reassures a reviewer.
    const { toJSON } = renderWithTheme(<CreatorGapNotice gapKey="notAGap" />);

    expect(toJSON()).toBeNull();
  });

  it('marks a single figure without marking the whole screen', () => {
    renderWithTheme(<SimulatedFigure />);

    expect(screen.getByText('Simulated')).toBeTruthy();
  });

  it('names both halves of a partly-real surface separately', () => {
    // The revenue dashboard is the case this exists for: marking it wholesale
    // would be wrong in both directions.
    renderWithTheme(
      <PartiallyRealNotice
        gapKey="revenue"
        realPart="Your wallet balance."
        simulatedPart="Where the money came from."
      />
    );

    expect(screen.getByText(/Partly connected/i)).toBeTruthy();
    expect(screen.getByText(/Your wallet balance\./)).toBeTruthy();
    expect(screen.getByText(/Where the money came from\./)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status — §38
// ─────────────────────────────────────────────────────────────────────────────

describe('status is never carried by colour alone', () => {
  it('renders a word alongside the tone', () => {
    renderWithTheme(<CreatorStatusChip presentation={presentCreatorStatus('TopCreator')} />);

    expect(screen.getByText('Top creator')).toBeTruthy();
  });

  it('speaks a full sentence to a screen reader', () => {
    renderWithTheme(<CreatorStatusChip presentation={presentEarningState('Pending')} />);

    // §17: the spoken form says it cannot be withdrawn, not just "pending".
    expect(screen.getByLabelText(/cannot withdraw/i)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Progress — §38
// ─────────────────────────────────────────────────────────────────────────────

describe('progress indicators are accessible and use the served figure', () => {
  it('exposes a progressbar role with the served percentage', () => {
    renderWithTheme(
      <CreatorProgressBar
        progress={{ current: 34, target: 50, percentage: 62, unit: 'answers' }}
        subject="Community helper"
      />
    );

    const bar = screen.getByRole('progressbar');

    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 62 });
    expect(bar.props.accessibilityLabel).toContain('62 percent');
  });

  it('renders the figure as text beside the bar, so the bar is decoration', () => {
    renderWithTheme(
      <CreatorProgressBar
        progress={{ current: 7, target: 10, percentage: 70 }}
        subject="Ten guides"
      />
    );

    expect(screen.getByText('7 of 10')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('shows lesson counts on a course bar rather than a bare percentage', () => {
    renderWithTheme(
      <CourseProgressBar
        progress={{
          courseId: 'course-1',
          state: 'InProgress',
          lessonsCompleted: 2,
          lessonCount: 5,
          percentage: 40,
        }}
        title="The craft of a good guide"
      />
    );

    expect(screen.getByText('2 of 5 lessons')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Points and money — §10 · §17
// ─────────────────────────────────────────────────────────────────────────────

describe('points are a count and never money', () => {
  const points: CreatorPoints = {
    available: 3_240,
    pending: 180,
    lifetimeEarned: 8_900,
    lifetimeSpent: 0,
    lifetimeConverted: 2_500,
    lifetimeExpired: 0,
    updatedAt: new Date().toISOString(),
  };

  it('renders the balance with no currency symbol anywhere', () => {
    const { toJSON } = renderWithTheme(<PointsBalanceCard points={points} />);
    const rendered = JSON.stringify(toJSON());

    expect(screen.getByText('3,240')).toBeTruthy();
    expect(rendered).not.toMatch(/[£$€¥]/);
  });

  it('keeps pending points visibly separate from available ones', () => {
    renderWithTheme(<PointsBalanceCard points={points} />);

    expect(screen.getByText(/180 more still being confirmed/)).toBeTruthy();
  });

  it('renders a points reward as a count with its unit', () => {
    renderWithTheme(
      <RewardPill reward={{ kind: 'points', points: 500, label: '500 points' }} />
    );

    expect(screen.getByText('500 points')).toBeTruthy();
  });

  it('renders a money reward through the money path instead', () => {
    renderWithTheme(
      <RewardPill reward={{ kind: 'money', amount: gbp(2_500), label: '£25' }} />
    );

    expect(screen.getByLabelText(/Reward: £25/)).toBeTruthy();
  });
});

describe('pending revenue is never presented as available money', () => {
  it('labels the pending figure as not withdrawable', () => {
    renderWithTheme(
      <RevenueHeadline available={gbp(4_200)} pending={gbp(2_750)} isAvailableReal />
    );

    expect(screen.getByText(/Pending — not yet yours to withdraw/i)).toBeTruthy();
  });

  it('speaks the two figures separately', () => {
    renderWithTheme(
      <RevenueHeadline available={gbp(4_200)} pending={gbp(2_750)} isAvailableReal />
    );

    const label = screen.getByLabelText(/Available to withdraw/).props.accessibilityLabel;

    expect(label).toContain('42.00');
    expect(label).toContain('27.50');
    // Never summed. 69.50 would be the bug this test exists to catch.
    expect(label).not.toContain('69.50');
  });

  it('marks the balance as the member’s real wallet when it is', () => {
    renderWithTheme(<RevenueHeadline available={gbp(4_200)} pending={null} isAvailableReal />);

    expect(screen.getByText('Your wallet')).toBeTruthy();
  });

  it('omits the pending row entirely when there is nothing pending', () => {
    renderWithTheme(<RevenueHeadline available={gbp(4_200)} pending={null} isAvailableReal />);

    expect(screen.queryByText(/not yet yours to withdraw/i)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Referrals — §18
// ─────────────────────────────────────────────────────────────────────────────

describe('referral figures stay apart', () => {
  const programme: CreatorReferralProgramme = {
    code: 'AMARA-LDN',
    shareUrl: 'https://diaspora.app/join?ref=AMARA-LDN',
    rewardDescription: '200 points each.',
    qualificationDescription: 'Seven days of activity.',
    terms: [],
    invited: 14,
    signedUp: 6,
    qualified: 3,
    pendingRewards: 1,
    confirmedRewards: 3,
    isEligible: true,
    updatedAt: new Date().toISOString(),
  };

  it('renders four distinct figures rather than one', () => {
    renderWithTheme(<ReferralStats programme={programme} />);

    expect(screen.getByLabelText(/Invited: 14/)).toBeTruthy();
    expect(screen.getByLabelText(/Joined: 6/)).toBeTruthy();
    expect(screen.getByLabelText(/Qualified: 3/)).toBeTruthy();
    expect(screen.getByLabelText(/Rewarded: 3/)).toBeTruthy();
  });

  it('explains what each figure means, so they cannot be conflated', () => {
    renderWithTheme(<ReferralStats programme={programme} />);

    expect(screen.getByText('Who met the terms')).toBeTruthy();
    expect(screen.getByText('Of those, who signed up')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Milestones — §22
// ─────────────────────────────────────────────────────────────────────────────

describe('a milestone card offers the claim only when the server says it can', () => {
  const milestone = (state: CreatorMilestone['state']): CreatorMilestone => ({
    milestoneId: 'milestone-1',
    key: 'ten_guides',
    title: 'Ten guides',
    description: 'Ten published guides makes you a reference point.',
    state,
    progress: { current: 11, target: 10, percentage: 100, unit: 'guides' },
    reward: { kind: 'points', points: 500, label: '500 points' },
    sortOrder: 10,
  });

  it('shows a claim button on a completed milestone', () => {
    renderWithTheme(<MilestoneCard milestone={milestone('Completed')} onClaim={jest.fn()} />);

    expect(screen.getByText('Claim')).toBeTruthy();
  });

  it('shows no claim button on one that is still in progress', () => {
    renderWithTheme(<MilestoneCard milestone={milestone('InProgress')} onClaim={jest.fn()} />);

    expect(screen.queryByText('Claim')).toBeNull();
  });

  it('shows no claim button on one already claimed', () => {
    renderWithTheme(<MilestoneCard milestone={milestone('Claimed')} onClaim={jest.fn()} />);

    expect(screen.queryByText('Claim')).toBeNull();
  });

  it('disables the claim and explains why when the member is not allowed', () => {
    renderWithTheme(
      <MilestoneCard
        milestone={milestone('Completed')}
        onClaim={jest.fn()}
        canClaim={false}
        claimBlockedReason="Your creator account is suspended."
      />
    );

    expect(screen.getByLabelText('Your creator account is suspended.')).toBeTruthy();
    expect(screen.getByText('Your creator account is suspended.')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stat tiles — §14 · §38
// ─────────────────────────────────────────────────────────────────────────────

describe('a stat tile speaks its meaning', () => {
  const metric: CreatorMetric = {
    key: 'content_views',
    label: 'Views',
    value: 3_180,
    format: 'count',
    changePercentage: 12.4,
    higherIsBetter: true,
    definition: 'People who opened something you published.',
  };

  it('includes the definition in the spoken form', () => {
    // §14: the platform's definition travels with the number, so a member can
    // find out what it counts without the app shipping a glossary.
    renderWithTheme(<StatTile metric={metric} />);

    expect(screen.getByLabelText(/People who opened something you published/)).toBeTruthy();
  });

  it('speaks the change against the previous period', () => {
    renderWithTheme(<StatTile metric={metric} />);

    expect(screen.getByLabelText(/against the previous period/)).toBeTruthy();
  });

  it('renders a currency metric through the money path', () => {
    renderWithTheme(
      <StatTile
        metric={{
          key: 'revenue',
          label: 'Revenue',
          value: 69.5,
          format: 'currency',
          amount: gbp(6_950),
          definition: 'Money attributed to your work.',
        }}
      />
    );

    expect(screen.getByLabelText(/GBP 69\.50/)).toBeTruthy();
  });

  it('renders a percentage with its sign rather than relying on colour', () => {
    renderWithTheme(
      <StatTile
        metric={{
          key: 'engagement_rate',
          label: 'Engagement',
          value: 6.8,
          format: 'percentage',
          changePercentage: -4.2,
          higherIsBetter: true,
          definition: 'Engagements divided by reach.',
        }}
      />
    );

    expect(screen.getByText('6.8%')).toBeTruthy();
    expect(screen.getByText('−4.2%')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Requirements — §7 · §8
// ─────────────────────────────────────────────────────────────────────────────

describe('a requirement list renders what the server decided', () => {
  it('marks a requirement met even when its count is below its target', () => {
    // The property that matters. A component that compared current to target
    // would show this as unmet while the server lets the member through.
    renderWithTheme(
      <RequirementList
        requirements={[
          {
            key: 'sustained_activity',
            label: 'Contribute in six consecutive months',
            isMet: true,
            current: 5,
            target: 6,
          },
        ]}
      />
    );

    expect(screen.getByLabelText(/Done\. 5 of 6/)).toBeTruthy();
  });

  it('offers the action only on an unmet requirement', () => {
    renderWithTheme(
      <RequirementList
        requirements={[
          { key: 'a', label: 'Verify your identity', isMet: true, actionRoute: '/x', actionLabel: 'Verify' },
          { key: 'b', label: 'Add a photo', isMet: false, actionRoute: '/y', actionLabel: 'Add one' },
        ]}
        onAction={jest.fn()}
      />
    );

    expect(screen.queryByText('Verify')).toBeNull();
    expect(screen.getByText('Add one')).toBeTruthy();
  });

  it('renders nothing when there is nothing to require', () => {
    const { toJSON } = renderWithTheme(<RequirementList requirements={[]} />);

    expect(toJSON()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lesson blocks — §13
// ─────────────────────────────────────────────────────────────────────────────

describe('the lesson viewer renders data, never markup', () => {
  const blocks: LessonBlock[] = [
    { kind: 'heading', text: 'Start with what goes wrong' },
    { kind: 'paragraph', text: 'Somebody reading a guide is not curious.' },
    { kind: 'list', ordered: true, items: ['First', 'Second'] },
    { kind: 'callout', tone: 'warning', title: 'Careful', text: 'Never state an outcome as certain.' },
    { kind: 'checklist', items: ['Every fee has a date'] },
    { kind: 'quote', text: 'I wrote down everything I got wrong.', attribution: 'A creator' },
    { kind: 'action', label: 'Open your drafts', route: '/profile/creator-dashboard' },
  ];

  it('renders every block kind in the union', () => {
    renderWithTheme(<LessonViewer blocks={blocks} />);

    expect(screen.getByText('Start with what goes wrong')).toBeTruthy();
    expect(screen.getByText('Somebody reading a guide is not curious.')).toBeTruthy();
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Never state an outcome as certain.')).toBeTruthy();
    expect(screen.getByText('Every fee has a date')).toBeTruthy();
    expect(screen.getByText('I wrote down everything I got wrong.')).toBeTruthy();
    expect(screen.getByText('Open your drafts')).toBeTruthy();
  });

  it('gives the heading a header role', () => {
    renderWithTheme(<LessonViewer blocks={[blocks[0]]} />);

    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('skips a block kind this build has never heard of rather than crashing', () => {
    // A content service ahead of the app in the store will send one. A missing
    // paragraph is a far better outcome than a crashed lesson.
    const future = [
      { kind: 'hologram', text: 'From the future' } as unknown as LessonBlock,
      blocks[1],
    ];

    renderWithTheme(<LessonViewer blocks={future} />);

    expect(screen.getByText('Somebody reading a guide is not curious.')).toBeTruthy();
  });
});
