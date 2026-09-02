/**
 * Community Life components — Frontend Phase 12
 *
 * §46 asks for screen readers, accessible labels, buttons, forms, status
 * indicators, progress, charts, voting controls and donation forms, plus dark
 * mode and no colour-only state communication.
 *
 * These tests assert the properties that a visual review cannot: what a screen
 * reader is actually told, which roles the voting controls carry, and — the one
 * that matters most for this phase — that a simulated figure cannot be rendered
 * without its marker.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@/design-system';
import {
  CommunityGapNotice,
  CommunityStatusBadge,
  PartlyRealNotice,
  PollBallot,
  PollResults,
  PrimaryButton,
  ProgressBar,
  SimulatedFigure,
  SourcedValue,
  Stat,
  VerifiedFigure,
  describeDraft,
} from '..';
import { describeMembership, describeCampaign } from '@/lib/community-state';
import { money } from '@/mocks/financial-data';
import type { CommunityPoll, PollResult } from '@/types/community-advanced';

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const poll: CommunityPoll = {
  pollId: 'poll-1',
  question: 'Which date works best?',
  description: null,
  status: 'Open',
  votingType: 'SingleChoice',
  audience: 'Public',
  options: [
    { optionId: 'a', label: 'Saturday 26 September', description: null, sortOrder: 1 },
    { optionId: 'b', label: 'Saturday 3 October', description: null, sortOrder: 2 },
    { optionId: 'c', label: 'Saturday 10 October', description: null, sortOrder: 3 },
  ],
  maxSelections: null,
  isAnonymous: false,
  allowsChange: true,
  organizationId: 'org-1',
  organizationName: 'Test Association',
  createdBy: 'org-1',
  opensAt: null,
  closesAt: null,
  totalResponses: 12,
  hasVoted: false,
  myResponse: null,
  canVote: true,
  cannotVoteReason: null,
  canManage: false,
  createdAt: '2026-07-01T00:00:00.000Z',
};

// ═════════════════════════════════════════════════════════════════════════════
// Status — §46, no colour-only communication
// ═════════════════════════════════════════════════════════════════════════════

describe('CommunityStatusBadge', () => {
  it('speaks the state rather than describing an icon', () => {
    renderWithTheme(<CommunityStatusBadge state={describeMembership('Pending')} />);
    expect(screen.getByLabelText('Pending review')).toBeTruthy();
  });

  it('renders the label as text as well as speaking it', () => {
    // The icon is the redundant channel; the *word* is what a colour-blind
    // sighted member reads.
    renderWithTheme(<CommunityStatusBadge state={describeMembership('PaymentFailed')} />);
    expect(screen.getByText('Payment failed')).toBeTruthy();
  });

  it('distinguishes states that share a tone', () => {
    // `Rejected` and `PaymentFailed` are both negative. If tone were the only
    // channel they would be indistinguishable.
    const rejected = describeMembership('Rejected');
    const failed = describeMembership('PaymentFailed');

    expect(rejected.tone).toBe(failed.tone);
    expect(rejected.label).not.toBe(failed.label);
    expect(rejected.icon).not.toBe(failed.icon);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Progress — §46, accessible progress
// ═════════════════════════════════════════════════════════════════════════════

describe('ProgressBar', () => {
  it('exposes a progressbar role with a value a reader can announce', () => {
    renderWithTheme(<ProgressBar percentage={54} label="£2,150 of £4,000 raised" />);

    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityLabel).toBe('£2,150 of £4,000 raised');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 54, text: '54%' });
  });

  it('clamps a nonsensical percentage rather than drawing off the end', () => {
    renderWithTheme(<ProgressBar percentage={340} label="Over target" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);

    renderWithTheme(<ProgressBar percentage={-20} label="Negative" />);
    const bars = screen.getAllByRole('progressbar');
    expect(bars[bars.length - 1].props.accessibilityValue.now).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Provenance — §17, the property this phase turns on
// ═════════════════════════════════════════════════════════════════════════════

describe('provenance markers', () => {
  it('marks a simulated figure', () => {
    renderWithTheme(<SimulatedFigure />);
    expect(screen.getByLabelText(/not from the Diaspora backend/i)).toBeTruthy();
  });

  it('marks a verified figure', () => {
    renderWithTheme(<VerifiedFigure />);
    expect(screen.getByLabelText(/comes from the Diaspora platform/i)).toBeTruthy();
  });

  it('SourcedValue attaches the marker automatically to a simulated value', () => {
    renderWithTheme(
      <SourcedValue sourced={{ value: 42, source: 'simulated', gapKey: 'communityImpact' }}>
        {(value) => <Text>{String(value)}</Text>}
      </SourcedValue>
    );

    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByLabelText(/not from the Diaspora backend/i)).toBeTruthy();
  });

  it('SourcedValue does not mark a real value as simulated', () => {
    renderWithTheme(
      <SourcedValue sourced={{ value: 42, source: 'backend' }}>
        {(value) => <Text>{String(value)}</Text>}
      </SourcedValue>
    );

    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByLabelText(/not from the Diaspora backend/i)).toBeNull();
  });

  it('Stat marks a simulated count', () => {
    renderWithTheme(
      <Stat label="Members helped" value={{ value: 46, source: 'simulated', gapKey: 'communityImpact' }} />
    );

    expect(screen.getByText('46')).toBeTruthy();
    expect(screen.getByLabelText(/not from the Diaspora backend/i)).toBeTruthy();
  });

  it('Stat lets a real money figure through unmarked', () => {
    renderWithTheme(
      <Stat
        label="Raised"
        value={{ value: 1, source: 'backend' }}
        money={{ value: money(215000, 'GBP'), source: 'backend' }}
      />
    );

    expect(screen.queryByLabelText(/not from the Diaspora backend/i)).toBeNull();
  });
});

describe('CommunityGapNotice', () => {
  it('names the missing contract in a development build', () => {
    // Fixture note: this asserts the notice *renders*, so it needs a gap that is
    // still open. The one it used was marked `backendStatus: 'connected'` once the
    // capability shipped, at which point the notice correctly renders nothing.
    renderWithTheme(<CommunityGapNotice gapKey="eventRegistration" />);
    expect(screen.getByText(/COMMUNITY-LIFE-GAP-005/)).toBeTruthy();
    expect(screen.getByText(/Preview · not connected/)).toBeTruthy();
  });

  it('renders nothing for an unknown gap key rather than a blank warning', () => {
    const { toJSON } = renderWithTheme(<CommunityGapNotice gapKey="not-a-gap" />);
    expect(toJSON()).toBeNull();
  });

  it('speaks the whole notice as one thing', () => {
    renderWithTheme(<CommunityGapNotice gapKey="polls" />);
    expect(screen.getByLabelText(/Development preview/i)).toBeTruthy();
  });

  it('says which half is real on a hybrid surface', () => {
    renderWithTheme(
      // Fixture note: needs a gap that is still open. `fundraisingCampaign` was
      // marked connected once its five endpoints shipped, and a fully served
      // capability has no simulated half to describe.
      <PartlyRealNotice
        gapKey="eventRegistration"
        realPart="the amount raised"
        simulatedPart="the donor timeline"
      />
    );

    expect(screen.getByLabelText(/Real: the amount raised.*Simulated: the donor timeline/s)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Voting — §46, accessible voting controls
// ═════════════════════════════════════════════════════════════════════════════

describe('PollBallot', () => {
  it('uses radio roles on a single-choice poll', () => {
    renderWithTheme(
      <PollBallot poll={poll} selected={[]} onChange={() => {}} openResponse="" onOpenResponseChange={() => {}} />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);

    // Grouped, so the options are announced as related rather than as three
    // unrelated buttons. The group carries the role and the question as its
    // label, and is deliberately not itself an accessibility element — see the
    // comment in `PollBallot`.
    const group = screen.getByTestId('poll-ballot-group');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe(poll.question);
  });

  it('reports which option is selected', () => {
    renderWithTheme(
      <PollBallot poll={poll} selected={['b']} onChange={() => {}} openResponse="" onOpenResponseChange={() => {}} />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[0].props.accessibilityState.checked).toBe(false);
    expect(radios[1].props.accessibilityState.checked).toBe(true);
  });

  it('uses checkbox roles on a multiple-choice poll', () => {
    const multi: CommunityPoll = { ...poll, votingType: 'MultipleChoice', maxSelections: 2 };
    renderWithTheme(
      <PollBallot poll={multi} selected={[]} onChange={() => {}} openResponse="" onOpenResponseChange={() => {}} />
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('announces the selection limit before somebody hits it', () => {
    const multi: CommunityPoll = { ...poll, votingType: 'MultipleChoice', maxSelections: 2 };
    renderWithTheme(
      <PollBallot poll={multi} selected={['a']} onChange={() => {}} openResponse="" onOpenResponseChange={() => {}} />
    );

    expect(screen.getByText('Choose up to 2. 1 of 2 chosen.')).toBeTruthy();
  });

  it('disables only the unchosen options at the limit, so a choice can be swapped', () => {
    const multi: CommunityPoll = { ...poll, votingType: 'MultipleChoice', maxSelections: 2 };
    renderWithTheme(
      <PollBallot
        poll={multi}
        selected={['a', 'b']}
        onChange={() => {}}
        openResponse=""
        onOpenResponseChange={() => {}}
      />
    );

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0].props.accessibilityState.disabled).toBe(false);
    expect(boxes[1].props.accessibilityState.disabled).toBe(false);
    expect(boxes[2].props.accessibilityState.disabled).toBe(true);
  });

  it('disables the whole ballot when the server says the caller cannot vote', () => {
    const closed: CommunityPoll = {
      ...poll,
      canVote: false,
      cannotVoteReason: 'You have already voted.',
    };
    renderWithTheme(
      <PollBallot poll={closed} selected={[]} onChange={() => {}} openResponse="" onOpenResponseChange={() => {}} />
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.props.accessibilityState.disabled).toBe(true);
      expect(radio.props.accessibilityHint).toBe('You have already voted.');
    }
  });

  it('selects one option at a time on a single-choice poll', () => {
    const onChange = jest.fn();
    renderWithTheme(
      <PollBallot poll={poll} selected={['a']} onChange={onChange} openResponse="" onOpenResponseChange={() => {}} />
    );

    fireEvent.press(screen.getAllByRole('radio')[2]);
    expect(onChange).toHaveBeenCalledWith(['c']);
  });

  it('adds and removes on a multiple-choice poll', () => {
    const multi: CommunityPoll = { ...poll, votingType: 'MultipleChoice', maxSelections: 3 };
    const onChange = jest.fn();

    renderWithTheme(
      <PollBallot poll={multi} selected={['a']} onChange={onChange} openResponse="" onOpenResponseChange={() => {}} />
    );

    fireEvent.press(screen.getAllByRole('checkbox')[1]);
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);

    fireEvent.press(screen.getAllByRole('checkbox')[0]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('tells an anonymous-poll writer that nobody will know it was them', () => {
    const open: CommunityPoll = { ...poll, votingType: 'OpenResponse', isAnonymous: true, options: [] };
    renderWithTheme(
      <PollBallot poll={open} selected={[]} onChange={() => {}} openResponse="" onOpenResponseChange={() => {}} />
    );

    expect(screen.getByLabelText('Your answer to this poll').props.accessibilityHint).toMatch(
      /anonymous/i
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Results — §24 and §46
// ═════════════════════════════════════════════════════════════════════════════

describe('PollResults', () => {
  const result: PollResult = {
    pollId: 'poll-1',
    status: 'Open',
    options: [
      { optionId: 'a', label: 'Saturday 26 September', count: 12, percentage: 14 },
      { optionId: 'b', label: 'Saturday 3 October', count: 51, percentage: 59, isMyChoice: true },
      { optionId: 'c', label: 'Saturday 10 October', count: 24, percentage: 27 },
    ],
    totalResponses: 87,
    openResponses: null,
    areResultsVisible: true,
    resultsHiddenReason: null,
    computedAt: '2026-07-13T09:00:00.000Z',
  };

  it('prints every count and percentage as text, not only as a bar', () => {
    renderWithTheme(<PollResults result={result} poll={poll} />);

    expect(screen.getByText('59%')).toBeTruthy();
    expect(screen.getByText('51 votes')).toBeTruthy();
    expect(screen.getByText('12 votes')).toBeTruthy();
  });

  it('gives each bar a spoken summary with the number in it', () => {
    renderWithTheme(<PollResults result={result} poll={poll} />);
    expect(
      screen.getByLabelText('Saturday 3 October: 51 votes, 59 per cent. This was your choice.')
    ).toBeTruthy();
  });

  it('renders exactly the numbers it was given — no client arithmetic', () => {
    // Percentages that do not sum to 100 are rendered as sent. §24: the server
    // computed them, and a client that "corrected" them would be inventing.
    const odd: PollResult = {
      ...result,
      options: [
        { optionId: 'a', label: 'A', count: 1, percentage: 33 },
        { optionId: 'b', label: 'B', count: 1, percentage: 33 },
      ],
    };

    renderWithTheme(<PollResults result={odd} poll={poll} />);
    expect(screen.getAllByText('33%')).toHaveLength(2);
  });

  it('says results are withheld rather than drawing an empty chart', () => {
    const hidden: PollResult = {
      ...result,
      options: null,
      areResultsVisible: false,
      resultsHiddenReason: 'Results are published when this poll closes.',
    };

    renderWithTheme(<PollResults result={hidden} poll={poll} />);
    expect(screen.getByLabelText('Results are published when this poll closes.')).toBeTruthy();
    expect(screen.queryByText('59%')).toBeNull();
  });

  it('shows written answers when the audience may see them', () => {
    const open: PollResult = {
      ...result,
      options: [],
      openResponses: ['Start half an hour later.', 'More jollof.'],
    };

    renderWithTheme(
      <PollResults result={open} poll={{ ...poll, votingType: 'OpenResponse' }} />
    );

    expect(screen.getByLabelText('Response 1: Start half an hour later.')).toBeTruthy();
    expect(screen.getByLabelText('Response 2: More jollof.')).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Buttons — §46, accessible buttons
// ═════════════════════════════════════════════════════════════════════════════

describe('PrimaryButton', () => {
  it('reports disabled to a screen reader, not just visually', () => {
    renderWithTheme(<PrimaryButton label="Donate" onPress={() => {}} disabled />);
    const button = screen.getByRole('button', { name: 'Donate' });
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it('reports busy while a mutation is in flight', () => {
    renderWithTheme(<PrimaryButton label="Donate" onPress={() => {}} busy />);
    const button = screen.getByRole('button', { name: 'Donate' });
    expect(button.props.accessibilityState.busy).toBe(true);
  });

  it('does not fire while busy — the double-submit guard', () => {
    const onPress = jest.fn();
    renderWithTheme(<PrimaryButton label="Pay" onPress={onPress} busy />);

    fireEvent.press(screen.getByRole('button', { name: 'Pay' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires when it is neither disabled nor busy', () => {
    const onPress = jest.fn();
    renderWithTheme(<PrimaryButton label="Pay" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Pay' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries a hint explaining a refusal', () => {
    renderWithTheme(
      <PrimaryButton
        label="Donate"
        onPress={() => {}}
        disabled
        accessibilityHint="Verify your account to donate"
      />
    );
    expect(screen.getByRole('button', { name: 'Donate' }).props.accessibilityHint).toBe(
      'Verify your account to donate'
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Recurrence — §10, data-driven
// ═════════════════════════════════════════════════════════════════════════════

describe('describeDraft', () => {
  it('describes a weekly rule with weekdays', () => {
    expect(
      describeDraft({
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [2],
        endKind: 'Never',
        until: null,
        count: null,
        exceptions: [],
        description: null,
      })
    ).toBe('Repeats every week on Tuesday.');
  });

  it('describes an interval greater than one', () => {
    expect(
      describeDraft({
        frequency: 'Weekly',
        interval: 2,
        byWeekday: [6],
        endKind: 'OnDate',
        until: '2026-12-31',
        count: null,
        exceptions: [],
        description: null,
      })
    ).toBe('Repeats every 2 weeks on Saturday, until 2026-12-31.');
  });

  it('describes a count-limited monthly rule', () => {
    expect(
      describeDraft({
        frequency: 'Monthly',
        interval: 1,
        byWeekday: [],
        endKind: 'AfterCount',
        until: null,
        count: 12,
        exceptions: [],
        description: null,
      })
    ).toBe('Repeats every month, 12 times.');
  });

  it('mentions skipped dates', () => {
    expect(
      describeDraft({
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [2],
        endKind: 'Never',
        until: null,
        count: null,
        exceptions: ['2026-07-28', '2026-08-04'],
        description: null,
      })
    ).toBe('Repeats every week on Tuesday, skipping 2 dates.');
  });

  it('sorts weekdays so the sentence reads in week order', () => {
    expect(
      describeDraft({
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [6, 1, 3],
        endKind: 'Never',
        until: null,
        count: null,
        exceptions: [],
        description: null,
      })
    ).toBe('Repeats every week on Monday, Wednesday, Saturday.');
  });
});
