// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator shell and interaction tests (Frontend Phase 7)
//
// `<CreatorScreen>` is where the phase's three non-negotiable refusals live: a
// release build cannot reach a gap-backed surface, a suspended creator cannot
// reach a claim, and an error is rendered rather than swallowed. Testing them
// here rather than once per screen is the point of the shell — a screen cannot
// ship having forgotten one, because it never gets the chance to render.
//
// The interaction tests below cover the two components with real state of their
// own: the period selector's custom range, and the quiz.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { CreatorScreen } from '../CreatorScreen';
import { PeriodSelector } from '../PeriodSelector';
import { QuizView } from '../AcademyComponents';
import { ChallengeCard, GrantCard, GrantApplicationCard } from '../ProgrammeCards';
import { RewardCard, LeaderboardRow, RecommendationCard } from '../EconomyPanels';
import { CreatorEmptyState, QuickAction, CreatorSection } from '../CreatorPrimitives';
import { FinancialError } from '@/lib/financial-errors';
import { fromMinorUnits } from '@/lib/money';
import type {
  AnalyticsRange,
  CommunityGrant,
  CreatorChallenge,
  CreatorReward,
  GrantApplication,
  LessonQuiz,
} from '@/types/creator-economy';

const gbp = (minor: number) => fromMinorUnits(minor, 'GBP', 2, '£');

/**
 * Fixed safe-area metrics.
 *
 * `<CreatorScreen>` reads `useSafeAreaInsets()` to keep a footer clear of the
 * home indicator. Without a provider that throws, so the metrics are supplied
 * rather than the hook being mocked — mocking it would stop the test noticing
 * if the shell started ignoring the inset.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithTheme(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const unavailable = new FinancialError({
  kind: 'unavailable',
  code: 'frontend.creator-gap.milestones',
  message: 'Creator milestones is not available on Diaspora yet.',
  hint: 'The platform does not support it yet.',
  isRetryable: false,
  isTerminal: true,
  isIndeterminate: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// The shell's refusals
// ─────────────────────────────────────────────────────────────────────────────

describe('the screen shell refuses before the content renders', () => {
  it('shows the content when everything is fine', () => {
    renderWithTheme(
      <CreatorScreen title="Milestones" isEnabled>
        <Text>The milestone list</Text>
      </CreatorScreen>
    );

    expect(screen.getByText('The milestone list')).toBeTruthy();
  });

  it('replaces a gap-backed surface with a statement in a release build', () => {
    // Not an error, and not a spinner that never resolves.
    renderWithTheme(
      <CreatorScreen title="Milestones" gapKey="milestones" isEnabled={false}>
        <Text>The milestone list</Text>
      </CreatorScreen>
    );

    expect(screen.queryByText('The milestone list')).toBeNull();
    expect(screen.getByText('Creator milestones')).toBeTruthy();
    expect(screen.getByText(/cannot do this yet/i)).toBeTruthy();
  });

  it('replaces the content with an explanation when the member is refused', () => {
    renderWithTheme(
      <CreatorScreen
        title="Rewards"
        refusal={{
          allowed: false,
          reason: 'creatorSuspended',
          message: 'Your creator account is suspended, so this is paused.',
          action: 'appeal',
        }}
      >
        <Text>Redeem a reward</Text>
      </CreatorScreen>
    );

    expect(screen.queryByText('Redeem a reward')).toBeNull();
    expect(screen.getByText('Your creator account is suspended')).toBeTruthy();
    expect(screen.getByText('Open appeals')).toBeTruthy();
  });

  it('distinguishes a restricted creator from a suspended one in the copy', () => {
    renderWithTheme(
      <CreatorScreen
        title="Challenges"
        refusal={{
          allowed: false,
          reason: 'creatorRestricted',
          message: 'Some creator features are paused while we review your account.',
        }}
      >
        <Text>Join a challenge</Text>
      </CreatorScreen>
    );

    expect(screen.getByText('Some creator features are paused')).toBeTruthy();
  });

  it('delegates a platform refusal rather than reimplementing it', () => {
    renderWithTheme(
      <CreatorScreen
        title="Revenue"
        refusal={{
          allowed: false,
          reason: 'signedOut',
          message: 'Sign in to use your creator dashboard.',
          action: 'signIn',
        }}
      >
        <Text>Your earnings</Text>
      </CreatorScreen>
    );

    expect(screen.queryByText('Your earnings')).toBeNull();
    // `<AccessGate>` is Phase 5's, unchanged. Asserting on its call to action
    // proves the delegation happened without re-testing its internals.
    expect(screen.getAllByText(/Sign in/i).length).toBeGreaterThan(0);
  });

  it('renders an error rather than swallowing it', () => {
    renderWithTheme(
      <CreatorScreen title="Milestones" error={unavailable} onRetry={jest.fn()}>
        <Text>The milestone list</Text>
      </CreatorScreen>
    );

    expect(screen.queryByText('The milestone list')).toBeNull();
    expect(screen.getByText(/not available on Diaspora yet/i)).toBeTruthy();
  });

  it('shows the gap notice above the content it describes', () => {
    renderWithTheme(
      <CreatorScreen title="Grants" gapKey="grants" isEnabled>
        <Text>Open grants</Text>
      </CreatorScreen>
    );

    expect(screen.getByText(/CREATOR-GAP-005/)).toBeTruthy();
    expect(screen.getByText('Open grants')).toBeTruthy();
  });

  it('shows a loading state instead of the content, without an error', () => {
    renderWithTheme(
      <CreatorScreen title="Analytics" isLoading>
        <Text>The figures</Text>
      </CreatorScreen>
    );

    expect(screen.queryByText('The figures')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('gives the title a header role for a screen reader', () => {
    renderWithTheme(
      <CreatorScreen title="Creator Academy" showBack>
        <Text>Courses</Text>
      </CreatorScreen>
    );

    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Period selector
// ─────────────────────────────────────────────────────────────────────────────

describe('the period selector', () => {
  const range: AnalyticsRange = { period: '30d', from: null, to: null };

  it('offers every period the brief requires', () => {
    renderWithTheme(<PeriodSelector range={range} onChange={jest.fn()} />);

    for (const label of ['Today', '7 days', '30 days', '90 days', 'This year', 'Custom']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('marks the active period as selected for a screen reader', () => {
    renderWithTheme(<PeriodSelector range={range} onChange={jest.fn()} />);

    const tabs = screen.getAllByRole('tab');
    const active = tabs.filter((tab) => tab.props.accessibilityState?.selected);

    expect(active).toHaveLength(1);
  });

  it('reports a named period immediately', () => {
    const onChange = jest.fn();
    renderWithTheme(<PeriodSelector range={range} onChange={onChange} />);

    fireEvent.press(screen.getByText('7 days'));

    expect(onChange).toHaveBeenCalledWith({ period: '7d', from: null, to: null });
  });

  it('opens a sheet for a custom range rather than reporting an incomplete one', () => {
    // A half-filled custom range must never fire a query.
    const onChange = jest.fn();
    renderWithTheme(<PeriodSelector range={range} onChange={onChange} />);

    fireEvent.press(screen.getByText('Custom'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Custom period')).toBeTruthy();
  });

  it('will not apply a custom range until both dates are present', () => {
    const onChange = jest.fn();
    renderWithTheme(<PeriodSelector range={range} onChange={onChange} />);

    fireEvent.press(screen.getByText('Custom'));
    fireEvent.changeText(screen.getByLabelText(/From date/), '2026-01-01');
    fireEvent.press(screen.getByText('Apply'));

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText(/To date/), '2026-01-31');
    fireEvent.press(screen.getByText('Apply'));

    expect(onChange).toHaveBeenCalledWith({
      period: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quiz
// ─────────────────────────────────────────────────────────────────────────────

describe('the quiz cannot mark its own paper', () => {
  const quiz: LessonQuiz = {
    quizId: 'quiz-1',
    passMark: 2,
    questions: [
      {
        questionId: 'q1',
        prompt: 'What should the first paragraph do?',
        options: [
          { optionId: 'a', label: 'Introduce the topic' },
          { optionId: 'b', label: 'Say what goes wrong' },
        ],
        explanation: 'Somebody reading already has the problem.',
      },
      {
        questionId: 'q2',
        prompt: 'A fee changed. What do you do?',
        options: [
          { optionId: 'a', label: 'Leave it' },
          { optionId: 'b', label: 'Update it and say what changed' },
        ],
        explanation: 'A visible correction is what makes the guide trustworthy.',
      },
    ],
  };

  it('will not submit until every question is answered', () => {
    const onSubmit = jest.fn();
    renderWithTheme(
      <QuizView quiz={quiz} result={null} isSubmitting={false} onSubmit={onSubmit} onRetry={jest.fn()} />
    );

    expect(screen.getByText('Submit (0/2)')).toBeTruthy();

    fireEvent.press(screen.getByText('Say what goes wrong'));
    expect(screen.getByText('Submit (1/2)')).toBeTruthy();

    fireEvent.press(screen.getByText('Update it and say what changed'));
    fireEvent.press(screen.getByText('Submit (2/2)'));

    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q1', optionId: 'b' },
      { questionId: 'q2', optionId: 'b' },
    ]);
  });

  it('marks each answer only from the server’s outcomes', () => {
    renderWithTheme(
      <QuizView
        quiz={quiz}
        result={{
          passed: false,
          correctCount: 1,
          totalCount: 2,
          outcomes: [
            { questionId: 'q1', isCorrect: true, explanation: 'Right.' },
            { questionId: 'q2', isCorrect: false, explanation: 'Not quite.' },
          ],
          canRetry: true,
        }}
        isSubmitting={false}
        onSubmit={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Not quite')).toBeTruthy();
    expect(screen.getByText('1 of 2 correct. You need 2 to pass.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('says it passed and does not offer a retry', () => {
    renderWithTheme(
      <QuizView
        quiz={quiz}
        result={{
          passed: true,
          correctCount: 2,
          totalCount: 2,
          outcomes: [
            { questionId: 'q1', isCorrect: true },
            { questionId: 'q2', isCorrect: true },
          ],
          canRetry: false,
        }}
        isSubmitting={false}
        onSubmit={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('locks the options once a result is in', () => {
    renderWithTheme(
      <QuizView
        quiz={quiz}
        result={{
          passed: true,
          correctCount: 2,
          totalCount: 2,
          outcomes: [],
          canRetry: false,
        }}
        isSubmitting={false}
        onSubmit={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    const options = screen.getAllByRole('radio');
    expect(options.every((option) => option.props.accessibilityState?.disabled)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Programme cards
// ─────────────────────────────────────────────────────────────────────────────

describe('programme cards explain a refusal rather than just disabling', () => {
  const challenge: CreatorChallenge = {
    challengeId: 'challenge-1',
    title: 'Host a community event',
    description: 'Organise and run one event.',
    state: 'Open',
    isEligible: false,
    ineligibleReason: 'Hosting events needs a verified organisation.',
    tasks: [{ taskId: 'task-1', label: 'Create an event', isComplete: false }],
    progress: { current: 0, target: 1, percentage: 0 },
    rules: ['The event must take place within the window.'],
    hasLeaderboard: false,
  };

  it('shows the platform’s reason on an ineligible challenge', () => {
    renderWithTheme(<ChallengeCard challenge={challenge} onPress={jest.fn()} />);

    expect(screen.getByText('Hosting events needs a verified organisation.')).toBeTruthy();
  });

  it('opens a challenge when tapped', () => {
    const onPress = jest.fn();
    renderWithTheme(<ChallengeCard challenge={challenge} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText(/Host a community event/));

    expect(onPress).toHaveBeenCalledWith(challenge);
  });

  const grant: CommunityGrant = {
    grantId: 'grant-1',
    title: 'Newcomer handbook grant',
    summary: 'Funding to produce an arrival handbook.',
    description: 'Longer description.',
    category: 'Content',
    state: 'Open',
    fundingAmount: gbp(150_000),
    requirements: [
      { key: 'a', label: 'Be a verified creator', isMet: true },
      { key: 'b', label: 'Five guides', isMet: false },
    ],
    deliverables: [],
    isEligible: true,
    countryCodes: ['GB'],
  };

  it('shows how many grant requirements are met, from the server’s flags', () => {
    renderWithTheme(<GrantCard grant={grant} onPress={jest.fn()} />);

    expect(screen.getByText('1/2 requirements')).toBeTruthy();
  });

  const application: GrantApplication = {
    applicationId: 'application-1',
    grantId: 'grant-1',
    grantTitle: 'Community event fund',
    state: 'MoreInformationRequested',
    answers: {},
    attachmentIds: [],
    informationRequested: ['A confirmed venue.', 'A cost breakdown.'],
    reports: [],
    canWithdraw: true,
    canResubmit: true,
  };

  it('lists exactly what a reviewer asked for', () => {
    renderWithTheme(<GrantApplicationCard application={application} onPress={jest.fn()} />);

    expect(screen.getByText('They need more from you')).toBeTruthy();
    expect(screen.getByText('• A confirmed venue.')).toBeTruthy();
    expect(screen.getByText('• A cost breakdown.')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reward affordability
// ─────────────────────────────────────────────────────────────────────────────

describe('a reward card explains why it cannot be redeemed', () => {
  const reward: CreatorReward = {
    rewardId: 'reward-1',
    title: 'Feature a guide for 7 days',
    description: 'One of your guides appears in the featured slot.',
    pointsCost: 1_500,
    state: 'Available',
  };

  it('says how many more points are needed rather than just disabling', () => {
    renderWithTheme(<RewardCard reward={reward} availablePoints={900} onRedeem={jest.fn()} />);

    expect(screen.getByText('You need 600 more points.')).toBeTruthy();
  });

  it('does not fire a redemption the member cannot afford', () => {
    const onRedeem = jest.fn();
    renderWithTheme(<RewardCard reward={reward} availablePoints={900} onRedeem={onRedeem} />);

    fireEvent.press(screen.getByLabelText(/Cannot redeem Feature a guide/));

    expect(onRedeem).not.toHaveBeenCalled();
  });

  it('redeems when the member can afford it and is allowed', () => {
    const onRedeem = jest.fn();
    renderWithTheme(<RewardCard reward={reward} availablePoints={3_240} onRedeem={onRedeem} />);

    fireEvent.press(screen.getByLabelText(/Redeem Feature a guide/));

    expect(onRedeem).toHaveBeenCalledWith(reward);
  });

  it('reports the locked reason from the platform', () => {
    renderWithTheme(
      <RewardCard
        reward={{ ...reward, state: 'Locked', lockedReason: 'Available to established creators.' }}
        availablePoints={9_000}
        onRedeem={jest.fn()}
      />
    );

    expect(
      screen.getByLabelText(/Cannot redeem .*Available to established creators/)
    ).toBeTruthy();
  });

  it('renders the cost as points, never as money', () => {
    const { toJSON } = renderWithTheme(
      <RewardCard reward={reward} availablePoints={3_240} onRedeem={jest.fn()} />
    );

    expect(screen.getByText('1,500 points')).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toMatch(/£1,?500/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard, recommendations and the small pieces
// ─────────────────────────────────────────────────────────────────────────────

describe('leaderboard rows name the score and mark the viewer', () => {
  it('marks the viewer’s own row in words as well as colour', () => {
    renderWithTheme(
      <LeaderboardRow
        entry={{
          rank: 3,
          creatorId: 'creator-3',
          displayName: 'Amara Kone',
          score: 1_200,
          isVerifiedCreator: true,
          rankDelta: 2,
        }}
        scoreLabel="Impact score"
        isViewer
      />
    );

    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByLabelText(/This is you/)).toBeTruthy();
    expect(screen.getByLabelText(/Impact score: 1,200/)).toBeTruthy();
  });

  it('speaks the movement since last time', () => {
    renderWithTheme(
      <LeaderboardRow
        entry={{
          rank: 8,
          creatorId: 'creator-8',
          displayName: 'Zainab Ali',
          score: 400,
          isVerifiedCreator: false,
          rankDelta: -3,
        }}
        scoreLabel="Impact score"
        isViewer={false}
      />
    );

    expect(screen.getByLabelText(/Down 3 since last time/)).toBeTruthy();
  });
});

describe('a recommendation always says why', () => {
  const recommendation = {
    recommendationId: 'rec-1',
    kind: 'grant' as const,
    title: 'You are eligible for the handbook grant',
    body: 'Up to £1,500 to write an arrival handbook.',
    reason: 'You meet every requirement and write about London already.',
    actionLabel: 'Read the grant',
    actionRoute: '/creator/grants/grant-1',
  };

  it('renders the reason alongside the suggestion', () => {
    renderWithTheme(<RecommendationCard recommendation={recommendation} onPress={jest.fn()} />);

    expect(
      screen.getByText('You meet every requirement and write about London already.')
    ).toBeTruthy();
  });

  it('dismisses through the callback rather than hiding locally', () => {
    const onDismiss = jest.fn();
    renderWithTheme(
      <RecommendationCard
        recommendation={recommendation}
        onPress={jest.fn()}
        onDismiss={onDismiss}
      />
    );

    fireEvent.press(screen.getByLabelText(/Dismiss:/));

    expect(onDismiss).toHaveBeenCalledWith(recommendation);
  });
});

describe('the small pieces', () => {
  it('an empty state offers a way out', () => {
    const onAction = jest.fn();
    renderWithTheme(
      <CreatorEmptyState
        icon="trophy-outline"
        title="No milestones here"
        body="Diaspora has not set any milestones yet."
        actionLabel="Show all"
        onAction={onAction}
      />
    );

    expect(screen.getByLabelText(/No milestones here\. Diaspora has not set any/)).toBeTruthy();
    fireEvent.press(screen.getByText('Show all'));
    expect(onAction).toHaveBeenCalled();
  });

  it('a quick action speaks its badge count', () => {
    renderWithTheme(
      <QuickAction icon="trophy-outline" label="Milestones" onPress={jest.fn()} badge={2} />
    );

    expect(screen.getByLabelText('Milestones. 2 waiting.')).toBeTruthy();
  });

  it('a section collapses its count when there is nothing to count', () => {
    renderWithTheme(
      <CreatorSection title="Grants" count={0}>
        <Text>Body</Text>
      </CreatorSection>
    );

    expect(screen.queryByLabelText(/items/)).toBeNull();
    expect(screen.getByText('Grants')).toBeTruthy();
  });

  it('a section shows its count and its action when there is', () => {
    const onAction = jest.fn();
    renderWithTheme(
      <CreatorSection title="Grants" count={3} actionLabel="See all" onAction={onAction}>
        <Text>Body</Text>
      </CreatorSection>
    );

    expect(screen.getByLabelText('3 items')).toBeTruthy();
    fireEvent.press(screen.getByText('See all'));
    expect(onAction).toHaveBeenCalled();
  });
});
